import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogIn } from 'lucide-react';

export default function LoginPage() {
    const [credentials, setCredentials] = useState({ email: '', password: '' });
    const [errorMsg, setErrorMsg] = useState('');
    const { login, loading } = useAuth();
    const navigate = useNavigate();

    const handleChange = (e) => {
        setCredentials(prev => ({ ...prev, [e.target.name]: e.target.value }));
        setErrorMsg('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMsg('');

        if (!credentials.email || !credentials.password) {
            setErrorMsg('Email dan password wajib diisi.');
            return;
        }

        const result = await login(credentials.email, credentials.password);

        if (result.success) {
            navigate('/kanban', { replace: true });
        } else {
            setErrorMsg(result.error || 'Login gagal. Periksa kembali email dan password Anda.');
        }
    };

    return (
        <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '100vh',
            background: 'var(--bg-color)',
            width: '100%',
            position: 'absolute',
            top: 0,
            left: 0,
            margin: 0,
            padding: 0
        }}>
            <div className="glass-card" style={{ width: '100%', maxWidth: '400px', padding: '2.5rem', margin: '1rem', boxSizing: 'border-box' }}>
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <div style={{ background: 'rgba(79,70,229,0.1)', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                        <LogIn className="w-8 h-8 text-primary" />
                    </div>
                    <h1 className="text-2xl font-bold" style={{ color: 'var(--text-color)' }}>Bimbel Scheduler</h1>
                    <p className="text-secondary" style={{ marginTop: '0.5rem' }}>Silakan masuk untuk melanjutkan</p>
                </div>

                {errorMsg && (
                    <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '0.75rem 1rem', borderRadius: '0.5rem', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
                        {errorMsg}
                    </div>
                )}

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem' }}>Email</label>
                        <input
                            type="email"
                            name="email"
                            value={credentials.email}
                            onChange={handleChange}
                            style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', outline: 'none' }}
                            placeholder="budi@bimbel.com"
                            disabled={loading}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem' }}>Password</label>
                        <input
                            type="password"
                            name="password"
                            value={credentials.password}
                            onChange={handleChange}
                            style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', outline: 'none' }}
                            placeholder="••••••••"
                            disabled={loading}
                        />
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary"
                        style={{ width: '100%', padding: '0.75rem', marginTop: '0.5rem', display: 'flex', justifyContent: 'center' }}
                        disabled={loading}
                    >
                        {loading ? 'Memproses...' : 'Masuk'}
                    </button>
                </form>

                <div style={{ marginTop: '2rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    &copy; 2024 Manajemen Jadwal Bimbel
                </div>
            </div>
        </div>
    );
}
