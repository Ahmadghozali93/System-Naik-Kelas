import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, X, Search, CheckCircle, BookOpen, ChevronRight, MessageCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function PengajuanReschedulePage() {
    const [aktivasis, setAktivasis] = useState([]);
    const [jadwals, setJadwals] = useState([]);
    const [reschedules, setReschedules] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    const [formData, setFormData] = useState({
        aktivasi_id: '',
        tanggal_asal: '',
        jadwal_tujuan_id: '',
        tanggal_tujuan: '',
        jam_tujuan: '',
        catatans: ''
    });
    const [aktivasiSearch, setAktivasiSearch] = useState('');
    const [isAktivasiDropdownOpen, setIsAktivasiDropdownOpen] = useState(false);

    const dropdownRef = useRef(null);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [aktRes, jadRes, resRes] = await Promise.all([
                supabase.from('aktivasi_siswa').select('*').eq('status', 'Aktif'),
                supabase.from('jadwal_master').select('*'),
                supabase.from('reschedules').select('id, jadwal_tujuan_id, tanggal_tujuan, status, nama_siswa, aktivasi_id')
            ]);

            if (aktRes.error) throw aktRes.error;
            if (jadRes.error) throw jadRes.error;
            if (resRes.error) throw resRes.error;

            setAktivasis(aktRes.data || []);
            setJadwals(jadRes.data || []);
            setReschedules(resRes.data || []);
        } catch (error) {
            console.error('Error fetching data:', error.message);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsAktivasiDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedAktivasi = aktivasis.find(a => a.id === formData.aktivasi_id);
    const selectedAktJadwal = selectedAktivasi ? jadwals.find(j => j.id === selectedAktivasi.jadwal_id) : null;

    const selectedSiswaId = selectedAktivasi?.siswa_id;
    const siswaAktivasis = aktivasis.filter(a => a.siswa_id === selectedSiswaId);

    const getSiswaJamsOnDate = (targetDate) => {
        const jams = [];
        const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
        siswaAktivasis.forEach(a => {
            const dj = a.detail_jadwal || {};
            if (dj.jenis_program === 'Harian') {
                if (a.tgl_mulai === targetDate) {
                    jams.push(dj.jam_pertemuan || dj.jam);
                }
            } else {
                const dateObj = new Date(targetDate + 'T00:00:00');
                const dayName = dayNames[dateObj.getDay()];
                if (dj.hari && dj.hari.includes(dayName)) {
                    jams.push(dj.jam);
                }
            }
        });
        reschedules.forEach(r => {
            if (r.nama_siswa === selectedAktivasi?.nama_siswa && r.tanggal_tujuan === targetDate && r.status !== 'Cancelled') {
                const tj = jadwals.find(j => j.id === r.jadwal_tujuan_id);
                if (tj) jams.push(tj.jam);
            }
        });
        return jams;
    };

    const generateDates10 = () => {
        const dates = [];
        const today = new Date();
        for (let i = 1; dates.length < 10; i++) {
            const d = new Date(today);
            d.setDate(d.getDate() + i);
            if (d.getDay() !== 0) dates.push(d);
        }
        return dates;
    };
    const dates10 = generateDates10();
    const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

    const getJadwalDates = () => {
        if (!selectedAktivasi || !selectedAktJadwal) return [];
        const dj = selectedAktivasi.detail_jadwal || {};
        const today = new Date();
        if (dj.jenis_program === 'Harian') {
            const tgl = selectedAktivasi.tgl_mulai;
            if (!tgl) return [];
            const tglDate = new Date(tgl + 'T00:00:00');
            const last = dates10[dates10.length - 1];
            if (tglDate >= new Date(today.toISOString().split('T')[0] + 'T00:00:00') && tglDate <= last) {
                return [tgl];
            }
            return [];
        } else {
            const jadwalHari = selectedAktJadwal.hari || '';
            return dates10
                .filter(d => jadwalHari.includes(dayNames[d.getDay()]))
                .map(d => d.toISOString().split('T')[0]);
        }
    };
    const jadwalDates = getJadwalDates();

    const getTargetSlots = () => {
        if (!selectedAktivasi || !formData.tanggal_tujuan) return [];
        const dateObj = new Date(formData.tanggal_tujuan + 'T00:00:00');
        const dateStr = formData.tanggal_tujuan;
        const hari = dayNames[dateObj.getDay()];

        return jadwals
            .filter(j => {
                if (!j.reschedule) return false;
                if (j.id === selectedAktivasi.jadwal_id) return false;
                if (!j.hari || !j.hari.includes(hari)) return false;
                if (selectedAktJadwal) {
                    if (j.unit !== selectedAktJadwal.unit) return false;
                    if (j.nama_program !== selectedAktJadwal.nama_program) return false;
                }
                const activeCount = aktivasis.filter(a => a.jadwal_id === j.id && a.status === 'Aktif').length;
                const rescheduleCount = reschedules.filter(r =>
                    r.jadwal_tujuan_id === j.id &&
                    r.tanggal_tujuan === dateStr &&
                    (r.status === 'Pending' || r.status === 'Approved')
                ).length;
                return (j.kuota || 0) - activeCount - rescheduleCount > 0;
            })
            .map(j => {
                const activeCount = aktivasis.filter(a => a.jadwal_id === j.id && a.status === 'Aktif').length;
                const rescheduleCount = reschedules.filter(r =>
                    r.jadwal_tujuan_id === j.id &&
                    r.tanggal_tujuan === dateStr &&
                    (r.status === 'Pending' || r.status === 'Approved')
                ).length;
                return { ...j, sisaKuota: (j.kuota || 0) - activeCount - rescheduleCount };
            });
    };
    const targetSlots = getTargetSlots();

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!selectedAktivasi) { alert('Pilih siswa & jadwal asal.'); return; }
        if (!formData.jadwal_tujuan_id) { alert('Pilih jadwal tujuan.'); return; }

        setIsSubmitting(true);
        const targetJadwal = jadwals.find(j => j.id === formData.jadwal_tujuan_id);
        const jam = formData.jam_tujuan || targetJadwal?.jam || '';

        try {
            const payload = {
                aktivasi_id: formData.aktivasi_id,
                nama_siswa: selectedAktivasi.nama_siswa,
                jadwal_asal_id: selectedAktivasi.jadwal_id,
                jadwal_tujuan_id: formData.jadwal_tujuan_id,
                tanggal_asal: formData.tanggal_asal,
                tanggal_tujuan: formData.tanggal_tujuan,
                jam_tujuan: jam,
                status: 'Pending',
                catatan: formData.catatan
            };

            const { error } = await supabase.from('reschedules').insert([payload]);
            if (error) throw error;

            // KIRIM KE WHATSAPP
            const WA_NUMBER = '6282341988735';
            const orgDate = new Date(formData.tanggal_asal + 'T00:00:00');
            const targetDate = new Date(formData.tanggal_tujuan + 'T00:00:00');

            const waMsg = `Halo Admin Ahe Naik Kelas, saya ingin mengajukan *Reschedule Belajar*:

*Nama Siswa*: ${selectedAktivasi.nama_siswa}
*Jadwal Asal*: ${dayNames[orgDate.getDay()]}, ${formData.tanggal_asal} (${selectedAktivasi.detail_jadwal?.jam || ''})
*Jadwal Rescadule*: ${dayNames[targetDate.getDay()]}, ${formData.tanggal_tujuan} (${jam})
*Alasan*: ${formData.catatan || '-'}

Mohon bantuannya untuk memproses pengajuan ini. Terima kasih.`;

            const waLink = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(waMsg)}`;
            window.open(waLink, '_blank');

            setIsSuccess(true);
            setFormData({
                aktivasi_id: '',
                tanggal_asal: '',
                jadwal_tujuan_id: '',
                tanggal_tujuan: '',
                jam_tujuan: '',
                catatans: ''
            });
            setAktivasiSearch('');
            window.scrollTo({ top: 0, behavior: 'smooth' });
            await fetchData();
        } catch (error) {
            alert('Gagal menyimpan reschedule: ' + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f8fafc' }}>
                <div style={{ textAlign: 'center', color: '#6366f1' }}>
                    <RefreshCw size={40} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 1.5rem' }} />
                    <p style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 700 }}>Memuat Data...</p>
                </div>
            </div>
        );
    }

    return (
        <>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');
                
                .rs-page * { box-sizing: border-box; margin: 0; padding: 0; }
                .rs-page { 
                    font-family: 'Nunito', sans-serif; 
                    color: #1e293b; 
                    background: #f8fafc; 
                    min-height: 100vh;
                    display: flex;
                    flex-direction: column;
                }

                .rs-nav { 
                    display: flex; 
                    justify-content: space-between; 
                    align-items: center; 
                    padding: 0.75rem 1.5rem; 
                    background: white; 
                    border-bottom: 1px solid #e2e8f0; 
                    position: sticky; 
                    top: 0; 
                    z-index: 50; 
                }
                .rs-nav-brand { 
                    display: flex; 
                    align-items: center; 
                    gap: 0.5rem; 
                    font-weight: 800; 
                    font-size: 1.1rem; 
                    color: #2563eb; 
                    text-decoration: none; 
                }

                .rs-content {
                    flex: 1;
                    max-width: 600px;
                    width: 100%;
                    margin: 0 auto;
                    padding: 2rem 1rem;
                }

                .rs-header { text-align: center; margin-bottom: 2rem; }
                .rs-header h1 { font-size: 1.75rem; font-weight: 900; color: #1e293b; margin-bottom: 0.5rem; }
                .rs-header p { color: #64748b; font-size: 1rem; line-height: 1.5; }

                .rs-card {
                    background: white;
                    border-radius: 1.25rem;
                    padding: 1.75rem;
                    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06);
                    border: 1px solid #e2e8f0;
                }

                .rs-label { display: block; margin-bottom: 0.5rem; font-weight: 700; font-size: 0.9rem; color: #475569; }
                
                .rs-input-group { margin-bottom: 1.5rem; }
                
                .rs-input {
                    width: 100%; 
                    padding: 0.75rem 1rem; 
                    border-radius: 0.75rem; 
                    border: 1.5px solid #e2e8f0; 
                    background: #f8fafc; 
                    font-size: 1rem; 
                    font-family: inherit; 
                    outline: none; 
                    transition: all 0.2s;
                    color: #1e293b;
                    appearance: none;
                }
                .rs-input:focus { border-color: #2563eb; background: white; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
                
                .rs-select-wrapper { position: relative; }
                .rs-select-wrapper::after {
                    content: '▼';
                    position: absolute;
                    right: 1rem;
                    top: 50%;
                    transform: translateY(-50%);
                    font-size: 0.75rem;
                    color: #94a3b8;
                    pointer-events: none;
                }

                .rs-btn {
                    display: inline-flex; 
                    align-items: center; 
                    justify-content: center;
                    gap: 0.5rem; 
                    padding: 0.85rem 1.5rem; 
                    border-radius: 1rem; 
                    font-weight: 800; 
                    font-size: 1rem; 
                    border: none; 
                    cursor: pointer; 
                    transition: all 0.2s; 
                    font-family: inherit;
                    width: 100%;
                }
                .rs-btn-blue { background: #2563eb; color: white; box-shadow: 0 4px 12px rgba(37,99,235,0.25); }
                .rs-btn-blue:hover { transform: translateY(-2px); background: #1d4ed8; }
                .rs-btn-blue:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }

                .rs-dropdown-menu {
                    position: absolute; 
                    top: 100%; 
                    left: 0; 
                    right: 0; 
                    margin-top: 0.5rem; 
                    z-index: 100;
                    background: white; 
                    border: 1px solid #e2e8f0; 
                    border-radius: 1rem;
                    box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05);
                    max-height: 280px;
                    overflow-y: auto;
                }
                .rs-search-box { padding: 0.75rem; border-bottom: 1px solid #f1f5f9; position: sticky; top: 0; background: white; }
                .rs-option { padding: 0.85rem 1rem; cursor: pointer; border-bottom: 1px solid #f8fafc; transition: background 0.2s; }
                .rs-option:hover { background: #eff6ff; }
                .rs-option.selected { background: #eff6ff; color: #2563eb; }
                
                .rs-info-box { 
                    background: #f1f5f9; 
                    padding: 1rem; 
                    border-radius: 0.75rem; 
                    font-size: 0.85rem; 
                    margin-top: 0.5rem;
                    border-left: 4px solid #94a3b8;
                }
                .rs-info-box.success { background: #ecfdf5; border-left-color: #10b981; color: #065f46; }
                .rs-info-box.warning { background: #fffbeb; border-left-color: #f59e0b; color: #92400e; }

                .rs-success-card {
                    text-align: center;
                    background: white;
                    border-radius: 1.5rem;
                    padding: 3rem 2rem;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.05);
                }
                .rs-success-icon {
                    width: 72px; height: 72px; 
                    border-radius: 50%; 
                    background: #d1fae5; color: #10b981;
                    display: flex; alignItems: center; justifyContent: center;
                    margin: 0 auto 1.5rem;
                }

                @media (max-width: 480px) {
                    .rs-header h1 { font-size: 1.5rem; }
                    .rs-content { padding-top: 1.5rem; }
                    .rs-card { padding: 1.25rem; }
                }

                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>

            <div className="rs-page">
                {/* Navbar Publik */}
                <nav className="rs-nav">
                    <Link to="/" className="rs-nav-brand">
                        <BookOpen size={24} /> Naik Kelas
                    </Link>
                    <Link to="/" style={{ fontSize: '0.85rem', fontWeight: 700, color: '#64748b', textDecoration: 'none' }}>
                        Kembali ke Home
                    </Link>
                </nav>

                <div className="rs-content">
                    {isSuccess ? (
                        <div className="rs-success-card">
                            <div className="rs-success-icon">
                                <CheckCircle size={40} />
                            </div>
                            <h2 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '0.75rem' }}>Pengajuan Terkirim!</h2>
                            <p style={{ color: '#64748b', marginBottom: '2rem', lineHeight: 1.6 }}>
                                Permintaan reschedule Anda telah masuk ke sistem kami. Tim Admin akan segera memproses pengajuan ini.
                            </p>
                            <button onClick={() => setIsSuccess(false)} className="rs-btn rs-btn-blue">
                                Buat Pengajuan Lagi
                            </button>
                            <div style={{ marginTop: '1.5rem' }}>
                                <Link to="/" style={{ color: '#2563eb', fontWeight: 700, textDecoration: 'none', fontSize: '0.9rem' }}>
                                    Kembali ke Beranda
                                </Link>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="rs-header">
                                <h1>Pengajuan Reschedule</h1>
                                <p>Siswa ingin pindah jadwal belajar? Ajukan di sini dengan mudah.</p>
                            </div>

                            <form onSubmit={handleSubmit} className="rs-card">
                                {/* ASAL SECTION */}
                                <div style={{ marginBottom: '2rem' }}>
                                    <h3 style={{ fontSize: '1rem', fontWeight: 900, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <div style={{ width: '8px', height: '16px', borderRadius: '2px', background: '#2563eb' }} />
                                        Data Jadwal Asal
                                    </h3>

                                    <div className="rs-input-group">
                                        <label className="rs-label">Pilih Siswa & Program</label>
                                        <div style={{ position: 'relative' }} ref={dropdownRef}>
                                            <div
                                                onClick={() => setIsAktivasiDropdownOpen(!isAktivasiDropdownOpen)}
                                                className="rs-input"
                                                style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#eff6ff', borderColor: '#bfdbfe' }}
                                            >
                                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {formData.aktivasi_id && selectedAktivasi
                                                        ? `${selectedAktivasi.nama_siswa} (${selectedAktivasi.detail_jadwal?.hari || '-'} ${selectedAktivasi.detail_jadwal?.jam || '-'})`
                                                        : '-- Klik untuk Pilih Siswa --'}
                                                </span>
                                                <span style={{ transform: isAktivasiDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', fontSize: '0.75rem' }}>▼</span>
                                            </div>

                                            {isAktivasiDropdownOpen && (
                                                <div className="rs-dropdown-menu">
                                                    <div className="rs-search-box">
                                                        <div style={{ position: 'relative' }}>
                                                            <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                                            <input
                                                                type="text"
                                                                placeholder="Ketik nama siswa..."
                                                                className="rs-input"
                                                                style={{ paddingLeft: '2.25rem', fontSize: '0.9rem' }}
                                                                value={aktivasiSearch}
                                                                onChange={(e) => setAktivasiSearch(e.target.value)}
                                                                onClick={(e) => e.stopPropagation()}
                                                                autoFocus
                                                            />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        {aktivasis.filter(a => !aktivasiSearch || a.nama_siswa?.toLowerCase().includes(aktivasiSearch.toLowerCase())).length === 0 ? (
                                                            <div style={{ padding: '1rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.9rem' }}>Siswa tidak ditemukan</div>
                                                        ) : (
                                                            aktivasis.filter(a => !aktivasiSearch || a.nama_siswa?.toLowerCase().includes(aktivasiSearch.toLowerCase())).map(a => (
                                                                <div
                                                                    key={a.id}
                                                                    onClick={() => {
                                                                        setFormData(prev => ({ ...prev, aktivasi_id: a.id, tanggal_asal: '', jadwal_tujuan_id: '', tanggal_tujuan: '', jam_tujuan: '' }));
                                                                        setIsAktivasiDropdownOpen(false);
                                                                        setAktivasiSearch('');
                                                                    }}
                                                                    className={`rs-option ${formData.aktivasi_id === a.id ? 'selected' : ''}`}
                                                                >
                                                                    <div style={{ fontWeight: 700 }}>{a.nama_siswa}</div>
                                                                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                                        {a.detail_jadwal?.nama_program} — {a.detail_jadwal?.hari} {a.detail_jadwal?.jam} [{a.detail_jadwal?.unit}]
                                                                    </div>
                                                                </div>
                                                            ))
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {selectedAktivasi && (
                                        <div className="rs-input-group">
                                            <label className="rs-label">Tanggal Pelajaran yang Ingin Dipindah</label>
                                            {jadwalDates.length === 0 ? (
                                                <p style={{ color: '#ef4444', fontSize: '0.85rem' }}>Tidak ada jadwal tersedia dalam 10 hari ke depan.</p>
                                            ) : (
                                                <div className="rs-select-wrapper">
                                                    <select
                                                        value={formData.tanggal_asal}
                                                        onChange={(e) => setFormData(prev => ({ ...prev, tanggal_asal: e.target.value }))}
                                                        className="rs-input"
                                                        required
                                                    >
                                                        <option value="" disabled>-- Pilih Tanggal Asal --</option>
                                                        {jadwalDates.map(tgl => {
                                                            const d = new Date(tgl + 'T00:00:00');
                                                            return <option key={tgl} value={tgl}>{dayNames[d.getDay()]}, {tgl}</option>;
                                                        })}
                                                    </select>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* TUJUAN SECTION */}
                                <div style={{ marginBottom: '2rem' }}>
                                    <h3 style={{ fontSize: '1rem', fontWeight: 900, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <div style={{ width: '8px', height: '16px', borderRadius: '2px', background: '#2563eb' }} />
                                        Rencana Jadwal Baru
                                    </h3>

                                    <div className="rs-input-group">
                                        <label className="rs-label">Ingin Pindah ke Tanggal Berapa?</label>
                                        <div className="rs-select-wrapper">
                                            <select
                                                disabled={!formData.aktivasi_id}
                                                value={formData.tanggal_tujuan}
                                                onChange={(e) => setFormData(prev => ({ ...prev, tanggal_tujuan: e.target.value, jadwal_tujuan_id: '', jam_tujuan: '' }))}
                                                className="rs-input"
                                                required
                                            >
                                                <option value="" disabled>-- Pilih Tanggal Tujuan --</option>
                                                {dates10.map(d => {
                                                    const dateStr = d.toISOString().split('T')[0];
                                                    return <option key={dateStr} value={dateStr}>{dayNames[d.getDay()]}, {dateStr}</option>;
                                                })}
                                            </select>
                                        </div>
                                    </div>

                                    {formData.tanggal_tujuan && (
                                        <div className="rs-input-group">
                                            <label className="rs-label">Pilih Jam & Tutor yang Kosong</label>
                                            {targetSlots.length === 0 ? (
                                                <p style={{ color: '#ef4444', fontSize: '0.85rem' }}>Maaf, tidak ada jadwal kosong di hari tersebut.</p>
                                            ) : (
                                                <div className="rs-select-wrapper">
                                                    <select
                                                        value={formData.jadwal_tujuan_id}
                                                        onChange={(e) => {
                                                            const jid = e.target.value;
                                                            const tj = jadwals.find(j => j.id === jid);
                                                            setFormData(prev => ({ ...prev, jadwal_tujuan_id: jid, jam_tujuan: tj?.jam || '' }));
                                                        }}
                                                        className="rs-input"
                                                        required
                                                    >
                                                        <option value="" disabled>-- Pilih Slot Kosong --</option>
                                                        {targetSlots.map(s => (
                                                            <option key={s.id} value={s.id}>
                                                                {s.jam || '-'} — Tutor {s.nama_guru} (Sisa: {s.sisaKuota})
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {formData.jadwal_tujuan_id && (() => {
                                        const tj = jadwals.find(j => j.id === formData.jadwal_tujuan_id);
                                        const conflicts = getSiswaJamsOnDate(formData.tanggal_tujuan);
                                        const isConflict = tj && conflicts.includes(tj.jam);
                                        return (
                                            <>
                                                {isConflict && (
                                                    <div className="rs-info-box warning">
                                                        <strong>Hati-hati:</strong> Siswa sudah punya jadwal lain di jam ini ({tj.jam}). Silakan cek kembali.
                                                    </div>
                                                )}
                                                <div className="rs-info-box success">
                                                    <strong>Terpilih:</strong> Pindah ke jam <strong>{tj?.jam}</strong> dengan Tutor <strong>{tj?.nama_guru}</strong>.
                                                </div>
                                            </>
                                        );
                                    })()}
                                </div>

                                {/* CATATAN */}
                                <div className="rs-input-group">
                                    <label className="rs-label">Alasan / Catatan (Opsional)</label>
                                    <textarea
                                        value={formData.catatan}
                                        onChange={(e) => setFormData(prev => ({ ...prev, catatan: e.target.value }))}
                                        className="rs-input"
                                        style={{ resize: 'none', height: '80px' }}
                                        placeholder="Contoh: Ada acara keluarga, sakit, dll."
                                    />
                                </div>

                                <button type="submit" className="rs-btn rs-btn-blue" disabled={isSubmitting || !formData.jadwal_tujuan_id}>
                                    {isSubmitting ? <RefreshCw size={20} style={{ animation: 'spin 1.5s linear infinite' }} /> : '✓ Kirim Pengajuan'}
                                </button>
                            </form>
                        </>
                    )}
                </div>

                {/* Footer Publik */}
                <footer style={{ padding: '2rem 1rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                    &copy; {new Date().getFullYear()} Ahe Naik Kelas. All rights reserved.
                </footer>
            </div>
        </>
    );
}
