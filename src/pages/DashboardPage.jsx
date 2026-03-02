import { useState, useEffect } from 'react';
import { Users, GraduationCap, CalendarDays, RefreshCw, ClipboardList, TrendingUp, Building, DollarSign, BookOpen, CalendarCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function DashboardPage() {
    const [stats, setStats] = useState({
        totalSiswa: 0,
        totalAktivasi: 0,
        aktivasiHariIni: 0,
        reschedulePending: 0,
        totalGuru: 0,
        totalProgram: 0,
        estimasiOmset: 0,
        totalUnit: 0,
        totalBooking: 0
    });
    const [recentAktivasi, setRecentAktivasi] = useState([]);
    const [unitSummary, setUnitSummary] = useState([]);
    const [unitOmset, setUnitOmset] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0
        }).format(amount);
    };

    useEffect(() => {
        const fetchStats = async () => {
            setIsLoading(true);
            try {
                const today = new Date().toISOString().split('T')[0];

                const [siswaRes, aktivasiRes, rescheduleRes, guruRes, programRes, unitRes, bookingRes] = await Promise.all([
                    supabase.from('siswa').select('id, unit', { count: 'exact' }).eq('status', 'Aktif'),
                    supabase.from('aktivasi_siswa').select('*').order('created_at', { ascending: false }),
                    supabase.from('reschedules').select('id', { count: 'exact', head: true }).eq('status', 'Pending'),
                    supabase.from('gurus').select('id', { count: 'exact', head: true }),
                    supabase.from('programs').select('id, nama', { count: 'exact' }),
                    supabase.from('units').select('id, nama'),
                    supabase.from('bookings').select('id', { count: 'exact', head: true })
                ]);

                const allAktivasi = aktivasiRes.data || [];
                const allSiswa = siswaRes.data || [];
                const allUnits = unitRes.data || [];
                const allPrograms = programRes.data || [];
                const aktivasiHariIni = allAktivasi.filter(a => a.tgl_mulai === today).length;

                // Estimasi Omset = sum of all SPP from active aktivasi
                const estimasiOmset = allAktivasi
                    .filter(a => a.status === 'Aktif')
                    .reduce((sum, a) => sum + (parseFloat(a.spp) || 0), 0);

                setStats({
                    totalSiswa: siswaRes.count || allSiswa.length,
                    totalAktivasi: allAktivasi.length,
                    aktivasiHariIni,
                    reschedulePending: rescheduleRes.count || 0,
                    totalGuru: guruRes.count || 0,
                    totalProgram: programRes.count || allPrograms.length,
                    estimasiOmset,
                    totalUnit: allUnits.length,
                    totalBooking: bookingRes.count || 0
                });

                // Build unit summary: group by unit, show programs & student count
                const unitMap = {};
                allUnits.forEach(u => {
                    unitMap[u.nama] = { nama: u.nama, programs: {} };
                });

                // Count siswa per unit per program from aktivasi data
                allAktivasi.filter(a => a.status === 'Aktif').forEach(a => {
                    const unitName = a.detail_jadwal?.unit;
                    const programName = a.detail_jadwal?.nama_program;
                    if (!unitName || !programName) return;

                    if (!unitMap[unitName]) {
                        unitMap[unitName] = { nama: unitName, programs: {} };
                    }
                    if (!unitMap[unitName].programs[programName]) {
                        unitMap[unitName].programs[programName] = new Set();
                    }
                    unitMap[unitName].programs[programName].add(a.siswa_id || a.nama_siswa);
                });

                // Also count siswa registered per unit (from siswa table)
                const siswaPerUnit = {};
                allSiswa.forEach(s => {
                    if (s.unit) {
                        siswaPerUnit[s.unit] = (siswaPerUnit[s.unit] || 0) + 1;
                    }
                });

                const summaryList = Object.values(unitMap).map(u => ({
                    nama: u.nama,
                    totalSiswa: siswaPerUnit[u.nama] || 0,
                    programs: Object.entries(u.programs).map(([name, siswaSet]) => ({
                        nama: name,
                        jumlahSiswa: siswaSet.size
                    }))
                }));

                // Omset per unit
                const omsetMap = {};
                allAktivasi.filter(a => a.status === 'Aktif').forEach(a => {
                    const unitName = a.detail_jadwal?.unit;
                    if (!unitName) return;
                    omsetMap[unitName] = (omsetMap[unitName] || 0) + (parseFloat(a.spp) || 0);
                });
                setUnitOmset(Object.entries(omsetMap).map(([nama, omset]) => ({ nama, omset })));

                setUnitSummary(summaryList);
                setRecentAktivasi(allAktivasi.slice(0, 5));
            } catch (error) {
                console.error('Error fetching stats:', error.message);
            } finally {
                setIsLoading(false);
            }
        };

        fetchStats();
    }, []);

    const cards = [
        { label: 'Siswa Aktif', value: stats.totalSiswa, icon: GraduationCap, color: '#4f46e5', bg: 'rgba(79,70,229,0.1)' },
        { label: 'Total Guru', value: stats.totalGuru, icon: Users, color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' },
        { label: 'Total Program', value: stats.totalProgram, icon: TrendingUp, color: '#06b6d4', bg: 'rgba(6,182,212,0.1)' },
        { label: 'Total Unit', value: stats.totalUnit, icon: Building, color: '#0891b2', bg: 'rgba(8,145,178,0.1)' },
        { label: 'Booking', value: stats.totalBooking, icon: CalendarCheck, color: '#d97706', bg: 'rgba(217,119,6,0.1)' },
        { label: 'Reschedule Pending', value: stats.reschedulePending, icon: RefreshCw, color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
        { label: 'Total Aktivasi', value: stats.totalAktivasi, icon: ClipboardList, color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
        { label: 'Aktivasi Hari Ini', value: stats.aktivasiHariIni, icon: CalendarDays, color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
    ];

    // Unit color palette
    const unitColors = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#0891b2'];

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">Dashboard</h1>
                <p className="text-secondary">Ringkasan data dan statistik aplikasi.</p>
            </div>

            {/* Stat Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
                {cards.map((card, idx) => (
                    <div key={idx} className="glass-card" style={{
                        display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.25rem'
                    }}>
                        <div style={{
                            width: '52px', height: '52px', borderRadius: '0.75rem',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: card.bg, flexShrink: 0
                        }}>
                            <card.icon size={26} style={{ color: card.color }} />
                        </div>
                        <div>
                            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: card.color, lineHeight: 1.1 }}>
                                {isLoading ? '...' : card.value}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500, marginTop: '0.15rem' }}>
                                {card.label}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Estimasi Omset + Detail Unit Omset */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
                {/* Estimasi Omset Total */}
                <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', padding: '1.5rem' }}>
                    <div style={{
                        width: '60px', height: '60px', borderRadius: '0.75rem',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(5,150,105,0.12)', flexShrink: 0
                    }}>
                        <DollarSign size={30} style={{ color: '#059669' }} />
                    </div>
                    <div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500, marginBottom: '0.2rem' }}>Estimasi Omset</div>
                        <div style={{ fontSize: '1.65rem', fontWeight: 700, color: '#059669', lineHeight: 1.1 }}>
                            {isLoading ? '...' : formatCurrency(stats.estimasiOmset)}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>Total SPP dari aktivasi aktif</div>
                    </div>
                </div>

                {/* Detail Omset per Unit */}
                <div className="glass-card" style={{ padding: '1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem' }}>
                        <Building size={18} style={{ color: 'var(--primary)' }} />
                        <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Omset per Unit</span>
                    </div>
                    {isLoading ? (
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Memuat...</div>
                    ) : unitOmset.length === 0 ? (
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontStyle: 'italic' }}>Belum ada data omset.</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                            {unitOmset.map((u, idx) => {
                                const color = unitColors[idx % unitColors.length];
                                const pct = stats.estimasiOmset > 0 ? Math.round((u.omset / stats.estimasiOmset) * 100) : 0;
                                return (
                                    <div key={u.nama}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                                            <span style={{ fontWeight: 600, fontSize: '0.85rem', color }}>{u.nama}</span>
                                            <span style={{ fontWeight: 700, fontSize: '0.85rem', color }}>{formatCurrency(u.omset)}</span>
                                        </div>
                                        <div style={{ width: '100%', height: '8px', borderRadius: '4px', background: 'rgba(0,0,0,0.04)' }}>
                                            <div style={{
                                                width: `${pct}%`, height: '100%', borderRadius: '4px',
                                                background: `linear-gradient(90deg, ${color}, ${color}aa)`,
                                                transition: 'width 0.6s ease'
                                            }} />
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>{pct}% dari total</div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Ringkasan Unit & Program */}
            <div style={{ marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Building size={22} className="text-primary" /> Ringkasan Unit & Program
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem' }}>
                    {isLoading ? (
                        <div className="glass-card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                            Memuat data unit...
                        </div>
                    ) : unitSummary.length === 0 ? (
                        <div className="glass-card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                            Belum ada data unit.
                        </div>
                    ) : unitSummary.map((unit, idx) => {
                        const color = unitColors[idx % unitColors.length];
                        return (
                            <div key={unit.nama} className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                                {/* Unit Header */}
                                <div style={{
                                    padding: '1rem 1.25rem',
                                    background: `linear-gradient(135deg, ${color}15, ${color}08)`,
                                    borderBottom: `2px solid ${color}25`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                        <div style={{
                                            width: '36px', height: '36px', borderRadius: '0.5rem',
                                            background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}>
                                            <Building size={18} style={{ color }} />
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 700, fontSize: '1.05rem', color }}>{unit.nama}</div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                                {unit.totalSiswa} siswa terdaftar
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{
                                        background: `${color}15`, padding: '0.25rem 0.6rem',
                                        borderRadius: '0.375rem', fontSize: '0.75rem', fontWeight: 600, color
                                    }}>
                                        {unit.programs.length} program
                                    </div>
                                </div>

                                {/* Program List */}
                                <div style={{ padding: '0.75rem 1.25rem' }}>
                                    {unit.programs.length === 0 ? (
                                        <div style={{ padding: '0.5rem 0', fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                                            Belum ada siswa aktif di unit ini.
                                        </div>
                                    ) : unit.programs.map((prog, pIdx) => (
                                        <div key={prog.nama} style={{
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            padding: '0.55rem 0',
                                            borderBottom: pIdx < unit.programs.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <BookOpen size={14} style={{ color: 'var(--text-secondary)' }} />
                                                <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{prog.nama}</span>
                                            </div>
                                            <span className="badge" style={{
                                                background: `${color}12`, color,
                                                fontWeight: 600, fontSize: '0.75rem'
                                            }}>
                                                {prog.jumlahSiswa} siswa
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Recent Aktivasi */}
            <div className="glass-card">
                <h2 style={{ fontSize: '1.15rem', fontWeight: '600', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <ClipboardList size={20} className="text-primary" /> Aktivasi Terbaru
                </h2>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.05)' }}>
                                <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>Siswa</th>
                                <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>Program</th>
                                <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>Tanggal</th>
                                <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr><td colSpan="4" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Memuat...</td></tr>
                            ) : recentAktivasi.length === 0 ? (
                                <tr><td colSpan="4" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Belum ada data.</td></tr>
                            ) : recentAktivasi.map(a => (
                                <tr key={a.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{a.nama_siswa}</td>
                                    <td style={{ padding: '0.75rem 1rem', color: 'var(--primary)' }}>{a.detail_jadwal?.nama_program || '-'}</td>
                                    <td style={{ padding: '0.75rem 1rem' }}>{a.tgl_mulai || '-'}</td>
                                    <td style={{ padding: '0.75rem 1rem' }}>
                                        <span className="badge" style={{
                                            background: a.status === 'Aktif' ? '#d1fae5' : '#f3f4f6',
                                            color: a.status === 'Aktif' ? '#047857' : '#374151'
                                        }}>{a.status}</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
