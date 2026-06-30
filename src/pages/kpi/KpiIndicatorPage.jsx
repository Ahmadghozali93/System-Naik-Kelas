import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, X, Target } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/authStore';

const ROLES = ['Owner', 'Administrator', 'Supervisor', 'Learning Koordinator', 'Tutor'];
const SOURCE_FIELDS = [
  { value: 'kehadiran',        label: 'Kehadiran — % hadir dari total hari kerja' },
  { value: 'ketepatan_waktu',  label: 'Ketepatan Waktu — % tepat waktu dari hari hadir' },
  { value: 'lembur',           label: 'Total Lembur — total jam lembur (Approved)' },
];
const SATUAN_OPTIONS = ['%', 'jam', 'sesi', 'poin', 'siswa', 'hari'];
const BULAN_LABEL = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const THIS_YEAR = new Date().getFullYear();

const inp = {
  padding: '0.55rem 0.75rem', borderRadius: '0.5rem',
  border: '1px solid var(--glass-border)', background: 'var(--surface-color)',
  fontFamily: 'inherit', fontSize: '0.88rem', width: '100%', boxSizing: 'border-box',
};

export default function KpiIndicatorPage() {
  const { user } = useAuth();
  const isAdmin = ['Owner', 'Administrator', 'Supervisor'].includes(user?.role);

  const [indicators, setIndicators] = useState([]);
  const [loading, setLoading] = useState(true);

  // Indikator modal
  const [modalInd, setModalInd] = useState(false);
  const [editInd, setEditInd] = useState(null);
  const [formInd, setFormInd] = useState({
    nama: '', deskripsi: '', tipe: 'Manual', source_field: '', role_target: [], aktif: true,
  });

  // Target modal
  const [targetIndId, setTargetIndId] = useState(null);
  const [targets, setTargets] = useState([]);
  const [editTargetId, setEditTargetId] = useState(null);
  const [formTarget, setFormTarget] = useState({
    periode_tahun: THIS_YEAR, periode_bulan: '', bobot: '', target_nilai: '', satuan: '%',
  });
  const [savingTarget, setSavingTarget] = useState(false);

  const fetchIndicators = async () => {
    setLoading(true);
    const { data } = await supabase.from('kpi_indicators').select('*').order('nama');
    setIndicators(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchIndicators(); }, []);

  // ── INDIKATOR CRUD ───────────────────────────────────────────
  const openAdd = () => {
    setEditInd(null);
    setFormInd({ nama: '', deskripsi: '', tipe: 'Manual', source_field: '', role_target: [], aktif: true });
    setModalInd(true);
  };
  const openEdit = (ind) => {
    setEditInd(ind);
    setFormInd({
      nama: ind.nama, deskripsi: ind.deskripsi || '', tipe: ind.tipe,
      source_field: ind.source_field || '', role_target: ind.role_target || [], aktif: ind.aktif,
    });
    setModalInd(true);
  };
  const saveInd = async (e) => {
    e.preventDefault();
    if (formInd.tipe === 'Otomatis' && !formInd.source_field) {
      return alert('Pilih sumber data untuk indikator Otomatis.');
    }
    const payload = {
      nama: formInd.nama.trim(),
      deskripsi: formInd.deskripsi.trim() || null,
      tipe: formInd.tipe,
      source_field: formInd.tipe === 'Otomatis' ? formInd.source_field : null,
      role_target: formInd.role_target,
      aktif: formInd.aktif,
    };
    const { error } = editInd
      ? await supabase.from('kpi_indicators').update(payload).eq('id', editInd.id)
      : await supabase.from('kpi_indicators').insert(payload);
    if (error) return alert('Gagal: ' + error.message);
    setModalInd(false);
    fetchIndicators();
  };
  const deleteInd = async (id) => {
    if (!window.confirm('Hapus indikator ini? Semua target & skor terkait ikut terhapus.')) return;
    const { error } = await supabase.from('kpi_indicators').delete().eq('id', id);
    if (error) return alert('Gagal: ' + error.message);
    fetchIndicators();
  };
  const toggleRole = (role) => setFormInd(f => ({
    ...f,
    role_target: f.role_target.includes(role)
      ? f.role_target.filter(r => r !== role)
      : [...f.role_target, role],
  }));

  // ── TARGET CRUD ──────────────────────────────────────────────
  const fetchTargets = async (indId) => {
    const { data } = await supabase.from('kpi_targets')
      .select('*').eq('kpi_indicator_id', indId)
      .order('periode_tahun').order('periode_bulan', { nullsFirst: true });
    setTargets(data || []);
  };
  const openTargetModal = (indId) => {
    setTargetIndId(indId);
    setEditTargetId(null);
    setFormTarget({ periode_tahun: THIS_YEAR, periode_bulan: '', bobot: '', target_nilai: '', satuan: '%' });
    fetchTargets(indId);
  };
  const saveTarget = async (e) => {
    e.preventDefault();
    setSavingTarget(true);
    const payload = {
      kpi_indicator_id: targetIndId,
      periode_tahun: Number(formTarget.periode_tahun),
      periode_bulan: formTarget.periode_bulan !== '' ? Number(formTarget.periode_bulan) : null,
      bobot: Number(formTarget.bobot),
      target_nilai: Number(formTarget.target_nilai),
      satuan: formTarget.satuan,
    };
    const { error } = editTargetId
      ? await supabase.from('kpi_targets').update(payload).eq('id', editTargetId)
      : await supabase.from('kpi_targets').insert(payload);
    setSavingTarget(false);
    if (error) return alert('Gagal: ' + error.message);
    setEditTargetId(null);
    setFormTarget({ periode_tahun: THIS_YEAR, periode_bulan: '', bobot: '', target_nilai: '', satuan: '%' });
    fetchTargets(targetIndId);
  };
  const deleteTarget = async (id) => {
    if (!window.confirm('Hapus target ini?')) return;
    await supabase.from('kpi_targets').delete().eq('id', id);
    fetchTargets(targetIndId);
  };
  const startEditTarget = (t) => {
    setEditTargetId(t.id);
    setFormTarget({
      periode_tahun: t.periode_tahun,
      periode_bulan: t.periode_bulan ?? '',
      bobot: t.bobot,
      target_nilai: t.target_nilai,
      satuan: t.satuan,
    });
  };

  const targetInd = indicators.find(i => i.id === targetIndId);

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '1.25rem' }}>
        <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>KPI</p>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>Master Indikator KPI</h1>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          {indicators.length} indikator terdaftar
        </span>
        {isAdmin && (
          <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }} onClick={openAdd}>
            <Plus size={16} /> Tambah Indikator
          </button>
        )}
      </div>

      {/* Tabel indikator */}
      <div className="glass-card" style={{ padding: '1.25rem', overflowX: 'auto' }}>
        {loading ? (
          <p style={{ color: 'var(--text-secondary)' }}>Memuat...</p>
        ) : indicators.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            <Target size={40} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
            <p>Belum ada indikator. Tambahkan indikator untuk mulai penilaian KPI.</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--glass-border)' }}>
                {['Nama Indikator', 'Tipe', 'Berlaku Untuk Role', 'Status', 'Aksi'].map(h => (
                  <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {indicators.map(ind => (
                <tr key={ind.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <td style={{ padding: '0.75rem' }}>
                    <div style={{ fontWeight: 600 }}>{ind.nama}</div>
                    {ind.deskripsi && <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{ind.deskripsi}</div>}
                  </td>
                  <td style={{ padding: '0.75rem', whiteSpace: 'nowrap' }}>
                    <span style={{
                      background: ind.tipe === 'Otomatis' ? 'rgba(5,150,105,0.1)' : 'rgba(79,70,229,0.1)',
                      color: ind.tipe === 'Otomatis' ? '#059669' : 'var(--primary)',
                      padding: '0.15rem 0.55rem', borderRadius: 999, fontSize: '0.75rem', fontWeight: 700,
                    }}>
                      {ind.tipe}
                    </span>
                    {ind.tipe === 'Otomatis' && ind.source_field && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                        {SOURCE_FIELDS.find(s => s.value === ind.source_field)?.label?.split(' — ')[0]}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '0.75rem' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                      {(ind.role_target || []).length === 0 ? (
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Semua role</span>
                      ) : (ind.role_target || []).map(r => (
                        <span key={r} style={{ background: 'rgba(79,70,229,0.08)', color: 'var(--primary)', padding: '0.1rem 0.45rem', borderRadius: 999, fontSize: '0.72rem', fontWeight: 600 }}>{r}</span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: '0.75rem' }}>
                    <span style={{
                      background: ind.aktif ? 'rgba(5,150,105,0.1)' : 'rgba(107,114,128,0.1)',
                      color: ind.aktif ? '#059669' : '#6b7280',
                      padding: '0.15rem 0.55rem', borderRadius: 999, fontSize: '0.75rem', fontWeight: 700,
                    }}>
                      {ind.aktif ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem' }}>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'nowrap' }}>
                      <button onClick={() => openTargetModal(ind.id)}
                        style={{ background: 'rgba(234,179,8,0.12)', border: 'none', borderRadius: '0.4rem', padding: '0.3rem 0.6rem', cursor: 'pointer', color: '#92400e', fontSize: '0.78rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <Target size={13} /> Target
                      </button>
                      {isAdmin && (
                        <>
                          <button onClick={() => openEdit(ind)}
                            style={{ background: 'rgba(79,70,229,0.1)', border: 'none', borderRadius: '0.4rem', padding: '0.3rem 0.5rem', cursor: 'pointer', color: 'var(--primary)' }}>
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => deleteInd(ind.id)}
                            style={{ background: '#fee2e2', border: 'none', borderRadius: '0.4rem', padding: '0.3rem 0.5rem', cursor: 'pointer', color: '#b91c1c' }}>
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── MODAL TAMBAH / EDIT INDIKATOR ── */}
      {modalInd && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontWeight: 700, fontSize: '1.1rem', margin: 0 }}>{editInd ? 'Edit Indikator' : 'Tambah Indikator'}</h2>
              <button onClick={() => setModalInd(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <form onSubmit={saveInd} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Nama Indikator *</label>
                <input required value={formInd.nama} onChange={e => setFormInd(f => ({ ...f, nama: e.target.value }))}
                  placeholder="Cth: Kedisiplinan Kehadiran" style={inp} />
              </div>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Deskripsi</label>
                <textarea value={formInd.deskripsi} onChange={e => setFormInd(f => ({ ...f, deskripsi: e.target.value }))}
                  rows={2} style={{ ...inp, resize: 'vertical' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Tipe Pengisian *</label>
                <select value={formInd.tipe} onChange={e => setFormInd(f => ({ ...f, tipe: e.target.value, source_field: '' }))} style={inp}>
                  <option value="Manual">Manual — diisi penilai</option>
                  <option value="Otomatis">Otomatis — tarik dari data absensi</option>
                </select>
              </div>
              {formInd.tipe === 'Otomatis' && (
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Sumber Data Absensi *</label>
                  <select value={formInd.source_field} onChange={e => setFormInd(f => ({ ...f, source_field: e.target.value }))} style={inp}>
                    <option value="">-- Pilih sumber data --</option>
                    {SOURCE_FIELDS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Berlaku Untuk Role</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {ROLES.map(r => (
                    <button type="button" key={r} onClick={() => toggleRole(r)}
                      style={{
                        padding: '0.3rem 0.7rem', borderRadius: 999, border: '1.5px solid', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                        borderColor: formInd.role_target.includes(r) ? 'var(--primary)' : 'var(--glass-border)',
                        background: formInd.role_target.includes(r) ? 'rgba(79,70,229,0.12)' : 'transparent',
                        color: formInd.role_target.includes(r) ? 'var(--primary)' : 'var(--text-secondary)',
                      }}>
                      {r}
                    </button>
                  ))}
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0.3rem 0 0' }}>
                  Kosongkan = berlaku untuk semua role
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input type="checkbox" id="ind_aktif" checked={formInd.aktif}
                  onChange={e => setFormInd(f => ({ ...f, aktif: e.target.checked }))} style={{ width: 16, height: 16 }} />
                <label htmlFor="ind_aktif" style={{ fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>Indikator Aktif</label>
              </div>
              <div style={{ display: 'flex', gap: '0.65rem', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                <button type="button" className="btn" onClick={() => setModalInd(false)}>Batal</button>
                <button type="submit" className="btn btn-primary">Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL SET TARGET ── */}
      {targetIndId && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 620 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div>
                <h2 style={{ fontWeight: 700, fontSize: '1.05rem', margin: 0 }}>Target — {targetInd?.nama}</h2>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0' }}>
                  Bobot & target nilai per periode. Total bobot semua indikator sebaiknya = 100%.
                </p>
              </div>
              <button onClick={() => setTargetIndId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            {/* List target yang ada */}
            {targets.length > 0 && (
              <div style={{ marginBottom: '1.25rem', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--glass-border)' }}>
                      {['Periode', 'Bobot', 'Target', 'Satuan', ''].map(h => (
                        <th key={h} style={{ padding: '0.5rem 0.65rem', textAlign: 'left', fontWeight: 700, fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {targets.map(t => (
                      <tr key={t.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                        <td style={{ padding: '0.55rem 0.65rem', fontWeight: 600 }}>
                          {t.periode_bulan ? `${BULAN_LABEL[t.periode_bulan]} ${t.periode_tahun}` : `Tahun ${t.periode_tahun}`}
                        </td>
                        <td style={{ padding: '0.55rem 0.65rem' }}>{t.bobot}%</td>
                        <td style={{ padding: '0.55rem 0.65rem' }}>{t.target_nilai}</td>
                        <td style={{ padding: '0.55rem 0.65rem' }}>{t.satuan}</td>
                        <td style={{ padding: '0.55rem 0.65rem' }}>
                          {isAdmin && (
                            <div style={{ display: 'flex', gap: '0.3rem' }}>
                              <button onClick={() => startEditTarget(t)}
                                style={{ background: 'rgba(79,70,229,0.1)', border: 'none', borderRadius: '0.35rem', padding: '0.25rem 0.4rem', cursor: 'pointer', color: 'var(--primary)' }}>
                                <Pencil size={12} />
                              </button>
                              <button onClick={() => deleteTarget(t.id)}
                                style={{ background: '#fee2e2', border: 'none', borderRadius: '0.35rem', padding: '0.25rem 0.4rem', cursor: 'pointer', color: '#b91c1c' }}>
                                <Trash2 size={12} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Form tambah / edit target */}
            {isAdmin && (
              <div style={{ background: 'rgba(79,70,229,0.04)', borderRadius: '0.75rem', padding: '1rem', border: '1px solid var(--glass-border)' }}>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.85rem' }}>
                  {editTargetId ? 'Edit Target' : 'Tambah Target Baru'}
                </div>
                <form onSubmit={saveTarget}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.65rem', marginBottom: '0.65rem' }}>
                    <div>
                      <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Tahun *</label>
                      <input type="number" required min={2020} max={2099} value={formTarget.periode_tahun}
                        onChange={e => setFormTarget(f => ({ ...f, periode_tahun: e.target.value }))} style={inp} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Bulan (kosong = semua)</label>
                      <select value={formTarget.periode_bulan}
                        onChange={e => setFormTarget(f => ({ ...f, periode_bulan: e.target.value }))} style={inp}>
                        <option value="">Semua bulan</option>
                        {BULAN_LABEL.slice(1).map((b, i) => <option key={i + 1} value={i + 1}>{b}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Satuan *</label>
                      <select value={formTarget.satuan}
                        onChange={e => setFormTarget(f => ({ ...f, satuan: e.target.value }))} style={inp}>
                        {SATUAN_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Bobot (%) *</label>
                      <input type="number" required min={0} max={100} step={0.01} value={formTarget.bobot}
                        onChange={e => setFormTarget(f => ({ ...f, bobot: e.target.value }))} style={inp} placeholder="Cth: 25" />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Target Nilai *</label>
                      <input type="number" required min={0} step={0.01} value={formTarget.target_nilai}
                        onChange={e => setFormTarget(f => ({ ...f, target_nilai: e.target.value }))} style={inp} placeholder="Cth: 95" />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.4rem' }}>
                      {editTargetId && (
                        <button type="button" className="btn" onClick={() => { setEditTargetId(null); setFormTarget({ periode_tahun: THIS_YEAR, periode_bulan: '', bobot: '', target_nilai: '', satuan: '%' }); }}>
                          Batal
                        </button>
                      )}
                      <button type="submit" className="btn btn-primary" disabled={savingTarget} style={{ flex: 1 }}>
                        {savingTarget ? 'Menyimpan...' : (editTargetId ? 'Update' : 'Tambah')}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
