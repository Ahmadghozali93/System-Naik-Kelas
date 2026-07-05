import { useState, useEffect, useMemo } from 'react';
import { Search, Plus, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/authStore';
import TaskDetailModal from './TaskDetailModal';

const PER_PAGE = 25;
const PRIORITAS_COLOR = { Tinggi: '#ef4444', Sedang: '#f59e0b', Rendah: '#22c55e' };
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

export default function TaskListPage() {
  const { user } = useAuth();
  const isAdmin = ['Owner', 'Administrator', 'Supervisor'].includes(user?.role);

  const [tasks, setTasks]       = useState([]);
  const [stages, setStages]     = useState([]);
  const [labels, setLabels]     = useState([]);
  const [projects, setProjects] = useState([]);
  const [units, setUnits]       = useState([]);
  const [loading, setLoading]   = useState(true);

  const [search, setSearch]         = useState('');
  const [filterUnit, setFilterUnit] = useState('');
  const [filterStage, setFilterStage] = useState('');
  const [filterPrior, setFilterPrior] = useState('');
  const [filterLabel, setFilterLabel] = useState('');
  const [filterProj, setFilterProj]   = useState('');
  const [showDone, setShowDone]       = useState(false);
  const [page, setPage] = useState(1);

  const [sortKey, setSortKey]       = useState('created_at');
  const [sortAsc, setSortAsc]       = useState(false);

  const [modalId, setModalId] = useState(undefined);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    const [stRes, tRes, unRes, lbRes, prRes] = await Promise.all([
      supabase.from('task_stages').select('*').order('urutan'),
      supabase.from('tasks').select(`
        id, judul, prioritas, deadline, stage_id, unit_id, selesai_pada, created_at, dibuat_oleh,
        task_stages(id,nama,warna,is_final),
        task_labels(id,nama,warna),
        task_projects(id,nama),
        task_assignees(guru_id, gurus(id,nama))
      `).order('created_at', { ascending: false }),
      supabase.from('units').select('id, nama').eq('aktif', true).order('nama'),
      supabase.from('task_labels').select('*').order('nama'),
      supabase.from('task_projects').select('id, nama').eq('status', 'aktif').order('nama'),
    ]);
    setStages(stRes.data || []);
    setTasks(tRes.data || []);
    setUnits(unRes.data || []);
    setLabels(lbRes.data || []);
    setProjects(prRes.data || []);
    setLoading(false);
  };

  const handleSort = (key) => {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(true); }
  };

  const SortArrow = ({ col }) => (
    <span style={{ marginLeft: '0.2rem', opacity: sortKey === col ? 1 : 0.3 }}>
      {sortKey === col ? (sortAsc ? '↑' : '↓') : '↕'}
    </span>
  );

  const filtered = useMemo(() => {
    let list = tasks.filter(t => {
      if (!showDone && t.selesai_pada) return false;
      if (filterUnit  && t.unit_id !== filterUnit) return false;
      if (filterStage && t.stage_id !== filterStage) return false;
      if (filterPrior && t.prioritas !== filterPrior) return false;
      if (filterLabel && t.task_labels?.id !== filterLabel) return false;
      if (filterProj  && t.task_projects?.id !== filterProj) return false;
      if (search) {
        const q = search.toLowerCase();
        return t.judul?.toLowerCase().includes(q) || t.task_projects?.nama?.toLowerCase().includes(q);
      }
      return true;
    });

    list.sort((a, b) => {
      let va = a[sortKey], vb = b[sortKey];
      if (sortKey === 'prioritas') {
        const order = { Tinggi: 0, Sedang: 1, Rendah: 2 };
        va = order[a.prioritas] ?? 9;
        vb = order[b.prioritas] ?? 9;
      }
      if (va == null) return 1;
      if (vb == null) return -1;
      return sortAsc ? (va < vb ? -1 : 1) : (va > vb ? -1 : 1);
    });

    return list;
  }, [tasks, search, filterUnit, filterStage, filterPrior, filterLabel, filterProj, showDone, sortKey, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage   = Math.min(page, totalPages);
  const paginated  = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  const sel = { padding: '0.42rem 0.65rem', borderRadius: '0.4rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontFamily: 'inherit', fontSize: '0.8rem' };
  const thStyle = (col) => ({
    padding: '0.65rem 0.75rem', fontWeight: 700, fontSize: '0.72rem',
    color: 'var(--text-secondary)', textAlign: 'left', whiteSpace: 'nowrap',
    cursor: 'pointer', letterSpacing: '0.05em', userSelect: 'none',
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tugas</p>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>Daftar Tugas</h1>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }} onClick={() => setModalId(null)}>
            <Plus size={15} /> Buat Task
          </button>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input style={{ ...sel, paddingLeft: '2rem', minWidth: 200 }} placeholder="Cari judul / project..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select style={sel} value={filterUnit} onChange={e => { setFilterUnit(e.target.value); setPage(1); }}>
          <option value="">Semua Unit</option>
          {units.map(u => <option key={u.id} value={u.id}>{u.nama}</option>)}
        </select>
        <select style={sel} value={filterStage} onChange={e => { setFilterStage(e.target.value); setPage(1); }}>
          <option value="">Semua Stage</option>
          {stages.map(s => <option key={s.id} value={s.id}>{s.nama}</option>)}
        </select>
        <select style={sel} value={filterPrior} onChange={e => { setFilterPrior(e.target.value); setPage(1); }}>
          <option value="">Semua Prioritas</option>
          <option value="Tinggi">Tinggi</option>
          <option value="Sedang">Sedang</option>
          <option value="Rendah">Rendah</option>
        </select>
        <select style={sel} value={filterLabel} onChange={e => { setFilterLabel(e.target.value); setPage(1); }}>
          <option value="">Semua Label</option>
          {labels.map(l => <option key={l.id} value={l.id}>{l.nama}</option>)}
        </select>
        <select style={sel} value={filterProj} onChange={e => { setFilterProj(e.target.value); setPage(1); }}>
          <option value="">Semua Project</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.nama}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} style={{ accentColor: 'var(--primary)' }} />
          Tampilkan Selesai
        </label>
        {(search || filterUnit || filterStage || filterPrior || filterLabel || filterProj) && (
          <button onClick={() => { setSearch(''); setFilterUnit(''); setFilterStage(''); setFilterPrior(''); setFilterLabel(''); setFilterProj(''); setPage(1); }}
            style={{ ...sel, cursor: 'pointer', color: 'var(--text-secondary)' }}>
            Reset
          </button>
        )}
      </div>

      <div className="glass-card" style={{ padding: '1rem', overflowX: 'auto' }}>
        {loading ? (
          <p style={{ color: 'var(--text-secondary)' }}>Memuat...</p>
        ) : filtered.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>Tidak ada task ditemukan.</p>
        ) : (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--glass-border)' }}>
                  <th style={thStyle('judul')} onClick={() => handleSort('judul')}>JUDUL <SortArrow col="judul" /></th>
                  <th style={thStyle()}>STAGE</th>
                  <th style={thStyle('prioritas')} onClick={() => handleSort('prioritas')}>PRIORITAS <SortArrow col="prioritas" /></th>
                  <th style={thStyle()}>LABEL</th>
                  <th style={thStyle()}>PROJECT</th>
                  <th style={thStyle()}>ASSIGNEE</th>
                  <th style={thStyle('deadline')} onClick={() => handleSort('deadline')}>DEADLINE <SortArrow col="deadline" /></th>
                  <th style={thStyle('created_at')} onClick={() => handleSort('created_at')}>DIBUAT <SortArrow col="created_at" /></th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(task => {
                  const isOD = !task.selesai_pada && task.deadline && new Date(task.deadline) < new Date();
                  return (
                    <tr key={task.id}
                      style={{ borderBottom: '1px solid var(--glass-border)', cursor: 'pointer' }}
                      onClick={() => setModalId(task.id)}
                      onMouseOver={e => e.currentTarget.style.background = 'rgba(79,70,229,0.03)'}
                      onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ padding: '0.75rem', maxWidth: 300 }}>
                        <div style={{ fontWeight: 600 }}>{task.judul}</div>
                        {task.selesai_pada && <span style={{ background: '#d1fae5', color: '#047857', borderRadius: 999, padding: '0 0.35rem', fontSize: '0.7rem', fontWeight: 700 }}>✓ Selesai</span>}
                        {isOD && <span style={{ color: '#b91c1c', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: 2 }}><AlertCircle size={10} /> Overdue</span>}
                      </td>
                      <td style={{ padding: '0.75rem', whiteSpace: 'nowrap' }}>
                        {task.task_stages && (
                          <span style={{ background: task.task_stages.warna + '22', color: task.task_stages.warna, padding: '0.15rem 0.55rem', borderRadius: 999, fontWeight: 600, fontSize: '0.78rem' }}>
                            {task.task_stages.nama}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem', fontWeight: 700, color: PRIORITAS_COLOR[task.prioritas], whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                        ● {task.prioritas}
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        {task.task_labels && (
                          <span style={{ background: task.task_labels.warna + '22', color: task.task_labels.warna, padding: '0.1rem 0.45rem', borderRadius: 999, fontSize: '0.75rem', fontWeight: 600 }}>
                            {task.task_labels.nama}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{task.task_projects?.nama || '-'}</td>
                      <td style={{ padding: '0.75rem' }}>
                        <div style={{ display: 'flex', gap: '0.2rem', flexWrap: 'wrap' }}>
                          {task.task_assignees?.slice(0, 2).map(a => (
                            <span key={a.guru_id} style={{ background: 'rgba(79,70,229,0.08)', color: 'var(--primary)', borderRadius: 999, padding: '0.1rem 0.35rem', fontSize: '0.72rem', fontWeight: 600 }}>
                              {a.gurus?.nama?.split(' ')[0]}
                            </span>
                          ))}
                          {(task.task_assignees?.length || 0) > 2 && <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>+{task.task_assignees.length - 2}</span>}
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem', whiteSpace: 'nowrap', fontSize: '0.8rem', color: isOD ? '#b91c1c' : 'inherit', fontWeight: isOD ? 700 : 400 }}>
                        {fmtDate(task.deadline)}
                      </td>
                      <td style={{ padding: '0.75rem', whiteSpace: 'nowrap', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        {fmtDate(task.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{filtered.length} task</span>
              {totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage <= 1}
                    style={{ background: 'var(--surface-color)', border: '1px solid var(--glass-border)', borderRadius: '0.4rem', padding: '0.3rem 0.6rem', cursor: safePage <= 1 ? 'not-allowed' : 'pointer', opacity: safePage <= 1 ? 0.4 : 1 }}>
                    <ChevronLeft size={14} />
                  </button>
                  <span style={{ fontSize: '0.82rem' }}>Hal {safePage} / {totalPages}</span>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}
                    style={{ background: 'var(--surface-color)', border: '1px solid var(--glass-border)', borderRadius: '0.4rem', padding: '0.3rem 0.6rem', cursor: safePage >= totalPages ? 'not-allowed' : 'pointer', opacity: safePage >= totalPages ? 0.4 : 1 }}>
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {modalId !== undefined && (
        <TaskDetailModal
          taskId={modalId}
          onClose={() => setModalId(undefined)}
          onSaved={() => { setModalId(undefined); loadAll(); }}
        />
      )}
    </div>
  );
}
