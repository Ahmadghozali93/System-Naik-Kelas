import { useState, useEffect, useMemo } from 'react';
import { Download, TrendingUp, Award, Star } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/authStore';

const BULAN_FULL  = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const BULAN_LABEL = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const THIS_YEAR   = new Date().getFullYear();
const THIS_MONTH  = new Date().getMonth() + 1;

const fmtRupiah = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n || 0);

const STATUS_COLOR = { Draft: '#6b7280', Submitted: '#d97706', Approved: '#059669' };
const STATUS_BG    = { Draft: 'rgba(107,114,128,0.1)', Submitted: 'rgba(217,119,6,0.1)', Approved: 'rgba(5,150,105,0.1)' };

const inp = {
  padding: '0.45rem 0.65rem', borderRadius: '0.5rem',
  border: '1px solid var(--glass-border)', background: 'var(--surface-color)',
  fontFamily: 'inherit', fontSize: '0.88rem', boxSizing: 'border-box',
};

function scoreColor(skor) {
  if (skor == null) return '#6b7280';
  if (skor >= 90) return '#059669';
  if (skor >= 75) return '#d97706';
  return '#b91c1c';
}
function scoreBg(skor) {
  if (skor == null) return 'rgba(107,114,128,0.08)';
  if (skor >= 90) return 'rgba(5,150,105,0.1)';
  if (skor >= 75) return 'rgba(217,119,6,0.1)';
  return 'rgba(185,28,28,0.1)';
}
function scoreLabel(skor) {
  if (skor == null) return '—';
  if (skor >= 90) return 'Sangat Baik';
  if (skor >= 75) return 'Baik';
  if (skor >= 60) return 'Cukup';
  return 'Perlu Peningkatan';
}

