import { useState, useEffect } from 'react';
import { Settings, Upload, Save, Image, Type, RotateCcw } from 'lucide-react';

export default function SettingsPage() {
    const [appName, setAppName] = useState('BimbelPro');
    const [logoUrl, setLogoUrl] = useState('');
    const [previewLogo, setPreviewLogo] = useState('');
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        try {
            const settings = JSON.parse(localStorage.getItem('app_settings') || '{}');
            if (settings.appName) setAppName(settings.appName);
            if (settings.logoUrl) {
                setLogoUrl(settings.logoUrl);
                setPreviewLogo(settings.logoUrl);
            }
        } catch (e) {
            console.error('Error loading settings:', e);
        }
    }, []);

    const handleLogoUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 500 * 1024) {
            alert('Ukuran file maksimal 500KB.');
            return;
        }
        const reader = new FileReader();
        reader.onloadend = () => {
            setLogoUrl(reader.result);
            setPreviewLogo(reader.result);
        };
        reader.readAsDataURL(file);
    };

    const handleSave = () => {
        const settings = { appName, logoUrl };
        localStorage.setItem('app_settings', JSON.stringify(settings));
        setSaved(true);
        // Dispatch event so Sidebar can listen
        window.dispatchEvent(new Event('app_settings_changed'));
        setTimeout(() => setSaved(false), 2500);
    };

    const handleReset = () => {
        if (!window.confirm('Reset ke pengaturan default?')) return;
        setAppName('BimbelPro');
        setLogoUrl('');
        setPreviewLogo('');
        localStorage.removeItem('app_settings');
        window.dispatchEvent(new Event('app_settings_changed'));
    };

    const inputStyle = {
        width: '100%', padding: '0.65rem 0.85rem', borderRadius: '0.5rem',
        border: '1px solid var(--glass-border)', background: 'var(--surface-color)',
        fontFamily: 'inherit', fontSize: '0.95rem'
    };

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">Pengaturan</h1>
                <p className="text-secondary">Atur logo dan nama aplikasi Anda.</p>
            </div>

            <div className="glass-card" style={{ maxWidth: '600px' }}>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                    <Settings size={22} className="text-primary" /> Identitas Aplikasi
                </h2>

                {/* App Name */}
                <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.9rem' }}>
                        <Type size={16} /> Nama Aplikasi
                    </label>
                    <input
                        type="text"
                        value={appName}
                        onChange={(e) => setAppName(e.target.value)}
                        placeholder="Nama aplikasi..."
                        style={inputStyle}
                        maxLength={30}
                    />
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                        Ditampilkan di header sidebar. Maks. 30 karakter.
                    </p>
                </div>

                {/* Logo Upload */}
                <div style={{ marginBottom: '1.75rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.9rem' }}>
                        <Image size={16} /> Logo Aplikasi
                    </label>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                        {/* Preview */}
                        <div style={{
                            width: '72px', height: '72px', borderRadius: '0.75rem',
                            border: '2px dashed var(--glass-border)', display: 'flex',
                            alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                            background: 'rgba(79,70,229,0.03)', flexShrink: 0
                        }}>
                            {previewLogo ? (
                                <img src={previewLogo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                                <Image size={28} style={{ color: 'var(--text-secondary)', opacity: 0.4 }} />
                            )}
                        </div>

                        <div style={{ flex: 1 }}>
                            <label style={{
                                display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                                padding: '0.5rem 1rem', borderRadius: '0.5rem', cursor: 'pointer',
                                background: 'rgba(79,70,229,0.1)', color: 'var(--primary)',
                                fontWeight: 500, fontSize: '0.85rem', transition: 'all 0.2s'
                            }}>
                                <Upload size={16} /> Upload Logo
                                <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
                            </label>
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
                                Format: JPG, PNG, SVG. Maks. 500KB.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Preview Header */}
                <div style={{ marginBottom: '1.75rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.9rem' }}>
                        Preview Header Sidebar
                    </label>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                        padding: '1rem 1.25rem', borderRadius: '0.75rem',
                        background: 'var(--surface-color)', border: '1px solid var(--glass-border)'
                    }}>
                        {previewLogo ? (
                            <img src={previewLogo} alt="Logo" style={{ width: '36px', height: '36px', borderRadius: '0.5rem', objectFit: 'cover' }} />
                        ) : (
                            <div style={{ width: '36px', height: '36px', borderRadius: '0.5rem', background: 'rgba(79,70,229,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Settings size={20} style={{ color: 'var(--primary)' }} />
                            </div>
                        )}
                        <span style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--primary)' }}>
                            {appName || 'BimbelPro'}
                        </span>
                    </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    <button className="btn btn-primary" onClick={handleSave} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Save size={16} /> Simpan Pengaturan
                    </button>
                    <button className="btn" onClick={handleReset} style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <RotateCcw size={16} /> Reset
                    </button>
                    {saved && (
                        <span style={{ color: '#10b981', fontWeight: 500, fontSize: '0.85rem', animation: 'fadeIn 0.3s ease' }}>
                            ✓ Tersimpan!
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
