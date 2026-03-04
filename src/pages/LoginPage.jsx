import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogIn, UserPlus, BookOpen } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function LoginPage() {
    const [activeView, setActiveView] = useState('login');
    const [credentials, setCredentials] = useState({ email: '', password: '' });
    const [errorMsg, setErrorMsg] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const { login, loading } = useAuth();
    const navigate = useNavigate();

    // Sign Up form (no status field — admin controls that)
    const [signUpData, setSignUpData] = useState({
        email: '', password: '', nama: '', role: 'Guru',
        nowa: '', alamat: '', maps: ''
    });
    const [signUpLoading, setSignUpLoading] = useState(false);

    const handleChange = (e) => {
        setCredentials(prev => ({ ...prev, [e.target.name]: e.target.value }));
        setErrorMsg('');
    };

    const handleSignUpChange = (e) => {
        setSignUpData(prev => ({ ...prev, [e.target.name]: e.target.value }));
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

    const handleSignUp = async (e) => {
        e.preventDefault();
        setErrorMsg('');
        setSuccessMsg('');
        setSignUpLoading(true);

        if (!signUpData.email || !signUpData.password || !signUpData.nama) {
            setErrorMsg('Nama, email, dan password wajib diisi.');
            setSignUpLoading(false);
            return;
        }

        try {
            const { data: existing } = await supabase
                .from('gurus').select('id').eq('email', signUpData.email).single();

            if (existing) {
                setErrorMsg('Email sudah terdaftar. Silakan gunakan email lain atau login.');
                setSignUpLoading(false);
                return;
            }

            const newId = 'GURU-' + Math.random().toString(36).substr(2, 6).toUpperCase();
            const { error } = await supabase
                .from('gurus')
                .insert([{ id: newId, status: 'Aktif', ...signUpData }]);

            if (error) throw error;

            setSuccessMsg('Pendaftaran berhasil! Silakan login dengan akun Anda.');
            setSignUpData({ email: '', password: '', nama: '', role: 'Guru', nowa: '', alamat: '', maps: '' });
            setTimeout(() => setActiveView('login'), 2000);
        } catch (error) {
            console.error('Error:', error.message);
            setErrorMsg('Gagal mendaftar. Silakan coba lagi.');
        } finally {
            setSignUpLoading(false);
        }
    };

    const inputStyle = {
        width: '100%', padding: '0.65rem 0.85rem', borderRadius: '0.5rem',
        border: '1px solid var(--glass-border)', background: 'var(--surface-color)',
        outline: 'none', fontFamily: 'inherit', fontSize: '0.9rem'
    };

    const labelStyle = {
        display: 'block', marginBottom: '0.35rem', fontWeight: 600, fontSize: '0.85rem'
    };

    return (
        <div style={{
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            minHeight: '100vh', background: 'var(--bg-color)',
            width: '100%', position: 'absolute', top: 0, left: 0, margin: 0, padding: '1rem'
        }}>
            <div className="glass-card" style={{ width: '100%', maxWidth: activeView === 'signup' ? '550px' : '400px', padding: '2.5rem', boxSizing: 'border-box', transition: 'max-width 0.3s' }}>
                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                    <div style={{ background: 'rgba(79,70,229,0.1)', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                        {activeView === 'login' ? <LogIn className="w-8 h-8 text-primary" /> : <UserPlus className="w-8 h-8 text-primary" />}
                    </div>
                    <h1 className="text-2xl font-bold" style={{ color: 'var(--text-color)' }}>Bimbel Ahe</h1>
                    <p className="text-secondary" style={{ marginTop: '0.5rem' }}>
                        {activeView === 'login' ? 'Silakan masuk untuk melanjutkan' : 'Buat akun baru'}
                    </p>
                </div>

                {/* Error / Success Messages */}
                {errorMsg && (
                    <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '0.75rem 1rem', borderRadius: '0.5rem', marginBottom: '1rem', fontSize: '0.85rem' }}>
                        {errorMsg}
                    </div>
                )}
                {successMsg && (
                    <div style={{ background: '#d1fae5', color: '#047857', padding: '0.75rem 1rem', borderRadius: '0.5rem', marginBottom: '1rem', fontSize: '0.85rem' }}>
                        {successMsg}
                    </div>
                )}

                {/* LOGIN VIEW */}
                {activeView === 'login' && (
                    <>
                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={labelStyle}>Email</label>
                                <input type="email" name="email" value={credentials.email} onChange={handleChange} style={inputStyle} placeholder="email@bimbel.com" disabled={loading} />
                            </div>
                            <div>
                                <label style={labelStyle}>Password</label>
                                <input type="password" name="password" value={credentials.password} onChange={handleChange} style={inputStyle} placeholder="••••••••" disabled={loading} />
                            </div>
                            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.75rem', marginTop: '0.25rem', display: 'flex', justifyContent: 'center' }} disabled={loading}>
                                {loading ? 'Memproses...' : 'Masuk'}
                            </button>
                        </form>

                        <div style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                            Belum punya akun?{' '}
                            <button
                                onClick={() => { setActiveView('signup'); setErrorMsg(''); setSuccessMsg(''); }}
                                style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem', fontFamily: 'inherit', textDecoration: 'underline' }}
                            >
                                Sign Up
                            </button>
                        </div>
                    </>
                )}

                {/* SIGN UP VIEW */}
                {activeView === 'signup' && (
                    <>
                        <form onSubmit={handleSignUp} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                            <div>
                                <label style={labelStyle}>Nama Lengkap *</label>
                                <input type="text" name="nama" value={signUpData.nama} onChange={handleSignUpChange} style={inputStyle} required placeholder="Nama lengkap" />
                            </div>
                            <div>
                                <label style={labelStyle}>No. WhatsApp *</label>
                                <input type="tel" name="nowa" value={signUpData.nowa} onChange={handleSignUpChange} style={inputStyle} required placeholder="08xxxxxxxxxx" />
                            </div>
                            <div>
                                <label style={labelStyle}>Email *</label>
                                <input type="email" name="email" value={signUpData.email} onChange={handleSignUpChange} style={inputStyle} required placeholder="email@bimbel.com" />
                            </div>
                            <div>
                                <label style={labelStyle}>Password *</label>
                                <input type="password" name="password" value={signUpData.password} onChange={handleSignUpChange} style={inputStyle} required placeholder="Min 6 karakter" />
                            </div>
                            <div>
                                <label style={labelStyle}>Role</label>
                                <select name="role" value={signUpData.role} onChange={handleSignUpChange} style={inputStyle}>
                                    <option value="Guru">Guru</option>
                                    <option value="Admin">Admin</option>
                                </select>
                            </div>
                            <div>
                                <label style={labelStyle}>Link Maps Rumah</label>
                                <input type="url" name="maps" value={signUpData.maps} onChange={handleSignUpChange} style={inputStyle} placeholder="https://maps.google.com/..." />
                            </div>
                            <div style={{ gridColumn: 'span 2' }}>
                                <label style={labelStyle}>Alamat Lengkap *</label>
                                <textarea name="alamat" value={signUpData.alamat} onChange={handleSignUpChange} rows="2" style={{ ...inputStyle, fontFamily: 'inherit' }} required placeholder="Alamat lengkap"></textarea>
                            </div>
                            <div style={{ gridColumn: 'span 2' }}>
                                <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.75rem', display: 'flex', justifyContent: 'center' }} disabled={signUpLoading}>
                                    {signUpLoading ? 'Mendaftar...' : 'Daftar Akun'}
                                </button>
                            </div>
                        </form>

                        <div style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                            Sudah punya akun?{' '}
                            <button
                                onClick={() => { setActiveView('login'); setErrorMsg(''); setSuccessMsg(''); }}
                                style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem', fontFamily: 'inherit', textDecoration: 'underline' }}
                            >
                                Sign In
                            </button>
                        </div>
                    </>
                )}

                {/* Footer */}
                <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    <Link to="/" style={{ color: 'var(--primary)', textDecoration: 'none' }}>
                        <BookOpen size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> Kembali ke Beranda
                    </Link>
                </div>

                <div style={{ marginTop: '1rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    &copy; {new Date().getFullYear()} Bimbel Ahe
                </div>
            </div>
        </div>
    );
}
