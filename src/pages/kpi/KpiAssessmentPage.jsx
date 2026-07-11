import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, X, CheckCircle, Send, Edit2, Trash2, Award, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/authStore';
import { syncKualitasMengajar } from '../../utils/syncKualitasMengajar';

const BULAN_FULL  = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const BULAN_LABEL = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const THIS_YEAR   = new Date().getFullYear();
const THIS_MONTH  = new Date().getMonth() + 1;

const STATUS_COLOR = { Draft: '#6b7280', Submitted: '#d97706', Approved: '#059669' };
const STATUS_BG    = { Draft: 'rgba(107,114,128,0.1)', Submitted: 'rgba(217,119,6,0.1)', Approved: 'rgba(5,150,105,0.1)' };

// UUID tetap 7 indikator (dari SQL seed)
const IND_KUALITAS = 'a0000000-0000-0000-0000-000000000007';
const IND_AUTO_IDS = new Set([
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000003',
  'a0000000-0000-0000-0000-000000000004',
]);

const inp = {
  padding: '0.55rem 0.75rem', borderRadius: '0.5rem',
  border: '1px solid var(--glass-border)', background: 'var(--surface-color)',
  fontFamily: 'inherit', fontSize: '0.88rem', width: '100%', boxSizing: 'border-box',
};

// ── HELPERS ───────────────────────────────────────────────────

function applyRule(nilai, rule) {
  if (!rule || nilai === null || nilai === undefined || nilai === '') return 0;
  const v = Number(nilai);
  if (isNaN(v)) return 0;
  if (rule.tier1_maks != null && v <= rule.tier1_maks) return rule.skor_tier1;
  if (rule.tier2_maks != null && v <= rule.tier2_maks) return rule.skor_tier2;
  return rule.skor_tier3;
}

function getTmMinimum(role) {
  if (role === 'Learning Koordinator') return 200;
  return 100;
}

function getMasaKerja(tanggal_masuk, tahun, bulan) {
  if (!tanggal_masuk) return null;
  const masuk = new Date(tanggal_masuk);
  const periodeStart = new Date(tahun, bulan - 1, 1);
  return (periodeStart.getFullYear() - masuk.getFullYear()) * 12
       + (periodeStart.getMonth() - masuk.getMonth());
}

function computeKelayakan(guru, tahun, bulan, jumlahTm, tmMinimum, skorAkhir) {
  const checks = [];
  let layak = true;

  const masaKerja = getMasaKerja(guru?.tanggal_masuk, tahun, bulan);
  if (masaKerja == null) {
    layak = false;
    checks.push({ ok: false, label: 'Tanggal masuk kerja belum diisi' });
  } else {
    const ok = masaKerja >= 3;
    if (!ok) layak = false;
    checks.push({ ok, label: `Masa kerja ${masaKerja} bulan (min 3)` });
  }

  const tmOk = jumlahTm >= tmMinimum;
  if (!tmOk) layak = false;
  checks.push({ ok: tmOk, label: `TM: ${jumlahTm} dari min ${tmMinimum}` });

  const skorOk = skorAkhir >= 90;
  if (!skorOk) layak = false;
  checks.push({ ok: skorOk, label: `Skor: ${Number(skorAkhir).toFixed(1)} (min 90)` });

  return { layak, checks };
}

function scoreColor(s) {
  if (s >= 90) return '#059669';
  if (s >= 75) return '#d97706';
  return '#b91c1c';
}

