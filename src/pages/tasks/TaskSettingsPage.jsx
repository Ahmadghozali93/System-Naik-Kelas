import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, X, GripVertical, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/authStore';

const PRESET_COLORS = ['#94a3b8','#3b82f6','#f59e0b','#22c55e','#ef4444','#8b5cf6','#06b6d4','#ec4899','#f97316','#10b981'];

const inp = {
  padding: '0.45rem 0.65rem', borderRadius: '0.5rem',
  border: '1px solid var(--glass-border)', background: 'var(--surface-color)',
  fontFamily: 'inherit', fontSize: '0.85rem', color: 'var(--text-primary)', boxSizing: 'border-box',
};

function ColorPicker({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', alignItems: 'center' }}>
      {PRESET_COLORS.map(c => (
        <button key={c} type="button" onClick={() => onChange(c)}
          style={{ width: 22, height: 22, borderRadius: '50%', background: c, border: value === c ? '2px solid var(--text-primary)' : '2px solid transparent', cursor: 'pointer', padding: 0, outline: 'none' }} />
      ))}
      <input type="color" value={value} onChange={e => onChange(e.target.value)}
        style={{ width: 24, height: 24, borderRadius: '50%', border: 'none', cursor: 'pointer', padding: 0, background: 'none' }}
        title="Pilih warna custom" />
    </div>
  );
}

function StageRow({ stage, onEdit, onDelete }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', marginBottom: '0.4rem' }}>
      <GripVertical size={15} style={{ color: 'var(--text-secondary)', opacity: 0.5, flexShrink: 0 }} />
      <span style={{ width: 14, height: 14, borderRadius: '50%', background: stage.warna, display: 'inline-block', flexShrink: 0 }} />
      <span style={{ flex: 1, fontWeight: 600, fontSize: '0.875rem' }}>{stage.nama}</span>
      {stage.is_final && (
        <span style={{ background: '#d1fae5', color: '#047857', borderRadius: 999, padding: '0.1rem 0.45rem', fontSize: '0.72rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
          <CheckCircle size={10} /> Final
        </span>
      )}
      <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Urutan {stage.urutan}</span>
      <button onClick={() => onEdit(stage)} style={{ background: 'rgba(79,70,229,0.08)', border: 'none', borderRadius: '0.35rem', padding: '0.28rem 0.45rem', cursor: 'pointer', color: 'var(--primary)' }}>
        <Pencil size={13} />
      </button>
      <button onClick={() => onDelete(stage.id)} style={{ background: '#fee2e2', border: 'none', borderRadius: '0.35rem', padding: '0.28rem 0.45rem', cursor: 'pointer', color: '#b91c1c' }}>
        <Trash2 size={13} />
      </button>
    </div>
  );
}

function LabelRow({ label, onEdit, onDelete }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', marginBottom: '0.4rem' }}>
      <span style={{ width: 12, height: 12, borderRadius: '50%', background: label.warna, display: 'inline-block', flexShrink: 0 }} />
      <span style={{ flex: 1, fontWeight: 600, fontSize: '0.875rem' }}>{label.nama}</span>
      <span style={{ background: label.warna + '22', color: label.warna, padding: '0.1rem 0.5rem', borderRadius: 999, fontSize: '0.78rem', fontWeight: 600 }}>{label.nama}</span>
      <button onClick={() => onEdit(label)} style={{ background: 'rgba(79,70,229,0.08)', border: 'none', borderRadius: '0.35rem', padding: '0.28rem 0.45rem', cursor: 'pointer', color: 'var(--primary)' }}>
        <Pencil size={13} />
      </button>
      <button onClick={() => onDelete(label.id)} style={{ background: '#fee2e2', border: 'none', borderRadius: '0.35rem', padding: '0.28rem 0.45rem', cursor: 'pointer', color: '#b91c1c' }}>
        <Trash2 size={13} />
      </button>
    </div>
  );
}

