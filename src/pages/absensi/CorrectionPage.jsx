import { useState, useEffect } from 'react';
import { Plus, X, CheckCircle2, XCircle, Edit, RefreshCw } from 'lucide-react';
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
  const isAdmin  = ['Owner', 'Administrator', 'Supervisor'].includes(user?.role);

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
      supabase.from('attendances')
        .select('*, shift_schedules!shift_schedule_id(shifts(nama, jam_mulai, jam_selesai))')
        .eq('guru_id', user?.id || '').order('tanggal',{ascending:false}).limit(60),
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

    // Wajib pilih absen kalau di tanggal itu ADA absen (cegah nyasar ke shift lain)
    const attList = myAtt.filter(a => a.tanggal === form.tanggal);
    if (attList.length > 0 && !form.attendance_id) {
      return alert(attList.length > 1
        ? `Tanggal ini punya ${attList.length} shift. Pilih dulu absen/shift mana yang mau dikoreksi.`
        : 'Pilih dulu absen yang mau dikoreksi.');
    }

    const wibToISO = (tgl, timeStr) => {
      if (!timeStr) return null;
      return new Date(`${tgl}T${timeStr}:00+07:00`).toISOString();
    };

    const { error } = await supabase.from('attendance_corrections').insert({
      guru_id: user.id,
      attendance_id: form.attendance_id || null,   // absen yang DIPILIH pengaju
      unit_id: form.unit_id,
      tanggal: form.tanggal,
      check_in_koreksi:  wibToISO(form.tanggal, form.check_in_koreksi)  || null,
      check_out_koreksi: wibToISO(form.tanggal, form.check_out_koreksi) || null,
      alasan: form.alasan,
    });
    if (error) return alert('Gagal: ' + error.message);
    setModal(false); fetchAll();
  };

  // Terapkan isi koreksi ke data absen lewat fungsi server (RPC) yang berjalan
  // dengan hak penuh (bypass RLS, tapi tetap cek admin). Ini menghindari
  // kegagalan senyap saat RLS attendances memblokir dari sisi browser.
  // Return: { ok: boolean, msg: string }
  const applyCorrection = async (corr) => {
    const { data, error } = await supabase.rpc('apply_attendance_correction', { p_correction_id: corr.id });
    if (error) {
      // Fungsi belum dipasang di database
      if (/apply_attendance_correction|function|does not exist|schema cache/i.test(error.message)) {
        return { ok: false, msg: 'Fungsi server belum terpasang. Jalankan fix_apply_correction_rpc.sql di Supabase SQL Editor.' };
      }
      return { ok: false, msg: error.message };
    }
    return { ok: true, msg: data === 'inserted' ? 'Absen baru berhasil dibuat.' : 'Absen berhasil diperbarui.' };
  };

  const handleApprove = async (id, action) => {
    const corr = corrections.find(c => c.id === id);

    if (action === 'Approved' && corr) {
      const res = await applyCorrection(corr);
      // Jangan tandai Approved kalau absennya gagal diterapkan
      if (!res.ok) return alert('Gagal: ' + res.msg);
    }

    const { error } = await supabase.from('attendance_corrections').update({
      status: action, disetujui_oleh: user.id,
    }).eq('id', id);
    if (error) return alert('Gagal: ' + error.message);
    setApproveModal(null); fetchAll();
  };

  // Terapkan ulang koreksi yang sudah Approved tapi absennya belum berubah
  const handleReapply = async (corr) => {
    if (!window.confirm('Terapkan ulang koreksi ini ke data absen?')) return;
    const res = await applyCorrection(corr);
    alert(res.ok ? '✅ ' + res.msg : '❌ Gagal: ' + res.msg);
    if (res.ok) fetchAll();
  };

  const filtered = filterStatus ? corrections.filter(c => c.status === filterStatus) : corrections;
  const unitName = (id) => units.find(u=>u.id===id)?.nama || id;
  const shiftLabel = (a) => a?.shift_schedules?.shifts?.nama || 'Tanpa shift';
  // Daftar absen pengaju pada tanggal terpilih (bisa >1 kalau banyak shift)
  const attForDate = myAtt.filter(a => a.tanggal === form.tanggal);
  // Absen yang dipilih untuk dikoreksi
  const selectedAtt = myAtt.find(a => a.id === form.attendance_id) || null;

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
                      {isAdmin && c.status === 'Approved' && (
                        <button onClick={()=>handleReapply(c)}
                          title="Terapkan ulang koreksi ini ke data absen (kalau absen belum berubah)"
                          style={{ background:'rgba(79,70,229,0.1)',border:'none',borderRadius:'0.35rem',padding:'0.3rem 0.55rem',cursor:'pointer',color:'var(--primary)',display:'flex',alignItems:'center',gap:3,whiteSpace:'nowrap',fontSize:'0.78rem',fontFamily:'inherit',fontWeight:600 }}>
                          <RefreshCw size={12}/> Terapkan Ulang
                        </button>
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
              {/* Absen ditautkan OTOMATIS dari tanggal — tidak lagi dipilih manual,
                  supaya attendance_id tidak pernah kosong saat absennya sebenarnya ada. */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.65rem' }}>
                <div>
                  <label style={{ fontSize:'0.82rem', fontWeight:600, display:'block', marginBottom:'0.3rem' }}>Tanggal *</label>
                  <input type="date" required value={form.tanggal}
                    onChange={e=>{
                      const tgl = e.target.value;
                      const list = myAtt.filter(x => x.tanggal === tgl);
                      // Reset pilihan absen; kalau cuma 1 absen, langsung pilih otomatis
                      const only = list.length === 1 ? list[0] : null;
                      setForm(f=>({ ...f, tanggal: tgl, attendance_id: only?.id || '', unit_id: only?.unit_id || f.unit_id }));
                    }}
                    style={inp}/>
                </div>
                <div>
                  <label style={{ fontSize:'0.82rem', fontWeight:600, display:'block', marginBottom:'0.3rem' }}>Unit *</label>
                  <select required value={form.unit_id} onChange={e=>setForm(f=>({...f,unit_id:e.target.value}))} style={inp}>
                    <option value="">-- Pilih Unit --</option>
                    {units.map(u=><option key={u.id} value={u.id}>{u.nama}</option>)}
                  </select>
                </div>
              </div>

              {/* Pilih ABSEN/SHIFT yang mau dikoreksi — wajib bila ada absen di tanggal itu.
                  Ini mencegah pengajuan "nyasar" ke shift yang salah pada hari multi-shift. */}
              <div>
                <label style={{ fontSize:'0.82rem', fontWeight:600, display:'block', marginBottom:'0.3rem' }}>
                  Absen / Shift yang Dikoreksi {attForDate.length > 0 ? '*' : ''}
                </label>
                {attForDate.length === 0 ? (
                  <div style={{ background:'#fef3c7', border:'1px solid #fcd34d', borderRadius:'0.5rem', padding:'0.7rem 0.85rem', fontSize:'0.8rem', color:'#92400e', lineHeight:1.5 }}>
                    Belum ada absen di tanggal {fmtTgl(form.tanggal) || '—'}. Absen <strong>baru akan dibuat</strong> saat koreksi disetujui — pastikan jam check-in diisi.
                  </div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:'0.4rem' }}>
                    {attForDate.map(a => {
                      const dipilih = form.attendance_id === a.id;
                      return (
                        <button key={a.id} type="button"
                          onClick={()=>setForm(f=>({ ...f, attendance_id: a.id, unit_id: a.unit_id || f.unit_id }))}
                          style={{
                            textAlign:'left', cursor:'pointer', fontFamily:'inherit',
                            display:'flex', alignItems:'center', gap:'0.6rem',
                            border:`1.5px solid ${dipilih ? 'var(--primary)' : 'var(--glass-border)'}`,
                            background: dipilih ? 'rgba(79,70,229,0.06)' : 'var(--surface-color)',
                            borderRadius:'0.5rem', padding:'0.6rem 0.75rem',
                          }}>
                          <span style={{ width:16, height:16, borderRadius:'50%', flexShrink:0,
                            border:`4px solid ${dipilih ? 'var(--primary)' : 'var(--glass-border)'}`,
                            background: dipilih ? 'var(--primary)' : 'transparent' }} />
                          <span style={{ flex:1 }}>
                            <span style={{ fontWeight:700, fontSize:'0.86rem' }}>{shiftLabel(a)}</span>
                            <span style={{ display:'block', fontSize:'0.78rem', color:'var(--text-secondary)', marginTop:'0.1rem' }}>
                              Check-in {fmtTime(a.check_in)} · Check-out {fmtTime(a.check_out)} · <span style={{ fontWeight:600 }}>{a.status}</span>
                            </span>
                          </span>
                        </button>
                      );
                    })}
                    {attForDate.length > 1 && !form.attendance_id && (
                      <span style={{ fontSize:'0.75rem', color:'#b45309' }}>
                        ⚠️ Hari ini punya {attForDate.length} shift — pilih dulu absen mana yang dikoreksi.
                      </span>
                    )}
                  </div>
                )}
              </div>

              {selectedAtt && (
                <div style={{ background:'rgba(4,120,87,0.06)', border:'1px solid rgba(4,120,87,0.25)', borderRadius:'0.5rem', padding:'0.6rem 0.85rem', fontSize:'0.8rem', color:'#047857', lineHeight:1.5 }}>
                  Absen <strong>{shiftLabel(selectedAtt)}</strong> ini yang akan <strong>diperbarui</strong> saat koreksi disetujui.
                </div>
              )}

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
