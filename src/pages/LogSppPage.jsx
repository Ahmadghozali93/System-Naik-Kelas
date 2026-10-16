import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search, X, Check, Ban, AlertTriangle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/authStore';
import { formatRupiah } from '../utils/formatRupiah';
import { barisPembayaran, muatTagihanSiswa } from '../utils/pembayaranSpp';
import FormBayarSpp from '../components/FormBayarSpp';

// Hasil scan QR dari SPP > Scan Barcode. Validasi mencatat pembayaran di
// pembayaran_spp lewat barisPembayaran — sama dengan tombol Bayar di
// Tagihan Siswa — jadi alur Tagihan dan Setor SPP sesudahnya tidak berubah.
// Siapa yang boleh validasi dijaga juga oleh RLS (boleh_validasi_spp, migrasi 0035).
const PEMVALIDASI = ['Owner', 'Administrator', 'Supervisor', 'Learning Koordinator'];
const BATAS = 500;

const fmt = (d) => d ? new Date(d).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : '-';
const fmtWaktu = (d) => d ? new Date(d).toLocaleString('id-ID',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '-';
const tanggalLokal = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
};

const Peringatan = ({ teks }) => (
  <div style={{display:'flex',gap:'0.5rem',alignItems:'flex-start',background:'#fffbeb',border:'1px solid #fde68a',color:'#92400e',
    borderRadius:'0.5rem',padding:'0.7rem 0.85rem',fontSize:'0.82rem',marginBottom:'1rem'}}>
    <AlertTriangle size={16} style={{flexShrink:0,marginTop:1}}/> {teks}
  </div>
);

const statusBadge = (s) => {
  const map = { Menunggu:['#fef3c7','#92400e'], Divalidasi:['#d1fae5','#047857'], Ditolak:['#fee2e2','#b91c1c'] };
  const [bg, color] = map[s] || ['#f3f4f6','#374151'];
  return <span style={{background:bg,color,padding:'0.18rem 0.6rem',borderRadius:'999px',fontSize:'0.75rem',fontWeight:600,whiteSpace:'nowrap'}}>{s}</span>;
};

const TAB = (active) => ({
  padding:'0.45rem 1.1rem', border:'none', borderRadius:'0.4rem', cursor:'pointer',
  fontWeight:600, fontSize:'0.875rem', fontFamily:'inherit',
  background: active ? 'var(--primary)' : 'transparent',
  color: active ? '#fff' : 'var(--text-secondary)', transition:'all 0.15s'
});