export default function TaskSettingsPage() {
  const { user } = useAuth();
  const isAdmin = ['Owner', 'Administrator', 'Supervisor'].includes(user?.role);

  const [stages, setStages]   = useState([]);
  const [labels, setLabels]   = useState([]);
  const [loading, setLoading] = useState(true);

  // Stage modal
  const [stageModal, setStageModal] = useState(false);
  const [stageEditId, setStageEditId] = useState(null);
  const [stageForm, setStageForm]   = useState({ nama: '', urutan: 1, warna: '#6366f1', is_final: false });
  const [stageSaving, setStageSaving] = useState(false);

  // Label modal
  const [labelModal, setLabelModal] = useState(false);
  const [labelEditId, setLabelEditId] = useState(null);
  const [labelForm, setLabelForm]   = useState({ nama: '', warna: '#6366f1' });
  const [labelSaving, setLabelSaving] = useState(false);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    const [stRes, lbRes] = await Promise.all([
      supabase.from('task_stages').select('*').order('urutan'),
      supabase.from('task_labels').select('*').order('nama'),
    ]);
    setStages(stRes.data || []);
    setLabels(lbRes.data || []);
    setLoading(false);
  };

  // ── Stage CRUD ──
  const openStageAdd = () => {
    setStageEditId(null);
    setStageForm({ nama: '', urutan: (stages[stages.length - 1]?.urutan || 0) + 1, warna: '#6366f1', is_final: false });
    setStageModal(true);
  };
  const openStageEdit = (s) => {
    setStageEditId(s.id);
    setStageForm({ nama: s.nama, urutan: s.urutan, warna: s.warna, is_final: s.is_final });
    setStageModal(true);
  };
  const saveStage = async (e) => {
    e.preventDefault();
    if (!stageForm.nama.trim()) return;
    setStageSaving(true);
    const payload = { nama: stageForm.nama.trim(), urutan: Number(stageForm.urutan), warna: stageForm.warna, is_final: stageForm.is_final };
    const { error } = stageEditId
      ? await supabase.from('task_stages').update(payload).eq('id', stageEditId)
      : await supabase.from('task_stages').insert(payload);
    setStageSaving(false);
    if (error) return alert(error.code === '23505' ? 'Nama stage sudah digunakan.' : 'Gagal: ' + error.message);
    setStageModal(false);
    loadAll();
  };
  const deleteStage = async (id) => {
    if (!window.confirm('Hapus stage ini? Task yang menggunakan stage ini tidak akan terhapus, tapi stage-nya jadi kosong.')) return;
    const { error } = await supabase.from('task_stages').delete().eq('id', id);
    if (error) return alert('Gagal: ' + error.message);
    loadAll();
  };

  // ── Label CRUD ──
  const openLabelAdd = () => { setLabelEditId(null); setLabelForm({ nama: '', warna: '#6366f1' }); setLabelModal(true); };
  const openLabelEdit = (l) => { setLabelEditId(l.id); setLabelForm({ nama: l.nama, warna: l.warna }); setLabelModal(true); };
  const saveLabel = async (e) => {
    e.preventDefault();
    if (!labelForm.nama.trim()) return;
    setLabelSaving(true);
    const payload = { nama: labelForm.nama.trim(), warna: labelForm.warna };
    const { error } = labelEditId
      ? await supabase.from('task_labels').update(payload).eq('id', labelEditId)
      : await supabase.from('task_labels').insert(payload);
    setLabelSaving(false);
    if (error) return alert(error.code === '23505' ? 'Nama label sudah digunakan.' : 'Gagal: ' + error.message);
    setLabelModal(false);
    loadAll();
  };
  const deleteLabel = async (id) => {
    if (!window.confirm('Hapus label ini?')) return;
    const { error } = await supabase.from('task_labels').delete().eq('id', id);
    if (error) return alert('Gagal: ' + error.message);
    loadAll();
  };

  if (!isAdmin) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Hanya admin yang dapat mengakses halaman ini.</div>;

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tugas</p>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>Pengaturan Stage & Label</h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.3rem 0 0' }}>Konfigurasi kolom Kanban dan label yang tersedia untuk semua task.</p>
      </div>

      {loading ? <p style={{ color: 'var(--text-secondary)' }}>Memuat...</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>

          {/* ── Stages ── */}
          <div className="glass-card" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontWeight: 700, margin: 0, fontSize: '1rem' }}>Stage Kanban ({stages.length})</h3>
              <button className="btn btn-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }} onClick={openStageAdd}>
                <Plus size={13} /> Tambah
              </button>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0 0 0.75rem', lineHeight: 1.5 }}>
              Stage adalah kolom di Papan Kanban. Tandai satu stage sebagai <b>Final</b> untuk menandai task selesai.
            </p>
            {stages.length === 0 ? <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Belum ada stage.</p> : (
              stages.map(s => <StageRow key={s.id} stage={s} onEdit={openStageEdit} onDelete={deleteStage} />)
            )}
          </div>

          {/* ── Labels ── */}
          <div className="glass-card" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontWeight: 700, margin: 0, fontSize: '1rem' }}>Label ({labels.length})</h3>
              <button className="btn btn-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }} onClick={openLabelAdd}>
                <Plus size={13} /> Tambah
              </button>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0 0 0.75rem', lineHeight: 1.5 }}>
              Label digunakan untuk mengelompokkan task berdasarkan fungsi (mis. Keuangan, Akademik).
            </p>
            {labels.length === 0 ? <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Belum ada label.</p> : (
              labels.map(l => <LabelRow key={l.id} label={l} onEdit={openLabelEdit} onDelete={deleteLabel} />)
            )}
          </div>
        </div>
      )}

      {/* Stage Modal */}
      {stageModal && (
        <div className="modal-overlay" onClick={() => setStageModal(false)}>
          <div className="modal-content" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.1rem' }}>
              <h2 style={{ fontWeight: 700, fontSize: '1rem', margin: 0 }}>{stageEditId ? 'Edit Stage' : 'Tambah Stage'}</h2>
              <button onClick={() => setStageModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <form onSubmit={saveStage} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600, fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Nama Stage *</label>
                <input style={{ ...inp, width: '100%' }} value={stageForm.nama} onChange={e => setStageForm(f => ({ ...f, nama: e.target.value }))} required placeholder="mis. Backlog, Dikerjakan, Review..." />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600, fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Urutan</label>
                  <input type="number" min={1} style={{ ...inp, width: '100%' }} value={stageForm.urutan} onChange={e => setStageForm(f => ({ ...f, urutan: e.target.value }))} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600, fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Stage Final?</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginTop: '0.5rem' }}>
                    <input type="checkbox" checked={stageForm.is_final} onChange={e => setStageForm(f => ({ ...f, is_final: e.target.checked }))} style={{ accentColor: 'var(--primary)', width: 16, height: 16 }} />
                    <span style={{ fontSize: '0.85rem' }}>Ya (task selesai)</span>
                  </label>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Warna</label>
                <ColorPicker value={stageForm.warna} onChange={w => setStageForm(f => ({ ...f, warna: w }))} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', background: stageForm.warna + '22', borderRadius: '0.4rem', borderLeft: '3px solid ' + stageForm.warna }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: stageForm.warna, display: 'inline-block' }} />
                <span style={{ fontWeight: 700, fontSize: '0.875rem', color: stageForm.warna }}>{stageForm.nama || 'Preview Stage'}</span>
              </div>
              <div style={{ display: 'flex', gap: '0.65rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn" onClick={() => setStageModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary" disabled={stageSaving}>{stageSaving ? 'Menyimpan...' : 'Simpan'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Label Modal */}
      {labelModal && (
        <div className="modal-overlay" onClick={() => setLabelModal(false)}>
          <div className="modal-content" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.1rem' }}>
              <h2 style={{ fontWeight: 700, fontSize: '1rem', margin: 0 }}>{labelEditId ? 'Edit Label' : 'Tambah Label'}</h2>
              <button onClick={() => setLabelModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <form onSubmit={saveLabel} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600, fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Nama Label *</label>
                <input style={{ ...inp, width: '100%' }} value={labelForm.nama} onChange={e => setLabelForm(f => ({ ...f, nama: e.target.value }))} required placeholder="mis. Keuangan, Akademik..." />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Warna</label>
                <ColorPicker value={labelForm.warna} onChange={w => setLabelForm(f => ({ ...f, warna: w }))} />
              </div>
              <div>
                <span style={{ background: labelForm.warna + '22', color: labelForm.warna, padding: '0.2rem 0.65rem', borderRadius: 999, fontWeight: 700, fontSize: '0.85rem' }}>
                  {labelForm.nama || 'Preview Label'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.65rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn" onClick={() => setLabelModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary" disabled={labelSaving}>{labelSaving ? 'Menyimpan...' : 'Simpan'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
