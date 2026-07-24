import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Shield, Save, CheckSquare, Square } from 'lucide-react';
import { useAuth } from '../context/authStore';

const AVAILABLE_MENUS = [
    // ── Dashboard ────────────────────────────────────
    { path: '/dashboard',        label: 'Dashboard Utama' },
    // ── Master Data ──────────────────────────────────
    { path: '/siswa',            label: 'Manajemen Siswa' },
    { path: '/program',          label: 'Manajemen Program' },
    { path: '/unit',             label: 'Manajemen Unit' },
    { path: '/user',             label: 'Manajemen User / Guru' },
    // ── Jadwal ───────────────────────────────────────
    { path: '/jadwal-master',    label: 'Jadwal Master' },
    { path: '/kanban',           label: 'Jadwal (10 Hari)' },
    { path: '/booking',          label: 'Booking' },
    { path: '/jadwal-kosong',    label: 'Jadwal Kosong' },
    { path: '/appointment',      label: 'Appointment (Trial Class)' },
    { path: '/reschedule',       label: 'Reschedule' },
    // ── Aktivasi ─────────────────────────────────────
    { path: '/aktivasi-rutin',   label: 'Aktivasi Siswa - Jadwal Rutin' },
    { path: '/aktivasi-harian',  label: 'Aktivasi Siswa - Jadwal Harian' },
    // ── SPP ──────────────────────────────────────────
    { path: '/spp/tagihan',      label: 'SPP - Tagihan Siswa' },
    { path: '/spp/rekonsiliasi', label: 'SPP - Rekonsiliasi' },
    { path: '/spp/faktur-odoo',  label: 'SPP - Faktur Odoo' },
    { path: '/spp/laporan',      label: 'SPP - Laporan' },
    // ── Jurnal ───────────────────────────────────────
    { path: '/jurnal',           label: 'Jurnal Mengajar' },
    // ── Absensi ──────────────────────────────────────
    { path: '/absensi/check',        label: 'Absensi - Check In/Out' },
    { path: '/absensi/dashboard',    label: 'Absensi - Dashboard' },
    { path: '/absensi/shift',        label: 'Absensi - Master Shift' },
    { path: '/absensi/jadwal-shift', label: 'Absensi - Jadwal Shift' },
    { path: '/absensi/izin',         label: 'Absensi - Izin & Cuti' },
    { path: '/absensi/lembur',       label: 'Absensi - Lembur' },
    { path: '/absensi/koreksi',      label: 'Absensi - Koreksi Absen' },
    { path: '/absensi/rekap',        label: 'Absensi - Rekap' },
    { path: '/absensi/hari-libur',   label: 'Absensi - Hari Libur' },
    { path: '/absensi/laporan-izin', label: 'Absensi - Laporan Izin per Shift' },
    { path: '/absensi/penyesuaian-shift', label: 'Absensi - Penyesuaian Shift (SPV)' },
    // ── Payroll ──────────────────────────────────────
    { path: '/payroll/komponen', label: 'Payroll - Komponen Gaji' },
    { path: '/payroll/struktur', label: 'Payroll - Struktur Gaji' },
    { path: '/payroll/proses',   label: 'Payroll - Proses Payroll' },
    { path: '/payroll/kasbon',   label: 'Payroll - Kasbon' },
    // ── Payroll Fleksibel ─────────────────────────────
    { path: '/gaji/komponen',    label: 'Gaji - Komponen Gaji' },
    { path: '/gaji/paket',       label: 'Gaji - Paket Gaji' },
    { path: '/gaji/karyawan',    label: 'Gaji - Gaji per Karyawan' },
    { path: '/gaji/periode',     label: 'Gaji - Periode Penggajian' },
    // ── KPI Karyawan ─────────────────────────────────
    { path: '/kpi/indikator',    label: 'KPI - Master Indikator' },
    { path: '/kpi/penilaian',    label: 'KPI - Penilaian' },
    { path: '/kpi/dashboard',    label: 'KPI - Dashboard' },
    { path: '/kpi/komplain',     label: 'KPI - Komplain CS' },
    { path: '/kpi/bonus-tier',   label: 'KPI - Tier Bonus' },
    // ── Tugas ─────────────────────────────────────────
    { path: '/tugas/saya',        label: 'Tugas - Tugas Saya' },
    { path: '/tugas/kanban',      label: 'Tugas - Papan Kanban' },
    { path: '/tugas/daftar',      label: 'Tugas - Daftar Tugas' },
    { path: '/tugas/project',     label: 'Tugas - Kelola Project' },
    { path: '/tugas/rutin',        label: 'Tugas - Tugas Rutin' },
    { path: '/tugas/pengaturan',  label: 'Tugas - Pengaturan Stage & Label' },
    // ── Penilaian Mengajar ────────────────────────────
    { path: '/penilaian',        label: 'Penilaian Mengajar' },
    // ── POS ───────────────────────────────────────────
    { path: '/pos',              label: 'POS - Point of Sale' },
    // ── Pengaturan ───────────────────────────────────
    { path: '/role-setup',       label: 'Setup Hak Akses' },
    { path: '/pengaturan',       label: 'Pengaturan Aplikasi' },
];

