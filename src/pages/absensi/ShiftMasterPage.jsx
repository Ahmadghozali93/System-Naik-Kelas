import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, X, Clock, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/authStore';

const EMPTY_FORM = { unit_id:'', nama:'', jam_mulai:'08:00', jam_selesai:'16:00', toleransi_menit:15, lintas_hari:false, wajib_foto:true, aktif:true };

const inp = { padding:'0.55rem 0.75rem', borderRadius:'0.5rem', border:'1px solid var(--glass-border)', background:'var(--surface-color)', fontFamily:'inherit', fontSize:'0.88rem', width:'100%', boxSizing:'border-box' };

export default function ShiftMasterPage() {
  const { user } = useAuth();
  const [tab, setTab]               = useState('shift'); // 'shift' | 'unit-karyawan'
  const [shifts, setShifts]         = useState([]);
  const [units, setUnits]           = useState([]);
  const [gurus, setGurus]           = useState([]);
  const [guruUnits, setGuruUnits]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [modal, setModal]           = useState(false);
  const [editId, setEditId]         = useState(null);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [filterUnit, setFilterUnit] = useState('');

  // Unit karyawan assignment
  const [selGuru, setSelGuru]       = useState('');
  const [selUnit, setSelUnit]       = useState('');

  const fetchAll = async () => {
    setLoading(true);
    const [shRes, uRes, gRes, guRes] = await Promise.all([
      supabase.from('shifts').select('*').order('unit_id').order('jam_mulai'),
      supabase.from('units').select('*').eq('aktif', true).order('nama'),
      supabase.from('gurus').select('id, nama, role').eq('status', 'Aktif').order('nama'),
      supabase.from('guru_units').select('*'),
    ]);
    setShifts(shRes.data || []);
    setUnits(uRes.data  || []);
    setGurus(gRes.data  || []);
    setGuruUnits(guRes.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const openAdd  = () => { setEditId(null); setForm(EMPTY_FORM); setModal(true); };
  const openEdit = (s) => { setEditId(s.id); setForm({ unit_id:s.unit_id, nama:s.nama, jam_mulai:s.jam_mulai, jam_selesai:s.jam_selesai, toleransi_menit:s.toleransi_menit, lintas_hari:s.lintas_hari, wajib_foto:s.wajib_foto, aktif:s.aktif }); setModal(true); };

  const handleSave = async (e) => {
    e.preventDefault();
    const payload = { ...form, toleransi_menit: Number(form.toleransi_menit) };
    const { error } = editId
      ? await supabase.from('shifts').update(payload).eq('id', editId)
      : await supabase.from('shifts').insert(payload);
    if (error) return alert('Gagal menyimpan: ' + error.message);
    setModal(false); fetchAll();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Hapus shift ini? Jadwal yang sudah dibuat akan terpengaruh.')) return;
    const { error } = await supabase.from('shifts').delete().eq('id', id);
    if (error) return alert('Gagal hapus: ' + error.message);
    fetchAll();
  };

  // Unit karyawan — pakai String() agar tidak salah match integer vs string
  const hasUnit = (guruId, unitId) =>
    guruUnits.some(gu => String(gu.guru_id) === String(guruId) && String(gu.unit_id) === String(unitId));

  const toggleGuruUnit = async (guruId, unitId) => {
    if (hasUnit(guruId, unitId)) {
      const gu = guruUnits.find(g => String(g.guru_id) === String(guruId) && String(g.unit_id) === String(unitId));
      if (!gu) return;
      // optimistic remove
      setGuruUnits(prev => prev.filter(g => g.id !== gu.id));
      const { error } = await supabase.from('guru_units').delete().eq('id', gu.id);
      if (error) { fetchAll(); return alert('Gagal hapus: ' + error.message); }
    } else {
      // optimistic add (pakai temp id)
      const tmp = { id: '__tmp__', guru_id: guruId, unit_id: unitId };
      setGuruUnits(prev => [...prev, tmp]);
      const { data, error } = await supabase.from('guru_units')
        .insert({ guru_id: guruId, unit_id: unitId })
        .select().single();
      if (error) { fetchAll(); return alert('Gagal tambah: ' + error.message); }
      // ganti tmp dengan data asli
      setGuruUnits(prev => prev.map(g => g.id === '__tmp__' ? data : g));
    }
  };

  const addGuruUnit = async () => {
    if (!selGuru || !selUnit) return alert('Pilih karyawan dan unit.');
    if (hasUnit(selGuru, selUnit)) return alert('Karyawan sudah terdaftar di unit ini.');
    const { data, error } = await supabase.from('guru_units')
      .insert({ guru_id: selGuru, unit_id: selUnit })
      .select().single();
    if (error) return alert('Gagal: ' + error.message);
    setSelGuru(''); setSelUnit('');
    setGuruUnits(prev => [...prev, data]);
  };

  const filtered = filterUnit ? shifts.filter(s => s.unit_id === filterUnit) : shifts;
  const unitName = (id) => units.find(u => u.id === id)?.nama || id;

  const tabBtn = (t, label) => (
    <button onClick={() => setTab(t)} style={{ background:'none', border:'none', cursor:'pointer', padding:'0.65rem 1.1rem', fontWeight:tab===t?700:500, fontSize:'0.88rem', fontFamily:'inherit', color:tab===t?'var(--primary)':'var(--text-secondary)', borderBottom:tab===t?'2px solid var(--primary)':'2px solid transparent', marginBottom:'-2px' }}>{label}</button>
  );

  return (
    <div>
      <div style={{ marginBottom:'1.5rem' }}>
        <p style={{ fontSize:'0.78rem', color:'var(--text-secondary)', margin:0, textTransform:'uppercase', letterSpacing:'0.05em' }}>Absensi</p>
        <h1 style={{ fontSize:'1.6rem', fontWeight:700, margin:0 }}>Master Shift</h1>
      </div>

      <div style={{ display:'flex', borderBottom:'2px solid var(--glass-border)', marginBottom:'1.25rem' }}>
        {tabBtn('shift', 'Daftar Shift')}
        {tabBtn('unit-karyawan', 'Unit Karyawan')}
      </div>

      {/* ── TAB SHIFT ── */}
      {tab === 'shift' && (
        <div className="glass-card" style={{ padding:'1.5rem' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem', flexWrap:'wrap', gap:'0.75rem' }}>
            <div style={{ display:'flex', gap:'0.65rem', alignItems:'center' }}>
              <select value={filterUnit} onChange={e=>setFilterUnit(e.target.value)}
                style={{ ...inp, width:'auto' }}>
                <option value="">Semua Unit</option>
                {units.map(u => <option key={u.id} value={u.id}>{u.nama}</option>)}
              </select>
            </div>
            {user?.role === 'Admin' && (
              <button className="btn btn-primary" onClick={openAdd}><Plus size={16}/> Tambah Shift</button>
            )}
          </div>

          {loading ? <p style={{ color:'var(--text-secondary)' }}>Memuat...</p> : filtered.length === 0 ? (
            <div style={{ textAlign:'center', padding:'3rem', color:'var(--text-secondary)' }}>
              <Clock size={40} style={{ opacity:0.3, marginBottom:'0.75rem' }} />
              <p>Belum ada shift. Tambahkan shift pertama.</p>
            </div>
          ) : (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.84rem' }}>
                <thead>
                  <tr style={{ borderBottom:'2px solid var(--glass-border)', background:'rgba(79,70,229,0.04)' }}>
                    {['No','Unit','Nama Shift','Jam Mulai','Jam Selesai','Toleransi','Lintas Hari','Wajib Foto','Status','Aksi'].map(h=>(
                      <th key={h} style={{ padding:'0.65rem 0.75rem', textAlign:'left', fontWeight:700, fontSize:'0.72rem', color:'var(--text-secondary)', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s,i) => (
                    <tr key={s.id} style={{ borderBottom:'1px solid var(--glass-border)' }}
                      onMouseOver={e=>e.currentTarget.style.background='rgba(79,70,229,0.03)'}
                      onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                      <td style={{ padding:'0.7rem 0.75rem', color:'var(--text-secondary)' }}>{i+1}</td>
                      <td style={{ padding:'0.7rem 0.75rem', fontSize:'0.8rem', color:'var(--text-secondary)' }}>{unitName(s.unit_id)}</td>
                      <td style={{ padding:'0.7rem 0.75rem', fontWeight:600 }}>{s.nama}</td>
                      <td style={{ padding:'0.7rem 0.75rem', fontWeight:600, color:'var(--primary)' }}>{s.jam_mulai}</td>
                      <td style={{ padding:'0.7rem 0.75rem' }}>{s.jam_selesai}</td>
                      <td style={{ padding:'0.7rem 0.75rem' }}>{s.toleransi_menit} mnt</td>
                      <td style={{ padding:'0.7rem 0.75rem' }}>{s.lintas_hari ? '✓' : '-'}</td>
                      <td style={{ padding:'0.7rem 0.75rem' }}>{s.wajib_foto ? '✓' : '-'}</td>
                      <td style={{ padding:'0.7rem 0.75rem' }}>
                        <span style={{ background:s.aktif?'#d1fae5':'#fee2e2', color:s.aktif?'#047857':'#b91c1c', padding:'0.15rem 0.6rem', borderRadius:999, fontSize:'0.75rem', fontWeight:600 }}>{s.aktif?'Aktif':'Nonaktif'}</span>
                      </td>
                      <td style={{ padding:'0.7rem 0.75rem' }}>
                        {user?.role === 'Admin' && (
                          <div style={{ display:'flex', gap:'0.35rem' }}>
                            <button onClick={()=>openEdit(s)} style={{ background:'rgba(79,70,229,0.1)', border:'none', borderRadius:'0.35rem', padding:'0.3rem 0.55rem', cursor:'pointer', color:'var(--primary)' }}><Edit size={14}/></button>
                            <button onClick={()=>handleDelete(s.id)} style={{ background:'rgba(239,68,68,0.1)', border:'none', borderRadius:'0.35rem', padding:'0.3rem 0.55rem', cursor:'pointer', color:'#ef4444' }}><Trash2 size={14}/></button>
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
      )}

      {/* ── TAB UNIT KARYAWAN ── */}
      {tab === 'unit-karyawan' && (
        <div className="glass-card" style={{ padding:'1.5rem' }}>
          <p style={{ color:'var(--text-secondary)', fontSize:'0.88rem', marginTop:0 }}>
            Atur karyawan mana yang terdaftar di unit mana. Karyawan bisa terdaftar di lebih dari satu unit.
          </p>

          {/* Form tambah */}
          {user?.role === 'Admin' && (
            <div style={{ display:'flex', gap:'0.65rem', marginBottom:'1.5rem', flexWrap:'wrap', alignItems:'flex-end' }}>
              <div style={{ flex:1, minWidth:180 }}>
                <label style={{ fontSize:'0.8rem', fontWeight:600, display:'block', marginBottom:'0.3rem' }}>Karyawan</label>
                <select value={selGuru} onChange={e=>setSelGuru(e.target.value)} style={inp}>
                  <option value="">-- Pilih Karyawan --</option>
                  {gurus.map(g => <option key={g.id} value={g.id}>{g.nama} ({g.role})</option>)}
                </select>
              </div>
              <div style={{ flex:1, minWidth:180 }}>
                <label style={{ fontSize:'0.8rem', fontWeight:600, display:'block', marginBottom:'0.3rem' }}>Unit / Cabang</label>
                <select value={selUnit} onChange={e=>setSelUnit(e.target.value)} style={inp}>
                  <option value="">-- Pilih Unit --</option>
                  {units.map(u => <option key={u.id} value={u.id}>{u.nama}</option>)}
                </select>
              </div>
              <button className="btn btn-primary" onClick={addGuruUnit}><Plus size={16}/> Tambahkan</button>
            </div>
          )}

          {/* Tabel matrix karyawan × unit */}
          <div style={{ overflowX:'auto' }}>
            <table style={{ borderCollapse:'collapse', fontSize:'0.84rem', minWidth:500 }}>
              <thead>
                <tr style={{ borderBottom:'2px solid var(--glass-border)', background:'rgba(79,70,229,0.04)' }}>
                  <th style={{ padding:'0.65rem 0.75rem', textAlign:'left', fontWeight:700, fontSize:'0.72rem', color:'var(--text-secondary)', minWidth:160 }}>KARYAWAN</th>
                  {units.map(u => (
                    <th key={u.id} style={{ padding:'0.65rem 0.75rem', textAlign:'center', fontWeight:700, fontSize:'0.72rem', color:'var(--text-secondary)', whiteSpace:'nowrap', minWidth:100 }}>{u.nama}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gurus.map(g => (
                  <tr key={g.id} style={{ borderBottom:'1px solid var(--glass-border)' }}
                    onMouseOver={e=>e.currentTarget.style.background='rgba(79,70,229,0.02)'}
                    onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                    <td style={{ padding:'0.7rem 0.75rem' }}>
                      <div style={{ fontWeight:600 }}>{g.nama}</div>
                      <div style={{ fontSize:'0.75rem', color:'var(--text-secondary)' }}>{g.role}</div>
                    </td>
                    {units.map(u => (
                      <td key={u.id} style={{ padding:'0.7rem 0.75rem', textAlign:'center' }}>
                        <button
                          onClick={()=>user?.role==='Admin'&&toggleGuruUnit(g.id, u.id)}
                          style={{ width:28, height:28, borderRadius:'50%', border:'2px solid', cursor:user?.role==='Admin'?'pointer':'default',
                            borderColor: hasUnit(g.id,u.id)?'#047857':'var(--glass-border)',
                            background: hasUnit(g.id,u.id)?'#d1fae5':'transparent',
                            color: hasUnit(g.id,u.id)?'#047857':'var(--glass-border)',
                            fontSize:'1rem', display:'inline-flex', alignItems:'center', justifyContent:'center' }}>
                          {hasUnit(g.id,u.id) ? '✓' : ''}
                        </button>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal form shift */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth:500 }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem' }}>
              <h2 style={{ fontWeight:700, fontSize:'1.1rem', margin:0 }}>{editId ? 'Edit Shift' : 'Tambah Shift'}</h2>
              <button onClick={()=>setModal(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-secondary)' }}><X size={20}/></button>
            </div>

            <form onSubmit={handleSave} style={{ display:'flex', flexDirection:'column', gap:'0.85rem' }}>
              <div>
                <label style={{ fontSize:'0.82rem', fontWeight:600, display:'block', marginBottom:'0.3rem' }}>Unit / Cabang *</label>
                <select required value={form.unit_id} onChange={e=>setForm(f=>({...f,unit_id:e.target.value}))} style={inp}>
                  <option value="">-- Pilih Unit --</option>
                  {units.map(u=><option key={u.id} value={u.id}>{u.nama}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize:'0.82rem', fontWeight:600, display:'block', marginBottom:'0.3rem' }}>Nama Shift *</label>
                <input required value={form.nama} onChange={e=>setForm(f=>({...f,nama:e.target.value}))} placeholder="cth: Shift Pagi" style={inp}/>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.65rem' }}>
                <div>
                  <label style={{ fontSize:'0.82rem', fontWeight:600, display:'block', marginBottom:'0.3rem' }}>Jam Mulai *</label>
                  <input type="time" required value={form.jam_mulai} onChange={e=>setForm(f=>({...f,jam_mulai:e.target.value}))} style={inp}/>
                </div>
                <div>
                  <label style={{ fontSize:'0.82rem', fontWeight:600, display:'block', marginBottom:'0.3rem' }}>Jam Selesai *</label>
                  <input type="time" required value={form.jam_selesai} onChange={e=>setForm(f=>({...f,jam_selesai:e.target.value}))} style={inp}/>
                </div>
              </div>
              <div>
                <label style={{ fontSize:'0.82rem', fontWeight:600, display:'block', marginBottom:'0.3rem' }}>Toleransi Keterlambatan (menit)</label>
                <input type="number" min={0} max={120} value={form.toleransi_menit} onChange={e=>setForm(f=>({...f,toleransi_menit:e.target.value}))} style={inp}/>
              </div>
              <div style={{ display:'flex', gap:'1.5rem', flexWrap:'wrap' }}>
                {[['lintas_hari','Shift Lintas Hari (overnight)'],['wajib_foto','Wajib Foto'],['aktif','Aktif']].map(([k,label])=>(
                  <label key={k} style={{ display:'flex', alignItems:'center', gap:'0.5rem', cursor:'pointer', fontSize:'0.88rem' }}>
                    <input type="checkbox" checked={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.checked}))} style={{ width:16, height:16 }}/>
                    {label}
                  </label>
                ))}
              </div>
              <div style={{ display:'flex', gap:'0.65rem', justifyContent:'flex-end', marginTop:'0.5rem' }}>
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
