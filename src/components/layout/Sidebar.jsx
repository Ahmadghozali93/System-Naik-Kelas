import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
    Users,
    Building,
    GraduationCap,
    BookOpen,
    CalendarDays,
    ClipboardList,
    Trello,
    Shield,
    LogOut,
    CalendarCheck,
    CalendarX2,
    RefreshCw,
    LayoutDashboard,
    Settings,
    X,
    Database,
    CalendarRange,
    Wrench,
    FileText,
    Wallet,
    Receipt,
    BarChart3,
    ClipboardCheck,
    FileSpreadsheet,
    Clock,
    ScanFace,
    CalendarClock,
    Umbrella,
    Timer,
    PenSquare,
    BarChart2,
    CalendarOff,
    KeyRound,
    Target,
    ListChecks,
    TrendingUp,
    Layers,
    UserCog,
    CreditCard,
    Award,
    CheckSquare2,
    LayoutGrid,
    List,
    FolderOpen,
} from 'lucide-react';
import { useAuth } from '../../context/authStore';
import { supabase } from '../../lib/supabase';

function GantiPasswordModal({ onClose }) {
    const [passwordBaru, setPasswordBaru] = useState('');
    const [konfirmasi, setKonfirmasi] = useState('');
    const [loading, setLoading] = useState(false);
    const [pesan, setPesan] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (passwordBaru.length < 6) return setPesan('Password minimal 6 karakter.');
        if (passwordBaru !== konfirmasi) return setPesan('Konfirmasi password tidak cocok.');
        setLoading(true);
        const { error } = await supabase.auth.updateUser({ password: passwordBaru });
        setLoading(false);
        if (error) return setPesan('Gagal: ' + error.message);
        setPesan('✅ Password berhasil diganti!');
        setTimeout(onClose, 1500);
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'var(--bg-card, #fff)', borderRadius: '1rem', padding: '2rem', width: '100%', maxWidth: '380px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Ganti Password</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
                </div>
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 600 }}>Password Baru</label>
                        <input
                            type="password"
                            value={passwordBaru}
                            onChange={e => setPasswordBaru(e.target.value)}
                            placeholder="Minimal 6 karakter"
                            required
                            style={{ width: '100%', padding: '0.6rem 0.75rem', border: '1px solid #ddd', borderRadius: '0.5rem', fontSize: '0.9rem', boxSizing: 'border-box' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 600 }}>Konfirmasi Password</label>
                        <input
                            type="password"
                            value={konfirmasi}
                            onChange={e => setKonfirmasi(e.target.value)}
                            placeholder="Ulangi password baru"
                            required
                            style={{ width: '100%', padding: '0.6rem 0.75rem', border: '1px solid #ddd', borderRadius: '0.5rem', fontSize: '0.9rem', boxSizing: 'border-box' }}
                        />
                    </div>
                    {pesan && <p style={{ margin: 0, fontSize: '0.85rem', color: pesan.startsWith('✅') ? 'green' : 'red' }}>{pesan}</p>}
                    <button
                        type="submit"
                        disabled={loading}
                        style={{ padding: '0.7rem', background: 'var(--primary, #4f46e5)', color: '#fff', border: 'none', borderRadius: '0.5rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
                    >
                        {loading ? 'Menyimpan...' : 'Simpan Password'}
                    </button>
                </form>
            </div>
        </div>
    );
}