// Hitung nilai otomatis dari 4 sumber data
async function calcAutoValues(guruId, tahun, bulan) {
  const mulai = `${tahun}-${String(bulan).padStart(2, '0')}-01`;
  const lastDay = new Date(tahun, bulan, 0).getDate();
  const akhir   = `${tahun}-${String(bulan).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const [attRes, izinRes, komplainRes, tmRes] = await Promise.all([
    supabase.from('attendances').select('status, seragam')
      .eq('guru_id', guruId).gte('tanggal', mulai).lte('tanggal', akhir),
    supabase.from('leave_requests').select('id')
      .eq('guru_id', guruId).eq('jenis', 'Izin').eq('status', 'Approved')
      .gte('tanggal_mulai', mulai).lte('tanggal_mulai', akhir),
    supabase.from('kpi_complaints').select('id')
      .eq('guru_id', guruId).eq('periode_tahun', tahun).eq('periode_bulan', bulan)
      .eq('kategori', 'dihitung'),
    supabase.from('jurnal_entries').select('id', { count: 'exact', head: true })
      .eq('guru_id', guruId)
      .gte('timestamp', mulai + 'T00:00:00')
      .lte('timestamp', akhir + 'T23:59:59'),
  ]);

  const atts = attRes.data || [];
  return {
    komplain:      (komplainRes.data || []).length,
    keterlambatan: atts.filter(a => a.status === 'Telat').length,
    seragam:       atts.filter(a => a.seragam === 'Tidak Sesuai').length,
    izin:          (izinRes.data || []).length,
    jumlahTm:      tmRes.count || 0,
  };
}

// ── KOMPONEN UTAMA ────────────────────────────────────────────

export default function KpiAssessmentPage() {
  const { user } = useAuth();
  const isAdmin = ['Owner', 'Administrator', 'Supervisor'].includes(user?.role);

  // Master data
  const [gurus,        setGurus]        = useState([]);
  const [units,        setUnits]        = useState([]);
  const [indicators,   setIndicators]   = useState([]);
  const [scoringRules, setScoringRules] = useState({});

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

  // Modal edit/view
  const [editAssessment, setEditAssessment] = useState(null);
  const [editGuru,       setEditGuru]       = useState(null);
  const [localScores,    setLocalScores]    = useState([]);
  const [loadingScores,  setLoadingScores]  = useState(false);
  const [liveTm,         setLiveTm]        = useState(null);
  const [loadingTm,      setLoadingTm]     = useState(false);
  const [saving,         setSaving]        = useState(false);
  const [formCatatan,    setFormCatatan]   = useState('');
  const [previewBonus,   setPreviewBonus]  = useState(null);

  // ── MASTER DATA ──────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      supabase.from('gurus').select('id,nama,role,tanggal_masuk,role_guru').eq('status','Aktif').order('nama'),
      supabase.from('units').select('*').eq('aktif', true).order('nama'),
      supabase.from('kpi_indicators').select('*').eq('aktif', true).order('id'),
      supabase.from('kpi_scoring_rules').select('*'),
    ]).then(([g, u, ind, rules]) => {
      setGurus(g.data || []);
      setUnits(u.data || []);
      setIndicators(ind.data || []);
      const rMap = {};
      (rules.data || []).forEach(r => { rMap[r.kpi_indicator_id] = r; });
      setScoringRules(rMap);
    });
  }, []);

  // ── FETCH ASSESSMENTS ─────────────────────────────────────────
  const fetchAssessments = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('kpi_assessments')
      .select('*, gurus!guru_id(nama, role, tanggal_masuk, role_guru), units!unit_id(nama)')
      .eq('periode_tahun', filterTahun)
      .eq('periode_bulan', filterBulan)
      .order('created_at', { ascending: false });
    if (filterUnit)   q = q.eq('unit_id', filterUnit);
    if (filterStatus) q = q.eq('status', filterStatus);
    if (!isAdmin)     q = q.eq('guru_id', user?.id);
    const { data } = await q;
    setAssessments(data || []);
    setLoading(false);
  }, [filterTahun, filterBulan, filterUnit, filterStatus, isAdmin, user]);

  useEffect(() => { if (user) fetchAssessments(); }, [fetchAssessments, user]);

  // ── PREVIEW BONUS OTOMATIS (untuk panel Submitted) ───────────
  useEffect(() => {
    if (!editAssessment || editAssessment.status !== 'Submitted' || liveTm == null) return;
    const roleGuru = editGuru?.role_guru;
    if (!roleGuru) { setPreviewBonus(0); return; }
    supabase.from('bonus_tiers')
      .select('bonus_nominal')
      .eq('role_guru', roleGuru)
      .lte('tm_dari', liveTm)
      .order('tm_dari', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) { setPreviewBonus(0); return; }
        setPreviewBonus(data?.bonus_nominal || 0);
      });
  }, [liveTm, editAssessment, editGuru]);

  // ── HITUNG LIVE TM ────────────────────────────────────────────
  const fetchLiveTm = async (guruId, tahun, bulan) => {
    setLoadingTm(true);
    const mulai = `${tahun}-${String(bulan).padStart(2,'0')}-01`;
    const lastDay = new Date(tahun, bulan, 0).getDate();
    const akhir   = `${tahun}-${String(bulan).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
    const { count } = await supabase.from('jurnal_entries')
      .select('id', { count: 'exact', head: true })
      .eq('guru_id', guruId)
      .gte('timestamp', mulai + 'T00:00:00')
      .lte('timestamp', akhir + 'T23:59:59');
    setLiveTm(count || 0);
    setLoadingTm(false);
  };

  // ── BUAT PENILAIAN BARU ───────────────────────────────────────
  const handleCreate = async (e) => {
    e.preventDefault();
    if (!formCreate.guru_id) return alert('Pilih karyawan terlebih dahulu.');
    if (!formCreate.unit_id) return alert('Pilih unit terlebih dahulu.');
    setCreating(true);

    const guru   = gurus.find(g => g.id === formCreate.guru_id);
    const tahun  = Number(formCreate.periode_tahun);
    const bulan  = Number(formCreate.periode_bulan);
    const tmMin  = getTmMinimum(guru?.role);

    // Ambil nilai otomatis
    const auto = await calcAutoValues(formCreate.guru_id, tahun, bulan);

    // Buat assessment header
    const { data: newAss, error: errAss } = await supabase
      .from('kpi_assessments')
      .insert({
        guru_id:       formCreate.guru_id,
        unit_id:       formCreate.unit_id,
        periode_tahun: tahun,
        periode_bulan: bulan,
        dinilai_oleh:  user.id,
        tm_minimum:    tmMin,
      })
      .select()
      .single();

    if (errAss) {
      setCreating(false);
      if (errAss.code === '23505') return alert('Penilaian untuk karyawan ini di periode tersebut sudah ada.');
      return alert('Gagal: ' + errAss.message);
    }

    // Source field → nilai aktual map
    const autoMap = {
      komplain:      auto.komplain,
      keterlambatan: auto.keterlambatan,
      seragam:       auto.seragam,
      izin:          auto.izin,
    };

    // Prefill Kualitas Mengajar: jika Penilaian Mengajar periode ini sudah Approve → Sesuai (1)
    const { data: approvedTeaching } = await supabase.from('teaching_assessments')
      .select('id')
      .eq('assignee_id', formCreate.guru_id)
      .eq('tahun', tahun).eq('bulan', bulan)
      .eq('status', 'Approve').limit(1);
    const kualitasTerpenuhi = (approvedTeaching?.length || 0) > 0;

    // Buat 7 baris skor
    if (indicators.length > 0) {
      const scoreRows = indicators.map(ind => {
        const isAuto = IND_AUTO_IDS.has(ind.id);
        const rule = scoringRules[ind.id];
        // Kualitas Mengajar auto-terisi "Sesuai" bila Penilaian Mengajar sudah Approve
        if (ind.id === IND_KUALITAS && kualitasTerpenuhi) {
          return {
            kpi_assessment_id: newAss.id,
            kpi_indicator_id:  ind.id,
            nilai_aktual:      1,
            nilai_skor:        applyRule(1, rule),
            tipe:              ind.tipe,
          };
        }
        const nilai = isAuto ? (autoMap[ind.source_field] ?? 0) : null;
        return {
          kpi_assessment_id: newAss.id,
          kpi_indicator_id:  ind.id,
          nilai_aktual:      nilai,
          nilai_skor:        isAuto ? applyRule(nilai, rule) : 0,
          tipe:              ind.tipe,
        };
      });
      await supabase.from('kpi_scores').insert(scoreRows);
    }

    setCreating(false);
    setModalCreate(false);
    fetchAssessments();
  };

  // ── BUKA EDIT ─────────────────────────────────────────────────
  const openEdit = async (assessment) => {
    setEditAssessment(assessment);
    setEditGuru(assessment.gurus || null);
    setFormCatatan(assessment.catatan || '');
    setPreviewBonus(null);
    setLoadingScores(true);
    setLiveTm(null);

    // Self-heal: kalau Penilaian Mengajar periode ini sudah Approve, pastikan
    // Kualitas Mengajar = Sesuai (idempotent; dilewati kalau KPI sudah final).
    if (assessment.status !== 'Approved') {
      await syncKualitasMengajar({
        guruId: assessment.guru_id,
        bulan:  assessment.periode_bulan,
        tahun:  assessment.periode_tahun,
      });
    }

    const { data } = await supabase.from('kpi_scores')
      .select('*, kpi_indicators(*)')
      .eq('kpi_assessment_id', assessment.id)
      .order('kpi_indicator_id');

    const sorted = (data || []).sort((a, b) => a.kpi_indicator_id.localeCompare(b.kpi_indicator_id));
    setLocalScores(sorted.map(s => ({
      ...s,
      nilai_aktual: s.nilai_aktual ?? '',
    })));
    setLoadingScores(false);

    // Fetch live TM
    fetchLiveTm(assessment.guru_id, assessment.periode_tahun, assessment.periode_bulan);
  };

  // ── REFRESH NILAI OTOMATIS ────────────────────────────────────
  const handleRefreshAuto = async () => {
    if (!editAssessment) return;
    const auto = await calcAutoValues(
      editAssessment.guru_id,
      editAssessment.periode_tahun,
      editAssessment.periode_bulan,
    );
    fetchLiveTm(editAssessment.guru_id, editAssessment.periode_tahun, editAssessment.periode_bulan);
    const autoMap = {
      komplain: auto.komplain, keterlambatan: auto.keterlambatan,
      seragam: auto.seragam, izin: auto.izin,
    };
    setLocalScores(prev => prev.map(s => {
      const isAuto = IND_AUTO_IDS.has(s.kpi_indicator_id);
      if (!isAuto) return s;
      const rule   = scoringRules[s.kpi_indicator_id];
      const sfield = s.kpi_indicators?.source_field;
      const nilai  = autoMap[sfield] ?? 0;
      return { ...s, nilai_aktual: nilai, nilai_skor: applyRule(nilai, rule) };
    }));
  };

  // Ubah nilai manual → recalc skor
  const handleScoreChange = (scoreId, rawValue) => {
    setLocalScores(prev => prev.map(s => {
      if (s.id !== scoreId) return s;
      const rule = scoringRules[s.kpi_indicator_id];
      return { ...s, nilai_aktual: rawValue, nilai_skor: applyRule(rawValue, rule) };
    }));
  };

  // Total skor
  const totalSkor = useMemo(
    () => localScores.reduce((sum, s) => sum + (Number(s.nilai_skor) || 0), 0),
    [localScores],
  );

  const editTmMinimum = editAssessment?.tm_minimum || getTmMinimum(editGuru?.role);

  const kelayakan = useMemo(() => {
    if (!editAssessment) return null;
    return computeKelayakan(
      editGuru,
      editAssessment.periode_tahun,
      editAssessment.periode_bulan,
      liveTm ?? 0,
      editTmMinimum,
      totalSkor,
    );
  }, [editGuru, editAssessment, liveTm, editTmMinimum, totalSkor]);

  // ── SIMPAN SKOR KE DB ─────────────────────────────────────────
  const persistScores = async () => {
    for (const s of localScores) {
      await supabase.from('kpi_scores').update({
        nilai_aktual: s.nilai_aktual !== '' ? Number(s.nilai_aktual) : null,
        nilai_skor:   Number(s.nilai_skor) || 0,
      }).eq('id', s.id);
    }
    await supabase.from('kpi_assessments').update({ skor_akhir: totalSkor }).eq('id', editAssessment.id);
  };

  const saveScores = async () => {
    setSaving(true);
    await persistScores();
    setSaving(false);
    alert('Skor berhasil disimpan.');
    fetchAssessments();
  };

  // ── SUBMIT: Draft → Submitted ─────────────────────────────────
  const submitAssessment = async () => {
    if (!window.confirm('Submit penilaian ini untuk direview?')) return;
    setSaving(true);
    await persistScores();
    await supabase.from('kpi_assessments').update({
      status: 'Submitted', skor_akhir: totalSkor, dinilai_oleh: user.id,
    }).eq('id', editAssessment.id);
    setSaving(false);
    setEditAssessment(null);
    fetchAssessments();
  };

  // ── APPROVE: Submitted → Approved (snapshot + kelayakan + bonus otomatis) ──
  const approveAssessment = async () => {
    if (!window.confirm('Finalisasi & setujui penilaian ini?')) return;
    setSaving(true);

    // Snapshot TM terbaru
    const mulai = `${editAssessment.periode_tahun}-${String(editAssessment.periode_bulan).padStart(2,'0')}-01`;
    const lastDay = new Date(editAssessment.periode_tahun, editAssessment.periode_bulan, 0).getDate();
    const akhir   = `${editAssessment.periode_tahun}-${String(editAssessment.periode_bulan).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
    const { count: snapshotTm } = await supabase.from('jurnal_entries')
      .select('id', { count: 'exact', head: true })
      .eq('guru_id', editAssessment.guru_id)
      .gte('timestamp', mulai + 'T00:00:00')
      .lte('timestamp', akhir + 'T23:59:59');

    const tmSnap = snapshotTm || 0;
    const kel = computeKelayakan(
      editGuru, editAssessment.periode_tahun, editAssessment.periode_bulan,
      tmSnap, editTmMinimum, totalSkor,
    );

    // Lookup bonus otomatis dari bonus_tiers
    let bonusNominal = 0;
    if (kel.layak && editGuru?.role_guru) {
      try {
        const { data: tierRow, error: tierErr } = await supabase.from('bonus_tiers')
          .select('bonus_nominal')
          .eq('role_guru', editGuru.role_guru)
          .lte('tm_dari', tmSnap)
          .order('tm_dari', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!tierErr) bonusNominal = tierRow?.bonus_nominal || 0;
      } catch(err) {
        console.warn('bonus_tiers lookup failed:', err);
      }
    }

    await supabase.from('kpi_assessments').update({
      status:           'Approved',
      skor_akhir:       totalSkor,
      jumlah_tm:        tmSnap,
      tm_minimum:       editTmMinimum,
      status_kelayakan: kel.layak ? 'LAYAK' : 'TIDAK LAYAK',
      bonus_eligible:   kel.layak,
      bonus_nominal:    bonusNominal,
      catatan:          formCatatan || null,
      disetujui_oleh:   user.id,
    }).eq('id', editAssessment.id);

    setSaving(false);
    setEditAssessment(null);
    fetchAssessments();
  };

  const deleteAssessment = async (id) => {
    if (!window.confirm('Hapus penilaian ini?')) return;
    const { error } = await supabase.from('kpi_assessments').delete().eq('id', id);
    if (error) return alert('Gagal: ' + error.message);
    fetchAssessments();
  };

  // ── RENDER ────────────────────────────────────────────────────

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
            {BULAN_FULL.slice(1).map((b, i) => <option key={i+1} value={i+1}>{b}</option>)}
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
            onClick={() => { setFormCreate({ guru_id:'', unit_id:'', periode_tahun: filterTahun, periode_bulan: filterBulan }); setModalCreate(true); }}>
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
                {['Karyawan', 'Unit', 'Periode', 'Skor', 'TM', 'Kelayakan', 'Status', 'Aksi'].map(h => (
                  <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {assessments.map(a => {
                const skor = a.skor_akhir != null ? parseFloat(a.skor_akhir) : null;
                const kel  = a.status_kelayakan;
                return (
                  <tr key={a.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                    <td style={{ padding: '0.75rem', fontWeight: 600 }}>
                      {a.gurus?.nama || '-'}
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 400 }}>{a.gurus?.role}</div>
                    </td>
                    <td style={{ padding: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{a.units?.nama || '-'}</td>
                    <td style={{ padding: '0.75rem', whiteSpace: 'nowrap' }}>{BULAN_LABEL[a.periode_bulan]} {a.periode_tahun}</td>
                    <td style={{ padding: '0.75rem' }}>
                      {skor != null ? (
                        <span style={{ fontWeight: 800, fontSize: '1rem', color: scoreColor(skor) }}>
                          {skor.toFixed(1)}
                        </span>
                      ) : <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                    </td>
                    <td style={{ padding: '0.75rem', fontSize: '0.82rem' }}>
                      {a.jumlah_tm != null
                        ? <span style={{ fontWeight: 600 }}>{a.jumlah_tm}<span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>/{a.tm_minimum}</span></span>
                        : <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      {kel ? (
                        <span style={{
                          background: kel === 'LAYAK' ? 'rgba(5,150,105,0.1)' : '#fee2e2',
                          color: kel === 'LAYAK' ? '#059669' : '#b91c1c',
                          padding: '0.15rem 0.55rem', borderRadius: 999, fontSize: '0.75rem', fontWeight: 700,
                        }}>{kel}</span>
                      ) : <span style={{ color: 'var(--text-secondary)' }}>—</span>}
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
                );
              })}
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
                <select required value={formCreate.guru_id} onChange={e => setFormCreate(f => ({ ...f, guru_id: e.target.value }))} style={inp}>
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
                    {BULAN_FULL.slice(1).map((b, i) => <option key={i+1} value={i+1}>{b}</option>)}
                  </select>
                </div>
              </div>
              {formCreate.guru_id && (() => {
                const g = gurus.find(x => x.id === formCreate.guru_id);
                return g ? (
                  <div style={{ background: 'rgba(79,70,229,0.05)', borderRadius: '0.5rem', padding: '0.65rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    <strong>TM Minimum:</strong> {getTmMinimum(g.role)} sesi
                    {!g.tanggal_masuk && <span style={{ color: '#d97706', display: 'block', marginTop: '0.2rem' }}>⚠️ Tanggal masuk kerja belum diisi</span>}
                  </div>
                ) : null;
              })()}
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0 }}>
                4 kriteria otomatis akan dihitung dari data absensi, izin, dan komplain CS periode tersebut.
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
          <div className="modal-content" style={{ maxWidth: 820, width: '95vw' }} onClick={e => e.stopPropagation()}>
            {/* Header */}
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

            {/* Syarat Kelayakan */}
            <div style={{ background: kelayakan?.layak ? 'rgba(5,150,105,0.06)' : 'rgba(185,28,28,0.05)', border: `1px solid ${kelayakan?.layak ? 'rgba(5,150,105,0.2)' : 'rgba(185,28,28,0.15)'}`, borderRadius: '0.75rem', padding: '0.85rem 1rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                  Syarat Kelayakan Bonus
                  {loadingTm && <span style={{ fontWeight: 400, color: 'var(--text-secondary)', marginLeft: '0.5rem', fontSize: '0.78rem' }}>Menghitung TM...</span>}
                </div>
                <div style={{ fontWeight: 800, padding: '0.2rem 0.75rem', borderRadius: 999, fontSize: '0.82rem', background: kelayakan?.layak ? 'rgba(5,150,105,0.15)' : '#fee2e2', color: kelayakan?.layak ? '#059669' : '#b91c1c' }}>
                  {editAssessment.status === 'Approved'
                    ? (editAssessment.status_kelayakan || '—')
                    : (kelayakan?.layak ? 'Proyeksi: LAYAK' : 'Proyeksi: TIDAK LAYAK')}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                {(kelayakan?.checks || []).map((c, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem' }}>
                    <span style={{ color: c.ok ? '#059669' : '#b91c1c', fontWeight: 700 }}>{c.ok ? '✓' : '✗'}</span>
                    <span style={{ color: c.ok ? '#059669' : '#b91c1c' }}>{c.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tabel skor */}
            {loadingScores ? (
              <p style={{ color: 'var(--text-secondary)' }}>Memuat skor...</p>
            ) : (
              <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--glass-border)', background: 'rgba(79,70,229,0.04)' }}>
                      {['#', 'Kriteria', 'Tipe', 'Nilai Aktual', 'Skor', '/Maks', 'Aturan'].map(h => (
                        <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontWeight: 700, fontSize: '0.73rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {localScores.map((s, i) => {
                      const locked  = editAssessment.status === 'Approved';
                      const isAuto  = IND_AUTO_IDS.has(s.kpi_indicator_id);
                      const rule    = scoringRules[s.kpi_indicator_id];
                      const isKual  = s.kpi_indicator_id === IND_KUALITAS;
                      const nilaiNum = Number(s.nilai_aktual);
                      return (
                        <tr key={s.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                          <td style={{ padding: '0.65rem 0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{i + 1}</td>
                          <td style={{ padding: '0.65rem 0.75rem', fontWeight: 600 }}>
                            {s.kpi_indicators?.nama}
                          </td>
                          <td style={{ padding: '0.65rem 0.75rem' }}>
                            <span style={{
                              background: isAuto ? 'rgba(5,150,105,0.1)' : 'rgba(79,70,229,0.1)',
                              color: isAuto ? '#059669' : 'var(--primary)',
                              padding: '0.1rem 0.45rem', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700,
                            }}>
                              {isAuto ? 'Auto' : 'Manual'}
                            </span>
                          </td>
                          <td style={{ padding: '0.65rem 0.75rem' }}>
                            {locked || isAuto ? (
                              <span style={{ fontWeight: 600 }}>
                                {s.nilai_aktual !== '' && s.nilai_aktual != null
                                  ? (isKual ? (nilaiNum === 1 ? 'Sesuai' : 'Tidak Sesuai') : s.nilai_aktual)
                                  : '—'}
                              </span>
                            ) : isKual ? (
                              <select value={s.nilai_aktual} onChange={e => handleScoreChange(s.id, e.target.value)}
                                style={{ ...inp, width: 140, padding: '0.35rem 0.55rem' }}>
                                <option value="">-- Pilih --</option>
                                <option value="1">Sesuai Metode</option>
                                <option value="0">Tidak Sesuai</option>
                              </select>
                            ) : (
                              <input type="number" min={0} step={1} value={s.nilai_aktual}
                                onChange={e => handleScoreChange(s.id, e.target.value)}
                                style={{ ...inp, width: 80, padding: '0.35rem 0.55rem' }}
                                placeholder="0" />
                            )}
                          </td>
                          <td style={{ padding: '0.65rem 0.75rem' }}>
                            <span style={{
                              fontWeight: 800, fontSize: '0.95rem',
                              color: (rule && Number(s.nilai_skor) >= rule.skor_maksimal)
                                ? '#059669' : Number(s.nilai_skor) > 0 ? '#d97706' : '#b91c1c',
                            }}>
                              {Number(s.nilai_skor || 0)}
                            </span>
                          </td>
                          <td style={{ padding: '0.65rem 0.75rem', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                            {rule ? rule.skor_maksimal : '—'}
                          </td>
                          <td style={{ padding: '0.65rem 0.75rem', color: 'var(--text-secondary)', fontSize: '0.75rem', maxWidth: 160 }}>
                            {rule?.deskripsi_aturan || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--glass-border)', background: 'rgba(79,70,229,0.04)' }}>
                      <td colSpan={4} style={{ padding: '0.65rem 0.75rem', fontWeight: 700, textAlign: 'right' }}>Total Skor:</td>
                      <td style={{ padding: '0.65rem 0.75rem' }}>
                        <span style={{ fontSize: '1.2rem', fontWeight: 800, color: scoreColor(totalSkor) }}>
                          {totalSkor}
                        </span>
                      </td>
                      <td style={{ padding: '0.65rem 0.75rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>/100</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* Seksi approve */}
            {isAdmin && editAssessment.status === 'Submitted' && (
              <div style={{ background: 'rgba(5,150,105,0.05)', border: '1px solid rgba(5,150,105,0.2)', borderRadius: '0.75rem', padding: '1rem', marginBottom: '1rem' }}>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '0.75rem', color: '#059669' }}>Persetujuan</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem', marginBottom: '0.65rem' }}>
                  <div style={{ background: 'white', borderRadius: '0.5rem', padding: '0.75rem', border: '1px solid rgba(5,150,105,0.15)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '0.25rem' }}>Bonus Otomatis</div>
                    {!editGuru?.role_guru ? (
                      <div style={{ color: '#d97706', fontSize: '0.82rem' }}>⚠️ Kelas Bonus belum diset di profil guru</div>
                    ) : previewBonus == null ? (
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>Menghitung...</div>
                    ) : kelayakan?.layak ? (
                      <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#059669' }}>
                        {new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(previewBonus)}
                      </div>
                    ) : (
                      <div style={{ color: '#b91c1c', fontSize: '0.82rem', fontWeight: 600 }}>Rp 0 (tidak layak)</div>
                    )}
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                      Dihitung dari tier {editGuru?.role_guru === 'learning_coordinator' ? 'Kelas A' : 'Kelas B'} × TM {liveTm}
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Catatan Approver</label>
                    <input value={formCatatan} onChange={e => setFormCatatan(e.target.value)} style={inp} placeholder="Opsional..." />
                  </div>
                </div>
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Kelayakan dan nominal bonus dihitung otomatis. Konfigurasi tier di halaman <strong>Tier Bonus KPI</strong>.
                </p>
              </div>
            )}

            {editAssessment.status === 'Approved' && editAssessment.catatan && (
              <div style={{ background: 'rgba(5,150,105,0.05)', border: '1px solid rgba(5,150,105,0.2)', borderRadius: '0.75rem', padding: '0.85rem', marginBottom: '1rem', fontSize: '0.85rem' }}>
                <strong>Catatan approver:</strong> {editAssessment.catatan}
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '0.65rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button className="btn" onClick={() => setEditAssessment(null)}>Tutup</button>
              {editAssessment.status !== 'Approved' && isAdmin && (
                <button className="btn" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                  onClick={handleRefreshAuto} disabled={saving}>
                  <RefreshCw size={14} /> Refresh Auto
                </button>
              )}
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
                  <CheckCircle size={14} /> Approve & Finalisasi
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
