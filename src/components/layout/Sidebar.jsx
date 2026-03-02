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
    X
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const Sidebar = ({ isOpen, setIsOpen }) => {
    const { user, permissions, logout } = useAuth();
    const navigate = useNavigate();
    const [isAktivasiOpen, setIsAktivasiOpen] = useState(true);

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

    const allLinks = [
        { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
        { to: '/user', icon: Users, label: 'User / Guru' },
        { to: '/unit', icon: Building, label: 'Unit' },
        { to: '/siswa', icon: GraduationCap, label: 'Siswa' },
        { to: '/program', icon: BookOpen, label: 'Program' },
        { to: '/jadwal-master', icon: CalendarDays, label: 'Jadwal Master' },
        { to: '/kanban', icon: Trello, label: 'Jadwal (10 Hari)' },
        { to: '/booking', icon: CalendarCheck, label: 'Booking' },
        { to: '/jadwal-kosong', icon: CalendarX2, label: 'Jadwal Kosong' },
        { to: '/reschedule', icon: RefreshCw, label: 'Reschedule' },
        { to: '/role-setup', icon: Shield, label: 'Setup Hak Akses' },
        { to: '/pengaturan', icon: Settings, label: 'Pengaturan' },
    ];

    const links = allLinks.filter(link => {
        if (user?.role === 'Admin') return true;
        return permissions.includes(link.to);
    });

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

            {/* User Info (Optional, keeping it simple to match original design) */}
            {user && (
                <div style={{ padding: '0 1.5rem', marginTop: '1rem', fontSize: '0.9rem' }}>
                    <div style={{ fontWeight: '600' }}>{user.nama}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{user.role}</div>
                </div>
            )}

            <nav className="sidebar-nav">
                {links.map((link) => {
                    const isJadwalMaster = link.to === '/jadwal-master';

                    return (
                        <div key={link.to} style={{ display: 'flex', flexDirection: 'column' }}>
                            <NavLink
                                to={link.to}
                                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                                onClick={() => setIsOpen && setIsOpen(false)}
                            >
                                <link.icon className="w-5 h-5" />
                                <span>{link.label}</span>
                            </NavLink>

                            {/* Inject Submenu Aktivasi Siswa Right After Jadwal Master */}
                            {isJadwalMaster && (user?.role === 'Admin' || permissions?.includes('/aktivasi-rutin') || permissions?.includes('/aktivasi-harian')) && (
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <div
                                        className="nav-item"
                                        onClick={() => setIsAktivasiOpen(!isAktivasiOpen)}
                                        style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', paddingRight: '1rem' }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <ClipboardList className="w-5 h-5" />
                                            <span>Aktivasi Siswa</span>
                                        </div>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{isAktivasiOpen ? '▼' : '▶'}</span>
                                    </div>

                                    {isAktivasiOpen && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.25rem' }}>
                                            {(user?.role === 'Admin' || permissions?.includes('/aktivasi-rutin')) && (
                                                <NavLink
                                                    to="/aktivasi-rutin"
                                                    className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                                                    style={{ padding: '0.6rem 1rem 0.6rem 3.25rem', fontSize: '0.9rem', minHeight: 'auto' }}
                                                    onClick={() => setIsOpen && setIsOpen(false)}
                                                >
                                                    Jadwal Rutin
                                                </NavLink>
                                            )}
                                            {(user?.role === 'Admin' || permissions?.includes('/aktivasi-harian')) && (
                                                <NavLink
                                                    to="/aktivasi-harian"
                                                    className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                                                    style={{ padding: '0.6rem 1rem 0.6rem 3.25rem', fontSize: '0.9rem', minHeight: 'auto' }}
                                                    onClick={() => setIsOpen && setIsOpen(false)}
                                                >
                                                    Jadwal Harian
                                                </NavLink>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </nav>

            <div style={{ padding: '1.5rem', marginTop: 'auto', borderTop: '1px solid var(--glass-border)' }}>
                <button
                    onClick={handleLogout}
                    className="nav-item"
                    style={{ width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', color: '#b91c1c' }}
                >
                    <LogOut className="w-5 h-5" />
                    <span>Logout</span>
                </button>
            </div>
        </aside>
    );
};

export default Sidebar;
