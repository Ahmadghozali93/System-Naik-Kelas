import { useRef, useState } from 'react';
import imageCompression from 'browser-image-compression';
import { Upload, X, ImageOff, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const ALLOWED_EXT  = ['jpg', 'jpeg', 'png', 'webp'];

const COMPRESS_OPTS = {
  maxSizeMB: 0.3,          // target 300 KB
  maxWidthOrHeight: 1280,
  useWebWorker: true,
  initialQuality: 0.82,
};

const fmt = (bytes) => bytes < 1024 * 1024
  ? (bytes / 1024).toFixed(0) + ' KB'
  : (bytes / 1024 / 1024).toFixed(1) + ' MB';

const fmtDate = (d) => d
  ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
  : '-';

export default function AttachmentUploader({ taskId, guruId, attachments, onUploaded, onDeleted, readOnly }) {
  const inputRef   = useRef();
  const [uploading, setUploading] = useState(false);
  const [err, setErr]             = useState('');
  const [signedUrls, setSignedUrls] = useState({});

  const loadSignedUrl = async (path, id) => {
    if (signedUrls[id] || !path) return;
    const { data } = await supabase.storage
      .from('task-photos')
      .createSignedUrl(path, 3600); // 1 jam
    if (data?.signedUrl) {
      setSignedUrls(prev => ({ ...prev, [id]: data.signedUrl }));
    }
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validasi tipe — frontend layer
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_TYPES.includes(file.type) || !ALLOWED_EXT.includes(ext)) {
      setErr('Hanya file gambar yang diizinkan: JPG, PNG, WebP.');
      e.target.value = '';
      return;
    }

    setErr('');
    setUploading(true);
    try {
      // Kompres
      const compressed = await imageCompression(file, COMPRESS_OPTS);

      // Simpan dengan ekstensi asli (bukan paksa ke jpg supaya PNG transparent tetap valid)
      const uniqueName = `${crypto.randomUUID()}.${ext}`;
      const path       = `tasks/${taskId}/${uniqueName}`;

      // Upload ke Storage (backend akan validasi MIME & ekstensi via policy)
      const { error: storageErr } = await supabase.storage
        .from('task-photos')
        .upload(path, compressed, { contentType: compressed.type || file.type });

      if (storageErr) throw new Error(storageErr.message);

      // Simpan record ke DB
      const { data: record, error: dbErr } = await supabase
        .from('task_attachments')
        .insert({
          task_id:       taskId,
          guru_id:       guruId,
          storage_path:  path,
          original_name: file.name,
          mime_type:     compressed.type || file.type,
          size_bytes:    compressed.size,
        })
        .select()
        .single();

      if (dbErr) throw new Error(dbErr.message);
      onUploaded?.(record);
    } catch (err) {
      setErr('Gagal upload: ' + err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDelete = async (att) => {
    if (!window.confirm('Hapus foto ini?')) return;
    if (att.storage_path) {
      await supabase.storage.from('task-photos').remove([att.storage_path]);
    }
    const { error } = await supabase
      .from('task_attachments')
      .delete()
      .eq('id', att.id);
    if (error) { alert('Gagal hapus: ' + error.message); return; }
    onDeleted?.(att.id);
  };

  return (
    <div>
      {/* Tombol upload */}
      {!readOnly && (
        <div style={{ marginBottom: '0.75rem' }}>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            onChange={handleFile}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.45rem 0.85rem', borderRadius: '0.5rem',
              border: '1px dashed var(--glass-border)',
              background: 'var(--surface-color)',
              cursor: uploading ? 'not-allowed' : 'pointer',
              fontSize: '0.82rem', color: 'var(--text-secondary)',
              opacity: uploading ? 0.6 : 1, transition: 'all 0.15s',
            }}
          >
            <Upload size={14} />
            {uploading ? 'Mengompres & mengupload...' : 'Upload Foto'}
          </button>
          <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            JPG / PNG / WebP · maks 3 MB · dikompres otomatis
          </span>
        </div>
      )}

      {err && (
        <p style={{ color: '#ef4444', fontSize: '0.8rem', marginBottom: '0.5rem' }}>{err}</p>
      )}

      {/* Grid foto */}
      {attachments?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
          {attachments.map(att => {
            const expired = att.is_expired || att.storage_deleted_at;
            if (!signedUrls[att.id] && !expired && att.storage_path) {
              loadSignedUrl(att.storage_path, att.id);
            }
            return (
              <div
                key={att.id}
                style={{
                  position: 'relative', width: 110, height: 110,
                  borderRadius: '0.5rem', overflow: 'hidden',
                  border: '1px solid var(--glass-border)',
                  background: 'var(--surface-color)',
                  flexShrink: 0,
                }}
              >
                {expired ? (
                  <div style={{
                    width: '100%', height: '100%', display: 'flex',
                    flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', gap: '0.3rem',
                    color: 'var(--text-secondary)', fontSize: '0.68rem', padding: '0.4rem',
                    textAlign: 'center',
                  }}>
                    <ImageOff size={20} />
                    <span>Foto kedaluwarsa</span>
                    <span style={{ fontSize: '0.65rem', color: '#b45309' }}>
                      <Clock size={10} style={{ display: 'inline', marginRight: 2 }} />
                      {fmtDate(att.uploaded_at)}
                    </span>
                  </div>
                ) : signedUrls[att.id] ? (
                  <a href={signedUrls[att.id]} target="_blank" rel="noreferrer">
                    <img
                      src={signedUrls[att.id]}
                      alt={att.original_name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </a>
                ) : (
                  <div style={{
                    width: '100%', height: '100%',
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'center', color: 'var(--text-secondary)',
                  }}>
                    <Upload size={18} />
                  </div>
                )}

                {/* Info ukuran */}
                {!expired && att.size_bytes && (
                  <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    background: 'rgba(0,0,0,0.45)', color: '#fff',
                    fontSize: '0.62rem', padding: '2px 5px', textAlign: 'center',
                  }}>
                    {fmt(att.size_bytes)}
                  </div>
                )}

                {/* Tombol hapus */}
                {!readOnly && !expired && (
                  <button
                    onClick={() => handleDelete(att)}
                    style={{
                      position: 'absolute', top: 3, right: 3,
                      background: 'rgba(239,68,68,0.85)', border: 'none',
                      borderRadius: '50%', width: 20, height: 20,
                      cursor: 'pointer', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', padding: 0,
                    }}
                  >
                    <X size={11} color="#fff" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
