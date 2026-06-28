import { useState, useEffect } from 'react';
import { CalendarRange, Plus, Edit, Trash2, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

const genId = () => 'TA-' + Math.random().toString(36).substr(2, 6).toUpperCase();

const BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const currentYear = new Date().getFullYear();
const TAHUN_OPTIONS = Array.from({ length: 10 }, (_, i) => currentYear - 2 + i);

export default function TahunAjaranPage() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ nama: '', aktif: false });

  const fetch = async () => {
    setLoading(true);
    const { data } = await supabase.from('tahun_ajaran').select('*').order('created_at', { ascending: false });
    setList(data || []);
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);

  const reset = () => { setForm({ nama: '', aktif: false }); setEditId(null); setShowForm(false); };

  const handleEdit = (item) => {
    setForm({ nama: item.nama, aktif: item.aktif });
    setEditId(item.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Hapus tahun ajaran ini?')) return;
    await supabase.from('tahun_ajaran').delete().eq('id', id);
    fetch();
  };

  const handleSetAktif = async (id) => {
    await supabase.from('tahun_ajaran').update({ aktif: false }).neq('id', 'dummy');
    await supabase.from('tahun_ajaran').update({ aktif: true }).eq('id', id);
    fetch();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editId) {
      await supabase.from('tahun_ajaran').update(form).eq('id', editId);
    } else {
      await supabase.from('tahun_ajaran').insert([{ id: genId(), ...form }]);
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
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>Tahun Ajaran</h1>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Plus size={16} /> Tambah
        </button>
      </div>

      {showForm && (
        <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1.5rem', maxWidth: 480 }}>
          <h3 style={{ margin: '0 0 1rem', fontWeight: 600 }}>{editId ? 'Edit' : 'Tambah'} Tahun Ajaran</h3>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 500, fontSize: '0.85rem' }}>Nama Tahun Ajaran *</label>
              <input style={inputStyle} placeholder="Contoh: 2024/2025" value={form.nama} onChange={e => setForm(f => ({ ...f, nama: e.target.value }))} required />
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button type="submit" className="btn btn-primary">{editId ? 'Simpan' : 'Tambah'}</button>
              <button type="button" className="btn" onClick={reset} style={{ background: 'var(--surface-color)' }}>Batal</button>
            </div>
          </form>
        </div>
      )}

      <div className="glass-card" style={{ padding: '1.5rem' }}>
        {loading ? <p>Memuat...</p> : list.length === 0 ? <p style={{ color: 'var(--text-secondary)' }}>Belum ada data.</p> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--glass-border)' }}>
                <th style={{ textAlign: 'left', padding: '0.6rem', fontWeight: 600 }}>Nama</th>
                <th style={{ textAlign: 'center', padding: '0.6rem', fontWeight: 600 }}>Status</th>
                <th style={{ textAlign: 'right', padding: '0.6rem', fontWeight: 600 }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {list.map(item => (
                <tr key={item.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <td style={{ padding: '0.7rem 0.6rem', fontWeight: 500 }}>{item.nama}</td>
                  <td style={{ padding: '0.7rem 0.6rem', textAlign: 'center' }}>
                    {item.aktif
                      ? <span style={{ background: '#d1fae5', color: '#047857', padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 600 }}>Aktif</span>
                      : <button onClick={() => handleSetAktif(item.id)} style={{ background: 'none', border: '1px solid var(--glass-border)', borderRadius: '999px', padding: '0.2rem 0.6rem', fontSize: '0.8rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>Set Aktif</button>}
                  </td>
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
