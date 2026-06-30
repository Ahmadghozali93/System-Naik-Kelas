import { useState, useEffect, useMemo } from 'react';
import { Plus, X, CheckCircle, Send, Edit2, Trash2, Award } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/authStore';

const BULAN_LABEL = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const BULAN_FULL  = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const THIS_YEAR   = new Date().getFullYear();
const THIS_MONTH  = new Date().getMonth() + 1;

const STATUS_COLOR = { Draft: '#6b7280', Submitted: '#d97706', Approved: '#059669' };
const STATUS_BG    = { Draft: 'rgba(107,114,128,0.1)', Submitted: 'rgba(217,119,6,0.1)', Approved: 'rgba(5,150,105,0.1)' };

const fmtRupiah = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n || 0);

const inp = {
  padding: '0.55rem 0.75rem', borderRadius: '0.5rem',
  border: '1px solid var(--glass-border)', background: 'var(--surface-color)',
  fontFamily: 'inherit', fontSize: '0.88rem', width: '100%', boxSizing: 'border-box',
};

// Cari target yang paling relevan untuk indikator + periode
function findTarget(allTargets, indicatorId, tahun, bulan) {
  const forMonth = allTargets.find(t =>
    t.kpi_indicator_id === indicatorId && t.periode_tahun === tahun && t.periode_bulan === bulan,
  );
  if (forMonth) return forMonth;
  const forYear = allTargets.find(t =>
    t.kpi_indicator_id === indicatorId && t.periode_tahun === tahun && t.periode_bulan === null,
  );
  if (forYear) return forYear;
  // Fallback: target terbaru untuk indikator ini
  return allTargets
    .filter(t => t.kpi_indicator_id === indicatorId)
    .sort((a, b) => b.periode_tahun - a.periode_tahun)[0] || null;
}

function calcSkor(nilai_aktual, target) {
  if (nilai_aktual === null || nilai_aktual === '' || !target) return 0;
  const raw = (parseFloat(nilai_aktual) / parseFloat(target.target_nilai)) * parseFloat(target.bobot);
  return Math.min(parseFloat(raw.toFixed(2)), parseFloat(target.bobot));
}

