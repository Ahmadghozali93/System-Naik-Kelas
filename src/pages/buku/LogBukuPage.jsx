import { useState, useEffect, useMemo } from 'react';
import { Search, X, Check, Ban } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/authStore';
import { formatRupiah } from '../../utils/formatRupiah';
import { METODE } from '../../utils/pembayaranSpp';

// Transaksi buku dari guru, menunggu validasi koordinator. Yang boleh
// memvalidasi dijaga juga oleh RLS (boleh_validasi_spp, migrasi 0035).
// Item tidak bisa diubah di sini — bila salah, tolak dan guru input ulang.
const PEMVALIDASI = ['Owner', 'Administrator', 'Supervisor', 'Learning Koordinator'];
const BATAS = 500;

const fmt = (d) => d ? new Date(d).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : '-';
const fmtWaktu = (d) => d ? new Date(d).toLocaleString('id-ID',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '-';
const ringkasItem = (items) => (items || []).map(i => `${i.nama_produk} ×${i.qty}`).join(', ');

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

export default function LogBukuPage() {
  const { user } = useAuth();
  const bolehValidasi = PEMVALIDASI.includes(user?.role);

  const [tab, setTab]         = useState('Menunggu');
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [muat, setMuat]       = useState(0);

  const [search, setSearch]           = useState('');
  const [filterUnit, setFilterUnit]   = useState('');
  const [filterMetode, setFilterMetode] = useState('');
  const [filterGuru, setFilterGuru]   = useState('');

  const [modal, setModal]       = useState(null);   // transaksi yang divalidasi
  const [form, setForm]         = useState({});
  const [menyimpan, setMenyimpan] = useState(false);

  useEffect(() => {
    let aktif = true;
    supabase.from('transaksi_buku').select('*, items:transaksi_buku_item(*)').eq('status', tab)
      .order('created_at', { ascending: tab === 'Menunggu' })   // antrean: yang terlama dulu
      .limit(BATAS)
      .then(({ data, error }) => {
        if (!aktif) return;
        if (error) alert('Gagal memuat Log Buku: ' + error.message);
        setRows(data || []);
        setLoading(false);
      });
    return () => { aktif = false; };
  }, [tab, muat]);

  const gantiTab = (t) => { setLoading(true); setTab(t); };
  const muatUlang = () => { setLoading(true); setMuat(n => n + 1); };

  // Pilihan filter diambil dari data yang sedang tampil di tab ini.
  const [allUnits, allGurus] = useMemo(() =>
    ['unit', 'dicatat_oleh'].map(k => [...new Set(rows.map(r => r[k]).filter(Boolean))].sort()),
  [rows]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter(r => {
      if (q && !r.nama_siswa?.toLowerCase().includes(q) && !r.id.toLowerCase().includes(q)
            && !r.dicatat_oleh?.toLowerCase().includes(q) && !ringkasItem(r.items).toLowerCase().includes(q)) return false;
      if (filterUnit   && r.unit         !== filterUnit)   return false;
      if (filterMetode && r.metode       !== filterMetode) return false;
      if (filterGuru   && r.dicatat_oleh !== filterGuru)   return false;
      return true;
    });
  }, [rows, search, filterUnit, filterMetode, filterGuru]);

  const bukaValidasi = (r) => {
    setForm({ tanggal_bayar: r.tanggal_bayar, metode: r.metode, diskon: String(Number(r.diskon) || 0), catatan: r.catatan || '' });
    setModal(r);
  };

  const validasi = async (e) => {
    e.preventDefault();
    const diskon = Number(form.diskon) || 0;
    if (diskon > Number(modal.subtotal)) { alert('Diskon melebihi subtotal.'); return; }
    setMenyimpan(true);
    // Hanya jika masih Menunggu — dua koordinator tidak memproses yang sama.
    const { data, error } = await supabase.from('transaksi_buku')
      .update({
        tanggal_bayar: form.tanggal_bayar,
        metode: form.metode,
        diskon,
        total: Number(modal.subtotal) - diskon,
        catatan: form.catatan.trim() || null,
        status: 'Divalidasi',
        divalidasi_oleh: user?.nama || user?.email || '-',
        divalidasi_pada: new Date().toISOString(),
      })
      .eq('id', modal.id).eq('status', 'Menunggu')
      .select('id');
    setMenyimpan(false);
    if (error) { alert('Gagal memvalidasi: ' + error.message); return; }
    if (!data?.length) alert('Transaksi ini sudah diproses orang lain.');
    setModal(null);
    muatUlang();
  };

  const tolak = async (r) => {
    const alasan = window.prompt(`Tolak transaksi ${r.id} — ${r.nama_siswa}?\n\nAlasan penolakan:`);
    if (alasan === null) return;
    const { data, error } = await supabase.from('transaksi_buku')
      .update({
        status: 'Ditolak',
        alasan_tolak: alasan.trim() || null,
        divalidasi_oleh: user?.nama || user?.email || '-',
        divalidasi_pada: new Date().toISOString(),
      })
      .eq('id', r.id).eq('status', 'Menunggu')
      .select('id');
    if (error) { alert('Gagal menolak: ' + error.message); return; }
    if (!data?.length) alert('Transaksi ini sudah diproses orang lain.');
    setModal(null);
    muatUlang();
  };

  const inp = { width:'100%', padding:'0.5rem 0.75rem', borderRadius:'0.5rem', border:'1px solid var(--glass-border)',
    background:'var(--surface-color)', fontFamily:'inherit', fontSize:'0.875rem', boxSizing:'border-box' };
  const sel = { padding:'0.5rem 0.75rem', borderRadius:'0.5rem', border:'1px solid var(--glass-border)', background:'var(--surface-color)', fontFamily:'inherit', fontSize:'0.85rem' };
  const th = { padding:'0.65rem 0.75rem', fontWeight:700, fontSize:'0.72rem', color:'var(--text-secondary)', whiteSpace:'nowrap', letterSpacing:'0.06em', textAlign:'left' };
  const td = { padding:'0.75rem', verticalAlign:'top' };
  const btnKecil = (warna, bg) => ({ display:'inline-flex', alignItems:'center', gap:'0.3rem', color:warna, background:bg, border:'none',
    cursor:'pointer', padding:'0.35rem 0.6rem', borderRadius:'0.375rem', fontSize:'0.78rem', fontWeight:600, fontFamily:'inherit', whiteSpace:'nowrap' });

  const diskonForm = Number(form.diskon) || 0;

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.5rem',flexWrap:'wrap',gap:'0.75rem'}}>
        <div>
          <p style={{fontSize:'0.78rem',color:'var(--text-secondary)',margin:0,textTransform:'uppercase',letterSpacing:'0.05em'}}>Penjualan Buku</p>
          <h1 style={{fontSize:'1.6rem',fontWeight:700,margin:0}}>Log Buku</h1>
        </div>
        <div style={{display:'flex',background:'var(--surface-color)',borderRadius:'0.5rem',padding:'0.25rem',border:'1px solid var(--glass-border)',gap:'0.25rem'}}>
          {['Menunggu','Divalidasi','Ditolak'].map(s => (
            <button key={s} style={TAB(tab===s)} onClick={()=>gantiTab(s)}>{s}</button>
          ))}
        </div>
      </div>

      <div style={{display:'flex',gap:'0.65rem',marginBottom:'1rem',flexWrap:'wrap',alignItems:'center'}}>
        <div style={{position:'relative',flex:1,minWidth:180}}>
          <Search size={15} style={{position:'absolute',left:'0.75rem',top:'50%',transform:'translateY(-50%)',color:'var(--text-secondary)'}}/>
          <input style={{...inp,paddingLeft:'2.2rem'}} placeholder="Cari siswa / produk / guru / ID..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <select style={sel} value={filterUnit} onChange={e=>setFilterUnit(e.target.value)}>
          <option value="">Semua Unit</option>
          {allUnits.map(u=><option key={u} value={u}>{u}</option>)}
        </select>
        <select style={sel} value={filterMetode} onChange={e=>setFilterMetode(e.target.value)}>
          <option value="">Semua Metode</option>
          {METODE.map(m=><option key={m} value={m}>{m}</option>)}
        </select>
        <select style={sel} value={filterGuru} onChange={e=>setFilterGuru(e.target.value)}>
          <option value="">Semua Guru</option>
          {allGurus.map(g=><option key={g} value={g}>{g}</option>)}
        </select>
      </div>

      <div className="glass-card" style={{padding:'1.5rem'}}>
        {loading ? <p style={{color:'var(--text-secondary)'}}>Memuat...</p>
          : filtered.length === 0 ? <p style={{color:'var(--text-secondary)'}}>
              {tab === 'Menunggu' ? 'Tidak ada transaksi yang menunggu validasi.' : 'Tidak ada data.'}
            </p>
          : (
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.85rem'}}>
              <thead>
                <tr style={{borderBottom:'2px solid var(--glass-border)',background:'rgba(79,70,229,0.04)'}}>
                  <th style={th}>WAKTU</th><th style={th}>SISWA</th><th style={th}>PRODUK</th>
                  <th style={{...th,textAlign:'right'}}>TOTAL</th><th style={th}>DICATAT OLEH</th>
                  <th style={{...th,textAlign:'center'}}>STATUS</th>
                  {tab !== 'Menunggu' && <th style={th}>DIPROSES</th>}
                  {tab === 'Menunggu' && bolehValidasi && <th style={th}></th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} style={{borderBottom:'1px solid var(--glass-border)'}}>
                    <td style={{...td,whiteSpace:'nowrap',fontSize:'0.82rem'}}>
                      {fmtWaktu(r.created_at)}
                      <div style={{fontSize:'0.72rem',color:'var(--text-secondary)'}}>{r.id}</div>
                    </td>
                    <td style={td}>
                      <div style={{fontWeight:600}}>{r.nama_siswa}</div>
                      <div style={{fontSize:'0.75rem',color:'var(--text-secondary)'}}>{r.unit || '-'}</div>
                    </td>
                    <td style={{...td,fontSize:'0.82rem',maxWidth:280}}>{ringkasItem(r.items)}</td>
                    <td style={{...td,textAlign:'right'}}>
                      <div style={{fontWeight:700}}>{formatRupiah(r.total || 0)}</div>
                      <div style={{fontSize:'0.75rem',color:'var(--text-secondary)'}}>
                        {r.metode}{Number(r.diskon) > 0 ? ` · diskon ${formatRupiah(r.diskon)}` : ''}
                      </div>
                    </td>
                    <td style={td}>{r.dicatat_oleh || '-'}</td>
                    <td style={{...td,textAlign:'center'}}>{statusBadge(r.status)}</td>
                    {tab !== 'Menunggu' && (
                      <td style={{...td,fontSize:'0.8rem'}}>
                        {r.divalidasi_oleh || '-'}
                        <div style={{color:'var(--text-secondary)',fontSize:'0.75rem'}}>{fmtWaktu(r.divalidasi_pada)}</div>
                        {r.status === 'Ditolak' && r.alasan_tolak && <div style={{color:'#b91c1c',fontSize:'0.75rem'}}>{r.alasan_tolak}</div>}
                        {r.status === 'Divalidasi' && <div style={{color:'var(--text-secondary)',fontSize:'0.75rem'}}>{r.setor_id ? `Disetor (${r.setor_id})` : 'Belum disetor'}</div>}
                      </td>
                    )}
                    {tab === 'Menunggu' && bolehValidasi && (
                      <td style={{...td,textAlign:'right'}}>
                        <div style={{display:'flex',gap:'0.4rem',justifyContent:'flex-end'}}>
                          <button onClick={()=>bukaValidasi(r)} style={btnKecil('#047857','rgba(16,185,129,0.12)')}><Check size={14}/> Validasi</button>
                          <button onClick={()=>tolak(r)} style={btnKecil('#b91c1c','rgba(239,68,68,0.1)')}><Ban size={14}/> Tolak</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length >= BATAS && <p style={{fontSize:'0.78rem',color:'var(--text-secondary)',marginTop:'0.75rem'}}>Menampilkan {BATAS} data terbaru.</p>}
          </div>
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={e=>{ if (e.target === e.currentTarget && !menyimpan) setModal(null); }}>
          <div className="modal-content" style={{maxWidth:500}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
              <h3 style={{margin:0,fontWeight:700}}>Validasi Penjualan Buku</h3>
              <button onClick={()=>setModal(null)} disabled={menyimpan} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-secondary)'}}><X size={18}/></button>
            </div>

            <div style={{background:'rgba(79,70,229,0.06)',border:'1px solid rgba(79,70,229,0.15)',borderRadius:'0.5rem',padding:'0.85rem 1rem',marginBottom:'1rem'}}>
              <div style={{fontWeight:700,fontSize:'1rem'}}>{modal.nama_siswa}</div>
              <div style={{fontSize:'0.8rem',color:'var(--text-secondary)'}}>
                {modal.unit || '-'} · {modal.id} · dicatat {modal.dicatat_oleh || '-'}, {fmtWaktu(modal.created_at)}
              </div>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.82rem',marginTop:'0.6rem'}}>
                <tbody>
                  {(modal.items || []).map(i => (
                    <tr key={i.id} style={{borderTop:'1px solid rgba(79,70,229,0.12)'}}>
                      <td style={{padding:'0.35rem 0'}}>
                        {i.nama_produk}
                        <span style={{marginLeft:6,fontSize:'0.7rem',fontWeight:600,color:i.discan?'#047857':'#92400e'}}>{i.discan ? 'discan' : 'manual'}</span>
                      </td>
                      <td style={{padding:'0.35rem 0.5rem',textAlign:'right',whiteSpace:'nowrap',color:'var(--text-secondary)'}}>{i.qty} × {formatRupiah(i.harga)}</td>
                      <td style={{padding:'0.35rem 0',textAlign:'right',fontWeight:600,whiteSpace:'nowrap'}}>{formatRupiah(i.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <form onSubmit={validasi} style={{display:'flex',flexDirection:'column',gap:'0.9rem'}}>
              <div style={{display:'flex',gap:'0.75rem',flexWrap:'wrap'}}>
                <div style={{flex:'1 1 150px'}}>
                  <label className="form-label">Tanggal Bayar<span className="wajib"> *</span></label>
                  <input type="date" className="form-input" value={form.tanggal_bayar} required onChange={e=>setForm(f=>({...f,tanggal_bayar:e.target.value}))}/>
                </div>
                <div style={{flex:'1 1 150px'}}>
                  <label className="form-label">Metode Pembayaran<span className="wajib"> *</span></label>
                  <select className="form-input" value={form.metode} required onChange={e=>setForm(f=>({...f,metode:e.target.value}))}>
                    {METODE.map(m=><option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="form-label">Diskon (Rp)</label>
                <input type="number" min="0" max={modal.subtotal} className="form-input" value={form.diskon} onChange={e=>setForm(f=>({...f,diskon:e.target.value}))}/>
              </div>
              <div>
                <label className="form-label">Catatan</label>
                <input className="form-input" value={form.catatan} placeholder="Opsional" onChange={e=>setForm(f=>({...f,catatan:e.target.value}))}/>
              </div>

              <div style={{background:'rgba(16,185,129,0.08)',border:'1px solid rgba(16,185,129,0.2)',borderRadius:'0.5rem',padding:'0.7rem 1rem',fontSize:'0.85rem'}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:'0.25rem'}}>
                  <span style={{color:'var(--text-secondary)'}}>Subtotal</span><span style={{fontWeight:600}}>{formatRupiah(modal.subtotal)}</span>
                </div>
                {diskonForm > 0 && (
                  <div style={{display:'flex',justifyContent:'space-between',color:'#b45309',marginBottom:'0.25rem'}}>
                    <span>Diskon</span><span style={{fontWeight:600}}>– {formatRupiah(diskonForm)}</span>
                  </div>
                )}
                <div style={{display:'flex',justifyContent:'space-between',paddingTop:'0.35rem',borderTop:'1px solid rgba(16,185,129,0.25)',fontWeight:700}}>
                  <span>Total</span><span style={{color:'#047857'}}>{formatRupiah(Math.max(Number(modal.subtotal) - diskonForm, 0))}</span>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',marginTop:'0.3rem',fontSize:'0.78rem',color:'var(--text-secondary)'}}>
                  <span>Tanggal bayar dari guru</span><span>{fmt(modal.tanggal_bayar)}</span>
                </div>
              </div>

              <div style={{display:'flex',gap:'0.75rem'}}>
                <button type="submit" className="btn btn-primary" style={{flex:1}} disabled={menyimpan}>{menyimpan ? 'Menyimpan...' : 'Validasi'}</button>
                <button type="button" className="btn" onClick={()=>tolak(modal)} disabled={menyimpan} style={{background:'rgba(239,68,68,0.1)',color:'#b91c1c'}}><Ban size={14}/> Tolak</button>
                <button type="button" className="btn" onClick={()=>setModal(null)} disabled={menyimpan} style={{background:'var(--surface-color)'}}>Batal</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
