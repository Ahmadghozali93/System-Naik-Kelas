import { useState, useEffect } from 'react';
import { CheckSquare, AlertCircle, Clock, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/authStore';
import TaskDetailModal from './TaskDetailModal';

const PRIORITAS_COLOR = { Tinggi: '#ef4444', Sedang: '#f59e0b', Rendah: '#22c55e' };
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const fmtDeadline = (d) => {
  if (!d) return null;
  const dt = new Date(d);
  const now = new Date();
  const diffH = (dt - now) / 3600000;
  if (diffH < 0) return { text: 'Overdue ' + fmtDate(d), color: '#b91c1c', bg: '#fee2e2' };
  if (diffH < 24) return { text: 'Hari ini ' + dt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }), color: '#92400e', bg: '#fef3c7' };
  if (diffH < 48) return { text: 'Besok ' + fmtDate(d), color: '#b45309', bg: '#fffbeb' };
  return { text: fmtDate(d), color: 'var(--text-secondary)', bg: 'transparent' };
};

export default function TugasSayaPage() {
  const { user } = useAuth();
  const [tasks, setTasks]       = useState([]);
  const [stages, setStages]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filterStatus, setFilterStatus] = useState('aktif'); // aktif | selesai | semua
  const [modalId, setModalId]   = useState(undefined); // undefined=tutup, null=baru, uuid=edit

  useEffect(() => {
    if (user?.id) loadAll();
  }, [user?.id]);

  const loadAll = async () => {
    setLoading(true);
    const [stRes, asRes] = await Promise.all([
      supabase.from('task_stages').select('*').order('urutan'),
      supabase.from('task_assignees').select('task_id').eq('guru_id', user.id),
    ]);
    setStages(stRes.data || []);

    const taskIds = (asRes.data || []).map(a => a.task_id);
    if (!taskIds.length) { setTasks([]); setLoading(false); return; }

    const { data } = await supabase
      .from('tasks')
      .select('*, task_stages(id,nama,warna,is_final), task_labels(id,nama,warna), task_projects(id,nama)')
      .in('id', taskIds)
      .order('deadline', { ascending: true, nullsFirst: false });

    setTasks(data || []);
    setLoading(false);
  };

  const filtered = tasks.filter(t => {
    if (filterStatus === 'aktif')  return !t.selesai_pada;
    if (filterStatus === 'selesai') return !!t.selesai_pada;
    return true;
  });

  const overdue = filtered.filter(t => !t.selesai_pada && t.deadline && new Date(t.deadline) < new Date());

  const sel = { padding: '0.45rem 0.75rem', borderRadius: '0.4rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontFamily: 'inherit', fontSize: '0.82rem' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tugas</p>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>Tugas Saya</h1>
          {overdue.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#b91c1c', fontSize: '0.82rem', marginTop: '0.25rem' }}>
              <AlertCircle size={14} /> {overdue.length} tugas overdue
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
          <select style={sel} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="aktif">Aktif</option>
            <option value="selesai">Selesai</option>
            <option value="semua">Semua</option>
          </select>
          <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }} onClick={() => setModalId(null)}>
            <Plus size={15} /> Buat Task
          </button>
        </div>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Memuat...</p>
      ) : filtered.length === 0 ? (
        <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <CheckSquare size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.3 }} />
          <p style={{ margin: 0 }}>{filterStatus === 'aktif' ? 'Tidak ada tugas aktif. Semua beres!' : 'Belum ada tugas di kategori ini.'}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {filtered.map(task => {
            const dl = fmtDeadline(task.deadline);
            const isOD = !task.selesai_pada && task.deadline && new Date(task.deadline) < new Date();
            return (
              <div
                key={task.id}
                className="glass-card"
                onClick={() => setModalId(task.id)}
                style={{
                  padding: '0.85rem 1.1rem', cursor: 'pointer',
                  borderLeft: `3px solid ${task.task_stages?.warna || '#94a3b8'}`,
                  borderLeftColor: isOD ? '#ef4444' : task.task_stages?.warna || '#94a3b8',
                  transition: 'transform 0.1s', display: 'flex', alignItems: 'flex-start', gap: '0.85rem',
                }}
                onMouseOver={e => e.currentTarget.style.transform = 'translateX(3px)'}
                onMouseOut={e => e.currentTarget.style.transform = 'none'}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.2rem' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{task.judul}</span>
                    {task.selesai_pada && <span style={{ background: '#d1fae5', color: '#047857', padding: '0.1rem 0.45rem', borderRadius: 999, fontSize: '0.7rem', fontWeight: 700 }}>✓ Selesai</span>}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', fontSize: '0.78rem' }}>
                    {task.task_stages && (
                      <span style={{ background: task.task_stages.warna + '22', color: task.task_stages.warna, padding: '0.1rem 0.45rem', borderRadius: 999, fontWeight: 600 }}>
                        {task.task_stages.nama}
                      </span>
                    )}
                    <span style={{ color: PRIORITAS_COLOR[task.prioritas], fontWeight: 600 }}>● {task.prioritas}</span>
                    {task.task_labels && (
                      <span style={{ background: task.task_labels.warna + '22', color: task.task_labels.warna, padding: '0.1rem 0.45rem', borderRadius: 999 }}>
                        {task.task_labels.nama}
                      </span>
                    )}
                    {task.task_projects && (
                      <span style={{ color: 'var(--text-secondary)' }}>📁 {task.task_projects.nama}</span>
                    )}
                  </div>
                </div>
                {dl && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: dl.bg, color: dl.color, padding: '0.2rem 0.55rem', borderRadius: '0.4rem', fontSize: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>
                    <Clock size={12} /> {dl.text}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {modalId !== undefined && (
        <TaskDetailModal
          taskId={modalId}
          defaultUnitId={user?.unit_id}
          onClose={() => setModalId(undefined)}
          onSaved={() => { setModalId(undefined); loadAll(); }}
        />
      )}
    </div>
  );
}
