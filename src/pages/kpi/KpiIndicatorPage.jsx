import { useState, useEffect } from 'react';
import { Pencil, X, Target, Settings } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/authStore';

const SOURCE_LABEL = {
  komplain:      'Komplain CS (kpi_complaints)',
  keterlambatan: 'Keterlambatan (attendances.status=Telat)',
  seragam:       'Seragam tidak sesuai (attendances.seragam)',
  izin:          'Izin disetujui (leave_requests.jenis=Izin)',
};

const inp = {
  padding: '0.55rem 0.75rem', borderRadius: '0.5rem',
  border: '1px solid var(--glass-border)', background: 'var(--surface-color)',
  fontFamily: 'inherit', fontSize: '0.88rem', width: '100%', boxSizing: 'border-box',
};

export default function KpiIndicatorPage() {
  const { user } = useAuth();
  const isAdmin = ['Owner', 'Administrator', 'Supervisor'].includes(user?.role);

  const [indicators, setIndicators]   = useState([]);
  const [scoringRules, setScoringRules] = useState({});
  const [loading, setLoading]         = useState(true);

  const [ruleModalId, setRuleModalId] = useState(null);
  const [formRule, setFormRule]       = useState({
    skor_maksimal: 20, tier1_maks: '', skor_tier1: 0,
    tier2_maks: '', skor_tier2: 0, skor_tier3: 0,
  });
  const [savingRule, setSavingRule]   = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const [indRes, ruleRes] = await Promise.all([
      supabase.from('kpi_indicators').select('*').order('id'),
      supabase.from('kpi_scoring_rules').select('*'),
    ]);
    setIndicators(indRes.data || []);
    const rMap = {};
    (ruleRes.data || []).forEach(r => { rMap[r.kpi_indicator_id] = r; });
    setScoringRules(rMap);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const openRuleModal = (ind) => {
    const rule = scoringRules[ind.id];
    if (rule) {
      setFormRule({
        skor_maksimal: rule.skor_maksimal,
        tier1_maks:    rule.tier1_maks ?? '',
        skor_tier1:    rule.skor_tier1,
        tier2_maks:    rule.tier2_maks ?? '',
        skor_tier2:    rule.skor_tier2,
        skor_tier3:    rule.skor_tier3,
      });
    } else {
      setFormRule({ skor_maksimal: 20, tier1_maks: '', skor_tier1: 0, tier2_maks: '', skor_tier2: 0, skor_tier3: 0 });
    }
    setRuleModalId(ind.id);
  };

  const saveRule = async (e) => {
    e.preventDefault();
    setSavingRule(true);
    const payload = {
      kpi_indicator_id: ruleModalId,
      skor_maksimal:    Number(formRule.skor_maksimal),
      tier1_maks:       formRule.tier1_maks !== '' ? Number(formRule.tier1_maks) : null,
      skor_tier1:       Number(formRule.skor_tier1),
      tier2_maks:       formRule.tier2_maks !== '' ? Number(formRule.tier2_maks) : null,
      skor_tier2:       Number(formRule.skor_tier2),
      skor_tier3:       Number(formRule.skor_tier3),
    };
    const existing = scoringRules[ruleModalId];
    const { error } = existing
      ? await supabase.from('kpi_scoring_rules').update(payload).eq('id', existing.id)
      : await supabase.from('kpi_scoring_rules').insert(payload);
    setSavingRule(false);
    if (error) return alert('Gagal: ' + error.message);
    setRuleModalId(null);
    fetchData();
  };

  const ruleInd = indicators.find(i => i.id === ruleModalId);

  const renderRuleSummary = (rule) => {
    if (!rule) return <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>Belum diset</span>;
    const parts = [];
    if (rule.tier1_maks != null) parts.push(`≤${rule.tier1_maks} → ${rule.skor_tier1}`);
    if (rule.tier2_maks != null) parts.push(`≤${rule.tier2_maks} → ${rule.skor_tier2}`);
    parts.push(`else → ${rule.skor_tier3}`);
    return <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{parts.join(' | ')}</span>;
  };

  return (
    <div>
      <div style={{ marginBottom: '1.25rem' }}>
        <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>KPI</p>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>Master Indikator KPI</h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0' }}>
          7 indikator tetap dengan total skor 100. Admin dapat mengubah threshold aturan scoring.
        </p>
      </div>

      <div className="glass-card" style={{ padding: '1.25rem', overflowX: 'auto' }}>
        {loading ? (
          <p style={{ color: 'var(--text-secondary)' }}>Memuat...</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--glass-border)' }}>
                {['#', 'Nama Indikator', 'Tipe', 'Maks Skor', 'Aturan Scoring', 'Aksi'].map(h => (
                  <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {indicators.map((ind, i) => {
                const rule = scoringRules[ind.id];
                return (
                  <tr key={ind.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                    <td style={{ padding: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>{i + 1}</td>
                    <td style={{ padding: '0.75rem' }}>
                      <div style={{ fontWeight: 600 }}>{ind.nama}</div>
                      {ind.deskripsi && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem', maxWidth: 280 }}>{ind.deskripsi}</div>
                      )}
                      {ind.source_field && (
                        <div style={{ fontSize: '0.72rem', color: '#059669', marginTop: '0.2rem' }}>
                          Sumber: {SOURCE_LABEL[ind.source_field] || ind.source_field}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem', whiteSpace: 'nowrap' }}>
                      <span style={{
                        background: ind.tipe === 'Otomatis' ? 'rgba(5,150,105,0.1)' : 'rgba(79,70,229,0.1)',
                        color: ind.tipe === 'Otomatis' ? '#059669' : 'var(--primary)',
                        padding: '0.15rem 0.55rem', borderRadius: 999, fontSize: '0.75rem', fontWeight: 700,
                      }}>
                        {ind.tipe}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem', fontWeight: 700, fontSize: '1rem' }}>
                      {rule ? rule.skor_maksimal : '—'}
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      {rule?.deskripsi_aturan ? (
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{rule.deskripsi_aturan}</span>
                      ) : renderRuleSummary(rule)}
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      {isAdmin && (
                        <button onClick={() => openRuleModal(ind)}
                          style={{ background: 'rgba(79,70,229,0.1)', border: 'none', borderRadius: '0.4rem', padding: '0.3rem 0.6rem', cursor: 'pointer', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem', fontWeight: 600 }}>
                          <Settings size={13} /> Aturan
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--glass-border)', background: 'rgba(79,70,229,0.04)' }}>
                <td colSpan={3} style={{ padding: '0.65rem 0.75rem', fontWeight: 700, textAlign: 'right' }}>Total Skor Maksimal:</td>
                <td colSpan={3} style={{ padding: '0.65rem 0.75rem', fontWeight: 800, fontSize: '1.05rem', color: 'var(--primary)' }}>
                  {Object.values(scoringRules).reduce((s, r) => s + (r.skor_maksimal || 0), 0)} / 100
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Modal edit scoring rule */}
      {ruleModalId && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <h2 style={{ fontWeight: 700, fontSize: '1.05rem', margin: 0 }}>Aturan Scoring</h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0' }}>{ruleInd?.nama}</p>
              </div>
              <button onClick={() => setRuleModalId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <div style={{ background: 'rgba(79,70,229,0.04)', borderRadius: '0.65rem', padding: '0.85rem', marginBottom: '1rem', fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              <strong>Logika tier:</strong><br />
              Nilai ≤ Tier 1 Maks → Skor Tier 1<br />
              Nilai ≤ Tier 2 Maks → Skor Tier 2 (jika tier2 diset)<br />
              Selain itu → Skor Tier 3
            </div>

            <form onSubmit={saveRule} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Skor Maksimal *</label>
                <input type="number" required min={0} max={100} value={formRule.skor_maksimal}
                  onChange={e => setFormRule(f => ({ ...f, skor_maksimal: e.target.value }))} style={inp} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Tier 1 Maks (nilai ≤ ini)</label>
                  <input type="number" min={0} value={formRule.tier1_maks}
                    onChange={e => setFormRule(f => ({ ...f, tier1_maks: e.target.value }))}
                    style={inp} placeholder="kosong = tidak pakai" />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Skor Tier 1 *</label>
                  <input type="number" required min={0} value={formRule.skor_tier1}
                    onChange={e => setFormRule(f => ({ ...f, skor_tier1: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Tier 2 Maks (nilai ≤ ini)</label>
                  <input type="number" min={0} value={formRule.tier2_maks}
                    onChange={e => setFormRule(f => ({ ...f, tier2_maks: e.target.value }))}
                    style={inp} placeholder="kosong = tidak pakai" />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Skor Tier 2</label>
                  <input type="number" min={0} value={formRule.skor_tier2}
                    onChange={e => setFormRule(f => ({ ...f, skor_tier2: e.target.value }))} style={inp} />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Skor Tier 3 (fallback / else) *</label>
                <input type="number" required min={0} value={formRule.skor_tier3}
                  onChange={e => setFormRule(f => ({ ...f, skor_tier3: e.target.value }))} style={inp} />
              </div>

              {/* Preview aturan */}
              <div style={{ background: 'rgba(5,150,105,0.06)', border: '1px solid rgba(5,150,105,0.2)', borderRadius: '0.5rem', padding: '0.65rem', fontSize: '0.8rem' }}>
                <strong>Preview:</strong>{' '}
                {formRule.tier1_maks !== '' && `nilai ≤ ${formRule.tier1_maks} → ${formRule.skor_tier1}`}
                {formRule.tier1_maks !== '' && formRule.tier2_maks !== '' && ' | '}
                {formRule.tier2_maks !== '' && `nilai ≤ ${formRule.tier2_maks} → ${formRule.skor_tier2}`}
                {(formRule.tier1_maks !== '' || formRule.tier2_maks !== '') && ' | '}
                {`lainnya → ${formRule.skor_tier3}`}
              </div>

              <div style={{ display: 'flex', gap: '0.65rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn" onClick={() => setRuleModalId(null)}>Batal</button>
                <button type="submit" className="btn btn-primary" disabled={savingRule}>
                  {savingRule ? 'Menyimpan...' : 'Simpan Aturan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
