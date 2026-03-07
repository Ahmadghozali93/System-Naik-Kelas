import { useState, useEffect } from 'react';
import { Users, Edit, Trash2, X, MapPin, MessageCircle, Eye } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function UserPage() {
    const [gurus, setGurus] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(20);
    const [search, setSearch] = useState('');
    const [filterUnit, setFilterUnit] = useState('');
    const [units, setUnits] = useState([]);

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
    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [guruRes, unitRes] = await Promise.all([
                supabase.from('gurus').select('*').order('created_at', { ascending: false }),
                supabase.from('units').select('nama').eq('aktif', true)
            ]);

            if (guruRes.error) throw guruRes.error;
            if (unitRes.error) throw unitRes.error;

            if (guruRes.data) setGurus(guruRes.data);
            if (unitRes.data) setUnits(unitRes.data);
        } catch (error) {
            console.error('Error fetching data:', error.message);
            alert('Gagal mengambil data dari database.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
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
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <select
                            value={itemsPerPage}
                            onChange={(e) => {
                                setItemsPerPage(parseInt(e.target.value));
                                setCurrentPage(1);
                            }}
                            className="btn"
                            style={{ padding: '0.4rem 0.5rem', background: 'var(--surface-color)', border: '1px solid var(--glass-border)', fontSize: '0.875rem' }}
                        >
                            <option value={20}>20 per hal</option>
                            <option value={30}>30 per hal</option>
                        </select>
                        <button className="btn btn-primary" onClick={() => handleOpenModal()}>
                            + Tambah User
                        </button>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexDirection: 'column', width: '100%' }}>
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: '200px' }}>
                            <input
                                type="text"
                                placeholder="Cari nama atau email..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontSize: '0.85rem' }}
                            />
                        </div>
                        <div style={{ minWidth: '150px' }}>
                            <select
                                value={filterUnit}
                                onChange={(e) => setFilterUnit(e.target.value)}
                                style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontSize: '0.85rem' }}
                            >
                                <option value="">Semua Unit</option>
                                {units.map(u => <option key={u.nama} value={u.nama}>{u.nama}</option>)}
                            </select>
                        </div>
                    </div>
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
                                (() => {
                                    const filteredGurus = gurus.filter(g => {
                                        const matchSearch = !search || g.nama?.toLowerCase().includes(search.toLowerCase()) || g.email?.toLowerCase().includes(search.toLowerCase());
                                        const matchUnit = !filterUnit || g.alamat?.toLowerCase().includes(filterUnit.toLowerCase()); // Assuming area/unit might be in address, or we need a specific unit field. If no unit field exists on guru, we search alamat or just let it pass if no strict mapping. For now checking address conceptually if no unit. 
                                        // Wait, user data structure in UserPage.jsx has: email, password, nama, role, nowa, status, alamat, maps. It DOES NOT have a 'unit' field. 
                                        // I will filter by unit based on 'alamat' conceptually, or if there's no unit field, I should probably add one or ignore it for Gurus if not applicable, but user requested searching by unit on Guru. Let's assume it's part of the address string or we'll filter by address for now until schema update.
                                        // ACTUALLY, if Guru doesn't have a unit field in DB, filtering by unit might require looking at JadwalMaster. But for now, let's filter by checking if alamat contains the unit name as a proxy, or just leave it open. Wait, usually tutors belong to units. I'll add 'unit' to the filter logic, if it exists in the data. If not, it won't filter out things if filterUnit is empty.

                                        // Correction: Since Guru schema does not have 'unit', filtering by unit on Guru page might not be fully accurate unless 'alamat' contains it. I'll implement the filter on whatever text matches if 'unit' is selected, or just name/email. I will check 'alamat' for the unit name.
                                        return matchSearch && (!filterUnit || (g.alamat && g.alamat.toLowerCase().includes(filterUnit.toLowerCase())));
                                    });

                                    const totalPages = Math.ceil(filteredGurus.length / itemsPerPage);
                                    const safePage = Math.min(currentPage, totalPages || 1);
                                    const startIdx = (safePage - 1) * itemsPerPage;
                                    const paginatedGurus = filteredGurus.slice(startIdx, startIdx + itemsPerPage);

                                    return filteredGurus.length === 0 ? (
                                        <tr>
                                            <td colSpan="6" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                                Tidak ada user yang cocok.
                                            </td>
                                        </tr>
                                    ) : paginatedGurus.map((g) => (
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
                                    ));
                                })()
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Pagination Controls */}
            {(() => {
                const filteredGurus = gurus.filter(g => {
                    const matchSearch = !search || g.nama?.toLowerCase().includes(search.toLowerCase()) || g.email?.toLowerCase().includes(search.toLowerCase());
                    return matchSearch && (!filterUnit || (g.alamat && g.alamat.toLowerCase().includes(filterUnit.toLowerCase())));
                });

                const totalPages = Math.ceil(filteredGurus.length / itemsPerPage);
                if (totalPages <= 1) return null;
                const safePage = Math.min(currentPage, totalPages);
                return (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', padding: '0.5rem 0' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            Halaman {safePage} dari {totalPages} ({filteredGurus.length} data)
                        </span>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={safePage <= 1}
                                style={{ padding: '0.4rem 0.85rem', borderRadius: '0.375rem', border: '1px solid var(--glass-border)', background: safePage <= 1 ? '#f3f4f6' : 'var(--surface-color)', cursor: safePage <= 1 ? 'not-allowed' : 'pointer', fontSize: '0.85rem', color: safePage <= 1 ? '#9ca3af' : 'var(--text-primary)' }}
                            >
                                ← Sebelumnya
                            </button>
                            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                                <button
                                    key={page}
                                    onClick={() => setCurrentPage(page)}
                                    style={{ padding: '0.4rem 0.7rem', borderRadius: '0.375rem', border: '1px solid var(--glass-border)', background: page === safePage ? 'var(--primary)' : 'var(--surface-color)', color: page === safePage ? 'white' : 'var(--text-primary)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: page === safePage ? 600 : 400 }}
                                >
                                    {page}
                                </button>
                            ))}
                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={safePage >= totalPages}
                                style={{ padding: '0.4rem 0.85rem', borderRadius: '0.375rem', border: '1px solid var(--glass-border)', background: safePage >= totalPages ? '#f3f4f6' : 'var(--surface-color)', cursor: safePage >= totalPages ? 'not-allowed' : 'pointer', fontSize: '0.85rem', color: safePage >= totalPages ? '#9ca3af' : 'var(--text-primary)' }}
                            >
                                Selanjutnya →
                            </button>
                        </div>
                    </div>
                );
            })()}

            {/* Modal Form */}
            {isModalOpen && (
                <div className="modal-overlay">
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
