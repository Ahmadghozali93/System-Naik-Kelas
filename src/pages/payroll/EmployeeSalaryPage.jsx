import { useState, useEffect, useMemo } from 'react';
import { Plus, Pencil, Trash2, X, UserCog } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/authStore';

const TIPE_COLOR = {
  Pokok:    { color: '#1d4ed8', bg: 'rgba(29,78,216,0.1)' },
  Tunjangan:{ color: '#059669', bg: 'rgba(5,150,105,0.1)' },
  Potongan: { color: '#b91c1c', bg: 'rgba(185,28,28,0.1)' },
};
const fmtRp = (n) => new Intl.NumberFormat('id-ID').format(n || 0);
const todayISO = () => new Date().toISOString().slice(0, 10);

const inp = {
  padding: '0.55rem 0.75rem', borderRadius: '0.5rem',
  border: '1px solid var(--glass-border)', background: 'var(--surface-color)',
  fontFamily: 'inherit', fontSize: '0.88rem', width: '100%', boxSizing: 'border-box',
};

export default function EmployeeSalaryPage() {
  const { user } = useAuth();
  const isAdmin = ['Owner', 'Administrator', 'Supervisor'].includes(user?.role);

  const [gurus, setGurus]           = useState([]);
  const [components, setComponents] = useState([]);
  const [allSalaries, setAllSalaries] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [filterUnit, setFilterUnit] = useState('');
  const [units, setUnits]           = useState([]);
  const [search, setSearch]         = useState('');

  // Modal edit per guru
  const [selectedGuru, setSelectedGuru]   = useState(null);
  const [guruSalaries, setGuruSalaries]   = useState([]);
  const [loadingGuru, setLoadingGuru]     = useState(false);

  // Form tambah/edit salary
  const [formModal, setFormModal]   = useState(false);
  const [editSal, setEditSal]       = useState(null);
  const [form, setForm]             = useState({ salary_component_id: '', nominal: '', berlaku_mulai: todayISO(), catatan: '' });
  const [saving, setSaving]         = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    const [g, u, c, s] = await Promise.all([
      supabase.from('gurus').select('id,nama,role,status').eq('status', 'Aktif').order('nama'),
      supabase.from('units').select('*').eq('aktif', true).order('nama'),
      supabase.from('salary_components').select('*').eq('aktif', true).order('tipe').order('nama'),
      supabase.from('employee_salaries').select('*, salary_components!salary_component_id(nama,tipe)').order('berlaku_mulai', { ascending: false }),
    ]);
    setGurus(g.data || []);
    setUnits(u.data || []);
    setComponents(c.data || []);
    setAllSalaries(s.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  // Ringkasan gaji aktif per guru (komponen terbaru)
  const guruSummary = useMemo(() => {
    const today = todayISO();
    const result = {};
    allSalaries.forEach(s => {
      if (s.berlaku_mulai > today) return; // belum berlaku
      const key = `${s.guru_id}_${s.salary_component_id}`;
      if (!result[key] || s.berlaku_mulai > result[key].berlaku_mulai) {
        result[key] = s;
      }
    });
    // Grup per guru
    const byGuru = {};
    Object.values(result).forEach(s => {
      if (!byGuru[s.guru_id]) byGuru[s.guru_id] = { bruto: 0, potongan: 0, count: 0 };
      if (s.salary_components?.tipe !== 'Potongan') byGuru[s.guru_id].bruto += s.nominal;
      else byGuru[s.guru_id].potongan += s.nominal;
      byGuru[s.guru_id].count++;
    });
    return byGuru;
  }, [allSalaries]);

  const filteredGurus = useMemo(() =>
    gurus.filter(g =>
      (!search || g.nama.toLowerCase().includes(search.toLowerCase())) &&
      (!filterUnit || allSalaries.some(s => s.guru_id === g.id)), // simple filter
    ),
  [gurus, search, filterUnit, allSalaries]);

  // Buka detail guru
  const openGuru = async (guru) => {
    setSelectedGuru(guru);
    setLoadingGuru(true);
    const { data } = await supabase.from('employee_salaries')
      .select('*, salary_components!salary_component_id(nama,tipe)')
      .eq('guru_id', guru.id)
      .order('salary_component_id')
      .order('berlaku_mulai', { ascending: false });
    setGuruSalaries(data || []);
    setLoadingGuru(false);
  };

  const openAdd = () => {
    setEditSal(null);
    setForm({ salary_component_id: '', nominal: '', berlaku_mulai: todayISO(), catatan: '' });
    setFormModal(true);
  };
  const openEdit = (sal) => {
    setEditSal(sal);
    setForm({
      salary_component_id: sal.salary_component_id,
      nominal: sal.nominal,
      berlaku_mulai: sal.berlaku_mulai,
      catatan: sal.catatan || '',
    });
    setFormModal(true);
  };
  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      guru_id: selectedGuru.id,
      salary_component_id: form.salary_component_id,
      nominal: Number(form.nominal),
      berlaku_mulai: form.berlaku_mulai,
      catatan: form.catatan || null,
    };
    const { error } = editSal
      ? await supabase.from('employee_salaries').update(payload).eq('id', editSal.id)
      : await supabase.from('employee_salaries').insert(payload);
    setSaving(false);
    if (error) {
      if (error.code === '23505') return alert('Kombinasi komponen + tanggal berlaku sudah ada. Gunakan tanggal berbeda.');
      return alert('Gagal: ' + error.message);
    }
    setFormModal(false);
    openGuru(selectedGuru);
    fetchAll();
  };
  const handleDelete = async (id) => {
    if (!window.confirm('Hapus entri gaji ini?')) return;
    await supabase.from('employee_salaries').delete().eq('id', id);
    openGuru(selectedGuru);
    fetchAll();
  };

  // Group guruSalaries by component untuk view yang rapi
  const groupedSal = useMemo(() => {
    const today = todayISO();
    const map = {};
    guruSalaries.forEach(s => {
      const compId = s.salary_component_id;
      if (!map[compId]) map[compId] = { comp: s.salary_components, entries: [] };
      map[compId].entries.push(s);
    });
    return Object.values(map);
  }, [guruSalaries]);

  return (
    <div>
      <div style={{ marginBottom: '1.25rem' }}>
        <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Payroll</p>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>Struktur Gaji Karyawan</h1>
      </div>

      {/* Search */}
      <div className="glass-card" style={{ padding: '0.85rem 1.25rem', marginBottom: '1rem', display: 'flex', gap: '0.65rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nama karyawan..."
          style={{ ...inp, width: 220 }} />
        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          Klik karyawan untuk lihat / atur struktur gajinya
        </span>
      </div>

      {/* Daftar karyawan */}
      <div className="glass-card" style={{ padding: '1.25rem', overflowX: 'auto' }}>
        {loading ? (
          <p style={{ color: 'var(--text-secondary)' }}>Memuat...</p>
        ) : filteredGurus.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
            <UserCog size={36} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
            <p>Tidak ada karyawan ditemukan.</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--glass-border)' }}>
                {['Nama', 'Role', 'Total Bruto/Bln', 'Potongan/Bln', 'Netto/Bln', 'Komponen', 'Aksi'].map(h => (
                  <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredGurus.map(g => {
                const sum = guruSummary[g.id] || { bruto: 0, potongan: 0, count: 0 };
                return (
                  <tr key={g.id} style={{ borderBottom: '1px solid var(--glass-border)' }}
                    onMouseOver={e => e.currentTarget.style.background = 'rgba(79,70,229,0.03)'}
                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '0.75rem', fontWeight: 600 }}>{g.nama}</td>
                    <td style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{g.role}</td>
                    <td style={{ padding: '0.75rem', color: '#1d4ed8', fontWeight: 600 }}>
                      {sum.bruto > 0 ? `Rp ${fmtRp(sum.bruto)}` : <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                    </td>
                    <td style={{ padding: '0.75rem', color: '#b91c1c' }}>
                      {sum.potongan > 0 ? `Rp ${fmtRp(sum.potongan)}` : '—'}
                    </td>
                    <td style={{ padding: '0.75rem', color: '#059669', fontWeight: 600 }}>
                      {sum.bruto > 0 ? `Rp ${fmtRp(sum.bruto - sum.potongan)}` : '—'}
                    </td>
                    <td style={{ padding: '0.75rem', color: 'var(--text-secondary)' }}>
                      {sum.count > 0 ? `${sum.count} komponen` : <span style={{ color: '#d97706' }}>Belum diatur</span>}
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      <button onClick={() => openGuru(g)}
                        style={{ background: 'rgba(79,70,229,0.1)', border: 'none', borderRadius: '0.4rem', padding: '0.3rem 0.65rem', cursor: 'pointer', color: 'var(--primary)', fontSize: '0.82rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <UserCog size={13} /> Atur Gaji
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── MODAL DETAIL GAJI GURU ── */}
      {selectedGuru && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 680 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <div>
                <h2 style={{ fontWeight: 700, fontSize: '1.1rem', margin: 0 }}>Struktur Gaji — {selectedGuru.nama}</h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0' }}>{selectedGuru.role}</p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {isAdmin && (
                  <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem' }} onClick={openAdd}>
                    <Plus size={14} /> Tambah Komponen
                  </button>
                )}
                <button onClick={() => setSelectedGuru(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
              </div>
            </div>

            {loadingGuru ? (
              <p style={{ color: 'var(--text-secondary)' }}>Memuat...</p>
            ) : groupedSal.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                <p>Belum ada struktur gaji. Klik "Tambah Komponen" untuk mulai.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '60vh', overflowY: 'auto' }}>
                {groupedSal.map(({ comp, entries }) => (
                  <div key={comp?.nama} style={{ border: '1px solid var(--glass-border)', borderRadius: '0.6rem', overflow: 'hidden' }}>
                    <div style={{
                      padding: '0.55rem 0.85rem',
                      background: TIPE_COLOR[comp?.tipe]?.bg || 'rgba(79,70,229,0.06)',
                      display: 'flex', alignItems: 'center', gap: '0.5rem',
                    }}>
                      <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{comp?.nama}</span>
                      <span style={{ background: TIPE_COLOR[comp?.tipe]?.bg, color: TIPE_COLOR[comp?.tipe]?.color, padding: '0.08rem 0.45rem', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700 }}>
                        {comp?.tipe}
                      </span>
                    </div>
                    {entries.map(sal => (
                      <div key={sal.id} style={{ padding: '0.55rem 0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--glass-border)', fontSize: '0.83rem' }}>
                        <div>
                          <span style={{ fontWeight: 600, color: TIPE_COLOR[comp?.tipe]?.color }}>
                            Rp {fmtRp(sal.nominal)}
                          </span>
                          <span style={{ color: 'var(--text-secondary)', marginLeft: '0.75rem' }}>
                            berlaku mulai {new Date(sal.berlaku_mulai + 'T12:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                          {sal.catatan && <span style={{ color: 'var(--text-secondary)', marginLeft: '0.5rem', fontSize: '0.78rem' }}>· {sal.catatan}</span>}
                        </div>
                        {isAdmin && (
                          <div style={{ display: 'flex', gap: '0.3rem' }}>
                            <button onClick={() => openEdit(sal)}
                              style={{ background: 'rgba(79,70,229,0.1)', border: 'none', borderRadius: '0.35rem', padding: '0.25rem 0.4rem', cursor: 'pointer', color: 'var(--primary)' }}>
                              <Pencil size={12} />
                            </button>
                            <button onClick={() => handleDelete(sal.id)}
                              style={{ background: '#fee2e2', border: 'none', borderRadius: '0.35rem', padding: '0.25rem 0.4rem', cursor: 'pointer', color: '#b91c1c' }}>
                              <Trash2 size={12} />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MODAL FORM KOMPONEN GAJI ── */}
      {formModal && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontWeight: 700, fontSize: '1.05rem', margin: 0 }}>
                {editSal ? 'Edit' : 'Tambah'} Komponen — {selectedGuru?.nama}
              </h2>
              <button onClick={() => setFormModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Komponen *</label>
                <select required value={form.salary_component_id} onChange={e => setForm(f => ({ ...f, salary_component_id: e.target.value }))} style={inp}>
                  <option value="">-- Pilih komponen --</option>
                  {['Pokok', 'Tunjangan', 'Potongan'].map(tipe => (
                    <optgroup key={tipe} label={tipe}>
                      {components.filter(c => c.tipe === tipe).map(c => (
                        <option key={c.id} value={c.id}>{c.nama}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Nominal (Rp) *</label>
                <input type="number" required min={0} value={form.nominal} onChange={e => setForm(f => ({ ...f, nominal: e.target.value }))}
                  placeholder="Cth: 3000000" style={inp} />
              </div>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Berlaku Mulai *</label>
                <input type="date" required value={form.berlaku_mulai} onChange={e => setForm(f => ({ ...f, berlaku_mulai: e.target.value }))} style={inp} />
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0' }}>
                  Histori disimpan. Perubahan gaji hanya berlaku untuk payroll setelah tanggal ini.
                </p>
              </div>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Catatan</label>
                <input value={form.catatan} onChange={e => setForm(f => ({ ...f, catatan: e.target.value }))} placeholder="Opsional" style={inp} />
              </div>
              <div style={{ display: 'flex', gap: '0.65rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn" onClick={() => setFormModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
