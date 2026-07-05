import { useState, useEffect, useCallback } from 'react';
import { X, Plus, Trash2, Send, CheckSquare, Square, User, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/authStore';
import AttachmentUploader from '../../components/tasks/AttachmentUploader';

const PRIORITAS_COLOR = { Tinggi: '#ef4444', Sedang: '#f59e0b', Rendah: '#22c55e' };
const fmtDT = (d) => d ? new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

const inp = {
  width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.5rem',
  border: '1px solid var(--glass-border)', background: 'var(--surface-color)',
  fontFamily: 'inherit', fontSize: '0.875rem', color: 'var(--text-primary)',
  boxSizing: 'border-box',
};
const lb = (text, req) => (
  <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600, fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
    {text}{req && <span style={{ color: '#ef4444' }}> *</span>}
  </label>
);

export default function TaskDetailModal({ taskId, defaultStageId, defaultUnitId, onClose, onSaved }) {
  const { user } = useAuth();
  const isNew = !taskId;

  const [task, setTask]             = useState(null);
  const [stages, setStages]         = useState([]);
  const [labels, setLabels]         = useState([]);
  const [projects, setProjects]     = useState([]);
  const [unitGurus, setUnitGurus]   = useState([]);
  const [assignees, setAssignees]   = useState([]);
  const [checklists, setChecklists] = useState([]);
  const [comments, setComments]     = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [units, setUnits]           = useState([]);

  const [loading, setLoading]   = useState(!isNew);
  const [saving, setSaving]     = useState(false);
  const [newComment, setNewComment] = useState('');
  const [newCheckItem, setNewCheckItem] = useState('');

  // Form state
  const [form, setForm] = useState({
    judul: '', deskripsi: '',
    stage_id: defaultStageId || '',
    unit_id: defaultUnitId || '',
    prioritas: 'Sedang',
    deadline: '',
    label_id: '',
    project_id: '',
  });

  const isAdmin = ['Owner', 'Administrator', 'Supervisor'].includes(user?.role);
  const canEdit = isNew || isAdmin || task?.dibuat_oleh === user?.id || assignees.some(a => a.guru_id === user?.id);

  // ── Fetch base data ──
  useEffect(() => {
    const load = async () => {
      const [stRes, lbRes, unRes] = await Promise.all([
        supabase.from('task_stages').select('*').order('urutan'),
        supabase.from('task_labels').select('*').order('nama'),
        supabase.from('units').select('id, nama').eq('aktif', true).order('nama'),
      ]);
      setStages(stRes.data || []);
      setLabels(lbRes.data || []);
      setUnits(unRes.data || []);

      if (!isNew) await loadTask();
      else setLoading(false);
    };
    load();
  }, [taskId]);

  // ── Load projects when unit changes ──
  useEffect(() => {
    if (!form.unit_id) { setProjects([]); return; }
    supabase.from('task_projects').select('id, nama').eq('unit_id', form.unit_id).eq('status', 'aktif')
      .order('nama')
      .then(({ data }) => setProjects(data || []));
    supabase.from('guru_units').select('guru_id').eq('unit_id', form.unit_id)
      .then(async ({ data: guData }) => {
        if (!guData?.length) { setUnitGurus([]); return; }
        const { data: gData } = await supabase.from('gurus')
          .select('id, nama, role').in('id', guData.map(g => g.guru_id)).eq('status', 'Aktif').order('nama');
        setUnitGurus(gData || []);
      });
  }, [form.unit_id]);

  const loadTask = async () => {
    setLoading(true);
    const [tRes, aRes, clRes, coRes, atRes] = await Promise.all([
      supabase.from('tasks').select('*, task_stages(id,nama,warna,is_final), task_labels(id,nama,warna), task_projects(id,nama)').eq('id', taskId).single(),
      supabase.from('task_assignees').select('*, gurus(id, nama, role)').eq('task_id', taskId),
      supabase.from('task_checklists').select('*').eq('task_id', taskId).order('urutan'),
      supabase.from('task_comments').select('*, gurus(id, nama)').eq('task_id', taskId).order('created_at'),
      supabase.from('task_attachments').select('*').eq('task_id', taskId).order('uploaded_at'),
    ]);
    const t = tRes.data;
    if (t) {
      setTask(t);
      setForm({
        judul: t.judul || '',
        deskripsi: t.deskripsi || '',
        stage_id: t.stage_id || '',
        unit_id: t.unit_id || '',
        prioritas: t.prioritas || 'Sedang',
        deadline: t.deadline ? t.deadline.slice(0, 16) : '',
        label_id: t.label_id || '',
        project_id: t.project_id || '',
      });
    }
    setAssignees(aRes.data || []);
    setChecklists(clRes.data || []);
    setComments(coRes.data || []);
    setAttachments(atRes.data || []);
    setLoading(false);
  };

  // ── Save task ──
  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.judul.trim()) return alert('Judul task wajib diisi.');
    if (!form.unit_id) return alert('Unit wajib dipilih.');
    if (!form.stage_id) return alert('Stage wajib dipilih.');
    setSaving(true);

    const selectedStage = stages.find(s => s.id === form.stage_id);
    const payload = {
      judul:      form.judul.trim(),
      deskripsi:  form.deskripsi || null,
      stage_id:   form.stage_id,
      unit_id:    form.unit_id,
      prioritas:  form.prioritas,
      deadline:   form.deadline || null,
      label_id:   form.label_id || null,
      project_id: form.project_id || null,
    };

    // Set selesai_pada & is_late saat masuk stage final
    if (selectedStage?.is_final && !task?.selesai_pada) {
      payload.selesai_pada = new Date().toISOString();
      payload.is_late = form.deadline ? new Date() > new Date(form.deadline) : false;
    } else if (!selectedStage?.is_final && task?.selesai_pada) {
      payload.selesai_pada = null;
      payload.is_late = null;
    }

    let savedTask;
    if (isNew) {
      payload.dibuat_oleh = user?.id;
      const { data, error } = await supabase.from('tasks').insert(payload).select().single();
      if (error) { alert('Gagal: ' + error.message); setSaving(false); return; }
      savedTask = data;
    } else {
      const { data, error } = await supabase.from('tasks').update(payload).eq('id', taskId).select().single();
      if (error) { alert('Gagal: ' + error.message); setSaving(false); return; }
      savedTask = data;
    }

    setSaving(false);
    onSaved?.(savedTask);
    if (isNew) onClose(); // tutup modal setelah buat baru; user bisa buka lagi untuk edit detail
    else await loadTask();
  };

  // ── Assignees ──
  const addAssignee = async (guruId) => {
    if (assignees.some(a => a.guru_id === guruId)) return;
    const { error } = await supabase.from('task_assignees').insert({ task_id: taskId, guru_id: guruId });
    if (error) return alert('Gagal: ' + error.message);
    const guru = unitGurus.find(g => g.id === guruId);
    setAssignees(prev => [...prev, { guru_id: guruId, gurus: guru }]);
  };

  const removeAssignee = async (guruId) => {
    const { error } = await supabase.from('task_assignees').delete().eq('task_id', taskId).eq('guru_id', guruId);
    if (error) return alert('Gagal: ' + error.message);
    setAssignees(prev => prev.filter(a => a.guru_id !== guruId));
  };

  // ── Checklists ──
  const addCheckItem = async () => {
    const txt = newCheckItem.trim();
    if (!txt || !taskId) return;
    const { data, error } = await supabase.from('task_checklists')
      .insert({ task_id: taskId, teks: txt, urutan: checklists.length })
      .select().single();
    if (error) return alert('Gagal: ' + error.message);
    setChecklists(prev => [...prev, data]);
    setNewCheckItem('');
  };

  const toggleCheck = async (item) => {
    const { error } = await supabase.from('task_checklists')
      .update({ selesai: !item.selesai }).eq('id', item.id);
    if (error) return;
    setChecklists(prev => prev.map(c => c.id === item.id ? { ...c, selesai: !c.selesai } : c));
  };

  const deleteCheck = async (id) => {
    const { error } = await supabase.from('task_checklists').delete().eq('id', id);
    if (error) return alert('Gagal: ' + error.message);
    setChecklists(prev => prev.filter(c => c.id !== id));
  };

  // ── Comments ──
  const addComment = async () => {
    const txt = newComment.trim();
    if (!txt || !taskId) return;
    const { data, error } = await supabase.from('task_comments')
      .insert({ task_id: taskId, guru_id: user?.id, isi: txt })
      .select('*, gurus(id, nama)').single();
    if (error) return alert('Gagal: ' + error.message);
    setComments(prev => [...prev, data]);
    setNewComment('');
  };

  // ── Overdue check ──
  const isOverdue = task && !task.selesai_pada && task.deadline && new Date(task.deadline) < new Date();
  const doneCount = checklists.filter(c => c.selesai).length;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      zIndex: 1000, display: 'flex', alignItems: 'flex-start',
      justifyContent: 'center', padding: '1.5rem 1rem', overflowY: 'auto',
    }} onClick={onClose}>
      <div
        className="glass-card"
        style={{ width: '100%', maxWidth: 700, padding: '1.5rem', position: 'relative' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
          <div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {isNew ? 'Buat Task Baru' : 'Detail Task'}
            </p>
            {!isNew && task && (
              <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
                {task.task_stages && (
                  <span style={{ background: task.task_stages.warna + '22', color: task.task_stages.warna, padding: '0.15rem 0.55rem', borderRadius: 999, fontSize: '0.75rem', fontWeight: 700 }}>
                    {task.task_stages.nama}
                  </span>
                )}
                <span style={{ color: PRIORITAS_COLOR[task.prioritas], fontSize: '0.75rem', fontWeight: 700 }}>
                  ● {task.prioritas}
                </span>
                {isOverdue && (
                  <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '0.15rem 0.55rem', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                    <AlertCircle size={11} /> OVERDUE
                  </span>
                )}
                {task.selesai_pada && (
                  <span style={{ background: '#d1fae5', color: '#047857', padding: '0.15rem 0.55rem', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700 }}>
                    ✓ Selesai {fmtDate(task.selesai_pada)}
                  </span>
                )}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0.25rem', flexShrink: 0 }}>
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>Memuat...</p>
        ) : (
          <form onSubmit={handleSave}>
            {/* ── Fields ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginBottom: '1.25rem' }}>
              <div>
                {lb('Judul Task', true)}
                <input style={inp} value={form.judul} onChange={e => setForm(f => ({ ...f, judul: e.target.value }))} required disabled={!canEdit} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  {lb('Unit / Cabang', true)}
                  <select style={inp} value={form.unit_id} onChange={e => setForm(f => ({ ...f, unit_id: e.target.value, project_id: '' }))} required disabled={!isNew && !isAdmin}>
                    <option value="">-- Pilih Unit --</option>
                    {units.map(u => <option key={u.id} value={u.id}>{u.nama}</option>)}
                  </select>
                </div>
                <div>
                  {lb('Stage', true)}
                  <select style={inp} value={form.stage_id} onChange={e => setForm(f => ({ ...f, stage_id: e.target.value }))} required disabled={!canEdit}>
                    <option value="">-- Pilih Stage --</option>
                    {stages.map(s => <option key={s.id} value={s.id}>{s.nama}</option>)}
                  </select>
                </div>
                <div>
                  {lb('Prioritas')}
                  <select style={inp} value={form.prioritas} onChange={e => setForm(f => ({ ...f, prioritas: e.target.value }))} disabled={!canEdit}>
                    <option value="Tinggi">Tinggi</option>
                    <option value="Sedang">Sedang</option>
                    <option value="Rendah">Rendah</option>
                  </select>
                </div>
                <div>
                  {lb('Deadline')}
                  <input type="datetime-local" style={inp} value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} disabled={!canEdit} />
                </div>
                <div>
                  {lb('Label')}
                  <select style={inp} value={form.label_id} onChange={e => setForm(f => ({ ...f, label_id: e.target.value }))} disabled={!canEdit}>
                    <option value="">Tanpa Label</option>
                    {labels.map(l => <option key={l.id} value={l.id}>{l.nama}</option>)}
                  </select>
                </div>
                <div>
                  {lb('Project')}
                  <select style={inp} value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))} disabled={!canEdit}>
                    <option value="">Tanpa Project</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.nama}</option>)}
                  </select>
                </div>
              </div>

              <div>
                {lb('Deskripsi')}
                <textarea
                  rows={3}
                  style={{ ...inp, resize: 'vertical' }}
                  value={form.deskripsi}
                  onChange={e => setForm(f => ({ ...f, deskripsi: e.target.value }))}
                  disabled={!canEdit}
                  placeholder="Penjelasan tugas..."
                />
              </div>
            </div>

            {canEdit && (
              <div style={{ display: 'flex', gap: '0.65rem', marginBottom: '1.5rem' }}>
                <button type="submit" className="btn btn-primary" disabled={saving} style={{ flex: 1 }}>
                  {saving ? 'Menyimpan...' : isNew ? 'Buat Task' : 'Simpan Perubahan'}
                </button>
                <button type="button" className="btn" onClick={onClose} style={{ background: 'var(--surface-color)' }}>Batal</button>
              </div>
            )}
          </form>
        )}

        {/* ══ Bagian di bawah ini hanya tersedia untuk task yang sudah ada ══ */}
        {!isNew && !loading && (
          <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            {/* ── Assignees ── */}
            <section>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <User size={15} /> Ditugaskan kepada ({assignees.length})
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.5rem' }}>
                {assignees.map(a => (
                  <span key={a.guru_id} style={{
                    display: 'flex', alignItems: 'center', gap: '0.35rem',
                    background: 'rgba(79,70,229,0.08)', color: 'var(--primary)',
                    padding: '0.25rem 0.6rem', borderRadius: 999, fontSize: '0.8rem', fontWeight: 600,
                  }}>
                    {a.gurus?.nama || a.guru_id}
                    {canEdit && (
                      <button onClick={() => removeAssignee(a.guru_id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: 'inherit', opacity: 0.7 }}>
                        <X size={12} />
                      </button>
                    )}
                  </span>
                ))}
                {assignees.length === 0 && <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>Belum ada assignee</span>}
              </div>
              {canEdit && unitGurus.length > 0 && (
                <select
                  style={{ ...inp, width: 'auto', fontSize: '0.8rem' }}
                  value=""
                  onChange={e => { if (e.target.value) addAssignee(e.target.value); }}
                >
                  <option value="">+ Tambah assignee...</option>
                  {unitGurus.filter(g => !assignees.some(a => a.guru_id === g.id)).map(g => (
                    <option key={g.id} value={g.id}>{g.nama} ({g.role})</option>
                  ))}
                </select>
              )}
            </section>

            {/* ── Checklist ── */}
            <section>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.6rem' }}>
                Checklist {doneCount}/{checklists.length}
                {checklists.length > 0 && (
                  <div style={{ display: 'inline-block', marginLeft: '0.6rem', width: 80, height: 6, background: 'var(--glass-border)', borderRadius: 3, verticalAlign: 'middle' }}>
                    <div style={{ width: `${(doneCount / checklists.length) * 100}%`, height: '100%', background: '#22c55e', borderRadius: 3, transition: 'width 0.3s' }} />
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '0.6rem' }}>
                {checklists.map(item => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button type="button" onClick={() => toggleCheck(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: item.selesai ? '#22c55e' : 'var(--text-secondary)', padding: 0, flexShrink: 0 }}>
                      {item.selesai ? <CheckSquare size={17} /> : <Square size={17} />}
                    </button>
                    <span style={{ flex: 1, fontSize: '0.85rem', textDecoration: item.selesai ? 'line-through' : 'none', color: item.selesai ? 'var(--text-secondary)' : 'inherit' }}>
                      {item.teks}
                    </span>
                    {canEdit && (
                      <button type="button" onClick={() => deleteCheck(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c', opacity: 0.6, padding: 0 }}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {canEdit && (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    style={{ ...inp, flex: 1, fontSize: '0.82rem' }}
                    placeholder="Tambah item checklist..."
                    value={newCheckItem}
                    onChange={e => setNewCheckItem(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCheckItem())}
                  />
                  <button type="button" onClick={addCheckItem} className="btn btn-primary" style={{ padding: '0.45rem 0.75rem', fontSize: '0.82rem' }}>
                    <Plus size={14} />
                  </button>
                </div>
              )}
            </section>

            {/* ── Foto Lampiran ── */}
            <section>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.6rem' }}>
                Foto Lampiran ({attachments.filter(a => !a.is_expired).length})
                <span style={{ marginLeft: '0.5rem', fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 400 }}>
                  · hapus otomatis setelah 45 hari
                </span>
              </div>
              <AttachmentUploader
                taskId={taskId}
                guruId={user?.id}
                attachments={attachments}
                readOnly={!canEdit}
                onUploaded={rec => setAttachments(prev => [...prev, rec])}
                onDeleted={id => setAttachments(prev => prev.filter(a => a.id !== id))}
              />
            </section>

            {/* ── Komentar ── */}
            <section>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.6rem' }}>
                Komentar ({comments.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '0.75rem', maxHeight: 220, overflowY: 'auto' }}>
                {comments.map(c => (
                  <div key={c.id} style={{ background: 'rgba(79,70,229,0.04)', borderRadius: '0.5rem', padding: '0.6rem 0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--primary)' }}>{c.gurus?.nama || c.guru_id}</span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{fmtDT(c.created_at)}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>{c.isi}</p>
                  </div>
                ))}
                {comments.length === 0 && <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: 0 }}>Belum ada komentar.</p>}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  style={{ ...inp, flex: 1, fontSize: '0.82rem' }}
                  placeholder="Tulis komentar..."
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), addComment())}
                />
                <button type="button" onClick={addComment} className="btn btn-primary" style={{ padding: '0.45rem 0.75rem' }}>
                  <Send size={14} />
                </button>
              </div>
            </section>

            {/* ── Meta info ── */}
            {task && (
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', borderTop: '1px solid var(--glass-border)', paddingTop: '0.75rem' }}>
                Dibuat {fmtDT(task.created_at)}
                {task.recurring_rule_id && <span style={{ marginLeft: '1rem', background: '#ede9fe', color: '#7c3aed', padding: '0.1rem 0.4rem', borderRadius: 4 }}>↻ Recurring</span>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
