import { useState, useEffect } from 'react';
import { Building, Edit, Trash2, X, MapPin } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function UnitPage() {
    const [units, setUnits] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    // Form state
    const [formData, setFormData] = useState({
        nama: '',
        maps: '',
        aktif: true
    });

    // Fetch data from Supabase
    const fetchUnits = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('units')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            if (data) setUnits(data);
        } catch (error) {
            console.error('Error fetching units:', error.message);
            alert('Gagal mengambil data unit cabang dari database.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchUnits();
    }, []);

    const handleOpenModal = (unit = null) => {
        if (unit) {
            setEditingId(unit.id);
            setFormData({
                nama: unit.nama || '',
                maps: unit.maps || '',
                aktif: unit.aktif !== undefined ? unit.aktif : true
            });
        } else {
            setEditingId(null);
            setFormData({
                nama: '',
                maps: '',
                aktif: true
            });
        }
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingId(null);
    };

    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        try {
            if (editingId) {
                // Edit existing in Supabase
                const { error } = await supabase
                    .from('units')
                    .update(formData)
                    .eq('id', editingId);

                if (error) throw error;

                // Update local state
                setUnits(units.map(u =>
                    u.id === editingId ? { ...u, ...formData } : u
                ));
            } else {
                // Add new to Supabase
                const newId = 'UNIT-' + Math.random().toString(36).substr(2, 6).toUpperCase();
                const today = new Date().toISOString().split('T')[0];
                const newUnitData = { id: newId, dibuat_pada: today, ...formData };

                const { error } = await supabase
                    .from('units')
                    .insert([newUnitData]);

                if (error) throw error;

                // Add to local state
                setUnits([newUnitData, ...units]);
            }
            handleCloseModal();
        } catch (error) {
            console.error('Error saving unit:', error.message);
            alert('Gagal menyimpan data unit ke database.');
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm("Apakah Anda yakin ingin menghapus unit ini?")) {
            try {
                const { error } = await supabase
                    .from('units')
                    .delete()
                    .eq('id', id);

                if (error) {
                    if (error.code === '23503') {
                        alert('Tidak bisa menghapus unit ini karena masih terhubung dengan data Siswa atau Jadwal Master. Silakan hapus atau pindahkan data yang terkait lebih dulu.');
                        return;
                    }
                    throw error;
                }

                setUnits(units.filter(u => u.id !== id));
            } catch (error) {
                console.error('Error deleting unit:', error.message);
                alert('Gagal menghapus data unit dari database.');
            }
        }
    };

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">Manajemen Unit</h1>
                <p className="text-secondary">Kelola daftar cabang atau lokasi operasional bimbel.</p>
            </div>

            <div className="glass-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                        <Building className="text-primary" size={24} /> Daftar Unit
                    </h2>
                    <button className="btn btn-primary" onClick={() => handleOpenModal()}>
                        + Tambah Unit
                    </button>
                </div>

                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.05)' }}>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Unit ID</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Nama Unit</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Link Maps</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Status Aktif</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Dibuat Pada</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan="6" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                        Memuat data...
                                    </td>
                                </tr>
                            ) : units.length === 0 ? (
                                <tr>
                                    <td colSpan="6" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                        Belum ada data unit.
                                    </td>
                                </tr>
                            ) : (
                                units.map((u) => (
                                    <tr key={u.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)', transition: 'background-color 0.2s' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(79,70,229,0.02)'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                        <td style={{ padding: '1rem', fontWeight: 500, color: 'var(--text-secondary)' }}>{u.id}</td>
                                        <td style={{ padding: '1rem', fontWeight: 500 }}>{u.nama}</td>
                                        <td style={{ padding: '1rem' }}>
                                            {u.maps ? (
                                                <a href={u.maps} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}>
                                                    <MapPin size={14} /> Lihat Maps
                                                </a>
                                            ) : '-'}
                                        </td>
                                        <td style={{ padding: '1rem' }}>
                                            <span className="badge" style={{ background: u.aktif ? '#d1fae5' : '#fee2e2', color: u.aktif ? '#047857' : '#b91c1c' }}>
                                                {u.aktif ? 'Aktif' : 'Nonaktif'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>
                                            {u.dibuat_pada}
                                        </td>
                                        <td style={{ padding: '1rem' }}>
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <button
                                                    onClick={() => handleOpenModal(u)}
                                                    style={{ color: 'var(--primary)', background: 'rgba(79,70,229,0.1)', border: 'none', cursor: 'pointer', padding: '0.5rem', borderRadius: '0.375rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                    title="Edit"
                                                >
                                                    <Edit className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(u.id)}
                                                    style={{ color: '#ef4444', background: 'rgba(239,68,68,0.1)', border: 'none', cursor: 'pointer', padding: '0.5rem', borderRadius: '0.375rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                    title="Hapus"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal Form */}
            {isModalOpen && (
                <div className="modal-overlay" onClick={handleCloseModal}>
                    <div className="modal-content" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h2 className="text-xl font-bold">{editingId ? 'Edit Data Unit' : 'Tambah Unit Baru'}</h2>
                            <button onClick={handleCloseModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Nama Unit</label>
                                <input
                                    type="text"
                                    name="nama"
                                    value={formData.nama}
                                    onChange={handleInputChange}
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)' }}
                                    required
                                    placeholder="Mis: Cabang Jakarta Pusat"
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Link Google Maps</label>
                                <input
                                    type="url"
                                    name="maps"
                                    value={formData.maps}
                                    onChange={handleInputChange}
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)' }}
                                    placeholder="https://maps.google.com/?q=..."
                                />
                            </div>

                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginTop: '0.5rem' }}>
                                <input
                                    type="checkbox"
                                    name="aktif"
                                    checked={formData.aktif}
                                    onChange={handleInputChange}
                                    style={{ width: '1rem', height: '1rem', accentColor: 'var(--primary)' }}
                                />
                                <span style={{ fontWeight: 500 }}>Unit Aktif Beroperasi</span>
                            </label>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                                <button type="button" className="btn" style={{ background: '#f3f4f6' }} onClick={handleCloseModal}>Batal</button>
                                <button type="submit" className="btn btn-primary">
                                    {editingId ? 'Simpan Perubahan' : 'Tambahkan'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
