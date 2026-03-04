import { useState, useEffect, useRef } from 'react';
import { RefreshCw, Plus, X, Search, Filter, Trash2, CalendarX2, Eye, EyeOff, Send } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function ReschedulePage() {
    const [reschedules, setReschedules] = useState([]);
    const [aktivasis, setAktivasis] = useState([]);
    const [jadwals, setJadwals] = useState([]);
    const [masterJam, setMasterJam] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('kuota');
    const [showDone, setShowDone] = useState(false);

    // Filters
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [kuotaSearch, setKuotaSearch] = useState('');
    const [kuotaFilterUnit, setKuotaFilterUnit] = useState('');
    const [kuotaFilterProgram, setKuotaFilterProgram] = useState('');
    const [kuotaFilterGuru, setKuotaFilterGuru] = useState('');

    // Form
    const [formData, setFormData] = useState({
        aktivasi_id: '',
        tanggal_asal: '',
        jadwal_tujuan_id: '',
        tanggal_tujuan: '',
        jam_tujuan: '',
        catatan: ''
    });
    const [aktivasiSearch, setAktivasiSearch] = useState('');
    const [isAktivasiDropdownOpen, setIsAktivasiDropdownOpen] = useState(false);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [resRes, aktRes, jadRes, jamRes] = await Promise.all([
                supabase.from('reschedules').select('*').order('created_at', { ascending: false }),
                supabase.from('aktivasi_siswa').select('*').eq('status', 'Aktif'),
                supabase.from('jadwal_master').select('*'),
                supabase.from('master_jam').select('*').order('waktu', { ascending: true })
            ]);

            if (resRes.error) throw resRes.error;
            if (aktRes.error) throw aktRes.error;
            if (jadRes.error) throw jadRes.error;
            if (jamRes.error) throw jamRes.error;

            setReschedules(resRes.data || []);
            setAktivasis(aktRes.data || []);
            setJadwals(jadRes.data || []);
            setMasterJam(jamRes.data || []);
        } catch (error) {
            console.error('Error:', error.message);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    // Dropdown ref for click outside
    const dropdownRef = useRef(null);
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsAktivasiDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Get unique students from aktivasis
    const uniqueStudents = [];
    const seenStudents = new Set();
    aktivasis.forEach(a => {
        if (!seenStudents.has(a.siswa_id)) {
            seenStudents.add(a.siswa_id);
            uniqueStudents.push({ siswa_id: a.siswa_id, nama_siswa: a.nama_siswa });
        }
    });

    // Selected activation object
    const selectedAktivasi = aktivasis.find(a => a.id === formData.aktivasi_id);
    const selectedAktJadwal = selectedAktivasi ? jadwals.find(j => j.id === selectedAktivasi.jadwal_id) : null;

    // Student's jadwal ids for the selected siswa (for conflict check)
    const selectedSiswaId = selectedAktivasi?.siswa_id;
    const siswaAktivasis = aktivasis.filter(a => a.siswa_id === selectedSiswaId);

    // Get siswa's active jam on the target date (for anti-conflict)
    const getSiswaJamsOnDate = (targetDate) => {
        const jams = [];
        siswaAktivasis.forEach(a => {
            const dj = a.detail_jadwal || {};
            if (dj.jenis_program === 'Harian') {
                // Harian: only on exact date
                if (a.tgl_mulai === targetDate) {
                    jams.push(dj.jam_pertemuan || dj.jam);
                }
            } else {
                // Rutin: check day of week
                const dateObj = new Date(targetDate + 'T00:00:00');
                const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
                const dayName = dayNames[dateObj.getDay()];
                if (dj.hari && dj.hari.includes(dayName)) {
                    jams.push(dj.jam);
                }
            }
        });
        // Also check existing reschedules for this siswa on the target date
        reschedules.forEach(r => {
            if (r.nama_siswa === selectedAktivasi?.nama_siswa && r.tanggal_tujuan === targetDate && r.status !== 'Cancelled') {
                jams.push(r.jam_tujuan);
            }
        });
        return jams;
    };

    // Available target jadwals = slot kosong dari Jadwal 10 Hari (sisa kuota > 0)
    const getAvailableTargetJadwals = () => {
        if (!selectedAktivasi) return [];

        return jadwals
            .filter(j => {
                if (!j.reschedule) return false; // only jadwals with reschedule enabled
                if (j.id === selectedAktivasi.jadwal_id) return false; // can't reschedule to same jadwal
                return true;
            })
            .map(j => {
                const activeCount = aktivasis.filter(a => a.jadwal_id === j.id && a.status === 'Aktif').length;
                const sisaKuota = (j.kuota || 0) - activeCount;
                return { ...j, sisaKuota };
            })
            .filter(j => j.sisaKuota > 0);
    };

    const availableTargets = getAvailableTargetJadwals();

    const handleOpenModal = () => {
        const today = new Date().toISOString().split('T')[0];
        setFormData({
            aktivasi_id: '',
            tanggal_asal: '',
            jadwal_tujuan_id: '',
            tanggal_tujuan: '',
            jam_tujuan: '',
            catatan: ''
        });
        setAktivasiSearch('');
        setIsAktivasiDropdownOpen(false);
        setIsModalOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!selectedAktivasi) { alert('Pilih siswa & jadwal asal.'); return; }
        if (!formData.jadwal_tujuan_id) { alert('Pilih jadwal tujuan.'); return; }

        const targetJadwal = jadwals.find(j => j.id === formData.jadwal_tujuan_id);
        const jam = formData.jam_tujuan || targetJadwal?.jam || '';

        try {
            const payload = {
                aktivasi_id: formData.aktivasi_id,
                nama_siswa: selectedAktivasi.nama_siswa,
                jadwal_asal_id: selectedAktivasi.jadwal_id,
                jadwal_tujuan_id: formData.jadwal_tujuan_id,
                tanggal_asal: formData.tanggal_asal,
                tanggal_tujuan: formData.tanggal_tujuan,
                jam_tujuan: jam,
                status: 'Pending',
                catatan: formData.catatan
            };

            const { error } = await supabase.from('reschedules').insert([payload]);
            if (error) throw error;

            fetchData();
            setIsModalOpen(false);
        } catch (error) {
            console.error('Error saving reschedule:', error.message);
            alert('Gagal menyimpan reschedule: ' + error.message);
        }
    };

    const handleUpdateStatus = async (id, newStatus) => {
        try {
            const { error } = await supabase.from('reschedules').update({ status: newStatus }).eq('id', id);
            if (error) throw error;

            // Jika status Done → jadwal asal dikosongkan (aktivasi diubah ke 'Reschedule')
            if (newStatus === 'Done') {
                const reschedule = reschedules.find(r => r.id === id);
                if (reschedule && reschedule.aktivasi_id) {
                    const { error: aktError } = await supabase
                        .from('aktivasi_siswa')
                        .update({ status: 'Reschedule' })
                        .eq('id', reschedule.aktivasi_id);
                    if (aktError) {
                        console.error('Gagal mengosongkan jadwal asal:', aktError.message);
                    }
                }
            }

            setReschedules(reschedules.map(r => r.id === id ? { ...r, status: newStatus } : r));
            // Refresh data to update kuota
            fetchData();
        } catch (error) {
            alert('Gagal update status: ' + error.message);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Hapus data reschedule ini?')) return;
        try {
            const { error } = await supabase.from('reschedules').delete().eq('id', id);
            if (error) throw error;
            setReschedules(reschedules.filter(r => r.id !== id));
        } catch (error) {
            alert('Gagal menghapus: ' + error.message);
        }
    };

    const getStatusStyle = (status) => {
        switch (status) {
            case 'Pending': return { bg: '#fef3c7', text: '#92400e' };
            case 'Approved': return { bg: '#dbeafe', text: '#1e40af' };
            case 'Done': return { bg: '#d1fae5', text: '#047857' };
            case 'Cancelled': return { bg: '#fee2e2', text: '#b91c1c' };
            default: return { bg: '#f3f4f6', text: '#374151' };
        }
    };

    // Filter
    const filtered = reschedules.filter(r => {
        const matchSearch = !search || r.nama_siswa?.toLowerCase().includes(search.toLowerCase());
        const matchStatus = !filterStatus || r.status === filterStatus;
        return matchSearch && matchStatus;
    }).filter(r => showDone || (r.status !== 'Done' && r.status !== 'Cancelled'));

    const selectStyle = { padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontSize: '0.85rem', minWidth: '130px' };

    // Helper to get jadwal info string
    const jadwalInfo = (jadwalId) => {
        const j = jadwals.find(x => x.id === jadwalId);
        if (!j) return '-';
        return `${j.nama_program} - ${j.nama_guru} (${j.hari || '-'} ${j.jam || '-'}) [${j.unit}]`;
    };

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">Reschedule</h1>
                <p className="text-secondary">Kelola perpindahan jadwal siswa tanpa tabrakan.</p>
            </div>

            {/* Tab Navigation */}
            <div style={{ display: 'flex', gap: '0', marginBottom: '1.5rem', borderBottom: '2px solid var(--glass-border)' }}>
                {[{ key: 'kuota', label: 'Kuota Reschedule', icon: <CalendarX2 size={16} /> }, { key: 'pengajuan', label: 'Pengajuan Reschedule', icon: <RefreshCw size={16} /> }].map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            padding: '0.75rem 1.5rem',
                            border: 'none', cursor: 'pointer',
                            fontWeight: activeTab === tab.key ? 600 : 400,
                            color: activeTab === tab.key ? 'var(--primary)' : 'var(--text-secondary)',
                            borderBottom: activeTab === tab.key ? '2px solid var(--primary)' : '2px solid transparent',
                            background: 'transparent',
                            marginBottom: '-2px',
                            fontSize: '0.9rem',
                            transition: 'all 0.2s'
                        }}
                    >
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab: Kuota Reschedule — Ringkasan Jadwal 10 Hari yang Kosong */}
            {activeTab === 'kuota' && (() => {
                const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
                // Generate next 10 days starting from tomorrow (skip Sunday)
                const dates10 = [];
                const today = new Date();
                for (let i = 1; dates10.length < 10; i++) {
                    const d = new Date(today);
                    d.setDate(d.getDate() + i);
                    if (d.getDay() !== 0) {
                        dates10.push(d);
                    }
                }

                // Build rows: for each date + jadwal_master that falls on that date and has sisa kuota > 0
                const rows = [];
                dates10.forEach(dateObj => {
                    const dateStr = dateObj.toISOString().split('T')[0];
                    const hari = dayNames[dateObj.getDay()];

                    jadwals.forEach(j => {
                        // Only show jadwals with reschedule enabled
                        if (!j.reschedule) return;
                        // Check jadwal falls on this day
                        if (!j.hari || !j.hari.includes(hari)) return;

                        // Calculate sisa kuota: kuota - aktif aktivasi - reschedules (Pending/Approved) on this date
                        const activeCount = aktivasis.filter(a => a.jadwal_id === j.id && a.status === 'Aktif').length;
                        const rescheduleCount = reschedules.filter(r => r.jadwal_tujuan_id === j.id && r.tanggal_tujuan === dateStr && (r.status === 'Pending' || r.status === 'Approved')).length;
                        const sisaKuota = (j.kuota || 0) - activeCount - rescheduleCount;
                        if (sisaKuota <= 0) return;

                        rows.push({ ...j, dateStr, hari, terisi: activeCount, sisaKuota });
                    });
                });

                const unitOpts = [...new Set(rows.map(r => r.unit).filter(Boolean))];
                const progOpts = [...new Set(rows.map(r => r.nama_program).filter(Boolean))];
                const guruOpts = [...new Set(rows.map(r => r.nama_guru).filter(Boolean))];

                const filteredRows = rows.filter(r => {
                    const ms = !kuotaSearch || r.nama_guru?.toLowerCase().includes(kuotaSearch.toLowerCase()) || r.nama_program?.toLowerCase().includes(kuotaSearch.toLowerCase());
                    const mu = !kuotaFilterUnit || r.unit === kuotaFilterUnit;
                    const mp = !kuotaFilterProgram || r.nama_program === kuotaFilterProgram;
                    const mg = !kuotaFilterGuru || r.nama_guru === kuotaFilterGuru;
                    return ms && mu && mp && mg;
                });

                const selStyle = { padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontSize: '0.85rem', minWidth: '130px' };

                return (
                    <div className="glass-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                                <CalendarX2 className="text-primary" size={24} /> Kuota Reschedule — Ringkasan 10 Hari
                            </h2>
                            <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                                {filteredRows.length} slot kosong dalam 10 hari ke depan
                            </span>
                        </div>

                        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexDirection: 'column', width: '100%' }}>
                            <div style={{ position: 'relative', width: '100%' }}>
                                <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                                <input type="text" placeholder="Cari guru / program..." value={kuotaSearch} onChange={(e) => setKuotaSearch(e.target.value)} style={{ width: '100%', padding: '0.5rem 0.5rem 0.5rem 2.25rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontSize: '0.85rem' }} />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.5rem', width: '100%' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', gridColumn: '1 / -1', marginBottom: '-0.25rem' }}>
                                    <Filter size={14} style={{ color: 'var(--text-secondary)' }} />
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Filter:</span>
                                </div>
                                <select value={kuotaFilterUnit} onChange={(e) => setKuotaFilterUnit(e.target.value)} style={selStyle}><option value="">Semua Unit</option>{unitOpts.map(u => <option key={u} value={u}>{u}</option>)}</select>
                                <select value={kuotaFilterProgram} onChange={(e) => setKuotaFilterProgram(e.target.value)} style={selStyle}><option value="">Semua Program</option>{progOpts.map(p => <option key={p} value={p}>{p}</option>)}</select>
                                <select value={kuotaFilterGuru} onChange={(e) => setKuotaFilterGuru(e.target.value)} style={selStyle}><option value="">Semua Guru</option>{guruOpts.map(g => <option key={g} value={g}>{g}</option>)}</select>
                            </div>
                        </div>

                        <div style={{ overflowX: 'auto', paddingBottom: '1rem' }}>
                            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.05)' }}>
                                        <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>No</th>
                                        <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Tanggal</th>
                                        <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Hari</th>
                                        <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Jam</th>
                                        <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Program</th>
                                        <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Guru</th>
                                        <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Unit</th>
                                        <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Kuota</th>
                                        <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Terisi</th>
                                        <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Sisa</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {isLoading ? (
                                        <tr><td colSpan="10" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Memuat data...</td></tr>
                                    ) : filteredRows.length === 0 ? (
                                        <tr><td colSpan="10" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Tidak ada slot kosong dalam 10 hari ke depan.</td></tr>
                                    ) : (
                                        filteredRows.map((r, idx) => (
                                            <tr key={r.id + '-' + r.dateStr} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)', transition: 'background-color 0.2s' }}
                                                onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(79,70,229,0.02)'}
                                                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                            >
                                                <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>{idx + 1}</td>
                                                <td style={{ padding: '1rem', fontWeight: 500 }}>{r.dateStr}</td>
                                                <td style={{ padding: '1rem', fontWeight: 600, color: 'var(--primary)' }}>{r.hari}</td>
                                                <td style={{ padding: '1rem' }}>{r.jam || '-'}</td>
                                                <td style={{ padding: '1rem' }}>
                                                    <div style={{ fontWeight: 600 }}>{r.nama_program}</div>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{r.jenis_program}</div>
                                                </td>
                                                <td style={{ padding: '1rem' }}>{r.nama_guru}</td>
                                                <td style={{ padding: '1rem' }}>{r.unit}</td>
                                                <td style={{ padding: '1rem', textAlign: 'center' }}>{r.kuota}</td>
                                                <td style={{ padding: '1rem', textAlign: 'center' }}>{r.terisi}</td>
                                                <td style={{ padding: '1rem', textAlign: 'center' }}>
                                                    <span className="badge" style={{ background: '#d1fae5', color: '#047857', fontWeight: 700 }}>{r.sisaKuota}</span>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            })()}

            {/* Tab: Pengajuan Reschedule */}
            {activeTab === 'pengajuan' && (
                <div className="glass-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                            <RefreshCw className="text-primary" size={24} /> Data Reschedule
                        </h2>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                                className="btn"
                                onClick={() => setShowDone(!showDone)}
                                style={{ background: showDone ? 'rgba(16,185,129,0.15)' : 'rgba(0,0,0,0.05)', color: showDone ? '#047857' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                            >
                                {showDone ? <EyeOff size={16} /> : <Eye size={16} />}
                                {showDone ? 'Sembunyikan Selesai' : 'Tampilkan Selesai'}
                            </button>
                            <button className="btn btn-primary" onClick={handleOpenModal}>
                                <Plus size={18} /> Reschedule Baru
                            </button>
                        </div>
                    </div>

                    {/* Search & Filters */}
                    <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexDirection: 'column', width: '100%' }}>
                        <div style={{ position: 'relative', width: '100%' }}>
                            <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                            <input
                                type="text"
                                placeholder="Cari nama siswa..."
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
                            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={selectStyle}>
                                <option value="">Semua Status</option>
                                <option value="Pending">Pending</option>
                                <option value="Approved">Approved</option>
                                <option value="Done">Done</option>
                                <option value="Cancelled">Cancelled</option>
                            </select>
                        </div>
                    </div>

                    <div style={{ overflowX: 'auto', paddingBottom: '1rem' }}>
                        <table style={{ width: '100%', minWidth: '1100px', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.05)' }}>
                                    <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>No</th>
                                    <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Siswa</th>
                                    <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Jadwal Asal</th>
                                    <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Tgl Asal</th>
                                    <th style={{ padding: '1rem', color: 'var(--text-secondary)', textAlign: 'center' }}>→</th>
                                    <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Jadwal Tujuan</th>
                                    <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Tgl Tujuan</th>
                                    <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Status</th>
                                    <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {isLoading ? (
                                    <tr><td colSpan="9" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Memuat data...</td></tr>
                                ) : filtered.length === 0 ? (
                                    <tr><td colSpan="9" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Belum ada data reschedule.</td></tr>
                                ) : (
                                    filtered.map((r, idx) => (
                                        <tr key={r.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)', transition: 'background-color 0.2s' }}
                                            onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(79,70,229,0.02)'}
                                            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                        >
                                            <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>{idx + 1}</td>
                                            <td style={{ padding: '1rem', fontWeight: 600 }}>{r.nama_siswa}</td>
                                            <td style={{ padding: '1rem', fontSize: '0.8rem' }}>{jadwalInfo(r.jadwal_asal_id)}</td>
                                            <td style={{ padding: '1rem' }}>{r.tanggal_asal}</td>
                                            <td style={{ padding: '1rem', textAlign: 'center', fontSize: '1.2rem', color: 'var(--primary)' }}>→</td>
                                            <td style={{ padding: '1rem', fontSize: '0.8rem' }}>{jadwalInfo(r.jadwal_tujuan_id)}</td>
                                            <td style={{ padding: '1rem' }}>{r.tanggal_tujuan}</td>
                                            <td style={{ padding: '1rem' }}>
                                                <span className="badge" style={{ background: getStatusStyle(r.status).bg, color: getStatusStyle(r.status).text }}>
                                                    {r.status}
                                                </span>
                                            </td>
                                            <td style={{ padding: '1rem' }}>
                                                <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                                                    {r.status === 'Pending' && (
                                                        <button
                                                            onClick={() => handleUpdateStatus(r.id, 'Approved')}
                                                            style={{ fontSize: '0.7rem', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', border: 'none', cursor: 'pointer', background: '#dbeafe', color: '#1e40af' }}
                                                        >Approve</button>
                                                    )}
                                                    {(r.status === 'Pending' || r.status === 'Approved') && (
                                                        <button
                                                            onClick={() => handleUpdateStatus(r.id, 'Done')}
                                                            style={{ fontSize: '0.7rem', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', border: 'none', cursor: 'pointer', background: '#d1fae5', color: '#047857' }}
                                                        >Done</button>
                                                    )}
                                                    {r.status === 'Approved' && (
                                                        <button
                                                            onClick={() => {
                                                                const jAsal = jadwals.find(x => x.id === r.jadwal_asal_id) || {};
                                                                const jTuj = jadwals.find(x => x.id === r.jadwal_tujuan_id) || {};
                                                                const fTgl = (t) => {
                                                                    if (!t) return '-';
                                                                    const d = new Date(t);
                                                                    const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
                                                                    const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
                                                                    return `${dayNames[d.getDay()]}, ${d.getDate()} ${monthNames[d.getMonth()]} ${d.getFullYear()}`;
                                                                };
                                                                const text = `*Reschedule Jadwal Les*\n\nNama Siswa: ${r.nama_siswa}\n*Jadwal Sebelumnya*\n- ${fTgl(r.tanggal_asal)}\n- ${jAsal.jam || '-'}\n- Tutor: ${jAsal.nama_guru || '-'}\n- ${jAsal.unit || '-'}\n\n*Jadwal Pengganti*\n- ${fTgl(r.tanggal_tujuan)}\n- ${r.jam_tujuan || jTuj.jam || '-'}\n- Tutor: ${jTuj.nama_guru || '-'}\n- ${jTuj.unit || '-'}\n\nStatus: Disetujui\nCatatan: ${r.catatan || '-'}`;
                                                                window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                                                            }}
                                                            style={{ fontSize: '0.7rem', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', border: 'none', cursor: 'pointer', background: '#22c55e', color: 'white', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                                                            title="Kirim ke WA"
                                                        >
                                                            <Send size={12} /> WA
                                                        </button>
                                                    )}
                                                    {r.status !== 'Cancelled' && r.status !== 'Done' && (
                                                        <button
                                                            onClick={() => handleUpdateStatus(r.id, 'Cancelled')}
                                                            style={{ fontSize: '0.7rem', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', border: 'none', cursor: 'pointer', background: '#fee2e2', color: '#b91c1c' }}
                                                        >Cancel</button>
                                                    )}
                                                    <button
                                                        onClick={() => handleDelete(r.id)}
                                                        style={{ color: '#ef4444', background: 'rgba(239,68,68,0.1)', border: 'none', cursor: 'pointer', padding: '0.25rem 0.4rem', borderRadius: '0.25rem', display: 'flex', alignItems: 'center' }}
                                                        title="Hapus"
                                                    >
                                                        <Trash2 size={14} />
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
            )}

            {/* Modal Form */}
            {isModalOpen && (
                <div className="modal-overlay" onClick={() => setIsModalOpen(false)} style={{ overflowY: 'auto', padding: '2rem 0' }}>
                    <div className="modal-content" style={{ maxWidth: '700px', margin: 'auto' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h2 className="text-xl font-bold">Reschedule Baru</h2>
                            <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            {/* Section: Asal */}
                            <div style={{ gridColumn: 'span 2' }}>
                                <h3 className="font-semibold text-lg border-b pb-2 mb-2">Jadwal Asal (Dari)</h3>
                            </div>

                            <div style={{ gridColumn: 'span 2' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Pilih Aktivasi Siswa</label>
                                <div style={{ position: 'relative' }} ref={dropdownRef}>
                                    <div
                                        onClick={() => setIsAktivasiDropdownOpen(!isAktivasiDropdownOpen)}
                                        style={{
                                            width: '100%', padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)',
                                            background: 'var(--surface-color)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            color: formData.aktivasi_id ? 'inherit' : 'var(--text-secondary)'
                                        }}
                                    >
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {formData.aktivasi_id && selectedAktivasi
                                                ? `${selectedAktivasi.nama_siswa} — ${selectedAktivasi.detail_jadwal?.nama_program || '-'} (${selectedAktivasi.detail_jadwal?.hari || '-'} ${selectedAktivasi.detail_jadwal?.jam || '-'})`
                                                : '-- Pilih Siswa & Jadwal --'}
                                        </span>
                                        <span style={{ transform: isAktivasiDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', marginLeft: '0.5rem' }}>▼</span>
                                    </div>

                                    {isAktivasiDropdownOpen && (
                                        <div style={{
                                            position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '0.35rem', zIndex: 9999,
                                            backgroundColor: '#ffffff', border: '1px solid var(--glass-border)', borderRadius: '0.5rem',
                                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
                                            overflow: 'hidden'
                                        }}>
                                            <div style={{ padding: '0.75rem', borderBottom: '1px solid rgba(0,0,0,0.05)', backgroundColor: '#f9fafb' }}>
                                                <div style={{ position: 'relative' }}>
                                                    <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                                                    <input
                                                        type="text"
                                                        placeholder="Cari nama siswa..."
                                                        value={aktivasiSearch}
                                                        onChange={(e) => setAktivasiSearch(e.target.value)}
                                                        onClick={(e) => e.stopPropagation()}
                                                        style={{ width: '100%', padding: '0.5rem 0.5rem 0.5rem 2.25rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', fontSize: '0.85rem', background: 'var(--surface-color)', outline: 'none' }}
                                                        autoFocus
                                                    />
                                                </div>
                                            </div>
                                            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                                {aktivasis.filter(a => !aktivasiSearch || a.nama_siswa?.toLowerCase().includes(aktivasiSearch.toLowerCase())).length === 0 ? (
                                                    <div style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'center' }}>Siswa tidak ditemukan</div>
                                                ) : (
                                                    aktivasis.filter(a => !aktivasiSearch || a.nama_siswa?.toLowerCase().includes(aktivasiSearch.toLowerCase())).map(a => {
                                                        const dj = a.detail_jadwal || {};
                                                        return (
                                                            <div
                                                                key={a.id}
                                                                onClick={() => {
                                                                    setFormData(prev => ({ ...prev, aktivasi_id: a.id, jadwal_tujuan_id: '', jam_tujuan: '' }));
                                                                    setIsAktivasiDropdownOpen(false);
                                                                    setAktivasiSearch('');
                                                                }}
                                                                style={{
                                                                    padding: '0.75rem 1rem', cursor: 'pointer', borderBottom: '1px solid rgba(0,0,0,0.05)',
                                                                    background: formData.aktivasi_id === a.id ? 'rgba(79,70,229,0.05)' : 'transparent',
                                                                    color: formData.aktivasi_id === a.id ? 'var(--primary)' : 'inherit'
                                                                }}
                                                                onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(79,70,229,0.05)'}
                                                                onMouseOut={(e) => e.currentTarget.style.backgroundColor = formData.aktivasi_id === a.id ? 'rgba(79,70,229,0.05)' : 'transparent'}
                                                            >
                                                                <div style={{ fontWeight: 500 }}>{a.nama_siswa}</div>
                                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                                    {dj.nama_program || '-'} ({dj.hari || '-'} {dj.jam || '-'}) [{dj.unit || '-'}]
                                                                </div>
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {selectedAktJadwal && (
                                <div style={{ gridColumn: 'span 2', background: 'rgba(79,70,229,0.05)', padding: '0.75rem 1rem', borderRadius: '0.5rem', fontSize: '0.85rem' }}>
                                    <strong>Jadwal Asal:</strong> {selectedAktJadwal.nama_program} — {selectedAktJadwal.nama_guru} ({selectedAktJadwal.hari || '-'} {selectedAktJadwal.jam || '-'}) [{selectedAktJadwal.unit}]
                                </div>
                            )}

                            {(() => {
                                // Generate next 10 calendar days starting tomorrow (skip Sunday)
                                const dates10 = [];
                                const today = new Date();
                                for (let i = 1; dates10.length < 10; i++) {
                                    const d = new Date(today);
                                    d.setDate(d.getDate() + i);
                                    if (d.getDay() !== 0) {
                                        dates10.push(d);
                                    }
                                }
                                const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

                                // Filter to dates where this jadwal falls
                                let jadwalDates = [];
                                if (selectedAktivasi && selectedAktJadwal) {
                                    const dj = selectedAktivasi.detail_jadwal || {};
                                    if (dj.jenis_program === 'Harian') {
                                        // Harian: show specific date if in range
                                        const tgl = selectedAktivasi.tgl_mulai;
                                        if (tgl) {
                                            const tglDate = new Date(tgl + 'T00:00:00');
                                            if (tglDate >= new Date(today.toISOString().split('T')[0] + 'T00:00:00') && tglDate <= new Date(dates10[9].toISOString().split('T')[0] + 'T00:00:00')) {
                                                jadwalDates.push(tgl);
                                            }
                                        }
                                    } else {
                                        // Rutin: match hari
                                        const jadwalHari = selectedAktJadwal.hari || '';
                                        dates10.forEach(d => {
                                            const hari = dayNames[d.getDay()];
                                            if (jadwalHari.includes(hari)) {
                                                jadwalDates.push(d.toISOString().split('T')[0]);
                                            }
                                        });
                                    }
                                }

                                return (
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Tanggal Asal</label>
                                        {!selectedAktivasi ? (
                                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Pilih aktivasi siswa terlebih dahulu.</p>
                                        ) : jadwalDates.length === 0 ? (
                                            <p style={{ color: '#ef4444', fontSize: '0.85rem' }}>Tidak ada jadwal siswa ini dalam 10 hari ke depan.</p>
                                        ) : (
                                            <select
                                                value={formData.tanggal_asal}
                                                onChange={(e) => setFormData(prev => ({ ...prev, tanggal_asal: e.target.value }))}
                                                style={{ fontFamily: 'inherit', width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)' }}
                                                required
                                            >
                                                <option value="" disabled>-- Pilih Tanggal --</option>
                                                {jadwalDates.map(tgl => {
                                                    const d = new Date(tgl + 'T00:00:00');
                                                    const hari = dayNames[d.getDay()];
                                                    return <option key={tgl} value={tgl}>{hari}, {tgl}</option>;
                                                })}
                                            </select>
                                        )}
                                    </div>
                                );
                            })()}

                            {/* Section: Tujuan */}
                            <div style={{ gridColumn: 'span 2', marginTop: '1rem' }}>
                                <h3 className="font-semibold text-lg border-b pb-2 mb-2">Jadwal Tujuan (Ke)</h3>
                            </div>

                            {(() => {
                                const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
                                // Generate Kuota Reschedule rows starting tomorrow (skip Sunday)
                                const dates10 = [];
                                const today = new Date();
                                for (let i = 1; dates10.length < 10; i++) {
                                    const d = new Date(today);
                                    d.setDate(d.getDate() + i);
                                    if (d.getDay() !== 0) {
                                        dates10.push(d);
                                    }
                                }

                                const targetSlots = [];
                                if (selectedAktivasi && formData.tanggal_tujuan) {
                                    const dateObj = new Date(formData.tanggal_tujuan + 'T00:00:00');
                                    const dateStr = formData.tanggal_tujuan;
                                    const hari = dayNames[dateObj.getDay()];

                                    jadwals.forEach(j => {
                                        if (!j.reschedule) return; // only jadwals with reschedule enabled
                                        if (j.id === selectedAktivasi.jadwal_id) return;
                                        if (!j.hari || !j.hari.includes(hari)) return;

                                        // Filter by same unit and program as student's jadwal
                                        if (selectedAktJadwal) {
                                            if (j.unit !== selectedAktJadwal.unit) return;
                                            if (j.nama_program !== selectedAktJadwal.nama_program) return;
                                        }

                                        // Sisa kuota from Kuota Reschedule
                                        const activeCount = aktivasis.filter(a => a.jadwal_id === j.id && a.status === 'Aktif').length;
                                        const rescheduleCount = reschedules.filter(r => r.jadwal_tujuan_id === j.id && r.tanggal_tujuan === dateStr && (r.status === 'Pending' || r.status === 'Approved')).length;
                                        const sisaKuota = (j.kuota || 0) - activeCount - rescheduleCount;
                                        if (sisaKuota <= 0) return;

                                        targetSlots.push({ ...j, dateStr, hari, sisaKuota });
                                    });
                                }

                                return (
                                    <>
                                        <div style={{ gridColumn: 'span 2' }}>
                                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Tanggal Tujuan</label>
                                            {!selectedAktivasi ? (
                                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Pilih aktivasi siswa terlebih dahulu.</p>
                                            ) : (
                                                <select
                                                    value={formData.tanggal_tujuan}
                                                    onChange={(e) => setFormData(prev => ({ ...prev, tanggal_tujuan: e.target.value, jadwal_tujuan_id: '', jam_tujuan: '' }))}
                                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)' }}
                                                    required
                                                >
                                                    <option value="" disabled>-- Pilih Tanggal Tujuan --</option>
                                                    {dates10.map(d => {
                                                        const dateStr = d.toISOString().split('T')[0];
                                                        const hri = dayNames[d.getDay()];
                                                        return <option key={dateStr} value={dateStr}>{hri}, {dateStr}</option>;
                                                    })}
                                                </select>
                                            )}
                                        </div>

                                        <div style={{ gridColumn: 'span 2' }}>
                                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Pilih Jadwal Tujuan (Kosong)</label>
                                            {!formData.tanggal_tujuan ? (
                                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Pilih tanggal tujuan terlebih dahulu untuk melihat jadwal kosong.</p>
                                            ) : targetSlots.length === 0 ? (
                                                <p style={{ color: '#ef4444', fontSize: '0.85rem' }}>Tidak ada jadwal kosong yang tersedia pada hari tersebut.</p>
                                            ) : (
                                                <>
                                                    <select
                                                        value={formData.jadwal_tujuan_id}
                                                        onChange={(e) => {
                                                            const jid = e.target.value;
                                                            const tj = jadwals.find(j => j.id === jid);
                                                            setFormData(prev => ({ ...prev, jadwal_tujuan_id: jid, jam_tujuan: tj?.jam || '' }));
                                                        }}
                                                        style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)' }}
                                                        required
                                                    >
                                                        <option value="" disabled>-- Pilih Jadwal Kosong --</option>
                                                        {targetSlots.map(s => (
                                                            <option key={s.id} value={s.id}>
                                                                {s.nama_guru} ({s.jam || '-'}) [{s.unit}] — Sisa: {s.sisaKuota}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    {formData.jadwal_tujuan_id && (() => {
                                                        const tj = jadwals.find(j => j.id === formData.jadwal_tujuan_id);
                                                        const siswaJamsOnDate = getSiswaJamsOnDate(formData.tanggal_tujuan);
                                                        const isConflict = tj && siswaJamsOnDate.includes(tj.jam);

                                                        const d = new Date(formData.tanggal_tujuan + 'T00:00:00');
                                                        const hari = dayNames[d.getDay()];

                                                        return (
                                                            <>
                                                                {isConflict && (
                                                                    <p style={{ color: '#ef4444', fontSize: '0.85rem', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                                        ⚠️ Peringatan: Kemungkinan jadwal bentrok. Siswa sudah memiliki jadwal pada jam {tj.jam} di tanggal ini.
                                                                    </p>
                                                                )}
                                                                <div style={{ background: 'rgba(16,185,129,0.05)', padding: '0.75rem 1rem', borderRadius: '0.5rem', fontSize: '0.85rem', marginTop: '0.75rem' }}>
                                                                    <strong>Tujuan:</strong> {hari}, {formData.tanggal_tujuan} — {tj.nama_program} — {tj.nama_guru} ({tj.jam || '-'}) [{tj.unit}]
                                                                </div>
                                                            </>
                                                        );
                                                    })()}
                                                </>
                                            )}
                                        </div>
                                    </>
                                );
                            })()}

                            <div style={{ gridColumn: 'span 2' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Catatan</label>
                                <textarea
                                    value={formData.catatan}
                                    onChange={(e) => setFormData(prev => ({ ...prev, catatan: e.target.value }))}
                                    rows="2"
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontFamily: 'inherit' }}
                                    placeholder="Alasan reschedule..."
                                />
                            </div>

                            <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                                <button type="button" className="btn" style={{ background: '#f3f4f6' }} onClick={() => setIsModalOpen(false)}>Batal</button>
                                <button type="submit" className="btn btn-primary">Simpan Reschedule</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
