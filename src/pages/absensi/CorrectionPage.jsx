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

    // Tautkan absen otomatis dari tanggal (jangan andalkan pilihan manual —
    // ini yang dulu bikin attendance_id kosong padahal absennya ada)
    const linkedAtt = myAtt.find(a => a.tanggal === form.tanggal);

    const { error } = await supabase.from('attendance_corrections').insert({
      guru_id: user.id,
      attendance_id: linkedAtt?.id || form.attendance_id || null,
      unit_id: form.unit_id,
      tanggal: form.tanggal,
      check_in_koreksi:  wibToISO(form.tanggal, form.check_in_koreksi)  || null,
      check_out_koreksi: wibToISO(form.tanggal, form.check_out_koreksi) || null,
      alasan: form.alasan,
    });
    if (error) return alert('Gagal: ' + error.message);
    setModal(false); fetchAll();
  };

  const calcStatus = (checkInISO, shift) => {
    if (!checkInISO || !shift) return 'Hadir';
    const ci = new Date(checkInISO);
    const [h, m] = (shift.jam_mulai || '00:00').split(':').map(Number);
    const base = new Date(ci); base.setHours(h, m, 0, 0);
    return (ci - base) / 60000 <= (shift.toleransi_menit || 0) ? 'Hadir' : 'Telat';
  };

  const calcDurasi = (ci, co, lintas) => {
    if (!ci || !co) return null;
    let d = (new Date(co) - new Date(ci)) / 60000;
    if (lintas && d < 0) d += 1440;
    return Math.max(0, Math.round(d));
  };

  // Pesan bila update/insert ditolak aturan akses (RLS) — tidak memunculkan error,
  // hanya 0 baris terpengaruh, jadi harus dicek manual.
  const RLS_MSG = 'Absen tidak berubah karena ditolak aturan akses (RLS).\n\n'
    + 'Jalankan file fix_attendances_rls_koreksi.sql di Supabase SQL Editor, '
    + 'atau pastikan unit absen tersebut termasuk unit Anda.';

  // Terapkan isi koreksi ke data absen. Dipakai saat Approve & Terapkan Ulang.
  // Return: { ok: boolean, msg: string }
  const applyCorrection = async (corr) => {
    const newCI = corr.check_in_koreksi;
    const newCO = corr.check_out_koreksi;

    if (!newCI && !newCO) {
      return { ok: false, msg: 'Koreksi ini tidak berisi jam check-in maupun check-out, jadi tidak ada yang bisa diterapkan.' };
    }

    // Cari absen target. Jangan hanya andalkan attendance_id (kolomnya opsional
    // saat pengajuan) — cari juga berdasarkan guru + tanggal.
    let att = null;

    if (corr.attendance_id) {
      const { data } = await supabase
        .from('attendances')
        .select('*, shift_schedules!shift_schedule_id(*, shifts(*))')
        .eq('id', corr.attendance_id)
        .maybeSingle();
      att = data || null;
    }
    if (!att) {
      const { data } = await supabase
        .from('attendances')
        .select('*, shift_schedules!shift_schedule_id(*, shifts(*))')
        .eq('guru_id', corr.guru_id)
        .eq('tanggal', corr.tanggal)
        .order('check_in', { ascending: true })
        .limit(1);
      att = data?.[0] || null;
    }

    // ── Absen sudah ada → UPDATE ──
    if (att) {
      const shift   = att.shift_schedules?.shifts;
      const ciFinal = newCI || att.check_in;
      const coFinal = newCO || att.check_out;
      const status  = ciFinal ? calcStatus(ciFinal, shift) : 'Alpha';
      const durasi  = calcDurasi(ciFinal, coFinal, shift?.lintas_hari);

      const updates = { status };
      if (newCI) updates.check_in = newCI;
      if (newCO) updates.check_out = newCO;
      if (durasi !== null) updates.durasi_menit = durasi;

      const { data: updated, error } = await supabase
        .from('attendances').update(updates).eq('id', att.id).select('id');
      if (error) return { ok: false, msg: 'Gagal update absen: ' + error.message };
      if (!updated?.length) return { ok: false, msg: RLS_MSG };
      return { ok: true, msg: 'Absen berhasil diperbarui.' };
    }

    // ── Belum ada absen → INSERT (butuh jam check-in) ──
    if (!newCI) {
      return { ok: false, msg: 'Koreksi ini hanya berisi jam check-out, tapi belum ada data absen untuk tanggal tersebut.\n\n'
        + 'Isi juga jam check-in agar absen bisa dibuat.' };
    }

    const { data: ss } = await supabase
      .from('shift_schedules')
      .select('*, shifts(*)')
      .eq('guru_id', corr.guru_id)
      .eq('tanggal', corr.tanggal)
      .maybeSingle();

    const shift  = ss?.shifts;
    const status = calcStatus(newCI, shift);
    const durasi = calcDurasi(newCI, newCO, shift?.lintas_hari);

    const { data: inserted, error } = await supabase.from('attendances').insert({
      guru_id:           corr.guru_id,
      unit_id:           corr.unit_id,
      shift_schedule_id: ss?.id || null,
      tanggal:           corr.tanggal,
      check_in:          newCI,
      check_out:         newCO || null,
      durasi_menit:      durasi,
      status,
    }).select('id');
    if (error) return { ok: false, msg: 'Gagal buat absen: ' + error.message };
    if (!inserted?.length) return { ok: false, msg: RLS_MSG };
    return { ok: true, msg: 'Absen baru berhasil dibuat.' };
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
  // Absen milik pengaju pada tanggal yang dipilih (ditautkan otomatis)
  const matchedAtt = myAtt.find(a => a.tanggal === form.tanggal) || null;

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
              <div style={{
                background: matchedAtt ? 'rgba(4,120,87,0.06)' : '#fef3c7',
                border: `1px solid ${matchedAtt ? 'rgba(4,120,87,0.25)' : '#fcd34d'}`,
                borderRadius:'0.5rem', padding:'0.7rem 0.85rem', fontSize:'0.8rem',
                color: matchedAtt ? '#047857' : '#92400e', lineHeight:1.5,
              }}>
                {matchedAtt ? (
                  <>
                    <strong>Absen ditemukan untuk {fmtTgl(form.tanggal)}</strong><br/>
                    Saat ini: Check-in <strong>{fmtTime(matchedAtt.check_in)}</strong> · Check-out <strong>{fmtTime(matchedAtt.check_out)}</strong>.<br/>
                    Absen ini yang akan <strong>diperbarui</strong> saat koreksi disetujui.
                  </>
                ) : (
                  <>
                    <strong>Belum ada absen di tanggal {fmtTgl(form.tanggal) || '—'}</strong><br/>
                    Absen <strong>baru akan dibuat</strong> saat koreksi disetujui. Pastikan jam check-in diisi.
                  </>
                )}
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.65rem' }}>
                <div>
                  <label style={{ fontSize:'0.82rem', fontWeight:600, display:'block', marginBottom:'0.3rem' }}>Tanggal *</label>
                  <input type="date" required value={form.tanggal}
                    onChange={e=>{
                      const tgl = e.target.value;
                      const a = myAtt.find(x => x.tanggal === tgl);
                      // Tautkan absen + unit otomatis berdasarkan tanggal
                      setForm(f=>({ ...f, tanggal: tgl, attendance_id: a?.id || '', unit_id: a?.unit_id || f.unit_id }));
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
