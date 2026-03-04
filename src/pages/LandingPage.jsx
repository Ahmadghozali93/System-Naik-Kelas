import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { GraduationCap, ArrowRight, CalendarDays, CheckCircle2, Shield } from 'lucide-react';

export default function LandingPage() {
    const { user } = useAuth();

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc', fontFamily: "'Inter', sans-serif" }}>
            {/* Navbar */}
            <nav style={{ padding: '1.25rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 50 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--primary)', fontWeight: 700, fontSize: '1.25rem' }}>
                    <GraduationCap size={28} />
                    <span>BimbelPro</span>
                </div>
                <div>
                    <Link to={user ? "/dashboard" : "/login"} style={{
                        padding: '0.6rem 1.2rem',
                        backgroundColor: 'var(--primary)',
                        color: 'white',
                        textDecoration: 'none',
                        borderRadius: '0.5rem',
                        fontWeight: 600,
                        transition: 'background-color 0.2s'
                    }}>
                        {user ? "Ke Dashboard" : "Masuk"}
                    </Link>
                </div>
            </nav>

            {/* Hero Section */}
            <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 2rem', textAlign: 'center' }}>
                <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 1rem',
                    backgroundColor: 'rgba(79, 70, 229, 0.1)',
                    color: 'var(--primary)',
                    borderRadius: '2rem',
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    marginBottom: '1.5rem'
                }}>
                    <span style={{ display: 'flex', width: '8px', height: '8px', backgroundColor: 'var(--primary)', borderRadius: '50%' }}></span>
                    Platform Manajemen Bimbel Terbaik
                </div>

                <h1 style={{ fontSize: '3.5rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.1, maxWidth: '800px', marginBottom: '1.5rem', letterSpacing: '-0.02em' }}>
                    Kelola Jadwal dan Siswa <br />
                    <span style={{ color: 'var(--primary)' }}>Lebih Mudah & Modern</span>
                </h1>

                <p style={{ fontSize: '1.125rem', color: '#64748b', maxWidth: '600px', marginBottom: '2.5rem', lineHeight: 1.6 }}>
                    BimbelPro memberikan kemudahan dalam manajemen aktivasi siswa, pengaturan jadwal guru, serta pemantauan unit secara realtime dan terintegrasi.
                </p>

                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                    <Link to={user ? "/dashboard" : "/login"} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.875rem 1.5rem',
                        backgroundColor: 'var(--primary)',
                        color: 'white',
                        textDecoration: 'none',
                        borderRadius: '0.75rem',
                        fontWeight: 600,
                        fontSize: '1rem',
                        boxShadow: '0 4px 6px -1px rgba(79, 70, 229, 0.2)'
                    }}>
                        {user ? "Masuk ke Dashboard" : "Mulai Sekarang"} <ArrowRight size={18} />
                    </Link>
                </div>

                {/* Features Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem', width: '100%', maxWidth: '1000px', marginTop: '5rem', textAlign: 'left' }}>
                    <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '1rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', border: '1px solid #f1f5f9' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '0.75rem', backgroundColor: 'rgba(79, 70, 229, 0.1)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.25rem' }}>
                            <CalendarDays size={24} />
                        </div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.75rem' }}>Manajemen Jadwal</h3>
                        <p style={{ color: '#64748b', lineHeight: 1.5 }}>Atur jadwal harian 10 hari dan rutin, reschedule, serta kelola booking pertemuan dengan gampang.</p>
                    </div>

                    <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '1rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', border: '1px solid #f1f5f9' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '0.75rem', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.25rem' }}>
                            <CheckCircle2 size={24} />
                        </div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.75rem' }}>Aktivasi Terpadu</h3>
                        <p style={{ color: '#64748b', lineHeight: 1.5 }}>Aktivasi paket siswa dan lacak kuota kehadiran real-time tanpa pusing pencatatan manual.</p>
                    </div>

                    <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '1rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', border: '1px solid #f1f5f9' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '0.75rem', backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.25rem' }}>
                            <Shield size={24} />
                        </div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.75rem' }}>Sistem Akses Role</h3>
                        <p style={{ color: '#64748b', lineHeight: 1.5 }}>Multi-user dengan role (Admin, Guru, dll) memastikan data aman dan dapat diakses sesuai kewenangan.</p>
                    </div>
                </div>
            </main>

            <footer style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', borderTop: '1px solid #e2e8f0', fontSize: '0.875rem' }}>
                &copy; {new Date().getFullYear()} BimbelPro. All rights reserved.
            </footer>
        </div>
    );
}
