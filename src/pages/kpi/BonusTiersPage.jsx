import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, X, Award } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/authStore';

const ROLE_GURU_OPTIONS = [
  { value: 'learning_coordinator', label: 'Kelas A — Learning Koordinator' },
  { value: 'tutor',                label: 'Kelas B — Tutor' },
];
const ROLE_COLOR = {
  learning_coordinator: { bg: 'rgba(79,70,229,0.07)', border: 'rgba(79,70,229,0.2)', text: 'var(--primary)', badgeBg: 'rgba(79,70,229,0.1)' },
  tutor:                { bg: 'rgba(5,150,105,0.06)', border: 'rgba(5,150,105,0.2)', text: '#059669',        badgeBg: 'rgba(5,150,105,0.1)' },
};

const fmtRp = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n || 0);

const inp = {
  padding: '0.55rem 0.75rem', borderRadius: '0.5rem',
  border: '1px solid var(--glass-border)', background: 'var(--surface-color)',
  fontFamily: 'inherit', fontSize: '0.88rem', width: '100%', boxSizing: 'border-box',
};

const EMPTY_FORM = { role_guru: 'learning_coordinator', tm_dari: '', bonus_nominal: '' };

export default function BonusTiersPage() {
  const { user } = useAuth();
  const isAdmin = ['Owner', 'Administrator', 'Supervisor'].includes(user?.role);

  const [tiers, setTiers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]   = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm]     = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const fetchTiers = async () => {
    setLoading(true);
    const { data } = await supabase.from('bonus_tiers')
      .select('*')
      .order('role_guru')
      .order('tm_dari');
    setTiers(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchTiers(); }, []);

  const openAdd = () => {
    setEditId(null);
    setForm(EMPTY_FORM);
    setModal(true);
  };

  const openEdit = (t) => {
    setEditId(t.id);
    setForm({ role_guru: t.role_guru, tm_dari: t.tm_dari, bonus_nominal: t.bonus_nominal });
    setModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.tm_dari || !form.bonus_nominal) return alert('Semua field wajib diisi.');
    setSaving(true);
    const payload = {
      role_guru:     form.role_guru,
      tm_dari:       Number(form.tm_dari),
      bonus_nominal: Number(form.bonus_nominal),
    };
    const { error } = editId
      ? await supabase.from('bonus_tiers').update(payload).eq('id', editId)
      : await supabase.from('bonus_tiers').insert(payload);
    setSaving(false);
    if (error) {
      if (error.code === '23505') return alert('Tier untuk role + TM tersebut sudah ada.');
      return alert('Gagal: ' + error.message);
    }
    setModal(false);
    fetchTiers();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Hapus tier ini?')) return;
    const { error } = await supabase.from('bonus_tiers').delete().eq('id', id);
    if (error) return alert('Gagal: ' + error.message);
    fetchTiers();
  };

  const tiersA = tiers.filter(t => t.role_guru === 'learning_coordinator');
  const tiersB = tiers.filter(t => t.role_guru === 'tutor');

  const renderTable = (rows, roleKey) => {
    const c = ROLE_COLOR[roleKey];
    if (rows.length === 0) {
      return <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', padding: '1rem 0' }}>Belum ada tier untuk kelas ini.</p>;
    }
    return (
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--glass-border)' }}>
            {['TM Minimum', 'Bonus Nominal', 'Aksi'].map(h => (
              <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((t, i) => (
            <tr key={t.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
              <td style={{ padding: '0.7rem 0.75rem' }}>
                <span style={{ fontWeight: 700, fontSize: '1rem' }}>{t.tm_dari}</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginLeft: '0.3rem' }}>TM</span>
                {i > 0 && <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginLeft: '0.5rem' }}>({rows[i-1].tm_dari}–{t.tm_dari - 1} TM)</span>}
                {i === 0 && <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginLeft: '0.5rem' }}>(≥ {t.tm_dari} TM)</span>}
              </td>
              <td style={{ padding: '0.7rem 0.75rem', fontWeight: 700, color: c.text, fontSize: '1rem' }}>
                {fmtRp(t.bonus_nominal)}
              </td>
              <td style={{ padding: '0.7rem 0.75rem' }}>
                {isAdmin && (
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button onClick={() => openEdit(t)}
                      style={{ background: 'rgba(79,70,229,0.1)', border: 'none', borderRadius: '0.4rem', padding: '0.3rem 0.5rem', cursor: 'pointer', color: 'var(--primary)' }}>
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => handleDelete(t.id)}
                      style={{ background: '#fee2e2', border: 'none', borderRadius: '0.4rem', padding: '0.3rem 0.5rem', cursor: 'pointer', color: '#b91c1c' }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  return (
    <div>
      <div style={{ marginBottom: '1.25rem' }}>
        <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>KPI</p>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>Tier Bonus KPI</h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0' }}>
          Pemetaan jumlah TM → nominal bonus per kelas. Sistem otomatis memilih tier tertinggi yang dicapai saat finalisasi KPI.
        </p>
      </div>

      {isAdmin && (
        <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }} onClick={openAdd}>
            <Plus size={16} /> Tambah Tier
          </button>
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Memuat...</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          {ROLE_GURU_OPTIONS.map(({ value, label }) => {
            const c = ROLE_COLOR[value];
            const rows = value === 'learning_coordinator' ? tiersA : tiersB;
            return (
              <div key={value} className="glass-card" style={{ padding: '1.25rem', border: `1px solid ${c.border}`, background: c.bg }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div>
                    <span style={{ background: c.badgeBg, color: c.text, padding: '0.2rem 0.65rem', borderRadius: 999, fontSize: '0.78rem', fontWeight: 700 }}>
                      {label}
                    </span>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
                      {rows.length} tier terdaftar
                    </div>
                  </div>
                  <Award size={22} style={{ color: c.text, opacity: 0.5 }} />
                </div>
                {renderTable(rows, value)}
              </div>
            );
          })}
        </div>
      )}

      {/* Catatan logika */}
      <div className="glass-card" style={{ padding: '1rem 1.25rem', marginTop: '1rem', background: 'rgba(79,70,229,0.04)', fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
        <strong style={{ color: 'var(--text-primary)' }}>Cara kerja:</strong>
        {' '}Saat penilaian KPI di-Approve, sistem mengambil jumlah TM snapshot guru, lalu memilih tier dengan TM terbesar yang masih ≤ TM aktual.
        Contoh: LC dengan 350 TM → tier 300 TM (Rp 300.000) dipilih karena tier 400 TM belum tercapai.
        Bonus hanya diberikan jika status kelayakan = <strong style={{ color: '#059669' }}>LAYAK</strong>.
      </div>

      {/* Modal tambah/edit */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontWeight: 700, fontSize: '1.05rem', margin: 0 }}>{editId ? 'Edit Tier Bonus' : 'Tambah Tier Bonus'}</h2>
              <button onClick={() => setModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Kelas *</label>
                <select value={form.role_guru} onChange={e => setForm(f => ({ ...f, role_guru: e.target.value }))} style={inp}>
                  {ROLE_GURU_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>TM Minimum *</label>
                <input type="number" required min={1} value={form.tm_dari}
                  onChange={e => setForm(f => ({ ...f, tm_dari: e.target.value }))}
                  style={inp} placeholder="Cth: 200" />
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Tier ini berlaku jika TM aktual ≥ nilai ini.
                </p>
              </div>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Nominal Bonus (Rp) *</label>
                <input type="number" required min={0} step={1000} value={form.bonus_nominal}
                  onChange={e => setForm(f => ({ ...f, bonus_nominal: e.target.value }))}
                  style={inp} placeholder="Cth: 200000" />
                {form.bonus_nominal && (
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#059669', fontWeight: 600 }}>
                    = {fmtRp(Number(form.bonus_nominal))}
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.65rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn" onClick={() => setModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