export default function LogSppPage() {
  const { user } = useAuth();
  const bolehValidasi = PEMVALIDASI.includes(user?.role);

  const [tab, setTab]         = useState('Menunggu');
  const [logs, setLogs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [muat, setMuat]       = useState(0);   // naikkan untuk memuat ulang

  // Modal validasi: { log, t (tagihan saat ini) | null, catatan }
  const [modal, setModal]         = useState(null);
  const [form, setForm]           = useState({ tanggal_bayar:'', metode:'Tunai', catatan:'', diskon:'0' });
  const [menyiapkan, setMenyiapkan] = useState(null);   // id log yang sedang disiapkan
  const [menyimpan, setMenyimpan] = useState(false);

  useEffect(() => {
    let aktif = true;
    supabase.from('log_spp').select('*').eq('status', tab)
      .order('created_at', { ascending: tab === 'Menunggu' })   // antrean: yang terlama dulu
      .limit(BATAS)
      .then(({ data, error }) => {
        if (!aktif) return;
        if (error) alert('Gagal memuat Log SPP: ' + error.message);
        setLogs(data || []);
        setLoading(false);
      });
    return () => { aktif = false; };
  }, [tab, muat]);

  const gantiTab = (t) => { setLoading(true); setTab(t); };
  const muatUlang = () => { setLoading(true); setMuat(n => n + 1); };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return logs.filter(l => !q
      || l.nama_siswa?.toLowerCase().includes(q)
      || l.nama_program?.toLowerCase().includes(q)
      || l.discan_oleh?.toLowerCase().includes(q)
      || l.siswa_id?.toLowerCase().includes(q));
  }, [logs, search]);

  // Tagihan dihitung ulang saat validasi: bisa saja periode itu sudah dibayar
  // lewat Tagihan Siswa sejak discan.
  const bukaValidasi = async (log) => {
    setMenyiapkan(log.id);
    try {
      const daftar = await muatTagihanSiswa(log.siswa_id);
      const t = daftar.find(x => x.key === log.tagihan_key) || null;
      let catatan = null;
      if (!t) {
        catatan = 'Aktivasi program ini sudah tidak aktif, jadi tagihannya tidak ada lagi. Log ini hanya bisa ditolak.';
      } else if (t.siklus === 'sekali' && t.status === 'Lunas') {
        catatan = 'Paket ini sudah lunas sejak discan. Log ini hanya bisa ditolak.';
      } else if (t.jatuh_tempo !== log.jatuh_tempo) {
        catatan = `Saat discan, jatuh temponya ${fmt(log.jatuh_tempo)}. Sekarang ${fmt(t.jatuh_tempo)} — periode itu kemungkinan sudah dibayar lewat jalur lain. Validasi akan mencatat periode ${fmt(t.jatuh_tempo)}.`;
      }
      const bisaValidasi = !!t && !(t.siklus === 'sekali' && t.status === 'Lunas');
      // Isian awal = yang diisi guru saat scan; LC tinggal memeriksa.
      setForm({
        tanggal_bayar: log.tanggal_bayar || tanggalLokal(log.created_at),
        metode: log.metode || 'Tunai',
        catatan: log.catatan || '',
        diskon: String(Number(log.diskon) || 0),
      });
      setModal({ log, t, catatan, bisaValidasi });
    } catch (err) {
      alert('Gagal memuat tagihan: ' + (err?.message || err));
    } finally {
      setMenyiapkan(null);
    }
  };

  const validasi = async (e) => {
    e.preventDefault();
    const { log, t } = modal;
    // Petugas transaksi = guru yang menerima scan; tampil di Setor SPP.
    const baris = barisPembayaran(t, form, log.discan_oleh);
    setMenyimpan(true);

    // Klaim log dulu (hanya jika masih Menunggu) supaya dua orang yang
    // memvalidasi bersamaan tidak menghasilkan dua pembayaran.
    const { data: klaim, error: kErr } = await supabase.from('log_spp')
      .update({
        status: 'Divalidasi',
        divalidasi_oleh: user?.nama || user?.email || '-',
        divalidasi_pada: new Date().toISOString(),
        pembayaran_id: baris.id,
      })
      .eq('id', log.id).eq('status', 'Menunggu')
      .select('id');
    if (kErr || !klaim?.length) {
      setMenyimpan(false);
      alert(kErr ? 'Gagal memvalidasi: ' + kErr.message : 'Log ini sudah diproses orang lain.');
      setModal(null);
      muatUlang();
      return;
    }

    const { error } = await supabase.from('pembayaran_spp').insert([baris]);
    if (error) {
      // Kembalikan klaim supaya log bisa divalidasi ulang.
      await supabase.from('log_spp')
        .update({ status:'Menunggu', divalidasi_oleh:null, divalidasi_pada:null, pembayaran_id:null })
        .eq('id', log.id);
      setMenyimpan(false);
      alert('Gagal mencatat pembayaran: ' + error.message);
      return;
    }

    setMenyimpan(false);
    setModal(null);
    muatUlang();
  };

  const tolak = async (log) => {
    const alasan = window.prompt(`Tolak log ${log.nama_siswa} — ${log.nama_program || '-'}?\n\nAlasan penolakan:`);
    if (alasan === null) return;
    const { data, error } = await supabase.from('log_spp')
      .update({
        status: 'Ditolak',
        alasan_tolak: alasan.trim() || null,
        divalidasi_oleh: user?.nama || user?.email || '-',
        divalidasi_pada: new Date().toISOString(),
      })
      .eq('id', log.id).eq('status', 'Menunggu')
      .select('id');
    if (error) { alert('Gagal menolak: ' + error.message); return; }
    if (!data?.length) alert('Log ini sudah diproses orang lain.');
    setModal(null);
    muatUlang();
  };

  const inp = { width:'100%', padding:'0.5rem 0.75rem', borderRadius:'0.5rem', border:'1px solid var(--glass-border)',
    background:'var(--surface-color)', fontFamily:'inherit', fontSize:'0.875rem', boxSizing:'border-box' };
  const th = { padding:'0.65rem 0.75rem', fontWeight:700, fontSize:'0.72rem', color:'var(--text-secondary)', whiteSpace:'nowrap', letterSpacing:'0.06em', textAlign:'left' };
  const td = { padding:'0.75rem', verticalAlign:'top' };
  const btnKecil = (warna, bg) => ({ display:'inline-flex', alignItems:'center', gap:'0.3rem', color:warna, background:bg, border:'none',
    cursor:'pointer', padding:'0.35rem 0.6rem', borderRadius:'0.375rem', fontSize:'0.78rem', fontWeight:600, fontFamily:'inherit', whiteSpace:'nowrap' });

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.5rem',flexWrap:'wrap',gap:'0.75rem'}}>
        <div>
          <p style={{fontSize:'0.78rem',color:'var(--text-secondary)',margin:0,textTransform:'uppercase',letterSpacing:'0.05em'}}>SPP</p>
          <h1 style={{fontSize:'1.6rem',fontWeight:700,margin:0}}>Log SPP</h1>
        </div>
        <div style={{display:'flex',background:'var(--surface-color)',borderRadius:'0.5rem',padding:'0.25rem',border:'1px solid var(--glass-border)',gap:'0.25rem'}}>
          {['Menunggu','Divalidasi','Ditolak'].map(s => (
            <button key={s} style={TAB(tab===s)} onClick={()=>gantiTab(s)}>{s}</button>
          ))}
        </div>
      </div>

      <div style={{position:'relative',marginBottom:'1rem',maxWidth:360}}>
        <Search size={15} style={{position:'absolute',left:'0.75rem',top:'50%',transform:'translateY(-50%)',color:'var(--text-secondary)'}}/>
        <input style={{...inp,paddingLeft:'2.2rem'}} placeholder="Cari siswa / program / guru..." value={search}
          onChange={e=>setSearch(e.target.value)}/>
      </div>

      <div className="glass-card" style={{padding:'1.5rem'}}>
        {loading ? <p style={{color:'var(--text-secondary)'}}>Memuat...</p>
          : filtered.length === 0 ? <p style={{color:'var(--text-secondary)'}}>
              {tab === 'Menunggu' ? 'Tidak ada scan yang menunggu validasi.' : 'Tidak ada data.'}
            </p>
          : (
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.85rem'}}>
              <thead>
                <tr style={{borderBottom:'2px solid var(--glass-border)',background:'rgba(79,70,229,0.04)'}}>
                  <th style={th}>WAKTU SCAN</th>
                  <th style={th}>SISWA</th>
                  <th style={th}>PROGRAM</th>
                  <th style={th}>JATUH TEMPO</th>
                  <th style={{...th,textAlign:'right'}}>DIBAYAR</th>
                  <th style={th}>DISCAN OLEH</th>
                  <th style={{...th,textAlign:'center'}}>STATUS</th>
                  {tab !== 'Menunggu' && <th style={th}>DIPROSES</th>}
                  {tab === 'Menunggu' && bolehValidasi && <th style={th}></th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(l => (
                  <tr key={l.id} style={{borderBottom:'1px solid var(--glass-border)'}}>
                    <td style={{...td,whiteSpace:'nowrap',fontSize:'0.82rem'}}>{fmtWaktu(l.created_at)}</td>
                    <td style={td}>
                      <Link to={`/spp/tagihan?siswa=${encodeURIComponent(l.siswa_id)}`} style={{fontWeight:600,color:'inherit'}}>{l.nama_siswa}</Link>
                      <div style={{fontSize:'0.75rem',color:'var(--text-secondary)'}}>{l.siswa_id}</div>
                    </td>
                    <td style={td}>
                      <span style={{color:'var(--primary)',fontWeight:500}}>{l.nama_program || '-'}</span>
                      <div style={{fontSize:'0.75rem',color:'var(--text-secondary)'}}>{l.unit || '-'}{l.siklus === 'sekali' ? ' · Paket' : ''}</div>
                    </td>
                    <td style={{...td,whiteSpace:'nowrap',fontSize:'0.82rem'}}>{fmt(l.jatuh_tempo)}</td>
                    <td style={{...td,textAlign:'right'}}>
                      <div style={{fontWeight:700}}>{formatRupiah(Math.max((l.nominal || 0) - (l.diskon || 0), 0))}</div>
                      <div style={{fontSize:'0.75rem',color:'var(--text-secondary)'}}>
                        {l.metode || '-'}{Number(l.diskon) > 0 ? ` · diskon ${formatRupiah(l.diskon)}` : ''}
                      </div>
                    </td>
                    <td style={td}>{l.discan_oleh || '-'}</td>
                    <td style={{...td,textAlign:'center'}}>{statusBadge(l.status)}</td>
                    {tab !== 'Menunggu' && (
                      <td style={{...td,fontSize:'0.8rem'}}>
                        {l.divalidasi_oleh || '-'}
                        <div style={{color:'var(--text-secondary)',fontSize:'0.75rem'}}>{fmtWaktu(l.divalidasi_pada)}</div>
                        {l.status === 'Divalidasi' && l.pembayaran_id && (
                          <div style={{color:'var(--text-secondary)',fontSize:'0.75rem'}}>{l.pembayaran_id}</div>
                        )}
                        {l.status === 'Ditolak' && l.alasan_tolak && (
                          <div style={{color:'#b91c1c',fontSize:'0.75rem'}}>{l.alasan_tolak}</div>
                        )}
                      </td>
                    )}
                    {tab === 'Menunggu' && bolehValidasi && (
                      <td style={{...td,textAlign:'right'}}>
                        <div style={{display:'flex',gap:'0.4rem',justifyContent:'flex-end'}}>
                          <button onClick={()=>bukaValidasi(l)} disabled={menyiapkan === l.id} style={btnKecil('#047857','rgba(16,185,129,0.12)')}>
                            {menyiapkan === l.id ? <Loader2 size={14} className="animate-spin"/> : <Check size={14}/>} Validasi
                          </button>
                          <button onClick={()=>tolak(l)} style={btnKecil('#b91c1c','rgba(239,68,68,0.1)')}>
                            <Ban size={14}/> Tolak
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {logs.length >= BATAS && (
              <p style={{fontSize:'0.78rem',color:'var(--text-secondary)',marginTop:'0.75rem'}}>Menampilkan {BATAS} data terbaru.</p>
            )}
          </div>
        )}
      </div>

      {/* Modal validasi — form yang sama dengan Bayar SPP di Tagihan Siswa */}
      {modal && modal.bisaValidasi && (
        <FormBayarSpp t={modal.t} form={form} setForm={setForm}
          onSubmit={validasi} onClose={()=>setModal(null)} menyimpan={menyimpan}
          labelDicatat="Discan oleh" dicatatOleh={modal.log.discan_oleh}
          labelSimpan="Validasi"
          sebelumForm={<>
            <div style={{fontSize:'0.8rem',color:'var(--text-secondary)',marginBottom:'0.9rem'}}>
              Discan {fmtWaktu(modal.log.created_at)}. Periksa isian guru di bawah sebelum memvalidasi.
            </div>
            {modal.catatan && <Peringatan teks={modal.catatan}/>}
          </>}
          tombolTambahan={
            <button type="button" className="btn" onClick={()=>tolak(modal.log)} disabled={menyimpan}
              style={{background:'rgba(239,68,68,0.1)',color:'#b91c1c'}}>
              <Ban size={14}/> Tolak
            </button>
          }/>
      )}

      {/* Tidak bisa divalidasi — hanya bisa ditolak */}
      {modal && !modal.bisaValidasi && (
        <div className="modal-overlay" onClick={e=>{ if (e.target === e.currentTarget) setModal(null); }}>
          <div className="modal-content" style={{maxWidth:460}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
              <h3 style={{margin:0,fontWeight:700}}>{modal.log.nama_siswa} — {modal.log.nama_program || '-'}</h3>
              <button onClick={()=>setModal(null)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-secondary)'}}><X size={18}/></button>
            </div>
            <Peringatan teks={modal.catatan}/>
            <div style={{display:'flex',gap:'0.5rem',justifyContent:'flex-end'}}>
              <button className="btn" onClick={()=>setModal(null)} style={{background:'none',border:'1px solid var(--glass-border)'}}>Tutup</button>
              <button onClick={()=>tolak(modal.log)} style={btnKecil('#b91c1c','rgba(239,68,68,0.1)')}><Ban size={14}/> Tolak</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
