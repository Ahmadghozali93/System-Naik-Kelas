import { useState, useEffect, useMemo } from 'react';
import { Download, Play, CheckCircle, Lock, Trash2, X, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/authStore';

const BULAN_FULL  = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const BULAN_LABEL = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const THIS_YEAR   = new Date().getFullYear();
const THIS_MONTH  = new Date().getMonth() + 1;

const fmtRp = (n) => 'Rp ' + new Intl.NumberFormat('id-ID').format(n || 0);
const STATUS_COLOR = { Draft: '#6b7280', Review: '#d97706', Final: '#059669' };
const STATUS_BG    = { Draft: 'rgba(107,114,128,0.1)', Review: 'rgba(217,119,6,0.1)', Final: 'rgba(5,150,105,0.1)' };

const inp = {
  padding: '0.45rem 0.65rem', borderRadius: '0.5rem',
  border: '1px solid var(--glass-border)', background: 'var(--surface-color)',
  fontFamily: 'inherit', fontSize: '0.88rem', boxSizing: 'border-box',
};

// Ambil salary terbaru per komponen untuk guru tertentu sebelum/pada periodEnd
function getActiveSalaries(allSalaries, guruId, periodEnd) {
  const mine = allSalaries.filter(s => s.guru_id === guruId && s.berlaku_mulai <= periodEnd);
  const byComp = {};
  mine.forEach(s => {
    if (!byComp[s.salary_component_id] || s.berlaku_mulai > byComp[s.salary_component_id].berlaku_mulai) {
      byComp[s.salary_component_id] = s;
    }
  });
  return Object.values(byComp);
}

export default function PayrollPage() {
  const { user } = useAuth();
  const isAdmin = ['Owner', 'Administrator', 'Supervisor'].includes(user?.role);

  const [units, setUnits]       = useState([]);
  const [filterUnit,  setFilterUnit]  = useState('');
  const [filterTahun, setFilterTahun] = useState(THIS_YEAR);
  const [filterBulan, setFilterBulan] = useState(THIS_MONTH);

  const [payroll, setPayroll]   = useState(null);   // current period payroll header
  const [items,   setItems]     = useState([]);
  const [loading, setLoading]   = useState(false);
  const [generating, setGenerating] = useState(false);

  // Slip gaji modal
  const [slipItem, setSlipItem] = useState(null);

  // Edit item (hari_kerja + komponen override)
  const [editItem, setEditItem]       = useState(null);
  const [localItem, setLocalItem]     = useState(null);
  const [savingItem, setSavingItem]   = useState(false);

  // Catatan payroll
  const [showCatatan, setShowCatatan] = useState(false);
  const [catatanVal, setCatatanVal]   = useState('');

  useEffect(() => {
    supabase.from('units').select('*').eq('aktif', true).order('nama').then(r => {
      const data = r.data || [];
      setUnits(data);
      if (!filterUnit && data.length > 0) setFilterUnit(data[0].id);
    });
  }, []);

  // Fetch payroll untuk periode yang dipilih
  const fetchPayroll = async () => {
    if (!filterUnit) return;
    setLoading(true);
    const { data: pr } = await supabase.from('payrolls')
      .select('*, units!unit_id(nama), gurus!dibuat_oleh(nama), gurus!disetujui_oleh(nama)')
      .eq('unit_id', filterUnit).eq('periode_tahun', filterTahun).eq('periode_bulan', filterBulan)
      .single();
    setPayroll(pr || null);
    if (pr) {
      const { data: it } = await supabase.from('payroll_items')
        .select('*, gurus!guru_id(nama, role)')
        .eq('payroll_id', pr.id)
        .order('created_at');
      setItems(it || []);
      setCatatanVal(pr.catatan || '');
    } else {
      setItems([]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchPayroll(); }, [filterUnit, filterTahun, filterBulan]);

  // ── GENERATE PAYROLL ────────────────────────────────────────
  const generatePayroll = async () => {
    if (!filterUnit) return alert('Pilih unit terlebih dahulu.');
    if (!window.confirm(`Generate payroll ${BULAN_FULL[filterBulan]} ${filterTahun} untuk unit ini?`)) return;
    setGenerating(true);

    const tahun = filterTahun;
    const bulan = filterBulan;
    const periodEnd   = `${tahun}-${String(bulan).padStart(2, '0')}-${new Date(tahun, bulan, 0).getDate()}`;
    const periodStart = `${tahun}-${String(bulan).padStart(2, '0')}-01`;

    try {
      // 1. Buat header
      const { data: pr, error: errPr } = await supabase.from('payrolls').insert({
        unit_id: filterUnit, periode_tahun: tahun, periode_bulan: bulan, dibuat_oleh: user.id,
      }).select().single();
      if (errPr) {
        if (errPr.code === '23505') return alert('Payroll untuk periode ini sudah ada.');
        return alert('Gagal: ' + errPr.message);
      }

      // 2. Ambil semua karyawan di unit (via guru_units)
      const { data: guruUnits } = await supabase.from('guru_units')
        .select('guru_id, gurus!guru_id(id,nama,role)').eq('unit_id', filterUnit);
      const guruIds = (guruUnits || []).map(gu => gu.guru_id);

      if (guruIds.length === 0) {
        await supabase.from('payrolls').update({ total_bruto: 0, total_potongan: 0, total_netto: 0 }).eq('id', pr.id);
        setGenerating(false);
        fetchPayroll();
        return;
      }

      // 3. Ambil data dalam batch
      const [attRes, otRes, kpiRes, salRes, loanRes] = await Promise.all([
        supabase.from('attendances').select('guru_id,status')
          .in('guru_id', guruIds).gte('tanggal', periodStart).lte('tanggal', periodEnd),
        supabase.from('overtime').select('guru_id,durasi_menit')
          .in('guru_id', guruIds).eq('status', 'Approved').gte('tanggal', periodStart).lte('tanggal', periodEnd),
        supabase.from('kpi_assessments').select('guru_id,bonus_eligible,bonus_nominal')
          .in('guru_id', guruIds).eq('periode_tahun', tahun).eq('periode_bulan', bulan).eq('status', 'Approved'),
        supabase.from('employee_salaries').select('*, salary_components!salary_component_id(nama,tipe)')
          .in('guru_id', guruIds).lte('berlaku_mulai', periodEnd),
        supabase.from('loans').select('*')
          .in('guru_id', guruIds).eq('status', 'Aktif').lte('mulai', periodEnd),
      ]);

      const atts   = attRes.data   || [];
      const ots    = otRes.data    || [];
      const kpis   = kpiRes.data   || [];
      const sals   = salRes.data   || [];
      const loans  = loanRes.data  || [];

      let grandBruto = 0, grandPotongan = 0, grandNetto = 0;

      // 4. Buat payroll_item per guru
      for (const gu of guruUnits) {
        const gid = gu.guru_id;
        const guruAtts = atts.filter(a => a.guru_id === gid);
        const guruOts  = ots.filter(o => o.guru_id === gid);
        const kpi      = kpis.find(k => k.guru_id === gid);
        const guruLoans = loans.filter(l => l.guru_id === gid);

        const hadir = guruAtts.filter(a => a.status === 'Hadir').length;
        const telat = guruAtts.filter(a => a.status === 'Telat').length;
        const izin  = guruAtts.filter(a => ['Izin', 'Sakit', 'Cuti'].includes(a.status)).length;
        const alpha = guruAtts.filter(a => a.status === 'Alpha').length;
        const menit_lembur = guruOts.reduce((s, o) => s + (o.durasi_menit || 0), 0);
        const hari_kerja   = hadir + telat + izin + alpha;

        // Snapshot komponen gaji
        const activeSals = getActiveSalaries(sals, gid, periodEnd);
        const komponen = activeSals.map(s => ({
          nama: s.salary_components.nama,
          tipe: s.salary_components.tipe,
          nominal: s.nominal,
        }));

        // Cicilan kasbon
        const loanPotongan = guruLoans.reduce((s, l) => s + Math.min(l.cicilan_per_bulan, l.sisa), 0);
        if (loanPotongan > 0) {
          komponen.push({ nama: 'Cicilan Kasbon', tipe: 'Potongan', nominal: loanPotongan, _isLoan: true });
        }

        const bonus_kpi    = kpi?.bonus_eligible ? (kpi.bonus_nominal || 0) : 0;
        const total_bruto  = komponen.filter(k => k.tipe !== 'Potongan').reduce((s, k) => s + k.nominal, 0);
        const total_potongan = komponen.filter(k => k.tipe === 'Potongan').reduce((s, k) => s + k.nominal, 0);
        const total_netto  = total_bruto - total_potongan + bonus_kpi;

        const { data: item } = await supabase.from('payroll_items').insert({
          payroll_id: pr.id, guru_id: gid,
          hari_kerja, hari_hadir: hadir, hari_telat: telat, hari_izin: izin, hari_alpha: alpha,
          menit_lembur, bonus_kpi, komponen, total_bruto, total_potongan, total_netto,
        }).select().single();

        // Catat loan deductions
        if (item) {
          for (const loan of guruLoans) {
            const cicilan = Math.min(loan.cicilan_per_bulan, loan.sisa);
            if (cicilan > 0) {
              await supabase.from('loan_deductions').insert({
                loan_id: loan.id, payroll_item_id: item.id,
                periode_tahun: tahun, periode_bulan: bulan, nominal: cicilan,
              });
            }
          }
        }

        grandBruto    += total_bruto;
        grandPotongan += total_potongan;
        grandNetto    += total_netto;
      }

      // 5. Update totals header
      await supabase.from('payrolls').update({
        total_bruto: grandBruto, total_potongan: grandPotongan, total_netto: grandNetto,
      }).eq('id', pr.id);

    } finally {
      setGenerating(false);
      fetchPayroll();
    }
  };

  // ── STATUS TRANSITIONS ────────────────────────────────────────
  const moveToReview = async () => {
    if (!window.confirm('Pindahkan payroll ke status Review?')) return;
    await supabase.from('payrolls').update({ status: 'Review', catatan: catatanVal || null }).eq('id', payroll.id);
    fetchPayroll();
  };
  const moveToFinal = async () => {
    if (!window.confirm('Finalisasi payroll ini? Status akan berubah menjadi FINAL dan tidak bisa diubah lagi.')) return;
    // Update loan sisa for this period
    const { data: deductions } = await supabase.from('loan_deductions')
      .select('loan_id, nominal').eq('periode_tahun', filterTahun).eq('periode_bulan', filterBulan);
    if (deductions) {
      const byLoan = {};
      deductions.forEach(d => { byLoan[d.loan_id] = (byLoan[d.loan_id] || 0) + d.nominal; });
      for (const [loanId, total] of Object.entries(byLoan)) {
        const { data: loan } = await supabase.from('loans').select('sisa').eq('id', loanId).single();
        if (loan) {
          const newSisa = Math.max(0, loan.sisa - total);
          await supabase.from('loans').update({ sisa: newSisa, status: newSisa <= 0 ? 'Lunas' : 'Aktif' }).eq('id', loanId);
        }
      }
    }
    await supabase.from('payrolls').update({ status: 'Final', catatan: catatanVal || null, disetujui_oleh: user.id }).eq('id', payroll.id);
    fetchPayroll();
  };
  const deletePayroll = async () => {
    if (!window.confirm('Hapus payroll Draft ini? Semua item akan terhapus.')) return;
    await supabase.from('payrolls').delete().eq('id', payroll.id);
    setPayroll(null); setItems([]);
  };

  // ── EDIT ITEM ─────────────────────────────────────────────────
  const openEditItem = (item) => {
    setEditItem(item);
    setLocalItem({ ...item, komponen: JSON.parse(JSON.stringify(item.komponen)) });
  };
  const updateKomponenNominal = (idx, val) => {
    const k = [...localItem.komponen];
    k[idx] = { ...k[idx], nominal: Number(val) };
    const bruto    = k.filter(c => c.tipe !== 'Potongan').reduce((s, c) => s + c.nominal, 0);
    const potongan = k.filter(c => c.tipe === 'Potongan').reduce((s, c) => s + c.nominal, 0);
    setLocalItem(li => ({ ...li, komponen: k, total_bruto: bruto, total_potongan: potongan, total_netto: bruto - potongan + (li.bonus_kpi || 0) }));
  };
  const saveEditItem = async () => {
    setSavingItem(true);
    await supabase.from('payroll_items').update({
      hari_kerja:    localItem.hari_kerja,
      komponen:      localItem.komponen,
      total_bruto:   localItem.total_bruto,
      total_potongan:localItem.total_potongan,
      total_netto:   localItem.total_netto,
      catatan:       localItem.catatan || null,
    }).eq('id', editItem.id);
    // Recalc payroll header totals
    const { data: allItems } = await supabase.from('payroll_items').select('total_bruto,total_potongan,total_netto').eq('payroll_id', payroll.id);
    const totals = (allItems || []).reduce((acc, it) => {
      acc.total_bruto    += it.total_bruto;
      acc.total_potongan += it.total_potongan;
      acc.total_netto    += it.total_netto;
      return acc;
    }, { total_bruto: 0, total_potongan: 0, total_netto: 0 });
    await supabase.from('payrolls').update(totals).eq('id', payroll.id);
    setSavingItem(false);
    setEditItem(null);
    fetchPayroll();
  };

  // ── EXPORT ────────────────────────────────────────────────────
  const exportCSV = () => {
    const header = ['Nama', 'Role', 'Hari Kerja', 'Hadir', 'Telat', 'Izin', 'Alpha', 'Lembur(jam)', 'Bruto', 'Potongan', 'Bonus KPI', 'Netto'];
    const rows = items.map(i => [
      i.gurus?.nama || '-',
      i.gurus?.role || '-',
      i.hari_kerja,
      i.hari_hadir,
      i.hari_telat,
      i.hari_izin,
      i.hari_alpha,
      ((i.menit_lembur || 0) / 60).toFixed(1),
      i.total_bruto,
      i.total_potongan,
      i.bonus_kpi,
      i.total_netto,
    ]);
    const csv = [header, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `payroll_${filterBulan}_${filterTahun}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const canEdit = payroll && payroll.status !== 'Final';
  const unit = units.find(u => u.id === filterUnit);

  return (
    <div>
      <div style={{ marginBottom: '1.25rem' }}>
        <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Payroll</p>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>Proses Payroll</h1>
      </div>

      {/* Filter */}
      <div className="glass-card" style={{ padding: '1rem 1.25rem', marginBottom: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.65rem', alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.2rem' }}>Unit</label>
          <select value={filterUnit} onChange={e => setFilterUnit(e.target.value)} style={{ ...inp, width: 'auto' }}>
            <option value="">-- Pilih Unit --</option>
            {units.map(u => <option key={u.id} value={u.id}>{u.nama}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.2rem' }}>Tahun</label>
          <select value={filterTahun} onChange={e => setFilterTahun(Number(e.target.value))} style={{ ...inp, width: 95 }}>
            {[THIS_YEAR - 1, THIS_YEAR, THIS_YEAR + 1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.2rem' }}>Bulan</label>
          <select value={filterBulan} onChange={e => setFilterBulan(Number(e.target.value))} style={{ ...inp, width: 130 }}>
            {BULAN_FULL.slice(1).map((b, i) => <option key={i + 1} value={i + 1}>{b}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Memuat...</p>
      ) : !filterUnit ? (
        <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <FileText size={40} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
          <p>Pilih unit untuk melihat atau membuat payroll.</p>
        </div>
      ) : !payroll ? (
        /* Belum ada payroll untuk periode ini */
        <div className="glass-card" style={{ padding: '3rem', textAlign: 'center' }}>
          <FileText size={48} style={{ opacity: 0.25, marginBottom: '1rem', color: 'var(--primary)' }} />
          <h3 style={{ margin: '0 0 0.5rem', fontWeight: 700 }}>
            Payroll {BULAN_FULL[filterBulan]} {filterTahun} — {unit?.nama}
          </h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
            Belum ada payroll untuk periode ini. Generate untuk menghitung gaji otomatis dari data absensi.
          </p>
          {isAdmin && (
            <button className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.65rem 1.5rem', fontSize: '1rem' }}
              onClick={generatePayroll} disabled={generating}>
              <Play size={18} /> {generating ? 'Sedang Generate...' : 'Generate Payroll'}
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Header payroll */}
          <div className="glass-card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.3rem' }}>
                  <h2 style={{ fontWeight: 700, fontSize: '1.1rem', margin: 0 }}>
                    {BULAN_FULL[payroll.periode_bulan]} {payroll.periode_tahun} — {unit?.nama}
                  </h2>
                  <span style={{ background: STATUS_BG[payroll.status], color: STATUS_COLOR[payroll.status], padding: '0.15rem 0.6rem', borderRadius: 999, fontSize: '0.78rem', fontWeight: 700 }}>
                    {payroll.status}
                  </span>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Dibuat oleh {payroll['gurus!dibuat_oleh']?.nama || '—'}
                  {payroll.disetujui_oleh && ` · Disetujui oleh ${payroll['gurus!disetujui_oleh']?.nama}`}
                </div>
              </div>
              {/* Action buttons */}
              {isAdmin && (
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button className="btn" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }} onClick={exportCSV}>
                    <Download size={14} /> Export
                  </button>
                  {payroll.status === 'Draft' && (
                    <>
                      <button className="btn" onClick={moveToReview} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <CheckCircle size={14} /> Review
                      </button>
                      <button onClick={deletePayroll} style={{ background: '#fee2e2', border: 'none', borderRadius: '0.5rem', padding: '0.45rem 0.75rem', cursor: 'pointer', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600, fontSize: '0.85rem' }}>
                        <Trash2 size={14} /> Hapus
                      </button>
                    </>
                  )}
                  {payroll.status === 'Review' && (
                    <button className="btn btn-primary" onClick={moveToFinal} style={{ background: '#059669', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Lock size={14} /> Finalisasi
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Summary totals */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.65rem', marginTop: '1rem' }}>
              {[
                ['Karyawan', items.length + ' orang', 'var(--primary)', 'rgba(79,70,229,0.06)'],
                ['Total Bruto', fmtRp(payroll.total_bruto), '#1d4ed8', 'rgba(29,78,216,0.06)'],
                ['Total Potongan', fmtRp(payroll.total_potongan), '#b91c1c', 'rgba(185,28,28,0.06)'],
                ['Total Netto', fmtRp(payroll.total_netto), '#059669', 'rgba(5,150,105,0.06)'],
              ].map(([label, val, color, bg]) => (
                <div key={label} className="glass-card" style={{ padding: '0.75rem 1rem', background: bg }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{label}</div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color, marginTop: '0.25rem' }}>{val}</div>
                </div>
              ))}
            </div>

            {/* Catatan */}
            {canEdit && (
              <div style={{ marginTop: '0.85rem' }}>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                  onClick={() => setShowCatatan(s => !s)}>
                  {showCatatan ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Catatan payroll
                </button>
                {showCatatan && (
                  <textarea value={catatanVal} onChange={e => setCatatanVal(e.target.value)} rows={2}
                    style={{ ...inp, width: '100%', marginTop: '0.4rem', resize: 'vertical' }} placeholder="Catatan opsional..." />
                )}
              </div>
            )}
            {payroll.catatan && !canEdit && (
              <div style={{ marginTop: '0.75rem', fontSize: '0.83rem', color: 'var(--text-secondary)' }}>
                <strong>Catatan:</strong> {payroll.catatan}
              </div>
            )}
          </div>

          {/* Tabel items */}
          <div className="glass-card" style={{ padding: '1.25rem', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--glass-border)', background: 'rgba(79,70,229,0.04)' }}>
                  {['Karyawan', 'Absensi', 'Lembur', 'Bruto', 'Potongan', 'Bonus KPI', 'Netto', ''].map(h => (
                    <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontWeight: 700, fontSize: '0.73rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                    <td style={{ padding: '0.7rem 0.75rem', fontWeight: 600 }}>
                      {item.gurus?.nama}
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 400 }}>{item.gurus?.role}</div>
                    </td>
                    <td style={{ padding: '0.7rem 0.75rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                      <span style={{ color: '#059669' }}>H:{item.hari_hadir}</span>
                      <span style={{ color: '#d97706', marginLeft: '0.4rem' }}>T:{item.hari_telat}</span>
                      <span style={{ color: '#6b7280', marginLeft: '0.4rem' }}>I:{item.hari_izin}</span>
                      <span style={{ color: '#b91c1c', marginLeft: '0.4rem' }}>A:{item.hari_alpha}</span>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>/{item.hari_kerja} hari kerja</div>
                    </td>
                    <td style={{ padding: '0.7rem 0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {((item.menit_lembur || 0) / 60).toFixed(1)} jam
                    </td>
                    <td style={{ padding: '0.7rem 0.75rem', color: '#1d4ed8', fontWeight: 600 }}>{fmtRp(item.total_bruto)}</td>
                    <td style={{ padding: '0.7rem 0.75rem', color: '#b91c1c' }}>{fmtRp(item.total_potongan)}</td>
                    <td style={{ padding: '0.7rem 0.75rem', color: '#059669' }}>
                      {item.bonus_kpi > 0 ? fmtRp(item.bonus_kpi) : '—'}
                    </td>
                    <td style={{ padding: '0.7rem 0.75rem', fontWeight: 800, color: '#059669' }}>{fmtRp(item.total_netto)}</td>
                    <td style={{ padding: '0.7rem 0.75rem' }}>
                      <div style={{ display: 'flex', gap: '0.3rem' }}>
                        <button onClick={() => setSlipItem(item)}
                          style={{ background: 'rgba(79,70,229,0.1)', border: 'none', borderRadius: '0.4rem', padding: '0.3rem 0.55rem', cursor: 'pointer', color: 'var(--primary)', fontSize: '0.75rem', fontWeight: 600 }}>
                          Slip
                        </button>
                        {isAdmin && canEdit && (
                          <button onClick={() => openEditItem(item)}
                            style={{ background: 'rgba(217,119,6,0.1)', border: 'none', borderRadius: '0.4rem', padding: '0.3rem 0.55rem', cursor: 'pointer', color: '#92400e', fontSize: '0.75rem', fontWeight: 600 }}>
                            Edit
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── MODAL SLIP GAJI ── */}
      {slipItem && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div>
                <h2 style={{ fontWeight: 700, fontSize: '1.1rem', margin: 0 }}>Slip Gaji</h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0' }}>
                  {BULAN_FULL[filterBulan]} {filterTahun} · {unit?.nama}
                </p>
              </div>
              <button onClick={() => setSlipItem(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <div style={{ borderBottom: '2px solid var(--glass-border)', paddingBottom: '0.75rem', marginBottom: '0.75rem' }}>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>{slipItem.gurus?.nama}</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{slipItem.gurus?.role}</div>
            </div>

            {/* Absensi info */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '1rem' }}>
              {[
                ['Hari Kerja', slipItem.hari_kerja],
                ['Hadir', slipItem.hari_hadir],
                ['Telat', slipItem.hari_telat],
                ['Izin', slipItem.hari_izin],
                ['Alpha', slipItem.hari_alpha],
                ['Lembur', ((slipItem.menit_lembur || 0) / 60).toFixed(1) + ' jam'],
              ].map(([label, val]) => (
                <div key={label} style={{ background: 'rgba(79,70,229,0.04)', borderRadius: '0.4rem', padding: '0.45rem 0.6rem' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{label}</div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{val}</div>
                </div>
              ))}
            </div>

            {/* Komponen */}
            <div style={{ marginBottom: '0.75rem' }}>
              {(slipItem.komponen || []).filter(k => k.tipe !== 'Potongan').map((k, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--glass-border)', fontSize: '0.85rem' }}>
                  <span>{k.nama} <span style={{ fontSize: '0.72rem', color: '#059669', background: 'rgba(5,150,105,0.1)', padding: '0.05rem 0.35rem', borderRadius: 999, marginLeft: '0.3rem' }}>{k.tipe}</span></span>
                  <span style={{ fontWeight: 600 }}>{fmtRp(k.nominal)}</span>
                </div>
              ))}
              {slipItem.bonus_kpi > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--glass-border)', fontSize: '0.85rem' }}>
                  <span>Bonus KPI <span style={{ fontSize: '0.72rem', color: '#7c3aed', background: 'rgba(124,58,237,0.1)', padding: '0.05rem 0.35rem', borderRadius: 999, marginLeft: '0.3rem' }}>Bonus</span></span>
                  <span style={{ fontWeight: 600, color: '#059669' }}>{fmtRp(slipItem.bonus_kpi)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0 0.4rem', fontWeight: 700, fontSize: '0.9rem', borderBottom: '2px solid var(--glass-border)' }}>
                <span>Total Bruto</span><span style={{ color: '#1d4ed8' }}>{fmtRp(slipItem.total_bruto + (slipItem.bonus_kpi || 0))}</span>
              </div>
              {(slipItem.komponen || []).filter(k => k.tipe === 'Potongan').map((k, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--glass-border)', fontSize: '0.85rem' }}>
                  <span>{k.nama} <span style={{ fontSize: '0.72rem', color: '#b91c1c', background: 'rgba(185,28,28,0.1)', padding: '0.05rem 0.35rem', borderRadius: 999, marginLeft: '0.3rem' }}>Potongan</span></span>
                  <span style={{ color: '#b91c1c', fontWeight: 600 }}>- {fmtRp(k.nominal)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0.5rem', fontWeight: 800, fontSize: '1.1rem', background: 'rgba(5,150,105,0.08)', borderRadius: '0.5rem', marginTop: '0.5rem' }}>
                <span>TAKE HOME PAY</span><span style={{ color: '#059669' }}>{fmtRp(slipItem.total_netto)}</span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <button className="btn" onClick={() => setSlipItem(null)}>Tutup</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL EDIT ITEM ── */}
      {editItem && localItem && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontWeight: 700, fontSize: '1.05rem', margin: 0 }}>Edit Item — {editItem.gurus?.nama}</h2>
              <button onClick={() => setEditItem(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Hari Kerja Efektif (manual — untuk prorata)</label>
              <input type="number" min={0} value={localItem.hari_kerja}
                onChange={e => setLocalItem(li => ({ ...li, hari_kerja: Number(e.target.value) }))} style={{ ...inp, width: 100 }} />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0' }}>
                Ubah ini untuk karyawan masuk/keluar di tengah bulan, lalu sesuaikan nominal komponen secara manual.
              </p>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.5rem' }}>Nominal Komponen</div>
              {localItem.komponen.map((k, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.45rem 0', borderBottom: '1px solid var(--glass-border)', gap: '0.75rem' }}>
                  <div style={{ fontSize: '0.83rem', flex: 1 }}>
                    {k.nama}
                    <span style={{ marginLeft: '0.4rem', fontSize: '0.72rem', color: k.tipe === 'Potongan' ? '#b91c1c' : '#059669', fontWeight: 600 }}>{k.tipe}</span>
                  </div>
                  <input type="number" min={0} value={k.nominal}
                    onChange={e => updateKomponenNominal(i, e.target.value)}
                    style={{ ...inp, width: 130, textAlign: 'right' }} />
                </div>
              ))}
            </div>

            <div style={{ padding: '0.65rem', background: 'rgba(5,150,105,0.06)', borderRadius: '0.5rem', marginBottom: '1rem', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Bruto</span><span style={{ fontWeight: 700, color: '#1d4ed8' }}>{fmtRp(localItem.total_bruto)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Potongan</span><span style={{ fontWeight: 700, color: '#b91c1c' }}>{fmtRp(localItem.total_potongan)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}>
                <span>Netto</span><span style={{ color: '#059669' }}>{fmtRp(localItem.total_netto)}</span>
              </div>
            </div>

            <div>
              <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Catatan</label>
              <input value={localItem.catatan || ''} onChange={e => setLocalItem(li => ({ ...li, catatan: e.target.value }))}
                placeholder="Opsional" style={{ ...inp, width: '100%' }} />
            </div>

            <div style={{ display: 'flex', gap: '0.65rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button className="btn" onClick={() => setEditItem(null)}>Batal</button>
              <button className="btn btn-primary" onClick={saveEditItem} disabled={savingItem}>
                {savingItem ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
