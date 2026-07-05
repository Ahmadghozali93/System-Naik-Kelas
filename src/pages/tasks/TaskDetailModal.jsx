import { useState, useEffect, useRef } from 'react';
import { X, Plus, Trash2, Send, CheckSquare, Square, User, AlertCircle, Camera, Image, ImageOff } from 'lucide-react';
import imageCompression from 'browser-image-compression';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/authStore';

const COMPRESS_OPTS = { maxSizeMB: 0.3, maxWidthOrHeight: 1280, useWebWorker: true, initialQuality: 0.82 };
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const ALLOWED_EXT   = ['jpg', 'jpeg', 'png', 'webp'];

const PRIORITAS_COLOR = { Tinggi: '#ef4444', Sedang: '#f59e0b', Rendah: '#22c55e' };
const fmtDT   = (d) => d ? new Date(d).toLocaleString('id-ID',  { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

const inp = {
  width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.5rem',
  border: '1px solid var(--glass-border)', background: 'var(--surface-color)',
  fontFamily: 'inherit', fontSize: '0.875rem', color: 'var(--text-primary)', boxSizing: 'border-box',
};
const lb = (text, req) => (
  <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600, fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
    {text}{req && <span style={{ color: '#ef4444' }}> *</span>}
  </label>
);

export default function TaskDetailModal({ taskId, defaultStageId, defaultUnitId, onClose, onSaved }) {
  const { user } = useAuth();
  const isNew = !taskId;
  const photoInputRef = useRef();

  const [task, setTask]           = useState(null);
  const [stages, setStages]       = useState([]);
  const [labels, setLabels]       = useState([]);
  const [projects, setProjects]   = useState([]);
  const [unitGurus, setUnitGurus] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [checklists, setChecklists] = useState([]);
  const [comments, setComments]   = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [signedUrls, setSignedUrls]   = useState({});

  const [unitId, setUnitId] = useState(defaultUnitId || '');
  const [loading, setLoading]       = useState(!isNew);
  const [saving, setSaving]         = useState(false);
  const [newComment, setNewComment] = useState('');
  const [newCheckItem, setNewCheckItem] = useState('');
  const [commentPhoto, setCommentPhoto]         = useState(null);   // File
  const [commentPhotoPreview, setCommentPhotoPreview] = useState(null); // blob URL
  const [sendingComment, setSendingComment]     = useState(false);

  const [pendingAssignees, setPendingAssignees]   = useState([]);
  const [pendingChecklists, setPendingChecklists] = useState([]);

  const [form, setForm] = useState({
    judul: '', deskripsi: '',
    stage_id: defaultStageId || '',
    prioritas: 'Sedang', deadline: '',
    label_id: '', project_id: '',
  });

  const isAdmin  = ['Owner', 'Administrator', 'Supervisor'].includes(user?.role);
  const canEdit  = isNew || isAdmin || task?.dibuat_oleh === user?.id || assignees.some(a => a.guru_id === user?.id);

  // ── Load ──
  useEffect(() => {
    const load = async () => {
      const [stRes, lbRes] = await Promise.all([
        supabase.from('task_stages').select('*').order('urutan'),
        supabase.from('task_labels').select('*').order('nama'),
      ]);
      setStages(stRes.data || []);
      setLabels(lbRes.data || []);

      if (isNew) {
        let uid = defaultUnitId;
        if (!uid && user?.id) {
          const { data } = await supabase.from('guru_units').select('unit_id').eq('guru_id', user.id).limit(1).single();
          uid = data?.unit_id || '';
        }
        setUnitId(uid);
        setLoading(false);
      } else {
        await loadTask();
      }
    };
    load();
  }, [taskId]);

  useEffect(() => {
    if (!unitId) { setProjects([]); setUnitGurus([]); return; }
    supabase.from('task_projects').select('id, nama').eq('unit_id', unitId).eq('status', 'aktif').order('nama')
      .then(({ data }) => setProjects(data || []));
    supabase.from('guru_units').select('guru_id, gurus(id, nama, role)').eq('unit_id', unitId)
      .then(({ data }) => setUnitGurus((data || []).map(g => g.gurus).filter(Boolean)));
  }, [unitId]);

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
      setUnitId(t.unit_id || '');
      setForm({
        judul: t.judul || '', deskripsi: t.deskripsi || '',
        stage_id: t.stage_id || '', prioritas: t.prioritas || 'Sedang',
        deadline: t.deadline ? t.deadline.slice(0, 16) : '',
        label_id: t.label_id || '', project_id: t.project_id || '',
      });
    }
    setAssignees(aRes.data || []);
    setChecklists(clRes.data || []);
    setComments(coRes.data || []);
    setAttachments(atRes.data || []);
    setLoading(false);
  };

  // ── Signed URLs ──
  const getSignedUrl = async (path, id) => {
    if (signedUrls[id] || !path) return;
    const { data } = await supabase.storage.from('task-photos').createSignedUrl(path, 3600);
    if (data?.signedUrl) setSignedUrls(prev => ({ ...prev, [id]: data.signedUrl }));
  };

  // ── Save Task ──
  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.judul.trim()) return alert('Judul task wajib diisi.');
    if (!form.stage_id)     return alert('Stage wajib dipilih.');
    if (!unitId)            return alert('Unit belum terdeteksi. Pastikan akun Anda terdaftar di salah satu unit.');
    setSaving(true);

    const selectedStage = stages.find(s => s.id === form.stage_id);
    const payload = {
      judul: form.judul.trim(), deskripsi: form.deskripsi || null,
      stage_id: form.stage_id, unit_id: unitId,
      prioritas: form.prioritas, deadline: form.deadline || null,
      label_id: form.label_id || null, project_id: form.project_id || null,
    };

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

      const ops = [];
      if (pendingAssignees.length)
        ops.push(supabase.from('task_assignees').insert(pendingAssignees.map(gid => ({ task_id: savedTask.id, guru_id: gid }))));
      if (pendingChecklists.length)
        ops.push(supabase.from('task_checklists').insert(pendingChecklists.map((teks, i) => ({ task_id: savedTask.id, teks, urutan: i }))));
      if (ops.length) await Promise.all(ops);
    } else {
      const { data, error } = await supabase.from('tasks').update(payload).eq('id', taskId).select().single();
      if (error) { alert('Gagal: ' + error.message); setSaving(false); return; }
      savedTask = data;
    }

    setSaving(false);
    onSaved?.(savedTask);
    if (isNew) onClose();
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
    await supabase.from('task_assignees').delete().eq('task_id', taskId).eq('guru_id', guruId);
    setAssignees(prev => prev.filter(a => a.guru_id !== guruId));
  };

  // ── Checklists ──
  const addCheckItem = async () => {
    const txt = newCheckItem.trim();
    if (!txt || !taskId) return;
    const { data, error } = await supabase.from('task_checklists')
      .insert({ task_id: taskId, teks: txt, urutan: checklists.length }).select().single();
    if (error) return alert('Gagal: ' + error.message);
    setChecklists(prev => [...prev, data]);
    setNewCheckItem('');
  };
  const toggleCheck = async (item) => {
    await supabase.from('task_checklists').update({ selesai: !item.selesai }).eq('id', item.id);
    setChecklists(prev => prev.map(c => c.id === item.id ? { ...c, selesai: !c.selesai } : c));
  };
  const deleteCheck = async (id) => {
    await supabase.from('task_checklists').delete().eq('id', id);
    setChecklists(prev => prev.filter(c => c.id !== id));
  };

  // ── Pilih foto komentar ──
  const handleCommentPhotoSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_TYPES.includes(file.type) || !ALLOWED_EXT.includes(ext)) {
      alert('Hanya JPG, PNG, atau WebP yang diizinkan.');
      e.target.value = '';
      return;
    }
    setCommentPhoto(file);
    setCommentPhotoPreview(URL.createObjectURL(file));
    e.target.value = '';
  };

  const clearCommentPhoto = () => {
    if (commentPhotoPreview) URL.revokeObjectURL(commentPhotoPreview);
    setCommentPhoto(null);
    setCommentPhotoPreview(null);
  };

  // ── Kirim komentar + foto ──
  const addComment = async () => {
    const txt = newComment.trim();
    if (!txt && !commentPhoto) return;
    if (!taskId) return;

    setSendingComment(true);
    try {
      // Insert komentar dulu
      const { data: commentData, error: commentErr } = await supabase
        .from('task_comments')
        .insert({ task_id: taskId, guru_id: user?.id, isi: txt })
        .select('*, gurus(id, nama)')
        .single();
      if (commentErr) throw new Error(commentErr.message);

      const newCommentRecord = { ...commentData };

      // Upload foto jika ada
      if (commentPhoto) {
        const ext = commentPhoto.name.split('.').pop()?.toLowerCase();
        const compressed = await imageCompression(commentPhoto, COMPRESS_OPTS);
        const path = `tasks/${taskId}/${crypto.randomUUID()}.${ext}`;

        const { error: storageErr } = await supabase.storage
          .from('task-photos')
          .upload(path, compressed, { contentType: compressed.type || commentPhoto.type });
        if (storageErr) throw new Error(storageErr.message);

        const { data: attRec, error: dbErr } = await supabase
          .from('task_attachments')
          .insert({
            task_id:       taskId,
            guru_id:       user?.id,
            storage_path:  path,
            original_name: commentPhoto.name,
            mime_type:     compressed.type || commentPhoto.type,
            size_bytes:    compressed.size,
            comment_id:    commentData.id,
          })
          .select()
          .single();
        if (dbErr) throw new Error(dbErr.message);
        setAttachments(prev => [...prev, attRec]);
      }

      setComments(prev => [...prev, newCommentRecord]);
      setNewComment('');
      clearCommentPhoto();
    } catch (err) {
      alert('Gagal mengirim: ' + err.message);
    } finally {
      setSendingComment(false);
    }
  };

  // ── Hapus foto attachment ──
  const deleteAttachment = async (att) => {
    if (!window.confirm('Hapus foto ini?')) return;
    if (att.storage_path) await supabase.storage.from('task-photos').remove([att.storage_path]);
    await supabase.from('task_attachments').delete().eq('id', att.id);
    setAttachments(prev => prev.filter(a => a.id !== att.id));
  };

  const isOverdue = task && !task.selesai_pada && task.deadline && new Date(task.deadline) < new Date();
  const doneCount = checklists.filter(c => c.selesai).length;

  // ── Assignee ──
  const renderAssignees = () => {
    const list = isNew
      ? pendingAssignees.map(gid => ({ guru_id: gid, gurus: unitGurus.find(g => g.id === gid) }))
      : assignees;
    const available = unitGurus.filter(g => !list.some(a => a.guru_id === g.id));
    return (
      <section>
        <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <User size={14} /> Assignee ({list.length})
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: available.length ? '0.45rem' : 0 }}>
          {list.map(a => (
            <span key={a.guru_id} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'rgba(79,70,229,0.08)', color: 'var(--primary)', padding: '0.2rem 0.55rem', borderRadius: 999, fontSize: '0.8rem', fontWeight: 600 }}>
              {a.gurus?.nama || a.guru_id}
              {canEdit && (
                <button type="button" onClick={() => isNew
                  ? setPendingAssignees(p => p.filter(id => id !== a.guru_id))
                  : removeAssignee(a.guru_id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: 'inherit', opacity: 0.7 }}>
                  <X size={11} />
                </button>
              )}
            </span>
          ))}
          {list.length === 0 && <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Belum ada</span>}
        </div>
        {canEdit && available.length > 0 && (
          <select style={{ ...inp, width: 'auto', fontSize: '0.8rem' }} value=""
            onChange={e => {
              if (!e.target.value) return;
              if (isNew) setPendingAssignees(p => [...p, e.target.value]);
              else addAssignee(e.target.value);
            }}>
            <option value="">+ Tambah assignee...</option>
            {available.map(g => <option key={g.id} value={g.id}>{g.nama} ({g.role})</option>)}
          </select>
        )}
      </section>
    );
  };

  // ── Checklist ──
  const renderChecklist = () => {
    const items = isNew ? pendingChecklists : checklists;
    return (
      <section>
        <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          Checklist {isNew ? `(${items.length})` : `${doneCount}/${items.length}`}
          {!isNew && items.length > 0 && (
            <div style={{ flex: 1, maxWidth: 80, height: 6, background: 'var(--glass-border)', borderRadius: 3 }}>
              <div style={{ width: `${(doneCount / items.length) * 100}%`, height: '100%', background: '#22c55e', borderRadius: 3, transition: 'width 0.3s' }} />
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '0.5rem' }}>
          {items.map((item, idx) => (
            <div key={isNew ? idx : item.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {isNew ? (
                <Square size={16} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
              ) : (
                <button type="button" onClick={() => toggleCheck(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: item.selesai ? '#22c55e' : 'var(--text-secondary)', padding: 0, flexShrink: 0 }}>
                  {item.selesai ? <CheckSquare size={16} /> : <Square size={16} />}
                </button>
              )}
              <span style={{ flex: 1, fontSize: '0.85rem', textDecoration: !isNew && item.selesai ? 'line-through' : 'none', color: !isNew && item.selesai ? 'var(--text-secondary)' : 'inherit' }}>
                {isNew ? item : item.teks}
              </span>
              {canEdit && (
                <button type="button" onClick={() => isNew
                  ? setPendingChecklists(p => p.filter((_, i) => i !== idx))
                  : deleteCheck(item.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c', opacity: 0.5, padding: 0 }}>
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input style={{ ...inp, flex: 1, fontSize: '0.82rem' }}
              placeholder="Tambah item checklist..."
              value={newCheckItem}
              onChange={e => setNewCheckItem(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), isNew
                ? (newCheckItem.trim() && (setPendingChecklists(p => [...p, newCheckItem.trim()]), setNewCheckItem('')))
                : addCheckItem()
              )}
            />
            <button type="button" className="btn btn-primary" style={{ padding: '0.45rem 0.75rem' }}
              onClick={() => isNew
                ? (newCheckItem.trim() && (setPendingChecklists(p => [...p, newCheckItem.trim()]), setNewCheckItem('')))
                : addCheckItem()
              }>
              <Plus size={14} />
            </button>
          </div>
        )}
      </section>
    );
  };

  // ── Thumbnail foto di komentar ──
  const CommentPhoto = ({ att }) => {
    if (!signedUrls[att.id] && att.storage_path && !att.is_expired) {
      getSignedUrl(att.storage_path, att.id);
    }
    if (att.is_expired) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--text-secondary)', fontSize: '0.72rem', padding: '0.3rem 0.5rem', border: '1px solid var(--glass-border)', borderRadius: '0.375rem' }}>
          <ImageOff size={13} /> Foto kedaluwarsa
        </div>
      );
    }
    return (
      <div style={{ position: 'relative', display: 'inline-block' }}>
        {signedUrls[att.id] ? (
          <a href={signedUrls[att.id]} target="_blank" rel="noreferrer">
            <img
              src={signedUrls[att.id]}
              alt={att.original_name}
              style={{ width: 160, height: 120, objectFit: 'cover', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', display: 'block', cursor: 'zoom-in' }}
            />
          </a>
        ) : (
          <div style={{ width: 160, height: 120, borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Image size={20} style={{ color: 'var(--text-secondary)' }} />
          </div>
        )}
        {canEdit && (
          <button
            onClick={() => deleteAttachment(att)}
            style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.55)', border: 'none', borderRadius: '50%', width: 20, height: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
          >
            <X size={11} color="#fff" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1.5rem 1rem', overflowY: 'auto' }}
      onClick={onClose}>
      <div className="glass-card" style={{ width: '100%', maxWidth: 700, padding: '1.5rem', position: 'relative' }} onClick={e => e.stopPropagation()}>

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
                <span style={{ color: PRIORITAS_COLOR[task.prioritas], fontSize: '0.75rem', fontWeight: 700 }}>● {task.prioritas}</span>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

              {/* Judul */}
              <div>
                {lb('Judul Task', true)}
                <input style={inp} value={form.judul} onChange={e => setForm(f => ({ ...f, judul: e.target.value }))} required disabled={!canEdit} placeholder="Nama task..." />
              </div>

              {/* Grid: Stage, Prioritas, Deadline, Label, Project */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
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
                {projects.length > 0 && (
                  <div style={{ gridColumn: 'span 2' }}>
                    {lb('Project')}
                    <select style={inp} value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))} disabled={!canEdit}>
                      <option value="">Tanpa Project</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.nama}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {renderAssignees()}
              {renderChecklist()}

              {/* Deskripsi */}
              <div>
                {lb('Deskripsi')}
                <textarea rows={3} style={{ ...inp, resize: 'vertical' }}
                  value={form.deskripsi}
                  onChange={e => setForm(f => ({ ...f, deskripsi: e.target.value }))}
                  disabled={!canEdit}
                  placeholder="Penjelasan tugas..." />
              </div>

              {/* Save */}
              {canEdit && (
                <div style={{ display: 'flex', gap: '0.65rem' }}>
                  <button type="submit" className="btn btn-primary" disabled={saving} style={{ flex: 1 }}>
                    {saving ? 'Menyimpan...' : isNew ? 'Buat Task' : 'Simpan Perubahan'}
                  </button>
                  <button type="button" className="btn" onClick={onClose} style={{ background: 'var(--surface-color)' }}>Batal</button>
                </div>
              )}
            </div>
          </form>
        )}

        {/* Komentar — hanya task yang sudah ada */}
        {!isNew && !loading && (
          <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '1.25rem', marginTop: '1.25rem' }}>
            <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.75rem' }}>
              Komentar ({comments.length})
            </div>

            {/* Daftar komentar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '1rem', maxHeight: 300, overflowY: 'auto' }}>
              {comments.map(c => {
                const commentAtts = attachments.filter(a => a.comment_id === c.id);
                return (
                  <div key={c.id} style={{ background: 'rgba(79,70,229,0.04)', borderRadius: '0.5rem', padding: '0.6rem 0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: c.isi ? '0.25rem' : '0.4rem' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--primary)' }}>{c.gurus?.nama}</span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{fmtDT(c.created_at)}</span>
                    </div>
                    {c.isi && <p style={{ margin: 0, fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>{c.isi}</p>}
                    {commentAtts.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.45rem' }}>
                        {commentAtts.map(att => <CommentPhoto key={att.id} att={att} />)}
                      </div>
                    )}
                  </div>
                );
              })}
              {comments.length === 0 && (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: 0 }}>Belum ada komentar.</p>
              )}
            </div>

            {/* Compose komentar */}
            <div style={{ border: '1px solid var(--glass-border)', borderRadius: '0.6rem', overflow: 'hidden', background: 'var(--surface-color)' }}>
              {/* Preview foto terpilih */}
              {commentPhotoPreview && (
                <div style={{ padding: '0.5rem 0.65rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <div style={{ position: 'relative' }}>
                    <img src={commentPhotoPreview} alt="preview"
                      style={{ width: 72, height: 56, objectFit: 'cover', borderRadius: '0.375rem', border: '1px solid var(--glass-border)', display: 'block' }} />
                    <button type="button" onClick={clearCommentPhoto}
                      style={{ position: 'absolute', top: -5, right: -5, background: '#ef4444', border: 'none', borderRadius: '50%', width: 17, height: 17, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                      <X size={10} color="#fff" />
                    </button>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', paddingTop: '0.2rem' }}>{commentPhoto?.name}</span>
                </div>
              )}

              {/* Input teks */}
              <textarea
                rows={2}
                style={{ width: '100%', padding: '0.65rem 0.75rem', border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: '0.875rem', color: 'var(--text-primary)', resize: 'none', outline: 'none', boxSizing: 'border-box' }}
                placeholder="Tulis komentar..."
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), addComment())}
              />

              {/* Toolbar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.65rem', borderTop: '1px solid var(--glass-border)' }}>
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    onChange={handleCommentPhotoSelect}
                    style={{ display: 'none' }}
                  />
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    title="Lampirkan foto"
                    style={{ background: commentPhotoPreview ? 'rgba(79,70,229,0.1)' : 'none', border: 'none', cursor: 'pointer', padding: '0.3rem', borderRadius: '0.375rem', color: commentPhotoPreview ? 'var(--primary)' : 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}
                  >
                    <Camera size={16} />
                  </button>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>JPG/PNG/WebP</span>
                </div>
                <button
                  type="button"
                  onClick={addComment}
                  disabled={sendingComment || (!newComment.trim() && !commentPhoto)}
                  className="btn btn-primary"
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  <Send size={13} />
                  {sendingComment ? 'Mengirim...' : 'Kirim'}
                </button>
              </div>
            </div>

            {/* Lampiran lama (tanpa comment_id) — backward compat */}
            {attachments.filter(a => !a.comment_id && !a.is_expired).length > 0 && (
              <div style={{ marginTop: '1rem' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>
                  Lampiran
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {attachments.filter(a => !a.comment_id && !a.is_expired).map(att => (
                    <CommentPhoto key={att.id} att={att} />
                  ))}
                </div>
              </div>
            )}

            {/* Meta */}
            {task && (
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', borderTop: '1px solid var(--glass-border)', paddingTop: '0.75rem', marginTop: '1rem' }}>
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
