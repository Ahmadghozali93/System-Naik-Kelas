import { useState, useEffect } from 'react';
import { CalendarDays, Edit, Trash2, X, Plus, GraduationCap, Search, Filter, Download } from 'lucide-react';
import { supabase } from '../lib/supabase';
import * as XLSX from 'xlsx';

export default function AktivasiRutinPage() {
    const [aktivasis, setAktivasis] = useState([]);
    const [siswas, setSiswas] = useState([]);
    const [jadwals, setJadwals] = useState([]);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('tabel');

    // Search & Filters
    const [search, setSearch] = useState('');
    const [filterUnit, setFilterUnit] = useState('');
    const [filterProgram, setFilterProgram] = useState('');
    const [filterGuru, setFilterGuru] = useState('');
    const [filterStatus, setFilterStatus] = useState('');

    const [formData, setFormData] = useState({
        siswa_id: '',
        jadwal_id: '',
        tgl_mulai: '',
        spp: 0,
        catatan: '',
        status: 'Aktif'
    });

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [aktivasiRes, siswaRes, jadwalRes] = await Promise.all([
                supabase.from('aktivasi_siswa').select('*').order('created_at', { ascending: false }),
                supabase.from('siswa').select('id, nama, unit').eq('status', 'Aktif'),
                supabase.from('jadwal_master').select('*').eq('jenis_program', 'Rutin')
            ]);

            if (aktivasiRes.error) throw aktivasiRes.error;
            if (siswaRes.error) throw siswaRes.error;
            if (jadwalRes.error) throw jadwalRes.error;

            setAktivasis(aktivasiRes.data || []);
            setSiswas(siswaRes.data || []);
            setJadwals(jadwalRes.data || []);
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
                tgl_mulai: aktivasi.tgl_mulai || '',
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
                tgl_mulai: today,
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

            const detailJadwal = {
                guru_id: selectedJadwal.guru_id,
                nama_guru: selectedJadwal.nama_guru,
                program_id: selectedJadwal.program_id,
                nama_program: selectedJadwal.nama_program,
                jenis_program: selectedJadwal.jenis_program,
                hari: selectedJadwal.hari,
                jam: selectedJadwal.jam,
                unit: selectedJadwal.unit
            };

            const payload = {
                siswa_id: selectedSiswa.id,
                nama_siswa: selectedSiswa.nama,
                jadwal_id: selectedJadwal.id,
                detail_jadwal: detailJadwal,
                tgl_mulai: formData.tgl_mulai,
                spp: parseFloat(formData.spp) || 0,
                catatan: formData.catatan,
                status: formData.status
            };

            if (editingId) {
                const { error } = await supabase
                    .from('aktivasi_siswa')
                    .update(payload)
                    .eq('id', editingId);

                if (error) throw error;
                // Fetch again to ensure consistent data structure with detail_jadwal
                fetchData();
            } else {
                const newAssignId = 'ACT-' + Math.random().toString(36).substr(2, 6).toUpperCase();
                payload.assign_id = newAssignId;

                const { error } = await supabase
                    .from('aktivasi_siswa')
                    .insert([payload]);

                if (error) throw error;
                fetchData();
            }
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
                <h1 className="page-title">Aktivasi Jadwal Rutin</h1>
                <p className="text-secondary">Pendaftaran dan penempatan siswa pada jadwal bimbingan rutin.</p>
            </div>

            <div className="glass-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                        <GraduationCap className="text-primary" size={24} /> Data Aktivasi
                    </h2>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <div style={{ display: 'flex', background: 'var(--surface-color)', borderRadius: '0.5rem', padding: '0.25rem', border: '1px solid var(--glass-border)' }}>
                            <button
                                onClick={() => setActiveTab('tabel')}
                                style={{
                                    padding: '0.5rem 1rem', border: 'none', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500,
                                    background: activeTab === 'tabel' ? 'var(--primary)' : 'transparent',
                                    color: activeTab === 'tabel' ? 'white' : 'var(--text-secondary)',
                                    transition: 'all 0.2s'
                                }}
                            >
                                Mode Tabel
                            </button>
                            <button
                                onClick={() => setActiveTab('matrix')}
                                style={{
                                    padding: '0.5rem 1rem', border: 'none', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500,
                                    background: activeTab === 'matrix' ? 'var(--primary)' : 'transparent',
                                    color: activeTab === 'matrix' ? 'white' : 'var(--text-secondary)',
                                    transition: 'all 0.2s'
                                }}
                            >
                                Mode Matrix (Jam/Program)
                            </button>
                        </div>
                        <button className="btn btn-primary" onClick={() => handleOpenModal()}>
                            <Plus size={18} /> Aktivasi Baru
                        </button>
                    </div>
                </div>

                {activeTab === 'tabel' ? (
                    <>
                        {/* Search & Filters */}
                        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            <div style={{ position: 'relative', flex: '1', minWidth: '200px' }}>
                                <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                                <input
                                    type="text"
                                    placeholder="Cari siswa / guru / program..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    style={{ width: '100%', padding: '0.5rem 0.5rem 0.5rem 2.25rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontSize: '0.85rem' }}
                                />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Filter size={16} style={{ color: 'var(--text-secondary)' }} />
                                <select value={filterUnit} onChange={(e) => setFilterUnit(e.target.value)} style={{ padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontSize: '0.85rem', minWidth: '120px' }}>
                                    <option value="">Semua Unit</option>
                                    {[...new Set(aktivasis.filter(a => a.detail_jadwal?.jenis_program === 'Rutin').map(a => a.detail_jadwal?.unit).filter(Boolean))].map(u => <option key={u} value={u}>{u}</option>)}
                                </select>
                                <select value={filterProgram} onChange={(e) => setFilterProgram(e.target.value)} style={{ padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontSize: '0.85rem', minWidth: '120px' }}>
                                    <option value="">Semua Program</option>
                                    {[...new Set(aktivasis.filter(a => a.detail_jadwal?.jenis_program === 'Rutin').map(a => a.detail_jadwal?.nama_program).filter(Boolean))].map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                                <select value={filterGuru} onChange={(e) => setFilterGuru(e.target.value)} style={{ padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontSize: '0.85rem', minWidth: '120px' }}>
                                    <option value="">Semua Guru</option>
                                    {[...new Set(aktivasis.filter(a => a.detail_jadwal?.jenis_program === 'Rutin').map(a => a.detail_jadwal?.nama_guru).filter(Boolean))].map(g => <option key={g} value={g}>{g}</option>)}
                                </select>
                                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontSize: '0.85rem', minWidth: '120px' }}>
                                    <option value="">Semua Status</option>
                                    <option value="Aktif">Aktif</option>
                                    <option value="Lulus">Lulus</option>
                                    <option value="Keluar">Keluar</option>
                                    <option value="Cancel">Cancel</option>
                                </select>
                            </div>
                        </div>

                        <div style={{ overflowX: 'auto', paddingBottom: '1rem' }}>
                            <table style={{ width: '100%', minWidth: '1200px', textAlign: 'left', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.875rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.05)' }}>
                                        <th style={{ padding: '1rem', color: 'var(--text-secondary)', minWidth: '120px' }}>Assign ID</th>
                                        <th style={{ padding: '1rem', color: 'var(--text-secondary)', minWidth: '160px' }}>Siswa</th>
                                        <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Jadwal / Program</th>
                                        <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Guru / Waktu</th>
                                        <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Tgl Mulai</th>
                                        <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>SPP</th>
                                        <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Status</th>
                                        <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Aksi</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {isLoading ? (
                                        <tr>
                                            <td colSpan="8" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                                Memuat data aktivasi...
                                            </td>
                                        </tr>
                                    ) : aktivasis.length === 0 ? (
                                        <tr>
                                            <td colSpan="8" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                                Belum ada data aktivasi siswa.
                                            </td>
                                        </tr>
                                    ) : (() => {
                                        const rutinList = aktivasis
                                            .filter(a => a.detail_jadwal?.jenis_program === 'Rutin')
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
                                        return rutinList.length === 0 ? (
                                            <tr>
                                                <td colSpan="8" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                                    Belum ada data aktivasi siswa rutin.
                                                </td>
                                            </tr>
                                        ) : (
                                            rutinList.map((a) => {
                                                const dj = a.detail_jadwal || {};
                                                return (
                                                    <tr key={a.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)', transition: 'background-color 0.2s' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(79,70,229,0.02)'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                                        <td style={{ padding: '1rem', fontWeight: 500, color: 'var(--text-secondary)', minWidth: '120px' }}>{a.assign_id}</td>
                                                        <td style={{ padding: '1rem', minWidth: '160px' }}>
                                                            <div style={{ fontWeight: 600 }}>{a.nama_siswa}</div>
                                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{a.siswa_id?.substring(0, 8)}...</div>
                                                        </td>
                                                        <td style={{ padding: '1rem' }}>
                                                            <div style={{ color: 'var(--primary)', fontWeight: 600 }}>{dj.nama_program || '-'}</div>
                                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{dj.jenis_program || '-'}</div>
                                                        </td>
                                                        <td style={{ padding: '1rem' }}>
                                                            <div style={{ fontWeight: 500 }}>{dj.nama_guru || '-'}</div>
                                                            <div style={{ color: 'var(--text-secondary)' }}>{dj.hari || '-'} | {dj.jam || '-'}</div>
                                                            <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{dj.unit || '-'}</div>
                                                        </td>
                                                        <td style={{ padding: '1rem' }}>{a.tgl_mulai}</td>
                                                        <td style={{ padding: '1rem', fontWeight: 500 }}>{formatCurrency(a.spp)}</td>
                                                        <td style={{ padding: '1rem' }}>
                                                            <span className="badge" style={{ background: getStatusStyle(a.status).bg, color: getStatusStyle(a.status).text }}>
                                                                {a.status}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '1rem' }}>
                                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                                <button
                                                                    onClick={() => handleOpenModal(a)}
                                                                    style={{ color: 'var(--primary)', background: 'rgba(79,70,229,0.1)', border: 'none', cursor: 'pointer', padding: '0.5rem', borderRadius: '0.375rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                                    title="Edit"
                                                                >
                                                                    <Edit className="w-4 h-4" />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDelete(a.id)}
                                                                    style={{ color: '#ef4444', background: 'rgba(239,68,68,0.1)', border: 'none', cursor: 'pointer', padding: '0.5rem', borderRadius: '0.375rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                                    title="Hapus"
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )
                                    })()}
                                </tbody>
                            </table>
                        </div>
                    </>
                ) : (
                    // MATRIX VIEW
                    (() => {
                        // First, we apply the exact same filters used in Mode Tabel to get the same data
                        const filteredAktivasis = aktivasis
                            .filter(a => a.detail_jadwal?.jenis_program === 'Rutin')
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

                        // Collect unique Hari groups from both aktivasi AND jadwal master
                        const allHarisSet = new Set();
                        filteredAktivasis.forEach(a => {
                            const hari = a.detail_jadwal?.hari;
                            if (hari) allHarisSet.add(hari);
                        });
                        // Also add hari from jadwal master (for empty slots)
                        const filteredJadwals = jadwals.filter(j => {
                            if (filterUnit && j.unit !== filterUnit) return false;
                            if (filterProgram && j.nama_program !== filterProgram) return false;
                            if (filterGuru && j.nama_guru !== filterGuru) return false;
                            if (search) {
                                const s = search.toLowerCase();
                                const matchGuru = j.nama_guru?.toLowerCase().includes(s);
                                const matchProgram = j.nama_program?.toLowerCase().includes(s);
                                if (!matchGuru && !matchProgram) return false;
                            }
                            return true;
                        });
                        filteredJadwals.forEach(j => {
                            if (j.hari) allHarisSet.add(j.hari);
                        });
                        const allHaris = Array.from(allHarisSet).sort();

                        // Build matrix rows: one row per aktivasi entry
                        // Each row: Jam, Program (Kelas), Unit, Guru, and the siswa name placed under the correct Hari column
                        const matrixData = filteredAktivasis.map(a => {
                            const dj = a.detail_jadwal || {};
                            return {
                                jam: dj.jam || '-',
                                program: dj.nama_program || '-',
                                unit: dj.unit || '-',
                                guru: dj.nama_guru || '-',
                                hari: dj.hari || '-',
                                siswa: a.nama_siswa || '-',
                                status: a.status
                            };
                        });

                        // Also add empty (Kosong) slots from jadwal master
                        filteredJadwals.forEach(j => {
                            if (!j.hari) return;
                            const totalKuota = j.kuota || 1;
                            // Count how many active aktivasi already exist for this jadwal
                            const activeCount = aktivasis.filter(a => a.jadwal_id === j.id && a.status === 'Aktif').length;
                            const emptySlots = totalKuota - activeCount;
                            for (let i = 0; i < emptySlots; i++) {
                                matrixData.push({
                                    jam: j.jam || '-',
                                    program: j.nama_program || '-',
                                    unit: j.unit || '-',
                                    guru: j.nama_guru || '-',
                                    hari: j.hari || '-',
                                    siswa: 'Kosong',
                                    status: '-'
                                });
                            }
                        });

                        // Sort the flat matrix data by Jam, then Program, then Unit, then Guru
                        matrixData.sort((a, b) => {
                            if (a.jam !== b.jam) return a.jam.localeCompare(b.jam);
                            if (a.program !== b.program) return a.program.localeCompare(b.program);
                            if (a.unit !== b.unit) return a.unit.localeCompare(b.unit);
                            if (a.guru !== b.guru) return a.guru.localeCompare(b.guru);
                            // Put actual students before 'Kosong'
                            if (a.siswa === 'Kosong' && b.siswa !== 'Kosong') return 1;
                            if (a.siswa !== 'Kosong' && b.siswa === 'Kosong') return -1;
                            return 0;
                        });

                        // Export to Excel function
                        const handleExportExcel = () => {
                            const exportData = matrixData.map(row => {
                                const rowObj = {
                                    'Jam': row.jam,
                                    'Kelas': row.program,
                                    'Unit': row.unit,
                                    'Guru': row.guru
                                };
                                allHaris.forEach(h => {
                                    rowObj[h] = row.hari === h ? row.siswa : '-';
                                });
                                return rowObj;
                            });

                            const ws = XLSX.utils.json_to_sheet(exportData);
                            const wb = XLSX.utils.book_new();
                            XLSX.utils.book_append_sheet(wb, ws, 'Aktivasi Rutin');

                            // Auto-size columns
                            const colWidths = Object.keys(exportData[0] || {}).map(key => ({
                                wch: Math.max(key.length, ...exportData.map(r => String(r[key] || '').length)) + 2
                            }));
                            ws['!cols'] = colWidths;

                            XLSX.writeFile(wb, `Aktivasi_Jadwal_Rutin_${new Date().toISOString().split('T')[0]}.xlsx`);
                        };

                        return (
                            <>
                                {/* Search & Filters for Matrix */}
                                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                    <div style={{ position: 'relative', flex: '1', minWidth: '200px' }}>
                                        <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                                        <input
                                            type="text"
                                            placeholder="Cari siswa / guru / program..."
                                            value={search}
                                            onChange={(e) => setSearch(e.target.value)}
                                            style={{ width: '100%', padding: '0.5rem 0.5rem 0.5rem 2.25rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontSize: '0.85rem' }}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Filter size={16} style={{ color: 'var(--text-secondary)' }} />
                                        <select value={filterUnit} onChange={(e) => setFilterUnit(e.target.value)} style={{ padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontSize: '0.85rem', minWidth: '120px' }}>
                                            <option value="">Semua Unit</option>
                                            {[...new Set(aktivasis.filter(a => a.detail_jadwal?.jenis_program === 'Rutin').map(a => a.detail_jadwal?.unit).filter(Boolean))].map(u => <option key={u} value={u}>{u}</option>)}
                                        </select>
                                        <select value={filterProgram} onChange={(e) => setFilterProgram(e.target.value)} style={{ padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontSize: '0.85rem', minWidth: '120px' }}>
                                            <option value="">Semua Program</option>
                                            {[...new Set(aktivasis.filter(a => a.detail_jadwal?.jenis_program === 'Rutin').map(a => a.detail_jadwal?.nama_program).filter(Boolean))].map(p => <option key={p} value={p}>{p}</option>)}
                                        </select>
                                        <select value={filterGuru} onChange={(e) => setFilterGuru(e.target.value)} style={{ padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontSize: '0.85rem', minWidth: '120px' }}>
                                            <option value="">Semua Guru</option>
                                            {[...new Set(aktivasis.filter(a => a.detail_jadwal?.jenis_program === 'Rutin').map(a => a.detail_jadwal?.nama_guru).filter(Boolean))].map(g => <option key={g} value={g}>{g}</option>)}
                                        </select>
                                        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontSize: '0.85rem', minWidth: '120px' }}>
                                            <option value="">Semua Status</option>
                                            <option value="Aktif">Aktif</option>
                                            <option value="Lulus">Lulus</option>
                                            <option value="Keluar">Keluar</option>
                                            <option value="Cancel">Cancel</option>
                                        </select>
                                    </div>
                                    <button
                                        onClick={handleExportExcel}
                                        disabled={matrixData.length === 0}
                                        className="btn"
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: '#16a34a', color: 'white', fontSize: '0.85rem', fontWeight: 500, cursor: matrixData.length === 0 ? 'not-allowed' : 'pointer', opacity: matrixData.length === 0 ? 0.5 : 1 }}
                                    >
                                        <Download size={16} /> Export Excel
                                    </button>
                                </div>

                                <div style={{ border: '1px solid var(--glass-border)', borderRadius: '0.75rem', overflow: 'hidden' }}>
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', minWidth: '1000px', borderCollapse: 'collapse', fontSize: '0.875rem', textAlign: 'left' }}>
                                            <thead>
                                                <tr style={{ background: 'var(--primary)', color: 'white' }}>
                                                    <th style={{ padding: '0.75rem 1rem', width: '120px', borderRight: '1px solid rgba(255,255,255,0.2)' }}>Jam</th>
                                                    <th style={{ padding: '0.75rem 1rem', width: '150px', borderRight: '1px solid rgba(255,255,255,0.2)' }}>Kelas</th>
                                                    <th style={{ padding: '0.75rem 1rem', width: '120px', borderRight: '1px solid rgba(255,255,255,0.2)' }}>Unit</th>
                                                    <th style={{ padding: '0.75rem 1rem', borderRight: '1px solid rgba(255,255,255,0.2)', whiteSpace: 'nowrap' }}>Guru</th>
                                                    {allHaris.map(h => (
                                                        <th key={h} style={{ padding: '0.75rem 1rem', borderRight: '1px solid rgba(255,255,255,0.2)' }}>{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {matrixData.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={4 + allHaris.length} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                                            Belum ada data aktivasi rutin.
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    matrixData.map((row, idx) => {
                                                        // Determine row color based on time range
                                                        const getTimeRangeColor = (jam) => {
                                                            // Parse the start time from format like "09.00-09.30" or "09:00-09:30"
                                                            const startStr = jam.split('-')[0]?.trim().replace('.', ':').replace(',', ':');
                                                            const parts = startStr?.split(':');
                                                            if (!parts || parts.length < 2) return 'transparent';
                                                            const hour = parseInt(parts[0], 10);
                                                            const minute = parseInt(parts[1], 10);
                                                            const timeVal = hour * 60 + minute; // in minutes

                                                            if (timeVal >= 540 && timeVal < 720) return 'rgba(59, 130, 246, 0.18)';    // 09:00-12:00 → biru
                                                            if (timeVal >= 780 && timeVal < 900) return 'rgba(34, 197, 94, 0.18)';     // 13:00-15:00 → hijau
                                                            if (timeVal >= 930 && timeVal < 1050) return 'rgba(249, 115, 22, 0.18)';   // 15:30-17:30 → oranye
                                                            if (timeVal >= 1110 && timeVal < 1260) return 'rgba(168, 85, 247, 0.18)';  // 18:30-21:00 → ungu
                                                            return 'transparent';
                                                        };
                                                        const rowBg = getTimeRangeColor(row.jam);

                                                        return (
                                                            <tr key={idx} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)', backgroundColor: rowBg, transition: 'background-color 0.2s' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(79,70,229,0.06)'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = rowBg}>
                                                                <td style={{ padding: '0.75rem 1rem', fontWeight: '600', borderRight: '1px solid rgba(0,0,0,0.05)' }}>
                                                                    {row.jam}
                                                                </td>
                                                                <td style={{ padding: '0.75rem 1rem', color: 'var(--primary)', fontWeight: '500', borderRight: '1px solid rgba(0,0,0,0.05)' }}>
                                                                    {row.program}
                                                                </td>
                                                                <td style={{ padding: '0.75rem 1rem', borderRight: '1px solid rgba(0,0,0,0.05)', fontWeight: '500', color: 'var(--text-secondary)' }}>
                                                                    {row.unit}
                                                                </td>
                                                                <td style={{ padding: '0.75rem 1rem', borderRight: '1px solid rgba(0,0,0,0.05)', fontWeight: '500', whiteSpace: 'nowrap' }}>
                                                                    {row.guru}
                                                                </td>
                                                                {allHaris.map(h => {
                                                                    const isMatchingHari = row.hari === h;
                                                                    return (
                                                                        <td key={h} style={{ padding: '0.75rem 1rem', borderRight: '1px solid rgba(0,0,0,0.05)', textAlign: 'left' }}>
                                                                            {isMatchingHari ? (
                                                                                row.siswa === 'Kosong' ? (
                                                                                    <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.85rem' }}>Kosong</span>
                                                                                ) : (
                                                                                    <span style={{ fontSize: '0.85rem' }}>{row.siswa}</span>
                                                                                )
                                                                            ) : (
                                                                                <span style={{ color: '#d1d5db', fontSize: '0.8rem' }}>-</span>
                                                                            )}
                                                                        </td>
                                                                    );
                                                                })}
                                                            </tr>
                                                        );
                                                    })
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </>
                        );
                    })()
                )}
            </div>

            {/* Modal Form */}
            {isModalOpen && (
                <div className="modal-overlay" onClick={handleCloseModal} style={{ overflowY: 'auto', padding: '2rem 0' }}>
                    <div className="modal-content" style={{ maxWidth: '700px', margin: 'auto' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h2 className="text-xl font-bold">{editingId ? 'Edit Aktivasi Jadwal Rutin' : 'Aktivasi Rutin Baru'}</h2>
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

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Tanggal Mulai</label>
                                <input
                                    type="date"
                                    name="tgl_mulai"
                                    value={formData.tgl_mulai}
                                    onChange={handleInputChange}
                                    style={{ fontFamily: 'inherit', width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)' }}
                                    required
                                />
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
