import { useState, useEffect, useMemo } from 'react';
import { Users, CheckCircle2, Clock, AlertCircle, XCircle, Eye, UserX } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/authStore';

const todayWIB = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
const fmtTime  = (ts) => ts ? new Date(ts).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }) : '-';
const fmtTgl   = (d)  => d  ? new Date(d+'T12:00:00').toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long', year:'numeric' }) : '-';

const BADGE = { Hadir:['#d1fae5','#047857'], Telat:['#fef3c7','#92400e'], Izin:['#dbeafe','#1e40af'], Alpha:['#fee2e2','#b91c1c'] };
const DISPLAY = { Hadir:'Hadir', Telat:'Telat', Izin:'Izin', Alpha:'Mangkir' };
const SBadge = ({s}) => { const [bg,c]=BADGE[s]||['#f3f4f6','#374151']; return <span style={{background:bg,color:c,padding:'0.18rem 0.6rem',borderRadius:999,fontSize:'0.75rem',fontWeight:700}}>{DISPLAY[s]||s}</span>; };

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
  const { user } = useAuth();
  const [tanggal, setTanggal]       = useState(todayWIB());
  const [attendances, setAttendances] = useState([]);
  const [shifts, setShifts]         = useState([]);
  const [gurus, setGurus]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [fotoModal, setFotoModal]   = useState(null);
  const [markingAlpha, setMarkingAlpha] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const [attRes, shiftRes, guruRes] = await Promise.all([
      supabase.from('attendances').select('*, gurus(nama, role)').eq('tanggal', tanggal),
      supabase.from('shifts').select('*'),
      supabase.from('gurus').select('id, nama, role').eq('status', 'Aktif'),
    ]);
    setAttendances(attRes.data || []);
    setShifts(shiftRes.data || []);
    setGurus(guruRes.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [tanggal]);

  const handleMarkAlpha = async () => {
    if (!window.confirm('Tandai semua karyawan yang tidak absen kemarin sebagai Mangkir?\nProses ini tidak bisa dibatalkan.')) return;
    setMarkingAlpha(true);
    const { data, error } = await supabase.rpc('mark_alpha_attendance');
    setMarkingAlpha(false);
    if (error) return alert('Gagal: ' + error.message);
    alert(`Selesai. ${data ?? 0} karyawan ditandai Mangkir.`);
    fetchData();
  };

  // Hitung statistik
  const stats = useMemo(() => {
    const counts = { Hadir:0, Telat:0, Izin:0, Alpha:0 };
    attendances.forEach(a => { if (counts[a.status] !== undefined) counts[a.status]++; });
    return counts;
  }, [attendances]);

  // Group by shift
  const byShift = useMemo(() => {
    const map = {};
    attendances.forEach(a => {
      const key = a.shift_schedule_id || 'tanpa-shift';
      if (!map[key]) map[key] = [];
      map[key].push(a);
    });
    return map;
  }, [attendances]);

  // Shift name lookup
  const shiftName = (scheduleId) => {
    const att = attendances.find(a => a.shift_schedule_id === scheduleId);
    if (!att) return 'Tanpa Shift';
    const s = shifts.find(sh => sh.id === att.shift_schedule_id);
    return s ? `${s.nama} (${s.jam_mulai}–${s.jam_selesai})` : 'Shift Tidak Dikenal';
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
          {user?.role === 'Admin' && (
            <button className="btn" style={{ fontSize:'0.82rem', display:'flex', alignItems:'center', gap:'0.4rem', color:'#b91c1c', borderColor:'#fca5a5' }}
              onClick={handleMarkAlpha} disabled={markingAlpha}>
              <UserX size={14}/> {markingAlpha ? 'Memproses...' : 'Tandai Mangkir'}
            </button>
          )}
          <button className="btn" style={{ fontSize:'0.82rem' }} onClick={fetchData}>Refresh</button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:'1rem', marginBottom:'1.5rem' }}>
        <Card label="Hadir"      value={stats.Hadir}  color="#047857" icon={CheckCircle2} />
        <Card label="Telat"      value={stats.Telat}  color="#92400e" icon={Clock} />
        <Card label="Izin"       value={stats.Izin}   color="#1e40af" icon={AlertCircle} />
        <Card label="Mangkir"    value={stats.Alpha}  color="#b91c1c" icon={XCircle} />
        <Card label="Total Tercatat" value={attendances.length} icon={Users} />
      </div>

      {loading ? <p style={{ color:'var(--text-secondary)' }}>Memuat...</p> : (
        attendances.length === 0 ? (
          <div className="glass-card" style={{ padding:'3rem', textAlign:'center', color:'var(--text-secondary)' }}>
            <Users size={40} style={{ opacity:0.3, marginBottom:'0.75rem' }} />
            <p style={{ fontWeight:600 }}>Belum ada data absensi untuk tanggal ini</p>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:'1.25rem' }}>
            {Object.entries(byShift).map(([key, rows]) => (
              <div key={key} className="glass-card" style={{ padding:'1.5rem' }}>
                <h3 style={{ fontWeight:700, fontSize:'0.95rem', marginBottom:'1rem', color:'var(--primary)', textTransform:'uppercase', letterSpacing:'0.05em' }}>
                  {key === 'tanpa-shift' ? 'Tanpa Jadwal Shift' : shiftName(key)}
                </h3>
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.84rem' }}>
                    <thead>
                      <tr style={{ borderBottom:'2px solid var(--glass-border)' }}>
                        {['No','Nama','Role','Check-in','Check-out','Status','Foto'].map(h => (
                          <th key={h} style={{ padding:'0.6rem 0.75rem', textAlign:'left', fontWeight:700, fontSize:'0.72rem', color:'var(--text-secondary)', whiteSpace:'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((a,i) => (
                        <tr key={a.id} style={{ borderBottom:'1px solid var(--glass-border)' }}
                          onMouseOver={e=>e.currentTarget.style.background='rgba(79,70,229,0.03)'}
                          onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                          <td style={{ padding:'0.7rem 0.75rem', color:'var(--text-secondary)' }}>{i+1}</td>
                          <td style={{ padding:'0.7rem 0.75rem', fontWeight:600 }}>{a.gurus?.nama || '-'}</td>
                          <td style={{ padding:'0.7rem 0.75rem', color:'var(--text-secondary)', fontSize:'0.8rem' }}>{a.gurus?.role || '-'}</td>
                          <td style={{ padding:'0.7rem 0.75rem', fontWeight:600, color:'var(--primary)' }}>{fmtTime(a.check_in)}</td>
                          <td style={{ padding:'0.7rem 0.75rem', color:'var(--text-secondary)' }}>{fmtTime(a.check_out)}</td>
                          <td style={{ padding:'0.7rem 0.75rem' }}><SBadge s={a.status} /></td>
                          <td style={{ padding:'0.7rem 0.75rem' }}>
                            <div style={{ display:'flex', gap:'0.35rem' }}>
                              {a.foto_checkin  && <button onClick={()=>setFotoModal(a.foto_checkin)}  title="Foto Check-in"  style={{ background:'rgba(79,70,229,0.1)',border:'none',borderRadius:'0.35rem',padding:'0.25rem 0.5rem',cursor:'pointer',fontSize:'0.72rem',color:'var(--primary)',display:'flex',alignItems:'center',gap:3 }}><Eye size={12}/>In</button>}
                              {a.foto_checkout && <button onClick={()=>setFotoModal(a.foto_checkout)} title="Foto Check-out" style={{ background:'rgba(16,185,129,0.1)',border:'none',borderRadius:'0.35rem',padding:'0.25rem 0.5rem',cursor:'pointer',fontSize:'0.72rem',color:'#047857',display:'flex',alignItems:'center',gap:3 }}><Eye size={12}/>Out</button>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
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
