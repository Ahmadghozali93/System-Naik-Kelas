import { useState, useEffect } from 'react';
import { Plus, X, CheckCircle2, XCircle, Edit } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/authStore';

const todayWIB  = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
const fmtTgl    = (d)  => d  ? new Date(d+'T12:00:00').toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : '-';
const fmtTime   = (ts) => ts ? new Date(ts).toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit'}) : '-';

const BADGE = { Pending:['#fef3c7','#92400e'], Approved:['#d1fae5','#047857'], Rejected:['#fee2e2','#b91c1c'] };
const SBadge = ({s}) => { const [bg,c]=BADGE[s]||['#f3f4f6','#374151']; return <span style={{background:bg,color:c,padding:'0.18rem 0.65rem',borderRadius:999,fontSize:'0.75rem',fontWeight:700}}>{s}</span>; };

const inp = { padding:'0.55rem 0.75rem', borderRadius:'0.5rem', border:'1px solid var(--glass-border)', background:'var(--surface-color)', fontFamily:'inherit', fontSize:'0.88rem', width:'100%', boxSizing:'border-box' };

export default function CorrectionPage() {
  const { user } = useAuth();
  const isAdmin  = user?.role === 'Admin';

  const [corrections, setCorrections] = useState([]);
  const [units, setUnits]             = useState([]);
  const [myAtt, setMyAtt]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [modal, setModal]             = useState(false);
  const [approveModal, setApproveModal] = useState(null);
  const [filterStatus, setFilterStatus] = useState('');

  const [form, setForm] = useState({
    attendance_id: '', unit_id: '', tanggal: todayWIB(),
    check_in_koreksi: '', check_out_koreksi: '', alasan: '',
  });

  const fetchAll = async () => {
    setLoading(true);
    const [cRes, uRes, aRes] = await Promise.all([
      supabase.from('attendance_corrections').select('*, gurus!guru_id(nama)').order('created_at',{ascending:false}),
      supabase.from('units').select('*').eq('aktif',true).order('nama'),
      supabase.from('attendances').select('*').eq('guru_id', user?.id || '').order('tanggal',{ascending:false}).limit(60),
    ]);
    setCorrections(cRes.data || []);
    setUnits(uRes.data       || []);
    setMyAtt(aRes.data       || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, [user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.alasan.trim()) return alert('Alasan wajib diisi.');
    if (!form.unit_id) return alert('Pilih unit.');

    const wibToISO = (tgl, timeStr) => {
      if (!timeStr) return null;
      return new Date(`${tgl}T${timeStr}:00+07:00`).toISOString();
    };

    const { error } = await supabase.from('attendance_corrections').insert({
      guru_id: user.id,
      attendance_id: form.attendance_id || null,
      unit_id: form.unit_id,
      tanggal: form.tanggal,
      check_in_koreksi:  wibToISO(form.tanggal, form.check_in_koreksi)  || null,
      check_out_koreksi: wibToISO(form.tanggal, form.check_out_koreksi) || null,
      alasan: form.alasan,
    });
    if (error) return alert('Gagal: ' + error.message);
    setModal(false); fetchAll();
  };

  const handleApprove = async (id, action) => {
    const corr = corrections.find(c => c.id === id);

    // Jika Approved → terapkan koreksi ke attendances
    if (action === 'Approved' && corr) {
      const updates = {};
      if (corr.check_in_koreksi)  updates.check_in  = corr.check_in_koreksi;
      if (corr.check_out_koreksi) updates.check_out = corr.check_out_koreksi;

      if (corr.attendance_id && Object.keys(updates).length > 0) {
        await supabase.from('attendances').update(updates).eq('id', corr.attendance_id);
      }
    }

    const { error } = await supabase.from('attendance_corrections').update({
      status: action, disetujui_oleh: user.id,
    }).eq('id', id);
    if (error) return alert('Gagal: ' + error.message);
    setApproveModal(null); fetchAll();
  };

  const filtered = filterStatus ? corrections.filter(c => c.status === filterStatus) : corrections;
  const unitName = (id) => units.find(u=>u.id===id)?.nama || id;

  return (
    <div>
      <div style={{ marginBottom:'1.5rem' }}>
        <p style={{ fontSize:'0.78rem', color:'var(--text-secondary)', margin:0, textTransform:'uppercase', letterSpacing:'0.05em' }}>Absensi</p>
        <h1 style={{ fontSize:'1.6rem', fontWeight:700, margin:0 }}>Koreksi Absen</h1>
      </div>

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem', flexWrap:'wrap', gap:'0.65rem' }}>
        <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{ ...inp, width:'auto' }}>
          <option value="">Semua Status</option>
          {['Pending','Approved','Rejected'].map(s=><option key={s} value={s}>{s}</option>)}
        </select>
        <button className="btn btn-primary" onClick={()=>{ setForm({attendance_id:'',unit_id:'',tanggal:todayWIB(),check_in_koreksi:'',check_out_koreksi:'',alasan:''}); setModal(true); }}>
          <Plus size={16}/> Ajukan Koreksi
        </button>
      </div>

      <div className="glass-card" style={{ padding:'1.5rem' }}>
        {loading ? <p style={{ color:'var(--text-secondary)' }}>Memuat...</p> : filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:'3rem', color:'var(--text-secondary)' }}>
            <Edit size={40} style={{ opacity:0.3, marginBottom:'0.75rem' }} />
            <p>Belum ada pengajuan koreksi absen.</p>
          </div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.84rem' }}>
              <thead>
                <tr style={{ borderBottom:'2px solid var(--glass-border)', background:'rgba(79,70,229,0.04)' }}>
                  {['No','Nama','Unit','Tanggal','Check-in Koreksi','Check-out Koreksi','Alasan','Status','Aksi'].map(h=>(
                    <th key={h} style={{ padding:'0.65rem 0.75rem', textAlign:'left', fontWeight:700, fontSize:'0.72rem', color:'var(--text-secondary)', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c,i) => (
                  <tr key={c.id} style={{ borderBottom:'1px solid var(--glass-border)' }}
                    onMouseOver={e=>e.currentTarget.style.background='rgba(79,70,229,0.03)'}
                    onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                    <td style={{ padding:'0.7rem 0.75rem', color:'var(--text-secondary)' }}>{i+1}</td>
                    <td style={{ padding:'0.7rem 0.75rem', fontWeight:600 }}>{c.gurus?.nama||'-'}</td>
                    <td style={{ padding:'0.7rem 0.75rem', fontSize:'0.8rem', color:'var(--text-secondary)' }}>{unitName(c.unit_id)}</td>
                    <td style={{ padding:'0.7rem 0.75rem', whiteSpace:'nowrap' }}>{fmtTgl(c.tanggal)}</td>
                    <td style={{ padding:'0.7rem 0.75rem', fontWeight:600, color:'var(--primary)' }}>{fmtTime(c.check_in_koreksi)}</td>
                    <td style={{ padding:'0.7rem 0.75rem' }}>{fmtTime(c.check_out_koreksi)}</td>
                    <td style={{ padding:'0.7rem 0.75rem', maxWidth:200, fontSize:'0.82rem', color:'var(--text-secondary)' }}>{c.alasan}</td>
                    <td style={{ padding:'0.7rem 0.75rem' }}><SBadge s={c.status}/></td>
                    <td style={{ padding:'0.7rem 0.75rem' }}>
                      {isAdmin && c.status === 'Pending' && (
                        <div style={{ display:'flex', gap:'0.35rem' }}>
                          <button onClick={()=>setApproveModal({id:c.id,action:'Approved'})} style={{ background:'#d1fae5',border:'none',borderRadius:'0.35rem',padding:'0.3rem 0.55rem',cursor:'pointer',color:'#047857',display:'flex',alignItems:'center',gap:3 }}><CheckCircle2 size={13}/>Setuju</button>
                          <button onClick={()=>setApproveModal({id:c.id,action:'Rejected'})} style={{ background:'#fee2e2',border:'none',borderRadius:'0.35rem',padding:'0.3rem 0.55rem',cursor:'pointer',color:'#b91c1c',display:'flex',alignItems:'center',gap:3 }}><XCircle size={13}/>Tolak</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal pengajuan */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth:500 }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem' }}>
              <h2 style={{ fontWeight:700, fontSize:'1.1rem', margin:0 }}>Ajukan Koreksi Absen</h2>
              <button onClick={()=>setModal(false)} style={{ background:'none',border:'none',cursor:'pointer' }}><X size={20}/></button>
            </div>
            <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:'0.85rem' }}>
              <div>
                <label style={{ fontSize:'0.82rem', fontWeight:600, display:'block', marginBottom:'0.3rem' }}>Absen yang Dikoreksi (opsional)</label>
                <select value={form.attendance_id} onChange={e=>{ const a=myAtt.find(x=>x.id===e.target.value); setForm(f=>({...f,attendance_id:e.target.value,tanggal:a?.tanggal||f.tanggal,unit_id:a?.unit_id||f.unit_id})); }} style={inp}>
                  <option value="">-- Pilih absen (opsional, bisa kosong) --</option>
                  {myAtt.map(a=><option key={a.id} value={a.id}>{fmtTgl(a.tanggal)} · CI:{fmtTime(a.check_in)} CO:{fmtTime(a.check_out)}</option>)}
                </select>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.65rem' }}>
                <div>
                  <label style={{ fontSize:'0.82rem', fontWeight:600, display:'block', marginBottom:'0.3rem' }}>Tanggal *</label>
                  <input type="date" required value={form.tanggal} onChange={e=>setForm(f=>({...f,tanggal:e.target.value}))} style={inp}/>
                </div>
                <div>
                  <label style={{ fontSize:'0.82rem', fontWeight:600, display:'block', marginBottom:'0.3rem' }}>Unit *</label>
                  <select required value={form.unit_id} onChange={e=>setForm(f=>({...f,unit_id:e.target.value}))} style={inp}>
                    <option value="">-- Pilih Unit --</option>
                    {units.map(u=><option key={u.id} value={u.id}>{u.nama}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.65rem' }}>
                <div>
                  <label style={{ fontSize:'0.82rem', fontWeight:600, display:'block', marginBottom:'0.3rem' }}>Check-in yang Benar (WIB)</label>
                  <input type="time" value={form.check_in_koreksi} onChange={e=>setForm(f=>({...f,check_in_koreksi:e.target.value}))} style={inp}/>
                </div>
                <div>
                  <label style={{ fontSize:'0.82rem', fontWeight:600, display:'block', marginBottom:'0.3rem' }}>Check-out yang Benar (WIB)</label>
                  <input type="time" value={form.check_out_koreksi} onChange={e=>setForm(f=>({...f,check_out_koreksi:e.target.value}))} style={inp}/>
                </div>
              </div>
              <div>
                <label style={{ fontSize:'0.82rem', fontWeight:600, display:'block', marginBottom:'0.3rem' }}>Alasan Koreksi *</label>
                <textarea required rows={3} value={form.alasan} onChange={e=>setForm(f=>({...f,alasan:e.target.value}))} placeholder="Jelaskan kenapa perlu dikoreksi..." style={{ ...inp, resize:'vertical' }}/>
              </div>
              <div style={{ display:'flex', gap:'0.65rem', justifyContent:'flex-end' }}>
                <button type="button" className="btn" onClick={()=>setModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary">Kirim Koreksi</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal approve */}
      {approveModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth:380 }} onClick={e=>e.stopPropagation()}>
            <h2 style={{ fontWeight:700, margin:'0 0 1rem' }}>{approveModal.action==='Approved'?'✅ Setujui':'❌ Tolak'} Koreksi</h2>
            {approveModal.action==='Approved' && <p style={{ fontSize:'0.85rem', color:'var(--text-secondary)', marginTop:0 }}>Data absen asli akan diperbarui sesuai koreksi yang diajukan.</p>}
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