const SidebarGroup = ({ title, icon: Icon, isOpen, onToggle, children }) => (
    <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '0.25rem', marginTop: '0.25rem' }}>
        <button
            onClick={onToggle}
            className="nav-item"
            style={{
                background: 'transparent',
                border: 'none',
                width: '100%',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.6rem 1rem',
                cursor: 'pointer',
                color: isOpen ? 'var(--primary)' : 'var(--text-secondary)',
                fontWeight: 600,
                fontSize: '0.9rem',
                transition: 'all 0.2s',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {Icon && <Icon className="w-5 h-5" />}
                <span>{title}</span>
            </div>
            {/* Arrows removed as requested */}
        </button>
        <div style={{
            display: 'grid',
            gridTemplateRows: isOpen ? '1fr' : '0fr',
            transition: 'grid-template-rows 0.3s ease-out'
        }}>
            <div style={{ overflow: 'hidden' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', marginTop: '0.15rem' }}>
                    {children}
                </div>
            </div>
        </div>
    </div>
);

const Sidebar = ({ isOpen, setIsOpen }) => {
    const { user, permissions, logout } = useAuth();
    const navigate = useNavigate();
    const [showGantiPassword, setShowGantiPassword] = useState(false);

    // Store only the active group ID, or null if none are active
    const [activeGroup, setActiveGroup] = useState('masterData');
    const [isSppOpen, setIsSppOpen] = useState(false);
    const [isAktivasiOpen, setIsAktivasiOpen] = useState(false);
    const [isAbsensiOpen, setIsAbsensiOpen] = useState(false);

    const toggleGroup = (group) => {
        setActiveGroup(prevGroup => (prevGroup === group ? null : group));
        // Also close the nested aktivasi dropdown when switching top-level groups
        if (group !== 'jadwal') setIsAktivasiOpen(false);
    };

    const toggleAktivasi = () => {
        setIsAktivasiOpen(prev => !prev);
    };

    // App settings — cache localStorage, sumber kebenaran Supabase
    const [appSettings, setAppSettings] = useState(() => {
        try { return JSON.parse(localStorage.getItem('app_settings') || '{}'); }
        catch { return {}; }
    });

    useEffect(() => {
        // Fetch dari Supabase agar semua user dapat nilai terbaru
        supabase.from('app_settings')
            .select('key, value')
            .in('key', ['app_name', 'logo_url'])
            .then(({ data }) => {
                if (!data) return;
                const row = {};
                data.forEach(r => { row[r.key] = r.value; });
                const merged = {
                    appName:  row.app_name  || '',
                    logoUrl:  row.logo_url  || '',
                };
                setAppSettings(merged);
                localStorage.setItem('app_settings', JSON.stringify(merged));
            });

        const handleSettingsChange = () => {
            try { setAppSettings(JSON.parse(localStorage.getItem('app_settings') || '{}')); }
            catch { setAppSettings({}); }
        };
        window.addEventListener('app_settings_changed', handleSettingsChange);
        return () => window.removeEventListener('app_settings_changed', handleSettingsChange);
    }, []);

    const displayName = appSettings.appName || 'Naik Kelas';

    const handleLogout = () => {
        logout();
        navigate('/login', { replace: true });
    };

    const hasPermission = (path) => {
        if (user?.role === 'Owner') return true;
        return permissions.includes(path);
    };

    const masterDataLinks = [
        { to: '/user', icon: Users, label: 'User / Guru' },
        { to: '/unit', icon: Building, label: 'Unit' },
        { to: '/siswa', icon: GraduationCap, label: 'Siswa' },
        { to: '/program', icon: BookOpen, label: 'Program' },
        { to: '/jadwal-master', icon: CalendarDays, label: 'Master Jadwal' },
    ].filter(link => hasPermission(link.to));

    const extraJadwalLinks = [
        { to: '/kanban', icon: Trello, label: 'Jadwal 10 Hari' },
        { to: '/booking', icon: CalendarCheck, label: 'Booking' },
        { to: '/jadwal-kosong', icon: CalendarX2, label: 'Jadwal Kosong' },
        { to: '/reschedule', icon: RefreshCw, label: 'Reschedule' },
    ].filter(link => hasPermission(link.to));

    const pengaturanLinks = [
        { to: '/role-setup', icon: Shield, label: 'Setup Hak Akses' },
        { to: '/pengaturan', icon: Settings, label: 'Pengaturan' },
    ].filter(link => hasPermission(link.to));

    const showAktivasiSiswa = hasPermission('/aktivasi-rutin') || hasPermission('/aktivasi-harian');

    return (
        <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
            <div className="sidebar-header" style={{ justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {appSettings.logoUrl ? (
                        <img src={appSettings.logoUrl} alt="Logo" style={{ width: '32px', height: '32px', borderRadius: '0.5rem', objectFit: 'cover' }} />
                    ) : (
                        <GraduationCap className="w-8 h-8" />
                    )}
                    <span>{displayName}</span>
                </div>
                <button className="mobile-close-btn" onClick={() => setIsOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                    <X className="w-6 h-6" />
                </button>
            </div>

            {user && (
                <div style={{ padding: '0 1.5rem', marginTop: '1.25rem', marginBottom: '0.5rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{user.nama}</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.1rem' }}>{user.role}</div>
                    </div>
                    <button
                        onClick={() => setShowGantiPassword(true)}
                        title="Ganti Password"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0.25rem', borderRadius: '0.4rem', display: 'flex', alignItems: 'center' }}
                    >
                        <KeyRound size={16} />
                    </button>
                </div>
            )}
            {showGantiPassword && <GantiPasswordModal onClose={() => setShowGantiPassword(false)} />}

            <nav className="sidebar-nav" style={{ paddingBottom: '2rem' }}>
                {user?.role !== 'Tutor' && (
                    <NavLink
                        to="/dashboard"
                        className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                        onClick={() => setIsOpen && setIsOpen(false)}
                    >
                        <LayoutDashboard className="w-5 h-5" />
                        <span style={{ fontWeight: 500 }}>Dashboard</span>
                    </NavLink>
                )}

                {masterDataLinks.length > 0 && (
                    <SidebarGroup
                        title="Master Data"
                        icon={Database}
                        isOpen={activeGroup === 'masterData'}
                        onToggle={() => toggleGroup('masterData')}
                    >
                        {masterDataLinks.map(link => (
                            <NavLink
                                key={link.to}
                                to={link.to}
                                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                                style={{ padding: '0.5rem 1rem 0.5rem 2.85rem', fontSize: '0.9rem' }}
                                onClick={() => setIsOpen && setIsOpen(false)}
                            >
                                <link.icon className="w-4 h-4" />
                                <span>{link.label}</span>
                            </NavLink>
                        ))}
                    </SidebarGroup>
                )}

                {(extraJadwalLinks.length > 0 || showAktivasiSiswa) && (
                    <SidebarGroup
                        title="Jadwal"
                        icon={CalendarRange}
                        isOpen={activeGroup === 'jadwal'}
                        onToggle={() => toggleGroup('jadwal')}
                    >
                        {/* Aktivasi Siswa */}
                        {showAktivasiSiswa && (
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <div
                                    className="nav-item"
                                    onClick={toggleAktivasi}
                                    style={{
                                        cursor: 'pointer',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        width: '100%',
                                        padding: '0.5rem 1rem 0.5rem 2.85rem',
                                        color: isAktivasiOpen ? 'var(--primary)' : 'inherit',
                                        backgroundColor: isAktivasiOpen ? 'var(--nav-hover)' : 'transparent'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <ClipboardList className="w-4 h-4" />
                                        <span>Aktivasi</span>
                                    </div>
                                    {/* Arrow removed */}
                                </div>

                                <div style={{
                                    display: 'grid',
                                    gridTemplateRows: isAktivasiOpen ? '1fr' : '0fr',
                                    transition: 'grid-template-rows 0.3s ease-out'
                                }}>
                                    <div style={{ overflow: 'hidden' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', marginTop: '0.15rem' }}>
                                            {hasPermission('/aktivasi-rutin') && (
                                                <NavLink
                                                    to="/aktivasi-rutin"
                                                    className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                                                    style={{ padding: '0.45rem 1rem 0.45rem 4.5rem', fontSize: '0.85rem' }}
                                                    onClick={() => setIsOpen && setIsOpen(false)}
                                                >
                                                    Jadwal Rutin
                                                </NavLink>
                                            )}
                                            {hasPermission('/aktivasi-harian') && (
                                                <NavLink
                                                    to="/aktivasi-harian"
                                                    className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                                                    style={{ padding: '0.45rem 1rem 0.45rem 4.5rem', fontSize: '0.85rem' }}
                                                    onClick={() => setIsOpen && setIsOpen(false)}
                                                >
                                                    Jadwal Harian
                                                </NavLink>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {extraJadwalLinks.map(link => (
                            <NavLink
                                key={link.to}
                                to={link.to}
                                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                                style={{ padding: '0.5rem 1rem 0.5rem 2.85rem', fontSize: '0.9rem' }}
                                onClick={() => setIsOpen && setIsOpen(false)}
                            >
                                <link.icon className="w-4 h-4" />
                                <span>{link.label}</span>
                            </NavLink>
                        ))}
                    </SidebarGroup>
                )}

                {hasPermission('/jurnal') && (
                    <NavLink
                        to="/jurnal"
                        className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                        onClick={() => setIsOpen && setIsOpen(false)}
                    >
                        <FileText className="w-5 h-5" />
                        <span style={{ fontWeight: 500 }}>Jurnal</span>
                    </NavLink>
                )}

                {/* SPP GROUP */}
                {['/spp/tagihan','/spp/rekonsiliasi','/spp/faktur-odoo','/spp/laporan'].some(p => hasPermission(p)) && (
                    <SidebarGroup
                        title="SPP"
                        icon={Wallet}
                        isOpen={activeGroup === 'spp'}
                        onToggle={() => toggleGroup('spp')}
                    >
                        {hasPermission('/spp/tagihan') && (
                            <NavLink to="/spp/tagihan" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ padding: '0.5rem 1rem 0.5rem 2.85rem', fontSize: '0.9rem' }} onClick={() => setIsOpen && setIsOpen(false)}>
                                <Receipt className="w-4 h-4" /><span>Tagihan Siswa</span>
                            </NavLink>
                        )}
                        {hasPermission('/spp/rekonsiliasi') && (
                            <NavLink to="/spp/rekonsiliasi" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ padding: '0.5rem 1rem 0.5rem 2.85rem', fontSize: '0.9rem' }} onClick={() => setIsOpen && setIsOpen(false)}>
                                <ClipboardCheck className="w-4 h-4" /><span>Setor SPP</span>
                            </NavLink>
                        )}
                        {hasPermission('/spp/faktur-odoo') && (
                            <NavLink to="/spp/faktur-odoo" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ padding: '0.5rem 1rem 0.5rem 2.85rem', fontSize: '0.9rem' }} onClick={() => setIsOpen && setIsOpen(false)}>
                                <FileSpreadsheet className="w-4 h-4" /><span>Faktur Odoo</span>
                            </NavLink>
                        )}
                        {hasPermission('/spp/laporan') && (
                            <NavLink to="/spp/laporan" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ padding: '0.5rem 1rem 0.5rem 2.85rem', fontSize: '0.9rem' }} onClick={() => setIsOpen && setIsOpen(false)}>
                                <BarChart3 className="w-4 h-4" /><span>Laporan SPP</span>
                            </NavLink>
                        )}
                    </SidebarGroup>
                )}

                {/* ABSENSI GROUP */}
                {['/absensi/check','/absensi/dashboard','/absensi/shift','/absensi/jadwal-shift','/absensi/izin','/absensi/lembur','/absensi/koreksi','/absensi/rekap','/absensi/hari-libur'].some(p => hasPermission(p)) && (
                    <SidebarGroup
                        title="Absensi"
                        icon={Clock}
                        isOpen={activeGroup === 'absensi'}
                        onToggle={() => { setActiveGroup(p => p === 'absensi' ? null : 'absensi'); setIsAktivasiOpen(false); }}
                    >
                        {hasPermission('/absensi/check') && (
                            <NavLink to="/absensi/check" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ padding: '0.5rem 1rem 0.5rem 2.85rem', fontSize: '0.9rem' }} onClick={() => setIsOpen && setIsOpen(false)}>
                                <ScanFace className="w-4 h-4" /><span>Check-in / Check-out</span>
                            </NavLink>
                        )}
                        {hasPermission('/absensi/dashboard') && (
                            <NavLink to="/absensi/dashboard" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ padding: '0.5rem 1rem 0.5rem 2.85rem', fontSize: '0.9rem' }} onClick={() => setIsOpen && setIsOpen(false)}>
                                <BarChart2 className="w-4 h-4" /><span>Dashboard Absensi</span>
                            </NavLink>
                        )}
                        {hasPermission('/absensi/shift') && (
                            <NavLink to="/absensi/shift" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ padding: '0.5rem 1rem 0.5rem 2.85rem', fontSize: '0.9rem' }} onClick={() => setIsOpen && setIsOpen(false)}>
                                <CalendarClock className="w-4 h-4" /><span>Master Shift</span>
                            </NavLink>
                        )}
                        {hasPermission('/absensi/jadwal-shift') && (
                            <NavLink to="/absensi/jadwal-shift" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ padding: '0.5rem 1rem 0.5rem 2.85rem', fontSize: '0.9rem' }} onClick={() => setIsOpen && setIsOpen(false)}>
                                <CalendarDays className="w-4 h-4" /><span>Jadwal Shift</span>
                            </NavLink>
                        )}
                        {hasPermission('/absensi/izin') && (
                            <NavLink to="/absensi/izin" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ padding: '0.5rem 1rem 0.5rem 2.85rem', fontSize: '0.9rem' }} onClick={() => setIsOpen && setIsOpen(false)}>
                                <Umbrella className="w-4 h-4" /><span>Izin & Cuti</span>
                            </NavLink>
                        )}
                        {hasPermission('/absensi/lembur') && (
                            <NavLink to="/absensi/lembur" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ padding: '0.5rem 1rem 0.5rem 2.85rem', fontSize: '0.9rem' }} onClick={() => setIsOpen && setIsOpen(false)}>
                                <Timer className="w-4 h-4" /><span>Lembur</span>
                            </NavLink>
                        )}
                        {hasPermission('/absensi/koreksi') && (
                            <NavLink to="/absensi/koreksi" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ padding: '0.5rem 1rem 0.5rem 2.85rem', fontSize: '0.9rem' }} onClick={() => setIsOpen && setIsOpen(false)}>
                                <PenSquare className="w-4 h-4" /><span>Koreksi Absen</span>
                            </NavLink>
                        )}
                        {hasPermission('/absensi/rekap') && (
                            <NavLink to="/absensi/rekap" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ padding: '0.5rem 1rem 0.5rem 2.85rem', fontSize: '0.9rem' }} onClick={() => setIsOpen && setIsOpen(false)}>
                                <BarChart3 className="w-4 h-4" /><span>Rekap Absensi</span>
                            </NavLink>
                        )}
                        {hasPermission('/absensi/hari-libur') && (
                            <NavLink to="/absensi/hari-libur" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ padding: '0.5rem 1rem 0.5rem 2.85rem', fontSize: '0.9rem' }} onClick={() => setIsOpen && setIsOpen(false)}>
                                <CalendarOff className="w-4 h-4" /><span>Hari Libur</span>
                            </NavLink>
                        )}
                    </SidebarGroup>
                )}

                {/* PAYROLL GROUP */}
                {['/payroll/komponen', '/payroll/struktur', '/payroll/proses', '/payroll/kasbon'].some(p => hasPermission(p)) && (
                    <SidebarGroup
                        title="Payroll"
                        icon={Wallet}
                        isOpen={activeGroup === 'payroll'}
                        onToggle={() => toggleGroup('payroll')}
                    >
                        {hasPermission('/payroll/komponen') && (
                            <NavLink to="/payroll/komponen" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ padding: '0.5rem 1rem 0.5rem 2.85rem', fontSize: '0.9rem' }} onClick={() => setIsOpen && setIsOpen(false)}>
                                <Layers className="w-4 h-4" /><span>Komponen Gaji</span>
                            </NavLink>
                        )}
                        {hasPermission('/payroll/struktur') && (
                            <NavLink to="/payroll/struktur" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ padding: '0.5rem 1rem 0.5rem 2.85rem', fontSize: '0.9rem' }} onClick={() => setIsOpen && setIsOpen(false)}>
                                <UserCog className="w-4 h-4" /><span>Struktur Gaji</span>
                            </NavLink>
                        )}
                        {hasPermission('/payroll/proses') && (
                            <NavLink to="/payroll/proses" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ padding: '0.5rem 1rem 0.5rem 2.85rem', fontSize: '0.9rem' }} onClick={() => setIsOpen && setIsOpen(false)}>
                                <FileText className="w-4 h-4" /><span>Proses Payroll</span>
                            </NavLink>
                        )}
                        {hasPermission('/payroll/kasbon') && (
                            <NavLink to="/payroll/kasbon" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ padding: '0.5rem 1rem 0.5rem 2.85rem', fontSize: '0.9rem' }} onClick={() => setIsOpen && setIsOpen(false)}>
                                <CreditCard className="w-4 h-4" /><span>Kasbon</span>
                            </NavLink>
                        )}
                    </SidebarGroup>
                )}

                {/* KPI GROUP */}
                {['/kpi/indikator', '/kpi/penilaian', '/kpi/dashboard', '/kpi/komplain', '/kpi/bonus-tier'].some(p => hasPermission(p)) && (
                    <SidebarGroup
                        title="KPI Karyawan"
                        icon={Target}
                        isOpen={activeGroup === 'kpi'}
                        onToggle={() => toggleGroup('kpi')}
                    >
                        {hasPermission('/kpi/indikator') && (
                            <NavLink to="/kpi/indikator" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ padding: '0.5rem 1rem 0.5rem 2.85rem', fontSize: '0.9rem' }} onClick={() => setIsOpen && setIsOpen(false)}>
                                <ListChecks className="w-4 h-4" /><span>Master Indikator</span>
                            </NavLink>
                        )}
                        {hasPermission('/kpi/penilaian') && (
                            <NavLink to="/kpi/penilaian" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ padding: '0.5rem 1rem 0.5rem 2.85rem', fontSize: '0.9rem' }} onClick={() => setIsOpen && setIsOpen(false)}>
                                <Target className="w-4 h-4" /><span>Penilaian KPI</span>
                            </NavLink>
                        )}
                        {hasPermission('/kpi/dashboard') && (
                            <NavLink to="/kpi/dashboard" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ padding: '0.5rem 1rem 0.5rem 2.85rem', fontSize: '0.9rem' }} onClick={() => setIsOpen && setIsOpen(false)}>
                                <TrendingUp className="w-4 h-4" /><span>Dashboard KPI</span>
                            </NavLink>
                        )}
                        {hasPermission('/kpi/komplain') && (
                            <NavLink to="/kpi/komplain" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ padding: '0.5rem 1rem 0.5rem 2.85rem', fontSize: '0.9rem' }} onClick={() => setIsOpen && setIsOpen(false)}>
                                <ListChecks className="w-4 h-4" /><span>Komplain CS</span>
                            </NavLink>
                        )}
                        {hasPermission('/kpi/bonus-tier') && (
                            <NavLink to="/kpi/bonus-tier" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ padding: '0.5rem 1rem 0.5rem 2.85rem', fontSize: '0.9rem' }} onClick={() => setIsOpen && setIsOpen(false)}>
                                <Award className="w-4 h-4" /><span>Tier Bonus</span>
                            </NavLink>
                        )}
                    </SidebarGroup>
                )}

                {/* TUGAS GROUP */}
                {['/tugas/saya','/tugas/kanban','/tugas/daftar','/tugas/project','/tugas/rutin','/tugas/pengaturan'].some(p => hasPermission(p)) && (
                    <SidebarGroup
                        title="Tugas"
                        icon={CheckSquare2}
                        isOpen={activeGroup === 'tugas'}
                        onToggle={() => toggleGroup('tugas')}
                    >
                        {hasPermission('/tugas/saya') && (
                            <NavLink to="/tugas/saya" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ padding: '0.5rem 1rem 0.5rem 2.85rem', fontSize: '0.9rem' }} onClick={() => setIsOpen && setIsOpen(false)}>
                                <ClipboardCheck className="w-4 h-4" /><span>Tugas Saya</span>
                            </NavLink>
                        )}
                        {hasPermission('/tugas/kanban') && (
                            <NavLink to="/tugas/kanban" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ padding: '0.5rem 1rem 0.5rem 2.85rem', fontSize: '0.9rem' }} onClick={() => setIsOpen && setIsOpen(false)}>
                                <LayoutGrid className="w-4 h-4" /><span>Papan Kanban</span>
                            </NavLink>
                        )}
                        {hasPermission('/tugas/daftar') && (
                            <NavLink to="/tugas/daftar" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ padding: '0.5rem 1rem 0.5rem 2.85rem', fontSize: '0.9rem' }} onClick={() => setIsOpen && setIsOpen(false)}>
                                <List className="w-4 h-4" /><span>Daftar Tugas</span>
                            </NavLink>
                        )}
                        {hasPermission('/tugas/project') && (
                            <NavLink to="/tugas/project" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ padding: '0.5rem 1rem 0.5rem 2.85rem', fontSize: '0.9rem' }} onClick={() => setIsOpen && setIsOpen(false)}>
                                <FolderOpen className="w-4 h-4" /><span>Kelola Project</span>
                            </NavLink>
                        )}
                        {hasPermission('/tugas/rutin') && (
                            <NavLink to="/tugas/rutin" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ padding: '0.5rem 1rem 0.5rem 2.85rem', fontSize: '0.9rem' }} onClick={() => setIsOpen && setIsOpen(false)}>
                                <RotateCcw className="w-4 h-4" /><span>Tugas Rutin</span>
                            </NavLink>
                        )}
                        {hasPermission('/tugas/pengaturan') && (
                            <NavLink to="/tugas/pengaturan" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ padding: '0.5rem 1rem 0.5rem 2.85rem', fontSize: '0.9rem' }} onClick={() => setIsOpen && setIsOpen(false)}>
                                <Settings className="w-4 h-4" /><span>Stage & Label</span>
                            </NavLink>
                        )}
                    </SidebarGroup>
                )}

                {pengaturanLinks.length > 0 && (
                    <SidebarGroup
                        title="Pengaturan"
                        icon={Wrench}
                        isOpen={activeGroup === 'pengaturan'}
                        onToggle={() => toggleGroup('pengaturan')}
                    >
                        {pengaturanLinks.map(link => (
                            <NavLink
                                key={link.to}
                                to={link.to}
                                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                                style={{ padding: '0.5rem 1rem 0.5rem 2.85rem', fontSize: '0.9rem' }}
                                onClick={() => setIsOpen && setIsOpen(false)}
                            >
                                <link.icon className="w-4 h-4" />
                                <span>{link.label}</span>
                            </NavLink>
                        ))}
                    </SidebarGroup>
                )}
            </nav>

            <div style={{ padding: '1.25rem 1.5rem', marginTop: 'auto', borderTop: '1px solid var(--glass-border)' }}>
                <button
                    onClick={handleLogout}
                    className="nav-item"
                    style={{
                        width: '100%',
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#ef4444',
                        padding: '0.65rem 1rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        fontWeight: 600,
                        borderRadius: '0.5rem'
                    }}
                >
                    <LogOut className="w-4 h-4" />
                    <span>Logout</span>
                </button>
            </div>
        </aside>
    );
};

export default Sidebar;
