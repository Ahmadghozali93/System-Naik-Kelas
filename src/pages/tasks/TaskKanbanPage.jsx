import { useState, useEffect, useRef } from 'react';
import { Plus, AlertCircle, Search, Filter } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/authStore';
import TaskDetailModal from './TaskDetailModal';

const PRIORITAS_COLOR = { Tinggi: '#ef4444', Sedang: '#f59e0b', Rendah: '#22c55e' };
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) : null;

export default function TaskKanbanPage() {
  const { user } = useAuth();
  const isAdmin = ['Owner', 'Administrator', 'Supervisor'].includes(user?.role);

  const [stages, setStages]     = useState([]);
  const [tasks, setTasks]       = useState([]);
  const [units, setUnits]       = useState([]);
  const [projects, setProjects] = useState([]);
  const [labels, setLabels]     = useState([]);
  const [loading, setLoading]   = useState(true);

  const [filterUnit, setFilterUnit]     = useState('');
  const [filterProj, setFilterProj]     = useState('');
  const [filterLabel, setFilterLabel]   = useState('');
  const [filterPrior, setFilterPrior]   = useState('');
  const [search, setSearch]             = useState('');
  const [showDone, setShowDone]         = useState(false);

  const [modalId, setModalId]           = useState(undefined);
  const [newInStage, setNewInStage]     = useState(null); // stage_id untuk buat task baru

  const dragTaskId  = useRef(null);
  const dragOverStage = useRef(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    const [stRes, tRes, unRes, prRes, lbRes] = await Promise.all([
      supabase.from('task_stages').select('*').order('urutan'),
      supabase.from('tasks').select(`
        id, judul, prioritas, deadline, stage_id, unit_id, selesai_pada, dibuat_oleh,
        task_stages(id,nama,warna,is_final),
        task_labels(id,nama,warna),
        task_projects(id,nama),
        task_assignees(guru_id, gurus(id,nama))
      `).order('created_at', { ascending: false }),
      supabase.from('units').select('id, nama').eq('aktif', true).order('nama'),
      supabase.from('task_projects').select('id, nama').eq('status', 'aktif').order('nama'),
      supabase.from('task_labels').select('*').order('nama'),
    ]);
    setStages(stRes.data || []);
    setTasks(tRes.data || []);
    setUnits(unRes.data || []);
    setProjects(prRes.data || []);
    setLabels(lbRes.data || []);
    setLoading(false);
  };

  // ── Drag & Drop ──
  const onDragStart = (e, taskId) => {
    dragTaskId.current = taskId;
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (e, stageId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    dragOverStage.current = stageId;
  };

  const onDrop = async (e, newStageId) => {
    e.preventDefault();
    const tid = dragTaskId.current;
    if (!tid || dragOverStage.current !== newStageId) return;
    const task = tasks.find(t => t.id === tid);
    if (!task || task.stage_id === newStageId) return;

    const targetStage = stages.find(s => s.id === newStageId);
    const payload = { stage_id: newStageId };

    if (targetStage?.is_final && !task.selesai_pada) {
      payload.selesai_pada = new Date().toISOString();
      payload.is_late = task.deadline ? new Date() > new Date(task.deadline) : false;
    } else if (!targetStage?.is_final && task.selesai_pada) {
      payload.selesai_pada = null;
      payload.is_late = null;
    }

    // Optimistic update
    setTasks(prev => prev.map(t => t.id === tid ? { ...t, ...payload, task_stages: targetStage } : t));
    await supabase.from('tasks').update(payload).eq('id', tid);
    dragTaskId.current = null;
    dragOverStage.current = null;
  };

  // ── Filter ──
  const visible = tasks.filter(t => {
    if (!showDone && t.selesai_pada) return false;
    if (filterUnit  && t.unit_id !== filterUnit) return false;
    if (filterProj  && t.task_projects?.id !== filterProj) return false;
    if (filterLabel && t.task_labels?.id !== filterLabel) return false;
    if (filterPrior && t.prioritas !== filterPrior) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!t.judul?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const byStage = (stageId) => visible.filter(t => t.stage_id === stageId);

  const sel = { padding: '0.4rem 0.65rem', borderRadius: '0.4rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontFamily: 'inherit', fontSize: '0.8rem' };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: '1rem' }}>
        <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tugas</p>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>Papan Kanban</h1>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input style={{ ...sel, paddingLeft: '2rem', minWidth: 180 }} placeholder="Cari judul..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select style={sel} value={filterUnit} onChange={e => setFilterUnit(e.target.value)}>
          <option value="">Semua Unit</option>
          {units.map(u => <option key={u.id} value={u.id}>{u.nama}</option>)}
        </select>
        <select style={sel} value={filterProj} onChange={e => setFilterProj(e.target.value)}>
          <option value="">Semua Project</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.nama}</option>)}
        </select>
        <select style={sel} value={filterLabel} onChange={e => setFilterLabel(e.target.value)}>
          <option value="">Semua Label</option>
          {labels.map(l => <option key={l.id} value={l.id}>{l.nama}</option>)}
        </select>
        <select style={sel} value={filterPrior} onChange={e => setFilterPrior(e.target.value)}>
          <option value="">Semua Prioritas</option>
          <option value="Tinggi">Tinggi</option>
          <option value="Sedang">Sedang</option>
          <option value="Rendah">Rendah</option>
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} style={{ accentColor: 'var(--primary)' }} />
          Tampilkan Selesai
        </label>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Memuat...</p>
      ) : (
        <div style={{ display: 'flex', gap: '0.85rem', overflowX: 'auto', flex: 1, paddingBottom: '1rem', alignItems: 'flex-start' }}>
          {stages.map(stage => {
            const stageTasks = byStage(stage.id);
            return (
              <div
                key={stage.id}
                onDragOver={e => onDragOver(e, stage.id)}
                onDrop={e => onDrop(e, stage.id)}
                style={{
                  minWidth: 280, width: 280, flexShrink: 0,
                  background: 'var(--surface-color)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: '0.75rem',
                  display: 'flex', flexDirection: 'column',
                  maxHeight: 'calc(100vh - 220px)',
                }}
              >
                {/* Column header */}
                <div style={{ padding: '0.75rem 1rem', borderBottom: '2px solid ' + stage.warna, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: stage.warna, display: 'inline-block' }} />
                    <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>{stage.nama}</span>
                    <span style={{ background: 'var(--glass-border)', color: 'var(--text-secondary)', borderRadius: 999, padding: '0 0.4rem', fontSize: '0.75rem' }}>
                      {stageTasks.length}
                    </span>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => { setNewInStage(stage.id); setModalId(null); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: stage.warna, padding: '0.1rem' }}
                      title="Buat task di kolom ini"
                    >
                      <Plus size={16} />
                    </button>
                  )}
                </div>

                {/* Task cards */}
                <div style={{ padding: '0.5rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {stageTasks.map(task => {
                    const isOD = !task.selesai_pada && task.deadline && new Date(task.deadline) < new Date();
                    return (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={e => onDragStart(e, task.id)}
                        onClick={() => setModalId(task.id)}
                        style={{
                          background: 'var(--bg-color, #fff)',
                          border: `1px solid ${isOD ? '#fca5a5' : 'var(--glass-border)'}`,
                          borderRadius: '0.5rem', padding: '0.65rem 0.75rem',
                          cursor: 'pointer', transition: 'box-shadow 0.15s',
                        }}
                        onMouseOver={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'}
                        onMouseOut={e => e.currentTarget.style.boxShadow = 'none'}
                      >
                        <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.35rem', lineHeight: 1.35 }}>{task.judul}</div>
                        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{ color: PRIORITAS_COLOR[task.prioritas], fontSize: '0.72rem', fontWeight: 700 }}>● {task.prioritas}</span>
                          {task.task_labels && (
                            <span style={{ background: task.task_labels.warna + '22', color: task.task_labels.warna, padding: '0 0.35rem', borderRadius: 999, fontSize: '0.7rem', fontWeight: 600 }}>
                              {task.task_labels.nama}
                            </span>
                          )}
                          {isOD && (
                            <span style={{ color: '#b91c1c', fontSize: '0.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2 }}>
                              <AlertCircle size={10} /> OD
                            </span>
                          )}
                        </div>
                        {task.deadline && (
                          <div style={{ fontSize: '0.72rem', color: isOD ? '#b91c1c' : 'var(--text-secondary)', marginTop: '0.3rem' }}>
                            ⏰ {fmtDate(task.deadline)}
                          </div>
                        )}
                        {/* Assignee bubbles */}
                        {task.task_assignees?.length > 0 && (
                          <div style={{ display: 'flex', gap: '0.2rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                            {task.task_assignees.slice(0, 3).map(a => (
                              <span key={a.guru_id} style={{
                                background: 'rgba(79,70,229,0.1)', color: 'var(--primary)',
                                borderRadius: 999, padding: '0.1rem 0.35rem', fontSize: '0.65rem', fontWeight: 600,
                              }}>
                                {a.gurus?.nama?.split(' ')[0] || '?'}
                              </span>
                            ))}
                            {task.task_assignees.length > 3 && (
                              <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>+{task.task_assignees.length - 3}</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {stageTasks.length === 0 && (
                    <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem', padding: '1rem 0', opacity: 0.5 }}>
                      Kosong
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalId !== undefined && (
        <TaskDetailModal
          taskId={modalId}
          defaultStageId={newInStage}
          onClose={() => { setModalId(undefined); setNewInStage(null); }}
          onSaved={() => { setModalId(undefined); setNewInStage(null); loadAll(); }}
        />
      )}
    </div>
  );
}
