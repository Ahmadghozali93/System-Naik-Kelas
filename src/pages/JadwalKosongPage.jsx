import { useState, useEffect } from 'react';
import { CalendarX2, Search, Filter } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function JadwalKosongPage() {
    const [jadwals, setJadwals] = useState([]);
    const [aktivasis, setAktivasis] = useState([]);
    const [appointments, setAppointments] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterUnit, setFilterUnit] = useState('');
    const [filterProgram, setFilterProgram] = useState('');
    const [filterGuru, setFilterGuru] = useState('');

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [jadwalRes, aktivasiRes, apptRes] = await Promise.all([
                supabase.from('jadwal_master').select('*').order('created_at', { ascending: false }),
                supabase.from('aktivasi_siswa').select('jadwal_id, status'),
                // Appointment aktif — untuk menandai slot "Terisi" (diturunkan, tidak disimpan)
                supabase.from('appointment')
                    .select('jadwal_id, tanggal, status, siswa:siswa_id(nama)')
                    .neq('status', 'batal')
                    .gte('tanggal', new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }))
            ]);

            if (jadwalRes.error) throw jadwalRes.error;
            if (aktivasiRes.error) throw aktivasiRes.error;
            // Tabel appointment mungkin belum dibuat — jangan gagalkan halaman
            if (apptRes.error) console.warn('appointment:', apptRes.error.message);

            setJadwals(jadwalRes.data || []);
            setAktivasis(aktivasiRes.data || []);
            setAppointments(apptRes.data || []);
        } catch (error) {
            console.error('Error fetching data:', error.message);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Calculate sisa kuota
    const getSisaKuota = (jadwalId, kuota) => {
        const activeCount = aktivasis.filter(a => a.jadwal_id === jadwalId && a.status === 'Aktif').length;
        return (kuota || 0) - activeCount;
    };

    // Status slot DITURUNKAN dari appointment aktif (tidak disimpan sebagai kolom)
    const getAppointments = (jadwalId) =>
        appointments
            .filter(a => a.jadwal_id === jadwalId)
            .sort((a, b) => (a.tanggal || '').localeCompare(b.tanggal || ''));

    // Show all jadwals with remaining quota > 0
    const jadwalsWithQuota = jadwals
        .map(j => ({
            ...j,
            sisaKuota: getSisaKuota(j.id, j.kuota)
        })).filter(j => j.sisaKuota > 0);

    // Derive unique filter options from jadwals with remaining quota
    const unitOptions = [...new Set(jadwalsWithQuota.map(j => j.unit).filter(Boolean))];
    const programOptions = [...new Set(jadwalsWithQuota.map(j => j.nama_program).filter(Boolean))];
    const guruOptions = [...new Set(jadwalsWithQuota.map(j => j.nama_guru).filter(Boolean))];

    // Apply filters
    const filtered = jadwalsWithQuota.filter(j => {
        const matchSearch = !search ||
            j.nama_guru?.toLowerCase().includes(search.toLowerCase()) ||
            j.nama_program?.toLowerCase().includes(search.toLowerCase()) ||
            j.jadwal_id?.toLowerCase().includes(search.toLowerCase());
        const matchUnit = !filterUnit || j.unit === filterUnit;
        const matchProgram = !filterProgram || j.nama_program === filterProgram;
        const matchGuru = !filterGuru || j.nama_guru === filterGuru;
        return matchSearch && matchUnit && matchProgram && matchGuru;
    });

    const selectStyle = { padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontSize: '0.85rem', minWidth: '130px' };

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">Jadwal Kosong</h1>
                <p className="text-secondary">Daftar jadwal master yang masih memiliki sisa kuota.</p>
            </div>

            <div className="glass-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                        <CalendarX2 className="text-primary" size={24} /> Jadwal Tersedia
                    </h2>
                    <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                        Menampilkan {filtered.length} dari {jadwalsWithQuota.length} jadwal
                    </span>
                </div>

                {/* Search & Filters */}
                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexDirection: 'column', width: '100%' }}>
                    <div style={{ position: 'relative', width: '100%' }}>
                        <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                        <input
                            type="text"
                            placeholder="Cari guru / program / ID jadwal..."
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
                        <select value={filterUnit} onChange={(e) => setFilterUnit(e.target.value)} style={selectStyle}>
                            <option value="">Semua Unit</option>
                            {unitOptions.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                        <select value={filterProgram} onChange={(e) => setFilterProgram(e.target.value)} style={selectStyle}>
                            <option value="">Semua Program</option>
                            {programOptions.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                        <select value={filterGuru} onChange={(e) => setFilterGuru(e.target.value)} style={selectStyle}>
                            <option value="">Semua Guru</option>
                            {guruOptions.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                    </div>
                </div>

                <div style={{ overflowX: 'auto', paddingBottom: '1rem' }}>
                    <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.05)' }}>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>No</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>ID Jadwal</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Guru</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Program (Jenis)</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Hari & Jam</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Unit</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Kuota</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Terisi</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Sisa</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Status Slot</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan="10" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                        Memuat data...
                                    </td>
                                </tr>
                            ) : filtered.length === 0 ? (
                                <tr>
                                    <td colSpan="10" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                        Tidak ada jadwal kosong yang cocok.
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((j, idx) => {
                                    const terisi = (j.kuota || 0) - j.sisaKuota;
                                    const appts = getAppointments(j.id);
                                    return (
                                        <tr key={j.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)', transition: 'background-color 0.2s' }}
                                            onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(79,70,229,0.02)'}
                                            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                        >
                                            <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>{idx + 1}</td>
                                            <td style={{ padding: '1rem', fontWeight: 500, color: 'var(--text-secondary)' }}>{j.jadwal_id}</td>
                                            <td style={{ padding: '1rem', fontWeight: 600 }}>{j.nama_guru}</td>
                                            <td style={{ padding: '1rem' }}>
                                                <div style={{ color: 'var(--primary)', fontWeight: 600 }}>{j.nama_program}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{j.jenis_program}</div>
                                            </td>
                                            <td style={{ padding: '1rem' }}>
                                                <div style={{ fontWeight: 500 }}>{j.hari || '-'}</div>
                                                <div style={{ color: 'var(--text-secondary)' }}>{j.jam || '-'}</div>
                                            </td>
                                            <td style={{ padding: '1rem' }}>{j.unit}</td>
                                            <td style={{ padding: '1rem', textAlign: 'center' }}>{j.kuota}</td>
                                            <td style={{ padding: '1rem', textAlign: 'center' }}>{terisi}</td>
                                            <td style={{ padding: '1rem', textAlign: 'center' }}>
                                                <span className="badge" style={{ background: '#d1fae5', color: '#047857', fontWeight: 700 }}>
                                                    {j.sisaKuota}
                                                </span>
                                            </td>
                                            <td style={{ padding: '1rem' }}>
                                                {appts.length === 0 ? (
                                                    <span className="badge" style={{ background: '#d1fae5', color: '#047857', fontWeight: 700 }}>Kosong</span>
                                                ) : (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                                        <span className="badge" style={{ background: '#fee2e2', color: '#b91c1c', fontWeight: 700, width: 'fit-content' }}>
                                                            Terisi ({appts.length})
                                                        </span>
                                                        {appts.map((a, i) => (
                                                            <span key={i} style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                                                {a.siswa?.nama || '-'}
                                                                {a.tanggal && ` · ${new Date(a.tanggal + 'T12:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}`}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
