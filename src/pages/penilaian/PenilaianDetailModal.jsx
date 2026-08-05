import { useState, useEffect, useRef } from 'react';
import { X, Send, Lock, RotateCcw, Camera, Image, ImageOff } from 'lucide-react';
import imageCompression from 'browser-image-compression';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/authStore';
import { syncKualitasMengajar } from '../../utils/syncKualitasMengajar';

const COMPRESS_OPTS = { maxSizeMB: 0.3, maxWidthOrHeight: 1280, useWebWorker: true, initialQuality: 0.82 };
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const ALLOWED_EXT   = ['jpg', 'jpeg', 'png', 'webp'];

const BULAN = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const THIS_YEAR  = new Date().getFullYear();
const THIS_MONTH = Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta', month: 'numeric' }));

const STATUS_CFG = {
  Proses:  { color: '#d97706', bg: 'rgba(217,119,6,0.12)' },
  Revisi:  { color: '#b91c1c', bg: 'rgba(185,28,28,0.12)' },
  Approve: { color: '#047857', bg: 'rgba(4,120,87,0.12)' },
};

const fmtDT = (d) => d ? new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

const inpStyle = {
  border: 'none', background: 'transparent', fontFamily: 'inherit',
  fontSize: '0.875rem', color: 'var(--text-primary)', outline: 'none',
};

