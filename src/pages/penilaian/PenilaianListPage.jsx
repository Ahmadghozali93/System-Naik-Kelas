import { useState, useEffect, useMemo } from 'react';
import { Search, Plus, X, ClipboardCheck, SlidersHorizontal } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/authStore';
import PenilaianDetailModal from './PenilaianDetailModal';

const BULAN_LABEL = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const BULAN_FULL  = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const THIS_YEAR   = new Date().getFullYear();
const PER_PAGE    = 25;

const STATUS_CFG = {
  Proses:  { color: '#d97706', bg: 'rgba(217,119,6,0.12)' },
  Revisi:  { color: '#b91c1c', bg: 'rgba(185,28,28,0.12)' },
  Approve: { color: '#047857', bg: 'rgba(4,120,87,0.12)' },
};
const StatusBadge = ({ s }) => {
  const c = STATUS_CFG[s] || STATUS_CFG.Proses;
  return <span style={{ background: c.bg, color: c.color, padding: '0.15rem 0.6rem', borderRadius: 999, fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{s}</span>;
};

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

export default function PenilaianListPage() {
  const { user } = useAuth();
  const isAdmin = ['Owner', 'Administrator', 'Supervisor'].includes(user?.role);

  const [rows, setRows]     = useState([]);
  const [units, setUnits]   = useState([]);
  const [gurus, setGurus]   = useState([]);
  const [labels, setLabels] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch]           = useState('');
  const [fStatus, setFStatus]         = useState('');
  const [fBulan, setFBulan]           = useState('');
  const [fTahun, setFTahun]           = useState('');
  const [fGuru, setFGuru]             = useState('');
  const [fLabel, setFLabel]           = useState('');
  const [fUnit, setFUnit]             = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage]               = useState(1);

  const [modalId, setModalId] = useState(undefined); // undefined=tutup, null=baru, id=edit

  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
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
        .select('id, judul, assignee_id, bulan, tahun, status, unit_id, label_id, created_at, gurus:assignee_id(id, nama), task_labels(id, nama, warna), units:unit_id(id, nama)')
        .order('tahun', { ascending: false }).order('bulan', { ascending: false }).order('created_at', { ascending: false }),
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

  const filtered = useMemo(() => rows.filter(r => {
    if (search && !r.judul?.toLowerCase().includes(search.toLowerCase())
       && !r.gurus?.nama?.toLowerCase().includes(search.toLowerCase())) return false;
    if (fStatus && r.status !== fStatus) return false;
    if (fBulan  && r.bulan !== Number(fBulan)) return false;
    if (fTahun  && r.tahun !== Number(fTahun)) return false;
    if (fGuru   && r.assignee_id !== fGuru) return false;
    if (fLabel  && r.label_id !== fLabel) return false;
    if (fUnit   && r.unit_id !== fUnit) return false;
    return true;
  }), [rows, search, fStatus, fBulan, fTahun, fGuru, fLabel, fUnit]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const curPage = Math.min(page, totalPages);
  const paged = filtered.slice((curPage - 1) * PER_PAGE, curPage * PER_PAGE);

  const activeFilterCount = [fStatus, fBulan, fTahun, fGuru, fLabel, fUnit].filter(Boolean).length;
  const resetFilters = () => { setFStatus(''); setFBulan(''); setFTahun(''); setFGuru(''); setFLabel(''); setFUnit(''); setPage(1); };

  const sel = { padding: '0.45rem 0.65rem', borderRadius: '0.4rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontFamily: 'inherit', fontSize: '0.8rem' };
  const tahunOpts = [...new Set([THIS_YEAR, THIS_YEAR - 1, ...rows.map(r => r.tahun)])].sort((a, b) => b - a);

  const closeModal = (reload) => { setModalId(undefined); if (reload) loadAll(); };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '0.9rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Penilaian</p>
          <h1 style={{ fontSize: isMobile ? '1.35rem' : '1.6rem', fontWeight: 700, margin: 0 }}>Penilaian Mengajar</h1>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setModalId(null)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.9rem', fontSize: '0.85rem' }}>
            <Plus size={15} /> Penilaian Baru
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: isMobile ? '100%' : 260 }}>
            <Search size={14} style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input style={{ ...sel, width: '100%', paddingLeft: '2rem', boxSizing: 'border-box' }}
              placeholder="Cari judul / nama guru..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <button onClick={() => setShowFilters(f => !f)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.45rem 0.75rem', borderRadius: '0.4rem', border: '1px solid var(--glass-border)', background: (showFilters || activeFilterCount) ? 'var(--primary)' : 'var(--surface-color)', color: (showFilters || activeFilterCount) ? '#fff' : 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500 }}>
            <SlidersHorizontal size={14} />{!isMobile && 'Filter'}
            {activeFilterCount > 0 && <span style={{ background: 'rgba(255,255,255,0.3)', borderRadius: 999, padding: '0 0.35rem', fontSize: '0.72rem', fontWeight: 700 }}>{activeFilterCount}</span>}
          </button>
        </div>

        {showFilters && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginTop: '0.5rem', padding: '0.75rem', background: 'var(--surface-color)', border: '1px solid var(--glass-border)', borderRadius: '0.5rem' }}>
            <select style={sel} value={fStatus} onChange={e => { setFStatus(e.target.value); setPage(1); }}>
              <option value="">Semua Status</option>
              {['Proses', 'Revisi', 'Approve'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select style={sel} value={fBulan} onChange={e => { setFBulan(e.target.value); setPage(1); }}>
              <option value="">Semua Bulan</option>
              {BULAN_FULL.slice(1).map((b, i) => <option key={i + 1} value={i + 1}>{b}</option>)}
            </select>
            <select style={sel} value={fTahun} onChange={e => { setFTahun(e.target.value); setPage(1); }}>
              <option value="">Semua Tahun</option>
              {tahunOpts.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select style={sel} value={fGuru} onChange={e => { setFGuru(e.target.value); setPage(1); }}>
              <option value="">Semua Guru</option>
              {gurus.map(g => <option key={g.id} value={g.id}>{g.nama}</option>)}
            </select>
            <select style={sel} value={fLabel} onChange={e => { setFLabel(e.target.value); setPage(1); }}>
              <option value="">Semua Tag</option>
              {labels.map(l => <option key={l.id} value={l.id}>{l.nama}</option>)}
            </select>
            <select style={sel} value={fUnit} onChange={e => { setFUnit(e.target.value); setPage(1); }}>
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

      {/* Konten */}
      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Memuat...</p>
      ) : filtered.length === 0 ? (
        <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <ClipboardCheck size={40} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
          <p>Belum ada penilaian{activeFilterCount || search ? ' yang cocok dengan filter' : ''}.</p>
        </div>
      ) : isMobile ? (
        /* Kartu (mobile) */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          {paged.map(r => (
            <div key={r.id} className="glass-card" onClick={() => setModalId(r.id)}
              style={{ padding: '1rem', cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.4rem' }}>
                <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{r.judul}</div>
                <StatusBadge s={r.status} />
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--primary)', fontWeight: 600 }}>{r.gurus?.nama || '-'}</div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.35rem', alignItems: 'center' }}>
                <span>{BULAN_LABEL[r.bulan]} {r.tahun}</span>
                <span>· {r.units?.nama || '-'}</span>
                {r.task_labels && <span style={{ background: r.task_labels.warna + '22', color: r.task_labels.warna, padding: '0 0.4rem', borderRadius: 999, fontWeight: 600 }}>{r.task_labels.nama}</span>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Tabel (desktop) */
        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--glass-border)', background: 'rgba(79,70,229,0.04)' }}>
                  {['Judul', 'Guru', 'Periode', 'Cabang', 'Tag', 'Status', 'Dibuat'].map(h => (
                    <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontWeight: 700, fontSize: '0.72rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--glass-border)', cursor: 'pointer' }}
                    onClick={() => setModalId(r.id)}
                    onMouseOver={e => e.currentTarget.style.background = 'rgba(79,70,229,0.03)'}
                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '0.7rem 0.75rem', fontWeight: 600 }}>{r.judul}</td>
                    <td style={{ padding: '0.7rem 0.75rem', color: 'var(--primary)' }}>{r.gurus?.nama || '-'}</td>
                    <td style={{ padding: '0.7rem 0.75rem', whiteSpace: 'nowrap' }}>{BULAN_LABEL[r.bulan]} {r.tahun}</td>
                    <td style={{ padding: '0.7rem 0.75rem', color: 'var(--text-secondary)' }}>{r.units?.nama || '-'}</td>
                    <td style={{ padding: '0.7rem 0.75rem' }}>
                      {r.task_labels
                        ? <span style={{ background: r.task_labels.warna + '22', color: r.task_labels.warna, padding: '0.1rem 0.5rem', borderRadius: 999, fontSize: '0.75rem', fontWeight: 600 }}>{r.task_labels.nama}</span>
                        : <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                    </td>
                    <td style={{ padding: '0.7rem 0.75rem' }}><StatusBadge s={r.status} /></td>
                    <td style={{ padding: '0.7rem 0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{fmtDate(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Menampilkan {(curPage - 1) * PER_PAGE + 1}–{Math.min(curPage * PER_PAGE, filtered.length)} dari {filtered.length}
          </span>
          <div style={{ display: 'flex', gap: '0.35rem' }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={curPage <= 1}
              style={{ padding: '0.3rem 0.7rem', borderRadius: '0.4rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', cursor: curPage <= 1 ? 'not-allowed' : 'pointer', opacity: curPage <= 1 ? 0.4 : 1 }}>‹</button>
            <span style={{ padding: '0.3rem 0.7rem', fontSize: '0.82rem' }}>{curPage} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={curPage >= totalPages}
              style={{ padding: '0.3rem 0.7rem', borderRadius: '0.4rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', cursor: curPage >= totalPages ? 'not-allowed' : 'pointer', opacity: curPage >= totalPages ? 0.4 : 1 }}>›</button>
          </div>
        </div>
      )}

      {/* Modal */}
      {modalId !== undefined && (
        <PenilaianDetailModal
          assessmentId={modalId}
          onClose={() => closeModal(false)}
          onSaved={() => loadAll()}
        />
      )}
    </div>
  );
}
