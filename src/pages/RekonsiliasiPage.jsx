import { useState, useEffect, useMemo } from 'react';
import { Plus, X, CheckSquare, Square, Search, Inbox } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatRupiah } from '../utils/formatRupiah';
import { useAuth } from '../context/authStore';

const genRekId = () => 'REK-' + Math.random().toString(36).substr(2,6).toUpperCase();
const fmt = (d) => d ? new Date(d).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : '-';
const uniq = (arr) => [...new Set(arr.filter(Boolean))].join(', ') || '-';

export default function RekonsiliasiPage() {
  const { user } = useAuth();
  const [setors, setSetors]           = useState([]);   // rekonsiliasi_spp
  const [transaksis, setTransaksis]   = useState([]);   // pembayaran_spp semua
  const [loading, setLoading]         = useState(true);
  const [modalOpen, setModalOpen]     = useState(false);

  // Form
  const [formTanggal, setFormTanggal] = useState('');
  const [formCatatan, setFormCatatan] = useState('');
  const [selected, setSelected]       = useState(new Set());
  const [saving, setSaving]           = useState(false);

  // Filter tabel utama
  const [search, setSearch]           = useState('');
  const [filterMetode, setFilterMetode] = useState('');
  const [dateFrom, setDateFrom]       = useState('');
  const [dateTo, setDateTo]           = useState('');

  const sel = { padding:'0.5rem 0.75rem', borderRadius:'0.5rem', border:'1px solid var(--glass-border)', background:'var(--surface-color)', fontFamily:'inherit', fontSize:'0.85rem' };
  const inp = { width:'100%', padding:'0.5rem 0.75rem', borderRadius:'0.5rem', border:'1px solid var(--glass-border)', background:'var(--surface-color)', fontFamily:'inherit', fontSize:'0.875rem', color:'var(--text-primary)', boxSizing:'border-box' };
  const lb  = (text, req) => (
    <label style={{display:'block',marginBottom:'0.3rem',fontWeight:600,fontSize:'0.78rem',color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.05em'}}>
      {text}{req && <span style={{color:'#ef4444'}}> *</span>}
    </label>
  );

  const fetchAll = async () => {
    setLoading(true);
    const [rRes, pRes] = await Promise.all([
      supabase.from('rekonsiliasi_spp').select('*').order('tanggal', {ascending:false}),
      supabase.from('pembayaran_spp').select('*').order('tanggal_bayar', {ascending:false}),
    ]);
    setSetors(rRes.data || []);
    setTransaksis(pRes.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  // Transaksi pending (belum terverifikasi)
  const pendingTransaksis = useMemo(
    () => transaksis.filter(p => p.status !== 'Terverifikasi'),
    [transaksis]
  );

  // Untuk setiap setor, ambil transaksinya
  const getSetorTrx = (setorId) => transaksis.filter(p => p.rekonsiliasi_id === setorId);

  // Enrich setor dengan data agregat dari transaksinya
  const enrichedSetors = useMemo(() => setors.map(r => {
    const trx = transaksis.filter(p => p.rekonsiliasi_id === r.id);
    return {
      ...r,
      units:            uniq(trx.map(p => p.unit)),
      metodes:          uniq(trx.map(p => p.metode)),
      petugas_transaksi: uniq(trx.map(p => p.dicatat_oleh)),
      total_real:       trx.reduce((s,p) => s+(p.nominal||0), 0),
      jml_real:         trx.length,
    };
  }), [setors, transaksis]);

  // Filter tabel utama
  const filtered = useMemo(() => enrichedSetors.filter(r => {
    const q = search.toLowerCase();
    if (search && !r.units?.toLowerCase().includes(q) && !r.petugas_transaksi?.toLowerCase().includes(q) && !r.created_by?.toLowerCase().includes(q)) return false;
    if (filterMetode && !r.metodes?.includes(filterMetode)) return false;
    if (dateFrom && r.tanggal < dateFrom) return false;
    if (dateTo   && r.tanggal > dateTo)   return false;
    return true;
  }), [enrichedSetors, search, filterMetode, dateFrom, dateTo]);

  const hasFilter = search || filterMetode || dateFrom || dateTo;

  // Total selected nominal
  const totalSelected = useMemo(
    () => [...selected].reduce((sum,id) => sum + (transaksis.find(p=>p.id===id)?.nominal||0), 0),
    [selected, transaksis]
  );

  const toggleSelect = (id) => setSelected(prev => { const n = new Set(prev); n.has(id)?n.delete(id):n.add(id); return n; });
  const toggleAll = () => setSelected(
    selected.size === pendingTransaksis.length ? new Set() : new Set(pendingTransaksis.map(p=>p.id))
  );

  const openModal = () => {
    setFormTanggal(new Date().toISOString().split('T')[0]);
    setFormCatatan('');
    setSelected(new Set());
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (selected.size === 0) { alert('Pilih minimal satu transaksi.'); return; }
    setSaving(true);
    const rekId = genRekId();

    const { error: rErr } = await supabase.from('rekonsiliasi_spp').insert([{
      id: rekId,
      tanggal: formTanggal,
      total: totalSelected,
      jumlah_transaksi: selected.size,
      catatan: formCatatan,
      created_by: user?.nama || user?.email || '-',
    }]);
    if (rErr) { alert('Gagal menyimpan: ' + rErr.message); setSaving(false); return; }

    const { error: pErr } = await supabase
      .from('pembayaran_spp')
      .update({ status: 'Terverifikasi', rekonsiliasi_id: rekId })
      .in('id', [...selected]);
    if (pErr) alert('Setor tersimpan tapi gagal update status: ' + pErr.message);

    setSaving(false);
    setModalOpen(false);
    fetchAll();
  };

  const badgeMetode = (m) => (
    <span style={{
      background: m==='Tunai'?'rgba(5,150,105,0.1)':'rgba(59,130,246,0.1)',
      color:      m==='Tunai'?'#047857':'#1d4ed8',
      padding:'0.1rem 0.5rem', borderRadius:'4px', fontSize:'0.75rem', fontWeight:600
    }}>{m}</span>
  );

  return (
    <div>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.5rem',flexWrap:'wrap',gap:'0.75rem'}}>
        <div>
          <p style={{fontSize:'0.78rem',color:'var(--text-secondary)',margin:0,textTransform:'uppercase',letterSpacing:'0.05em'}}>SPP</p>
          <h1 style={{fontSize:'1.6rem',fontWeight:700,margin:0}}>Setor SPP</h1>
        </div>
        <button onClick={openModal}
          style={{display:'flex',alignItems:'center',gap:'0.5rem',background:'var(--primary)',color:'#fff',border:'none',borderRadius:'0.5rem',padding:'0.6rem 1.2rem',cursor:'pointer',fontWeight:600,fontSize:'0.9rem'}}>
          <Plus size={18}/> Input Setor SPP
        </button>
      </div>

      {/* Filter */}
      <div style={{display:'flex',gap:'0.65rem',marginBottom:'1rem',flexWrap:'wrap',alignItems:'center'}}>
        <div style={{position:'relative',flex:1,minWidth:180}}>
          <Search size={15} style={{position:'absolute',left:'0.75rem',top:'50%',transform:'translateY(-50%)',color:'var(--text-secondary)'}}/>
          <input style={{...sel,paddingLeft:'2.2rem',width:'100%',boxSizing:'border-box'}}
            placeholder="Cari unit / petugas..."
            value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <select style={sel} value={filterMetode} onChange={e=>setFilterMetode(e.target.value)}>
          <option value="">Semua Metode</option>
          <option value="Tunai">Tunai</option>
          <option value="Transfer Bank">Transfer Bank</option>
        </select>
        <div style={{display:'flex',alignItems:'center',gap:'0.4rem'}}>
          <span style={{color:'var(--text-secondary)',fontSize:'0.82rem'}}>Dari:</span>
          <input type="date" style={sel} value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:'0.4rem'}}>
          <span style={{color:'var(--text-secondary)',fontSize:'0.82rem'}}>s/d:</span>
          <input type="date" style={sel} value={dateTo} onChange={e=>setDateTo(e.target.value)}/>
        </div>
        {hasFilter && (
          <button onClick={()=>{setSearch('');setFilterMetode('');setDateFrom('');setDateTo('');}}
            style={{background:'none',border:'1px solid var(--glass-border)',borderRadius:'0.4rem',padding:'0.45rem 0.85rem',cursor:'pointer',fontSize:'0.82rem',color:'var(--text-secondary)'}}>
            Reset
          </button>
        )}
      </div>

      {/* Tabel */}
      <div className="glass-card" style={{padding:'1.5rem'}}>
        {loading ? <p style={{color:'var(--text-secondary)'}}>Memuat...</p>
          : filtered.length === 0 ? (
            <div style={{textAlign:'center',padding:'2.5rem',color:'var(--text-secondary)'}}>
              <Inbox size={40} style={{opacity:0.25,marginBottom:'0.75rem'}}/>
              <p style={{margin:0}}>{hasFilter ? 'Tidak ada data yang cocok.' : 'Belum ada setor SPP. Klik "Input Setor SPP" untuk memulai.'}</p>
            </div>
          ) : (
          <>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.84rem'}}>
                <thead>
                  <tr style={{borderBottom:'2px solid var(--glass-border)',background:'rgba(79,70,229,0.04)'}}>
                    {[
                      {l:'NO',                  a:'center', w:44},
                      {l:'TGL SETOR',           a:'left'},
                      {l:'UNIT',                a:'left'},
                      {l:'METODE PEMBAYARAN',   a:'left'},
                      {l:'JML TRANSAKSI',       a:'center'},
                      {l:'TOTAL NOMINAL',       a:'right'},
                      {l:'PETUGAS INPUT TRANSAKSI', a:'left'},
                      {l:'PETUGAS SETOR SPP',   a:'left'},
                    ].map(h=>(
                      <th key={h.l} style={{textAlign:h.a,width:h.w,padding:'0.65rem 0.75rem',fontWeight:700,fontSize:'0.72rem',color:'var(--text-secondary)',whiteSpace:'nowrap',letterSpacing:'0.06em'}}>{h.l}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r,idx)=>(
                    <tr key={r.id} style={{borderBottom:'1px solid var(--glass-border)'}}
                      onMouseOver={e=>e.currentTarget.style.background='rgba(79,70,229,0.03)'}
                      onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                      <td style={{padding:'0.75rem',textAlign:'center',color:'var(--text-secondary)',fontSize:'0.8rem'}}>{idx+1}</td>
                      <td style={{padding:'0.75rem',fontWeight:700,whiteSpace:'nowrap'}}>{fmt(r.tanggal)}</td>
                      <td style={{padding:'0.75rem',color:'var(--text-secondary)',fontSize:'0.82rem'}}>{r.units}</td>
                      <td style={{padding:'0.75rem'}}>
                        <div style={{display:'flex',gap:'0.35rem',flexWrap:'wrap'}}>
                          {(r.metodes||'').split(', ').filter(Boolean).map(m=>(
                            <span key={m}>{badgeMetode(m)}</span>
                          ))}
                        </div>
                      </td>
                      <td style={{padding:'0.75rem',textAlign:'center'}}>
                        <span style={{background:'rgba(79,70,229,0.1)',color:'var(--primary)',padding:'0.15rem 0.6rem',borderRadius:'999px',fontWeight:700,fontSize:'0.82rem'}}>{r.jml_real}</span>
                      </td>
                      <td style={{padding:'0.75rem',textAlign:'right',fontWeight:700,color:'#047857'}}>{formatRupiah(r.total_real)}</td>
                      <td style={{padding:'0.75rem',fontSize:'0.82rem',color:'var(--text-secondary)'}}>{r.petugas_transaksi}</td>
                      <td style={{padding:'0.75rem',fontSize:'0.82rem',fontWeight:600}}>{r.created_by||'-'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{borderTop:'2px solid var(--glass-border)',background:'rgba(79,70,229,0.04)',fontWeight:700}}>
                    <td colSpan={4} style={{padding:'0.65rem 0.75rem',fontSize:'0.82rem'}}>TOTAL ({filtered.length} setor)</td>
                    <td style={{padding:'0.65rem 0.75rem',textAlign:'center',color:'var(--primary)'}}>
                      {filtered.reduce((s,r)=>s+r.jml_real,0)}
                    </td>
                    <td style={{padding:'0.65rem 0.75rem',textAlign:'right',color:'#047857'}}>
                      {formatRupiah(filtered.reduce((s,r)=>s+r.total_real,0))}
                    </td>
                    <td colSpan={2}/>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ── MODAL INPUT SETOR SPP ── */}
      {modalOpen && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:'1rem'}}>
          <div className="glass-card" style={{width:'100%',maxWidth:720,maxHeight:'90vh',display:'flex',flexDirection:'column',overflow:'hidden'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'1.25rem 1.5rem',borderBottom:'1px solid var(--glass-border)'}}>
              <h3 style={{margin:0,fontWeight:700}}>Input Setor SPP</h3>
              <button onClick={()=>setModalOpen(false)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-secondary)'}}><X size={18}/></button>
            </div>

            <form onSubmit={handleSubmit} style={{display:'flex',flexDirection:'column',flex:1,overflow:'hidden'}}>
              <div style={{padding:'1.25rem 1.5rem',display:'flex',gap:'1rem',flexWrap:'wrap',borderBottom:'1px solid var(--glass-border)'}}>
                <div style={{flex:'1',minWidth:160}}>
                  {lb('Tanggal Setor', true)}
                  <input type="date" style={inp} value={formTanggal} onChange={e=>setFormTanggal(e.target.value)} required/>
                </div>
                <div style={{flex:'2',minWidth:220}}>
                  {lb('Catatan')}
                  <input style={inp} value={formCatatan} onChange={e=>setFormCatatan(e.target.value)} placeholder="Opsional"/>
                </div>
              </div>

              <div style={{flex:1,overflowY:'auto',padding:'0 1.5rem'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0.85rem 0',borderBottom:'1px solid var(--glass-border)',position:'sticky',top:0,background:'var(--card-bg,#fff)'}}>
                  <div style={{fontWeight:600,fontSize:'0.85rem'}}>
                    Pilih transaksi
                    <span style={{marginLeft:'0.5rem',color:'var(--text-secondary)',fontWeight:400}}>({pendingTransaksis.length} belum disetor)</span>
                  </div>
                  {pendingTransaksis.length > 0 && (
                    <button type="button" onClick={toggleAll}
                      style={{background:'none',border:'1px solid var(--glass-border)',borderRadius:'0.4rem',padding:'0.3rem 0.75rem',cursor:'pointer',fontSize:'0.8rem',fontWeight:600,display:'flex',alignItems:'center',gap:'0.35rem'}}>
                      {selected.size === pendingTransaksis.length
                        ? <><CheckSquare size={14}/> Batal Semua</>
                        : <><Square size={14}/> Pilih Semua</>}
                    </button>
                  )}
                </div>

                {pendingTransaksis.length === 0 ? (
                  <p style={{color:'var(--text-secondary)',textAlign:'center',padding:'1.5rem 0',fontSize:'0.88rem'}}>Semua transaksi sudah disetor.</p>
                ) : (
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.83rem'}}>
                    <thead>
                      <tr style={{borderBottom:'1px solid var(--glass-border)'}}>
                        <th style={{width:36,padding:'0.5rem 0'}}/>
                        {['TGL BAYAR','NAMA SISWA','PROGRAM','UNIT','METODE','NOMINAL'].map((h,i)=>(
                          <th key={h} style={{textAlign:i===5?'right':'left',padding:'0.5rem 0.5rem',fontWeight:700,fontSize:'0.72rem',color:'var(--text-secondary)'}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pendingTransaksis.map(p => {
                        const checked = selected.has(p.id);
                        return (
                          <tr key={p.id} onClick={()=>toggleSelect(p.id)}
                            style={{borderBottom:'1px solid var(--glass-border)',cursor:'pointer',background:checked?'rgba(79,70,229,0.05)':'transparent',transition:'background 0.1s'}}>
                            <td style={{padding:'0.55rem 0',textAlign:'center'}}>
                              {checked ? <CheckSquare size={16} style={{color:'var(--primary)'}}/> : <Square size={16} style={{color:'var(--text-secondary)'}}/>}
                            </td>
                            <td style={{padding:'0.55rem 0.5rem',whiteSpace:'nowrap'}}>{fmt(p.tanggal_bayar||p.created_at?.split('T')[0])}</td>
                            <td style={{padding:'0.55rem 0.5rem',fontWeight:500}}>{p.nama_siswa||'-'}</td>
                            <td style={{padding:'0.55rem 0.5rem',color:'var(--primary)',fontSize:'0.8rem'}}>{p.nama_program||'-'}</td>
                            <td style={{padding:'0.55rem 0.5rem',color:'var(--text-secondary)',fontSize:'0.8rem'}}>{p.unit||'-'}</td>
                            <td style={{padding:'0.55rem 0.5rem'}}>{badgeMetode(p.metode)}</td>
                            <td style={{padding:'0.55rem 0.5rem',textAlign:'right',fontWeight:700}}>{formatRupiah(p.nominal||0)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              <div style={{padding:'1rem 1.5rem',borderTop:'1px solid var(--glass-border)',background:'rgba(79,70,229,0.03)'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'0.85rem',flexWrap:'wrap',gap:'0.5rem'}}>
                  <span style={{fontSize:'0.85rem',color:'var(--text-secondary)'}}>
                    Dipilih: <strong style={{color:'var(--primary)'}}>{selected.size}</strong> transaksi
                  </span>
                  <span style={{fontSize:'1rem',fontWeight:700}}>
                    Total: <span style={{color:'#047857'}}>{formatRupiah(totalSelected)}</span>
                  </span>
                </div>
                <div style={{display:'flex',gap:'0.75rem'}}>
                  <button type="submit" disabled={saving||selected.size===0}
                    style={{flex:1,background:'var(--primary)',color:'#fff',border:'none',borderRadius:'0.5rem',padding:'0.65rem',cursor:selected.size===0?'not-allowed':'pointer',fontWeight:700,fontSize:'0.9rem',opacity:selected.size===0?0.5:1}}>
                    {saving ? 'Menyimpan...' : `Setor ${selected.size} Transaksi`}
                  </button>
                  <button type="button" onClick={()=>setModalOpen(false)}
                    style={{background:'var(--surface-color)',border:'1px solid var(--glass-border)',borderRadius:'0.5rem',padding:'0.65rem 1.1rem',cursor:'pointer',fontWeight:600,fontSize:'0.9rem'}}>
                    Batal
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
