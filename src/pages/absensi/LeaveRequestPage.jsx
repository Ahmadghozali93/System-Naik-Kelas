import { useState, useEffect } from 'react';
import { Plus, X, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/authStore';

const todayWIB = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
const fmt      = (d) => d ? new Date(d+'T12:00:00').toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : '-';
const JENIS    = ['Izin','Sakit','Cuti'];

const BADGE = {
  Pending:  ['#fef3c7','#92400e'],
  Approved: ['#d1fae5','#047857'],
  Rejected: ['#fee2e2','#b91c1c'],
};
const SBadge = ({s}) => { const [bg,c]=BADGE[s]||['#f3f4f6','#374151']; return <span style={{background:bg,color:c,padding:'0.18rem 0.65rem',borderRadius:999,fontSize:'0.75rem',fontWeight:700}}>{s}</span>; };

const inp = { padding:'0.55rem 0.75rem', borderRadius:'0.5rem', border:'1px solid var(--glass-border)', background:'var(--surface-color)', fontFamily:'inherit', fontSize:'0.88rem', width:'100%', boxSizing:'border-box' };

export default function LeaveRequestPage() {
  const { user } = useAuth();
  const isAdmin  = ['Owner', 'Administrator', 'Supervisor'].includes(user?.role);

  const [requests, setRequests]   = useState([]);
  const [units, setUnits]         = useState([]);
  const [gurus, setGurus]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [modal, setModal]         = useState(false);
  const [approveModal, setApproveModal] = useState(null); // { id, action }
  const [catatan, setCatatan]     = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterJenis, setFilterJenis]   = useState('');

  const [form, setForm] = useState({ unit_id:'', jenis:'Izin', tanggal_mulai:todayWIB(), tanggal_selesai:todayWIB(), alasan:'' });

  const fetchAll = async () => {
    setLoading(true);
    const [rRes, uRes, gRes] = await Promise.all([
      supabase.from('leave_requests').select('*, gurus!guru_id(nama)').order('created_at',{ascending:false}),
      supabase.from('units').select('*').eq('aktif',true).order('nama'),
      supabase.from('gurus').select('id,nama').eq('status','Aktif').order('nama'),
    ]);
    setRequests(rRes.data || []);
    setUnits(uRes.data   || []);
    setGurus(gRes.data   || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.unit_id) return alert('Pilih unit/cabang.');
    const { error } = await supabase.from('leave_requests').insert({
      guru_id: user.id, ...form,
    });
    if (error) return alert('Gagal: ' + error.message);
    setModal(false); fetchAll();
  };

  const handleApprove = async (id, action) => {
    const { error } = await supabase.from('leave_requests').update({
      status: action, disetujui_oleh: user.id, catatan_admin: catatan || null,
    }).eq('id', id);
    if (error) return alert('Gagal: ' + error.message);
    setApproveModal(null); setCatatan(''); fetchAll();
  };

  const filtered = requests.filter(r => {
    if (filterStatus && r.status !== filterStatus) return false;
    if (filterJenis  && r.jenis  !== filterJenis)  return false;
    return true;
  });

  const unitName = (id) => units.find(u=>u.id===id)?.nama || id;

  return (
    <div>
      <div style={{ marginBottom:'1.5rem' }}>
        <p style={{ fontSize:'0.78rem', color:'var(--text-secondary)', margin:0, textTransform:'uppercase', letterSpacing:'0.05em' }}>Absensi</p>
        <h1 style={{ fontSize:'1.6rem', fontWeight:700, margin:0 }}>Izin & Cuti</h1>
      </div>

      {/* Toolbar */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem', flexWrap:'wrap', gap:'0.65rem' }}>
        <div style={{ display:'flex', gap:'0.65rem', flexWrap:'wrap' }}>
          <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{ ...inp, width:'auto' }}>
            <option value="">Semua Status</option>
            {['Pending','Approved','Rejected'].map(s=><option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filterJenis} onChange={e=>setFilterJenis(e.target.value)} style={{ ...inp, width:'auto' }}>
            <option value="">Semua Jenis</option>
            {JENIS.map(j=><option key={j} value={j}>{j}</option>)}
          </select>
        </div>
        <button className="btn btn-primary" onClick={()=>{ setForm({unit_id:'',jenis:'Izin',tanggal_mulai:todayWIB(),tanggal_selesai:todayWIB(),alasan:''}); setModal(true); }}>
          <Plus size={16}/> Ajukan Izin/Cuti
        </button>
      </div>

      <div className="glass-card" style={{ padding:'1.5rem' }}>
        {loading ? <p style={{ color:'var(--text-secondary)' }}>Memuat...</p> : filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:'3rem', color:'var(--text-secondary)' }}>
            <Clock size={40} style={{ opacity:0.3, marginBottom:'0.75rem' }} />
            <p>Belum ada pengajuan izin/cuti.</p>
          </div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.84rem' }}>
              <thead>
                <tr style={{ borderBottom:'2px solid var(--glass-border)', background:'rgba(79,70,229,0.04)' }}>
                  {['No','Nama','Unit','Jenis','Tgl Mulai','Tgl Selesai','Durasi','Alasan','Status','Aksi'].map(h=>(
                    <th key={h} style={{ padding:'0.65rem 0.75rem', textAlign:'left', fontWeight:700, fontSize:'0.72rem', color:'var(--text-secondary)', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r,i) => {
                  const d1 = new Date(r.tanggal_mulai+'T12:00:00');
                  const d2 = new Date(r.tanggal_selesai+'T12:00:00');
                  const durasi = Math.round((d2-d1)/(1000*60*60*24))+1;
                  return (
                    <tr key={r.id} style={{ borderBottom:'1px solid var(--glass-border)' }}
                      onMouseOver={e=>e.currentTarget.style.background='rgba(79,70,229,0.03)'}
                      onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                      <td style={{ padding:'0.7rem 0.75rem', color:'var(--text-secondary)' }}>{i+1}</td>
                      <td style={{ padding:'0.7rem 0.75rem', fontWeight:600 }}>{r.gurus?.nama || '-'}</td>
                      <td style={{ padding:'0.7rem 0.75rem', fontSize:'0.8rem', color:'var(--text-secondary)' }}>{unitName(r.unit_id)}</td>
                      <td style={{ padding:'0.7rem 0.75rem' }}>
                        <span style={{ background:r.jenis==='Sakit'?'#fee2e2':r.jenis==='Cuti'?'#ede9fe':'#dbeafe', color:r.jenis==='Sakit'?'#b91c1c':r.jenis==='Cuti'?'#7c3aed':'#1e40af', padding:'0.15rem 0.55rem', borderRadius:999, fontSize:'0.75rem', fontWeight:600 }}>{r.jenis}</span>
                      </td>
                      <td style={{ padding:'0.7rem 0.75rem', whiteSpace:'nowrap' }}>{fmt(r.tanggal_mulai)}</td>
                      <td style={{ padding:'0.7rem 0.75rem', whiteSpace:'nowrap' }}>{fmt(r.tanggal_selesai)}</td>
                      <td style={{ padding:'0.7rem 0.75rem', textAlign:'center', fontWeight:700 }}>{durasi}h</td>
                      <td style={{ padding:'0.7rem 0.75rem', maxWidth:200, fontSize:'0.82rem', color:'var(--text-secondary)' }}>{r.alasan||'-'}</td>
                      <td style={{ padding:'0.7rem 0.75rem' }}><SBadge s={r.status}/></td>
                      <td style={{ padding:'0.7rem 0.75rem' }}>
                        {isAdmin && r.status === 'Pending' && (
                          <div style={{ display:'flex', gap:'0.35rem' }}>
                            <button onClick={()=>{ setApproveModal({id:r.id,action:'Approved'}); setCatatan(''); }}
                              style={{ background:'#d1fae5', border:'none', borderRadius:'0.35rem', padding:'0.3rem 0.55rem', cursor:'pointer', color:'#047857', display:'flex', alignItems:'center', gap:3 }}><CheckCircle2 size={13}/>Setuju</button>
                            <button onClick={()=>{ setApproveModal({id:r.id,action:'Rejected'}); setCatatan(''); }}
                              style={{ background:'#fee2e2', border:'none', borderRadius:'0.35rem', padding:'0.3rem 0.55rem', cursor:'pointer', color:'#b91c1c', display:'flex', alignItems:'center', gap:3 }}><XCircle size={13}/>Tolak</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal form pengajuan */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth:480 }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem' }}>
              <h2 style={{ fontWeight:700, fontSize:'1.1rem', margin:0 }}>Ajukan Izin / Cuti</h2>
              <button onClick={()=>setModal(false)} style={{ background:'none', border:'none', cursor:'pointer' }}><X size={20}/></button>
            </div>
            <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:'0.85rem' }}>
              <div>
                <label style={{ fontSize:'0.82rem', fontWeight:600, display:'block', marginBottom:'0.3rem' }}>Unit / Cabang *</label>
                <select required value={form.unit_id} onChange={e=>setForm(f=>({...f,unit_id:e.target.value}))} style={inp}>
                  <option value="">-- Pilih Unit --</option>
                  {units.map(u=><option key={u.id} value={u.id}>{u.nama}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize:'0.82rem', fontWeight:600, display:'block', marginBottom:'0.3rem' }}>Jenis *</label>
                <select required value={form.jenis} onChange={e=>setForm(f=>({...f,jenis:e.target.value}))} style={inp}>
                  {JENIS.map(j=><option key={j} value={j}>{j}</option>)}
                </select>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.65rem' }}>
                <div>
                  <label style={{ fontSize:'0.82rem', fontWeight:600, display:'block', marginBottom:'0.3rem' }}>Dari *</label>
                  <input type="date" required value={form.tanggal_mulai} onChange={e=>setForm(f=>({...f,tanggal_mulai:e.target.value}))} style={inp}/>
                </div>
                <div>
                  <label style={{ fontSize:'0.82rem', fontWeight:600, display:'block', marginBottom:'0.3rem' }}>Sampai *</label>
                  <input type="date" required value={form.tanggal_selesai} min={form.tanggal_mulai} onChange={e=>setForm(f=>({...f,tanggal_selesai:e.target.value}))} style={inp}/>
                </div>
              </div>
              <div>
                <label style={{ fontSize:'0.82rem', fontWeight:600, display:'block', marginBottom:'0.3rem' }}>Alasan</label>
                <textarea rows={3} value={form.alasan} onChange={e=>setForm(f=>({...f,alasan:e.target.value}))} placeholder="Ceritakan alasan..." style={{ ...inp, resize:'vertical' }}/>
              </div>
              <div style={{ display:'flex', gap:'0.65rem', justifyContent:'flex-end' }}>
                <button type="button" className="btn" onClick={()=>setModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary">Kirim Pengajuan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal approve/reject */}
      {approveModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth:400 }} onClick={e=>e.stopPropagation()}>
            <h2 style={{ fontWeight:700, fontSize:'1.1rem', marginBottom:'1rem' }}>
              {approveModal.action === 'Approved' ? '✅ Setujui Pengajuan' : '❌ Tolak Pengajuan'}
            </h2>
            <div style={{ marginBottom:'1rem' }}>
              <label style={{ fontSize:'0.82rem', fontWeight:600, display:'block', marginBottom:'0.3rem' }}>Catatan Admin (opsional)</label>
              <textarea rows={3} value={catatan} onChange={e=>setCatatan(e.target.value)} placeholder="Catatan untuk pemohon..." style={{ ...inp, resize:'vertical' }}/>
            </div>
            <div style={{ display:'flex', gap:'0.65rem', justifyContent:'flex-end' }}>
              <button className="btn" onClick={()=>setApproveModal(null)}>Batal</button>
              <button className="btn" style={{ background: approveModal.action==='Approved'?'#047857':'#b91c1c', color:'#fff' }}
                onClick={()=>handleApprove(approveModal.id, approveModal.action)}>
                Konfirmasi {approveModal.action==='Approved'?'Setuju':'Tolak'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
