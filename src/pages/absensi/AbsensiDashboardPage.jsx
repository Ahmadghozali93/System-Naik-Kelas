import { useState, useEffect, useMemo } from 'react';
import { Users, CheckCircle2, Clock, AlertCircle, XCircle, Eye, UserX, ShirtIcon, Search, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/authStore';

const todayWIB = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
const fmtTime  = (ts) => ts ? new Date(ts).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }) : '-';
const fmtTgl   = (d)  => d  ? new Date(d+'T12:00:00').toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long', year:'numeric' }) : '-';

const BADGE   = { Hadir:['#d1fae5','#047857'], Telat:['#fef3c7','#92400e'], Izin:['#dbeafe','#1e40af'], Alpha:['#fee2e2','#b91c1c'] };
const DISPLAY = { Hadir:'Hadir', Telat:'Telat', Izin:'Izin', Alpha:'Mangkir' };
const SBadge  = ({s}) => { const [bg,c]=BADGE[s]||['#f3f4f6','#374151']; return <span style={{background:bg,color:c,padding:'0.18rem 0.6rem',borderRadius:999,fontSize:'0.75rem',fontWeight:700}}>{DISPLAY[s]||s}</span>; };

const SeragamBadge = ({v}) => {
  if (!v) return <span style={{color:'var(--text-secondary)',fontSize:'0.75rem'}}>—</span>;
  const ok = v === 'Sesuai';
  return <span style={{background:ok?'#d1fae5':'#fee2e2',color:ok?'#047857':'#b91c1c',padding:'0.18rem 0.6rem',borderRadius:999,fontSize:'0.75rem',fontWeight:700}}>{v}</span>;
};

const Card = ({ label, value, color, icon: Icon }) => (
  <div className="glass-card" style={{ padding:'1.25rem 1.5rem' }}>
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
      <span style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.07em' }}>{label}</span>
      {Icon && <Icon size={18} style={{ color: color||'var(--text-secondary)', opacity:0.6 }} />}
    </div>
    <div style={{ fontSize:'2.2rem', fontWeight:800, color:color||'var(--text-primary)', lineHeight:1.1, marginTop:'0.35rem' }}>{value}</div>
  </div>
);

