import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, X, FolderOpen, Calendar, RotateCcw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/authStore';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

const STATUS_BADGE = {
  aktif:   { bg: '#d1fae5', color: '#047857' },
  selesai: { bg: '#dbeafe', color: '#1d4ed8' },
  arsip:   { bg: '#f3f4f6', color: '#6b7280' },
};

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

const EMPTY = { nama: '', tipe_project: 'rutin', unit_id: '', status: 'aktif', tanggal_mulai: '', tanggal_selesai: '', deskripsi: '' };

export default function TaskProjectPage() {
  const { user } = useAuth();
  const isAdmin = ['Owner', 'Administrator', 'Supervisor'].includes(user?.role);

  const [projects, setProjects] = useState([]);
  const [units, setUnits]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState(false);
  const [editId, setEditId]     = useState(null);
  const [form, setForm]         = useState(EMPTY);
  const [saving, setSaving]     = useState(false);
  const [filterType, setFilterType]     = useState('');
  const [filterStatus, setFilterStatus] = useState('aktif');

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    const [prRes, unRes] = await Promise.all([
      supabase.from('task_projects').select('*, units(nama)').order('created_at', { ascending: false }),
      supabase.from('units').select('id, nama').eq('aktif', true).order('nama'),
    ]);
    setProjects(prRes.data || []);
    setUnits(unRes.data || []);
    setLoading(false);
  };

  const openAdd = () => { setEditId(null); setForm(EMPTY); setModal(true); };
  const openEdit = (p) => {
    setEditId(p.id);
    setForm({
      nama: p.nama, tipe_project: p.tipe_project, unit_id: p.unit_id,
      status: p.status, tanggal_mulai: p.tanggal_mulai || '', tanggal_selesai: p.tanggal_selesai || '',
      deskripsi: p.deskripsi || '',
    });
    setModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.nama.trim() || !form.unit_id) return alert('Nama dan Unit wajib diisi.');
    setSaving(true);
    const payload = {
      nama: form.nama.trim(), tipe_project: form.tipe_project,
      unit_id: form.unit_id, status: form.status,
      tanggal_mulai:   form.tanggal_mulai || null,
      tanggal_selesai: form.tanggal_selesai || null,
      deskripsi: form.deskripsi || null,
    };
    const { error } = editId
      ? await supabase.from('task_projects').update(payload).eq('id', editId)
      : await supabase.from('task_projects').insert({ ...payload, dibuat_oleh: user?.id });
    setSaving(false);
    if (error) return alert('Gagal: ' + error.message);
    setModal(false);
    loadAll();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Hapus project ini? Task di dalamnya tidak ikut terhapus.')) return;
    const { error } = await supabase.from('task_projects').delete().eq('id', id);
    if (error) return alert('Gagal: ' + error.message);
    loadAll();
  };

  const filtered = projects.filter(p => {
    if (filterType   && p.tipe_project !== filterType)   return false;
    if (filterStatus && p.status       !== filterStatus) return false;
    return true;
  });

  const sel = { padding: '0.42rem 0.65rem', borderRadius: '0.4rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontFamily: 'inherit', fontSize: '0.8rem' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tugas</p>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>Kelola Project</h1>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }} onClick={openAdd}>
            <Plus size={15} /> Buat Project
          </button>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <select style={sel} value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">Semua Tipe</option>
          <option value="rutin">Rutin</option>
          <option value="sementara">Sementara</option>
        </select>
        <select style={sel} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Semua Status</option>
          <option value="aktif">Aktif</option>
          <option value="selesai">Selesai</option>
          <option value="arsip">Arsip</option>
        </select>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Memuat...</p>
      ) : filtered.length === 0 ? (
        <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <FolderOpen size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.3 }} />
          <p style={{ margin: 0 }}>Belum ada project.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '0.85rem' }}>
          {filtered.map(p => {
            const sb = STATUS_BADGE[p.status] || STATUS_BADGE.aktif;
            return (
              <div key={p.id} className="glass-card" style={{ padding: '1.1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginBottom: '0.3rem', flexWrap: 'wrap' }}>
                      <span style={{ background: p.tipe_project === 'rutin' ? 'rgba(79,70,229,0.1)' : 'rgba(5,150,105,0.1)', color: p.tipe_project === 'rutin' ? 'var(--primary)' : '#059669', padding: '0.1rem 0.45rem', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700 }}>
                        {p.tipe_project === 'rutin' ? <><RotateCcw size={10} style={{ display: 'inline', marginRight: 2 }} />Rutin</> : <><Calendar size={10} style={{ display: 'inline', marginRight: 2 }} />Sementara</>}
                      </span>
                      <span style={{ background: sb.bg, color: sb.color, padding: '0.1rem 0.45rem', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700 }}>
                        {p.status}
                      </span>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '1rem', lineHeight: 1.3 }}>{p.nama}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>{p.units?.nama || '-'}</div>
                  </div>
                  {isAdmin && (
                    <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0, marginLeft: '0.5rem' }}>
                      <button onClick={() => openEdit(p)} style={{ background: 'rgba(79,70,229,0.08)', border: 'none', borderRadius: '0.35rem', padding: '0.3rem 0.5rem', cursor: 'pointer', color: 'var(--primary)' }}>
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => handleDelete(p.id)} style={{ background: '#fee2e2', border: 'none', borderRadius: '0.35rem', padding: '0.3rem 0.5rem', cursor: 'pointer', color: '#b91c1c' }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
                {p.deskripsi && <p style={{ margin: '0.4rem 0', fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{p.deskripsi}</p>}
                {p.tipe_project === 'sementara' && (p.tanggal_mulai || p.tanggal_selesai) && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Calendar size={11} />
                    {fmtDate(p.tanggal_mulai)} — {fmtDate(p.tanggal_selesai)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal-content" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontWeight: 700, fontSize: '1.05rem', margin: 0 }}>{editId ? 'Edit Project' : 'Buat Project Baru'}</h2>
              <button onClick={() => setModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>{lb('Nama Project', true)}<input style={inp} value={form.nama} onChange={e => setForm(f => ({ ...f, nama: e.target.value }))} required /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  {lb('Tipe', true)}
                  <select style={inp} value={form.tipe_project} onChange={e => setForm(f => ({ ...f, tipe_project: e.target.value }))}>
                    <option value="rutin">Rutin</option>
                    <option value="sementara">Sementara</option>
                  </select>
                </div>
                <div>
                  {lb('Status')}
                  <select style={inp} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                    <option value="aktif">Aktif</option>
                    <option value="selesai">Selesai</option>
                    <option value="arsip">Arsip</option>
                  </select>
                </div>
              </div>
              <div>
                {lb('Unit / Cabang', true)}
                <select style={inp} value={form.unit_id} onChange={e => setForm(f => ({ ...f, unit_id: e.target.value }))} required>
                  <option value="">-- Pilih Unit --</option>
                  {units.map(u => <option key={u.id} value={u.id}>{u.nama}</option>)}
                </select>
              </div>
              {form.tipe_project === 'sementara' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>{lb('Tanggal Mulai')}<input type="date" style={inp} value={form.tanggal_mulai} onChange={e => setForm(f => ({ ...f, tanggal_mulai: e.target.value }))} /></div>
                  <div>{lb('Tanggal Selesai')}<input type="date" style={inp} value={form.tanggal_selesai} onChange={e => setForm(f => ({ ...f, tanggal_selesai: e.target.value }))} /></div>
                </div>
              )}
              <div>{lb('Deskripsi')}<textarea rows={2} style={{ ...inp, resize: 'vertical' }} value={form.deskripsi} onChange={e => setForm(f => ({ ...f, deskripsi: e.target.value }))} /></div>
              <div style={{ display: 'flex', gap: '0.65rem', justifyContent: 'flex-end' }}>
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
