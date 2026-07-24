import { useState, useEffect } from 'react';
import { Plus, X, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/authStore';

const todayWIB = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
const fmt      = (d) => d ? new Date(d+'T12:00:00').toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : '-';
const JENIS    = ['Izin','Sakit','Cuti'];

// Jenis izin — hanya muncul kalau jenis = 'Izin'.
// Tahap 1: tukar_shift & ganti_hari sama-sama tercatat "Izin".
// Tahap 2 nanti: tukar_shift jadi "jadwal dialihkan" (tanpa catatan absensi).
const SUB_JENIS = [
  { value:'tukar_shift',     label:'Tukar Shift',      ket:'Shift ditukar dengan guru lain — kelas tetap jalan' },
  { value:'ganti_hari',      label:'Ganti Hari',       ket:'Mengajar di hari lain sebagai gantinya' },
  { value:'tanpa_pengganti', label:'Tanpa Pengganti',  ket:'Kelas tidak jalan — bonus kehadiran hangus' },
];
const subLabel = (v) => SUB_JENIS.find(x=>x.value===v)?.label || '';

const BADGE = {
  Pending:  ['#fef3c7','#92400e'],
  Approved: ['#d1fae5','#047857'],
  Rejected: ['#fee2e2','#b91c1c'],
  'Menunggu Penyesuaian Shift': ['#e0e7ff','#4338ca'],
  Kedaluwarsa: ['#f3f4f6','#6b7280'],
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

  const [form, setForm] = useState({ unit_id:'', jenis:'Izin', sub_jenis:'tanpa_pengganti', tanggal_mulai:todayWIB(), tanggal_selesai:todayWIB(), alasan:'' });

  // Tahap 2 — rincian per shift (khusus jenis 'Izin')
  const [myShifts, setMyShifts]     = useState([]);   // jadwal milik pengaju
  const [allShifts, setAllShifts]   = useState([]);   // jadwal guru lain (untuk tukar shift, boleh lintas cabang)
  const [baris, setBaris]           = useState([]);
  const [cekBentrok, setCekBentrok] = useState({});   // { indexBaris: 'pesan' }
  const [kirim, setKirim]           = useState(false);

  // Minta SPV menata ulang shift (untuk shift yang terlalu besar)
  const [pyModal, setPyModal] = useState(false);
  const [pyForm, setPyForm]   = useState({ shift_schedule_id:'', keterangan:'' });

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

    // Jadwal shift 60 hari ke depan — untuk memilih shift yang diizinkan
    const dari = todayWIB();
    const { data: ss } = await supabase.from('shift_schedules')
      .select('id, guru_id, tanggal, dialihkan, shifts(id, nama, jam_mulai, jam_selesai, unit_id), gurus:guru_id(nama)')
      .gte('tanggal', dari).order('tanggal').limit(1500);
    const semua = (ss || []).filter(x => !x.dialihkan);
    setMyShifts(semua.filter(x => x.guru_id === user?.id));
    setAllShifts(semua.filter(x => x.guru_id !== user?.id));
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  // ── Baris rincian (khusus jenis 'Izin') ──
  const BARIS_KOSONG = { shift_schedule_id:'', jenis:'tanpa_pengganti',
    guru_pengganti_id:'', tukar_dengan_schedule_id:'', tanggal_pengganti:'' };

  const ubahBaris = (i, patch) => setBaris(b => b.map((x,idx) => idx===i ? {...x, ...patch} : x));
  const hapusBaris = (i) => { setBaris(b => b.filter((_,idx)=>idx!==i)); setCekBentrok({}); };

  const shiftById = (id) => [...myShifts, ...allShifts].find(x => x.id === id);

  // Periksa bentrok lewat fungsi database (shift sama + jam bertabrakan)
  const periksaBentrok = async (i, b) => {
    const asal = shiftById(b.shift_schedule_id);
    if (!asal) return null;
    let pesan = null;

    if (b.jenis === 'tukar_shift' && b.tukar_dengan_schedule_id) {
      const tujuan = shiftById(b.tukar_dengan_schedule_id);
      if (tujuan) {
        // Pengaju menerima shift guru lain
        const { data: p1 } = await supabase.rpc('cek_bentrok_jadwal',
          { p_guru_id: user.id, p_shift_id: tujuan.shifts.id, p_tanggal: tujuan.tanggal });
        // Guru lain menerima shift pengaju
        const { data: p2 } = await supabase.rpc('cek_bentrok_jadwal',
          { p_guru_id: tujuan.guru_id, p_shift_id: asal.shifts.id, p_tanggal: asal.tanggal });
        if (p1) pesan = 'Anda: ' + p1;
        else if (p2) pesan = (tujuan.gurus?.nama || 'Guru pengganti') + ': ' + p2;
      }
    } else if (b.jenis === 'ganti_hari' && b.tanggal_pengganti) {
      const { data: p } = await supabase.rpc('cek_bentrok_jadwal',
        { p_guru_id: user.id, p_shift_id: asal.shifts.id, p_tanggal: b.tanggal_pengganti });
      if (p) pesan = 'Anda: ' + p;
    }
    setCekBentrok(c => ({ ...c, [i]: pesan }));
    return pesan;
  };

  const kirimPenyesuaian = async () => {
    if (!pyForm.shift_schedule_id) return alert('Pilih shift yang mau ditata ulang.');
    if (!pyForm.keterangan.trim()) return alert('Jelaskan apa yang Anda inginkan (mis. "izin pagi saja").');
    const asal = myShifts.find(x => x.id === pyForm.shift_schedule_id);
    const { error } = await supabase.from('penyesuaian_shift').insert({
      guru_id: user.id, unit_id: asal?.shifts?.unit_id || null,
      shift_schedule_id: pyForm.shift_schedule_id, tanggal: asal?.tanggal,
      keterangan: pyForm.keterangan.trim(),
    });
    if (error) return alert('Gagal: ' + error.message);
    alert('Permintaan terkirim. SPV akan menata ulang jadwalnya. Setelah selesai, ajukan izin lagi dengan shift yang sudah dipecah.');
    setPyModal(false); setPyForm({ shift_schedule_id:'', keterangan:'' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.unit_id) return alert('Pilih unit/cabang.');

    // ── Cuti / Sakit: tetap berbasis rentang tanggal ──
    if (form.jenis !== 'Izin') {
      const { error } = await supabase.from('leave_requests').insert({
        guru_id: user.id, unit_id: form.unit_id, jenis: form.jenis, sub_jenis: null,
        tanggal_mulai: form.tanggal_mulai, tanggal_selesai: form.tanggal_selesai,
        alasan: form.alasan,
      });
      if (error) return alert('Gagal: ' + error.message);
      setModal(false); fetchAll(); return;
    }

    // ── Izin: wajib memilih shift, satu baris per shift ──
    if (baris.length === 0) return alert('Tambahkan minimal satu shift yang mau diizinkan.');
    for (const [i, b] of baris.entries()) {
      if (!b.shift_schedule_id) return alert(`Baris ${i+1}: pilih shift yang diizinkan.`);
      if (b.jenis === 'tukar_shift' && !b.tukar_dengan_schedule_id)
        return alert(`Baris ${i+1}: pilih shift guru pengganti.`);
      if (b.jenis === 'ganti_hari' && !b.tanggal_pengganti)
        return alert(`Baris ${i+1}: isi tanggal pengganti.`);
    }

    setKirim(true);
    // Periksa bentrok dulu — sebelum apa pun disimpan
    for (const [i, b] of baris.entries()) {
      const pesan = await periksaBentrok(i, b);
      if (pesan) { setKirim(false); return alert(`Baris ${i+1} bentrok:\n\n${pesan}`); }
    }

    const tgl = baris.map(b => shiftById(b.shift_schedule_id)?.tanggal).filter(Boolean).sort();
    const { data: lr, error } = await supabase.from('leave_requests').insert({
      guru_id: user.id, unit_id: form.unit_id, jenis: 'Izin',
      sub_jenis: baris.length === 1 ? baris[0].jenis : null,
      tanggal_mulai: tgl[0], tanggal_selesai: tgl[tgl.length-1],
      alasan: form.alasan,
    }).select('id').single();
    if (error) { setKirim(false); return alert('Gagal: ' + error.message); }

    const rows = baris.map(b => {
      const asal = shiftById(b.shift_schedule_id);
      const tujuan = b.jenis === 'tukar_shift' ? shiftById(b.tukar_dengan_schedule_id) : null;
      return {
        leave_request_id: lr.id, jenis: b.jenis,
        shift_schedule_id: b.shift_schedule_id, tanggal: asal?.tanggal,
        tukar_dengan_schedule_id: tujuan?.id || null,
        guru_pengganti_id: tujuan?.guru_id || null,
        tanggal_pengganti: b.jenis === 'ganti_hari' ? b.tanggal_pengganti : null,
      };
    });
    const { error: e2 } = await supabase.from('izin_detail').insert(rows);
    setKirim(false);
    if (e2) {
      await supabase.from('leave_requests').delete().eq('id', lr.id);  // batalkan agar tidak menggantung
      return alert('Gagal menyimpan rincian: ' + e2.message);
    }
    setModal(false); setBaris([]); setCekBentrok({}); fetchAll();
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
        <button className="btn btn-primary" onClick={()=>{ setForm({unit_id:'',jenis:'Izin',sub_jenis:'tanpa_pengganti',tanggal_mulai:todayWIB(),tanggal_selesai:todayWIB(),alasan:''}); setModal(true); }}>
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
                        {r.sub_jenis && (
                          <div style={{ marginTop:'0.2rem' }}>
                            <span style={{
                              background: r.sub_jenis==='tanpa_pengganti' ? '#fee2e2' : '#f3f4f6',
                              color:      r.sub_jenis==='tanpa_pengganti' ? '#b91c1c' : '#374151',
                              padding:'0.1rem 0.45rem', borderRadius:999, fontSize:'0.68rem', fontWeight:600, whiteSpace:'nowrap',
                            }}>{subLabel(r.sub_jenis)}</span>
                          </div>
                        )}
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

              {/* Rincian per shift — hanya untuk 'Izin'. Cuti & Sakit pakai rentang tanggal. */}
              {form.jenis === 'Izin' && (
                <div>
                  <label style={{ fontSize:'0.82rem', fontWeight:600, display:'block', marginBottom:'0.3rem' }}>
                    Shift yang Diizinkan *
                  </label>

                  {baris.length === 0 && (
                    <p style={{ margin:'0 0 0.5rem', fontSize:'0.78rem', color:'var(--text-secondary)' }}>
                      Belum ada. Tambahkan shift yang mau diizinkan — boleh lebih dari satu, dan jenisnya boleh berbeda-beda.
                    </p>
                  )}

                  <div style={{ display:'flex', flexDirection:'column', gap:'0.6rem' }}>
                    {baris.map((b, i) => {
                      const asal = shiftById(b.shift_schedule_id);
                      const pengganti = allShifts.filter(x => !b.guru_pengganti_id || x.guru_id === b.guru_pengganti_id);
                      const bentrok = cekBentrok[i];
                      return (
                        <div key={i} style={{ border:`1px solid ${bentrok ? '#fca5a5' : 'var(--glass-border)'}`,
                          background: bentrok ? 'rgba(185,28,28,0.03)' : 'var(--surface-color)',
                          borderRadius:'0.55rem', padding:'0.75rem' }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.5rem' }}>
                            <strong style={{ fontSize:'0.8rem' }}>Shift {i+1}</strong>
                            <button type="button" onClick={()=>hapusBaris(i)}
                              style={{ background:'#fee2e2', border:'none', borderRadius:'0.35rem', padding:'0.25rem 0.45rem', cursor:'pointer', color:'#b91c1c' }}>
                              <X size={12}/>
                            </button>
                          </div>

                          <select value={b.shift_schedule_id} style={{...inp, marginBottom:'0.5rem'}}
                            onChange={e=>{ const nb={...b, shift_schedule_id:e.target.value}; ubahBaris(i,{shift_schedule_id:e.target.value}); periksaBentrok(i, nb); }}>
                            <option value="">— Pilih shift Anda —</option>
                            {myShifts.map(x=>(
                              <option key={x.id} value={x.id}>
                                {fmt(x.tanggal)} · {x.shifts?.nama} ({String(x.shifts?.jam_mulai).slice(0,5)}–{String(x.shifts?.jam_selesai).slice(0,5)})
                              </option>
                            ))}
                          </select>

                          <select value={b.jenis} style={{...inp, marginBottom:'0.5rem'}}
                            onChange={e=>{ ubahBaris(i,{jenis:e.target.value, guru_pengganti_id:'', tukar_dengan_schedule_id:'', tanggal_pengganti:''}); setCekBentrok(c=>({...c,[i]:null})); }}>
                            {SUB_JENIS.map(sj=><option key={sj.value} value={sj.value}>{sj.label}</option>)}
                          </select>
                          <p style={{ margin:'-0.25rem 0 0.5rem', fontSize:'0.73rem',
                            color: b.jenis==='tanpa_pengganti' ? '#b91c1c' : 'var(--text-secondary)' }}>
                            {SUB_JENIS.find(sj=>sj.value===b.jenis)?.ket}
                          </p>

                          {b.jenis === 'tukar_shift' && (
                            <div style={{ display:'flex', flexDirection:'column', gap:'0.4rem' }}>
                              <select value={b.guru_pengganti_id} style={inp}
                                onChange={e=>{ ubahBaris(i,{guru_pengganti_id:e.target.value, tukar_dengan_schedule_id:''}); setCekBentrok(c=>({...c,[i]:null})); }}>
                                <option value="">— Pilih guru penukar (boleh lintas cabang) —</option>
                                {[...new Set(allShifts.map(x=>x.guru_id))].map(gid=>{
                                  const g = allShifts.find(x=>x.guru_id===gid);
                                  return <option key={gid} value={gid}>{g?.gurus?.nama || gid}</option>;
                                })}
                              </select>
                              {b.guru_pengganti_id && (
                                <select value={b.tukar_dengan_schedule_id} style={inp}
                                  onChange={e=>{ const nb={...b, tukar_dengan_schedule_id:e.target.value}; ubahBaris(i,{tukar_dengan_schedule_id:e.target.value}); periksaBentrok(i, nb); }}>
                                  <option value="">— Pilih shift miliknya yang diambil —</option>
                                  {pengganti.map(x=>(
                                    <option key={x.id} value={x.id}>
                                      {fmt(x.tanggal)} · {x.shifts?.nama} ({String(x.shifts?.jam_mulai).slice(0,5)}–{String(x.shifts?.jam_selesai).slice(0,5)})
                                    </option>
                                  ))}
                                </select>
                              )}
                            </div>
                          )}

                          {b.jenis === 'ganti_hari' && (
                            <input type="date" value={b.tanggal_pengganti} style={inp}
                              min={todayWIB()}
                              onChange={e=>{ const nb={...b, tanggal_pengganti:e.target.value}; ubahBaris(i,{tanggal_pengganti:e.target.value}); periksaBentrok(i, nb); }}
                              placeholder="Tanggal pengganti"/>
                          )}

                          {bentrok && (
                            <p style={{ margin:'0.5rem 0 0', fontSize:'0.75rem', color:'#b91c1c', fontWeight:600 }}>
                              ⚠️ {bentrok}
                            </p>
                          )}
                          {asal && b.jenis === 'tukar_shift' && (
                            <p style={{ margin:'0.4rem 0 0', fontSize:'0.72rem', color:'var(--text-secondary)' }}>
                              Shift ini akan ditandai <strong>dialihkan</strong> — tidak dihitung mangkir, dan tidak bisa di-check-in.
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ display:'flex', gap:'0.75rem', flexWrap:'wrap', alignItems:'center', marginTop:'0.5rem' }}>
                    <button type="button" onClick={()=>setBaris(b=>[...b, {...BARIS_KOSONG}])}
                      style={{ background:'rgba(79,70,229,0.1)', border:'none', borderRadius:'0.4rem',
                        padding:'0.45rem 0.8rem', cursor:'pointer', color:'var(--primary)', fontWeight:600,
                        fontSize:'0.82rem', fontFamily:'inherit', display:'flex', alignItems:'center', gap:'0.3rem' }}>
                      <Plus size={14}/> Tambah Shift
                    </button>
                    <button type="button" onClick={()=>setPyModal(true)}
                      style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-secondary)',
                        fontSize:'0.78rem', fontFamily:'inherit', textDecoration:'underline' }}>
                      Shift terlalu besar? Minta SPV pecah/atur ulang
                    </button>
                  </div>
                </div>
              )}

              {form.jenis !== 'Izin' && (
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
              )}
              <div>
                <label style={{ fontSize:'0.82rem', fontWeight:600, display:'block', marginBottom:'0.3rem' }}>Alasan</label>
                <textarea rows={3} value={form.alasan} onChange={e=>setForm(f=>({...f,alasan:e.target.value}))} placeholder="Ceritakan alasan..." style={{ ...inp, resize:'vertical' }}/>
              </div>
              <div style={{ display:'flex', gap:'0.65rem', justifyContent:'flex-end' }}>
                <button type="button" className="btn" onClick={()=>setModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary" disabled={kirim}>{kirim ? 'Memeriksa...' : 'Kirim Pengajuan'}</button>
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

      {/* Modal minta penyesuaian shift ke SPV */}
      {pyModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth:460 }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.85rem' }}>
              <h2 style={{ fontWeight:700, fontSize:'1.05rem', margin:0 }}>Minta Atur Ulang Shift</h2>
              <button onClick={()=>setPyModal(false)} style={{ background:'none', border:'none', cursor:'pointer' }}><X size={20}/></button>
            </div>
            <p style={{ fontSize:'0.82rem', color:'var(--text-secondary)', marginTop:0 }}>
              Untuk shift yang terlalu besar (mis. "Pagi-Siang") padahal Anda mau izin sebagiannya saja. SPV akan memecah/mengganti jadwalnya khusus di tanggal itu.
            </p>
            <div style={{ display:'flex', flexDirection:'column', gap:'0.85rem' }}>
              <div>
                <label style={{ fontSize:'0.82rem', fontWeight:600, display:'block', marginBottom:'0.3rem' }}>Shift yang mau ditata ulang *</label>
                <select value={pyForm.shift_schedule_id} onChange={e=>setPyForm(f=>({...f,shift_schedule_id:e.target.value}))} style={inp}>
                  <option value="">— Pilih shift Anda —</option>
                  {myShifts.map(x=>(
                    <option key={x.id} value={x.id}>
                      {fmt(x.tanggal)} · {x.shifts?.nama} ({String(x.shifts?.jam_mulai).slice(0,5)}–{String(x.shifts?.jam_selesai).slice(0,5)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize:'0.82rem', fontWeight:600, display:'block', marginBottom:'0.3rem' }}>Apa yang Anda inginkan? *</label>
                <textarea rows={3} value={pyForm.keterangan} onChange={e=>setPyForm(f=>({...f,keterangan:e.target.value}))}
                  placeholder='Contoh: "Izin bagian pagi saja, siang tetap mengajar."'
                  style={{...inp, resize:'vertical'}} />
              </div>
              <div style={{ display:'flex', gap:'0.65rem', justifyContent:'flex-end' }}>
                <button type="button" className="btn" onClick={()=>setPyModal(false)}>Batal</button>
                <button type="button" className="btn btn-primary" onClick={kirimPenyesuaian}>Kirim ke SPV</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
