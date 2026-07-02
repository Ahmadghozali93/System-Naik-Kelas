import { useState, useEffect } from 'react';
import { Plus, Trash2, X, AlertCircle, MessageSquare } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/authStore';

const BULAN_FULL  = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const BULAN_LABEL = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const THIS_YEAR  = new Date().getFullYear();
const THIS_MONTH = new Date().getMonth() + 1;

const inp = {
  padding: '0.55rem 0.75rem', borderRadius: '0.5rem',
  border: '1px solid var(--glass-border)', background: 'var(--surface-color)',
  fontFamily: 'inherit', fontSize: '0.88rem', width: '100%', boxSizing: 'border-box',
};

const KATEGORI_COLOR = { dihitung: '#b91c1c', toleransi: '#d97706' };
const KATEGORI_BG    = { dihitung: '#fee2e2', toleransi: 'rgba(217,119,6,0.1)' };
const KATEGORI_LABEL = { dihitung: 'Dihitung (berpengaruh ke KPI)', toleransi: 'Toleransi (tidak mempengaruhi KPI)' };

export default function KpiComplaintsPage() {
  const { user } = useAuth();
  const isAdmin = ['Owner', 'Administrator', 'Supervisor'].includes(user?.role);

  const [complaints, setComplaints] = useState([]);
  const [gurus, setGurus]           = useState([]);
  const [loading, setLoading]       = useState(false);
  const [modal, setModal]           = useState(false);
  const [saving, setSaving]         = useState(false);

  const [filterTahun, setFilterTahun] = useState(THIS_YEAR);
  const [filterBulan, setFilterBulan] = useState(THIS_MONTH);
  const [filterGuru,  setFilterGuru]  = useState('');

  const [form, setForm] = useState({
    guru_id: '', periode_tahun: THIS_YEAR, periode_bulan: THIS_MONTH,
    kategori: 'dihitung', deskripsi: '',
  });

  useEffect(() => {
    supabase.from('gurus').select('id,nama').eq('status','Aktif').order('nama')
      .then(r => setGurus(r.data || []));
  }, []);

  const fetchComplaints = async () => {
    setLoading(true);
    let q = supabase.from('kpi_complaints')
      .select('*, gurus!guru_id(nama), dicatat:gurus!dicatat_oleh(nama)')
      .eq('periode_tahun', filterTahun)
      .eq('periode_bulan', filterBulan)
      .order('created_at', { ascending: false });
    if (filterGuru) q = q.eq('guru_id', filterGuru);
    if (!isAdmin)   q = q.eq('guru_id', user?.id);
    const { data } = await q;
    setComplaints(data || []);
    setLoading(false);
  };

  useEffect(() => { if (user) fetchComplaints(); }, [filterTahun, filterBulan, filterGuru, user]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.guru_id)    return alert('Pilih karyawan terlebih dahulu.');
    if (!form.deskripsi.trim()) return alert('Deskripsi komplain tidak boleh kosong.');
    setSaving(true);
    const { error } = await supabase.from('kpi_complaints').insert({
      guru_id:       form.guru_id,
      periode_tahun: Number(form.periode_tahun),
      periode_bulan: Number(form.periode_bulan),
      kategori:      form.kategori,
      deskripsi:     form.deskripsi.trim(),
      dicatat_oleh:  user?.id || null,
    });
    setSaving(false);
    if (error) return alert('Gagal menyimpan: ' + error.message);
    setModal(false);
    fetchComplaints();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Hapus komplain ini?')) return;
    const { error } = await supabase.from('kpi_complaints').delete().eq('id', id);
    if (error) return alert('Gagal: ' + error.message);
    fetchComplaints();
  };

  const openModal = () => {
    setForm({ guru_id: '', periode_tahun: filterTahun, periode_bulan: filterBulan, kategori: 'dihitung', deskripsi: '' });
    setModal(true);
  };

  const dihitungCount = complaints.filter(c => c.kategori === 'dihitung').length;
  const toleransiCount = complaints.filter(c => c.kategori === 'toleransi').length;

  return (
    <div>
      <div style={{ marginBottom: '1.25rem' }}>
        <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>KPI</p>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>Komplain CS</h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0' }}>
          Komplain yang dihitung berpengaruh ke skor KPI Kriteria 1.
        </p>
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
            <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Karyawan</label>
            <select value={filterGuru} onChange={e => setFilterGuru(e.target.value)} style={{ ...inp, width: 'auto', minWidth: 150 }}>
              <option value="">Semua Karyawan</option>
              {gurus.map(g => <option key={g.id} value={g.id}>{g.nama}</option>)}
            </select>
          </div>
        )}
        {isAdmin && (
          <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: 'auto' }} onClick={openModal}>
            <Plus size={16} /> Tambah Komplain
          </button>
        )}
      </div>

      {/* Summary chips */}
      {complaints.length > 0 && (
        <div style={{ display: 'flex', gap: '0.65rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <div style={{ background: KATEGORI_BG.dihitung, border: `1px solid ${KATEGORI_COLOR.dihitung}30`, borderRadius: '0.65rem', padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertCircle size={14} color={KATEGORI_COLOR.dihitung} />
            <span style={{ fontWeight: 700, color: KATEGORI_COLOR.dihitung, fontSize: '0.85rem' }}>{dihitungCount} Dihitung</span>
          </div>
          <div style={{ background: KATEGORI_BG.toleransi, border: `1px solid ${KATEGORI_COLOR.toleransi}30`, borderRadius: '0.65rem', padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <MessageSquare size={14} color={KATEGORI_COLOR.toleransi} />
            <span style={{ fontWeight: 700, color: KATEGORI_COLOR.toleransi, fontSize: '0.85rem' }}>{toleransiCount} Toleransi</span>
          </div>
        </div>
      )}

      {/* Tabel */}
      <div className="glass-card" style={{ padding: '1.25rem', overflowX: 'auto' }}>
        {loading ? (
          <p style={{ color: 'var(--text-secondary)' }}>Memuat...</p>
        ) : complaints.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            <MessageSquare size={40} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
            <p>Belum ada komplain untuk periode {BULAN_FULL[filterBulan]} {filterTahun}.</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--glass-border)' }}>
                {['Karyawan', 'Periode', 'Kategori', 'Deskripsi Komplain', 'Dicatat Oleh', 'Waktu', ''].map(h => (
                  <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {complaints.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <td style={{ padding: '0.7rem 0.75rem', fontWeight: 600 }}>{c.gurus?.nama || '-'}</td>
                  <td style={{ padding: '0.7rem 0.75rem', whiteSpace: 'nowrap' }}>{BULAN_LABEL[c.periode_bulan]} {c.periode_tahun}</td>
                  <td style={{ padding: '0.7rem 0.75rem' }}>
                    <span style={{
                      background: KATEGORI_BG[c.kategori], color: KATEGORI_COLOR[c.kategori],
                      padding: '0.15rem 0.55rem', borderRadius: 999, fontSize: '0.75rem', fontWeight: 700,
                    }}>
                      {c.kategori === 'dihitung' ? 'Dihitung' : 'Toleransi'}
                    </span>
                  </td>
                  <td style={{ padding: '0.7rem 0.75rem', maxWidth: 280 }}>{c.deskripsi}</td>
                  <td style={{ padding: '0.7rem 0.75rem', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{c.dicatat?.nama || '-'}</td>
                  <td style={{ padding: '0.7rem 0.75rem', whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                    {new Date(c.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td style={{ padding: '0.7rem 0.75rem' }}>
                    {isAdmin && (
                      <button onClick={() => handleDelete(c.id)}
                        style={{ background: '#fee2e2', border: 'none', borderRadius: '0.4rem', padding: '0.3rem 0.5rem', cursor: 'pointer', color: '#b91c1c' }}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal tambah */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontWeight: 700, fontSize: '1.1rem', margin: 0 }}>Tambah Komplain CS</h2>
              <button onClick={() => setModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Karyawan *</label>
                <select required value={form.guru_id} onChange={e => setForm(f => ({ ...f, guru_id: e.target.value }))} style={inp}>
                  <option value="">-- Pilih karyawan --</option>
                  {gurus.map(g => <option key={g.id} value={g.id}>{g.nama}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Tahun *</label>
                  <select value={form.periode_tahun} onChange={e => setForm(f => ({ ...f, periode_tahun: Number(e.target.value) }))} style={inp}>
                    {[THIS_YEAR - 1, THIS_YEAR, THIS_YEAR + 1].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Bulan *</label>
                  <select value={form.periode_bulan} onChange={e => setForm(f => ({ ...f, periode_bulan: Number(e.target.value) }))} style={inp}>
                    {BULAN_FULL.slice(1).map((b, i) => <option key={i+1} value={i+1}>{b}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Kategori *</label>
                <select value={form.kategori} onChange={e => setForm(f => ({ ...f, kategori: e.target.value }))} style={inp}>
                  <option value="dihitung">Dihitung — berpengaruh ke skor KPI</option>
                  <option value="toleransi">Toleransi — tidak mempengaruhi KPI</option>
                </select>
                {form.kategori === 'dihitung' && (
                  <p style={{ margin: '0.3rem 0 0', fontSize: '0.75rem', color: KATEGORI_COLOR.dihitung }}>
                    ⚠️ Komplain ini akan dihitung di Kriteria 1 KPI bulan tersebut.
                  </p>
                )}
              </div>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Deskripsi Komplain *</label>
                <textarea required rows={3} value={form.deskripsi}
                  onChange={e => setForm(f => ({ ...f, deskripsi: e.target.value }))}
                  style={{ ...inp, resize: 'vertical' }}
                  placeholder="Jelaskan detail komplain dari CS..." />
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
