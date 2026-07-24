import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, X, BellRing, Play, CheckCircle2, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/authStore';

const PRIORITAS_COLOR = { Tinggi: '#ef4444', Sedang: '#f59e0b', Rendah: '#22c55e' };
const STATUS_META = {
  menunggu:     { label: 'Menunggu',     color: '#92400e', bg: '#fef3c7', Icon: Clock },
  sudah_dibuat: { label: 'Sudah dibuat', color: '#047857', bg: '#d1fae5', Icon: CheckCircle2 },
  batal:        { label: 'Dibatalkan',   color: '#6b7280', bg: '#f3f4f6', Icon: X },
};
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

const todayStr = () => new Date().toISOString().split('T')[0];

const EMPTY = {
  judul: '', deskripsi: '', tanggal_pengingat: '', unit_id: '', project_id: '',
  stage_id_awal: '', prioritas: 'Sedang', label_id: '', deadline: '',
  assignee_guru_ids: [],
};

export default function TaskReminderPage() {
  const { user } = useAuth();
  const isOwner = user?.role === 'Owner';

  const [reminders, setReminders] = useState([]);
  const [units, setUnits]   = useState([]);
  const [stages, setStages] = useState([]);
  const [labels, setLabels] = useState([]);
  const [gurus, setGurus]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [firing, setFiring]   = useState(false);

  const [modal, setModal]   = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm]     = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  // Project bergantung pada unit yang dipilih
  const [projects, setProjects] = useState([]);

  useEffect(() => { if (isOwner) loadBase(); }, [isOwner]);
  useEffect(() => {
    if (form.unit_id) {
      supabase.from('task_projects').select('id, nama').eq('unit_id', form.unit_id).eq('status', 'aktif').order('nama')
        .then(r => setProjects(r.data || []));
    } else setProjects([]);
  }, [form.unit_id]);

  const loadBase = async () => {
    setLoading(true);
    const [rmRes, uRes, stRes, lbRes, grRes] = await Promise.all([
      supabase.from('task_reminders').select('*, units(nama), task_projects(nama), task_stages(nama,warna), task_labels(nama,warna)').order('tanggal_pengingat', { ascending: true }),
      supabase.from('units').select('id, nama').eq('aktif', true).order('nama'),
      supabase.from('task_stages').select('*').order('urutan'),
      supabase.from('task_labels').select('*').order('nama'),
      supabase.from('gurus').select('id, nama').eq('status', 'Aktif').order('nama'),
    ]);
    setReminders(rmRes.data || []);
    setUnits(uRes.data || []);
    setStages(stRes.data || []);
    setLabels(lbRes.data || []);
    setGurus(grRes.data || []);
    setLoading(false);
  };

  const openAdd = () => {
    setEditId(null);
    setForm({ ...EMPTY, tanggal_pengingat: todayStr(), assignee_guru_ids: user?.id ? [user.id] : [] });
    setModal(true);
  };

  const openEdit = (r) => {
    setEditId(r.id);
    setForm({
      judul: r.judul,
      deskripsi: r.deskripsi || '',
      tanggal_pengingat: r.tanggal_pengingat || '',
      unit_id: r.unit_id,
      project_id: r.project_id || '',
      stage_id_awal: r.stage_id_awal || '',
      prioritas: r.prioritas,
      label_id: r.label_id || '',
      deadline: r.deadline ? r.deadline.slice(0, 16) : '',
      assignee_guru_ids: r.assignee_guru_ids || [],
    });
    setModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.judul.trim() || !form.unit_id || !form.tanggal_pengingat) return alert('Judul, Unit, dan Tanggal Pengingat wajib diisi.');
    setSaving(true);
    const payload = {
      judul: form.judul.trim(),
      deskripsi: form.deskripsi || null,
      tanggal_pengingat: form.tanggal_pengingat,
      unit_id: form.unit_id,
      project_id: form.project_id || null,
      stage_id_awal: form.stage_id_awal || null,
      prioritas: form.prioritas,
      label_id: form.label_id || null,
      deadline: form.deadline ? new Date(form.deadline).toISOString() : null,
      assignee_guru_ids: form.assignee_guru_ids,
    };
    const { error } = editId
      ? await supabase.from('task_reminders').update(payload).eq('id', editId)
      : await supabase.from('task_reminders').insert({ ...payload, dibuat_oleh: user?.id });
    setSaving(false);
    if (error) return alert('Gagal: ' + error.message);
    setModal(false);
    loadBase();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Hapus pengingat ini? Task yang sudah terlanjur dibuat tidak ikut terhapus.')) return;
    await supabase.from('task_reminders').delete().eq('id', id);
    loadBase();
  };

  const handleBatal = async (r) => {
    if (!window.confirm('Batalkan pengingat ini? Tidak akan berubah menjadi tugas.')) return;
    await supabase.from('task_reminders').update({ status: 'batal' }).eq('id', r.id);
    loadBase();
  };

  // Jalankan materialisasi manual (uji coba) — memanggil fungsi yang sama dengan pg_cron
  const handleFireNow = async () => {
    if (!window.confirm('Proses semua pengingat yang sudah jatuh tempo sekarang menjadi tugas?')) return;
    setFiring(true);
    const { data, error } = await supabase.rpc('task_fire_reminders');
    setFiring(false);
    if (error) return alert('Gagal: ' + error.message);
    alert(`${data ?? 0} pengingat diproses menjadi tugas.`);
    loadBase();
  };

  const toggleAssignee = (id) => {
    setForm(f => ({
      ...f,
      assignee_guru_ids: f.assignee_guru_ids.includes(id)
        ? f.assignee_guru_ids.filter(g => g !== id)
        : [...f.assignee_guru_ids, id],
    }));
  };

  if (!isOwner) {
    return (
      <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <BellRing size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.3 }} />
        <p style={{ margin: 0 }}>Menu ini hanya dapat diakses oleh Owner.</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tugas</p>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>Pengingat</h1>
          <p style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0' }}>Saat tanggalnya tiba, pengingat otomatis menjadi tugas & ter-assign sesuai pengaturan.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }} onClick={handleFireNow} disabled={firing} title="Proses pengingat jatuh tempo sekarang (biasanya otomatis 00:00)">
            <Play size={15} /> {firing ? 'Memproses...' : 'Jalankan sekarang'}
          </button>
          <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }} onClick={openAdd}>
            <Plus size={15} /> Tambah Pengingat
          </button>
        </div>
      </div>

      {loading ? <p style={{ color: 'var(--text-secondary)' }}>Memuat...</p> : reminders.length === 0 ? (
        <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <BellRing size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.3 }} />
          <p style={{ margin: 0 }}>Belum ada pengingat.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {reminders.map(r => {
            const sm = STATUS_META[r.status] || STATUS_META.menunggu;
            const namaAssignee = (r.assignee_guru_ids || []).map(id => gurus.find(g => g.id === id)?.nama).filter(Boolean);
            return (
              <div key={r.id} className="glass-card" style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', opacity: r.status === 'batal' ? 0.6 : 1 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{r.judul}</span>
                    <span style={{ background: sm.bg, color: sm.color, padding: '0.1rem 0.5rem', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                      <sm.Icon size={12} /> {sm.label}
                    </span>
                    <span style={{ background: PRIORITAS_COLOR[r.prioritas] + '22', color: PRIORITAS_COLOR[r.prioritas], padding: '0.1rem 0.5rem', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700 }}>
                      {r.prioritas}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <span>🔔 {fmtDate(r.tanggal_pengingat)}</span>
                    <span>{r.units?.nama || '-'}</span>
                    {r.task_projects && <span>📁 {r.task_projects.nama}</span>}
                    {namaAssignee.length > 0 && <span>👤 {namaAssignee.join(', ')}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                  {r.status === 'menunggu' && (
                    <>
                      <button onClick={() => openEdit(r)} title="Edit"
                        style={{ background: 'rgba(79,70,229,0.08)', border: 'none', borderRadius: '0.35rem', padding: '0.3rem 0.5rem', cursor: 'pointer', color: 'var(--primary)' }}>
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => handleBatal(r)} title="Batalkan"
                        style={{ background: '#fef3c7', border: 'none', borderRadius: '0.35rem', padding: '0.3rem 0.5rem', cursor: 'pointer', color: '#92400e' }}>
                        <X size={13} />
                      </button>
                    </>
                  )}
                  <button onClick={() => handleDelete(r.id)} title="Hapus"
                    style={{ background: '#fee2e2', border: 'none', borderRadius: '0.35rem', padding: '0.3rem 0.5rem', cursor: 'pointer', color: '#b91c1c' }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal-content" style={{ maxWidth: 540, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.1rem' }}>
              <h2 style={{ fontWeight: 700, fontSize: '1rem', margin: 0 }}>{editId ? 'Edit Pengingat' : 'Tambah Pengingat'}</h2>
              <button onClick={() => setModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>{lb('Judul Tugas', true)}
                <input style={inp} value={form.judul} onChange={e => setForm(f => ({ ...f, judul: e.target.value }))} required placeholder="mis. Bayar tagihan internet" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>{lb('Tanggal Pengingat', true)}
                  <input type="date" style={inp} value={form.tanggal_pengingat} onChange={e => setForm(f => ({ ...f, tanggal_pengingat: e.target.value }))} required />
                </div>
                <div>{lb('Deadline Tugas')}
                  <input type="datetime-local" style={inp} value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} />
                </div>
              </div>

              <div>{lb('Unit / Cabang', true)}
                <select style={inp} value={form.unit_id} onChange={e => setForm(f => ({ ...f, unit_id: e.target.value, project_id: '' }))} required>
                  <option value="">-- Pilih Unit --</option>
                  {units.map(u => <option key={u.id} value={u.id}>{u.nama}</option>)}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>{lb('Project')}
                  <select style={inp} value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}>
                    <option value="">-- Tidak ada --</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.nama}</option>)}
                  </select>
                </div>
                <div>{lb('Stage Awal')}
                  <select style={inp} value={form.stage_id_awal} onChange={e => setForm(f => ({ ...f, stage_id_awal: e.target.value }))}>
                    <option value="">-- Default --</option>
                    {stages.map(s => <option key={s.id} value={s.id}>{s.nama}</option>)}
                  </select>
                </div>
                <div>{lb('Prioritas')}
                  <select style={inp} value={form.prioritas} onChange={e => setForm(f => ({ ...f, prioritas: e.target.value }))}>
                    <option value="Tinggi">Tinggi</option>
                    <option value="Sedang">Sedang</option>
                    <option value="Rendah">Rendah</option>
                  </select>
                </div>
                <div>{lb('Label')}
                  <select style={inp} value={form.label_id} onChange={e => setForm(f => ({ ...f, label_id: e.target.value }))}>
                    <option value="">-- Tidak ada --</option>
                    {labels.map(l => <option key={l.id} value={l.id}>{l.nama}</option>)}
                  </select>
                </div>
              </div>

              <div>
                {lb('Assign ke (pilih beberapa)')}
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                  {gurus.map(g => (
                    <button key={g.id} type="button" onClick={() => toggleAssignee(g.id)}
                      style={{ padding: '0.28rem 0.55rem', borderRadius: '0.4rem', border: '1.5px solid', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, transition: 'all 0.15s',
                        borderColor: form.assignee_guru_ids.includes(g.id) ? 'var(--primary)' : 'var(--glass-border)',
                        background: form.assignee_guru_ids.includes(g.id) ? 'rgba(79,70,229,0.1)' : 'transparent',
                        color: form.assignee_guru_ids.includes(g.id) ? 'var(--primary)' : 'var(--text-secondary)',
                      }}>
                      {g.nama}{g.id === user?.id ? ' (Saya)' : ''}
                    </button>
                  ))}
                </div>
              </div>

              <div>{lb('Deskripsi')}
                <textarea rows={2} style={{ ...inp, resize: 'vertical' }} value={form.deskripsi} onChange={e => setForm(f => ({ ...f, deskripsi: e.target.value }))} />
              </div>

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
