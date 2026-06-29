import { useState, useEffect } from 'react';
import { Plus, Trash2, X, CalendarX } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/authStore';

const thisYear  = () => new Date().getFullYear();
const fmtTgl    = (d) => d ? new Date(d+'T12:00:00').toLocaleDateString('id-ID',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}) : '-';
const fmtShort  = (d) => d ? new Date(d+'T12:00:00').toLocaleDateString('id-ID',{day:'2-digit',month:'short'}) : '-';

const inp = { padding:'0.55rem 0.75rem', borderRadius:'0.5rem', border:'1px solid var(--glass-border)', background:'var(--surface-color)', fontFamily:'inherit', fontSize:'0.88rem', width:'100%', boxSizing:'border-box' };

const useIsMobile = () => {
  const [mobile, setMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const h = () => setMobile(window.innerWidth < 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return mobile;
};

export default function HariLiburPage() {
  const { user }  = useAuth();
  const isAdmin   = user?.role === 'Admin';
  const isMobile  = useIsMobile();

  const [libur, setLibur]   = useState([]);
  const [units, setUnits]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]   = useState(false);
  const [filterTahun, setFilterTahun] = useState(String(thisYear()));
  const [form, setForm]     = useState({ tanggal:'', keterangan:'', unit_id:'' });

  const years = Array.from({length:3}, (_,i) => String(thisYear()-1+i));

  const fetchAll = async () => {
    setLoading(true);
    const [lRes, uRes] = await Promise.all([
      supabase.from('hari_libur').select('*, units(nama)').order('tanggal'),
      supabase.from('units').select('*').eq('aktif',true).order('nama'),
    ]);
    setLibur(lRes.data  || []);
    setUnits(uRes.data  || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.tanggal || !form.keterangan.trim()) return alert('Tanggal dan keterangan wajib diisi.');
    const { error } = await supabase.from('hari_libur').insert({
      tanggal: form.tanggal,
      keterangan: form.keterangan,
      unit_id: form.unit_id || null,
    });
    if (error) return alert('Gagal: ' + (error.code==='23505'?'Tanggal ini sudah ada di daftar hari libur.':error.message));
    setModal(false); fetchAll();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Hapus hari libur ini?')) return;
    await supabase.from('hari_libur').delete().eq('id', id);
    fetchAll();
  };

  const filtered = libur.filter(l => l.tanggal.startsWith(filterTahun));

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom:'1.25rem' }}>
        <p style={{ fontSize:'0.72rem', color:'var(--text-secondary)', margin:0, textTransform:'uppercase', letterSpacing:'0.05em' }}>Absensi</p>
        <h1 style={{ fontSize:isMobile?'1.35rem':'1.6rem', fontWeight:700, margin:0 }}>Hari Libur</h1>
      </div>

      {/* Toolbar */}
      <div style={{ display:'flex', flexDirection:isMobile?'column':'row', justifyContent:'space-between', alignItems:isMobile?'stretch':'center', marginBottom:'1rem', gap:'0.65rem' }}>
        <div style={{ display:'flex', gap:'0.5rem' }}>
          {years.map(y => (
            <button key={y} className="btn" onClick={()=>setFilterTahun(y)}
              style={{ flex:isMobile?1:undefined, fontWeight:filterTahun===y?800:400, background:filterTahun===y?'var(--primary)':undefined, color:filterTahun===y?'#fff':undefined }}>
              {y}
            </button>
          ))}
        </div>
        {isAdmin && (
          <button className="btn btn-primary" style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'0.5rem' }}
            onClick={()=>{ setForm({tanggal:'',keterangan:'',unit_id:''}); setModal(true); }}>
            <Plus size={16}/> Tambah Hari Libur
          </button>
        )}
      </div>

      {/* Summary cards — 3 kolom di semua ukuran, ukuran font menyesuaikan */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'0.65rem', marginBottom:'1rem' }}>
        {[
          ['Total '+filterTahun, filtered.length,                          'hari libur',    'var(--primary)',    'rgba(79,70,229,0.06)'],
          ['Libur Nasional',      filtered.filter(l=>!l.unit_id).length,   'semua unit',    '#047857',           'rgba(4,120,87,0.06)'],
          ['Libur Unit',          filtered.filter(l=>!!l.unit_id).length,  'per unit',      '#d97706',           'rgba(245,158,11,0.06)'],
        ].map(([label, count, sub, color, bg]) => (
          <div key={label} className="glass-card" style={{ padding:isMobile?'0.65rem 0.75rem':'0.75rem 1.25rem', background:bg }}>
            <div style={{ fontSize:isMobile?'0.65rem':'0.78rem', color:'var(--text-secondary)', fontWeight:600, marginBottom:'0.25rem', lineHeight:1.2 }}>{label}</div>
            <div style={{ fontSize:isMobile?'1.5rem':'1.75rem', fontWeight:800, color, lineHeight:1 }}>{count}</div>
            <div style={{ fontSize:isMobile?'0.65rem':'0.75rem', color:'var(--text-secondary)', marginTop:'0.2rem' }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* List */}
      <div className="glass-card" style={{ padding:isMobile?'0.75rem':'1.5rem' }}>
        {loading ? <p style={{ color:'var(--text-secondary)' }}>Memuat...</p> : filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:'3rem', color:'var(--text-secondary)' }}>
            <CalendarX size={40} style={{ opacity:0.3, marginBottom:'0.75rem' }}/>
            <p>Belum ada hari libur untuk tahun {filterTahun}.</p>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:'0.55rem' }}>
            {filtered.map((l) => {
              const isNasional = !l.unit_id;
              const accentColor = isNasional ? 'var(--primary)' : '#d97706';
              const bg          = isNasional ? 'rgba(79,70,229,0.06)'  : 'rgba(245,158,11,0.07)';
              const border      = isNasional ? 'rgba(79,70,229,0.18)'  : 'rgba(245,158,11,0.3)';
              const badgeBg     = isNasional ? 'rgba(79,70,229,0.12)'  : 'rgba(245,158,11,0.15)';
              const badgeColor  = isNasional ? 'var(--primary)'         : '#92400e';
              const badgeLabel  = isNasional ? 'Semua Unit'             : (l.units?.nama || 'Unit tertentu');

              return isMobile ? (
                /* ── MOBILE CARD ── */
                <div key={l.id} style={{ borderRadius:'0.75rem', border:`1px solid ${border}`, background:bg, overflow:'hidden' }}>
                  {/* Top strip */}
                  <div style={{ background:accentColor, padding:'0.4rem 0.85rem', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <span style={{ color:'#fff', fontWeight:800, fontSize:'0.8rem' }}>
                      {fmtShort(l.tanggal)}
                    </span>
                    <span style={{ color:'rgba(255,255,255,0.85)', fontSize:'0.72rem', fontWeight:600 }}>
                      {new Date(l.tanggal+'T12:00:00').toLocaleDateString('id-ID',{weekday:'long'})}
                    </span>
                  </div>
                  {/* Body */}
                  <div style={{ padding:'0.75rem 0.85rem', display:'flex', justifyContent:'space-between', alignItems:'center', gap:'0.5rem' }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:'0.9rem', marginBottom:'0.3rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {l.keterangan}
                      </div>
                      <span style={{ background:badgeBg, color:badgeColor, padding:'0.15rem 0.55rem', borderRadius:999, fontSize:'0.72rem', fontWeight:700 }}>
                        {badgeLabel}
                      </span>
                    </div>
                    {isAdmin && (
                      <button onClick={()=>handleDelete(l.id)}
                        style={{ background:'#fee2e2', border:'none', borderRadius:'0.5rem', padding:'0.45rem 0.6rem', cursor:'pointer', color:'#b91c1c', display:'flex', alignItems:'center', flexShrink:0 }}>
                        <Trash2 size={15}/>
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                /* ── DESKTOP ROW ── */
                <div key={l.id} style={{
                  display:'flex', justifyContent:'space-between', alignItems:'center',
                  padding:'0.75rem 1rem', borderRadius:'0.5rem',
                  background:bg, border:`1px solid ${border}`,
                  flexWrap:'wrap', gap:'0.5rem',
                }}>
                  <div style={{ display:'flex', gap:'1rem', alignItems:'center' }}>
                    <div style={{ background:accentColor, color:'#fff', borderRadius:'0.4rem', padding:'0.35rem 0.65rem', fontSize:'0.85rem', fontWeight:800, minWidth:46, textAlign:'center' }}>
                      {new Date(l.tanggal+'T12:00:00').getDate()}
                    </div>
                    <div>
                      <div style={{ fontWeight:700, fontSize:'0.9rem' }}>{l.keterangan}</div>
                      <div style={{ fontSize:'0.8rem', color:'var(--text-secondary)' }}>{fmtTgl(l.tanggal)}</div>
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
                    <span style={{ background:badgeBg, color:badgeColor, padding:'0.18rem 0.65rem', borderRadius:999, fontSize:'0.75rem', fontWeight:700 }}>
                      {badgeLabel}
                    </span>
                    {isAdmin && (
                      <button onClick={()=>handleDelete(l.id)}
                        style={{ background:'#fee2e2', border:'none', borderRadius:'0.4rem', padding:'0.3rem 0.5rem', cursor:'pointer', color:'#b91c1c', display:'flex', alignItems:'center' }}>
                        <Trash2 size={14}/>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal tambah */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth:420 }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem' }}>
              <h2 style={{ fontWeight:700, fontSize:'1.1rem', margin:0 }}>Tambah Hari Libur</h2>
              <button onClick={()=>setModal(false)} style={{ background:'none',border:'none',cursor:'pointer' }}><X size={20}/></button>
            </div>
            <form onSubmit={handleSave} style={{ display:'flex', flexDirection:'column', gap:'0.85rem' }}>
              <div>
                <label style={{ fontSize:'0.82rem', fontWeight:600, display:'block', marginBottom:'0.3rem' }}>Tanggal *</label>
                <input type="date" required value={form.tanggal} onChange={e=>setForm(f=>({...f,tanggal:e.target.value}))} style={inp}/>
              </div>
              <div>
                <label style={{ fontSize:'0.82rem', fontWeight:600, display:'block', marginBottom:'0.3rem' }}>Keterangan *</label>
                <input required value={form.keterangan} onChange={e=>setForm(f=>({...f,keterangan:e.target.value}))} placeholder="Cth: Hari Raya Idul Fitri" style={inp}/>
              </div>
              <div>
                <label style={{ fontSize:'0.82rem', fontWeight:600, display:'block', marginBottom:'0.3rem' }}>Berlaku Untuk</label>
                <select value={form.unit_id} onChange={e=>setForm(f=>({...f,unit_id:e.target.value}))} style={inp}>
                  <option value="">Semua Unit (Nasional)</option>
                  {units.map(u=><option key={u.id} value={u.id}>{u.nama} (unit tertentu)</option>)}
                </select>
              </div>
              <div style={{ display:'flex', gap:'0.65rem', justifyContent:'flex-end' }}>
                <button type="button" className="btn" onClick={()=>setModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary">Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
