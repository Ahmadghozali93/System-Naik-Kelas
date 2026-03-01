import { useState, useEffect } from 'react';
import { BookOpen, Edit, Trash2, X, Eye } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function ProgramPage() {
    const [programs, setPrograms] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [isViewing, setIsViewing] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    // Form state
    const [formData, setFormData] = useState({
        nama: '',
        deskripsi: '',
        jenis: 'Rutin',
        status: 'Aktif'
    });

    // Fetch data from Supabase
    const fetchPrograms = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('programs')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            if (data) setPrograms(data);
        } catch (error) {
            console.error('Error fetching programs:', error.message);
            alert('Gagal mengambil data program dari database.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchPrograms();
    }, []);

    const handleOpenModal = (prog = null, viewOnly = false) => {
        setIsViewing(viewOnly);
        if (prog) {
            setEditingId(prog.id);
            setFormData({
                nama: prog.nama || '',
                deskripsi: prog.deskripsi || '',
                jenis: prog.jenis || 'Rutin',
                status: prog.status || 'Aktif'
            });
        } else {
            setEditingId(null);
            setFormData({
                nama: '',
                deskripsi: '',
                jenis: 'Rutin',
                status: 'Aktif'
            });
        }
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingId(null);
        setIsViewing(false);
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        try {
            if (editingId) {
                // Edit existing in Supabase
                const { error } = await supabase
                    .from('programs')
                    .update(formData)
                    .eq('id', editingId);

                if (error) throw error;

                // Update local state
                setPrograms(programs.map(p =>
                    p.id === editingId ? { ...p, ...formData } : p
                ));
            } else {
                // Add new to Supabase
                const newId = 'PROG-' + Math.random().toString(36).substr(2, 6).toUpperCase();
                const today = new Date().toISOString().split('T')[0];
                const newProgramData = { id: newId, dibuat_pada: today, ...formData };

                const { error } = await supabase
                    .from('programs')
                    .insert([newProgramData]);

                if (error) throw error;

                // Add to local state
                setPrograms([newProgramData, ...programs]);
            }
            handleCloseModal();
        } catch (error) {
            console.error('Error saving program:', error.message);
            alert('Gagal menyimpan data program ke database.');
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm("Apakah Anda yakin ingin menghapus program ini?")) {
            try {
                const { error } = await supabase
                    .from('programs')
                    .delete()
                    .eq('id', id);

                if (error) {
                    if (error.code === '23503') {
                        alert('Tidak bisa menghapus program ini karena sedang digunakan oleh Jadwal Master. Silakan hapus jadwal yang menggunakan program ini lebih dulu.');
                        return;
                    }
                    throw error;
                }

                setPrograms(programs.filter(p => p.id !== id));
            } catch (error) {
                console.error('Error deleting program:', error.message);
                alert('Gagal menghapus data program dari database.');
            }
        }
    };

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">Manajemen Program</h1>
                <p className="text-secondary">Kelola paket bimbingan dan kurikulum.</p>
            </div>

            <div className="glass-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                        <BookOpen className="text-primary" size={24} /> Daftar Program
                    </h2>
                    <button className="btn btn-primary" onClick={() => handleOpenModal()}>
                        + Tambah Program
                    </button>
                </div>

                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.05)' }}>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Program ID</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Nama Program</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Jenis</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Status</th>
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
                            ) : programs.length === 0 ? (
                                <tr>
                                    <td colSpan="6" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                        Belum ada data program.
                                    </td>
                                </tr>
                            ) : (
                                programs.map((p) => (
                                    <tr key={p.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)', transition: 'background-color 0.2s' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(79,70,229,0.02)'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                        <td style={{ padding: '1rem', fontWeight: 500, color: 'var(--text-secondary)' }}>{p.id}</td>
                                        <td style={{ padding: '1rem', fontWeight: 600, color: 'var(--primary)' }}>{p.nama}</td>
                                        <td style={{ padding: '1rem' }}>
                                            <span style={{
                                                display: 'inline-block',
                                                padding: '0.25rem 0.75rem',
                                                borderRadius: '9999px',
                                                fontSize: '0.75rem',
                                                fontWeight: 'bold',
                                                backgroundColor: p.jenis === 'Rutin' ? '#e0e7ff' : '#fef08a',
                                                color: p.jenis === 'Rutin' ? '#4f46e5' : '#854d0e'
                                            }}>
                                                {p.jenis}
                                            </span>
                                        </td>
                                        <td style={{ padding: '1rem' }}>
                                            <span className="badge" style={{ background: p.status === 'Aktif' ? '#d1fae5' : '#fee2e2', color: p.status === 'Aktif' ? '#047857' : '#b91c1c' }}>
                                                {p.status}
                                            </span>
                                        </td>
                                        <td style={{ padding: '1rem' }}>
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <button
                                                    onClick={() => handleOpenModal(p, true)}
                                                    style={{ color: 'var(--secondary)', background: 'rgba(16,185,129,0.1)', border: 'none', cursor: 'pointer', padding: '0.5rem', borderRadius: '0.375rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                    title="Lihat Detail"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleOpenModal(p)}
                                                    style={{ color: 'var(--primary)', background: 'rgba(79,70,229,0.1)', border: 'none', cursor: 'pointer', padding: '0.5rem', borderRadius: '0.375rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                    title="Edit"
                                                >
                                                    <Edit className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(p.id)}
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
                    <div className="modal-content" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h2 className="text-xl font-bold">{isViewing ? 'Detail Data Program' : editingId ? 'Edit Data Program' : 'Tambah Program Baru'}</h2>
                            <button onClick={handleCloseModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Nama Program/Paket</label>
                                <input
                                    type="text"
                                    name="nama"
                                    value={formData.nama}
                                    onChange={handleInputChange}
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)' }}
                                    required
                                    disabled={isViewing}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Jenis Program</label>
                                <select
                                    name="jenis"
                                    value={formData.jenis}
                                    onChange={handleInputChange}
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)' }}
                                    required
                                    disabled={isViewing}
                                >
                                    <option value="Rutin">Rutin</option>
                                    <option value="Harian">Harian</option>
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Status Program</label>
                                <select
                                    name="status"
                                    value={formData.status}
                                    onChange={handleInputChange}
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)' }}
                                    required
                                    disabled={isViewing}
                                >
                                    <option value="Aktif">Aktif</option>
                                    <option value="Tidak Aktif">Tidak Aktif</option>
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Deskripsi / Kurikulum Singkat</label>
                                <textarea
                                    name="deskripsi"
                                    value={formData.deskripsi}
                                    onChange={handleInputChange}
                                    rows="3"
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontFamily: 'inherit' }}
                                    required
                                    disabled={isViewing}
                                ></textarea>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                                <button type="button" className="btn" style={{ background: '#f3f4f6' }} onClick={handleCloseModal}>Tutup</button>
                                {!isViewing && (
                                    <button type="submit" className="btn btn-primary">
                                        {editingId ? 'Simpan Perubahan' : 'Tambahkan'}
                                    </button>
                                )}
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
