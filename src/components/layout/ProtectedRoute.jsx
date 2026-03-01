import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function ProtectedRoute({ children }) {
    const { user, permissions, loading } = useAuth();
    const location = useLocation();

    // Tampilkan loading state sederhana saat mengecek status (bisa diganti spinner)
    if (loading) {
        return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Memuat Aplikasi...</div>;
    }

    // 1. Jika belum login, lempar ke halaman login
    if (!user) {
        return <Navigate to="/login" replace />;
    }

    // 2. Jika sudah login, cek apakah user (role-nya) boleh mengakses "path" sasaran
    // Kita cek path pertama (misal dari /siswa/123 ambil /siswa)
    const currentPath = `/${location.pathname.split('/')[1]}`;

    // Exception: Jika admin belum mengatur role sama sekali, atau sedang membuka root '/'
    if (currentPath === '/' || permissions.length === 0) {
        // Biarkan lewat ke dashboard default (nanti dihandle App.jsx) atau tolak.
        // Untuk aman: jika bukan admin dan permissions kosong, tolak.
        if (user.role !== 'Admin' && permissions.length === 0) {
            return <div style={{ padding: '2rem', textAlign: 'center' }}><h2>Akses Ditolak</h2><p>Role Anda belum memiliki akses ke menu apapun. Hubungi Admin.</p></div>;
        }
    } else if (user.role !== 'Admin' && !permissions.includes(currentPath)) {
        // Jika path tidak ada di daftar 'allowed_menus' milik si user (hanya berlaku ketat untuk non-admin)
        // (Biasanya Admin punya bypass jika role table belum terisi sempurna, tp di sini kita paksa sesuai database juga)

        // Coba kita lihat apakah benar dilarang
        if (!permissions.includes(currentPath)) {
            return (
                <div style={{ padding: '2rem', textAlign: 'center', marginTop: '10%' }}>
                    <h2 style={{ color: '#ef4444' }}>Akses Dilarang (403)</h2>
                    <p>Maaf, peran Anda ({user.role}) tidak memiliki izin untuk membuka halaman ini.</p>
                </div>
            );
        }
    }

    return children;
}
