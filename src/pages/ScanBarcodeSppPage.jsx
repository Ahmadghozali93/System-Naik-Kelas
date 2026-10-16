import { useState, useEffect, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { ScanLine, Camera, CameraOff, Search, AlertTriangle, Loader2, X, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/authStore';
import { formatRupiah } from '../utils/formatRupiah';
import { muatTagihanSiswa, rentangPaket } from '../utils/pembayaranSpp';
import FormBayarSpp from '../components/FormBayarSpp';

// Isi QR = id siswa (lihat utils/barcodeSiswa.js). Setelah discan, guru
// memilih program (bila lebih dari satu) lalu mengisi form Bayar SPP yang
// sama dengan di Tagihan Siswa. Hasilnya masuk SPP > Log SPP sebagai
// 'Menunggu' sampai divalidasi Learning Koordinator (migrasi 0035).
const READER_ID = 'scan-barcode-spp';

const hariIni = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

const fmt = (d) => d ? new Date(d).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : '-';

export default function ScanBarcodeSppPage() {
  const { user } = useAuth();
  const [kameraAktif, setKameraAktif] = useState(true);
  const [kameraError, setKameraError] = useState('');
  const [manual, setManual]           = useState('');
  const [memeriksa, setMemeriksa]     = useState(false);
  const [pesan, setPesan]             = useState('');
  const [berhasil, setBerhasil]       = useState('');
  // { siswa, pilihan: [tagihan], menunggu: Set<tagihan_key> }
  const [konfirmasi, setKonfirmasi]   = useState(null);
  const [pilihKey, setPilihKey]       = useState('');
  const [tahap, setTahap]             = useState('pilih');   // 'pilih' program → 'bayar'
  const [form, setForm]               = useState({ tanggal_bayar:'', metode:'Tunai', catatan:'', diskon:'0' });
  const [menyimpan, setMenyimpan]     = useState(false);
  const sibuk = useRef(false);   // cegah satu QR diproses berkali-kali (scanner memanggil ~10x/detik)

  const lepasSibuk = (jeda = 0) => setTimeout(() => { sibuk.current = false; }, jeda);

  const proses = async (kodeMentah) => {
    const kode = (kodeMentah || '').trim().toUpperCase();
    if (!kode || sibuk.current) return;
    sibuk.current = true;
    setMemeriksa(true);
    setPesan('');
    setBerhasil('');

    try {
      const { data: siswa, error } = await supabase.from('siswa').select('id, nama').eq('id', kode).maybeSingle();
      if (error) throw error;
      if (!siswa) {
        setPesan(`QR "${kode}" tidak cocok dengan siswa mana pun.`);
        lepasSibuk(1500);
        return;
      }

      // Paket yang sudah lunas tidak menagih apa-apa lagi.
      const pilihan = (await muatTagihanSiswa(kode)).filter(t => !(t.siklus === 'sekali' && t.status === 'Lunas'));
      if (pilihan.length === 0) {
        setPesan(`${siswa.nama} (${kode}) tidak punya tagihan SPP aktif.`);
        lepasSibuk(1500);
        return;
      }

      const { data: logs, error: lErr } = await supabase.from('log_spp')
        .select('tagihan_key').eq('siswa_id', kode).eq('status', 'Menunggu');
      if (lErr) throw lErr;
      const menunggu = new Set((logs || []).map(l => l.tagihan_key));

      const bisaDipilih = pilihan.filter(t => !menunggu.has(t.key));
      setPilihKey(bisaDipilih.length === 1 ? bisaDipilih[0].key : '');
      setForm({ tanggal_bayar: hariIni(), metode:'Tunai', catatan:'', diskon:'0' });
      // Satu-satunya program dan belum discan → tidak ada yang perlu dipilih.
      setTahap(pilihan.length === 1 && bisaDipilih.length === 1 ? 'bayar' : 'pilih');
      setKonfirmasi({ siswa, pilihan, menunggu });
      // sibuk tetap true selama popup terbuka — kamera tidak memproses scan lain.
    } catch (err) {
      setPesan('Gagal memeriksa data: ' + (err?.message || err));
      lepasSibuk(1500);
    } finally {
      setMemeriksa(false);
    }
  };

  const tutupKonfirmasi = () => {
    setKonfirmasi(null);
    setPilihKey('');
    lepasSibuk(1500);   // jeda supaya QR yang masih di depan kamera tidak langsung terbaca ulang
  };

  const simpan = async (e) => {
    e.preventDefault();
    const t = konfirmasi.pilihan.find(x => x.key === pilihKey);
    if (!t) return;
    setMenyimpan(true);
    const { error } = await supabase.from('log_spp').insert([{
      tagihan_key: t.key,
      siklus: t.siklus,
      siswa_id: t.siswa_id,
      nama_siswa: t.nama_siswa,
      nama_program: t.nama_program || '',
      unit: t.unit || '',
      jatuh_tempo: t.jatuh_tempo,
      nominal: t.nominal,
      tanggal_bayar: form.tanggal_bayar || null,
      metode: form.metode,
      diskon: Number(form.diskon) || 0,
      catatan: form.catatan || null,
      discan_oleh: user?.nama || user?.email || '-',
    }]);
    setMenyimpan(false);

    if (error) {
      alert(error.code === '23505'
        ? 'Tagihan ini sudah discan dan masih menunggu validasi di Log SPP.'
        : 'Gagal menyimpan: ' + error.message);
      return;
    }
    setBerhasil(`${t.nama_siswa} — ${t.nama_program || '-'} tercatat di Log SPP, menunggu validasi Learning Koordinator.`);
    setManual('');
    tutupKonfirmasi();
  };

  // `proses` dipanggil dari callback kamera — pakai ref agar selalu versi terbaru.
  const prosesRef = useRef(proses);
  useEffect(() => { prosesRef.current = proses; });

  useEffect(() => {
    if (!kameraAktif) return;
    const scanner = new Html5Qrcode(READER_ID, {
      formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE, Html5QrcodeSupportedFormats.CODE_128],
      useBarCodeDetectorIfSupported: true,
      verbose: false,
    });
    const mulai = scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: (w, h) => { const s = Math.min(w, h) * 0.7; return { width: s, height: s }; } },
      (teks) => prosesRef.current(teks),
      () => {},   // "belum ada QR di frame" — dipanggil tiap frame, abaikan
    ).catch(err => {
      setKameraError(String(err?.message || err));
    });

    return () => {
      // Tunggu start selesai dulu; stop() sebelum kamera menyala melempar galat.
      mulai.then(() => scanner.isScanning ? scanner.stop() : null)
        .then(() => scanner.clear())
        .catch(() => {});
    };
  }, [kameraAktif]);

  const inp = { width:'100%', padding:'0.55rem 0.75rem 0.55rem 2.2rem', borderRadius:'0.5rem', border:'1px solid var(--glass-border)',
    background:'var(--surface-color)', fontSize:'0.9rem', fontFamily:'inherit' };

  return (
    <div style={{maxWidth:560,margin:'0 auto'}}>
      <div style={{marginBottom:'1.5rem'}}>
        <p style={{fontSize:'0.78rem',color:'var(--text-secondary)',margin:0,textTransform:'uppercase',letterSpacing:'0.05em'}}>SPP</p>
        <h1 style={{fontSize:'1.6rem',fontWeight:700,margin:0,display:'flex',alignItems:'center',gap:'0.5rem'}}>
          <ScanLine size={26}/> Scan Barcode
        </h1>
      </div>

      <div className="glass-card" style={{padding:'1.25rem'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'0.75rem'}}>
          <span style={{fontWeight:600}}>Kamera</span>
          <button onClick={()=>{setKameraError('');setKameraAktif(v=>!v);}}
            style={{display:'flex',alignItems:'center',gap:'0.35rem',background:'none',border:'1px solid var(--glass-border)',
              borderRadius:'0.4rem',padding:'0.35rem 0.7rem',cursor:'pointer',fontSize:'0.82rem',fontFamily:'inherit'}}>
            {kameraAktif ? <><CameraOff size={15}/> Matikan</> : <><Camera size={15}/> Nyalakan</>}
          </button>
        </div>

        {kameraAktif && (
          <div id={READER_ID} style={{width:'100%',borderRadius:'0.5rem',overflow:'hidden',background:'#000',minHeight:200}}/>
        )}
        {kameraError && (
          <p style={{color:'#b91c1c',fontSize:'0.85rem',marginTop:'0.75rem'}}>
            Kamera tidak bisa dibuka: {kameraError}. Pastikan izin kamera diberikan dan halaman dibuka lewat HTTPS,
            atau ketik ID siswa di bawah.
          </p>
        )}

        <form onSubmit={e=>{e.preventDefault();proses(manual);}} style={{marginTop:'1.25rem'}}>
          <label className="form-label">ID siswa (ketik, atau pakai scanner USB)</label>
          <div style={{display:'flex',gap:'0.5rem'}}>
            <div style={{position:'relative',flex:1}}>
              <Search size={15} style={{position:'absolute',left:'0.75rem',top:'50%',transform:'translateY(-50%)',color:'var(--text-secondary)'}}/>
              <input style={inp} placeholder="SISWA-XXXXXX" value={manual} autoFocus={!kameraAktif}
                onChange={e=>setManual(e.target.value)}/>
            </div>
            <button type="submit" className="btn btn-primary" disabled={memeriksa || !manual.trim()}>Cari</button>
          </div>
        </form>

        {memeriksa && (
          <p style={{display:'flex',alignItems:'center',gap:'0.4rem',color:'var(--text-secondary)',fontSize:'0.85rem',marginTop:'0.9rem'}}>
            <Loader2 size={15} className="animate-spin"/> Mencari siswa...
          </p>
        )}
        {pesan && (
          <p style={{display:'flex',alignItems:'flex-start',gap:'0.4rem',color:'#b91c1c',fontSize:'0.85rem',marginTop:'0.9rem'}}>
            <AlertTriangle size={16} style={{flexShrink:0,marginTop:2}}/> {pesan}
          </p>
        )}
        {berhasil && (
          <p style={{display:'flex',alignItems:'flex-start',gap:'0.4rem',color:'#047857',fontSize:'0.85rem',marginTop:'0.9rem'}}>
            <CheckCircle2 size={16} style={{flexShrink:0,marginTop:2}}/> {berhasil}
          </p>
        )}
      </div>

      {/* Tahap 2: form Bayar SPP — sama dengan di Tagihan Siswa */}
      {konfirmasi && tahap === 'bayar' && (() => {
        const t = konfirmasi.pilihan.find(x => x.key === pilihKey);
        return (
          <FormBayarSpp t={t} form={form} setForm={setForm}
            onSubmit={simpan} onClose={tutupKonfirmasi} menyimpan={menyimpan}
            labelDicatat="Discan oleh" dicatatOleh={user?.nama || user?.email}
            labelSimpan="Kirim ke Log SPP"
            sebelumForm={
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'0.5rem',fontSize:'0.8rem',
                color:'var(--text-secondary)',marginBottom:'0.9rem'}}>
                <span>Pembayaran tercatat setelah divalidasi Learning Koordinator.</span>
                {konfirmasi.pilihan.length > 1 && (
                  <button type="button" onClick={()=>setTahap('pilih')} disabled={menyimpan}
                    style={{background:'none',border:'none',color:'var(--primary)',cursor:'pointer',fontWeight:600,
                      fontSize:'0.8rem',fontFamily:'inherit',whiteSpace:'nowrap',padding:0}}>
                    ← Ganti program
                  </button>
                )}
              </div>
            }/>
        );
      })()}

      {/* Tahap 1: pilih program */}
      {konfirmasi && tahap === 'pilih' && (
        <div className="modal-overlay" onClick={e=>{ if (e.target === e.currentTarget && !menyimpan) tutupKonfirmasi(); }}>
          <div className="modal-content" style={{maxWidth:460}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
              <h3 style={{margin:0,fontWeight:700}}>Konfirmasi Siswa</h3>
              <button onClick={tutupKonfirmasi} disabled={menyimpan}
                style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-secondary)'}}><X size={18}/></button>
            </div>

            <div style={{background:'rgba(79,70,229,0.06)',border:'1px solid rgba(79,70,229,0.15)',borderRadius:'0.5rem',padding:'0.85rem 1rem',marginBottom:'1.1rem'}}>
              <div style={{fontWeight:700,fontSize:'1.05rem'}}>{konfirmasi.siswa.nama}</div>
              <div style={{fontSize:'0.82rem',color:'var(--text-secondary)'}}>{konfirmasi.siswa.id}</div>
            </div>

            <label className="form-label">
              {konfirmasi.pilihan.length > 1 ? 'Pilih program' : 'Program'}<span className="wajib"> *</span>
            </label>
            <div style={{display:'flex',flexDirection:'column',gap:'0.5rem'}}>
              {konfirmasi.pilihan.map(t => {
                const sudahAntre = konfirmasi.menunggu.has(t.key);
                const dipilih = pilihKey === t.key;
                return (
                  <label key={t.key} style={{
                    display:'flex',gap:'0.65rem',alignItems:'flex-start',padding:'0.7rem 0.85rem',borderRadius:'0.5rem',
                    border:`1.5px solid ${dipilih ? 'var(--primary)' : 'var(--glass-border)'}`,
                    background: dipilih ? 'rgba(79,70,229,0.05)' : 'transparent',
                    cursor: sudahAntre ? 'not-allowed' : 'pointer', opacity: sudahAntre ? 0.55 : 1,
                  }}>
                    <input type="radio" name="program" checked={dipilih} disabled={sudahAntre}
                      onChange={()=>setPilihKey(t.key)} style={{marginTop:3}}/>
                    <div style={{flex:1,fontSize:'0.85rem'}}>
                      <div style={{fontWeight:600}}>{t.nama_program || '-'} <span style={{fontWeight:400,color:'var(--text-secondary)'}}>· {t.unit || '-'}</span></div>
                      <div style={{color:'var(--text-secondary)',fontSize:'0.8rem',marginTop:2}}>
                        {t.siklus === 'sekali'
                          ? `Paket ${t.jumlah_sesi} pertemuan (${rentangPaket(t)})`
                          : `Jatuh tempo ${fmt(t.jatuh_tempo)}`}
                        {' · '}{formatRupiah(t.nominal)}
                      </div>
                      {sudahAntre && (
                        <div style={{color:'#b45309',fontSize:'0.78rem',marginTop:3,fontWeight:600}}>Sudah discan, menunggu validasi</div>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>

            <div style={{display:'flex',gap:'0.5rem',justifyContent:'flex-end',marginTop:'1.25rem'}}>
              <button className="btn" onClick={tutupKonfirmasi}
                style={{background:'none',border:'1px solid var(--glass-border)'}}>Batal</button>
              <button className="btn btn-primary" onClick={()=>setTahap('bayar')} disabled={!pilihKey}>
                Lanjut
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
