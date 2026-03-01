import { useState, useEffect } from 'react';
import { CalendarDays, Edit, Trash2, X, Plus, GraduationCap } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function AktivasiRutinPage() {
    const [aktivasis, setAktivasis] = useState([]);
    const [siswas, setSiswas] = useState([]);
    const [jadwals, setJadwals] = useState([]);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

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
                    <button className="btn btn-primary" onClick={() => handleOpenModal()}>
                        <Plus size={18} /> Aktivasi Baru
                    </button>
                </div>

                <div style={{ overflowX: 'auto', paddingBottom: '1rem' }}>
                    <table style={{ width: '100%', minWidth: '1200px', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.05)' }}>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Assign ID</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Siswa</th>
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
                            ) : (
                                aktivasis.filter(a => a.detail_jadwal?.jenis_program === 'Rutin').length === 0 ? (
                                    <tr>
                                        <td colSpan="8" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                            Belum ada data aktivasi siswa rutin.
                                        </td>
                                    </tr>
                                ) : (
                                    aktivasis.filter(a => a.detail_jadwal?.jenis_program === 'Rutin').map((a) => {
                                        const dj = a.detail_jadwal || {};
                                        return (
                                            <tr key={a.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)', transition: 'background-color 0.2s' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(79,70,229,0.02)'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                                <td style={{ padding: '1rem', fontWeight: 500, color: 'var(--text-secondary)' }}>{a.assign_id}</td>
                                                <td style={{ padding: '1rem' }}>
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
                            )}
                        </tbody>
                    </table>
                </div>
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