// Hitung nilai otomatis dari data absensi
async function calcAutoValues(guruId, tahun, bulan) {
  const mulai = `${tahun}-${String(bulan).padStart(2, '0')}-01`;
  const lastDay = new Date(tahun, bulan, 0).getDate();
  const akhir = `${tahun}-${String(bulan).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const [attRes, otRes] = await Promise.all([
    supabase.from('attendances').select('status')
      .eq('guru_id', guruId).gte('tanggal', mulai).lte('tanggal', akhir),
    supabase.from('overtime').select('durasi_menit')
      .eq('guru_id', guruId).eq('status', 'Approved').gte('tanggal', mulai).lte('tanggal', akhir),
  ]);

  const atts = attRes.data || [];
  const ots  = otRes.data || [];
  const hadir = atts.filter(a => a.status === 'Hadir').length;
  const telat = atts.filter(a => a.status === 'Telat').length;
  const total = atts.length;
  const lemburMenit = ots.reduce((s, o) => s + (o.durasi_menit || 0), 0);

  return {
    kehadiran:       total > 0             ? parseFloat(((hadir + telat) / total * 100).toFixed(2)) : 0,
    ketepatan_waktu: (hadir + telat) > 0   ? parseFloat((hadir / (hadir + telat) * 100).toFixed(2)) : 0,
    lembur:          parseFloat((lemburMenit / 60).toFixed(2)),
  };
}

export default function KpiAssessmentPage() {
  const { user } = useAuth();
  const isAdmin = ['Owner', 'Administrator', 'Supervisor'].includes(user?.role);

  // Master data
  const [gurus, setGurus]       = useState([]);
  const [units, setUnits]       = useState([]);
  const [indicators, setIndicators] = useState([]);
  const [allTargets, setAllTargets] = useState([]);

  // Filter
  const [filterTahun,  setFilterTahun]  = useState(THIS_YEAR);
  const [filterBulan,  setFilterBulan]  = useState(THIS_MONTH);
  const [filterUnit,   setFilterUnit]   = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // List penilaian
  const [assessments, setAssessments] = useState([]);
  const [loading, setLoading]         = useState(false);

  // Modal buat penilaian baru
  const [modalCreate, setModalCreate] = useState(false);
  const [creating, setCreating]       = useState(false);
  const [formCreate, setFormCreate]   = useState({
    guru_id: '', unit_id: '', periode_tahun: THIS_YEAR, periode_bulan: THIS_MONTH,
  });

  // Modal edit penilaian (isi skor)
  const [editAssessment, setEditAssessment] = useState(null);
  const [localScores, setLocalScores]       = useState([]);
  const [loadingScores, setLoadingScores]   = useState(false);
  const [saving, setSaving]                 = useState(false);

  // Approval (bonus)
  const [formApprove, setFormApprove] = useState({ bonus_eligible: false, bonus_nominal: 0, catatan: '' });

  // ── MASTER DATA ──────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      supabase.from('gurus').select('id,nama,role').eq('status', 'Aktif').order('nama'),
      supabase.from('units').select('*').eq('aktif', true).order('nama'),
      supabase.from('kpi_indicators').select('*').eq('aktif', true).order('nama'),
      supabase.from('kpi_targets').select('*').order('periode_tahun').order('periode_bulan'),
    ]).then(([g, u, ind, t]) => {
      setGurus(g.data || []);
      setUnits(u.data || []);
      setIndicators(ind.data || []);
      setAllTargets(t.data || []);
    });
  }, []);

  // ── FETCH ASSESSMENTS ─────────────────────────────────────────
  const fetchAssessments = async () => {
    setLoading(true);
    let q = supabase.from('kpi_assessments')
      .select('*, gurus!guru_id(nama, role), units!unit_id(nama)')
      .eq('periode_tahun', filterTahun)
      .eq('periode_bulan', filterBulan)
      .order('created_at', { ascending: false });
    if (filterUnit)   q = q.eq('unit_id', filterUnit);
    if (filterStatus) q = q.eq('status', filterStatus);
    if (!isAdmin)     q = q.eq('guru_id', user?.id);
    const { data } = await q;
    setAssessments(data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (user) fetchAssessments();
  }, [filterTahun, filterBulan, filterUnit, filterStatus, user, isAdmin]);

  // ── BUAT PENILAIAN BARU ───────────────────────────────────────
  const handleCreate = async (e) => {
    e.preventDefault();
    if (!formCreate.guru_id) return alert('Pilih karyawan terlebih dahulu.');
    setCreating(true);

    const guru = gurus.find(g => g.id === formCreate.guru_id);
    const tahun = Number(formCreate.periode_tahun);
    const bulan = Number(formCreate.periode_bulan);

    // Ambil indikator yang berlaku untuk role karyawan ini
    const relevantInds = indicators.filter(ind =>
      ind.role_target.length === 0 || ind.role_target.includes(guru.role),
    );

    // Hitung nilai otomatis
    const autoValues = await calcAutoValues(formCreate.guru_id, tahun, bulan);

    // Buat assessment header
    const { data: newAssessment, error: errAss } = await supabase
      .from('kpi_assessments')
      .insert({
        guru_id:       formCreate.guru_id,
        unit_id:       formCreate.unit_id || guru.unit_id || units[0]?.id,
        periode_tahun: tahun,
        periode_bulan: bulan,
        dinilai_oleh:  user.id,
      })
      .select()
      .single();

    if (errAss) {
      setCreating(false);
      if (errAss.code === '23505') return alert('Penilaian untuk karyawan ini di periode tersebut sudah ada.');
      return alert('Gagal: ' + errAss.message);
    }

    // Buat score rows
    if (relevantInds.length > 0) {
      const scoreRows = relevantInds.map(ind => {
        const target = findTarget(allTargets, ind.id, tahun, bulan);
        const nilai_aktual = ind.tipe === 'Otomatis' && ind.source_field
          ? (autoValues[ind.source_field] ?? null)
          : null;
        return {
          kpi_assessment_id: newAssessment.id,
          kpi_indicator_id:  ind.id,
          kpi_target_id:     target?.id || null,
          nilai_aktual,
          nilai_skor:        calcSkor(nilai_aktual, target),
          tipe:              ind.tipe,
        };
      });
      await supabase.from('kpi_scores').insert(scoreRows);
    }

    setCreating(false);
    setModalCreate(false);
    fetchAssessments();
  };

  // ── BUKA EDIT SKOR ────────────────────────────────────────────
  const openEdit = async (assessment) => {
    setEditAssessment(assessment);
    setLoadingScores(true);
    setFormApprove({
      bonus_eligible: assessment.bonus_eligible,
      bonus_nominal:  assessment.bonus_nominal,
      catatan:        assessment.catatan || '',
    });
    const { data } = await supabase.from('kpi_scores')
      .select('*, kpi_indicators(*), kpi_targets(*)')
      .eq('kpi_assessment_id', assessment.id)
      .order('created_at');
    setLocalScores((data || []).map(s => ({ ...s, nilai_aktual: s.nilai_aktual ?? '' })));
    setLoadingScores(false);
  };

  // Update nilai_aktual dan recalc nilai_skor secara lokal
  const handleScoreChange = (scoreId, nilai_aktual) => {
    setLocalScores(prev => prev.map(s => {
      if (s.id !== scoreId) return s;
      return { ...s, nilai_aktual, nilai_skor: calcSkor(nilai_aktual, s.kpi_targets) };
    }));
  };
  const handleCatatanChange = (scoreId, catatan) => {
    setLocalScores(prev => prev.map(s => s.id === scoreId ? { ...s, catatan } : s));
  };

  const totalSkor = useMemo(
    () => parseFloat(localScores.reduce((s, r) => s + (parseFloat(r.nilai_skor) || 0), 0).toFixed(2)),
    [localScores],
  );

  // Simpan skor (draft mode)
  const saveScores = async () => {
    setSaving(true);
    for (const s of localScores) {
      await supabase.from('kpi_scores').update({
        nilai_aktual: s.nilai_aktual !== '' ? parseFloat(s.nilai_aktual) : null,
        nilai_skor:   parseFloat(s.nilai_skor) || 0,
        catatan:      s.catatan || null,
      }).eq('id', s.id);
    }
    await supabase.from('kpi_assessments').update({ skor_akhir: totalSkor }).eq('id', editAssessment.id);
    setSaving(false);
    alert('Skor berhasil disimpan.');
    fetchAssessments();
  };

  // Submit: Draft → Submitted
  const submitAssessment = async () => {
    if (!window.confirm('Submit penilaian ini untuk direview?')) return;
    setSaving(true);
    await saveScoresInline();
    await supabase.from('kpi_assessments').update({
      status: 'Submitted', skor_akhir: totalSkor, dinilai_oleh: user.id,
    }).eq('id', editAssessment.id);
    setSaving(false);
    setEditAssessment(null);
    fetchAssessments();
  };

  // Approve: Submitted → Approved
  const approveAssessment = async () => {
    if (!window.confirm('Finalisasi & setujui penilaian ini?')) return;
    setSaving(true);
    await supabase.from('kpi_assessments').update({
      status:         'Approved',
      skor_akhir:     totalSkor,
      bonus_eligible: formApprove.bonus_eligible,
      bonus_nominal:  Number(formApprove.bonus_nominal) || 0,
      catatan:        formApprove.catatan || null,
      disetujui_oleh: user.id,
    }).eq('id', editAssessment.id);
    setSaving(false);
    setEditAssessment(null);
    fetchAssessments();
  };

  const saveScoresInline = async () => {
    for (const s of localScores) {
      await supabase.from('kpi_scores').update({
        nilai_aktual: s.nilai_aktual !== '' ? parseFloat(s.nilai_aktual) : null,
        nilai_skor:   parseFloat(s.nilai_skor) || 0,
        catatan:      s.catatan || null,
      }).eq('id', s.id);
    }
  };

  const deleteAssessment = async (id) => {
    if (!window.confirm('Hapus penilaian ini?')) return;
    const { error } = await supabase.from('kpi_assessments').delete().eq('id', id);
    if (error) return alert('Gagal: ' + error.message);
    fetchAssessments();
  };

  // Auto-fill unit_id saat guru dipilih
  const handleGuruChange = (guruId) => {
    const guru = gurus.find(g => g.id === guruId);
    setFormCreate(f => ({ ...f, guru_id: guruId, unit_id: guru?.unit_id || f.unit_id }));
  };

  const scoreColor = (skor) => {
    if (skor >= 90) return '#059669';
    if (skor >= 75) return '#d97706';
    return '#b91c1c';
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '1.25rem' }}>
        <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>KPI</p>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>Penilaian KPI</h1>
      </div>

      {/* Filter bar */}
      <div className="glass-card" style={{ padding: '1rem 1.25rem', marginBottom: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.65rem', alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Tahun</label>
          <select value={filterTahun} onChange={e => setFilterTahun(Number(e.target.value))} style={{ ...inp, width: 100 }}>
            {[THIS_YEAR - 1, THIS_YEAR, THIS_YEAR + 1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Bulan</label>
          <select value={filterBulan} onChange={e => setFilterBulan(Number(e.target.value))} style={{ ...inp, width: 130 }}>
            {BULAN_FULL.slice(1).map((b, i) => <option key={i + 1} value={i + 1}>{b}</option>)}
          </select>
        </div>
        {isAdmin && (
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Unit</label>
            <select value={filterUnit} onChange={e => setFilterUnit(e.target.value)} style={{ ...inp, width: 'auto' }}>
              <option value="">Semua Unit</option>
              {units.map(u => <option key={u.id} value={u.id}>{u.nama}</option>)}
            </select>
          </div>
        )}
        <div>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Status</label>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...inp, width: 'auto' }}>
            <option value="">Semua Status</option>
            <option value="Draft">Draft</option>
            <option value="Submitted">Submitted</option>
            <option value="Approved">Approved</option>
          </select>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: 'auto' }}
            onClick={() => { setFormCreate({ guru_id: '', unit_id: '', periode_tahun: filterTahun, periode_bulan: filterBulan }); setModalCreate(true); }}>
            <Plus size={16} /> Buat Penilaian
          </button>
        )}
      </div>

      {/* Tabel penilaian */}
      <div className="glass-card" style={{ padding: '1.25rem', overflowX: 'auto' }}>
        {loading ? (
          <p style={{ color: 'var(--text-secondary)' }}>Memuat...</p>
        ) : assessments.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            <Award size={40} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
            <p>Belum ada penilaian untuk periode {BULAN_FULL[filterBulan]} {filterTahun}.</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--glass-border)' }}>
                {['Karyawan', 'Unit', 'Periode', 'Skor', 'Bonus', 'Status', 'Aksi'].map(h => (
                  <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {assessments.map(a => (
                <tr key={a.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <td style={{ padding: '0.75rem', fontWeight: 600 }}>
                    {a.gurus?.nama || '-'}
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 400 }}>{a.gurus?.role}</div>
                  </td>
                  <td style={{ padding: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{a.units?.nama || '-'}</td>
                  <td style={{ padding: '0.75rem', whiteSpace: 'nowrap' }}>{BULAN_LABEL[a.periode_bulan]} {a.periode_tahun}</td>
                  <td style={{ padding: '0.75rem' }}>
                    {a.skor_akhir != null ? (
                      <span style={{ fontWeight: 800, fontSize: '1rem', color: scoreColor(a.skor_akhir) }}>
                        {parseFloat(a.skor_akhir).toFixed(1)}
                      </span>
                    ) : <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                  </td>
                  <td style={{ padding: '0.75rem' }}>
                    {a.bonus_eligible ? (
                      <div>
                        <span style={{ background: 'rgba(5,150,105,0.1)', color: '#059669', padding: '0.1rem 0.45rem', borderRadius: 999, fontSize: '0.75rem', fontWeight: 700 }}>Eligible</span>
                        {a.bonus_nominal > 0 && <div style={{ fontSize: '0.78rem', color: '#059669', marginTop: '0.2rem', fontWeight: 600 }}>{fmtRupiah(a.bonus_nominal)}</div>}
                      </div>
                    ) : <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>—</span>}
                  </td>
                  <td style={{ padding: '0.75rem' }}>
                    <span style={{ background: STATUS_BG[a.status], color: STATUS_COLOR[a.status], padding: '0.15rem 0.55rem', borderRadius: 999, fontSize: '0.75rem', fontWeight: 700 }}>
                      {a.status}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem' }}>
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      <button onClick={() => openEdit(a)}
                        style={{ background: 'rgba(79,70,229,0.1)', border: 'none', borderRadius: '0.4rem', padding: '0.3rem 0.55rem', cursor: 'pointer', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem' }}>
                        <Edit2 size={13} /> {a.status === 'Approved' ? 'Lihat' : 'Edit'}
                      </button>
                      {isAdmin && a.status !== 'Approved' && (
                        <button onClick={() => deleteAssessment(a.id)}
                          style={{ background: '#fee2e2', border: 'none', borderRadius: '0.4rem', padding: '0.3rem 0.5rem', cursor: 'pointer', color: '#b91c1c' }}>
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── MODAL BUAT PENILAIAN ── */}
      {modalCreate && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontWeight: 700, fontSize: '1.1rem', margin: 0 }}>Buat Penilaian KPI</h2>
              <button onClick={() => setModalCreate(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Karyawan *</label>
                <select required value={formCreate.guru_id} onChange={e => handleGuruChange(e.target.value)} style={inp}>
                  <option value="">-- Pilih karyawan --</option>
                  {gurus.map(g => <option key={g.id} value={g.id}>{g.nama} ({g.role})</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Unit *</label>
                <select required value={formCreate.unit_id} onChange={e => setFormCreate(f => ({ ...f, unit_id: e.target.value }))} style={inp}>
                  <option value="">-- Pilih unit --</option>
                  {units.map(u => <option key={u.id} value={u.id}>{u.nama}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Tahun *</label>
                  <select value={formCreate.periode_tahun} onChange={e => setFormCreate(f => ({ ...f, periode_tahun: Number(e.target.value) }))} style={inp}>
                    {[THIS_YEAR - 1, THIS_YEAR, THIS_YEAR + 1].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Bulan *</label>
                  <select value={formCreate.periode_bulan} onChange={e => setFormCreate(f => ({ ...f, periode_bulan: Number(e.target.value) }))} style={inp}>
                    {BULAN_FULL.slice(1).map((b, i) => <option key={i + 1} value={i + 1}>{b}</option>)}
                  </select>
                </div>
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0 }}>
                Indikator otomatis akan dihitung dari data absensi periode tersebut.
              </p>
              <div style={{ display: 'flex', gap: '0.65rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn" onClick={() => setModalCreate(false)}>Batal</button>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? 'Membuat...' : 'Buat Penilaian'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL EDIT / LIHAT SKOR ── */}
      {editAssessment && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 780, width: '95vw' }} onClick={e => e.stopPropagation()}>
            {/* Header modal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div>
                <h2 style={{ fontWeight: 700, fontSize: '1.1rem', margin: 0 }}>
                  Penilaian — {editAssessment.gurus?.nama}
                </h2>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0' }}>
                  {BULAN_FULL[editAssessment.periode_bulan]} {editAssessment.periode_tahun} · {editAssessment.units?.nama} · {editAssessment.gurus?.role}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ background: STATUS_BG[editAssessment.status], color: STATUS_COLOR[editAssessment.status], padding: '0.2rem 0.65rem', borderRadius: 999, fontSize: '0.8rem', fontWeight: 700 }}>
                  {editAssessment.status}
                </span>
                <button onClick={() => setEditAssessment(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
              </div>
            </div>

            {/* Tabel skor */}
            {loadingScores ? (
              <p style={{ color: 'var(--text-secondary)' }}>Memuat skor...</p>
            ) : localScores.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)' }}>Tidak ada indikator untuk role karyawan ini.</p>
            ) : (
              <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--glass-border)', background: 'rgba(79,70,229,0.04)' }}>
                      {['Indikator', 'Tipe', 'Bobot', 'Target', 'Nilai Aktual', 'Skor', 'Catatan'].map(h => (
                        <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontWeight: 700, fontSize: '0.73rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {localScores.map(s => {
                      const locked = editAssessment.status === 'Approved';
                      const bobot = parseFloat(s.kpi_targets?.bobot || 0);
                      const target_nilai = s.kpi_targets?.target_nilai ?? '—';
                      const satuan = s.kpi_targets?.satuan || '';
                      return (
                        <tr key={s.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                          <td style={{ padding: '0.65rem 0.75rem', fontWeight: 600 }}>
                            {s.kpi_indicators?.nama}
                            {s.kpi_indicators?.deskripsi && (
                              <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', fontWeight: 400 }}>{s.kpi_indicators.deskripsi}</div>
                            )}
                          </td>
                          <td style={{ padding: '0.65rem 0.75rem' }}>
                            <span style={{
                              background: s.tipe === 'Otomatis' ? 'rgba(5,150,105,0.1)' : 'rgba(79,70,229,0.1)',
                              color: s.tipe === 'Otomatis' ? '#059669' : 'var(--primary)',
                              padding: '0.1rem 0.45rem', borderRadius: 999, fontSize: '0.73rem', fontWeight: 700,
                            }}>
                              {s.tipe}
                            </span>
                          </td>
                          <td style={{ padding: '0.65rem 0.75rem', fontWeight: 600 }}>{bobot}%</td>
                          <td style={{ padding: '0.65rem 0.75rem', color: 'var(--text-secondary)' }}>
                            {target_nilai} {satuan}
                          </td>
                          <td style={{ padding: '0.65rem 0.75rem' }}>
                            {locked ? (
                              <span style={{ fontWeight: 600 }}>{s.nilai_aktual ?? '—'} {satuan}</span>
                            ) : (
                              <input type="number" min={0} step={0.01} value={s.nilai_aktual}
                                onChange={e => handleScoreChange(s.id, e.target.value)}
                                style={{ ...inp, width: 90, padding: '0.35rem 0.55rem' }}
                                placeholder="0" />
                            )}
                          </td>
                          <td style={{ padding: '0.65rem 0.75rem' }}>
                            <span style={{
                              fontWeight: 800, fontSize: '0.95rem',
                              color: parseFloat(s.nilai_skor) >= bobot * 0.9 ? '#059669'
                                : parseFloat(s.nilai_skor) >= bobot * 0.75 ? '#d97706' : '#b91c1c',
                            }}>
                              {parseFloat(s.nilai_skor || 0).toFixed(2)}
                            </span>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>/{bobot}</span>
                          </td>
                          <td style={{ padding: '0.65rem 0.75rem' }}>
                            {locked ? (
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{s.catatan || '—'}</span>
                            ) : (
                              <input value={s.catatan || ''} onChange={e => handleCatatanChange(s.id, e.target.value)}
                                style={{ ...inp, width: 120, padding: '0.35rem 0.55rem', fontSize: '0.8rem' }}
                                placeholder="Catatan..." />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--glass-border)', background: 'rgba(79,70,229,0.04)' }}>
                      <td colSpan={5} style={{ padding: '0.65rem 0.75rem', fontWeight: 700, textAlign: 'right' }}>Total Skor:</td>
                      <td style={{ padding: '0.65rem 0.75rem' }}>
                        <span style={{ fontSize: '1.15rem', fontWeight: 800, color: scoreColor(totalSkor) }}>
                          {totalSkor.toFixed(2)}
                        </span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>/100</span>
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* Seksi approval bonus */}
            {isAdmin && editAssessment.status === 'Submitted' && (
              <div style={{ background: 'rgba(5,150,105,0.05)', border: '1px solid rgba(5,150,105,0.2)', borderRadius: '0.75rem', padding: '1rem', marginBottom: '1rem' }}>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '0.75rem', color: '#059669' }}>
                  Persetujuan & Bonus
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem', marginBottom: '0.65rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input type="checkbox" id="bonus_eligible" checked={formApprove.bonus_eligible}
                      onChange={e => setFormApprove(f => ({ ...f, bonus_eligible: e.target.checked }))} style={{ width: 16, height: 16 }} />
                    <label htmlFor="bonus_eligible" style={{ fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>Eligible Bonus</label>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Nominal Bonus (Rp)</label>
                    <input type="number" min={0} value={formApprove.bonus_nominal}
                      onChange={e => setFormApprove(f => ({ ...f, bonus_nominal: e.target.value }))}
                      disabled={!formApprove.bonus_eligible} style={{ ...inp }} placeholder="0" />
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Catatan Approver</label>
                  <textarea value={formApprove.catatan} onChange={e => setFormApprove(f => ({ ...f, catatan: e.target.value }))}
                    rows={2} style={{ ...inp, resize: 'vertical' }} placeholder="Opsional..." />
                </div>
              </div>
            )}

            {/* View catatan jika sudah Approved */}
            {editAssessment.status === 'Approved' && editAssessment.catatan && (
              <div style={{ background: 'rgba(5,150,105,0.05)', border: '1px solid rgba(5,150,105,0.2)', borderRadius: '0.75rem', padding: '0.85rem', marginBottom: '1rem', fontSize: '0.85rem' }}>
                <strong>Catatan approver:</strong> {editAssessment.catatan}
              </div>
            )}

            {/* Action buttons */}
            {editAssessment.status !== 'Approved' && (
              <div style={{ display: 'flex', gap: '0.65rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button className="btn" onClick={() => setEditAssessment(null)}>Tutup</button>
                {isAdmin && editAssessment.status === 'Draft' && (
                  <>
                    <button className="btn" onClick={saveScores} disabled={saving}>
                      {saving ? 'Menyimpan...' : 'Simpan Draft'}
                    </button>
                    <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                      onClick={submitAssessment} disabled={saving}>
                      <Send size={14} /> Submit
                    </button>
                  </>
                )}
                {isAdmin && editAssessment.status === 'Submitted' && (
                  <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#059669' }}
                    onClick={approveAssessment} disabled={saving}>
                    <CheckCircle size={14} /> Approve
                  </button>
                )}
              </div>
            )}
            {editAssessment.status === 'Approved' && (
              <div style={{ textAlign: 'right' }}>
                <button className="btn" onClick={() => setEditAssessment(null)}>Tutup</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
