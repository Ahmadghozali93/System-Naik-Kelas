import { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, X, ChevronLeft, ChevronRight, CalendarClock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/authStore';

const todayWIB  = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
const addDays   = (d, n) => { const x = new Date(d+'T12:00:00'); x.setDate(x.getDate()+n); return x.toISOString().split('T')[0]; };
const fmtTgl    = (d)    => new Date(d+'T12:00:00').toLocaleDateString('id-ID',{ weekday:'short', day:'numeric', month:'short' });
const HARI      = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
const HARI_FULL = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const DOW_ORDER = [1,2,3,4,5,6,0]; // Senin duluan

const inp = { padding:'0.55rem 0.75rem', borderRadius:'0.5rem', border:'1px solid var(--glass-border)', background:'var(--surface-color)', fontFamily:'inherit', fontSize:'0.88rem', width:'100%', boxSizing:'border-box' };

const weekDates = (startDate) => Array.from({length:7}, (_,i) => addDays(startDate, i));

// Semua tanggal dalam rentang, group by day-of-week
const buildRows = (dari, sampai, dayShifts) => {
  const rows = [];
  let cur = dari;
  while (cur <= sampai) {
    const dow = new Date(cur+'T12:00:00').getDay();
    const shiftIds = dayShifts[dow] || [];
    for (const shift_id of shiftIds) {
      rows.push({ tanggal: cur, shift_id });
    }
    cur = addDays(cur, 1);
  }
  return rows;
};

const emptyDayShifts = () => ({ 0:[], 1:[], 2:[], 3:[], 4:[], 5:[], 6:[] });

export default function ShiftSchedulePage() {
  const { user } = useAuth();
  const isAdmin = ['Owner', 'Administrator', 'Supervisor'].includes(user?.role);
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Jakarta'}));
    d.setDate(d.getDate() - d.getDay() + 1);
    return d.toISOString().split('T')[0];
  });

  const [schedules, setSchedules] = useState([]);
  const [shifts, setShifts]       = useState([]);
  const [gurus, setGurus]         = useState([]);
  const [units, setUnits]         = useState([]);
  const [guruUnits, setGuruUnits] = useState([]);
  const [loading, setLoading]     = useState(true);

  // modal single (dari klik "+ shift" di cell)
  const [modal, setModal] = useState(false);
  const [form, setForm]   = useState({ guru_id:'', shift_id:'', tanggal:'', catatan:'' });

  // modal template mingguan
  const [tmplModal, setTmplModal]   = useState(false);
  const [tmplSaving, setTmplSaving] = useState(false);
  const [tmpl, setTmpl] = useState({
    guru_id: '',
    dari: todayWIB(),
    sampai: addDays(todayWIB(), 27), // default 4 minggu
    dayShifts: emptyDayShifts(),
  });

  const [filterGuru, setFilterGuru] = useState('');

  const dates   = weekDates(weekStart);
  const weekEnd = dates[6];

  const fetchData = async () => {
    setLoading(true);
    const [ssRes, shRes, gRes, uRes, guRes] = await Promise.all([
      supabase.from('shift_schedules').select('*, shifts(*, units(nama))')
        .gte('tanggal', weekStart).lte('tanggal', weekEnd),
      supabase.from('shifts').select('*, units(nama)').eq('aktif', true).order('jam_mulai'),
      supabase.from('gurus').select('id, nama, role').eq('status','Aktif').order('nama'),
      supabase.from('units').select('*').eq('aktif',true).order('nama'),
      supabase.from('guru_units').select('*'),
    ]);
    setSchedules(ssRes.data  || []);
    setShifts(shRes.data     || []);
    setGurus(gRes.data       || []);
    setUnits(uRes.data       || []);
    setGuruUnits(guRes.data  || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [weekStart]);

  // --- Single assign ---
  const handleSave = async (e) => {
    e.preventDefault();
    const { error } = await supabase.from('shift_schedules').insert({
      guru_id: form.guru_id, shift_id: form.shift_id,
      tanggal: form.tanggal, catatan: form.catatan || null,
    });
    if (error) return alert('Gagal: ' + (error.code==='23505' ? 'Jadwal sudah ada.' : error.message));
    setModal(false); fetchData();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Hapus jadwal shift ini?')) return;
    await supabase.from('shift_schedules').delete().eq('id', id);
    fetchData();
  };

  // --- Template mingguan ---
  const toggleDayShift = (dow, shift_id) => {
    setTmpl(t => {
      const cur = t.dayShifts[dow] || [];
      const next = cur.includes(shift_id) ? cur.filter(s=>s!==shift_id) : [...cur, shift_id];
      return { ...t, dayShifts: { ...t.dayShifts, [dow]: next } };
    });
  };

  const totalPreview = useMemo(() => {
    if (!tmpl.guru_id || !tmpl.dari || !tmpl.sampai) return 0;
    return buildRows(tmpl.dari, tmpl.sampai, tmpl.dayShifts).length;
  }, [tmpl]);

  const handleTmplSave = async (e) => {
    e.preventDefault();
    if (!tmpl.guru_id) return alert('Pilih karyawan.');
    if (tmpl.dari > tmpl.sampai) return alert('Tanggal tidak valid.');
    if (totalPreview === 0) return alert('Tidak ada shift yang dipilih untuk hari manapun.');

    setTmplSaving(true);
    const rows = buildRows(tmpl.dari, tmpl.sampai, tmpl.dayShifts)
      .map(r => ({ guru_id: tmpl.guru_id, shift_id: r.shift_id, tanggal: r.tanggal }));

    const { error } = await supabase.from('shift_schedules')
      .upsert(rows, { onConflict: 'guru_id,shift_id,tanggal', ignoreDuplicates: true });

    setTmplSaving(false);
    if (error) return alert('Gagal: ' + error.message);
    setTmplModal(false);
    fetchData();
  };

  const scheduleMap = useMemo(() => {
    const m = {};
    schedules.forEach(ss => {
      const key = `${ss.guru_id}::${ss.tanggal}`;
      if (!m[key]) m[key] = [];
      m[key].push(ss);
    });
    return m;
  }, [schedules]);

  const displayGurus = filterGuru ? gurus.filter(g=>g.id===filterGuru) : gurus;
  const selectedGuru = gurus.find(g=>g.id===tmpl.guru_id);

  // Shift yang tersedia untuk karyawan yang dipilih (hanya unit yg terdaftar)
  const allowedUnitIds = tmpl.guru_id
    ? guruUnits.filter(gu => String(gu.guru_id) === String(tmpl.guru_id)).map(gu => String(gu.unit_id))
    : [];
  const shiftsForGuru = tmpl.guru_id
    ? shifts.filter(s => allowedUnitIds.includes(String(s.unit_id)))
    : shifts;

  return (
    <div>
      <div style={{ marginBottom:'1.5rem' }}>
        <p style={{ fontSize:'0.78rem', color:'var(--text-secondary)', margin:0, textTransform:'uppercase', letterSpacing:'0.05em' }}>Absensi</p>
        <h1 style={{ fontSize:'1.6rem', fontWeight:700, margin:0 }}>Jadwal Shift</h1>
      </div>

      {/* Toolbar */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem', flexWrap:'wrap', gap:'0.75rem' }}>
        <div style={{ display:'flex', gap:'0.5rem', alignItems:'center' }}>
          <button className="btn" onClick={()=>setWeekStart(addDays(weekStart,-7))}><ChevronLeft size={16}/></button>
          <span style={{ fontWeight:600, fontSize:'0.9rem', minWidth:180, textAlign:'center' }}>
            {fmtTgl(dates[0])} – {fmtTgl(dates[6])}
          </span>
          <button className="btn" onClick={()=>setWeekStart(addDays(weekStart,7))}><ChevronRight size={16}/></button>
          <button className="btn" style={{ fontSize:'0.8rem' }} onClick={()=>{ const d=new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Jakarta'})); d.setDate(d.getDate()-d.getDay()+1); setWeekStart(d.toISOString().split('T')[0]); }}>Minggu Ini</button>
        </div>
        <div style={{ display:'flex', gap:'0.65rem', flexWrap:'wrap', alignItems:'center' }}>
          <select value={filterGuru} onChange={e=>setFilterGuru(e.target.value)} style={{ ...inp, width:'auto' }}>
            <option value="">Semua Karyawan</option>
            {gurus.map(g=><option key={g.id} value={g.id}>{g.nama}</option>)}
          </select>
          {isAdmin && (
            <button className="btn btn-primary"
              onClick={()=>{ setTmpl({guru_id:'',dari:todayWIB(),sampai:addDays(todayWIB(),27),dayShifts:emptyDayShifts()}); setTmplModal(true); }}
              style={{ display:'flex', alignItems:'center', gap:'0.4rem' }}>
              <CalendarClock size={15}/> Atur Jadwal Mingguan
            </button>
          )}
        </div>
      </div>

      {/* Grid mingguan */}
      {loading ? <p style={{ color:'var(--text-secondary)' }}>Memuat...</p> : (
        <div className="glass-card" style={{ padding:'1rem', overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.82rem', minWidth:700 }}>
            <thead>
              <tr style={{ borderBottom:'2px solid var(--glass-border)', background:'rgba(79,70,229,0.04)' }}>
                <th style={{ padding:'0.65rem 0.75rem', textAlign:'left', fontWeight:700, fontSize:'0.72rem', color:'var(--text-secondary)', minWidth:140 }}>KARYAWAN</th>
                {dates.map(d => {
                  const isToday = d === todayWIB();
                  const dow = new Date(d+'T12:00:00').getDay();
                  return (
                    <th key={d} style={{ padding:'0.65rem 0.5rem', textAlign:'center', fontWeight:700, fontSize:'0.72rem', color:isToday?'var(--primary)':'var(--text-secondary)', minWidth:90, background:isToday?'rgba(79,70,229,0.06)':undefined }}>
                      <div>{HARI[dow]}</div>
                      <div style={{ fontSize:'0.85rem', fontWeight:isToday?800:600 }}>{new Date(d+'T12:00:00').getDate()}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {displayGurus.length === 0 ? (
                <tr><td colSpan={8} style={{ padding:'2rem', textAlign:'center', color:'var(--text-secondary)' }}>Tidak ada karyawan.</td></tr>
              ) : displayGurus.map(g => (
                <tr key={g.id} style={{ borderBottom:'1px solid var(--glass-border)' }}>
                  <td style={{ padding:'0.7rem 0.75rem' }}>
                    <div style={{ fontWeight:600 }}>{g.nama}</div>
                    <div style={{ fontSize:'0.75rem', color:'var(--text-secondary)' }}>{g.role}</div>
                  </td>
                  {dates.map(d => {
                    const key = `${g.id}::${d}`;
                    const ssList = scheduleMap[key] || [];
                    const isToday = d === todayWIB();
                    return (
                      <td key={d} style={{ padding:'0.4rem', verticalAlign:'top', background:isToday?'rgba(79,70,229,0.03)':undefined }}>
                        {ssList.map(ss => (
                          <div key={ss.id} style={{ background:'rgba(79,70,229,0.1)', borderRadius:'0.35rem', padding:'0.2rem 0.4rem', marginBottom:'0.2rem', fontSize:'0.72rem', display:'flex', justifyContent:'space-between', alignItems:'center', gap:'0.25rem' }}>
                            <span style={{ fontWeight:600, color:'var(--primary)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                              {ss.shifts?.nama}<br/>
                              <span style={{ fontWeight:400, color:'var(--text-secondary)' }}>{ss.shifts?.jam_mulai}–{ss.shifts?.jam_selesai}</span>
                            </span>
                            {isAdmin && (
                              <button onClick={()=>handleDelete(ss.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'#ef4444', padding:'0 2px', flexShrink:0 }}><Trash2 size={11}/></button>
                            )}
                          </div>
                        ))}
                        {isAdmin && (
                          <button onClick={()=>{ setForm({guru_id:g.id,shift_id:'',tanggal:d,catatan:''}); setModal(true); }}
                            style={{ background:'none', border:'1px dashed var(--glass-border)', borderRadius:'0.35rem', padding:'0.15rem 0.35rem', cursor:'pointer', fontSize:'0.68rem', color:'var(--text-secondary)', width:'100%', marginTop:ssList.length?'0.2rem':0 }}>
                            + shift
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ===== MODAL SINGLE ASSIGN ===== */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth:420 }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem' }}>
              <h2 style={{ fontWeight:700, fontSize:'1.1rem', margin:0 }}>Tambah Shift</h2>
              <button onClick={()=>setModal(false)} style={{ background:'none', border:'none', cursor:'pointer' }}><X size={20}/></button>
            </div>
            <form onSubmit={handleSave} style={{ display:'flex', flexDirection:'column', gap:'0.85rem' }}>
              <div>
                <label style={{ fontSize:'0.82rem', fontWeight:600, display:'block', marginBottom:'0.3rem' }}>Karyawan *</label>
                <select required value={form.guru_id} onChange={e=>setForm(f=>({...f,guru_id:e.target.value}))} style={inp}>
                  <option value="">-- Pilih Karyawan --</option>
                  {gurus.map(g=><option key={g.id} value={g.id}>{g.nama}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize:'0.82rem', fontWeight:600, display:'block', marginBottom:'0.3rem' }}>Tanggal *</label>
                <input type="date" required value={form.tanggal} onChange={e=>setForm(f=>({...f,tanggal:e.target.value}))} style={inp}/>
              </div>
              <div>
                <label style={{ fontSize:'0.82rem', fontWeight:600, display:'block', marginBottom:'0.3rem' }}>Shift *</label>
                <select required value={form.shift_id} onChange={e=>setForm(f=>({...f,shift_id:e.target.value}))} style={inp}>
                  <option value="">-- Pilih Shift --</option>
                  {shifts.map(s=><option key={s.id} value={s.id}>{s.units?.nama} · {s.nama} ({s.jam_mulai}–{s.jam_selesai})</option>)}
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

      {/* ===== MODAL TEMPLATE MINGGUAN ===== */}
      {tmplModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth:620 }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.25rem' }}>
              <h2 style={{ fontWeight:700, fontSize:'1.1rem', margin:0 }}>Atur Jadwal Mingguan</h2>
              <button onClick={()=>setTmplModal(false)} style={{ background:'none', border:'none', cursor:'pointer' }}><X size={20}/></button>
            </div>

            <form onSubmit={handleTmplSave} style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>

              {/* Pilih karyawan */}
              <div>
                <label style={{ fontSize:'0.82rem', fontWeight:600, display:'block', marginBottom:'0.3rem' }}>Karyawan *</label>
                <select required value={tmpl.guru_id} onChange={e=>setTmpl(t=>({...t,guru_id:e.target.value}))} style={inp}>
                  <option value="">-- Pilih Karyawan --</option>
                  {gurus.map(g=><option key={g.id} value={g.id}>{g.nama} ({g.role})</option>)}
                </select>
              </div>

              {/* Rentang tanggal */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.65rem' }}>
                <div>
                  <label style={{ fontSize:'0.82rem', fontWeight:600, display:'block', marginBottom:'0.3rem' }}>Berlaku Dari *</label>
                  <input type="date" required value={tmpl.dari} onChange={e=>setTmpl(t=>({...t,dari:e.target.value}))} style={inp}/>
                </div>
                <div>
                  <label style={{ fontSize:'0.82rem', fontWeight:600, display:'block', marginBottom:'0.3rem' }}>Sampai *</label>
                  <input type="date" required value={tmpl.sampai} min={tmpl.dari} onChange={e=>setTmpl(t=>({...t,sampai:e.target.value}))} style={inp}/>
                </div>
              </div>

              {/* Grid hari × shift */}
              <div>
                <label style={{ fontSize:'0.82rem', fontWeight:600, display:'block', marginBottom:'0.6rem' }}>
                  Shift per Hari — centang shift yang berlaku tiap hari
                </label>
                <div style={{ border:'1px solid var(--glass-border)', borderRadius:'0.6rem', overflow:'hidden' }}>
                  {DOW_ORDER.map((dow, idx) => {
                    const selectedShifts = tmpl.dayShifts[dow] || [];
                    const isLast = idx === DOW_ORDER.length - 1;
                    return (
                      <div key={dow} style={{
                        display:'grid', gridTemplateColumns:'110px 1fr',
                        borderBottom: isLast ? 'none' : '1px solid var(--glass-border)',
                        background: selectedShifts.length > 0 ? 'rgba(79,70,229,0.04)' : undefined,
                      }}>
                        {/* Label hari */}
                        <div style={{ padding:'0.65rem 0.85rem', fontWeight:700, fontSize:'0.85rem', borderRight:'1px solid var(--glass-border)', display:'flex', alignItems:'center', color: selectedShifts.length>0?'var(--primary)':'var(--text-primary)' }}>
                          {HARI_FULL[dow]}
                          {selectedShifts.length > 0 && (
                            <span style={{ marginLeft:'0.4rem', background:'var(--primary)', color:'#fff', borderRadius:999, fontSize:'0.65rem', padding:'0 0.35rem', fontWeight:700 }}>{selectedShifts.length}</span>
                          )}
                        </div>
                        {/* Shift checkboxes */}
                        <div style={{ padding:'0.5rem 0.75rem', display:'flex', flexWrap:'wrap', gap:'0.4rem', alignItems:'center' }}>
                          {shiftsForGuru.length === 0 ? (
                            <span style={{ fontSize:'0.8rem', color:'var(--text-secondary)' }}>
                              {tmpl.guru_id && allowedUnitIds.length === 0
                                ? '⚠️ Karyawan belum didaftarkan ke unit manapun. Atur dulu di Master Shift → Unit Karyawan.'
                                : 'Belum ada shift aktif untuk unit karyawan ini.'}
                            </span>
                          ) : shiftsForGuru.map(s => {
                            const checked = selectedShifts.includes(s.id);
                            return (
                              <button key={s.id} type="button"
                                onClick={()=>toggleDayShift(dow, s.id)}
                                style={{
                                  padding:'0.25rem 0.65rem', borderRadius:'2rem', fontSize:'0.78rem', fontWeight:600,
                                  border:`1.5px solid ${checked?'var(--primary)':'var(--glass-border)'}`,
                                  background: checked?'var(--primary)':'transparent',
                                  color: checked?'#fff':'var(--text-secondary)',
                                  cursor:'pointer', transition:'all 0.12s', whiteSpace:'nowrap',
                                }}>
                                {s.units?.nama && (
                                  <span style={{ opacity:0.65, marginRight:'0.3rem', fontWeight:500, fontSize:'0.72rem' }}>
                                    [{s.units.nama}]
                                  </span>
                                )}
                                {s.nama}
                                <span style={{ opacity:0.75, marginLeft:'0.3rem', fontWeight:400 }}>
                                  {s.jam_mulai.slice(0,5)}–{s.jam_selesai.slice(0,5)}
                                </span>
                              </button>
                            );
                          })}
                          {selectedShifts.length > 0 && (
                            <button type="button" onClick={()=>setTmpl(t=>({...t,dayShifts:{...t.dayShifts,[dow]:[]}}))
                            } style={{ background:'none', border:'none', cursor:'pointer', color:'#ef4444', fontSize:'0.75rem', fontWeight:600, padding:'0 0.25rem' }}>
                              Hapus
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Preview */}
              {tmpl.guru_id && totalPreview > 0 && (
                <div style={{ background:'rgba(79,70,229,0.06)', border:'1px solid rgba(79,70,229,0.2)', borderRadius:'0.5rem', padding:'0.65rem 1rem', fontSize:'0.84rem' }}>
                  Akan membuat <strong style={{ color:'var(--primary)' }}>{totalPreview} jadwal</strong> untuk <strong>{selectedGuru?.nama}</strong>. Jadwal yang sudah ada tidak akan tertimpa.
                </div>
              )}

              <div style={{ display:'flex', gap:'0.65rem', justifyContent:'flex-end' }}>
                <button type="button" className="btn" onClick={()=>setTmplModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary" disabled={tmplSaving || totalPreview===0}>
                  {tmplSaving ? 'Menyimpan...' : `Simpan ${totalPreview>0?`(${totalPreview} jadwal)`:''}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
