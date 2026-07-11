import { useState, useEffect, useRef } from 'react';
import { Plus, Search, SlidersHorizontal, X, Lock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/authStore';
import PenilaianDetailModal from './PenilaianDetailModal';
import { syncKualitasMengajar } from '../../utils/syncKualitasMengajar';

const BULAN_LABEL = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const BULAN_FULL  = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const THIS_YEAR   = new Date().getFullYear();

// Kolom status tetap
const STATUS_COLS = [
  { id: 'Proses',  warna: '#d97706' },
  { id: 'Revisi',  warna: '#b91c1c' },
  { id: 'Approve', warna: '#047857' },
];

export default function PenilaianKanbanPage() {
  const { user } = useAuth();
  const isAdmin = ['Owner', 'Administrator', 'Supervisor'].includes(user?.role);

  const [rows, setRows]     = useState([]);
  const [units, setUnits]   = useState([]);
  const [gurus, setGurus]   = useState([]);
  const [labels, setLabels] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [fBulan, setFBulan] = useState('');
  const [fTahun, setFTahun] = useState('');
  const [fGuru, setFGuru]   = useState('');
  const [fLabel, setFLabel] = useState('');
  const [fUnit, setFUnit]   = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const [modalId, setModalId]   = useState(undefined);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  const dragRowId   = useRef(null);
  const dragOverCol = useRef(null);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    const [rRes, uRes, gRes, lRes] = await Promise.all([
      supabase.from('teaching_assessments')
        .select('id, judul, assignee_id, bulan, tahun, status, unit_id, label_id, gurus:assignee_id(id, nama), task_labels(id, nama, warna), units:unit_id(id, nama)')
        .order('tahun', { ascending: false }).order('bulan', { ascending: false }),
      supabase.from('units').select('id, nama').eq('aktif', true).order('nama'),
      supabase.from('gurus').select('id, nama').eq('status', 'Aktif').order('nama'),
      supabase.from('task_labels').select('*').order('nama'),
    ]);
    setRows(rRes.data || []);
    setUnits(uRes.data || []);
    setGurus(gRes.data || []);
    setLabels(lRes.data || []);
    setLoading(false);
  };

  // ── Drag & Drop (admin, non-mobile) ──
  const onDragStart = (e, id) => { dragRowId.current = id; e.dataTransfer.effectAllowed = 'move'; };
  const onDragOver  = (e, colId) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; dragOverCol.current = colId; };

  const onDrop = async (e, newStatus) => {
    e.preventDefault();
    const id = dragRowId.current;
    if (!id || dragOverCol.current !== newStatus) return;
    const row = rows.find(r => r.id === id);
    if (!row || row.status === newStatus) return;

    const payload = { status: newStatus, updated_at: new Date().toISOString() };
    if (newStatus === 'Approve') { payload.approved_by = user?.id; payload.approved_at = new Date().toISOString(); }
    else { payload.approved_by = null; payload.approved_at = null; }

    // Optimistic
    setRows(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r));
    const { error } = await supabase.from('teaching_assessments').update(payload).eq('id', id);
    if (error) { alert('Gagal pindah status: ' + error.message); loadAll(); }
    // Sambung ke KPI saat pindah ke Approve
    else if (newStatus === 'Approve') {
      await syncKualitasMengajar({ guruId: row.assignee_id, bulan: row.bulan, tahun: row.tahun });
    }
    dragRowId.current = null;
    dragOverCol.current = null;
  };

  // ── Filter ──
  const visible = rows.filter(r => {
    if (search && !r.judul?.toLowerCase().includes(search.toLowerCase())
       && !r.gurus?.nama?.toLowerCase().includes(search.toLowerCase())) return false;
    if (fBulan && r.bulan !== Number(fBulan)) return false;
    if (fTahun && r.tahun !== Number(fTahun)) return false;
    if (fGuru  && r.assignee_id !== fGuru) return false;
    if (fLabel && r.label_id !== fLabel) return false;
    if (fUnit  && r.unit_id !== fUnit) return false;
    return true;
  });
  const byStatus = (s) => visible.filter(r => r.status === s);

  const sel = { padding: '0.4rem 0.65rem', borderRadius: '0.4rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontFamily: 'inherit', fontSize: '0.8rem' };
  const activeFilterCount = [fBulan, fTahun, fGuru, fLabel, fUnit].filter(Boolean).length;
  const resetFilters = () => { setFBulan(''); setFTahun(''); setFGuru(''); setFLabel(''); setFUnit(''); };
  const tahunOpts = [...new Set([THIS_YEAR, THIS_YEAR - 1, ...rows.map(r => r.tahun)])].sort((a, b) => b - a);
  const colWidth = isMobile ? Math.min(window.innerWidth * 0.82, 320) : 300;

  const closeModal = () => { setModalId(undefined); loadAll(); };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Header */}
      <div style={{ marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Penilaian</p>
          <h1 style={{ fontSize: isMobile ? '1.3rem' : '1.6rem', fontWeight: 700, margin: 0 }}>Papan Penilaian</h1>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setModalId(null)}
            style={{ padding: '0.4rem 0.85rem', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Plus size={14} /> Penilaian Baru
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div style={{ marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: isMobile ? '100%' : 240 }}>
            <Search size={14} style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input style={{ ...sel, width: '100%', paddingLeft: '2rem', boxSizing: 'border-box' }}
              placeholder="Cari judul / guru..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button onClick={() => setShowFilters(f => !f)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.75rem', borderRadius: '0.4rem', border: '1px solid var(--glass-border)', background: (showFilters || activeFilterCount) ? 'var(--primary)' : 'var(--surface-color)', color: (showFilters || activeFilterCount) ? '#fff' : 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500 }}>
            <SlidersHorizontal size={14} />{!isMobile && 'Filter'}
            {activeFilterCount > 0 && <span style={{ background: 'rgba(255,255,255,0.3)', borderRadius: 999, padding: '0 0.35rem', fontSize: '0.72rem', fontWeight: 700 }}>{activeFilterCount}</span>}
          </button>
        </div>

        {showFilters && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginTop: '0.5rem', padding: '0.75rem', background: 'var(--surface-color)', border: '1px solid var(--glass-border)', borderRadius: '0.5rem' }}>
            <select style={sel} value={fBulan} onChange={e => setFBulan(e.target.value)}>
              <option value="">Semua Bulan</option>
              {BULAN_FULL.slice(1).map((b, i) => <option key={i + 1} value={i + 1}>{b}</option>)}
            </select>
            <select style={sel} value={fTahun} onChange={e => setFTahun(e.target.value)}>
              <option value="">Semua Tahun</option>
              {tahunOpts.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select style={sel} value={fGuru} onChange={e => setFGuru(e.target.value)}>
              <option value="">Semua Guru</option>
              {gurus.map(g => <option key={g.id} value={g.id}>{g.nama}</option>)}
            </select>
            <select style={sel} value={fLabel} onChange={e => setFLabel(e.target.value)}>
              <option value="">Semua Tag</option>
              {labels.map(l => <option key={l.id} value={l.id}>{l.nama}</option>)}
            </select>
            <select style={sel} value={fUnit} onChange={e => setFUnit(e.target.value)}>
              <option value="">Semua Cabang</option>
              {units.map(u => <option key={u.id} value={u.id}>{u.nama}</option>)}
            </select>
            {activeFilterCount > 0 && (
              <button onClick={resetFilters} style={{ ...sel, border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', background: '#fee2e2' }}>
                <X size={12} /> Reset
              </button>
            )}
          </div>
        )}
      </div>

      {/* Papan */}
      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Memuat...</p>
      ) : (
        <div style={{
          display: 'flex', gap: '0.75rem', overflowX: 'auto', flex: 1, minHeight: 0,
          paddingBottom: '1rem', alignItems: 'flex-start',
          scrollSnapType: isMobile ? 'x mandatory' : 'none', WebkitOverflowScrolling: 'touch',
        }}>
          {STATUS_COLS.map(col => {
            const items = byStatus(col.id);
            return (
              <div key={col.id}
                onDragOver={e => onDragOver(e, col.id)}
                onDrop={e => onDrop(e, col.id)}
                style={{
                  width: colWidth, minWidth: colWidth, flexShrink: 0,
                  background: 'var(--surface-color)', border: '1px solid var(--glass-border)',
                  borderRadius: '0.75rem', display: 'flex', flexDirection: 'column',
                  maxHeight: isMobile ? 'calc(100vh - 260px)' : 'calc(100vh - 220px)',
                  scrollSnapAlign: isMobile ? 'start' : 'none',
                }}>
                {/* Header kolom */}
                <div style={{ padding: '0.75rem 1rem', borderBottom: '2px solid ' + col.warna, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: col.warna, display: 'inline-block' }} />
                    <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>{col.id}</span>
                    <span style={{ background: 'var(--glass-border)', color: 'var(--text-secondary)', borderRadius: 999, padding: '0 0.4rem', fontSize: '0.72rem' }}>{items.length}</span>
                  </div>
                  {col.id === 'Approve' && <Lock size={13} style={{ color: col.warna, opacity: 0.6 }} />}
                </div>

                {/* Kartu */}
                <div style={{ padding: '0.5rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {items.map(r => (
                    <div key={r.id}
                      draggable={isAdmin && !isMobile}
                      onDragStart={(isAdmin && !isMobile) ? (e => onDragStart(e, r.id)) : undefined}
                      onClick={() => setModalId(r.id)}
                      style={{
                        background: 'var(--bg-color, #fff)', border: '1px solid var(--glass-border)',
                        borderRadius: '0.5rem', padding: '0.7rem 0.75rem', cursor: 'pointer',
                        transition: 'box-shadow 0.15s', userSelect: 'none',
                      }}
                      onMouseOver={e => !isMobile && (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)')}
                      onMouseOut={e => e.currentTarget.style.boxShadow = 'none'}>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.3rem', lineHeight: 1.4 }}>{r.judul}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 600, marginBottom: '0.3rem' }}>{r.gurus?.nama || '-'}</div>
                      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                        <span>{BULAN_LABEL[r.bulan]} {r.tahun}</span>
                        <span>· {r.units?.nama || '-'}</span>
                        {r.task_labels && (
                          <span style={{ background: r.task_labels.warna + '22', color: r.task_labels.warna, padding: '0 0.35rem', borderRadius: 999, fontWeight: 600 }}>{r.task_labels.nama}</span>
                        )}
                      </div>
                    </div>
                  ))}
                  {items.length === 0 && (
                    <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem', padding: '1.5rem 0', opacity: 0.4 }}>Kosong</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {modalId !== undefined && (
        <PenilaianDetailModal
          assessmentId={modalId}
          onClose={closeModal}
          onSaved={() => loadAll()}
        />
      )}
    </div>
  );
}
