import { useState, useEffect } from 'react';
import { GraduationCap, Edit, Trash2, X, MapPin, MessageCircle, Eye, Instagram, Facebook } from 'lucide-react';
import { supabase } from '../lib/supabase';

// Ikona kustom sederhana untuk TikTok karena tidak ada di lucid default
const TikTokIcon = ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
    </svg>
);

export default function SiswaPage() {
    const [siswas, setSiswas] = useState([]); // Changed from siswaList to siswas
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [isViewing, setIsViewing] = useState(false);
    const [isSaving, setIsSaving] = useState(false); // New state
    const [isLoading, setIsLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1); // New state
    const [itemsPerPage, setItemsPerPage] = useState(20); // New state
    const [search, setSearch] = useState(''); // New state
    const [filterUnit, setFilterUnit] = useState(''); // New state
    const [units, setUnits] = useState([]);
    const [programs, setPrograms] = useState([]);
    const [masterJam, setMasterJam] = useState([]);

    // Form state
    const [formData, setFormData] = useState({
        nama_siswa: '', // Changed from nama
        unit: '',
        status: 'Aktif',
        nowa_wali: '', // Changed from nowa
        alamat: '',
        nama_wali: '', // Changed from nama_ortu
        ig: '',
        fb: '',
        tiktok: '',
        catatan: '',
        booking_program: '',
        booking_jam: ''
    });

    // Fetch data from Supabase
    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [siswaRes, unitRes, progRes, jamRes] = await Promise.all([
                supabase.from('siswa').select('*').order('created_at', { ascending: false }),
                supabase.from('units').select('nama, aktif').eq('aktif', true),
                supabase.from('programs').select('id, nama').eq('status', 'Aktif'),
                supabase.from('master_jam').select('*').order('waktu', { ascending: true })
            ]);

            if (siswaRes.error) throw siswaRes.error;
            if (unitRes.error) throw unitRes.error;
            if (progRes.error) throw progRes.error;
            if (jamRes.error) throw jamRes.error;

            if (siswaRes.data) setSiswas(siswaRes.data);
            if (unitRes.data) {
                setUnits(unitRes.data);
                if (unitRes.data.length > 0 && !formData.unit) {
                    setFormData(prev => ({ ...prev, unit: unitRes.data[0].nama }));
                }
            }
            setPrograms(progRes.data || []);
            setMasterJam(jamRes.data || []);
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

    const handleOpenModal = (siswa = null, viewOnly = false) => {
        setIsViewing(viewOnly);
        if (siswa) {
            setEditingId(siswa.id);
            setFormData({
                nama_siswa: siswa.nama_siswa || '', // Changed from nama
                unit: siswa.unit || (units.length > 0 ? units[0].nama : ''),
                status: siswa.status || 'Aktif',
                nowa_wali: siswa.nowa_wali || '', // Changed from nowa
                alamat: siswa.alamat || '',
                nama_wali: siswa.nama_wali || '', // Changed from nama_ortu
                ig: siswa.ig || '',
                fb: siswa.fb || '',
                tiktok: siswa.tiktok || '',
                catatan: siswa.catatan || '',
                booking_program: siswa.booking_program || '',
                booking_jam: siswa.booking_jam || ''
            });
        } else {
            setEditingId(null);
            setFormData({
                nama_siswa: '', // Changed from nama
                unit: units.length > 0 ? units[0].nama : '',
                status: 'Aktif',
                nowa_wali: '', // Changed from nowa
                alamat: '',
                nama_wali: '', // Changed from nama_ortu
                ig: '',
                fb: '',
                tiktok: '',
                catatan: '',
                booking_program: '',
                booking_jam: ''
            });
        }
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingId(null);
        setIsViewing(false);
        setIsSaving(false); // Reset saving state
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        if (name === 'status' && value !== 'Booking') {
            setFormData(prev => ({ ...prev, [name]: value, booking_program: '', booking_jam: '' }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSaving(true); // Set saving state

        try {
            if (editingId) {
                // Edit existing in Supabase
                const { error } = await supabase
                    .from('siswa') // Changed from siswa
                    .update(formData)
                    .eq('id', editingId);

                if (error) throw error;

                // Update local state
                setSiswas(siswas.map(s => // Changed from siswaList
                    s.id === editingId ? { ...s, ...formData } : s
                ));
            } else {
                // Add new to Supabase
                const newId = 'SISWA-' + Math.random().toString(36).substr(2, 6).toUpperCase();
                const today = new Date().toISOString().split('T')[0];
                const newSiswaData = { id: newId, dibuat_pada: today, ...formData };

                const { error } = await supabase
                    .from('siswa') // Changed from siswa
                    .insert([newSiswaData]);

                if (error) throw error;

                // Add to local state
                setSiswas([newSiswaData, ...siswas]); // Changed from siswaList
            }
            handleCloseModal();
        } catch (error) {
            console.error('Error saving siswa:', error.message);
            alert('Gagal menyimpan data siswa ke database.');
        } finally {
            setIsSaving(false); // Reset saving state
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm("Apakah Anda yakin ingin menghapus data siswa ini?")) {
            try {
                const { error } = await supabase
                    .from('siswa') // Changed from siswa
                    .delete()
                    .eq('id', id);

                if (error) {
                    if (error.code === '23503') {
                        alert('Tidak bisa menghapus siswa ini karena masih terdaftar di Aktivasi Jadwal. Silakan hapus data aktivasinya lebih dulu.');
                        return;
                    }
                    throw error;
                }

                setSiswas(siswas.filter(s => s.id !== id)); // Changed from siswaList
            } catch (error) {
                console.error('Error deleting siswa:', error.message);
                alert('Gagal menghapus data siswa dari database.');
            }
        }
    };

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">Manajemen Siswa</h1>
                <p className="text-secondary">Kelola data murid bimbingan belajar.</p>
            </div>

            <div className="glass-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                        <GraduationCap className="text-primary" size={24} /> Daftar Siswa
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
                            + Tambah Siswa
                        </button>
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexDirection: 'column', width: '100%' }}>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '200px' }}>
                        <input
                            type="text"
                            placeholder="Cari nama, wali, atau program..."
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
                            {/* ID disembunyikan di tabel utama spt user */}
                            <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Nama Siswa</th>
                            <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Nama Wali</th>
                            <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>No WA Wali</th>
                            <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Unit</th>
                            <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Program</th>
                            <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Status</th>
                            <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Aksi</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <tr>
                                <td colSpan="7" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                    Memuat data...
                                </td>
                            </tr>
                        ) : (
                            (() => {
                                const filteredSiswas = siswas.filter(s => {
                                    const searchLower = search.toLowerCase();
                                    const matchSearch = !search ||
                                        s.nama_siswa?.toLowerCase().includes(searchLower) ||
                                        s.nama_wali?.toLowerCase().includes(searchLower) ||
                                        s.program?.toLowerCase().includes(searchLower);
                                    const matchUnit = !filterUnit || s.unit === filterUnit;
                                    return matchSearch && matchUnit;
                                });

                                const totalPages = Math.ceil(filteredSiswas.length / itemsPerPage);
                                const safePage = Math.min(currentPage, totalPages || 1);
                                const startIdx = (safePage - 1) * itemsPerPage;
                                const paginatedSiswas = filteredSiswas.slice(startIdx, startIdx + itemsPerPage);

                                return filteredSiswas.length === 0 ? (
                                    <tr>
                                        <td colSpan="7" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                            Tidak ada siswa yang cocok.
                                        </td>
                                    </tr>
                                ) : paginatedSiswas.map((s) => (
                                    <tr key={s.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)', transition: 'background-color 0.2s' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(79,70,229,0.02)'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                        <td style={{ padding: '1rem', fontWeight: 500 }}>{s.nama_siswa}</td>
                                        <td style={{ padding: '1rem' }}>{s.nama_wali}</td>
                                        <td style={{ padding: '1rem' }}>
                                            {s.nowa_wali ? (
                                                <a
                                                    href={`https://wa.me/${s.nowa_wali.replace(/^0/, '62')}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    style={{ color: '#25D366', display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none', fontWeight: 500 }}
                                                    title={s.nowa_wali}
                                                >
                                                    <MessageCircle size={18} /> Chat
                                                </a>
                                            ) : '-'}
                                        </td>
                                        <td style={{ padding: '1rem' }}>
                                            <span className="badge" style={{ background: '#f3f4f6', color: '#4b5563' }}>
                                                {s.unit}
                                            </span>
                                        </td>
                                        <td style={{ padding: '1rem' }}>{s.booking_program || '-'}</td>
                                        <td style={{ padding: '1rem' }}>
                                            <span className="badge" style={{ background: s.status === 'Aktif' ? '#d1fae5' : '#fee2e2', color: s.status === 'Aktif' ? '#047857' : '#b91c1c' }}>
                                                {s.status}
                                            </span>
                                        </td>
                                        <td style={{ padding: '1rem' }}>
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <button
                                                    onClick={() => handleOpenModal(s, true)}
                                                    style={{ color: 'var(--secondary)', background: 'rgba(16,185,129,0.1)', border: 'none', cursor: 'pointer', padding: '0.5rem', borderRadius: '0.375rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                    title="Lihat Detail"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleOpenModal(s)}
                                                    style={{ color: 'var(--primary)', background: 'rgba(79,70,229,0.1)', border: 'none', cursor: 'pointer', padding: '0.5rem', borderRadius: '0.375rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                    title="Edit"
                                                >
                                                    <Edit className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(s.id)}
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

            {/* Pagination Controls */}
            {(() => {
                const filteredSiswas = siswas.filter(s => {
                    const searchLower = search.toLowerCase();
                    const matchSearch = !search ||
                        s.nama_siswa?.toLowerCase().includes(searchLower) ||
                        s.nama_wali?.toLowerCase().includes(searchLower) ||
                        s.program?.toLowerCase().includes(searchLower);
                    const matchUnit = !filterUnit || s.unit === filterUnit;
                    return matchSearch && matchUnit;
                });

                const totalPages = Math.ceil(filteredSiswas.length / itemsPerPage);
                if (totalPages <= 1) return null;
                const safePage = Math.min(currentPage, totalPages);
                return (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', padding: '0.5rem 0' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            Halaman {safePage} dari {totalPages} ({filteredSiswas.length} data)
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
                <div className="modal-overlay" style={{ overflowY: 'auto', padding: '2rem 0' }}>
                    <div className="modal-content" style={{ maxWidth: '700px', margin: 'auto' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h2 className="text-xl font-bold">{isViewing ? 'Detail Data Siswa' : editingId ? 'Edit Data Siswa' : 'Tambah Siswa Baru'}</h2>
                            <button onClick={handleCloseModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                                <X className="w-5 h-5" />
                            </button>
                        </div>



                        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

                            {/* Info Dasar */}
                            <div style={{ gridColumn: 'span 2' }}>
                                <h3 className="font-semibold text-lg border-b pb-2 mb-2">Informasi Dasar</h3>
                            </div>

                            {isViewing && editingId && (
                                <div style={{ gridColumn: 'span 2' }}>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>ID Siswa</label>
                                    <input type="text" value={editingId} disabled style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)' }} />
                                </div>
                            )}

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Nama Lengkap Siswa</label>
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
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Nama Orang Tua/Wali</label>
                                <input
                                    type="text"
                                    name="nama_ortu"
                                    value={formData.nama_ortu}
                                    onChange={handleInputChange}
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)' }}
                                    required
                                    disabled={isViewing}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Unit / Cabang</label>
                                <select
                                    name="unit"
                                    value={formData.unit}
                                    onChange={handleInputChange}
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)' }}
                                    required
                                    disabled={isViewing}
                                >
                                    {units.length > 0 ? (
                                        units.map(u => (
                                            <option key={u.nama} value={u.nama}>{u.nama}</option>
                                        ))
                                    ) : (
                                        <option value="">-- Tidak ada unit aktif --</option>
                                    )}
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
                                    <option value="Non aktif">Non aktif</option>
                                    <option value="Lulus">Lulus</option>
                                    <option value="Booking">Booking</option>
                                </select>
                            </div>

                            {/* Booking-specific fields */}
                            {formData.status === 'Booking' && (
                                <>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Program (Booking)</label>
                                        <select
                                            name="booking_program"
                                            value={formData.booking_program}
                                            onChange={handleInputChange}
                                            style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)' }}
                                            disabled={isViewing}
                                        >
                                            <option value="">-- Pilih Program --</option>
                                            {programs.map(p => (
                                                <option key={p.id} value={p.nama}>{p.nama}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Jam (Booking)</label>
                                        <select
                                            name="booking_jam"
                                            value={formData.booking_jam}
                                            onChange={handleInputChange}
                                            style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)' }}
                                            disabled={isViewing}
                                        >
                                            <option value="">-- Pilih Jam --</option>
                                            {masterJam.map(m => (
                                                <option key={m.id} value={m.waktu}>{m.waktu}</option>
                                            ))}
                                        </select>
                                    </div>
                                </>
                            )}

                            {/* Kontak & Alamat */}
                            <div style={{ gridColumn: 'span 2', marginTop: '1rem' }}>
                                <h3 className="font-semibold text-lg border-b pb-2 mb-2">Kontak & Alamat</h3>
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>No. WhatsApp</label>
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

                            {/* Sosial Media */}
                            <div style={{ gridColumn: 'span 2', marginTop: '1rem' }}>
                                <h3 className="font-semibold text-lg border-b pb-2 mb-2">Sosial Media</h3>
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Instagram Username</label>
                                <input
                                    type="text"
                                    name="ig"
                                    value={formData.ig}
                                    onChange={handleInputChange}
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)' }}
                                    placeholder="@..."
                                    disabled={isViewing}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Facebook</label>
                                <input
                                    type="text"
                                    name="fb"
                                    value={formData.fb}
                                    onChange={handleInputChange}
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)' }}
                                    placeholder="Nama FB..."
                                    disabled={isViewing}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>TikTok Username</label>
                                <input
                                    type="text"
                                    name="tiktok"
                                    value={formData.tiktok}
                                    onChange={handleInputChange}
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)' }}
                                    placeholder="@..."
                                    disabled={isViewing}
                                />
                            </div>

                            {/* Lain-lain */}
                            <div style={{ gridColumn: 'span 2', marginTop: '1rem' }}>
                                <h3 className="font-semibold text-lg border-b pb-2 mb-2">Lain-lain</h3>
                            </div>

                            <div style={{ gridColumn: 'span 2' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Catatan</label>
                                <textarea
                                    name="catatan"
                                    value={formData.catatan}
                                    onChange={handleInputChange}
                                    rows="3"
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontFamily: 'inherit' }}
                                    placeholder="Catatan khusus terkait siswa (Opsional)"
                                    disabled={isViewing}
                                ></textarea>
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
