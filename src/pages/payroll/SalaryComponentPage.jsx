import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, X, Layers } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/authStore';

const TIPE_OPTIONS = ['Pokok', 'Tunjangan', 'Potongan'];
const TIPE_COLOR = {
  Pokok:    { color: '#1d4ed8', bg: 'rgba(29,78,216,0.1)' },
  Tunjangan:{ color: '#059669', bg: 'rgba(5,150,105,0.1)' },
  Potongan: { color: '#b91c1c', bg: 'rgba(185,28,28,0.1)' },
};

const inp = {
  padding: '0.55rem 0.75rem', borderRadius: '0.5rem',
  border: '1px solid var(--glass-border)', background: 'var(--surface-color)',
  fontFamily: 'inherit', fontSize: '0.88rem', width: '100%', boxSizing: 'border-box',
};

export default function SalaryComponentPage() {
  const { user } = useAuth();
  const isAdmin = ['Owner', 'Administrator', 'Supervisor'].includes(user?.role);

  const [components, setComponents] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [modal, setModal]           = useState(false);
  const [editItem, setEditItem]     = useState(null);
  const [form, setForm]             = useState({ nama: '', tipe: 'Pokok', deskripsi: '', aktif: true });

  const fetchAll = async () => {
    setLoading(true);
    const { data } = await supabase.from('salary_components').select('*').order('tipe').order('nama');
    setComponents(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const openAdd = () => {
    setEditItem(null);
    setForm({ nama: '', tipe: 'Pokok', deskripsi: '', aktif: true });
    setModal(true);
  };
  const openEdit = (item) => {
    setEditItem(item);
    setForm({ nama: item.nama, tipe: item.tipe, deskripsi: item.deskripsi || '', aktif: item.aktif });
    setModal(true);
  };
  const handleSave = async (e) => {
    e.preventDefault();
    const payload = { nama: form.nama.trim(), tipe: form.tipe, deskripsi: form.deskripsi.trim() || null, aktif: form.aktif };
    const { error } = editItem
      ? await supabase.from('salary_components').update(payload).eq('id', editItem.id)
      : await supabase.from('salary_components').insert(payload);
    if (error) return alert('Gagal: ' + error.message);
    setModal(false);
    fetchAll();
  };
  const handleDelete = async (id) => {
    if (!window.confirm('Hapus komponen ini? Pastikan tidak dipakai di struktur gaji karyawan.')) return;
    const { error } = await supabase.from('salary_components').delete().eq('id', id);
    if (error) return alert('Gagal: ' + error.message);
    fetchAll();
  };

  // Group by tipe
  const grouped = TIPE_OPTIONS.map(tipe => ({
    tipe,
    items: components.filter(c => c.tipe === tipe),
  }));

  return (
    <div>
      <div style={{ marginBottom: '1.25rem' }}>
        <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Payroll</p>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>Komponen Gaji</h1>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          {components.length} komponen terdaftar
        </span>
        {isAdmin && (
          <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }} onClick={openAdd}>
            <Plus size={16} /> Tambah Komponen
          </button>
        )}
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Memuat...</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {grouped.map(({ tipe, items }) => (
            <div key={tipe} className="glass-card" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem' }}>
                <span style={{
                  background: TIPE_COLOR[tipe].bg, color: TIPE_COLOR[tipe].color,
                  padding: '0.2rem 0.65rem', borderRadius: 999, fontSize: '0.82rem', fontWeight: 700,
                }}>
                  {tipe}
                </span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>({items.length} komponen)</span>
              </div>

              {items.length === 0 ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
                  Belum ada komponen {tipe.toLowerCase()}.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {items.map(item => (
                    <div key={item.id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '0.65rem 0.85rem', borderRadius: '0.5rem',
                      background: item.aktif ? TIPE_COLOR[tipe].bg : 'rgba(107,114,128,0.05)',
                      border: `1px solid ${item.aktif ? TIPE_COLOR[tipe].color + '30' : 'var(--glass-border)'}`,
                    }}>
                      <div>
                        <span style={{ fontWeight: 600, fontSize: '0.9rem', color: item.aktif ? 'inherit' : 'var(--text-secondary)' }}>
                          {item.nama}
                        </span>
                        {!item.aktif && (
                          <span style={{ marginLeft: '0.5rem', fontSize: '0.72rem', color: '#6b7280', fontWeight: 600 }}>NONAKTIF</span>
                        )}
                        {item.deskripsi && (
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>{item.deskripsi}</div>
                        )}
                      </div>
                      {isAdmin && (
                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                          <button onClick={() => openEdit(item)}
                            style={{ background: 'rgba(79,70,229,0.1)', border: 'none', borderRadius: '0.4rem', padding: '0.3rem 0.5rem', cursor: 'pointer', color: 'var(--primary)' }}>
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => handleDelete(item.id)}
                            style={{ background: '#fee2e2', border: 'none', borderRadius: '0.4rem', padding: '0.3rem 0.5rem', cursor: 'pointer', color: '#b91c1c' }}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {components.length === 0 && !loading && (
            <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <Layers size={40} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
              <p>Belum ada komponen gaji. Contoh: Gaji Pokok, Tunjangan Transport, Potongan BPJS.</p>
            </div>
          )}
        </div>
      )}

      {/* MODAL */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontWeight: 700, fontSize: '1.1rem', margin: 0 }}>{editItem ? 'Edit Komponen' : 'Tambah Komponen'}</h2>
              <button onClick={() => setModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Nama Komponen *</label>
                <input required value={form.nama} onChange={e => setForm(f => ({ ...f, nama: e.target.value }))}
                  placeholder="Cth: Gaji Pokok, Tunjangan Transport" style={inp} />
              </div>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Tipe *</label>
                <select value={form.tipe} onChange={e => setForm(f => ({ ...f, tipe: e.target.value }))} style={inp}>
                  <option value="Pokok">Pokok — komponen gaji utama</option>
                  <option value="Tunjangan">Tunjangan — tambahan penghasilan</option>
                  <option value="Potongan">Potongan — pengurangan gaji (BPJS, kasbon, dll)</option>
                </select>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0.3rem 0 0' }}>
                  PPh 21 & BPJS: buat sebagai Potongan dan isi nominal manual per karyawan. Formula pajak belum otomatis — TODO.
                </p>
              </div>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Keterangan</label>
                <input value={form.deskripsi} onChange={e => setForm(f => ({ ...f, deskripsi: e.target.value }))}
                  placeholder="Opsional" style={inp} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input type="checkbox" id="sc_aktif" checked={form.aktif} onChange={e => setForm(f => ({ ...f, aktif: e.target.checked }))} style={{ width: 16, height: 16 }} />
                <label htmlFor="sc_aktif" style={{ fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>Komponen Aktif</label>
              </div>
              <div style={{ display: 'flex', gap: '0.65rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn" onClick={() => setModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary">Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
