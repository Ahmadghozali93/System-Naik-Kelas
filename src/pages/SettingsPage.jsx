import { useState, useEffect } from 'react';
import { Settings, Upload, Save, Image, Type, RotateCcw, PenLine, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/authStore';

// Peran yang tanda tangannya dipakai untuk menyetujui slip gaji
const PERAN_PENYETUJU = ['Owner', 'Administrator', 'Supervisor'];

// Baca cache lokal sekali saja (nilai awal, sumber kebenaran tetap Supabase)
function loadSettings() {
    try {
        return JSON.parse(localStorage.getItem('app_settings') || '{}');
    } catch (e) {
        console.error('Error loading settings:', e);
        return {};
    }
}

// File gambar → data URI
const bacaSebagaiDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
});

export default function SettingsPage() {
    const { user } = useAuth();
    const [initial] = useState(loadSettings);
    const [appName, setAppName] = useState(initial.appName || 'Naik Kelas');
    const [logoUrl, setLogoUrl] = useState(initial.logoUrl || '');
    const [previewLogo, setPreviewLogo] = useState(initial.logoUrl || '');
    const [saved, setSaved] = useState(false);
    const [menyimpan, setMenyimpan] = useState(false);
    const [galat, setGalat] = useState('');

    // Tanda tangan pribadi (untuk persetujuan slip gaji)
    const bolehTtd = PERAN_PENYETUJU.includes(user?.role);
    const [ttd, setTtd] = useState('');
    const [ttdSaved, setTtdSaved] = useState(false);
    const [ttdGalat, setTtdGalat] = useState('');

    // Ambil nilai terbaru dari server — supaya logo yang sudah disimpan
    // tetap muncul walau dibuka dari perangkat/browser lain.
    useEffect(() => {
        supabase.from('app_settings').select('key, value').in('key', ['app_name', 'logo_url'])
            .then(({ data }) => {
                if (!data?.length) return;
                const row = {};
                data.forEach(r => { row[r.key] = r.value; });
                if (row.app_name) setAppName(row.app_name);
                if (row.logo_url !== undefined) { setLogoUrl(row.logo_url || ''); setPreviewLogo(row.logo_url || ''); }
            });
    }, []);

    useEffect(() => {
        if (!user?.id || !bolehTtd) return;
        supabase.from('gurus').select('ttd_gambar').eq('id', user.id).maybeSingle()
            .then(({ data }) => setTtd(data?.ttd_gambar || ''));
    }, [user?.id, bolehTtd]);

    const handleLogoUpload = async (e) => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        if (file.size > 500 * 1024) {
            alert('Ukuran file maksimal 500KB.');
            return;
        }
        const dataUrl = await bacaSebagaiDataUrl(file);
        setLogoUrl(dataUrl);
        setPreviewLogo(dataUrl);
    };

    const simpanKeServer = async (nama, logo) => {
        const { error } = await supabase.from('app_settings').upsert([
            { key: 'app_name', value: nama },
            { key: 'logo_url', value: logo },
        ], { onConflict: 'key' });
        return error;
    };

    const handleSave = async () => {
        setMenyimpan(true); setGalat(''); setSaved(false);
        const error = await simpanKeServer(appName, logoUrl);
        setMenyimpan(false);

        if (error) {
            // Jangan simpan ke cache lokal kalau server menolak — itulah yang
            // dulu bikin logo "berubah di sini tapi tidak di URL/perangkat lain".
            setGalat(error.message.includes('row-level security')
                ? 'Tidak tersimpan: akun Anda tidak punya izin mengubah pengaturan aplikasi (khusus Owner/Administrator/Supervisor).'
                : 'Gagal menyimpan ke server: ' + error.message);
            return;
        }

        localStorage.setItem('app_settings', JSON.stringify({ appName, logoUrl }));
        window.dispatchEvent(new Event('app_settings_changed'));
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
    };

    const handleReset = async () => {
        if (!window.confirm('Reset ke pengaturan default?')) return;
        setGalat('');
        const error = await simpanKeServer('Naik Kelas', '');
        if (error) { setGalat('Gagal reset di server: ' + error.message); return; }

        setAppName('Naik Kelas');
        setLogoUrl('');
        setPreviewLogo('');
        localStorage.removeItem('app_settings');
        window.dispatchEvent(new Event('app_settings_changed'));
    };

    const simpanTtd = async (nilai) => {
        setTtdGalat(''); setTtdSaved(false);
        const { error } = await supabase.from('gurus').update({ ttd_gambar: nilai || null }).eq('id', user.id);
        if (error) { setTtdGalat('Gagal menyimpan tanda tangan: ' + error.message); return; }
        setTtd(nilai);
        setTtdSaved(true);
        setTimeout(() => setTtdSaved(false), 2500);
    };

    const handleTtdUpload = async (e) => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        if (file.size > 300 * 1024) { alert('Ukuran tanda tangan maksimal 300KB.'); return; }
        simpanTtd(await bacaSebagaiDataUrl(file));
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
                                Format: JPG, PNG, SVG. Maks. 500KB. Logo baru berlaku untuk semua
                                pengguna setelah ditekan <strong>Simpan Pengaturan</strong>.
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
                            {appName || 'Naik Kelas'}
                        </span>
                    </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button className="btn btn-primary" onClick={handleSave} disabled={menyimpan} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Save size={16} /> {menyimpan ? 'Menyimpan...' : 'Simpan Pengaturan'}
                    </button>
                    <button className="btn" onClick={handleReset} style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <RotateCcw size={16} /> Reset
                    </button>
                    {saved && (
                        <span style={{ color: '#10b981', fontWeight: 500, fontSize: '0.85rem', animation: 'fadeIn 0.3s ease' }}>
                            ✓ Tersimpan di server
                        </span>
                    )}
                </div>
                {galat && (
                    <p style={{ marginTop: '0.75rem', marginBottom: 0, fontSize: '0.82rem', color: '#ef4444' }}>{galat}</p>
                )}
            </div>

            {/* Tanda tangan penyetuju slip gaji */}
            {bolehTtd && (
                <div className="glass-card" style={{ maxWidth: '600px', marginTop: '1.25rem' }}>
                    <h2 style={{ fontSize: '1.15rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                        <PenLine size={20} className="text-primary" /> Tanda Tangan Saya
                    </h2>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 0, marginBottom: '1.25rem' }}>
                        Dipakai di slip gaji sebagai <strong>{user?.nama}</strong> ({user?.role}) saat Anda
                        mengunci/menyetujui periode penggajian. Tanda tangan disalin ke periode saat itu juga,
                        jadi slip lama tidak ikut berubah bila nanti Anda menggantinya.
                    </p>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
                        <div style={{
                            width: '190px', height: '80px', borderRadius: '0.6rem',
                            border: '2px dashed var(--glass-border)', display: 'flex',
                            alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                            background: '#fff', flexShrink: 0
                        }}>
                            {ttd
                                ? <img src={ttd} alt="Tanda tangan" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                                : <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Belum ada tanda tangan</span>}
                        </div>

                        <div style={{ flex: 1, minWidth: 200 }}>
                            <label style={{
                                display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                                padding: '0.5rem 1rem', borderRadius: '0.5rem', cursor: 'pointer',
                                background: 'rgba(79,70,229,0.1)', color: 'var(--primary)',
                                fontWeight: 500, fontSize: '0.85rem'
                            }}>
                                <Upload size={16} /> Upload Tanda Tangan
                                <input type="file" accept="image/*" onChange={handleTtdUpload} style={{ display: 'none' }} />
                            </label>
                            {ttd && (
                                <button className="btn" onClick={() => { if (window.confirm('Hapus tanda tangan Anda?')) simpanTtd(''); }}
                                    style={{ marginLeft: '0.5rem', background: 'rgba(239,68,68,0.1)', color: '#ef4444', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem' }}>
                                    <Trash2 size={15} /> Hapus
                                </button>
                            )}
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
                                PNG latar transparan paling rapi. Maks. 300KB. Tersimpan otomatis.
                            </p>
                            {ttdSaved && <p style={{ fontSize: '0.8rem', color: '#10b981', margin: 0 }}>✓ Tanda tangan tersimpan</p>}
                            {ttdGalat && <p style={{ fontSize: '0.8rem', color: '#ef4444', margin: 0 }}>{ttdGalat}</p>}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
