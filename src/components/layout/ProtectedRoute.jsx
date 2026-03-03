import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function ProtectedRoute({ children }) {
    const { user, permissions, loading } = useAuth();
    const location = useLocation();

    // Loading state
    if (loading) {
        return (
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100vh'
            }}>
                Memuat Aplikasi...
            </div>
        );
    }

    // Jika belum login
    if (!user) {
        return <Navigate to="/login" replace />;
    }

    // Ambil path utama (contoh: /siswa dari /siswa/123)
    const pathSegment = location.pathname.split('/')[1];
    const currentPath = pathSegment ? `/${pathSegment}` : '/dashboard';

    // Admin bypass
    if (user.role === 'Admin') {
        return children;
    }

    // Jika permissions kosong
    if (!permissions || permissions.length === 0) {
        return (
            <div style={{ padding: '2rem', textAlign: 'center' }}>
                <h2>Akses Ditolak</h2>
                <p>Role Anda belum memiliki akses ke menu apapun. Hubungi Admin.</p>
            </div>
        );
    }

    // Jika tidak punya akses
    if (!permissions.includes(currentPath)) {
        return (
            <div style={{ padding: '2rem', textAlign: 'center', marginTop: '10%' }}>
                <h2 style={{ color: '#ef4444' }}>Akses Dilarang (403)</h2>
                <p>Maaf, peran Anda ({user.role}) tidak memiliki izin untuk membuka halaman ini.</p>
            </div>
        );
    }

    return children;
}
