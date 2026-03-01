import { useState, useEffect } from 'react';
import { Users, Edit, Trash2, X, MapPin, MessageCircle, Eye } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function UserPage() {
    const [gurus, setGurus] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [isViewing, setIsViewing] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    // Form state
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        nama: '',
        role: 'Guru',
        nowa: '',
        status: 'Aktif',
        alamat: '',
        maps: ''
    });

    // Fetch data from Supabase
    const fetchGurus = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('gurus')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            if (data) setGurus(data);
        } catch (error) {
            console.error('Error fetching gurus:', error.message);
            alert('Gagal mengambil data user/guru dari database.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchGurus();
    }, []);

    const handleOpenModal = (guru = null, viewOnly = false) => {
        setIsViewing(viewOnly);
        if (guru) {
            setEditingId(guru.id);
            setFormData({
                email: guru.email || '',
                password: guru.password || '',
                nama: guru.nama || '',
                role: guru.role || 'Guru',
                nowa: guru.nowa || '',
                status: guru.status || 'Aktif',
                alamat: guru.alamat || '',
                maps: guru.maps || ''
            });
        } else {
            setEditingId(null);
            setFormData({
                email: '',
                password: '',
                nama: '',
                role: 'Guru',
                nowa: '',
                status: 'Aktif',
                alamat: '',
                maps: ''
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
                    .from('gurus')
                    .update(formData)
                    .eq('id', editingId);

                if (error) throw error;

                // Update local state for immediate UI reflection
                setGurus(gurus.map(g =>
                    g.id === editingId ? { ...g, ...formData } : g
                ));
            } else {
                // Add new to Supabase
                const newId = 'GURU-' + Math.random().toString(36).substr(2, 6).toUpperCase();
                const newGuruData = { id: newId, ...formData };

                const { error } = await supabase
                    .from('gurus')
                    .insert([newGuruData]);

                if (error) throw error;

                // Add to local state
                setGurus([newGuruData, ...gurus]);
            }
            handleCloseModal();
        } catch (error) {
            console.error('Error saving guru:', error.message);
            alert('Gagal menyimpan data ke database.');
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm("Apakah Anda yakin ingin menghapus user ini?")) {
            try {
                const { error } = await supabase
                    .from('gurus')
                    .delete()
                    .eq('id', id);

                if (error) throw error;

                setGurus(gurus.filter(g => g.id !== id));
            } catch (error) {
                console.error('Error deleting guru:', error.message);
                alert('Gagal menghapus data dari database.');
            }
        }
    };

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">Manajemen User / Guru</h1>
                <p className="text-secondary">Kelola data tutor dan admin bimbingan belajar.</p>
            </div>

            <div className="glass-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                        <Users className="text-primary" size={24} /> Daftar User
                    </h2>
                    <button className="btn btn-primary" onClick={() => handleOpenModal()}>
                        + Tambah User
                    </button>
                </div>

                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.05)' }}>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Nama</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>No WA</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Status</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Alamat</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Maps Rumah</th>
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
                            ) : gurus.length === 0 ? (
                                <tr>
                                    <td colSpan="6" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                        Belum ada data user.
                                    </td>
                                </tr>
                            ) : (
                                gurus.map((g) => (
                                    <tr key={g.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)', transition: 'background-color 0.2s' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(79,70,229,0.02)'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                        <td style={{ padding: '1rem', fontWeight: 500 }}>{g.nama}</td>
                                        <td style={{ padding: '1rem' }}>
                                            {g.nowa ? (
                                                <a
                                                    href={`https://wa.me/${g.nowa.replace(/^0/, '62')}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    style={{ color: '#25D366', display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none', fontWeight: 500 }}
                                                    title={g.nowa}
                                                >
                                                    <MessageCircle size={18} /> Chat
                                                </a>
                                            ) : '-'}
                                        </td>
                                        <td style={{ padding: '1rem' }}>
                                            <span className="badge" style={{ background: g.status === 'Aktif' ? '#d1fae5' : '#fee2e2', color: g.status === 'Aktif' ? '#047857' : '#b91c1c' }}>
                                                {g.status}
                                            </span>
                                        </td>
                                        <td style={{ padding: '1rem', maxWidth: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={g.alamat}>
                                            {g.alamat}
                                        </td>
                                        <td style={{ padding: '1rem' }}>
                                            {g.maps ? (
                                                <a href={g.maps} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}>
                                                    <MapPin size={14} /> Lihat
                                                </a>
                                            ) : '-'}
                                        </td>
                                        <td style={{ padding: '1rem' }}>
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <button
                                                    onClick={() => handleOpenModal(g, true)}
                                                    style={{ color: 'var(--secondary)', background: 'rgba(16,185,129,0.1)', border: 'none', cursor: 'pointer', padding: '0.5rem', borderRadius: '0.375rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                    title="Lihat"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleOpenModal(g)}
                                                    style={{ color: 'var(--primary)', background: 'rgba(79,70,229,0.1)', border: 'none', cursor: 'pointer', padding: '0.5rem', borderRadius: '0.375rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                    title="Edit"
                                                >
                                                    <Edit className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(g.id)}
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
                            <h2 className="text-xl font-bold">{isViewing ? 'Detail Data User' : editingId ? 'Edit Data User' : 'Tambah User Baru'}</h2>
                            <button onClick={handleCloseModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

                            <div style={{ gridColumn: 'span 2', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Nama Lengkap</label>
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
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>No WA</label>
                                    <input
                                        type="tel"
                                        name="nowa"
                                        value={formData.nowa}
                                        onChange={handleInputChange}
                                        style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)' }}
                                        required
                                        disabled={isViewing}
                                    />
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Email</label>
                                <input
                                    type="email"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleInputChange}
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)' }}
                                    required
                                    disabled={isViewing}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Password {isViewing && '(Disembunyikan)'}</label>
                                <input
                                    type={isViewing ? "password" : "text"}
                                    name="password"
                                    value={isViewing ? '********' : formData.password}
                                    onChange={handleInputChange}
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)' }}
                                    required={!editingId}
                                    disabled={isViewing}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Role</label>
                                <select
                                    name="role"
                                    value={formData.role}
                                    onChange={handleInputChange}
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)' }}
                                    required
                                    disabled={isViewing}
                                >
                                    <option value="Guru">Guru</option>
                                    <option value="Admin">Admin</option>
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Status</label>
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

                            <div style={{ gridColumn: 'span 2' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Alamat Lengkap</label>
                                <textarea
                                    name="alamat"
                                    value={formData.alamat}
                                    onChange={handleInputChange}
                                    rows="2"
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontFamily: 'inherit' }}
                                    required
                                    disabled={isViewing}
                                ></textarea>
                            </div>

                            <div style={{ gridColumn: 'span 2' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Link Maps Rumah</label>
                                <input
                                    type="url"
                                    name="maps"
                                    value={formData.maps}
                                    onChange={handleInputChange}
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)' }}
                                    placeholder="https://maps.google.com/..."
                                    disabled={isViewing}
                                />
                            </div>

                            <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
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
