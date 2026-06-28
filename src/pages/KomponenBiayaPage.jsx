import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatRupiah } from '../utils/formatRupiah';

const genId = () => 'KB-' + Math.random().toString(36).substr(2, 6).toUpperCase();

export default function KomponenBiayaPage() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ nama: '', nominal: '' });

  const fetch = async () => {
    setLoading(true);
    const { data } = await supabase.from('komponen_biaya').select('*').order('created_at', { ascending: false });
    setList(data || []);
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);

  const reset = () => { setForm({ nama: '', nominal: '' }); setEditId(null); setShowForm(false); };

  const handleEdit = (item) => {
    setForm({ nama: item.nama, nominal: String(item.nominal) });
    setEditId(item.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Hapus komponen ini?')) return;
    await supabase.from('komponen_biaya').delete().eq('id', id);
    fetch();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = { nama: form.nama, nominal: Number(form.nominal) };
    if (editId) {
      await supabase.from('komponen_biaya').update(payload).eq('id', editId);
    } else {
      await supabase.from('komponen_biaya').insert([{ id: genId(), ...payload }]);
    }
    reset();
    fetch();
  };

  const inputStyle = { width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontFamily: 'inherit', fontSize: '0.9rem' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>SPP</p>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>Komponen Biaya</h1>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Plus size={16} /> Tambah
        </button>
      </div>

      {showForm && (
        <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1.5rem', maxWidth: 480 }}>
          <h3 style={{ margin: '0 0 1rem', fontWeight: 600 }}>{editId ? 'Edit' : 'Tambah'} Komponen Biaya</h3>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 500, fontSize: '0.85rem' }}>Nama Komponen *</label>
              <input style={inputStyle} placeholder="Contoh: SPP Bulanan" value={form.nama} onChange={e => setForm(f => ({ ...f, nama: e.target.value }))} required />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 500, fontSize: '0.85rem' }}>Nominal (Rp) *</label>
              <input type="number" style={inputStyle} placeholder="150000" value={form.nominal} onChange={e => setForm(f => ({ ...f, nominal: e.target.value }))} required min="0" />
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button type="submit" className="btn btn-primary">{editId ? 'Simpan' : 'Tambah'}</button>
              <button type="button" className="btn" onClick={reset} style={{ background: 'var(--surface-color)' }}>Batal</button>
            </div>
          </form>
        </div>
      )}

      <div className="glass-card" style={{ padding: '1.5rem' }}>
        {loading ? <p>Memuat...</p> : list.length === 0 ? <p style={{ color: 'var(--text-secondary)' }}>Belum ada komponen biaya.</p> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--glass-border)' }}>
                <th style={{ textAlign: 'left', padding: '0.6rem', fontWeight: 600 }}>Nama Komponen</th>
                <th style={{ textAlign: 'right', padding: '0.6rem', fontWeight: 600 }}>Nominal</th>
                <th style={{ textAlign: 'right', padding: '0.6rem', fontWeight: 600 }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {list.map(item => (
                <tr key={item.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <td style={{ padding: '0.7rem 0.6rem', fontWeight: 500 }}>{item.nama}</td>
                  <td style={{ padding: '0.7rem 0.6rem', textAlign: 'right', fontWeight: 600 }}>{formatRupiah(item.nominal)}</td>
                  <td style={{ padding: '0.7rem 0.6rem', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                      <button onClick={() => handleEdit(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)' }}><Edit size={15} /></button>
                      <button onClick={() => handleDelete(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
