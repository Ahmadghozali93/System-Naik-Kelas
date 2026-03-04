import { useState, useEffect } from 'react';
import { CalendarCheck, MessageCircle, Search, Filter } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function BookingPage() {
    const [siswas, setSiswas] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterUnit, setFilterUnit] = useState('');
    const [filterProgram, setFilterProgram] = useState('');

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('siswa')
                .select('*')
                .eq('status', 'Booking')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setSiswas(data || []);
        } catch (error) {
            console.error('Error fetching booking siswa:', error.message);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Derive unique filter options
    const unitOptions = [...new Set(siswas.map(s => s.unit).filter(Boolean))];
    const programOptions = [...new Set(siswas.map(s => s.booking_program).filter(Boolean))];

    // Apply filters
    const filtered = siswas.filter(s => {
        const matchSearch = !search || s.nama?.toLowerCase().includes(search.toLowerCase()) || s.siswa_id?.toLowerCase().includes(search.toLowerCase());
        const matchUnit = !filterUnit || s.unit === filterUnit;
        const matchProgram = !filterProgram || s.booking_program === filterProgram;
        return matchSearch && matchUnit && matchProgram;
    });

    const selectStyle = { padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontSize: '0.85rem', minWidth: '140px' };

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">Booking</h1>
                <p className="text-secondary">Daftar siswa dengan status Booking.</p>
            </div>

            <div className="glass-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                        <CalendarCheck className="text-primary" size={24} /> Data Siswa Booking
                    </h2>
                    <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                        Menampilkan {filtered.length} dari {siswas.length} siswa
                    </span>
                </div>

                {/* Search & Filters */}
                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexDirection: 'column', width: '100%' }}>
                    <div style={{ position: 'relative', width: '100%' }}>
                        <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                        <input
                            type="text"
                            placeholder="Cari nama / ID siswa..."
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
                    </div>
                </div>

                <div style={{ overflowX: 'auto', paddingBottom: '1rem' }}>
                    <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.05)' }}>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>No</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>ID Siswa</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Nama</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Unit</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Program</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Jam</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>No. WA</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Catatan</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan="9" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                        Memuat data...
                                    </td>
                                </tr>
                            ) : filtered.length === 0 ? (
                                <tr>
                                    <td colSpan="9" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                        Tidak ada data siswa booking yang cocok.
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((s, idx) => (
                                    <tr key={s.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)', transition: 'background-color 0.2s' }}
                                        onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(79,70,229,0.02)'}
                                        onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                    >
                                        <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>{idx + 1}</td>
                                        <td style={{ padding: '1rem', fontWeight: 500, color: 'var(--text-secondary)' }}>{s.siswa_id}</td>
                                        <td style={{ padding: '1rem', fontWeight: 600 }}>{s.nama}</td>
                                        <td style={{ padding: '1rem' }}>{s.unit || '-'}</td>
                                        <td style={{ padding: '1rem' }}>{s.booking_program || '-'}</td>
                                        <td style={{ padding: '1rem' }}>{s.booking_jam || '-'}</td>
                                        <td style={{ padding: '1rem' }}>
                                            {s.nowa ? (
                                                <a
                                                    href={`https://wa.me/${s.nowa.replace(/^0/, '62')}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    style={{ color: '#25D366', display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none', fontWeight: 500 }}
                                                    title={s.nowa}
                                                >
                                                    <MessageCircle size={18} /> Chat
                                                </a>
                                            ) : '-'}
                                        </td>
                                        <td style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{s.catatan || '-'}</td>
                                        <td style={{ padding: '1rem' }}>
                                            <span className="badge" style={{ background: '#fef3c7', color: '#92400e' }}>
                                                {s.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