export default function AbsensiDashboardPage() {
  const { user }  = useAuth();
  const isPrivileged = ['Owner', 'Administrator', 'Supervisor'].includes(user?.role);

  const [tanggal, setTanggal]         = useState(todayWIB());
  const [attendances, setAttendances] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [fotoModal, setFotoModal]     = useState(null);
  const [markingAlpha, setMarkingAlpha] = useState(false);
  const [savingId, setSavingId]       = useState(null);
  const [catatanDraft, setCatatanDraft] = useState({});
  const [search, setSearch]           = useState('');
  const [filterRole, setFilterRole]   = useState('');
  const [filterShift, setFilterShift] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const fetchData = async () => {
    setLoading(true);
    let query = supabase
      .from('attendances')
      .select('*, gurus(nama, role), shift_schedules!shift_schedule_id(*, shifts(nama, jam_mulai, jam_selesai))')
      .eq('tanggal', tanggal);
    if (!isPrivileged && user?.id) {
      query = query.eq('guru_id', user.id);
    }
    const { data } = await query;
    setAttendances(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [tanggal, isPrivileged]);

  const handleMarkAlpha = async () => {
    if (!window.confirm('Tandai semua karyawan yang tidak absen kemarin sebagai Mangkir?\nProses ini tidak bisa dibatalkan.')) return;
    setMarkingAlpha(true);
    const { data, error } = await supabase.rpc('mark_alpha_attendance');
    setMarkingAlpha(false);
    if (error) return alert('Gagal: ' + error.message);
    alert(`Selesai. ${data ?? 0} karyawan ditandai Mangkir.`);
    fetchData();
  };

  const handleSeragam = async (id, nilai) => {
    setSavingId(id);
    const cur = attendances.find(a => a.id === id)?.seragam;
    const next = cur === nilai ? null : nilai;
    const { error, count } = await supabase
      .from('attendances')
      .update({ seragam: next }, { count: 'exact' })
      .eq('id', id);
    setSavingId(null);
    if (error) return alert('Gagal simpan seragam: ' + error.message);
    if (count === 0) return alert('Seragam tidak tersimpan.\nPastikan SQL migration sudah dijalankan:\nsupabase_attendance_seragam.sql');
    setAttendances(prev => prev.map(a => a.id === id ? { ...a, seragam: next } : a));
  };

  const handleCatatanSave = async (id) => {
    const val = catatanDraft[id];
    if (val === undefined) return; // tidak ada perubahan
    setSavingId(id + '_catatan');
    const { error } = await supabase.from('attendances').update({ catatan: val || null }).eq('id', id);
    setSavingId(null);
    if (error) { alert('Gagal: ' + error.message); return; }
    setAttendances(prev => prev.map(a => a.id === id ? { ...a, catatan: val || null } : a));
    setCatatanDraft(prev => { const d = { ...prev }; delete d[id]; return d; });
  };

  const allRoles  = useMemo(() => [...new Set(attendances.map(a => a.gurus?.role).filter(Boolean))].sort(), [attendances]);
  const allShifts = useMemo(() => [...new Set(attendances.map(a => a.shift_schedules?.shifts?.nama).filter(Boolean))].sort(), [attendances]);

  const filtered = useMemo(() => attendances.filter(a => {
    const q = search.toLowerCase();
    if (search       && !a.gurus?.nama?.toLowerCase().includes(q)) return false;
    if (filterRole   && a.gurus?.role !== filterRole) return false;
    if (filterShift === '__none__' && a.shift_schedules?.shifts) return false;
    if (filterShift && filterShift !== '__none__' && a.shift_schedules?.shifts?.nama !== filterShift) return false;
    if (filterStatus && a.status !== filterStatus) return false;
    return true;
  }), [attendances, search, filterRole, filterShift, filterStatus]);

  const hasFilter = search || filterRole || filterShift || filterStatus;
  const resetFilter = () => { setSearch(''); setFilterRole(''); setFilterShift(''); setFilterStatus(''); };

  const stats = useMemo(() => {
    const c = { Hadir:0, Telat:0, Izin:0, Alpha:0, seragamOk:0, seragamTidak:0 };
    filtered.forEach(a => {
      if (c[a.status] !== undefined) c[a.status]++;
      if (a.seragam === 'Sesuai')       c.seragamOk++;
      if (a.seragam === 'Tidak Sesuai') c.seragamTidak++;
    });
    return c;
  }, [filtered]);

  const getShiftLabel = (a) => {
    const s = a.shift_schedules?.shifts;
    if (!s) return 'Tanpa Shift';
    return `${s.nama} (${s.jam_mulai?.slice(0,5)}–${s.jam_selesai?.slice(0,5)})`;
  };

  return (
    <div>
      <div style={{ marginBottom:'1.5rem' }}>
        <p style={{ fontSize:'0.78rem', color:'var(--text-secondary)', margin:0, textTransform:'uppercase', letterSpacing:'0.05em' }}>Absensi</p>
        <h1 style={{ fontSize:'1.6rem', fontWeight:700, margin:0 }}>Dashboard Absensi</h1>
      </div>

      {/* Filter tanggal */}
      <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', marginBottom:'1.25rem', flexWrap:'wrap' }}>
        <label style={{ fontWeight:600, fontSize:'0.88rem' }}>Tanggal:</label>
        <input type="date" value={tanggal} onChange={e=>setTanggal(e.target.value)}
          style={{ padding:'0.5rem 0.75rem', borderRadius:'0.5rem', border:'1px solid var(--glass-border)', background:'var(--surface-color)', fontFamily:'inherit' }} />
        <span style={{ color:'var(--text-secondary)', fontSize:'0.88rem' }}>{fmtTgl(tanggal)}</span>
        <div style={{ marginLeft:'auto', display:'flex', gap:'0.5rem' }}>
          {isPrivileged && (
            <button className="btn" style={{ fontSize:'0.82rem', display:'flex', alignItems:'center', gap:'0.4rem', color:'#b91c1c', borderColor:'#fca5a5' }}
              onClick={handleMarkAlpha} disabled={markingAlpha}>
              <UserX size={14}/> {markingAlpha ? 'Memproses...' : 'Tandai Mangkir'}
            </button>
          )}
          <button className="btn" style={{ fontSize:'0.82rem' }} onClick={fetchData}>Refresh</button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:'0.85rem', marginBottom:'1.5rem' }}>
        <Card label="Hadir"           value={stats.Hadir}       color="#047857" icon={CheckCircle2} />
        <Card label="Telat"           value={stats.Telat}       color="#92400e" icon={Clock} />
        <Card label="Izin"            value={stats.Izin}        color="#1e40af" icon={AlertCircle} />
        <Card label="Mangkir"         value={stats.Alpha}       color="#b91c1c" icon={XCircle} />
        <Card label="Seragam Sesuai"  value={stats.seragamOk}   color="#047857" icon={ShirtIcon} />
        <Card label="Tidak Sesuai"    value={stats.seragamTidak} color="#d97706" icon={ShirtIcon} />
      </div>

      {/* Filter bar */}
      {!loading && attendances.length > 0 && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:'0.5rem', marginBottom:'1rem', alignItems:'center' }}>
          <div style={{ position:'relative', flex:'1', minWidth:160 }}>
            <Search size={14} style={{ position:'absolute', left:'0.7rem', top:'50%', transform:'translateY(-50%)', color:'var(--text-secondary)', pointerEvents:'none' }}/>
            <input
              value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Cari nama..."
              style={{ width:'100%', boxSizing:'border-box', paddingLeft:'2.1rem', padding:'0.5rem 0.75rem 0.5rem 2.1rem', borderRadius:'0.5rem', border:'1px solid var(--glass-border)', background:'var(--surface-color)', fontFamily:'inherit', fontSize:'0.85rem' }}
            />
          </div>
          <select value={filterRole} onChange={e=>setFilterRole(e.target.value)}
            style={{ padding:'0.5rem 0.75rem', borderRadius:'0.5rem', border:'1px solid var(--glass-border)', background:'var(--surface-color)', fontFamily:'inherit', fontSize:'0.85rem' }}>
            <option value="">Semua Role</option>
            {allRoles.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <select value={filterShift} onChange={e=>setFilterShift(e.target.value)}
            style={{ padding:'0.5rem 0.75rem', borderRadius:'0.5rem', border:'1px solid var(--glass-border)', background:'var(--surface-color)', fontFamily:'inherit', fontSize:'0.85rem' }}>
            <option value="">Semua Shift</option>
            {allShifts.map(s => <option key={s} value={s}>{s}</option>)}
            <option value="__none__">Tanpa Shift</option>
          </select>
          <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}
            style={{ padding:'0.5rem 0.75rem', borderRadius:'0.5rem', border:'1px solid var(--glass-border)', background:'var(--surface-color)', fontFamily:'inherit', fontSize:'0.85rem' }}>
            <option value="">Semua Status</option>
            <option value="Hadir">Hadir</option>
            <option value="Telat">Telat</option>
            <option value="Izin">Izin</option>
            <option value="Alpha">Mangkir</option>
          </select>
          {hasFilter && (
            <button onClick={resetFilter}
              style={{ display:'flex', alignItems:'center', gap:'0.35rem', background:'none', border:'1px solid var(--glass-border)', borderRadius:'0.5rem', padding:'0.5rem 0.75rem', cursor:'pointer', fontSize:'0.82rem', color:'var(--text-secondary)', whiteSpace:'nowrap' }}>
              <X size={13}/> Reset
            </button>
          )}
          {hasFilter && (
            <span style={{ fontSize:'0.8rem', color:'var(--text-secondary)', whiteSpace:'nowrap' }}>
              {filtered.length} dari {attendances.length}
            </span>
          )}
        </div>
      )}

      {loading ? <p style={{ color:'var(--text-secondary)' }}>Memuat...</p> : (
        attendances.length === 0 ? (
          <div className="glass-card" style={{ padding:'3rem', textAlign:'center', color:'var(--text-secondary)' }}>
            <Users size={40} style={{ opacity:0.3, marginBottom:'0.75rem' }} />
            <p style={{ fontWeight:600 }}>Belum ada data absensi untuk tanggal ini</p>
          </div>
        ) : (
          <div className="glass-card" style={{ padding:'1.5rem' }}>
            {filtered.length === 0 ? (
              <div style={{ textAlign:'center', padding:'2rem', color:'var(--text-secondary)' }}>
                <p style={{ fontWeight:600 }}>Tidak ada data sesuai filter.</p>
              </div>
            ) : (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.84rem' }}>
                <thead>
                  <tr style={{ borderBottom:'2px solid var(--glass-border)', background:'rgba(79,70,229,0.04)' }}>
                    {['No','Nama','Role','Shift','Check-in','Check-out','Status','Seragam','Catatan','Foto'].map(h => (
                      <th key={h} style={{ padding:'0.6rem 0.75rem', textAlign:'left', fontWeight:700, fontSize:'0.72rem', color:'var(--text-secondary)', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a, i) => {
                    const isSaving      = savingId === a.id;
                    const isSavingCatat = savingId === a.id + '_catatan';
                    const draftCatatan  = catatanDraft[a.id] !== undefined ? catatanDraft[a.id] : (a.catatan || '');
                    return (
                      <tr key={a.id} style={{ borderBottom:'1px solid var(--glass-border)', verticalAlign:'middle' }}
                        onMouseOver={e=>e.currentTarget.style.background='rgba(79,70,229,0.03)'}
                        onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                        <td style={{ padding:'0.7rem 0.75rem', color:'var(--text-secondary)' }}>{i+1}</td>
                        <td style={{ padding:'0.7rem 0.75rem', fontWeight:600 }}>{a.gurus?.nama || '-'}</td>
                        <td style={{ padding:'0.7rem 0.75rem', color:'var(--text-secondary)', fontSize:'0.8rem' }}>{a.gurus?.role || '-'}</td>
                        <td style={{ padding:'0.7rem 0.75rem', color:'var(--text-secondary)', fontSize:'0.8rem', whiteSpace:'nowrap' }}>{getShiftLabel(a)}</td>
                        <td style={{ padding:'0.7rem 0.75rem', fontWeight:600, color:'var(--primary)' }}>{fmtTime(a.check_in)}</td>
                        <td style={{ padding:'0.7rem 0.75rem', color:'var(--text-secondary)' }}>{fmtTime(a.check_out)}</td>
                        <td style={{ padding:'0.7rem 0.75rem' }}><SBadge s={a.status} /></td>

                        {/* Seragam */}
                        <td style={{ padding:'0.5rem 0.75rem', whiteSpace:'nowrap' }}>
                          {isPrivileged ? (
                            <div style={{ display:'flex', gap:'0.3rem' }}>
                              <button
                                disabled={isSaving}
                                onClick={()=>handleSeragam(a.id,'Sesuai')}
                                style={{
                                  padding:'0.22rem 0.6rem', borderRadius:'2rem', fontSize:'0.72rem', fontWeight:700, cursor:'pointer', border:'1.5px solid',
                                  borderColor: a.seragam==='Sesuai' ? '#047857' : 'var(--glass-border)',
                                  background:  a.seragam==='Sesuai' ? '#d1fae5' : 'transparent',
                                  color:       a.seragam==='Sesuai' ? '#047857' : 'var(--text-secondary)',
                                  transition:'all 0.12s',
                                }}>
                                Sesuai
                              </button>
                              <button
                                disabled={isSaving}
                                onClick={()=>handleSeragam(a.id,'Tidak Sesuai')}
                                style={{
                                  padding:'0.22rem 0.6rem', borderRadius:'2rem', fontSize:'0.72rem', fontWeight:700, cursor:'pointer', border:'1.5px solid',
                                  borderColor: a.seragam==='Tidak Sesuai' ? '#b91c1c' : 'var(--glass-border)',
                                  background:  a.seragam==='Tidak Sesuai' ? '#fee2e2' : 'transparent',
                                  color:       a.seragam==='Tidak Sesuai' ? '#b91c1c' : 'var(--text-secondary)',
                                  transition:'all 0.12s',
                                }}>
                                Tidak
                              </button>
                            </div>
                          ) : (
                            <SeragamBadge v={a.seragam} />
                          )}
                        </td>

                        {/* Catatan */}
                        <td style={{ padding:'0.4rem 0.75rem', minWidth:160 }}>
                          {isPrivileged ? (
                            <input
                              value={draftCatatan}
                              onChange={e => setCatatanDraft(p => ({ ...p, [a.id]: e.target.value }))}
                              onBlur={()=>handleCatatanSave(a.id)}
                              onKeyDown={e=>{ if(e.key==='Enter') e.target.blur(); }}
                              placeholder="Tulis catatan..."
                              style={{
                                width:'100%', boxSizing:'border-box',
                                padding:'0.3rem 0.5rem', borderRadius:'0.4rem',
                                border:`1px solid ${isSavingCatat ? 'var(--primary)' : 'var(--glass-border)'}`,
                                background:'var(--surface-color)', fontFamily:'inherit', fontSize:'0.78rem',
                              }}
                            />
                          ) : (
                            <span style={{ fontSize:'0.8rem', color: a.catatan ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                              {a.catatan || '—'}
                            </span>
                          )}
                        </td>

                        {/* Foto */}
                        <td style={{ padding:'0.7rem 0.75rem' }}>
                          <div style={{ display:'flex', gap:'0.35rem' }}>
                            {a.foto_checkin  && <button onClick={()=>setFotoModal(a.foto_checkin)}  title="Foto Check-in"  style={{ background:'rgba(79,70,229,0.1)',border:'none',borderRadius:'0.35rem',padding:'0.25rem 0.5rem',cursor:'pointer',fontSize:'0.72rem',color:'var(--primary)',display:'flex',alignItems:'center',gap:3 }}><Eye size={12}/>In</button>}
                            {a.foto_checkout && <button onClick={()=>setFotoModal(a.foto_checkout)} title="Foto Check-out" style={{ background:'rgba(16,185,129,0.1)',border:'none',borderRadius:'0.35rem',padding:'0.25rem 0.5rem',cursor:'pointer',fontSize:'0.72rem',color:'#047857',display:'flex',alignItems:'center',gap:3 }}><Eye size={12}/>Out</button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            )}
          </div>
        )
      )}

      {/* Modal foto */}
      {fotoModal && (
        <div className="modal-overlay" onClick={()=>setFotoModal(null)}>
          <div onClick={e=>e.stopPropagation()} style={{ background:'#fff', borderRadius:'1rem', padding:'1rem', maxWidth:480, width:'90%', margin:'auto' }}>
            <img src={fotoModal} alt="Foto Absensi" style={{ width:'100%', borderRadius:'0.5rem', display:'block' }} />
            <button className="btn" style={{ width:'100%', marginTop:'0.75rem' }} onClick={()=>setFotoModal(null)}>Tutup</button>
          </div>
        </div>
      )}
    </div>
  );
}
