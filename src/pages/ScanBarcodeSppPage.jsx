import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { ScanLine, Camera, CameraOff, Search, AlertTriangle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

// Isi barcode = id siswa (lihat utils/barcodeSiswa.js). Hasil scan dibawa ke
// SPP > Tagihan Siswa dengan ?siswa=<id>, yang mengunci daftar ke siswa itu.
const READER_ID = 'scan-barcode-spp';

export default function ScanBarcodeSppPage() {
  const navigate = useNavigate();
  const [kameraAktif, setKameraAktif] = useState(true);
  const [kameraError, setKameraError] = useState('');
  const [manual, setManual]           = useState('');
  const [memeriksa, setMemeriksa]     = useState(false);
  const [pesan, setPesan]             = useState('');
  const sibuk = useRef(false);   // cegah satu barcode diproses berkali-kali (scanner memanggil ~10x/detik)

  const proses = async (kodeMentah) => {
    const kode = (kodeMentah || '').trim().toUpperCase();
    if (!kode || sibuk.current) return;
    sibuk.current = true;
    setMemeriksa(true);
    setPesan('');

    const [sRes, aRes] = await Promise.all([
      supabase.from('siswa').select('id, nama').eq('id', kode).maybeSingle(),
      supabase.from('aktivasi_siswa').select('id', { count: 'exact', head: true }).eq('siswa_id', kode).eq('status', 'Aktif'),
    ]);
    setMemeriksa(false);

    if (sRes.error || aRes.error) {
      setPesan('Gagal memeriksa data: ' + (sRes.error || aRes.error).message);
    } else if (!sRes.data) {
      setPesan(`Barcode "${kode}" tidak cocok dengan siswa mana pun.`);
    } else if (!aRes.count) {
      setPesan(`${sRes.data.nama} (${kode}) tidak punya aktivasi aktif, jadi belum ada tagihan SPP.`);
    } else {
      navigate(`/spp/tagihan?siswa=${encodeURIComponent(kode)}`);
      return;
    }
    // Jeda sebentar supaya barcode yang sama tidak langsung terbaca ulang.
    setTimeout(() => { sibuk.current = false; }, 1500);
  };

  // `proses` dipanggil dari callback kamera — pakai ref agar selalu versi terbaru.
  const prosesRef = useRef(proses);
  useEffect(() => { prosesRef.current = proses; });

  useEffect(() => {
    if (!kameraAktif) return;
    const scanner = new Html5Qrcode(READER_ID, {
      formatsToSupport: [Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.QR_CODE],
      useBarCodeDetectorIfSupported: true,
      verbose: false,
    });
    const mulai = scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: (w, h) => ({ width: Math.min(w * 0.9, 420), height: Math.min(h * 0.5, 180) }) },
      (teks) => prosesRef.current(teks),
      () => {},   // "belum ada barcode di frame" — dipanggil tiap frame, abaikan
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
            <button type="submit" className="btn btn-primary" disabled={memeriksa || !manual.trim()}>Buka</button>
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
      </div>
    </div>
  );
}
