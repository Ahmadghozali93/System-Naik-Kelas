import { useState, useEffect } from 'react';
import { CalendarDays, Edit, Trash2, X, Plus, Clock, Save, Search, Filter } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function JadwalMasterPage() {
    const [jadwals, setJadwals] = useState([]);
    const [masterJam, setMasterJam] = useState([]);
    const [gurus, setGurus] = useState([]);
    const [programs, setPrograms] = useState([]);
    const [units, setUnits] = useState([]);
    const [aktivasis, setAktivasis] = useState([]);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isJamModalOpen, setIsJamModalOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterUnit, setFilterUnit] = useState('');
    const [filterProgram, setFilterProgram] = useState('');
    const [filterGuru, setFilterGuru] = useState('');

    const [jamMulai, setJamMulai] = useState('');
    const [jamSelesai, setJamSelesai] = useState('');
    const [formData, setFormData] = useState({
        guru_id: '',
        program_id: '',
        hari: [],
        jam: '',
        unit: '',
        kuota: 0
    });

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [jadwalRes, jamRes, guruRes, programRes, unitRes, aktivasiRes] = await Promise.all([
                supabase.from('jadwal_master').select('*').order('created_at', { ascending: false }),
                supabase.from('master_jam').select('*').order('waktu', { ascending: true }),
                supabase.from('gurus').select('id, nama').eq('status', 'Aktif').eq('role', 'Guru'),
                supabase.from('programs').select('id, nama, jenis').eq('status', 'Aktif'),
                supabase.from('units').select('nama').eq('aktif', true),
                supabase.from('aktivasi_siswa').select('jadwal_id, status')
            ]);

            if (jadwalRes.error) throw jadwalRes.error;
            if (jamRes.error) throw jamRes.error;
            if (guruRes.error) throw guruRes.error;
            if (programRes.error) throw programRes.error;
            if (unitRes.error) throw unitRes.error;
            if (aktivasiRes.error) throw aktivasiRes.error;

            setJadwals(jadwalRes.data || []);
            setMasterJam(jamRes.data || []);
            setGurus(guruRes.data || []);
            setPrograms(programRes.data || []);
            setUnits(unitRes.data || []);
            setAktivasis(aktivasiRes.data || []);
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

    const handleOpenModal = (jadwal = null) => {
        if (jadwal) {
            setEditingId(jadwal.id);
            setFormData({
                guru_id: jadwal.guru_id || '',
                program_id: jadwal.program_id || '',
                hari: jadwal.hari ? jadwal.hari.split(', ') : [],
                jam: jadwal.jam || '',
                unit: jadwal.unit || '',
                kuota: jadwal.kuota || 0
            });
        } else {
            setEditingId(null);
            setFormData({
                guru_id: '',
                program_id: '',
                hari: [],
                jam: '',
                unit: '',
                kuota: 0
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
            // Find references for names
            const selectedGuru = gurus.find(g => g.id === formData.guru_id);
            const selectedProgram = programs.find(p => p.id === formData.program_id);

            if (!selectedGuru || !selectedProgram) {
                alert('Silakan pilih Guru dan Program.');
                return;
            }
            if (selectedProgram.jenis !== 'Harian' && (!formData.hari || formData.hari.length === 0)) {
                alert('Silakan pilih minimal satu Hari.');
                return;
            }

            const isHarian = selectedProgram.jenis === 'Harian';

            const payload = {
                guru_id: selectedGuru.id,
                nama_guru: selectedGuru.nama,
                program_id: selectedProgram.id,
                nama_program: selectedProgram.nama,
                jenis_program: selectedProgram.jenis,
                hari: isHarian ? '' : formData.hari.join(', '),
                jam: isHarian ? '' : formData.jam,
                unit: formData.unit,
                kuota: parseInt(formData.kuota, 10) || 0
            };

            if (editingId) {
                const { error } = await supabase
                    .from('jadwal_master')
                    .update(payload)
                    .eq('id', editingId);

                if (error) throw error;

                setJadwals(jadwals.map(j => j.id === editingId ? { ...j, ...payload } : j));
            } else {
                const newId = 'JDW-' + Math.random().toString(36).substr(2, 6).toUpperCase();
                payload.jadwal_id = newId;

                const { data, error } = await supabase
                    .from('jadwal_master')
                    .insert([payload])
                    .select(); // Supabase can return the generated UUID

                if (error) throw error;
                if (data && data.length > 0) {
                    setJadwals([data[0], ...jadwals]);
                } else {
                    setJadwals([{ id: 'temp', ...payload }, ...jadwals]); // Fallback
                }
            }
            handleCloseModal();
        } catch (error) {
            console.error('Error saving jadwal:', error.message);
            alert('Gagal menyimpan jadwal ke database.');
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm("Apakah Anda yakin ingin menghapus jadwal ini?")) {
            try {
                const { error } = await supabase
                    .from('jadwal_master')
                    .delete()
                    .eq('id', id);

                if (error) {
                    if (error.code === '23503') {
                        alert('Tidak bisa menghapus jadwal ini karena sudah ada siswa yang terdaftar di dalamnya (Aktivasi Siswa). Silakan hapus data aktivasi siswa terlebih dahulu.');
                        return;
                    }
                    throw error;
                }

                setJadwals(jadwals.filter(j => j.id !== id));
            } catch (error) {
                console.error('Error deleting jadwal:', error.message);
                alert('Gagal menghapus data dari database.');
            }
        }
    };

    const handleAddJam = async () => {
        if (!jamMulai || !jamSelesai) return;
        const newJamText = `${jamMulai} - ${jamSelesai}`;
        try {
            const { data, error } = await supabase
                .from('master_jam')
                .insert([{ waktu: newJamText }])
                .select();
            if (error) {
                if (error.code === '23505') throw new Error('Jam sudah ada di daftar.');
                throw error;
            }
            if (data && data.length > 0) {
                const newJamList = [...masterJam, data[0]].sort((a, b) => a.waktu.localeCompare(b.waktu));
                setMasterJam(newJamList);
                setJamMulai('');
                setJamSelesai('');
            }
        } catch (error) {
            alert('Gagal menambahkan jam: ' + error.message);
        }
    };

    const handleDeleteJam = async (id) => {
        if (window.confirm("Apakah yakin menghapus format jam ini? Semua jadwal dengan jam ini tidak akan muncul di Timetable sampai diubah.")) {
            try {
                const { error } = await supabase.from('master_jam').delete().eq('id', id);
                if (error) throw error;
                setMasterJam(masterJam.filter(m => m.id !== id));
            } catch (error) {
                alert('Gagal menghapus jam: ' + error.message);
            }
        }
    };

    const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

    const getSisaKuota = (jadwalId, kuota) => {
        const activeCount = aktivasis.filter(a => a.jadwal_id === jadwalId && a.status === 'Aktif').length;
        return (kuota || 0) - activeCount;
    };

    const handleToggleReschedule = async (jadwal) => {
        const newVal = !jadwal.reschedule;
        try {
            const { error } = await supabase
                .from('jadwal_master')
                .update({ reschedule: newVal })
                .eq('id', jadwal.id);
            if (error) throw error;
            setJadwals(jadwals.map(j => j.id === jadwal.id ? { ...j, reschedule: newVal } : j));
        } catch (error) {
            alert('Gagal update reschedule: ' + error.message);
        }
    };

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">Jadwal Master Terjadwal</h1>
                <p className="text-secondary">Data master acuan untuk seluruh jadwal bimbingan secara periodik.</p>
            </div>

            <div className="glass-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                        <CalendarDays className="text-primary" size={24} /> Timetable Master
                    </h2>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <button className="btn" style={{ background: '#f3f4f6', color: 'var(--text-primary)' }} onClick={() => setIsJamModalOpen(true)}>
                            <Clock size={18} /> Kelola Jam
                        </button>
                        <button className="btn btn-primary" onClick={() => handleOpenModal()}>
                            + Buat Jadwal Baru
                        </button>
                    </div>
                </div>

                {/* Search & Filters */}
                {(() => {
                    const unitOpts = [...new Set(jadwals.map(j => j.unit).filter(Boolean))];
                    const progOpts = [...new Set(jadwals.map(j => j.nama_program).filter(Boolean))];
                    const guruOpts = [...new Set(jadwals.map(j => j.nama_guru).filter(Boolean))];
                    const selStyle = { padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontSize: '0.85rem', minWidth: '130px' };
                    return (
                        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            <div style={{ position: 'relative', flex: '1', minWidth: '200px' }}>
                                <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                                <input
                                    type="text"
                                    placeholder="Cari guru / program / ID jadwal..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    style={{ width: '100%', padding: '0.5rem 0.5rem 0.5rem 2.25rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontSize: '0.85rem' }}
                                />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Filter size={16} style={{ color: 'var(--text-secondary)' }} />
                                <select value={filterUnit} onChange={(e) => setFilterUnit(e.target.value)} style={selStyle}>
                                    <option value="">Semua Unit</option>
                                    {unitOpts.map(u => <option key={u} value={u}>{u}</option>)}
                                </select>
                                <select value={filterProgram} onChange={(e) => setFilterProgram(e.target.value)} style={selStyle}>
                                    <option value="">Semua Program</option>
                                    {progOpts.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                                <select value={filterGuru} onChange={(e) => setFilterGuru(e.target.value)} style={selStyle}>
                                    <option value="">Semua Guru</option>
                                    {guruOpts.map(g => <option key={g} value={g}>{g}</option>)}
                                </select>
                            </div>
                        </div>
                    );
                })()}

                <div style={{ overflowX: 'auto', paddingBottom: '1rem' }}>
                    <table style={{ width: '100%', minWidth: '900px', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.82rem', tableLayout: 'auto' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.05)' }}>
                                <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', width: '10%' }}>ID Jadwal</th>
                                <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)', width: '14%' }}>Guru</th>
                                <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)', width: '14%' }}>Program</th>
                                <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)', width: '16%' }}>Hari & Jam</th>
                                <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)', width: '8%' }}>Unit</th>
                                <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)', width: '6%', textAlign: 'center' }}>Kuota</th>
                                <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)', width: '8%', textAlign: 'center' }}>Sisa</th>
                                <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)', textAlign: 'center', width: '9%' }}>Reschedule</th>
                                <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)', width: '8%' }}>Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan="9" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                        Memuat data jadwal master...
                                    </td>
                                </tr>
                            ) : jadwals.length === 0 ? (
                                <tr>
                                    <td colSpan="9" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                        Belum ada jadwal master.
                                    </td>
                                </tr>
                            ) : (() => {
                                const filteredJadwals = jadwals.filter(j => {
                                    const matchSearch = !search || j.nama_guru?.toLowerCase().includes(search.toLowerCase()) || j.nama_program?.toLowerCase().includes(search.toLowerCase()) || j.jadwal_id?.toLowerCase().includes(search.toLowerCase());
                                    const matchUnit = !filterUnit || j.unit === filterUnit;
                                    const matchProgram = !filterProgram || j.nama_program === filterProgram;
                                    const matchGuru = !filterGuru || j.nama_guru === filterGuru;
                                    return matchSearch && matchUnit && matchProgram && matchGuru;
                                });
                                return filteredJadwals.length === 0 ? (
                                    <tr>
                                        <td colSpan="9" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                            Tidak ada jadwal yang cocok.
                                        </td>
                                    </tr>
                                ) : filteredJadwals.map((j) => (
                                    <tr key={j.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)', transition: 'background-color 0.2s' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(79,70,229,0.02)'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                        <td style={{ padding: '0.6rem 0.5rem', fontWeight: 500, color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{j.jadwal_id}</td>
                                        <td style={{ padding: '0.6rem 0.5rem' }}>
                                            <div style={{ fontWeight: 600 }}>{j.nama_guru}</div>
                                        </td>
                                        <td style={{ padding: '0.6rem 0.5rem' }}>
                                            <div style={{ color: 'var(--primary)', fontWeight: 600 }}>{j.nama_program}</div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{j.jenis_program}</div>
                                        </td>
                                        <td style={{ padding: '0.6rem 0.5rem' }}>
                                            <div style={{ fontWeight: 500 }}>{j.hari}</div>
                                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{j.jam}</div>
                                        </td>
                                        <td style={{ padding: '0.6rem 0.5rem' }}>{j.unit}</td>
                                        <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>{j.kuota}</td>
                                        <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>
                                            {(() => {
                                                const sisa = getSisaKuota(j.id, j.kuota);
                                                const bg = sisa > 0 ? '#d1fae5' : '#fee2e2';
                                                const color = sisa > 0 ? '#047857' : '#b91c1c';
                                                return <span className="badge" style={{ background: bg, color, fontWeight: 700 }}>{sisa}</span>;
                                            })()}
                                        </td>
                                        <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>
                                            <label style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={!!j.reschedule}
                                                    onChange={() => handleToggleReschedule(j)}
                                                    style={{ opacity: 0, width: 0, height: 0 }}
                                                />
                                                <span style={{
                                                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                                                    background: j.reschedule ? '#4f46e5' : '#d1d5db',
                                                    borderRadius: '24px', transition: 'background 0.3s'
                                                }}>
                                                    <span style={{
                                                        position: 'absolute', height: '18px', width: '18px',
                                                        left: j.reschedule ? '23px' : '3px', bottom: '3px',
                                                        background: 'white', borderRadius: '50%', transition: 'left 0.3s',
                                                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                                                    }} />
                                                </span>
                                            </label>
                                        </td>
                                        <td style={{ padding: '0.6rem 0.5rem' }}>
                                            <div style={{ display: 'flex', gap: '0.35rem' }}>
                                                <button
                                                    onClick={() => handleOpenModal(j)}
                                                    style={{ color: 'var(--primary)', background: 'rgba(79,70,229,0.1)', border: 'none', cursor: 'pointer', padding: '0.5rem', borderRadius: '0.375rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                    title="Edit"
                                                >
                                                    <Edit className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(j.id)}
                                                    style={{ color: '#ef4444', background: 'rgba(239,68,68,0.1)', border: 'none', cursor: 'pointer', padding: '0.5rem', borderRadius: '0.375rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                    title="Hapus"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ));
                            })()}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal Form */}
            {isModalOpen && (
                <div className="modal-overlay" onClick={handleCloseModal} style={{ overflowY: 'auto', padding: '2rem 0' }}>
                    <div className="modal-content" style={{ maxWidth: '700px', margin: 'auto' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h2 className="text-xl font-bold">{editingId ? 'Edit Jadwal Master' : 'Tambah Jadwal Master'}</h2>
                            <button onClick={handleCloseModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

                            {/* Section: Penugasan */}
                            <div style={{ gridColumn: 'span 2' }}>
                                <h3 className="font-semibold text-lg border-b pb-2 mb-2">Penugasan</h3>
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Guru Pengajar</label>
                                <select
                                    name="guru_id"
                                    value={formData.guru_id}
                                    onChange={handleInputChange}
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)' }}
                                    required
                                >
                                    <option value="" disabled>-- Pilih Guru --</option>
                                    {gurus.map(g => (
                                        <option key={g.id} value={g.id}>{g.nama} ({g.id})</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Program</label>
                                <select
                                    name="program_id"
                                    value={formData.program_id}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        const selProg = programs.find(p => p.id === val);
                                        // If changing to Harian, automatically clear Hari/Jam
                                        if (selProg && selProg.jenis === 'Harian') {
                                            setFormData(prev => ({ ...prev, program_id: val, hari: [], jam: '' }));
                                        } else {
                                            setFormData(prev => ({ ...prev, program_id: val }));
                                        }
                                    }}
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)' }}
                                    required
                                >
                                    <option value="" disabled>-- Pilih Program --</option>
                                    {programs.map(p => (
                                        <option key={p.id} value={p.id}>{p.nama} ({p.jenis})</option>
                                    ))}
                                </select>
                            </div>

                            {/* Section: Waktu & Lokasi */}
                            {(() => {
                                const activeProgram = programs.find(p => p.id === formData.program_id);
                                const isHarian = activeProgram && activeProgram.jenis === 'Harian';

                                if (isHarian) return null; // Hide completely for Harian

                                return (
                                    <>
                                        <div style={{ gridColumn: 'span 2', marginTop: '1rem' }}>
                                            <h3 className="font-semibold text-lg border-b pb-2 mb-2">Waktu & Lokasi</h3>
                                        </div>

                                        <div style={{ gridColumn: 'span 2' }}>
                                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Hari (Bisa Pilih Lebih dari 1)</label>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                                {DAYS.map(h => (
                                                    <label key={h} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'var(--surface-color)', padding: '0.35rem 0.65rem', borderRadius: '0.375rem', border: '1px solid var(--glass-border)', cursor: 'pointer', fontSize: '0.875rem' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={formData.hari.includes(h)}
                                                            onChange={() => {
                                                                const newHari = formData.hari.includes(h) ? formData.hari.filter(d => d !== h) : [...formData.hari, h];
                                                                setFormData({ ...formData, hari: newHari });
                                                            }}
                                                        /> {h}
                                                    </label>
                                                ))}
                                            </div>
                                        </div>

                                        <div>
                                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Jam (Time Slot)</label>
                                            <select
                                                name="jam"
                                                value={formData.jam}
                                                onChange={handleInputChange}
                                                style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)' }}
                                                required
                                            >
                                                <option value="" disabled>-- Pilih Jam --</option>
                                                {masterJam.map(m => (
                                                    <option key={m.id} value={m.waktu}>{m.waktu}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </>
                                );
                            })()}

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Lokasi / Unit</label>
                                <select
                                    name="unit"
                                    value={formData.unit}
                                    onChange={handleInputChange}
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)' }}
                                    required
                                >
                                    <option value="" disabled>-- Pilih Unit --</option>
                                    {units.map(u => (
                                        <option key={u.nama} value={u.nama}>{u.nama}</option>
                                    ))}
                                </select>
                            </div>

                            <div style={{ gridColumn: 'span 2' }}>
                                <h3 className="font-semibold text-lg border-b pb-2 mb-2 mt-4">Kapasitas</h3>
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Kuota Maksimal Siswa</label>
                                <input
                                    type="number"
                                    name="kuota"
                                    value={formData.kuota}
                                    onChange={handleInputChange}
                                    min="0"
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)' }}
                                    required
                                />
                            </div>

                            <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                                <button type="button" className="btn" style={{ background: '#f3f4f6' }} onClick={handleCloseModal}>Batal</button>
                                <button type="submit" className="btn btn-primary">
                                    {editingId ? 'Simpan Perubahan' : 'Buat Jadwal'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Manage Jam */}
            {isJamModalOpen && (
                <div className="modal-overlay" onClick={() => setIsJamModalOpen(false)}>
                    <div className="modal-content" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h2 className="text-xl font-bold">Kelola Jam Mulai/Selesai</h2>
                            <button onClick={() => setIsJamModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', alignItems: 'center' }}>
                            <input
                                type="time"
                                value={jamMulai}
                                onChange={(e) => setJamMulai(e.target.value)}
                                style={{ flex: 1, padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)' }}
                            />
                            <span style={{ fontWeight: 'bold', color: 'var(--text-secondary)' }}>-</span>
                            <input
                                type="time"
                                value={jamSelesai}
                                onChange={(e) => setJamSelesai(e.target.value)}
                                style={{ flex: 1, padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)' }}
                            />
                            <button onClick={handleAddJam} className="btn btn-primary" disabled={!jamMulai || !jamSelesai}>
                                <Plus size={16} /> Tambah
                            </button>
                        </div>

                        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                            {masterJam.length === 0 ? (
                                <li style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Belum ada data jam.</li>
                            ) : (
                                masterJam.map(jam => (
                                    <li key={jam.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                                        <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{jam.waktu}</div>
                                        <button onClick={() => handleDeleteJam(jam.id)} style={{ color: '#ef4444', background: 'none', border: 'none', padding: '4px', cursor: 'pointer' }}>
                                            <Trash2 size={16} />
                                        </button>
                                    </li>
                                ))
                            )}
                        </ul>
                    </div>
                </div>
            )}
        </div>
    );
}
