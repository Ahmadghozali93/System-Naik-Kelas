import { useState, useEffect, useRef } from 'react';
import { X, Plus, Trash2, Send, CheckSquare, Square, AlertCircle, Camera, Image, ImageOff, Star } from 'lucide-react';
import imageCompression from 'browser-image-compression';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/authStore';

const COMPRESS_OPTS = { maxSizeMB: 0.3, maxWidthOrHeight: 1280, useWebWorker: true, initialQuality: 0.82 };
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const ALLOWED_EXT   = ['jpg', 'jpeg', 'png', 'webp'];

const fmtDT   = (d) => d ? new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

const PRIORITY_STARS = { Tinggi: 3, Sedang: 2, Rendah: 1 };

const inpStyle = {
  border: 'none', background: 'transparent', fontFamily: 'inherit',
  fontSize: '0.875rem', color: 'var(--text-primary)', outline: 'none',
};

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

  const [unitId, setUnitId]     = useState(defaultUnitId || '');
  const [loading, setLoading]   = useState(!isNew);
  const [saving, setSaving]     = useState(false);
  const [activeTab, setActiveTab] = useState('deskripsi');

  const [newComment, setNewComment]   = useState('');
  const [newCheckItem, setNewCheckItem] = useState('');
  const [commentPhoto, setCommentPhoto]             = useState(null);
  const [commentPhotoPreview, setCommentPhotoPreview] = useState(null);
  const [sendingComment, setSendingComment]         = useState(false);

  const [pendingAssignees, setPendingAssignees]   = useState([]);
  const [pendingChecklists, setPendingChecklists] = useState([]);

  const [form, setForm] = useState({
    judul: '', deskripsi: '',
    stage_id: defaultStageId || '',
    prioritas: 'Sedang', deadline: '',
    label_id: '', project_id: '',
  });

  const isAdmin = ['Owner', 'Administrator', 'Supervisor'].includes(user?.role);
  const canEdit = isNew || isAdmin || task?.dibuat_oleh === user?.id || assignees.some(a => a.guru_id === user?.id);
  const doneCount = checklists.filter(c => c.selesai).length;
  const isOverdue = task && !task.selesai_pada && task.deadline && new Date(task.deadline) < new Date();
  const currentStage = stages.find(s => s.id === form.stage_id);

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

  const getSignedUrl = async (path, id) => {
    if (signedUrls[id] || !path) return;
    const { data } = await supabase.storage.from('task-photos').createSignedUrl(path, 3600);
    if (data?.signedUrl) setSignedUrls(prev => ({ ...prev, [id]: data.signedUrl }));
  };

  // ── Save ──
  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.judul.trim()) return alert('Judul task wajib diisi.');
    if (!form.stage_id)     return alert('Stage wajib dipilih.');
    if (!unitId)            return alert('Unit belum terdeteksi.');
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
      payload.selesai_pada = null; payload.is_late = null;
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
    setAssignees(prev => [...prev, { guru_id: guruId, gurus: unitGurus.find(g => g.id === guruId) }]);
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

  // ── Foto komentar ──
  const handleCommentPhotoSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_TYPES.includes(file.type) || !ALLOWED_EXT.includes(ext)) {
      alert('Hanya JPG, PNG, atau WebP.'); e.target.value = ''; return;
    }
    setCommentPhoto(file);
    setCommentPhotoPreview(URL.createObjectURL(file));
    e.target.value = '';
  };
  const clearCommentPhoto = () => {
    if (commentPhotoPreview) URL.revokeObjectURL(commentPhotoPreview);
    setCommentPhoto(null); setCommentPhotoPreview(null);
  };

  // ── Kirim komentar ──
  const addComment = async () => {
    const txt = newComment.trim();
    if (!txt && !commentPhoto) return;
    setSendingComment(true);
    try {
      const { data: commentData, error } = await supabase
        .from('task_comments')
        .insert({ task_id: taskId, guru_id: user?.id, isi: txt })
        .select('*, gurus(id, nama)').single();
      if (error) throw new Error(error.message);
      if (commentPhoto) {
        const ext = commentPhoto.name.split('.').pop()?.toLowerCase();
        const compressed = await imageCompression(commentPhoto, COMPRESS_OPTS);
        const path = `tasks/${taskId}/${crypto.randomUUID()}.${ext}`;
        const { error: sErr } = await supabase.storage.from('task-photos').upload(path, compressed, { contentType: compressed.type });
        if (sErr) throw new Error(sErr.message);
        const { data: attRec, error: dErr } = await supabase.from('task_attachments')
          .insert({ task_id: taskId, guru_id: user?.id, storage_path: path, original_name: commentPhoto.name, mime_type: compressed.type, size_bytes: compressed.size, comment_id: commentData.id })
          .select().single();
        if (dErr) throw new Error(dErr.message);
        setAttachments(prev => [...prev, attRec]);
      }
      setComments(prev => [...prev, commentData]);
      setNewComment(''); clearCommentPhoto();
    } catch (err) { alert('Gagal: ' + err.message); }
    finally { setSendingComment(false); }
  };

  const deleteAttachment = async (att) => {
    if (!window.confirm('Hapus foto ini?')) return;
    if (att.storage_path) await supabase.storage.from('task-photos').remove([att.storage_path]);
    await supabase.from('task_attachments').delete().eq('id', att.id);
    setAttachments(prev => prev.filter(a => a.id !== att.id));
  };

  const assigneeList = isNew
    ? pendingAssignees.map(gid => ({ guru_id: gid, gurus: unitGurus.find(g => g.id === gid) }))
    : assignees;
  const available = unitGurus.filter(g => !assigneeList.some(a => a.guru_id === g.id));

  // ── Bintang prioritas ──
  const PriorityStars = () => {
    const count = PRIORITY_STARS[form.prioritas] || 2;
    const cycle = () => {
      if (!canEdit) return;
      setForm(f => ({ ...f, prioritas: f.prioritas === 'Tinggi' ? 'Rendah' : f.prioritas === 'Sedang' ? 'Tinggi' : 'Sedang' }));
    };
    return (
      <button type="button" onClick={cycle} title={`Prioritas: ${form.prioritas} — klik untuk ganti`}
        style={{ background: 'none', border: 'none', cursor: canEdit ? 'pointer' : 'default', display: 'flex', gap: '1px', padding: 0, alignItems: 'center' }}>
        {[1,2,3].map(i => (
          <Star key={i} size={15} fill={i <= count ? '#f59e0b' : 'none'} stroke={i <= count ? '#f59e0b' : '#d1d5db'} />
        ))}
        <span style={{ marginLeft: '0.35rem', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>{form.prioritas}</span>
      </button>
    );
  };

  // ── Foto di komentar ──
  const CommentPhoto = ({ att }) => {
    if (!signedUrls[att.id] && att.storage_path && !att.is_expired) getSignedUrl(att.storage_path, att.id);
    if (att.is_expired) return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--text-secondary)', fontSize: '0.72rem', padding: '0.3rem 0.5rem', border: '1px solid var(--glass-border)', borderRadius: '0.375rem' }}>
        <ImageOff size={13} /> Kedaluwarsa
      </div>
    );
    return (
      <div style={{ position: 'relative', display: 'inline-block' }}>
        {signedUrls[att.id] ? (
          <a href={signedUrls[att.id]} target="_blank" rel="noreferrer">
            <img src={signedUrls[att.id]} alt={att.original_name}
              style={{ width: 150, height: 105, objectFit: 'cover', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', display: 'block', cursor: 'zoom-in' }} />
          </a>
        ) : (
          <div style={{ width: 150, height: 105, borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Image size={20} style={{ color: 'var(--text-secondary)' }} />
          </div>
        )}
        {canEdit && (
          <button onClick={() => deleteAttachment(att)}
            style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.55)', border: 'none', borderRadius: '50%', width: 20, height: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
            <X size={11} color="#fff" />
          </button>
        )}
      </div>
    );
  };

  const tabBtn = (id, label) => (
    <button type="button" onClick={() => setActiveTab(id)}
      style={{
        padding: '0.45rem 1rem', fontSize: '0.875rem', fontWeight: activeTab === id ? 600 : 400,
        color: activeTab === id ? 'var(--primary)' : 'var(--text-secondary)',
        borderBottom: activeTab === id ? '2px solid var(--primary)' : '2px solid transparent',
        background: 'none', border: 'none', borderRadius: 0, cursor: 'pointer', transition: 'color 0.15s',
      }}>
      {label}
    </button>
  );

  return (
    <div className="modal-overlay" style={{ alignItems: 'flex-start', paddingTop: '2rem' }} onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 740, padding: 0 }} onClick={e => e.stopPropagation()}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Memuat...</div>
        ) : (
          <form onSubmit={handleSave}>

            {/* ── Header ── */}
            <div style={{ padding: '1.5rem 1.75rem 1.25rem', borderBottom: '1px solid var(--glass-border)' }}>

              {/* Judul + X */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '1.1rem' }}>
                <input
                  value={form.judul}
                  onChange={e => setForm(f => ({ ...f, judul: e.target.value }))}
                  required disabled={!canEdit}
                  placeholder="Judul task..."
                  style={{ flex: 1, fontSize: '1.35rem', fontWeight: 700, border: 'none', outline: 'none', background: 'transparent', color: 'var(--text-primary)', fontFamily: 'inherit', padding: 0, lineHeight: 1.3 }}
                />
                <button type="button" onClick={onClose}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0.2rem', flexShrink: 0 }}>
                  <X size={20} />
                </button>
              </div>

              {/* Metadata 2-kolom */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem 2.5rem' }}>

                {/* Kiri */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                  {/* Project */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', minWidth: 76 }}>Project</span>
                    <select value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}
                      disabled={!canEdit || projects.length === 0}
                      style={{ ...inpStyle, flex: 1, cursor: canEdit ? 'pointer' : 'default' }}>
                      <option value="">— Tanpa project</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.nama}</option>)}
                    </select>
                  </div>

                  {/* Assignees */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', minWidth: 76, paddingTop: '0.15rem' }}>Assignees</span>
                    <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: '0.3rem', alignItems: 'center' }}>
                      {assigneeList.map(a => (
                        <span key={a.guru_id}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', background: 'rgba(79,70,229,0.1)', color: 'var(--primary)', borderRadius: 999, padding: '0.15rem 0.5rem', fontSize: '0.78rem', fontWeight: 600 }}>
                          {a.gurus?.nama?.split(' ')[0] || '?'}
                          {canEdit && (
                            <button type="button"
                              onClick={() => isNew ? setPendingAssignees(p => p.filter(id => id !== a.guru_id)) : removeAssignee(a.guru_id)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: 'inherit', opacity: 0.6 }}>
                              <X size={10} />
                            </button>
                          )}
                        </span>
                      ))}
                      {canEdit && available.length > 0 && (
                        <select value="" onChange={e => { if (!e.target.value) return; isNew ? setPendingAssignees(p => [...p, e.target.value]) : addAssignee(e.target.value); }}
                          style={{ border: '1px dashed var(--glass-border)', borderRadius: 999, background: 'transparent', fontSize: '0.75rem', color: 'var(--text-secondary)', padding: '0.1rem 0.45rem', cursor: 'pointer', outline: 'none', fontFamily: 'inherit' }}>
                          <option value="">+ Tambah</option>
                          {available.map(g => <option key={g.id} value={g.id}>{g.nama}</option>)}
                        </select>
                      )}
                      {assigneeList.length === 0 && !canEdit && <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>—</span>}
                    </div>
                  </div>
                </div>

                {/* Kanan */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                  {/* Prioritas */}
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', minWidth: 68 }}>Prioritas</span>
                    <PriorityStars />
                  </div>

                  {/* Status / Stage */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', minWidth: 68 }}>Status</span>
                    <select value={form.stage_id} onChange={e => setForm(f => ({ ...f, stage_id: e.target.value }))}
                      required disabled={!canEdit}
                      style={{
                        border: '1.5px solid ' + (currentStage?.warna || 'var(--glass-border)'),
                        borderRadius: 999, padding: '0.2rem 0.7rem', fontSize: '0.78rem', fontWeight: 700,
                        color: currentStage?.warna || 'var(--text-primary)',
                        background: currentStage ? currentStage.warna + '18' : 'transparent',
                        cursor: canEdit ? 'pointer' : 'default', outline: 'none', fontFamily: 'inherit',
                      }}>
                      <option value="">— Pilih stage</option>
                      {stages.map(s => <option key={s.id} value={s.id}>{s.nama}</option>)}
                    </select>
                    {isOverdue && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.7rem', color: '#ef4444', fontWeight: 700 }}>
                        <AlertCircle size={11} /> Overdue
                      </span>
                    )}
                    {task?.selesai_pada && (
                      <span style={{ fontSize: '0.7rem', color: '#047857', fontWeight: 600 }}>✓ Selesai</span>
                    )}
                  </div>

                  {/* Label */}
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', minWidth: 68 }}>Label</span>
                    <select value={form.label_id} onChange={e => setForm(f => ({ ...f, label_id: e.target.value }))} disabled={!canEdit}
                      style={{ ...inpStyle, flex: 1, cursor: canEdit ? 'pointer' : 'default' }}>
                      <option value="">— Tanpa label</option>
                      {labels.map(l => <option key={l.id} value={l.id}>{l.nama}</option>)}
                    </select>
                  </div>

                  {/* Deadline */}
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', minWidth: 68 }}>Deadline</span>
                    {canEdit ? (
                      <input type="datetime-local" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))}
                        style={{ ...inpStyle, flex: 1 }} />
                    ) : (
                      <span style={{ fontSize: '0.875rem', color: isOverdue ? '#ef4444' : 'var(--text-primary)' }}>
                        {form.deadline ? fmtDate(form.deadline) : '—'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Tabs: Deskripsi | Checklist ── */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--glass-border)', padding: '0 1.25rem' }}>
              {tabBtn('deskripsi', 'Deskripsi')}
              {tabBtn('checklist', `Checklist${!isNew && checklists.length ? ` ${doneCount}/${checklists.length}` : isNew && pendingChecklists.length ? ` (${pendingChecklists.length})` : ''}`)}
            </div>

            {/* ── Tab content ── */}
            <div style={{ padding: '1.25rem 1.75rem', minHeight: 140 }}>

              {/* Deskripsi */}
              {activeTab === 'deskripsi' && (
                <textarea rows={5} value={form.deskripsi}
                  onChange={e => setForm(f => ({ ...f, deskripsi: e.target.value }))}
                  disabled={!canEdit}
                  placeholder="Tambahkan deskripsi task..."
                  style={{ width: '100%', border: 'none', outline: 'none', resize: 'vertical', background: 'transparent', fontFamily: 'inherit', fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.65, boxSizing: 'border-box' }}
                />
              )}

              {/* Checklist */}
              {activeTab === 'checklist' && (
                <div>
                  {!isNew && checklists.length > 0 && (
                    <div style={{ marginBottom: '0.85rem', height: 5, background: 'var(--glass-border)', borderRadius: 3 }}>
                      <div style={{ width: `${(doneCount / checklists.length) * 100}%`, height: '100%', background: '#22c55e', borderRadius: 3, transition: 'width 0.3s' }} />
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '0.85rem' }}>
                    {(isNew ? pendingChecklists : checklists).map((item, idx) => (
                      <div key={isNew ? idx : item.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.25rem 0' }}>
                        {isNew ? (
                          <Square size={16} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                        ) : (
                          <button type="button" onClick={() => toggleCheck(item)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: item.selesai ? '#22c55e' : 'var(--text-secondary)', padding: 0, flexShrink: 0 }}>
                            {item.selesai ? <CheckSquare size={16} /> : <Square size={16} />}
                          </button>
                        )}
                        <span style={{ flex: 1, fontSize: '0.875rem', textDecoration: !isNew && item.selesai ? 'line-through' : 'none', color: !isNew && item.selesai ? 'var(--text-secondary)' : 'inherit' }}>
                          {isNew ? item : item.teks}
                        </span>
                        {canEdit && (
                          <button type="button"
                            onClick={() => isNew ? setPendingChecklists(p => p.filter((_, i) => i !== idx)) : deleteCheck(item.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', opacity: 0.4, padding: 0 }}>
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    ))}
                    {(isNew ? pendingChecklists : checklists).length === 0 && (
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>Belum ada item checklist.</p>
                    )}
                  </div>
                  {canEdit && (
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input
                        style={{ flex: 1, padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontFamily: 'inherit', fontSize: '0.875rem', color: 'var(--text-primary)' }}
                        placeholder="Tambah item..."
                        value={newCheckItem}
                        onChange={e => setNewCheckItem(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), isNew
                          ? (newCheckItem.trim() && (setPendingChecklists(p => [...p, newCheckItem.trim()]), setNewCheckItem('')))
                          : addCheckItem()
                        )}
                      />
                      <button type="button" className="btn btn-primary" style={{ padding: '0.5rem 0.85rem' }}
                        onClick={() => isNew
                          ? (newCheckItem.trim() && (setPendingChecklists(p => [...p, newCheckItem.trim()]), setNewCheckItem('')))
                          : addCheckItem()
                        }>
                        <Plus size={15} />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Komentar — selalu di bawah (hanya task yang ada) ── */}
            {!isNew && (
              <div style={{ borderTop: '1px solid var(--glass-border)', padding: '1.25rem 1.75rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>
                  Komentar {comments.length > 0 ? `(${comments.length})` : ''}
                </p>

                {/* List komentar */}
                {comments.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', maxHeight: 220, overflowY: 'auto' }}>
                    {comments.map(c => {
                      const commentAtts = attachments.filter(a => a.comment_id === c.id);
                      return (
                        <div key={c.id} style={{ background: 'var(--surface-color)', border: '1px solid var(--glass-border)', borderRadius: '0.5rem', padding: '0.6rem 0.75rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                            <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--primary)' }}>{c.gurus?.nama}</span>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{fmtDT(c.created_at)}</span>
                          </div>
                          {c.isi && <p style={{ margin: 0, fontSize: '0.875rem', whiteSpace: 'pre-wrap', lineHeight: 1.55, color: 'var(--text-primary)' }}>{c.isi}</p>}
                          {commentAtts.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.45rem' }}>
                              {commentAtts.map(att => <CommentPhoto key={att.id} att={att} />)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Compose */}
                <div style={{ border: '1px solid var(--glass-border)', borderRadius: '0.6rem', overflow: 'hidden', background: 'var(--surface-color)' }}>
                  {commentPhotoPreview && (
                    <div style={{ padding: '0.5rem 0.65rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                      <div style={{ position: 'relative' }}>
                        <img src={commentPhotoPreview} alt="preview"
                          style={{ width: 68, height: 52, objectFit: 'cover', borderRadius: '0.375rem', border: '1px solid var(--glass-border)', display: 'block' }} />
                        <button type="button" onClick={clearCommentPhoto}
                          style={{ position: 'absolute', top: -5, right: -5, background: '#ef4444', border: 'none', borderRadius: '50%', width: 16, height: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                          <X size={9} color="#fff" />
                        </button>
                      </div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', paddingTop: '0.2rem' }}>{commentPhoto?.name}</span>
                    </div>
                  )}
                  <textarea rows={2}
                    style={{ width: '100%', padding: '0.6rem 0.75rem', border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: '0.875rem', color: 'var(--text-primary)', resize: 'none', outline: 'none', boxSizing: 'border-box' }}
                    placeholder="Tulis komentar... (Enter untuk kirim)"
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), addComment())}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.35rem 0.65rem', borderTop: '1px solid var(--glass-border)' }}>
                    <div>
                      <input ref={photoInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp" onChange={handleCommentPhotoSelect} style={{ display: 'none' }} />
                      <button type="button" onClick={() => photoInputRef.current?.click()} title="Lampirkan foto"
                        style={{ background: commentPhotoPreview ? 'rgba(79,70,229,0.1)' : 'none', border: 'none', cursor: 'pointer', padding: '0.3rem', borderRadius: '0.375rem', color: commentPhotoPreview ? 'var(--primary)' : 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>
                        <Camera size={15} />
                      </button>
                    </div>
                    <button type="button" onClick={addComment} disabled={sendingComment || (!newComment.trim() && !commentPhoto)}
                      className="btn btn-primary"
                      style={{ padding: '0.3rem 0.85rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Send size={13} />
                      {sendingComment ? 'Mengirim...' : 'Kirim'}
                    </button>
                  </div>
                </div>

                {/* Lampiran lama (backward compat) */}
                {attachments.filter(a => !a.comment_id && !a.is_expired).length > 0 && (
                  <div>
                    <p style={{ margin: '0 0 0.4rem', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Lampiran</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                      {attachments.filter(a => !a.comment_id && !a.is_expired).map(att => <CommentPhoto key={att.id} att={att} />)}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Footer ── */}
            <div style={{ padding: '0.85rem 1.75rem', borderTop: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                {task ? `Dibuat ${fmtDT(task.created_at)}` : 'Task baru'}
                {task?.recurring_rule_id && (
                  <span style={{ marginLeft: '0.75rem', background: '#ede9fe', color: '#7c3aed', padding: '0.1rem 0.4rem', borderRadius: 4 }}>↻ Recurring</span>
                )}
              </span>
              {canEdit && (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" className="btn" onClick={onClose} style={{ fontSize: '0.875rem' }}>Batal</button>
                  <button type="submit" className="btn btn-primary" disabled={saving} style={{ fontSize: '0.875rem' }}>
                    {saving ? 'Menyimpan...' : isNew ? 'Buat Task' : 'Simpan'}
                  </button>
                </div>
              )}
            </div>

          </form>
        )}
      </div>
    </div>
  );
}