export default function PenilaianDetailModal({ assessmentId, onClose, onSaved }) {
  const { user } = useAuth();
  const isNew = !assessmentId;
  const isAdmin = ['Owner', 'Administrator', 'Supervisor'].includes(user?.role);
  const photoInputRef = useRef();

  const [loading, setLoading]   = useState(!isNew);
  const [saving, setSaving]     = useState(false);
  const [row, setRow]           = useState(null);
  const [units, setUnits]       = useState([]);
  const [gurus, setGurus]       = useState([]);
  const [labels, setLabels]     = useState([]);
  const [comments, setComments] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [signedUrls, setSignedUrls]   = useState({});

  const [newComment, setNewComment]     = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [commentPhoto, setCommentPhoto]               = useState(null);
  const [commentPhotoPreview, setCommentPhotoPreview] = useState(null);

  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const [form, setForm] = useState({
    judul: '', assignee_id: '', bulan: THIS_MONTH, tahun: THIS_YEAR,
    status: 'Proses', deskripsi: '', label_id: '', unit_id: '',
  });

  const isApproved = form.status === 'Approve';
  // Kunci di layar saat sudah Approve; admin bisa "Buka Kembali"
  const locked  = !isNew && isApproved;
  const canEdit = isAdmin && !locked;

  const loadRow = async () => {
    setLoading(true);
    const [rRes, cRes, aRes] = await Promise.all([
      supabase.from('teaching_assessments')
        .select('*, gurus:assignee_id(id, nama), task_labels(id, nama, warna), units:unit_id(id, nama)')
        .eq('id', assessmentId).single(),
      supabase.from('teaching_assessment_comments')
        .select('*, gurus(id, nama)').eq('assessment_id', assessmentId)
        .order('created_at', { ascending: false }),
      supabase.from('teaching_assessment_attachments')
        .select('*').eq('assessment_id', assessmentId).order('uploaded_at'),
    ]);
    const r = rRes.data;
    if (r) {
      setRow(r);
      setForm({
        judul: r.judul || '', assignee_id: r.assignee_id || '',
        bulan: r.bulan || THIS_MONTH, tahun: r.tahun || THIS_YEAR,
        status: r.status || 'Proses', deskripsi: r.deskripsi || '',
        label_id: r.label_id || '', unit_id: r.unit_id || '',
      });
    }
    setComments(cRes.data || []);
    setAttachments(aRes.data || []);
    setLoading(false);
  };

  const getSignedUrl = async (path, id) => {
    if (signedUrls[id] || !path) return;
    const { data } = await supabase.storage.from('task-photos').createSignedUrl(path, 3600);
    if (data?.signedUrl) setSignedUrls(prev => ({ ...prev, [id]: data.signedUrl }));
  };

  // ── Load master data + entri ──
  useEffect(() => {
    const load = async () => {
      const [uRes, gRes, lRes] = await Promise.all([
        supabase.from('units').select('id, nama').eq('aktif', true).order('nama'),
        supabase.from('gurus').select('id, nama, role').eq('status', 'Aktif').order('nama'),
        supabase.from('task_labels').select('*').order('nama'),
      ]);
      setUnits(uRes.data || []);
      setGurus(gRes.data || []);
      setLabels(lRes.data || []);
      if (isNew) setLoading(false);
      else await loadRow();
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessmentId]);

  // ── Simpan ──
  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.judul.trim())  return alert('Judul wajib diisi.');
    if (!form.assignee_id)   return alert('Pilih guru yang dinilai.');
    if (!form.unit_id)       return alert('Pilih cabang.');

    // Cegah dobel (guru + bulan + tahun) — peringatan saja, boleh lanjut
    if (isNew) {
      const { data: dup } = await supabase.from('teaching_assessments')
        .select('id, judul')
        .eq('assignee_id', form.assignee_id)
        .eq('bulan', form.bulan)
        .eq('tahun', form.tahun)
        .limit(1);
      if (dup && dup.length > 0) {
        const guruNama = gurus.find(g => g.id === form.assignee_id)?.nama || 'guru ini';
        const lanjut = window.confirm(
          `Sudah ada penilaian untuk ${guruNama} pada ${BULAN[form.bulan]} ${form.tahun}.\n\nTetap buat penilaian baru?`
        );
        if (!lanjut) return;
      }
    }

    setSaving(true);
    const payload = {
      judul: form.judul.trim(),
      assignee_id: form.assignee_id,
      bulan: Number(form.bulan),
      tahun: Number(form.tahun),
      status: form.status,
      deskripsi: form.deskripsi || null,
      label_id: form.label_id || null,
      unit_id: form.unit_id,
      updated_at: new Date().toISOString(),
    };
    // Catat approver saat pertama kali Approve
    if (form.status === 'Approve' && row?.status !== 'Approve') {
      payload.approved_by = user?.id;
      payload.approved_at = new Date().toISOString();
    }
    if (form.status !== 'Approve') {
      payload.approved_by = null;
      payload.approved_at = null;
    }

    let saved;
    if (isNew) {
      payload.dibuat_oleh = user?.id;
      const { data, error } = await supabase.from('teaching_assessments').insert(payload).select().single();
      if (error) { alert('Gagal: ' + error.message); setSaving(false); return; }
      saved = data;
    } else {
      const { data, error } = await supabase.from('teaching_assessments').update(payload).eq('id', assessmentId).select().single();
      if (error) { alert('Gagal: ' + error.message); setSaving(false); return; }
      saved = data;
    }
    setSaving(false);
    // Sambung ke KPI: jika hasil akhir Approve, tandai Kualitas Mengajar "Sesuai"
    if (saved?.status === 'Approve') {
      await syncKualitasMengajar({ guruId: saved.assignee_id, bulan: saved.bulan, tahun: saved.tahun });
    }
    onSaved?.(saved);
    if (isNew) onClose();
    else await loadRow();
  };

  // ── Ganti status cepat (chip) ──
  const changeStatus = async (newStatus) => {
    if (!isAdmin) return;
    if (isNew) { setForm(f => ({ ...f, status: newStatus })); return; }
    const payload = { status: newStatus, updated_at: new Date().toISOString() };
    if (newStatus === 'Approve') { payload.approved_by = user?.id; payload.approved_at = new Date().toISOString(); }
    else { payload.approved_by = null; payload.approved_at = null; }
    const { error } = await supabase.from('teaching_assessments').update(payload).eq('id', assessmentId);
    if (error) return alert('Gagal ganti status: ' + error.message);
    setForm(f => ({ ...f, status: newStatus }));
    setRow(r => ({ ...r, status: newStatus }));
    // Sambung ke KPI saat Approve
    if (newStatus === 'Approve') {
      await syncKualitasMengajar({ guruId: form.assignee_id, bulan: form.bulan, tahun: form.tahun });
    }
    onSaved?.();
  };

  // ── Buka kembali (dari Approve) ──
  const reopen = async () => {
    if (!window.confirm('Buka kembali penilaian ini untuk diperbaiki? Status akan kembali ke "Revisi".')) return;
    await changeStatus('Revisi');
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

  // ── Komentar ──
  const addComment = async () => {
    const txt = newComment.trim();
    if (!txt && !commentPhoto) return;
    setSendingComment(true);
    try {
      const { data, error } = await supabase.from('teaching_assessment_comments')
        .insert({ assessment_id: assessmentId, guru_id: user?.id, isi: txt })
        .select('*, gurus(id, nama)').single();
      if (error) throw new Error(error.message);

      if (commentPhoto) {
        const ext = commentPhoto.name.split('.').pop()?.toLowerCase();
        const compressed = await imageCompression(commentPhoto, COMPRESS_OPTS);
        const path = `assessments/${assessmentId}/${crypto.randomUUID()}.${ext}`;
        const { error: sErr } = await supabase.storage
          .from('task-photos').upload(path, compressed, { contentType: compressed.type || commentPhoto.type });
        if (sErr) throw new Error(sErr.message);
        const { data: attRec, error: dErr } = await supabase.from('teaching_assessment_attachments')
          .insert({
            assessment_id: assessmentId, comment_id: data.id, guru_id: user?.id,
            storage_path: path, original_name: commentPhoto.name,
            mime_type: compressed.type || commentPhoto.type, size_bytes: compressed.size,
          })
          .select().single();
        if (dErr) throw new Error(dErr.message);
        setAttachments(prev => [...prev, attRec]);
      }

      setComments(prev => [data, ...prev]);
      setNewComment(''); clearCommentPhoto();
    } catch (err) {
      alert('Gagal kirim komentar: ' + err.message);
    } finally {
      setSendingComment(false);
    }
  };

  const deleteAttachment = async (att) => {
    if (!window.confirm('Hapus foto ini?')) return;
    if (att.storage_path) await supabase.storage.from('task-photos').remove([att.storage_path]);
    const { error } = await supabase.from('teaching_assessment_attachments').delete().eq('id', att.id);
    if (error) return alert('Gagal hapus: ' + error.message);
    setAttachments(prev => prev.filter(a => a.id !== att.id));
  };

  // ── Foto di komentar ──
  const CommentPhoto = ({ att }) => {
    if (!signedUrls[att.id] && att.storage_path && !att.is_expired) getSignedUrl(att.storage_path, att.id);
    if (att.is_expired || att.storage_deleted_at) return (
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
        {(isAdmin || att.guru_id === user?.id) && (
          <button type="button" onClick={() => deleteAttachment(att)}
            style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.55)', border: 'none', borderRadius: '50%', width: 20, height: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
            <X size={11} color="#fff" />
          </button>
        )}
      </div>
    );
  };

  const ph = isMobile ? '1rem' : '1.75rem';
  const pv = isMobile ? '1rem' : '1.25rem';

  return (
    <div className="modal-overlay"
      style={isMobile ? { alignItems: 'flex-end', padding: 0 } : { alignItems: 'flex-start', paddingTop: '2rem' }}
      onClick={onClose}>
      <div className="modal-content"
        style={isMobile
          ? { maxWidth: '100%', width: '100%', padding: 0, borderRadius: '1.25rem 1.25rem 0 0', maxHeight: '93vh', overflowY: 'auto', margin: 0 }
          : { maxWidth: 680, padding: 0 }}
        onClick={e => e.stopPropagation()}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Memuat...</div>
        ) : (
          <form onSubmit={handleSave}>

            {isMobile && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '0.6rem 0 0' }}>
                <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--glass-border)' }} />
              </div>
            )}

            {/* ── Header ── */}
            <div style={{ padding: `${isMobile ? '1.1rem' : '1.5rem'} ${ph} ${pv}`, borderBottom: '1px solid var(--glass-border)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Penilaian Mengajar</p>
                  <input
                    value={form.judul}
                    onChange={e => setForm(f => ({ ...f, judul: e.target.value }))}
                    required disabled={!canEdit}
                    placeholder="Judul penilaian..."
                    style={{ width: '100%', fontSize: isMobile ? '1.1rem' : '1.3rem', fontWeight: 700, border: 'none', outline: 'none', background: 'transparent', color: 'var(--text-primary)', fontFamily: 'inherit', padding: 0, lineHeight: 1.3, marginTop: '0.15rem' }}
                  />
                </div>
                <button type="button" onClick={onClose}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0.2rem', flexShrink: 0 }}>
                  <X size={20} />
                </button>
              </div>

              {/* Banner terkunci */}
              {locked && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(4,120,87,0.08)', border: '1px solid rgba(4,120,87,0.25)', borderRadius: '0.5rem', padding: '0.55rem 0.75rem', marginBottom: '0.85rem', fontSize: '0.8rem', color: '#047857' }}>
                  <Lock size={14} />
                  <span style={{ flex: 1 }}>Penilaian sudah <strong>Approve</strong> dan terkunci.</span>
                  {isAdmin && (
                    <button type="button" onClick={reopen}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: '#fff', border: '1px solid rgba(4,120,87,0.35)', borderRadius: '0.4rem', padding: '0.25rem 0.55rem', cursor: 'pointer', color: '#047857', fontWeight: 600, fontSize: '0.75rem' }}>
                      <RotateCcw size={12} /> Buka Kembali
                    </button>
                  )}
                </div>
              )}

              {/* Status chips */}
              <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.9rem', flexWrap: 'wrap' }}>
                {['Proses', 'Revisi', 'Approve'].map(s => {
                  const cfg = STATUS_CFG[s];
                  const active = form.status === s;
                  const clickable = isAdmin && (!locked || s !== form.status);
                  return (
                    <button key={s} type="button"
                      onClick={() => clickable && changeStatus(s)}
                      disabled={!isAdmin || locked}
                      style={{
                        padding: '0.3rem 0.85rem', borderRadius: 999, fontSize: '0.78rem', fontWeight: 700,
                        border: `1.5px solid ${active ? cfg.color : 'var(--glass-border)'}`,
                        background: active ? cfg.bg : 'transparent',
                        color: active ? cfg.color : 'var(--text-secondary)',
                        cursor: (isAdmin && !locked) ? 'pointer' : 'default',
                        opacity: (!isAdmin || locked) && !active ? 0.5 : 1,
                        fontFamily: 'inherit',
                      }}>
                      {s}
                    </button>
                  );
                })}
              </div>

              {/* Metadata grid */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? '0.5rem' : '0.6rem 2.5rem' }}>
                {/* Guru dinilai */}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', minWidth: 78 }}>Guru</span>
                  <select value={form.assignee_id} onChange={e => setForm(f => ({ ...f, assignee_id: e.target.value }))}
                    disabled={!canEdit} required
                    style={{ ...inpStyle, flex: 1, cursor: canEdit ? 'pointer' : 'default' }}>
                    <option value="">— Pilih guru</option>
                    {gurus.map(g => <option key={g.id} value={g.id}>{g.nama}</option>)}
                  </select>
                </div>

                {/* Cabang */}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', minWidth: 78 }}>Cabang</span>
                  <select value={form.unit_id} onChange={e => setForm(f => ({ ...f, unit_id: e.target.value }))}
                    disabled={!canEdit} required
                    style={{ ...inpStyle, flex: 1, cursor: canEdit ? 'pointer' : 'default' }}>
                    <option value="">— Pilih cabang</option>
                    {units.map(u => <option key={u.id} value={u.id}>{u.nama}</option>)}
                  </select>
                </div>

                {/* Bulan */}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', minWidth: 78 }}>Bulan</span>
                  <select value={form.bulan} onChange={e => setForm(f => ({ ...f, bulan: Number(e.target.value) }))}
                    disabled={!canEdit}
                    style={{ ...inpStyle, flex: 1, cursor: canEdit ? 'pointer' : 'default' }}>
                    {BULAN.slice(1).map((b, i) => <option key={i + 1} value={i + 1}>{b}</option>)}
                  </select>
                </div>

                {/* Tahun */}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', minWidth: 78 }}>Tahun</span>
                  <select value={form.tahun} onChange={e => setForm(f => ({ ...f, tahun: Number(e.target.value) }))}
                    disabled={!canEdit}
                    style={{ ...inpStyle, flex: 1, cursor: canEdit ? 'pointer' : 'default' }}>
                    {[THIS_YEAR - 1, THIS_YEAR, THIS_YEAR + 1].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>

                {/* Tag */}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', minWidth: 78 }}>Tag</span>
                  <select value={form.label_id} onChange={e => setForm(f => ({ ...f, label_id: e.target.value }))}
                    disabled={!canEdit}
                    style={{ ...inpStyle, flex: 1, cursor: canEdit ? 'pointer' : 'default' }}>
                    <option value="">— Tanpa tag</option>
                    {labels.map(l => <option key={l.id} value={l.id}>{l.nama}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* ── Deskripsi ── */}
            <div style={{ padding: `${pv} ${ph}` }}>
              <p style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>Deskripsi Penilaian</p>
              <textarea rows={5} value={form.deskripsi}
                onChange={e => setForm(f => ({ ...f, deskripsi: e.target.value }))}
                disabled={!canEdit}
                placeholder="Tuliskan catatan penilaian mengajar..."
                style={{ width: '100%', border: '1px solid var(--glass-border)', borderRadius: '0.5rem', padding: '0.65rem 0.75rem', outline: 'none', resize: 'vertical', background: 'var(--surface-color)', fontFamily: 'inherit', fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.6, boxSizing: 'border-box' }}
              />
            </div>

            {/* ── Komentar (hanya entri yang sudah ada) ── */}
            {!isNew && (
              <div style={{ borderTop: '1px solid var(--glass-border)', padding: `${pv} ${ph}`, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>
                  Komentar {comments.length > 0 ? `(${comments.length})` : ''}
                </p>

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
                      <Send size={13} /> {sendingComment ? 'Mengirim...' : 'Kirim'}
                    </button>
                  </div>
                </div>

                {/* List komentar — terbaru di atas */}
                {comments.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', maxHeight: 240, overflowY: 'auto' }}>
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

                {/* Lampiran tanpa komentar (bila ada) */}
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
            <div style={{ padding: `0.85rem ${ph}`, borderTop: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                {row ? `Dibuat ${fmtDT(row.created_at)}` : 'Penilaian baru'}
                {row?.approved_at && <span style={{ color: '#047857' }}>· Approve {fmtDT(row.approved_at)}</span>}
              </span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" className="btn" onClick={onClose} style={{ fontSize: '0.875rem' }}>Tutup</button>
                {canEdit && (
                  <button type="submit" className="btn btn-primary" disabled={saving} style={{ fontSize: '0.875rem' }}>
                    {saving ? 'Menyimpan...' : isNew ? 'Buat Penilaian' : 'Simpan'}
                  </button>
                )}
              </div>
            </div>

          </form>
        )}
      </div>
    </div>
  );
}
