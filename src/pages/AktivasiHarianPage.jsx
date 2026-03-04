import { useState, useEffect } from 'react';
import { CalendarDays, Edit, Trash2, X, Plus, GraduationCap, Eye, EyeOff, ChevronDown, ChevronRight, Clock, MapPin, BookOpen, User, Search, Filter } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function AktivasiHarianPage() {
    const [aktivasis, setAktivasis] = useState([]);
    const [siswas, setSiswas] = useState([]);
    const [jadwals, setJadwals] = useState([]);
    const [masterJam, setMasterJam] = useState([]);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [showSelesai, setShowSelesai] = useState(false);
    const [expandedId, setExpandedId] = useState(null);

    // Search & Filters
    const [search, setSearch] = useState('');
    const [filterUnit, setFilterUnit] = useState('');
    const [filterProgram, setFilterProgram] = useState('');
    const [filterGuru, setFilterGuru] = useState('');
    const [filterStatus, setFilterStatus] = useState('');

    const [formData, setFormData] = useState({
        siswa_id: '',
        jadwal_id: '',
        pertemuan: [{ tanggal: '', jam: '' }],
        spp: 0,
        catatan: '',
        status: 'Aktif'
    });

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [aktivasiRes, siswaRes, jadwalRes, jamRes] = await Promise.all([
                supabase.from('aktivasi_siswa').select('*').order('created_at', { ascending: false }),
                supabase.from('siswa').select('id, nama, unit').eq('status', 'Aktif'),
                supabase.from('jadwal_master').select('*').eq('jenis_program', 'Harian'),
                supabase.from('master_jam').select('*').order('waktu', { ascending: true })
            ]);

            if (aktivasiRes.error) throw aktivasiRes.error;
            if (siswaRes.error) throw siswaRes.error;
            if (jadwalRes.error) throw jadwalRes.error;
            if (jamRes.error) throw jamRes.error;

            setAktivasis(aktivasiRes.data || []);
            setSiswas(siswaRes.data || []);
            setJadwals(jadwalRes.data || []);
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

    const handleOpenModal = (aktivasi = null) => {
        if (aktivasi) {
            setEditingId(aktivasi.id);
            setFormData({
                siswa_id: aktivasi.siswa_id || '',
                jadwal_id: aktivasi.jadwal_id || '',
                pertemuan: [{ tanggal: aktivasi.tgl_mulai || '', jam: aktivasi.detail_jadwal?.jam_pertemuan || '' }],
                spp: aktivasi.spp || 0,
                catatan: aktivasi.catatan || '',
                status: aktivasi.status || 'Aktif'
            });
        } else {
            setEditingId(null);
            const today = new Date().toISOString().split('T')[0];
            setFormData({
                siswa_id: '',
                jadwal_id: '',
                pertemuan: [{ tanggal: today, jam: '' }],
                spp: 0,
                catatan: '',
                status: 'Aktif'
            });
        }
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingId(null);
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const selectedSiswa = siswas.find(s => s.id === formData.siswa_id);
            const selectedJadwal = jadwals.find(j => j.id === formData.jadwal_id);

            if (!selectedSiswa || !selectedJadwal) {
                alert('Silakan pilih Siswa dan Jadwal.');
                return;
            }

            // Validate pertemuan entries
            const validPertemuan = formData.pertemuan.filter(p => p.tanggal && p.jam);
            if (validPertemuan.length === 0) {
                alert('Silakan isi minimal 1 tanggal dan jam pertemuan.');
                return;
            }

            if (editingId) {
                // For edit mode, update the single record
                const p = validPertemuan[0];
                const detailJadwal = {
                    guru_id: selectedJadwal.guru_id,
                    nama_guru: selectedJadwal.nama_guru,
                    program_id: selectedJadwal.program_id,
                    nama_program: selectedJadwal.nama_program,
                    jenis_program: selectedJadwal.jenis_program,
                    hari: selectedJadwal.hari,
                    jam: selectedJadwal.jam,
                    jam_pertemuan: p.jam,
                    unit: selectedJadwal.unit
                };

                const payload = {
                    siswa_id: selectedSiswa.id,
                    nama_siswa: selectedSiswa.nama,
                    jadwal_id: selectedJadwal.id,
                    detail_jadwal: detailJadwal,
                    tgl_mulai: p.tanggal,
                    spp: parseFloat(formData.spp) || 0,
                    catatan: formData.catatan,
                    status: formData.status
                };

                const { error } = await supabase
                    .from('aktivasi_siswa')
                    .update(payload)
                    .eq('id', editingId);

                if (error) throw error;
            } else {
                // For new mode, create one record per pertemuan entry
                const indukId = 'IND-' + Math.random().toString(36).substr(2, 6).toUpperCase();
                const payloads = validPertemuan.map(p => {
                    const detailJadwal = {
                        guru_id: selectedJadwal.guru_id,
                        nama_guru: selectedJadwal.nama_guru,
                        program_id: selectedJadwal.program_id,
                        nama_program: selectedJadwal.nama_program,
                        jenis_program: selectedJadwal.jenis_program,
                        hari: selectedJadwal.hari,
                        jam: selectedJadwal.jam,
                        jam_pertemuan: p.jam,
                        unit: selectedJadwal.unit
                    };

                    return {
                        assign_id: 'ACT-' + Math.random().toString(36).substr(2, 6).toUpperCase(),
                        assign_id_induk: indukId,
                        siswa_id: selectedSiswa.id,
                        nama_siswa: selectedSiswa.nama,
                        jadwal_id: selectedJadwal.id,
                        detail_jadwal: detailJadwal,
                        tgl_mulai: p.tanggal,
                        spp: parseFloat(formData.spp) || 0,
                        catatan: formData.catatan,
                        status: formData.status
                    };
                });

                const { error } = await supabase
                    .from('aktivasi_siswa')
                    .insert(payloads);

                if (error) throw error;
            }
            fetchData();
            handleCloseModal();
        } catch (error) {
            console.error('Error saving aktivasi:', error.message);
            alert('Gagal menyimpan aktivasi ke database.');
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm("Apakah Anda yakin ingin membatalkan/menghapus aktivasi ini?")) {
            try {
                const { error } = await supabase
                    .from('aktivasi_siswa')
                    .delete()
                    .eq('id', id);

                if (error) throw error;
                setAktivasis(aktivasis.filter(a => a.id !== id));
            } catch (error) {
                console.error('Error deleting aktivasi:', error.message);
                alert('Gagal menghapus data dari database.');
            }
        }
    };

    const handleToggleSelesai = async (id, currentValue) => {
        try {
            const newValue = !currentValue;
            const { error } = await supabase
                .from('aktivasi_siswa')
                .update({ selesai: newValue })
                .eq('id', id);
            if (error) throw error;
            setAktivasis(aktivasis.map(a => a.id === id ? { ...a, selesai: newValue } : a));
        } catch (error) {
            console.error('Error toggling selesai:', error.message);
            alert('Gagal mengubah status selesai.');
        }
    };

    // Helper formatter
    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0
        }).format(amount);
    };

    const getStatusStyle = (status) => {
        switch (status) {
            case 'Aktif': return { bg: '#d1fae5', text: '#047857' };
            case 'Lulus': return { bg: '#dbeafe', text: '#1e40af' };
            case 'Keluar': return { bg: '#fee2e2', text: '#b91c1c' };
            case 'Cancel': return { bg: '#f3f4f6', text: '#374151' };
            default: return { bg: '#f3f4f6', text: '#374151' };
        }
    };

    const getHariFromDate = (dateStr) => {
        if (!dateStr) return '-';
        const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? '-' : days[d.getDay()];
    };

    const formatTanggal = (dateStr) => {
        if (!dateStr) return '-';
        const parts = dateStr.split('-');
        if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
        return dateStr;
    };

    const getSisaKuota = (jadwalId, currentKuota) => {
        let activeCount = aktivasis.filter(a => a.jadwal_id === jadwalId && a.status === 'Aktif' && a.id !== editingId).length;
        return (currentKuota || 0) - activeCount;
    };

    // Derived state for filtering
    const selectedSiswaObj = siswas.find(s => s.id === formData.siswa_id);
    const filteredJadwals = selectedSiswaObj
        ? jadwals.filter(j => {
            const isSameUnit = j.unit === selectedSiswaObj.unit;
            const sisaKuota = getSisaKuota(j.id, j.kuota);
            const isCurrentJadwal = (formData.jadwal_id === j.id && editingId);
            return isSameUnit && (sisaKuota > 0 || isCurrentJadwal);
        })
        : [];

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">Aktivasi Jadwal Harian</h1>
                <p className="text-secondary">Pendaftaran dan penempatan siswa untuk sesi harian/singkat.</p>
            </div>

            <div className="glass-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                        <GraduationCap className="text-primary" size={24} /> Data Aktivasi
                    </h2>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                            className="btn"
                            onClick={() => setShowSelesai(!showSelesai)}
                            style={{ background: showSelesai ? 'rgba(16,185,129,0.15)' : 'rgba(0,0,0,0.05)', color: showSelesai ? '#047857' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                        >
                            {showSelesai ? <EyeOff size={16} /> : <Eye size={16} />}
                            {showSelesai ? 'Sembunyikan Selesai' : 'Tampilkan Selesai'}
                        </button>
                        <button className="btn btn-primary" onClick={() => handleOpenModal()}>
                            <Plus size={18} /> Aktivasi Baru
                        </button>
                    </div>
                </div>

                {/* Search & Filters */}
                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexDirection: 'column', width: '100%' }}>
                    <div style={{ position: 'relative', width: '100%' }}>
                        <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                        <input
                            type="text"
                            placeholder="Cari siswa / guru / program..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            style={{ width: '100%', padding: '0.5rem 0.5rem 0.5rem 2.25rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontSize: '0.85rem' }}
                        />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.5rem', width: '100%' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', gridColumn: '1 / -1', marginBottom: '-0.25rem' }}>
                            <Filter size={14} style={{ color: 'var(--text-secondary)' }} />
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Filter:</span>
                        </div>
                        <select value={filterUnit} onChange={(e) => setFilterUnit(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontSize: '0.85rem' }}>
                            <option value="">Semua Unit</option>
                            {[...new Set(aktivasis.filter(a => a.detail_jadwal?.jenis_program === 'Harian').map(a => a.detail_jadwal?.unit).filter(Boolean))].map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                        <select value={filterProgram} onChange={(e) => setFilterProgram(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontSize: '0.85rem' }}>
                            <option value="">Semua Program</option>
                            {[...new Set(aktivasis.filter(a => a.detail_jadwal?.jenis_program === 'Harian').map(a => a.detail_jadwal?.nama_program).filter(Boolean))].map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                        <select value={filterGuru} onChange={(e) => setFilterGuru(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontSize: '0.85rem' }}>
                            <option value="">Semua Guru</option>
                            {[...new Set(aktivasis.filter(a => a.detail_jadwal?.jenis_program === 'Harian').map(a => a.detail_jadwal?.nama_guru).filter(Boolean))].map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontSize: '0.85rem' }}>
                            <option value="">Semua Status</option>
                            <option value="Aktif">Aktif</option>
                            <option value="Lulus">Lulus</option>
                            <option value="Keluar">Keluar</option>
                            <option value="Cancel">Cancel</option>
                        </select>
                    </div>
                </div>

                {/* Toggle List View — grouped by assign_id_induk */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {isLoading ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Memuat data aktivasi...</div>
                    ) : (() => {
                        const harianList = aktivasis
                            .filter(a => a.detail_jadwal?.jenis_program === 'Harian')
                            .filter(a => showSelesai || !a.selesai)
                            .filter(a => {
                                const dj = a.detail_jadwal || {};
                                if (search) {
                                    const s = search.toLowerCase();
                                    const matchSiswa = a.nama_siswa?.toLowerCase().includes(s);
                                    const matchGuru = dj.nama_guru?.toLowerCase().includes(s);
                                    const matchProgram = dj.nama_program?.toLowerCase().includes(s);
                                    if (!matchSiswa && !matchGuru && !matchProgram) return false;
                                }
                                if (filterUnit && dj.unit !== filterUnit) return false;
                                if (filterProgram && dj.nama_program !== filterProgram) return false;
                                if (filterGuru && dj.nama_guru !== filterGuru) return false;
                                if (filterStatus && a.status !== filterStatus) return false;
                                return true;
                            });
                        if (harianList.length === 0) {
                            return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Belum ada data aktivasi siswa harian.</div>;
                        }

                        // Group by assign_id_induk (fallback to individual id)
                        const groups = {};
                        harianList.forEach(a => {
                            const key = a.assign_id_induk || a.id;
                            if (!groups[key]) groups[key] = [];
                            groups[key].push(a);
                        });

                        return Object.entries(groups).map(([indukId, entries]) => {
                            const first = entries[0];
                            const dj = first.detail_jadwal || {};
                            const isExpanded = expandedId === indukId;
                            const totalSpp = entries.reduce((sum, e) => sum + (e.spp || 0), 0);
                            const allSelesai = entries.every(e => e.selesai);

                            return (
                                <div key={indukId} style={{
                                    border: '1px solid ' + (isExpanded ? 'var(--primary)' : 'var(--glass-border)'),
                                    borderRadius: '0.75rem',
                                    overflow: 'hidden',
                                    transition: 'all 0.2s',
                                    background: isExpanded ? 'rgba(79,70,229,0.02)' : 'transparent'
                                }}>
                                    {/* Header Row — clickable */}
                                    <div
                                        onClick={() => setExpandedId(isExpanded ? null : indukId)}
                                        style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            padding: '0.85rem 1.15rem', cursor: 'pointer',
                                            borderBottom: isExpanded ? '1px solid var(--glass-border)' : 'none',
                                            gap: '0.5rem'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flex: 1 }}>
                                            {isExpanded
                                                ? <ChevronDown size={18} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                                                : <ChevronRight size={18} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                                            }
                                            <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{first.nama_siswa}</div>
                                            <div style={{ color: 'var(--primary)', fontWeight: 500, fontSize: '0.85rem' }}>{dj.nama_program || '-'}</div>
                                            <div style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)' }}>{formatCurrency(totalSpp)}</div>
                                            <span className="badge" style={{ background: getStatusStyle(first.status).bg, color: getStatusStyle(first.status).text, fontSize: '0.7rem' }}>
                                                {first.status}
                                            </span>
                                            {allSelesai && (
                                                <span className="badge" style={{ background: '#d1fae5', color: '#047857', fontSize: '0.7rem' }}>✓ Selesai</span>
                                            )}
                                            {entries.length > 1 && (
                                                <span style={{ fontSize: '0.7rem', background: 'rgba(79,70,229,0.1)', color: 'var(--primary)', padding: '0.15rem 0.45rem', borderRadius: '0.5rem', fontWeight: 600 }}>
                                                    {entries.length} jadwal
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--primary)', flexShrink: 0, fontWeight: 600 }}>
                                            {first.assign_id_induk || first.assign_id}
                                        </div>
                                    </div>

                                    {/* Expanded: list all jadwal entries */}
                                    {isExpanded && entries.map((a, idx) => {
                                        const adjDj = a.detail_jadwal || {};
                                        return (
                                            <div key={a.id} style={{
                                                display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '1rem',
                                                padding: '0.65rem 1.15rem 0.65rem 2.75rem',
                                                borderBottom: idx < entries.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none',
                                                background: a.selesai ? 'rgba(16,185,129,0.03)' : 'transparent'
                                            }}>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 500, minWidth: '75px' }}>{a.assign_id}</div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                    <CalendarDays size={13} style={{ color: '#f59e0b' }} />
                                                    <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{getHariFromDate(a.tgl_mulai)}</span>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                    <CalendarDays size={13} style={{ color: '#10b981' }} />
                                                    <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{formatTanggal(a.tgl_mulai)}</span>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                    <Clock size={13} style={{ color: '#8b5cf6' }} />
                                                    <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{adjDj.jam_pertemuan || adjDj.jam || '-'}</span>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                    <User size={13} style={{ color: '#0891b2' }} />
                                                    <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{adjDj.nama_guru || '-'}</span>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                    <MapPin size={13} style={{ color: '#ef4444' }} />
                                                    <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{adjDj.unit || '-'}</span>
                                                </div>

                                                {/* Actions per entry */}
                                                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginLeft: 'auto' }}>
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                                        <span style={{ position: 'relative', display: 'inline-block', width: '34px', height: '18px' }}>
                                                            <input type="checkbox" checked={!!a.selesai} onChange={() => handleToggleSelesai(a.id, a.selesai)} style={{ opacity: 0, width: 0, height: 0 }} />
                                                            <span style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: a.selesai ? '#10b981' : '#d1d5db', borderRadius: '9999px', transition: 'all 0.3s' }} />
                                                            <span style={{ position: 'absolute', top: '2px', left: a.selesai ? '17px' : '2px', width: '14px', height: '14px', background: 'white', borderRadius: '50%', transition: 'all 0.3s', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }} />
                                                        </span>
                                                    </label>
                                                    <button onClick={(e) => { e.stopPropagation(); handleOpenModal(a); }} style={{ color: 'var(--primary)', background: 'rgba(79,70,229,0.1)', border: 'none', cursor: 'pointer', padding: '0.35rem', borderRadius: '0.3rem', display: 'flex' }} title="Edit">
                                                        <Edit size={14} />
                                                    </button>
                                                    <button onClick={(e) => { e.stopPropagation(); handleDelete(a.id); }} style={{ color: '#ef4444', background: 'rgba(239,68,68,0.1)', border: 'none', cursor: 'pointer', padding: '0.35rem', borderRadius: '0.3rem', display: 'flex' }} title="Hapus">
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        });
                    })()}
                </div>
            </div>

            {/* Modal Form */}
            {isModalOpen && (
                <div className="modal-overlay" onClick={handleCloseModal} style={{ overflowY: 'auto', padding: '2rem 0' }}>
                    <div className="modal-content" style={{ maxWidth: '700px', margin: 'auto' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h2 className="text-xl font-bold">{editingId ? 'Edit Aktivasi Jadwal Harian' : 'Aktivasi Harian Baru'}</h2>
                            <button onClick={handleCloseModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

                            <div style={{ gridColumn: 'span 2' }}>
                                <h3 className="font-semibold text-lg border-b pb-2 mb-2">Penempatan Jadwal</h3>
                            </div>

                            <div style={{ gridColumn: 'span 2' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Pilih Siswa</label>
                                <select
                                    name="siswa_id"
                                    value={formData.siswa_id}
                                    onChange={handleInputChange}
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)' }}
                                    required
                                >
                                    <option value="" disabled>-- Cari/Pilih Siswa Aktif --</option>
                                    {siswas.map(s => (
                                        <option key={s.id} value={s.id}>{s.nama}</option>
                                    ))}
                                </select>
                            </div>

                            <div style={{ gridColumn: 'span 2' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Unit Siswa Terpilih</label>
                                <input
                                    type="text"
                                    value={selectedSiswaObj ? selectedSiswaObj.unit : '-'}
                                    disabled
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: '#f3f4f6', color: '#6b7280' }}
                                />
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>*Jadwal yang tampil di bawah hanya untuk unit ini.</p>
                            </div>

                            <div style={{ gridColumn: 'span 2' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Pilih Jadwal Master</label>
                                <select
                                    name="jadwal_id"
                                    value={formData.jadwal_id}
                                    onChange={handleInputChange}
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)' }}
                                    required
                                    disabled={!formData.siswa_id}
                                >
                                    <option value="" disabled>-- Pilih Jadwal Tersedia --</option>
                                    {filteredJadwals.map(j => {
                                        const sisa = getSisaKuota(j.id, j.kuota);
                                        return (
                                            <option key={j.id} value={j.id}>
                                                {j.nama_program} - {j.nama_guru} ({j.hari} : {j.jam}) - Sisa Kuota: {sisa}
                                            </option>
                                        );
                                    })}
                                </select>
                                {formData.siswa_id && filteredJadwals.length === 0 && (
                                    <p style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.25rem' }}>Tidak ada jadwal tersedia untuk unit siswa ini.</p>
                                )}
                            </div>

                            <div style={{ gridColumn: 'span 2', marginTop: '1rem' }}>
                                <h3 className="font-semibold text-lg border-b pb-2 mb-2">Administrasi</h3>
                            </div>

                            <div style={{ gridColumn: 'span 2' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                    <label style={{ fontWeight: 500 }}>Tanggal & Jam Pertemuan</label>
                                    {!editingId && formData.pertemuan.length < 15 && (
                                        <button type="button" className="btn" style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem', background: 'rgba(79, 70, 229, 0.1)', color: 'var(--primary)' }}
                                            onClick={() => setFormData(prev => ({ ...prev, pertemuan: [...prev.pertemuan, { tanggal: '', jam: '' }] }))}
                                        >
                                            + Tambah Tanggal
                                        </button>
                                    )}
                                </div>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Maks. 15 pertemuan. {editingId ? '(Mode edit: 1 tanggal)' : `(${formData.pertemuan.length}/15)`}</p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '300px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                                    {formData.pertemuan.map((p, idx) => (
                                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', minWidth: '1.5rem' }}>{idx + 1}.</span>
                                            <input
                                                type="date"
                                                value={p.tanggal}
                                                onChange={(e) => {
                                                    const updated = [...formData.pertemuan];
                                                    updated[idx] = { ...updated[idx], tanggal: e.target.value };
                                                    setFormData(prev => ({ ...prev, pertemuan: updated }));
                                                }}
                                                style={{ fontFamily: 'inherit', flex: 1, padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontSize: '0.85rem' }}
                                                required
                                            />
                                            <select
                                                value={p.jam}
                                                onChange={(e) => {
                                                    const updated = [...formData.pertemuan];
                                                    updated[idx] = { ...updated[idx], jam: e.target.value };
                                                    setFormData(prev => ({ ...prev, pertemuan: updated }));
                                                }}
                                                style={{ fontFamily: 'inherit', flex: 1, padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontSize: '0.85rem' }}
                                                required
                                            >
                                                <option value="" disabled>-- Jam --</option>
                                                {masterJam.map(m => (
                                                    <option key={m.id} value={m.waktu}>{m.waktu}</option>
                                                ))}
                                            </select>
                                            {formData.pertemuan.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const updated = formData.pertemuan.filter((_, i) => i !== idx);
                                                        setFormData(prev => ({ ...prev, pertemuan: updated }));
                                                    }}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '1rem', padding: '0.25rem' }}
                                                    title="Hapus baris"
                                                >
                                                    ✕
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Nominal SPP (Rp)</label>
                                <input
                                    type="number"
                                    name="spp"
                                    value={formData.spp}
                                    onChange={handleInputChange}
                                    min="0"
                                    onKeyDown={(e) => {
                                        if (['e', 'E', '+', '-', '.'].includes(e.key)) {
                                            e.preventDefault();
                                        }
                                    }}
                                    style={{ fontFamily: 'inherit', width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)' }}
                                    required
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Status Aktivasi</label>
                                <select
                                    name="status"
                                    value={formData.status}
                                    onChange={handleInputChange}
                                    style={{ fontFamily: 'inherit', width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)' }}
                                    required
                                >
                                    <option value="Aktif">Aktif</option>
                                    <option value="Lulus">Lulus</option>
                                    <option value="Keluar">Keluar</option>
                                    <option value="Cancel">Cancel</option>
                                </select>
                            </div>

                            <div style={{ gridColumn: 'span 2' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Catatan</label>
                                <textarea
                                    name="catatan"
                                    value={formData.catatan}
                                    onChange={handleInputChange}
                                    rows="2"
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontFamily: 'inherit' }}
                                    placeholder="Catatan tambahan..."
                                />
                            </div>

                            <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                                <button type="button" className="btn" style={{ background: '#f3f4f6' }} onClick={handleCloseModal}>Batal</button>
                                <button type="submit" className="btn btn-primary">
                                    {editingId ? 'Simpan Perubahan' : 'Aktifkan Siswa'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
