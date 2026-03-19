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
    FileText
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

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

    // Store only the active group ID, or null if none are active
    const [activeGroup, setActiveGroup] = useState('masterData');
    const [isAktivasiOpen, setIsAktivasiOpen] = useState(false);

    const toggleGroup = (group) => {
        setActiveGroup(prevGroup => (prevGroup === group ? null : group));
        // Also close the nested aktivasi dropdown when switching top-level groups
        if (group !== 'jadwal') setIsAktivasiOpen(false);
    };

    const toggleAktivasi = () => {
        setIsAktivasiOpen(prev => !prev);
    };

    // App settings from localStorage
    const [appSettings, setAppSettings] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('app_settings') || '{}');
        } catch { return {}; }
    });

    useEffect(() => {
        const handleSettingsChange = () => {
            try {
                setAppSettings(JSON.parse(localStorage.getItem('app_settings') || '{}'));
            } catch { setAppSettings({}); }
        };
        window.addEventListener('app_settings_changed', handleSettingsChange);
        return () => window.removeEventListener('app_settings_changed', handleSettingsChange);
    }, []);

    const displayName = appSettings.appName || 'BimbelPro';

    const handleLogout = () => {
        logout();
        navigate('/login', { replace: true });
    };

    const hasPermission = (path) => {
        if (user?.role === 'Admin') return true;
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
        { to: '/jadwal-kosong', icon: CalendarX2, label: 'Jadwal' },
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
                <div style={{ padding: '0 1.5rem', marginTop: '1.25rem', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                    <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{user.nama}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.1rem' }}>{user.role}</div>
                </div>
            )}

            <nav className="sidebar-nav" style={{ paddingBottom: '2rem' }}>
                {user?.role !== 'Guru' && (
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
