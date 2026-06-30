import { useState, useEffect } from 'react';
import { Plus, X, CreditCard, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/authStore';

const BULAN_LABEL = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const fmtRp = (n) => 'Rp ' + new Intl.NumberFormat('id-ID').format(n || 0);
const todayISO = () => new Date().toISOString().slice(0, 10);
const fmtDate  = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

const inp = {
  padding: '0.55rem 0.75rem', borderRadius: '0.5rem',
  border: '1px solid var(--glass-border)', background: 'var(--surface-color)',
  fontFamily: 'inherit', fontSize: '0.88rem', width: '100%', boxSizing: 'border-box',
};

export default function LoanPage() {
  const { user } = useAuth();
  const isAdmin = ['Owner', 'Administrator', 'Supervisor'].includes(user?.role);

  const [loans, setLoans]       = useState([]);
  const [gurus, setGurus]       = useState([]);
  const [units, setUnits]       = useState([]);
  const [loading, setLoading]   = useState(true);

  const [filterUnit,   setFilterUnit]   = useState('');
  const [filterStatus, setFilterStatus] = useState('Aktif');
  const [filterGuru,   setFilterGuru]   = useState('');

  const [modal, setModal]   = useState(false);
  const [form, setForm]     = useState({ guru_id: '', unit_id: '', jumlah: '', cicilan_per_bulan: '', mulai: todayISO(), keterangan: '' });
  const [saving, setSaving] = useState(false);

  // Expand deduction history per loan
  const [expandedId, setExpandedId] = useState(null);
  const [deductions, setDeductions] = useState({});

  const fetchAll = async () => {
    setLoading(true);
    const [g, u] = await Promise.all([
      supabase.from('gurus').select('id,nama,role').eq('status', 'Aktif').order('nama'),
      supabase.from('units').select('*').eq('aktif', true).order('nama'),
    ]);
    setGurus(g.data || []);
    setUnits(u.data || []);
    await fetchLoans(g.data || []);
    setLoading(false);
  };

  const fetchLoans = async () => {
    let q = supabase.from('loans')
      .select('*, gurus!guru_id(nama, role), units!unit_id(nama)')
      .order('created_at', { ascending: false });
    if (!isAdmin) q = q.eq('guru_id', user?.id);
    if (filterStatus) q = q.eq('status', filterStatus);
    if (filterUnit)   q = q.eq('unit_id', filterUnit);
    if (filterGuru)   q = q.eq('guru_id', filterGuru);
    const { data } = await q;
    setLoans(data || []);
  };

  useEffect(() => { fetchAll(); }, []);
  useEffect(() => { if (!loading) fetchLoans(); }, [filterStatus, filterUnit, filterGuru]);

  const openDeductions = async (loanId) => {
    if (expandedId === loanId) { setExpandedId(null); return; }
    setExpandedId(loanId);
    if (!deductions[loanId]) {
      const { data } = await supabase.from('loan_deductions')
        .select('*').eq('loan_id', loanId).order('periode_tahun').order('periode_bulan');
      setDeductions(d => ({ ...d, [loanId]: data || [] }));
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const jumlah = Number(form.jumlah);
    const cicilan = Number(form.cicilan_per_bulan);
    if (cicilan > jumlah) return alert('Cicilan per bulan tidak boleh lebih dari jumlah pinjaman.');
    setSaving(true);
    const { error } = await supabase.from('loans').insert({
      guru_id:           form.guru_id,
      unit_id:           form.unit_id,
      jumlah,
      sisa:              jumlah,
      cicilan_per_bulan: cicilan,
      mulai:             form.mulai,
      keterangan:        form.keterangan || null,
      dibuat_oleh:       user.id,
    });
    setSaving(false);
    if (error) return alert('Gagal: ' + error.message);
    setModal(false);
    fetchLoans();
  };

  const markLunas = async (id) => {
    if (!window.confirm('Tandai pinjaman ini sebagai Lunas?')) return;
    await supabase.from('loans').update({ status: 'Lunas', sisa: 0 }).eq('id', id);
    fetchLoans();
  };

  const handleGuruChange = (guruId) => {
    setForm(f => ({ ...f, guru_id: guruId, unit_id: f.unit_id }));
  };

  const progressPct = (loan) => {
    if (!loan.jumlah) return 0;
    return Math.round(((loan.jumlah - loan.sisa) / loan.jumlah) * 100);
  };

  return (
    <div>
      <div style={{ marginBottom: '1.25rem' }}>
        <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Payroll</p>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>Kasbon & Pinjaman</h1>
      </div>

      {/* Filter & action */}
      <div className="glass-card" style={{ padding: '0.85rem 1.25rem', marginBottom: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.65rem', alignItems: 'flex-end' }}>
        {isAdmin && (
          <>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.2rem' }}>Unit</label>
              <select value={filterUnit} onChange={e => setFilterUnit(e.target.value)} style={{ ...inp, width: 'auto' }}>
                <option value="">Semua Unit</option>
                {units.map(u => <option key={u.id} value={u.id}>{u.nama}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.2rem' }}>Karyawan</label>
              <select value={filterGuru} onChange={e => setFilterGuru(e.target.value)} style={{ ...inp, width: 'auto' }}>
                <option value="">Semua Karyawan</option>
                {gurus.map(g => <option key={g.id} value={g.id}>{g.nama}</option>)}
              </select>
            </div>
          </>
        )}
        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.2rem' }}>Status</label>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...inp, width: 'auto' }}>
            <option value="">Semua</option>
            <option value="Aktif">Aktif</option>
            <option value="Lunas">Lunas</option>
          </select>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: 'auto' }}
            onClick={() => { setForm({ guru_id: '', unit_id: '', jumlah: '', cicilan_per_bulan: '', mulai: todayISO(), keterangan: '' }); setModal(true); }}>
            <Plus size={16} /> Tambah Kasbon
          </button>
        )}
      </div>

      {/* Daftar kasbon */}
      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Memuat...</p>
      ) : loans.length === 0 ? (
        <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <CreditCard size={40} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
          <p>Belum ada kasbon / pinjaman tercatat.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          {loans.map(loan => {
            const pct = progressPct(loan);
            const lunas = loan.status === 'Lunas';
            return (
              <div key={loan.id} className="glass-card" style={{ padding: '1rem 1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.65rem' }}>
                  <div>
                    {isAdmin && (
                      <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{loan.gurus?.nama}</div>
                    )}
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {loan.gurus?.role} · {loan.units?.nama} · Mulai {fmtDate(loan.mulai)}
                    </div>
                    {loan.keterangan && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>{loan.keterangan}</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span style={{
                      background: lunas ? 'rgba(5,150,105,0.1)' : 'rgba(217,119,6,0.1)',
                      color: lunas ? '#059669' : '#d97706',
                      padding: '0.15rem 0.55rem', borderRadius: 999, fontSize: '0.78rem', fontWeight: 700,
                    }}>
                      {loan.status}
                    </span>
                    {isAdmin && !lunas && (
                      <button onClick={() => markLunas(loan.id)}
                        style={{ background: 'rgba(5,150,105,0.1)', border: 'none', borderRadius: '0.4rem', padding: '0.3rem 0.6rem', cursor: 'pointer', color: '#059669', fontSize: '0.78rem', fontWeight: 600 }}>
                        Tandai Lunas
                      </button>
                    )}
                  </div>
                </div>

                {/* Amounts */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', margin: '0.85rem 0' }}>
                  {[
                    ['Jumlah Pinjaman', loan.jumlah, '#1d4ed8'],
                    ['Sisa', loan.sisa, lunas ? '#059669' : '#d97706'],
                    ['Cicilan/Bln', loan.cicilan_per_bulan, '#6b7280'],
                  ].map(([label, val, color]) => (
                    <div key={label} style={{ background: 'rgba(79,70,229,0.04)', borderRadius: '0.4rem', padding: '0.5rem 0.65rem' }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{label}</div>
                      <div style={{ fontWeight: 700, color, fontSize: '0.88rem' }}>{fmtRp(val)}</div>
                    </div>
                  ))}
                </div>

                {/* Progress bar */}
                <div style={{ marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.73rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                    <span>Progress pelunasan</span><span>{pct}%</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 999, background: 'var(--glass-border)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: lunas ? '#059669' : 'var(--primary)', borderRadius: 999, transition: 'width 0.3s' }} />
                  </div>
                </div>

                {/* Riwayat potongan */}
                <button onClick={() => openDeductions(loan.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.3rem', padding: 0, marginTop: '0.25rem' }}>
                  {expandedId === loan.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  Riwayat potongan ({(deductions[loan.id] || []).length} transaksi)
                </button>

                {expandedId === loan.id && (
                  <div style={{ marginTop: '0.65rem', borderTop: '1px solid var(--glass-border)', paddingTop: '0.65rem' }}>
                    {(deductions[loan.id] || []).length === 0 ? (
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>Belum ada potongan tercatat.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        {(deductions[loan.id] || []).map(d => (
                          <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>{BULAN_LABEL[d.periode_bulan]} {d.periode_tahun}</span>
                            <span style={{ fontWeight: 600, color: '#b91c1c' }}>- {fmtRp(d.nominal)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL TAMBAH KASBON */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontWeight: 700, fontSize: '1.1rem', margin: 0 }}>Tambah Kasbon / Pinjaman</h2>
              <button onClick={() => setModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Karyawan *</label>
                <select required value={form.guru_id} onChange={e => handleGuruChange(e.target.value)} style={inp}>
                  <option value="">-- Pilih karyawan --</option>
                  {gurus.map(g => <option key={g.id} value={g.id}>{g.nama} ({g.role})</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Unit *</label>
                <select required value={form.unit_id} onChange={e => setForm(f => ({ ...f, unit_id: e.target.value }))} style={inp}>
                  <option value="">-- Pilih unit --</option>
                  {units.map(u => <option key={u.id} value={u.id}>{u.nama}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Jumlah Pinjaman (Rp) *</label>
                  <input type="number" required min={1} value={form.jumlah}
                    onChange={e => setForm(f => ({ ...f, jumlah: e.target.value }))} placeholder="Cth: 1000000" style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Cicilan/Bulan (Rp) *</label>
                  <input type="number" required min={1} value={form.cicilan_per_bulan}
                    onChange={e => setForm(f => ({ ...f, cicilan_per_bulan: e.target.value }))} placeholder="Cth: 200000" style={inp} />
                </div>
              </div>
              {form.jumlah && form.cicilan_per_bulan && Number(form.cicilan_per_bulan) > 0 && (
                <p style={{ fontSize: '0.78rem', color: '#7c3aed', margin: 0, background: 'rgba(124,58,237,0.06)', padding: '0.4rem 0.65rem', borderRadius: '0.4rem' }}>
                  Estimasi lunas: {Math.ceil(Number(form.jumlah) / Number(form.cicilan_per_bulan))} bulan
                </p>
              )}
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Tanggal Mulai Potong *</label>
                <input type="date" required value={form.mulai}
                  onChange={e => setForm(f => ({ ...f, mulai: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Keterangan</label>
                <input value={form.keterangan} onChange={e => setForm(f => ({ ...f, keterangan: e.target.value }))}
                  placeholder="Opsional" style={inp} />
              </div>
              <div style={{ display: 'flex', gap: '0.65rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn" onClick={() => setModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
