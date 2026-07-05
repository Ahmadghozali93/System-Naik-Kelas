import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, X, RotateCcw, Power } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/authStore';

const HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const FREQ_LABEL = { harian: 'Harian', mingguan: 'Mingguan', bulanan: 'Bulanan' };
const FREQ_COLOR = { harian: '#3b82f6', mingguan: '#8b5cf6', bulanan: '#f59e0b' };
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

const inp = {
  width: '100%', padding: '0.5rem 0.7rem', borderRadius: '0.5rem',
  border: '1px solid var(--glass-border)', background: 'var(--surface-color)',
  fontFamily: 'inherit', fontSize: '0.875rem', color: 'var(--text-primary)', boxSizing: 'border-box',
};
const lb = (text, req) => (
  <label style={{ display: 'block', marginBottom: '0.28rem', fontWeight: 600, fontSize: '0.73rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
    {text}{req && <span style={{ color: '#ef4444' }}> *</span>}
  </label>
);

const EMPTY = {
  judul_template: '', deskripsi_template: '', unit_id: '', project_id: '',
  stage_id_awal: '', prioritas: 'Sedang', label_id: '',
  frekuensi: 'harian', hari_dalam_minggu: [], tanggal_dalam_bulan: 1,
  assignee_guru_ids: [], next_run_date: '', aktif: true,
};

export default function TaskRecurringPage() {
  const { user } = useAuth();
  const isAdmin = ['Owner', 'Administrator', 'Supervisor'].includes(user?.role);

  const [rules, setRules]     = useState([]);
  const [units, setUnits]     = useState([]);
  const [stages, setStages]   = useState([]);
  const [labels, setLabels]   = useState([]);
  const [loading, setLoading] = useState(true);

  const [modal, setModal]   = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm]     = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  // Data yang bergantung pada unit yang dipilih
  const [projects, setProjects] = useState([]);
  const [gurus, setGurus]       = useState([]);

  useEffect(() => { loadBase(); }, []);
  useEffect(() => { if (form.unit_id) loadUnitData(form.unit_id); else { setProjects([]); setGurus([]); } }, [form.unit_id]);

  const loadBase = async () => {
    setLoading(true);
    const [rRes, uRes, stRes, lbRes] = await Promise.all([
      supabase.from('task_recurring_rules').select('*, units(nama), task_projects(nama), task_stages(nama,warna)').order('created_at', { ascending: false }),
      supabase.from('units').select('id, nama').eq('aktif', true).order('nama'),
      supabase.from('task_stages').select('*').order('urutan'),
      supabase.from('task_labels').select('*').order('nama'),
    ]);
    setRules(rRes.data || []);
    setUnits(uRes.data || []);
    setStages(stRes.data || []);
    setLabels(lbRes.data || []);
    setLoading(false);
  };

  const loadUnitData = async (unitId) => {
    const [prRes, grRes] = await Promise.all([
      supabase.from('task_projects').select('id, nama').eq('unit_id', unitId).eq('status', 'aktif').order('nama'),
      supabase.from('guru_units').select('guru_id, gurus(id, nama)').eq('unit_id', unitId),
    ]);
    setProjects(prRes.data || []);
    setGurus((grRes.data || []).map(g => g.gurus).filter(Boolean));
  };

  const openAdd = () => {
    setEditId(null);
    setForm({ ...EMPTY, next_run_date: new Date().toISOString().split('T')[0] });
    setModal(true);
  };

  const openEdit = (r) => {
    setEditId(r.id);
    setForm({
      judul_template: r.judul_template,
      deskripsi_template: r.deskripsi_template || '',
      unit_id: r.unit_id,
      project_id: r.project_id || '',
      stage_id_awal: r.stage_id_awal || '',
      prioritas: r.prioritas,
      label_id: r.label_id || '',
      frekuensi: r.frekuensi,
      hari_dalam_minggu: r.hari_dalam_minggu || [],
      tanggal_dalam_bulan: r.tanggal_dalam_bulan || 1,
      assignee_guru_ids: r.assignee_guru_ids || [],
      next_run_date: r.next_run_date || '',
      aktif: r.aktif,
    });
    setModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.judul_template.trim() || !form.unit_id || !form.next_run_date) return alert('Judul, Unit, dan Tanggal Mulai wajib diisi.');
    setSaving(true);
    const payload = {
      judul_template: form.judul_template.trim(),
      deskripsi_template: form.deskripsi_template || null,
      unit_id: form.unit_id,
      project_id: form.project_id || null,
      stage_id_awal: form.stage_id_awal || null,
      prioritas: form.prioritas,
      label_id: form.label_id || null,
      frekuensi: form.frekuensi,
      hari_dalam_minggu: form.frekuensi === 'mingguan' ? form.hari_dalam_minggu : null,
      tanggal_dalam_bulan: form.frekuensi === 'bulanan' ? Number(form.tanggal_dalam_bulan) : null,
      assignee_guru_ids: form.assignee_guru_ids,
      next_run_date: form.next_run_date,
      aktif: form.aktif,
    };
    const { error } = editId
      ? await supabase.from('task_recurring_rules').update(payload).eq('id', editId)
      : await supabase.from('task_recurring_rules').insert({ ...payload, dibuat_oleh: user?.id });
    setSaving(false);
    if (error) return alert('Gagal: ' + error.message);
    setModal(false);
    loadBase();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Hapus aturan rutin ini? Task yang sudah dibuat tidak ikut terhapus.')) return;
    await supabase.from('task_recurring_rules').delete().eq('id', id);
    loadBase();
  };

  const toggleAktif = async (rule) => {
    await supabase.from('task_recurring_rules').update({ aktif: !rule.aktif }).eq('id', rule.id);
    setRules(prev => prev.map(r => r.id === rule.id ? { ...r, aktif: !r.aktif } : r));
  };

  const toggleHari = (idx) => {
    setForm(f => ({
      ...f,
      hari_dalam_minggu: f.hari_dalam_minggu.includes(idx)
        ? f.hari_dalam_minggu.filter(d => d !== idx)
        : [...f.hari_dalam_minggu, idx],
    }));
  };

  const toggleAssignee = (id) => {
    setForm(f => ({
      ...f,
      assignee_guru_ids: f.assignee_guru_ids.includes(id)
        ? f.assignee_guru_ids.filter(g => g !== id)
        : [...f.assignee_guru_ids, id],
    }));
  };

  const sel = { padding: '0.42rem 0.65rem', borderRadius: '0.4rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontFamily: 'inherit', fontSize: '0.8rem' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tugas</p>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>Tugas Rutin</h1>
          <p style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0' }}>Task yang dibuat otomatis sesuai jadwal (harian / mingguan / bulanan).</p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }} onClick={openAdd}>
            <Plus size={15} /> Tambah Aturan
          </button>
        )}
      </div>

      {loading ? <p style={{ color: 'var(--text-secondary)' }}>Memuat...</p> : rules.length === 0 ? (
        <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <RotateCcw size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.3 }} />
          <p style={{ margin: 0 }}>Belum ada aturan tugas rutin.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {rules.map(r => (
            <div key={r.id} className="glass-card" style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{r.judul_template}</span>
                  <span style={{ background: FREQ_COLOR[r.frekuensi] + '22', color: FREQ_COLOR[r.frekuensi], padding: '0.1rem 0.5rem', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700 }}>
                    {FREQ_LABEL[r.frekuensi]}
                  </span>
                  <span style={{ background: r.aktif ? '#d1fae5' : '#f3f4f6', color: r.aktif ? '#047857' : '#6b7280', padding: '0.1rem 0.45rem', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700 }}>
                    {r.aktif ? 'Aktif' : 'Nonaktif'}
                  </span>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <span>{r.units?.nama || '-'}</span>
                  {r.task_projects && <span>📁 {r.task_projects.nama}</span>}
                  {r.frekuensi === 'mingguan' && r.hari_dalam_minggu?.length > 0 && (
                    <span>{r.hari_dalam_minggu.map(d => HARI[d]).join(', ')}</span>
                  )}
                  {r.frekuensi === 'bulanan' && r.tanggal_dalam_bulan && (
                    <span>Tgl {r.tanggal_dalam_bulan}</span>
                  )}
                  <span>▶ {fmtDate(r.next_run_date)}</span>
                </div>
              </div>
              {isAdmin && (
                <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                  <button onClick={() => toggleAktif(r)} title={r.aktif ? 'Nonaktifkan' : 'Aktifkan'}
                    style={{ background: r.aktif ? '#fef3c7' : '#d1fae5', border: 'none', borderRadius: '0.35rem', padding: '0.3rem 0.5rem', cursor: 'pointer', color: r.aktif ? '#92400e' : '#047857' }}>
                    <Power size={13} />
                  </button>
                  <button onClick={() => openEdit(r)}
                    style={{ background: 'rgba(79,70,229,0.08)', border: 'none', borderRadius: '0.35rem', padding: '0.3rem 0.5rem', cursor: 'pointer', color: 'var(--primary)' }}>
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => handleDelete(r.id)}
                    style={{ background: '#fee2e2', border: 'none', borderRadius: '0.35rem', padding: '0.3rem 0.5rem', cursor: 'pointer', color: '#b91c1c' }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal-content" style={{ maxWidth: 540, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.1rem' }}>
              <h2 style={{ fontWeight: 700, fontSize: '1rem', margin: 0 }}>{editId ? 'Edit Aturan Rutin' : 'Tambah Aturan Rutin'}</h2>
              <button onClick={() => setModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {/* Judul */}
              <div>{lb('Judul Template', true)}
                <input style={inp} value={form.judul_template} onChange={e => setForm(f => ({ ...f, judul_template: e.target.value }))} required placeholder="mis. Laporan Harian Keuangan" />
              </div>

              {/* Unit */}
              <div>{lb('Unit / Cabang', true)}
                <select style={inp} value={form.unit_id} onChange={e => setForm(f => ({ ...f, unit_id: e.target.value, project_id: '', assignee_guru_ids: [] }))} required>
                  <option value="">-- Pilih Unit --</option>
                  {units.map(u => <option key={u.id} value={u.id}>{u.nama}</option>)}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                {/* Project */}
                <div>{lb('Project')}
                  <select style={inp} value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}>
                    <option value="">-- Tidak ada --</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.nama}</option>)}
                  </select>
                </div>
                {/* Stage awal */}
                <div>{lb('Stage Awal')}
                  <select style={inp} value={form.stage_id_awal} onChange={e => setForm(f => ({ ...f, stage_id_awal: e.target.value }))}>
                    <option value="">-- Default --</option>
                    {stages.map(s => <option key={s.id} value={s.id}>{s.nama}</option>)}
                  </select>
                </div>
                {/* Prioritas */}
                <div>{lb('Prioritas')}
                  <select style={inp} value={form.prioritas} onChange={e => setForm(f => ({ ...f, prioritas: e.target.value }))}>
                    <option value="Tinggi">Tinggi</option>
                    <option value="Sedang">Sedang</option>
                    <option value="Rendah">Rendah</option>
                  </select>
                </div>
                {/* Label */}
                <div>{lb('Label')}
                  <select style={inp} value={form.label_id} onChange={e => setForm(f => ({ ...f, label_id: e.target.value }))}>
                    <option value="">-- Tidak ada --</option>
                    {labels.map(l => <option key={l.id} value={l.id}>{l.nama}</option>)}
                  </select>
                </div>
              </div>

              {/* Frekuensi */}
              <div>{lb('Frekuensi', true)}
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {['harian', 'mingguan', 'bulanan'].map(f => (
                    <button key={f} type="button" onClick={() => setForm(p => ({ ...p, frekuensi: f }))}
                      style={{ flex: 1, padding: '0.45rem', borderRadius: '0.5rem', border: '2px solid', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem', transition: 'all 0.15s',
                        borderColor: form.frekuensi === f ? FREQ_COLOR[f] : 'var(--glass-border)',
                        background: form.frekuensi === f ? FREQ_COLOR[f] + '18' : 'transparent',
                        color: form.frekuensi === f ? FREQ_COLOR[f] : 'var(--text-secondary)',
                      }}>
                      {FREQ_LABEL[f]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Hari dalam minggu */}
              {form.frekuensi === 'mingguan' && (
                <div>
                  {lb('Hari', true)}
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                    {HARI.map((h, i) => (
                      <button key={i} type="button" onClick={() => toggleHari(i)}
                        style={{ padding: '0.3rem 0.6rem', borderRadius: '0.4rem', border: '1.5px solid', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, transition: 'all 0.15s',
                          borderColor: form.hari_dalam_minggu.includes(i) ? '#8b5cf6' : 'var(--glass-border)',
                          background: form.hari_dalam_minggu.includes(i) ? '#8b5cf622' : 'transparent',
                          color: form.hari_dalam_minggu.includes(i) ? '#8b5cf6' : 'var(--text-secondary)',
                        }}>
                        {h}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Tanggal dalam bulan */}
              {form.frekuensi === 'bulanan' && (
                <div>{lb('Tanggal dalam Bulan', true)}
                  <input type="number" min={1} max={28} style={{ ...inp, width: 80 }}
                    value={form.tanggal_dalam_bulan} onChange={e => setForm(f => ({ ...f, tanggal_dalam_bulan: e.target.value }))} />
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>Maks 28 agar aman di semua bulan</span>
                </div>
              )}

              {/* Tanggal mulai */}
              <div>{lb('Tanggal Mulai (Pertama Kali Generate)', true)}
                <input type="date" style={{ ...inp, width: 'auto' }} value={form.next_run_date} onChange={e => setForm(f => ({ ...f, next_run_date: e.target.value }))} required />
              </div>

              {/* Assignees */}
              {gurus.length > 0 && (
                <div>
                  {lb('Assignee (Pilih beberapa)')}
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                    {gurus.map(g => (
                      <button key={g.id} type="button" onClick={() => toggleAssignee(g.id)}
                        style={{ padding: '0.28rem 0.55rem', borderRadius: '0.4rem', border: '1.5px solid', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, transition: 'all 0.15s',
                          borderColor: form.assignee_guru_ids.includes(g.id) ? 'var(--primary)' : 'var(--glass-border)',
                          background: form.assignee_guru_ids.includes(g.id) ? 'rgba(79,70,229,0.1)' : 'transparent',
                          color: form.assignee_guru_ids.includes(g.id) ? 'var(--primary)' : 'var(--text-secondary)',
                        }}>
                        {g.nama}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Deskripsi */}
              <div>{lb('Deskripsi Template')}
                <textarea rows={2} style={{ ...inp, resize: 'vertical' }} value={form.deskripsi_template} onChange={e => setForm(f => ({ ...f, deskripsi_template: e.target.value }))} />
              </div>

              {/* Aktif */}
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.875rem' }}>
                <input type="checkbox" checked={form.aktif} onChange={e => setForm(f => ({ ...f, aktif: e.target.checked }))} style={{ accentColor: 'var(--primary)', width: 16, height: 16 }} />
                <span>Aktif (generate task sesuai jadwal)</span>
              </label>

              <div style={{ display: 'flex', gap: '0.65rem', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                <button type="button" className="btn" onClick={() => setModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
