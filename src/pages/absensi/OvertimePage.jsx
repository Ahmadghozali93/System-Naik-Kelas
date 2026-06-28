import { useState, useEffect } from 'react';
import { Plus, X, CheckCircle2, XCircle, Timer } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/authStore';

const todayWIB = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
const fmtTime  = (ts) => ts ? new Date(ts).toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit'}) : '-';
const fmtTgl   = (d)  => d  ? new Date(d+'T12:00:00').toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : '-';
const mntToStr = (m)  => m  ? `${Math.floor(m/60)}j ${m%60}m` : '-';

const BADGE = { Pending:['#fef3c7','#92400e'], Approved:['#d1fae5','#047857'], Rejected:['#fee2e2','#b91c1c'] };
const SBadge = ({s}) => { const [bg,c]=BADGE[s]||['#f3f4f6','#374151']; return <span style={{background:bg,color:c,padding:'0.18rem 0.65rem',borderRadius:999,fontSize:'0.75rem',fontWeight:700}}>{s}</span>; };

const inp = { padding:'0.55rem 0.75rem', borderRadius:'0.5rem', border:'1px solid var(--glass-border)', background:'var(--surface-color)', fontFamily:'inherit', fontSize:'0.88rem', width:'100%', boxSizing:'border-box' };

export default function OvertimePage() {
  const { user } = useAuth();
  const isAdmin  = user?.role === 'Admin';

  const [overtimes, setOvertimes] = useState([]);
  const [units, setUnits]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [modal, setModal]         = useState(false);
  const [approveModal, setApproveModal] = useState(null);
  const [catatan, setCatatan]     = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [activeOT, setActiveOT]   = useState(null); // lembur yang sedang berjalan

  const [form, setForm] = useState({ unit_id:'', tanggal:todayWIB(), keterangan:'' });

  const fetchAll = async () => {
    setLoading(true);
    const [otRes, uRes] = await Promise.all([
      supabase.from('overtime').select('*, gurus!guru_id(nama)').order('created_at',{ascending:false}),
      supabase.from('units').select('*').eq('aktif',true).order('nama'),
    ]);
    const data = otRes.data || [];
    setOvertimes(data);
    setUnits(uRes.data || []);
    // Cek apakah ada lembur yang sedang berjalan (milik user, belum ada selesai)
    const active = data.find(o => o.guru_id === user?.id && !o.selesai && o.status !== 'Rejected');
    setActiveOT(active || null);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, [user]);

  const handleMulaiLembur = async (e) => {
    e.preventDefault();
    if (!form.unit_id) return alert('Pilih unit.');
    const now = new Date().toISOString();
    const { error } = await supabase.from('overtime').insert({
      guru_id: user.id, unit_id: form.unit_id,
      tanggal: form.tanggal, mulai: now,
      keterangan: form.keterangan || null,
    });
    if (error) return alert('Gagal: ' + error.message);
    setModal(false); fetchAll();
  };

  const handleSelesaiLembur = async (id) => {
    if (!window.confirm('Tandai lembur ini sebagai selesai?')) return;
    const now = new Date().toISOString();
    const ot  = overtimes.find(o => o.id === id);
    const durasi = ot ? Math.round((new Date(now) - new Date(ot.mulai)) / 60000) : null;
    const { error } = await supabase.from('overtime').update({ selesai: now, durasi_menit: durasi }).eq('id', id);
    if (error) return alert('Gagal: ' + error.message);
    fetchAll();
  };

  const handleApprove = async (id, action) => {
    const { error } = await supabase.from('overtime').update({ status: action, disetujui_oleh: user.id }).eq('id', id);
    if (error) return alert('Gagal: ' + error.message);
    setApproveModal(null); fetchAll();
  };

  const filtered = filterStatus ? overtimes.filter(o => o.status === filterStatus) : overtimes;
  const unitName = (id) => units.find(u=>u.id===id)?.nama || id;

  return (
    <div>
      <div style={{ marginBottom:'1.5rem' }}>
        <p style={{ fontSize:'0.78rem', color:'var(--text-secondary)', margin:0, textTransform:'uppercase', letterSpacing:'0.05em' }}>Absensi</p>
        <h1 style={{ fontSize:'1.6rem', fontWeight:700, margin:0 }}>Lembur</h1>
      </div>

      {/* Banner lembur aktif */}
      {activeOT && (
        <div style={{ background:'rgba(245,158,11,0.1)', border:'1px solid #f59e0b', borderRadius:'0.75rem', padding:'1rem 1.25rem', marginBottom:'1rem', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'0.75rem' }}>
          <div>
            <div style={{ fontWeight:700, color:'#92400e' }}>⏱️ Lembur sedang berjalan</div>
            <div style={{ fontSize:'0.85rem', color:'var(--text-secondary)' }}>Mulai: {fmtTime(activeOT.mulai)} · {activeOT.keterangan||'Tanpa keterangan'}</div>
          </div>
          <button className="btn" style={{ background:'#f59e0b', color:'#fff', fontWeight:700 }} onClick={()=>handleSelesaiLembur(activeOT.id)}>
            <Timer size={16}/> Selesai Lembur
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem', flexWrap:'wrap', gap:'0.65rem' }}>
        <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{ ...inp, width:'auto' }}>
          <option value="">Semua Status</option>
          {['Pending','Approved','Rejected'].map(s=><option key={s} value={s}>{s}</option>)}
        </select>
        {!activeOT && (
          <button className="btn btn-primary" onClick={()=>{ setForm({unit_id:'',tanggal:todayWIB(),keterangan:''}); setModal(true); }}>
            <Plus size={16}/> Mulai Lembur
          </button>
        )}
      </div>

      <div className="glass-card" style={{ padding:'1.5rem' }}>
        {loading ? <p style={{ color:'var(--text-secondary)' }}>Memuat...</p> : filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:'3rem', color:'var(--text-secondary)' }}>
            <Timer size={40} style={{ opacity:0.3, marginBottom:'0.75rem' }} />
            <p>Belum ada data lembur.</p>
          </div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.84rem' }}>
              <thead>
                <tr style={{ borderBottom:'2px solid var(--glass-border)', background:'rgba(79,70,229,0.04)' }}>
                  {['No','Nama','Unit','Tanggal','Mulai','Selesai','Durasi','Keterangan','Status','Aksi'].map(h=>(
                    <th key={h} style={{ padding:'0.65rem 0.75rem', textAlign:'left', fontWeight:700, fontSize:'0.72rem', color:'var(--text-secondary)', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((o,i) => (
                  <tr key={o.id} style={{ borderBottom:'1px solid var(--glass-border)' }}
                    onMouseOver={e=>e.currentTarget.style.background='rgba(79,70,229,0.03)'}
                    onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                    <td style={{ padding:'0.7rem 0.75rem', color:'var(--text-secondary)' }}>{i+1}</td>
                    <td style={{ padding:'0.7rem 0.75rem', fontWeight:600 }}>{o.gurus?.nama||'-'}</td>
                    <td style={{ padding:'0.7rem 0.75rem', fontSize:'0.8rem', color:'var(--text-secondary)' }}>{unitName(o.unit_id)}</td>
                    <td style={{ padding:'0.7rem 0.75rem', whiteSpace:'nowrap' }}>{fmtTgl(o.tanggal)}</td>
                    <td style={{ padding:'0.7rem 0.75rem', fontWeight:600, color:'var(--primary)' }}>{fmtTime(o.mulai)}</td>
                    <td style={{ padding:'0.7rem 0.75rem' }}>{fmtTime(o.selesai)}</td>
                    <td style={{ padding:'0.7rem 0.75rem', fontWeight:700, color:'#f59e0b' }}>{mntToStr(o.durasi_menit)}</td>
                    <td style={{ padding:'0.7rem 0.75rem', fontSize:'0.82rem', color:'var(--text-secondary)', maxWidth:160 }}>{o.keterangan||'-'}</td>
                    <td style={{ padding:'0.7rem 0.75rem' }}><SBadge s={o.status}/></td>
                    <td style={{ padding:'0.7rem 0.75rem' }}>
                      {isAdmin && o.status === 'Pending' && o.selesai && (
                        <div style={{ display:'flex', gap:'0.35rem' }}>
                          <button onClick={()=>setApproveModal({id:o.id,action:'Approved'})} style={{ background:'#d1fae5',border:'none',borderRadius:'0.35rem',padding:'0.3rem 0.55rem',cursor:'pointer',color:'#047857',display:'flex',alignItems:'center',gap:3 }}><CheckCircle2 size={13}/>OK</button>
                          <button onClick={()=>setApproveModal({id:o.id,action:'Rejected'})} style={{ background:'#fee2e2',border:'none',borderRadius:'0.35rem',padding:'0.3rem 0.55rem',cursor:'pointer',color:'#b91c1c',display:'flex',alignItems:'center',gap:3 }}><XCircle size={13}/>Tolak</button>
                        </div>
                      )}
                      {!isAdmin && o.id === activeOT?.id && (
                        <button onClick={()=>handleSelesaiLembur(o.id)} style={{ background:'#f59e0b',border:'none',borderRadius:'0.35rem',padding:'0.3rem 0.65rem',cursor:'pointer',color:'#fff',fontWeight:600,fontSize:'0.78rem' }}>Selesai</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal mulai lembur */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth:420 }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem' }}>
              <h2 style={{ fontWeight:700, fontSize:'1.1rem', margin:0 }}>Mulai Lembur</h2>
              <button onClick={()=>setModal(false)} style={{ background:'none',border:'none',cursor:'pointer' }}><X size={20}/></button>
            </div>
            <form onSubmit={handleMulaiLembur} style={{ display:'flex', flexDirection:'column', gap:'0.85rem' }}>
              <div>
                <label style={{ fontSize:'0.82rem', fontWeight:600, display:'block', marginBottom:'0.3rem' }}>Unit / Cabang *</label>
                <select required value={form.unit_id} onChange={e=>setForm(f=>({...f,unit_id:e.target.value}))} style={inp}>
                  <option value="">-- Pilih Unit --</option>
                  {units.map(u=><option key={u.id} value={u.id}>{u.nama}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize:'0.82rem', fontWeight:600, display:'block', marginBottom:'0.3rem' }}>Tanggal</label>
                <input type="date" value={form.tanggal} onChange={e=>setForm(f=>({...f,tanggal:e.target.value}))} style={inp}/>
              </div>
              <div>
                <label style={{ fontSize:'0.82rem', fontWeight:600, display:'block', marginBottom:'0.3rem' }}>Keterangan</label>
                <textarea rows={2} value={form.keterangan} onChange={e=>setForm(f=>({...f,keterangan:e.target.value}))} placeholder="Alasan lembur..." style={{ ...inp, resize:'vertical' }}/>
              </div>
              <p style={{ fontSize:'0.82rem', color:'var(--text-secondary)', margin:0 }}>⏱️ Waktu mulai akan dicatat saat klik Mulai.</p>
              <div style={{ display:'flex', gap:'0.65rem', justifyContent:'flex-end' }}>
                <button type="button" className="btn" onClick={()=>setModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary">Mulai Lembur</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal approve */}
      {approveModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth:380 }} onClick={e=>e.stopPropagation()}>
            <h2 style={{ fontWeight:700, margin:'0 0 1rem' }}>{approveModal.action==='Approved'?'✅ Setujui':'❌ Tolak'} Lembur</h2>
            <div style={{ display:'flex', gap:'0.65rem', justifyContent:'flex-end' }}>
              <button className="btn" onClick={()=>setApproveModal(null)}>Batal</button>
              <button className="btn" style={{ background:approveModal.action==='Approved'?'#047857':'#b91c1c',color:'#fff' }} onClick={()=>handleApprove(approveModal.id,approveModal.action)}>
                Konfirmasi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