export default function RoleSetupPage() {
    const { user } = useAuth();
    const [roles, setRoles] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        fetchRoles();
    }, []);

    const fetchRoles = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('roles')
                .select('*')
                .order('role_name');

            if (error) throw error;
            if (data) setRoles(data);
        } catch (error) {
            console.error('Error fetching roles:', error.message);
            alert('Gagal mengambil data role.');
        } finally {
            setIsLoading(false);
        }
    };

    const toggleMenuForRole = (roleIndex, menuPath) => {
        const newRoles = [...roles];
        const role = newRoles[roleIndex];

        let currentMenus = role.allowed_menus || [];

        if (currentMenus.includes(menuPath)) {
            // Remove
            currentMenus = currentMenus.filter(m => m !== menuPath);
        } else {
            // Add
            currentMenus.push(menuPath);
        }

        role.allowed_menus = currentMenus;
        setRoles(newRoles);
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            // Untuk Supabase kita update satu per satu
            for (const role of roles) {
                const { error } = await supabase
                    .from('roles')
                    .update({ allowed_menus: role.allowed_menus })
                    .eq('role_name', role.role_name);

                if (error) throw error;
            }
            alert('Berhasil menyimpan pengaturan hak akses menu!');
        } catch (error) {
            console.error('Error saving roles:', error.message);
            alert('Gagal menyimpan pengaturan.');
        } finally {
            setIsSaving(false);
        }
    };

    // Hanya Owner yang boleh melihat halaman ini (meskipun url dibypass)
    if (user?.role !== 'Owner') {
        return <div style={{ padding: '2rem', textAlign: 'center' }}><h2>Hanya Owner yang dapat mengakses halaman ini.</h2></div>;
    }

    return (
        <div className="page-container">
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Shield className="w-6 h-6 text-primary" />
                        Setup Hak Akses Menu
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                        Atur halaman apa saja yang bisa dibuka oleh masing-masing Role.
                    </p>
                </div>
                <button
                    onClick={handleSave}
                    className="btn btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    disabled={isSaving || isLoading}
                >
                    <Save className="w-4 h-4" />
                    {isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}
                </button>
            </div>

            <div className="glass-card" style={{ padding: '1.5rem', overflowX: 'auto' }}>
                {isLoading ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Memuat pengaturan...</div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.05)' }}>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)', width: '250px' }}>Nama Menu</th>
                                {roles.map(role => (
                                    <th key={role.role_name} style={{ padding: '1rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                                        Role: {role.role_name}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {AVAILABLE_MENUS.map(menu => (
                                <tr key={menu.path} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                                    <td style={{ padding: '1rem', fontWeight: 500 }}>{menu.label}</td>

                                    {roles.map((role, idx) => {
                                        const isAllowed = (role.allowed_menus || []).includes(menu.path);
                                        const isOwner = role.role_name === 'Owner';

                                        return (
                                            <td key={role.role_name} style={{ padding: '1rem', textAlign: 'center' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => !isOwner && toggleMenuForRole(idx, menu.path)}
                                                    style={{
                                                        background: 'none',
                                                        border: 'none',
                                                        cursor: isOwner ? 'not-allowed' : 'pointer',
                                                        color: isAllowed ? 'var(--primary-color)' : 'var(--text-light)',
                                                        opacity: isOwner ? 0.5 : 1
                                                    }}
                                                    title={isOwner ? "Hak akses Owner tidak bisa diubah" : "Klik untuk mengubah"}
                                                >
                                                    {isAllowed ? <CheckSquare className="w-6 h-6" /> : <Square className="w-6 h-6" />}
                                                </button>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
            <div style={{ marginTop: '1rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                * Catatan: Hak akses untuk role <strong>Owner</strong> dikunci secara default agar selalu bisa mengakses semua menu. Setelah menekan tombol Simpan, perubahan akan berlaku bagi user bersangkutan saat mereka memuat ulang aplikasi/login kembali.
            </div>
        </div>
    );
}