export default function KpiDashboardPage() {
  const { user } = useAuth();
  const isAdmin = ['Owner', 'Administrator', 'Supervisor'].includes(user?.role);

  const [assessments, setAssessments] = useState([]);
  const [units, setUnits]             = useState([]);
  const [loading, setLoading]         = useState(false);

  const [filterTahun, setFilterTahun]   = useState(THIS_YEAR);
  const [filterBulan, setFilterBulan]   = useState(THIS_MONTH);
  const [filterUnit,  setFilterUnit]    = useState('');
  const [filterStatus, setFilterStatus] = useState('Approved');

  useEffect(() => {
    supabase.from('units').select('*').eq('aktif', true).order('nama').then(r => setUnits(r.data || []));
  }, []);

  const fetchData = async () => {
    setLoading(true);
    let q = supabase.from('kpi_assessments')
      .select('*, gurus!guru_id(nama, role), units!unit_id(nama)')
      .eq('periode_tahun', filterTahun)
      .eq('periode_bulan', filterBulan)
      .order('skor_akhir', { ascending: false, nullsLast: true });
    if (filterUnit)   q = q.eq('unit_id', filterUnit);
    if (filterStatus) q = q.eq('status', filterStatus);
    if (!isAdmin)     q = q.eq('guru_id', user?.id);
    const { data } = await q;
    setAssessments(data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (user) fetchData();
  }, [filterTahun, filterBulan, filterUnit, filterStatus, user, isAdmin]);

  // ── SUMMARY ──────────────────────────────────────────────────
  const summary = useMemo(() => {
    const approved = assessments.filter(a => a.status === 'Approved' && a.skor_akhir != null);
    const totalSkor = approved.reduce((s, a) => s + parseFloat(a.skor_akhir), 0);
    const eligible  = approved.filter(a => a.bonus_eligible);
    const totalBonus = eligible.reduce((s, a) => s + (a.bonus_nominal || 0), 0);
    return {
      total:     assessments.length,
      approved:  approved.length,
      rataSkor:  approved.length > 0 ? (totalSkor / approved.length).toFixed(1) : null,
      eligible:  eligible.length,
      totalBonus,
    };
  }, [assessments]);

  // ── EXPORT CSV ───────────────────────────────────────────────
  const exportCSV = () => {
    const header = ['Rank', 'Nama', 'Role', 'Unit', 'Periode', 'Skor', 'Status', 'Bonus Eligible', 'Nominal Bonus'];
    const rows = assessments.map((a, i) => [
      i + 1,
      a.gurus?.nama || '-',
      a.gurus?.role || '-',
      a.units?.nama || '-',
      `${BULAN_LABEL[a.periode_bulan]} ${a.periode_tahun}`,
      a.skor_akhir != null ? parseFloat(a.skor_akhir).toFixed(2) : '-',
      a.status,
      a.bonus_eligible ? 'Ya' : 'Tidak',
      a.bonus_nominal || 0,
    ]);
    const csv = [header, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `kpi_${filterBulan}_${filterTahun}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '1.25rem' }}>
        <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>KPI</p>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>Dashboard KPI</h1>
      </div>

      {/* Filter */}
      <div className="glass-card" style={{ padding: '1rem 1.25rem', marginBottom: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.65rem', alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.2rem' }}>Tahun</label>
          <select value={filterTahun} onChange={e => setFilterTahun(Number(e.target.value))} style={{ ...inp, width: 100 }}>
            {[THIS_YEAR - 1, THIS_YEAR, THIS_YEAR + 1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.2rem' }}>Bulan</label>
          <select value={filterBulan} onChange={e => setFilterBulan(Number(e.target.value))} style={{ ...inp, width: 130 }}>
            {BULAN_FULL.slice(1).map((b, i) => <option key={i + 1} value={i + 1}>{b}</option>)}
          </select>
        </div>
        {isAdmin && (
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.2rem' }}>Unit</label>
            <select value={filterUnit} onChange={e => setFilterUnit(e.target.value)} style={{ ...inp, width: 'auto' }}>
              <option value="">Semua Unit</option>
              {units.map(u => <option key={u.id} value={u.id}>{u.nama}</option>)}
            </select>
          </div>
        )}
        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.2rem' }}>Status</label>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...inp, width: 'auto' }}>
            <option value="">Semua</option>
            <option value="Draft">Draft</option>
            <option value="Submitted">Submitted</option>
            <option value="Approved">Approved</option>
          </select>
        </div>
        <button className="btn" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginLeft: 'auto' }} onClick={exportCSV}>
          <Download size={15} /> Export CSV
        </button>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
        {[
          { label: 'Total Penilaian', value: summary.total, sub: 'periode ini', color: 'var(--primary)', bg: 'rgba(79,70,229,0.06)', icon: <TrendingUp size={18} /> },
          { label: 'Rata-rata Skor', value: summary.rataSkor ?? '—', sub: summary.approved + ' approved', color: scoreColor(summary.rataSkor), bg: scoreBg(summary.rataSkor), icon: <Star size={18} /> },
          { label: 'Eligible Bonus', value: summary.eligible, sub: 'dari ' + summary.approved + ' approved', color: '#059669', bg: 'rgba(5,150,105,0.06)', icon: <Award size={18} /> },
          { label: 'Total Bonus', value: fmtRupiah(summary.totalBonus), sub: 'semua karyawan', color: '#7c3aed', bg: 'rgba(124,58,237,0.06)', icon: <Award size={18} /> },
        ].map(card => (
          <div key={card.label} className="glass-card" style={{ padding: '1rem 1.25rem', background: card.bg }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{card.label}</div>
              <div style={{ color: card.color, opacity: 0.7 }}>{card.icon}</div>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: card.color, lineHeight: 1.1 }}>{card.value}</div>
            <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Ranking table */}
      <div className="glass-card" style={{ padding: '1.25rem', overflowX: 'auto' }}>
        <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <TrendingUp size={16} /> Ranking Karyawan — {BULAN_FULL[filterBulan]} {filterTahun}
        </div>

        {loading ? (
          <p style={{ color: 'var(--text-secondary)' }}>Memuat...</p>
        ) : assessments.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            <Star size={40} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
            <p>Belum ada data penilaian untuk periode ini.</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--glass-border)' }}>
                {['#', 'Karyawan', 'Role', 'Unit', 'Skor', 'Predikat', 'Bonus', 'Status'].map(h => (
                  <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {assessments.map((a, i) => {
                const skor = a.skor_akhir != null ? parseFloat(a.skor_akhir) : null;
                return (
                  <tr key={a.id} style={{ borderBottom: '1px solid var(--glass-border)' }}
                    onMouseOver={e => e.currentTarget.style.background = 'rgba(79,70,229,0.03)'}
                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '0.7rem 0.75rem', fontWeight: 700, color: i === 0 ? '#d97706' : i === 1 ? '#6b7280' : i === 2 ? '#92400e' : 'var(--text-secondary)', fontSize: i < 3 ? '1rem' : '0.85rem' }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                    </td>
                    <td style={{ padding: '0.7rem 0.75rem', fontWeight: 600 }}>{a.gurus?.nama || '-'}</td>
                    <td style={{ padding: '0.7rem 0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{a.gurus?.role || '-'}</td>
                    <td style={{ padding: '0.7rem 0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{a.units?.nama || '-'}</td>
                    <td style={{ padding: '0.7rem 0.75rem' }}>
                      <span style={{ fontWeight: 800, fontSize: '1rem', color: scoreColor(skor) }}>
                        {skor != null ? skor.toFixed(1) : '—'}
                      </span>
                    </td>
                    <td style={{ padding: '0.7rem 0.75rem' }}>
                      <span style={{ background: scoreBg(skor), color: scoreColor(skor), padding: '0.15rem 0.55rem', borderRadius: 999, fontSize: '0.75rem', fontWeight: 700 }}>
                        {scoreLabel(skor)}
                      </span>
                    </td>
                    <td style={{ padding: '0.7rem 0.75rem' }}>
                      {a.bonus_eligible ? (
                        <div>
                          <span style={{ background: 'rgba(5,150,105,0.1)', color: '#059669', padding: '0.1rem 0.4rem', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700 }}>Eligible</span>
                          {a.bonus_nominal > 0 && <div style={{ fontSize: '0.78rem', color: '#059669', fontWeight: 600, marginTop: '0.2rem' }}>{fmtRupiah(a.bonus_nominal)}</div>}
                        </div>
                      ) : <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>—</span>}
                    </td>
                    <td style={{ padding: '0.7rem 0.75rem' }}>
                      <span style={{ background: STATUS_BG[a.status], color: STATUS_COLOR[a.status], padding: '0.15rem 0.55rem', borderRadius: 999, fontSize: '0.75rem', fontWeight: 700 }}>
                        {a.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
