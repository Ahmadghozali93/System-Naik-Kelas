import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { X, MessageCircle, Send, UserPlus, CheckCircle2, BookOpen, Users, Star, ChevronRight, Award, GraduationCap, LogIn, Target, Gamepad2, Layers, FileText, Brain, PencilLine, Puzzle, ArrowDown, Heart, TrendingUp, Smile } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function LandingPage() {
    const { user } = useAuth();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitSuccess, setSubmitSuccess] = useState(false);
    const [units, setUnits] = useState([]);
    const [programs, setPrograms] = useState([]);

    const [formData, setFormData] = useState({
        nama: '', nama_ortu: '', unit: '', nowa: '', alamat: '',
        ig: '', fb: '', tiktok: ''
    });

    const WA_NUMBER = '6282341988735';

    useEffect(() => {
        const fetchData = async () => {
            const [unitRes, progRes] = await Promise.all([
                supabase.from('units').select('nama').eq('aktif', true),
                supabase.from('programs').select('id, nama, deskripsi, status').eq('status', 'Aktif')
            ]);
            if (unitRes.data) {
                setUnits(unitRes.data);
                if (unitRes.data.length > 0) setFormData(prev => ({ ...prev, unit: unitRes.data[0].nama }));
            }
            if (progRes.data) setPrograms(progRes.data);
        };
        fetchData();
    }, []);

    const handleInputChange = (e) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const newId = 'SISWA-' + Math.random().toString(36).substr(2, 6).toUpperCase();
            const today = new Date().toISOString().split('T')[0];
            const { error } = await supabase.from('siswa').insert([{ id: newId, dibuat_pada: today, status: 'Booking', ...formData }]);
            if (error) throw error;
            setSubmitSuccess(true);
            setFormData({ nama: '', nama_ortu: '', unit: units.length > 0 ? units[0].nama : '', nowa: '', alamat: '', ig: '', fb: '', tiktok: '' });
        } catch (error) {
            console.error('Error:', error.message);
            alert('Gagal mengirim pendaftaran. Silakan coba lagi.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const openModal = () => { setIsModalOpen(true); setSubmitSuccess(false); };
    const waLink = (msg) => `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`;

    // Color map for program cards
    const cardColors = [
        { bg: '#dbeafe', border: '#93c5fd', color: '#1d4ed8', icon: '#2563eb' },
        { bg: '#fef3c7', border: '#fcd34d', color: '#92400e', icon: '#f59e0b' },
        { bg: '#d1fae5', border: '#6ee7b7', color: '#065f46', icon: '#10b981' },
        { bg: '#fce7f3', border: '#f9a8d4', color: '#9d174d', icon: '#ec4899' },
        { bg: '#e0e7ff', border: '#a5b4fc', color: '#3730a3', icon: '#6366f1' },
        { bg: '#fed7aa', border: '#fdba74', color: '#9a3412', icon: '#f97316' },
    ];

    return (
        <>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');

                .lp * { box-sizing: border-box; margin: 0; padding: 0; }
                .lp { font-family: 'Nunito', sans-serif; color: #1e293b; background: #ffffff; overflow-x: hidden; }

                .lp { --blue: #2563eb; --blue-dark: #1d4ed8; --blue-light: #dbeafe; --blue-50: #eff6ff;
                       --yellow: #f59e0b; --yellow-light: #fef3c7; --yellow-dark: #d97706;
                       --green: #10b981; --green-light: #d1fae5;
                       --gray-50: #f8fafc; --gray-100: #f1f5f9; --gray-200: #e2e8f0; --gray-400: #94a3b8; --gray-600: #475569; --gray-800: #1e293b; }

                .lp-nav { display: flex; justify-content: space-between; align-items: center; padding: 1rem 2rem; background: white; border-bottom: 1px solid var(--gray-200); position: sticky; top: 0; z-index: 50; }
                .lp-nav-brand { display: flex; align-items: center; gap: 0.5rem; font-weight: 800; font-size: 1.25rem; color: var(--blue); text-decoration: none; }

                .lp-nav-actions { display: flex; gap: 0.5rem; align-items: center; }

                .lp-btn { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.7rem 1.4rem; border-radius: 0.75rem; font-weight: 700; font-size: 0.95rem; border: none; cursor: pointer; text-decoration: none; transition: all 0.2s; font-family: inherit; }
                .lp-btn-wa { background: #25D366; color: white; box-shadow: 0 4px 14px rgba(37,211,102,0.3); }
                .lp-btn-wa:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(37,211,102,0.4); }
                .lp-btn-blue { background: var(--blue); color: white; box-shadow: 0 4px 14px rgba(37,99,235,0.3); }
                .lp-btn-blue:hover { transform: translateY(-2px); background: var(--blue-dark); }
                .lp-btn-outline { background: white; color: var(--blue); border: 2px solid var(--blue); }
                .lp-btn-outline:hover { background: var(--blue-50); }
                .lp-btn-white { background: white; color: var(--blue-dark); box-shadow: 0 4px 14px rgba(0,0,0,0.1); }
                .lp-btn-white:hover { transform: translateY(-2px); }
                .lp-btn-green { background: var(--green); color: white; }
                .lp-btn-sm { padding: 0.5rem 1rem; font-size: 0.85rem; border-radius: 0.5rem; }
                .lp-btn-lg { padding: 1rem 2rem; font-size: 1.1rem; border-radius: 1rem; }

                .lp-hero { display: grid; grid-template-columns: 1fr 1fr; gap: 3rem; align-items: center; padding: 4rem 2rem; max-width: 1200px; margin: 0 auto; }
                .lp-hero-badge { display: inline-flex; align-items: center; gap: 0.4rem; background: var(--yellow-light); color: var(--yellow-dark); font-weight: 700; font-size: 0.85rem; padding: 0.4rem 1rem; border-radius: 2rem; margin-bottom: 1.25rem; }
                .lp-hero h1 { font-size: 2.75rem; font-weight: 900; line-height: 1.15; color: var(--gray-800); margin-bottom: 1.25rem; letter-spacing: -0.02em; }
                .lp-hero h1 span { color: var(--blue); }
                .lp-hero p { font-size: 1.1rem; color: var(--gray-600); line-height: 1.7; margin-bottom: 2rem; }
                .lp-hero-img { border-radius: 1.5rem; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.12); }
                .lp-hero-img img { width: 100%; height: auto; display: block; }
                .lp-hero-btns { display: flex; gap: 0.75rem; flex-wrap: wrap; }

                .lp-section { padding: 5rem 2rem; }
                .lp-section-center { text-align: center; max-width: 800px; margin: 0 auto; }
                .lp-section h2 { font-size: 2rem; font-weight: 800; color: var(--gray-800); margin-bottom: 1rem; }
                .lp-section h2 span { color: var(--blue); }
                .lp-section .lp-subtitle { font-size: 1.05rem; color: var(--gray-600); line-height: 1.7; margin-bottom: 2.5rem; }

                .lp-method { background: var(--gray-50); }
                .lp-compare { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; max-width: 800px; margin: 0 auto 2rem; }
                .lp-compare-card { padding: 2rem; border-radius: 1rem; text-align: center; }
                .lp-compare-card.old { background: #fff1f2; border: 2px solid #fecdd3; }
                .lp-compare-card.new { background: var(--blue-light); border: 2px solid #93c5fd; }
                .lp-compare-card h3 { font-size: 1rem; font-weight: 700; margin-bottom: 1rem; }
                .lp-compare-card.old h3 { color: #be123c; }
                .lp-compare-card.new h3 { color: var(--blue-dark); }
                .lp-compare-code { font-family: 'Courier New', monospace; font-size: 1.5rem; font-weight: 800; line-height: 2; letter-spacing: 0.05em; }
                .lp-compare-card.old .lp-compare-code { color: #9f1239; }
                .lp-compare-card.new .lp-compare-code { color: var(--blue); }
                .lp-method-note { max-width: 600px; margin: 0 auto; background: var(--yellow-light); padding: 1.25rem 1.5rem; border-radius: 0.75rem; font-size: 0.95rem; color: var(--yellow-dark); font-weight: 600; line-height: 1.6; text-align: center; }

                .lp-checklist { list-style: none; display: grid; gap: 1rem; max-width: 600px; margin: 0 auto; text-align: left; }
                .lp-checklist li { display: flex; gap: 0.75rem; align-items: flex-start; font-size: 1.05rem; color: var(--gray-600); line-height: 1.6; }
                .lp-checklist li .check { flex-shrink: 0; width: 28px; height: 28px; border-radius: 50%; background: var(--green-light); color: var(--green); display: flex; align-items: center; justify-content: center; margin-top: 2px; }

                .lp-testimonials { background: var(--blue-50); }
                .lp-testi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; max-width: 1000px; margin: 0 auto; }
                .lp-testi-card { background: white; padding: 2rem; border-radius: 1rem; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.06); border: 1px solid var(--gray-200); }
                .lp-testi-card .quote { font-size: 2rem; color: var(--blue); font-weight: 900; line-height: 1; margin-bottom: 0.5rem; }
                .lp-testi-card p { font-size: 0.95rem; color: var(--gray-600); line-height: 1.7; font-style: italic; margin-bottom: 1rem; }
                .lp-testi-card .author { font-size: 0.85rem; font-weight: 700; color: var(--gray-800); }

                .lp-programs { background: white; }
                .lp-prog-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.25rem; max-width: 900px; margin: 0 auto; }
                .lp-prog-card { padding: 1.5rem; border-radius: 1rem; text-align: center; border: 2px solid; transition: transform 0.2s; }
                .lp-prog-card:hover { transform: translateY(-4px); }
                .lp-prog-card .prog-icon { width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 0.75rem; }
                .lp-prog-card .prog-name { font-size: 1.05rem; font-weight: 700; }

                .lp-about { background: var(--gray-50); }
                .lp-stats { display: flex; gap: 2rem; justify-content: center; margin-top: 2.5rem; flex-wrap: wrap; }
                .lp-stat { text-align: center; background: white; padding: 1.5rem 2rem; border-radius: 1rem; box-shadow: 0 2px 8px rgba(0,0,0,0.06); min-width: 180px; }
                .lp-stat .stat-icon { width: 44px; height: 44px; border-radius: 50%; background: var(--blue-light); color: var(--blue); display: flex; align-items: center; justify-content: center; margin: 0 auto 0.5rem; }
                .lp-stat .label { font-size: 0.9rem; color: var(--gray-600); font-weight: 700; line-height: 1.4; }

                /* ALUR METODE */
                .lp-alur-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; max-width: 700px; margin: 0 auto; }
                .lp-alur-card { display: flex; align-items: center; gap: 0.75rem; background: white; padding: 1rem 1.25rem; border-radius: 0.75rem; border: 1.5px solid var(--gray-200); transition: all 0.2s; }
                .lp-alur-card:hover { border-color: var(--blue); box-shadow: 0 4px 12px rgba(37,99,235,0.1); }
                .lp-steps-flow { display: flex; flex-direction: column; align-items: center; gap: 0; max-width: 500px; margin: 0 auto; }
                .lp-step-item { display: flex; align-items: center; gap: 1rem; background: white; padding: 1.25rem 1.75rem; border-radius: 1rem; box-shadow: 0 2px 10px rgba(0,0,0,0.06); width: 100%; border: 2px solid var(--gray-200); transition: all 0.2s; }
                .lp-step-item:hover { border-color: var(--blue); transform: translateX(4px); box-shadow: 0 4px 16px rgba(37,99,235,0.12); }
                .lp-step-num { width: 40px; height: 40px; border-radius: 50%; background: var(--blue); color: white; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 1rem; flex-shrink: 0; }
                .lp-step-content { flex: 1; }
                .lp-step-content .step-title { font-weight: 800; font-size: 1rem; color: var(--gray-800); }
                .lp-step-content .step-desc { font-size: 0.85rem; color: var(--gray-600); margin-top: 0.15rem; }
                .lp-step-arrow { color: var(--blue); opacity: 0.4; padding: 0.25rem 0; }

                /* ABOUT GRID */
                .lp-about-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; max-width: 900px; margin: 0 auto; }

                /* VALUE UTAMA */
                .lp-values-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; max-width: 900px; margin: 0 auto; }
                .lp-value-card { background: white; padding: 2rem; border-radius: 1rem; border: 2px solid var(--gray-200); transition: all 0.25s; position: relative; overflow: hidden; }
                .lp-value-card:hover { border-color: var(--blue); transform: translateY(-4px); box-shadow: 0 8px 24px rgba(37,99,235,0.1); }
                .lp-value-card .value-icon { width: 52px; height: 52px; border-radius: 0.75rem; display: flex; align-items: center; justify-content: center; margin-bottom: 1rem; }
                .lp-value-card h3 { font-size: 1.1rem; font-weight: 800; color: var(--gray-800); margin-bottom: 0.5rem; }
                .lp-value-card p { font-size: 0.9rem; color: var(--gray-600); line-height: 1.6; }
                .lp-value-card .value-tags { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.75rem; }
                .lp-value-card .value-tag { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.8rem; font-weight: 700; padding: 0.3rem 0.75rem; border-radius: 2rem; }

                /* JOURNEY EMOSIONAL */
                .lp-journey-flow { display: flex; align-items: center; justify-content: center; gap: 0; max-width: 900px; margin: 0 auto 3rem; flex-wrap: wrap; }
                .lp-journey-step { text-align: center; padding: 1.5rem 1rem; flex: 1; min-width: 140px; }
                .lp-journey-step .journey-icon { width: 56px; height: 56px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 0.75rem; }
                .lp-journey-step .journey-label { font-size: 0.9rem; font-weight: 700; color: var(--gray-800); line-height: 1.4; }
                .lp-journey-arrow { color: var(--blue); opacity: 0.35; flex-shrink: 0; }

                .lp-cta { background: linear-gradient(135deg, var(--blue) 0%, #1e40af 100%); color: white; text-align: center; padding: 5rem 2rem; }
                .lp-cta h2 { color: white; font-size: 2rem; max-width: 700px; margin: 0 auto 1rem; line-height: 1.35; }
                .lp-cta p { color: rgba(255,255,255,0.85); font-size: 1.05rem; margin-bottom: 2rem; }
                .lp-cta-btns { display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; }

                .lp-float-wa { position: fixed; bottom: 1.5rem; right: 1.5rem; width: 60px; height: 60px; border-radius: 50%; background: #25D366; color: white; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 20px rgba(37,211,102,0.45); z-index: 100; transition: transform 0.25s; text-decoration: none; }
                .lp-float-wa:hover { transform: scale(1.12); }

                .lp-footer { padding: 1.5rem 2rem; text-align: center; color: var(--gray-400); font-size: 0.85rem; border-top: 1px solid var(--gray-200); }

                .lp-modal-bg { position: fixed; inset: 0; z-index: 200; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; padding: 1rem; overflow-y: auto; }
                .lp-modal { background: white; border-radius: 1rem; width: 100%; max-width: 460px; max-height: 90vh; overflow-y: auto; padding: 2rem; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); }
                .lp-modal h2 { font-size: 1.35rem; margin: 0; color: var(--gray-800); }
                .lp-modal label { display: block; margin-bottom: 0.3rem; font-weight: 700; font-size: 0.85rem; color: var(--gray-600); }
                .lp-modal input, .lp-modal select, .lp-modal textarea { width: 100%; padding: 0.6rem 0.85rem; border-radius: 0.5rem; border: 1.5px solid var(--gray-200); background: var(--gray-50); font-size: 0.9rem; font-family: inherit; outline: none; transition: border 0.2s; }
                .lp-modal input:focus, .lp-modal select:focus, .lp-modal textarea:focus { border-color: var(--blue); }
                .lp-form-grid { display: grid; grid-template-columns: 1fr; gap: 1rem; }

                @media (max-width: 768px) {
                    .lp-hero { grid-template-columns: 1fr; padding: 2.5rem 1.25rem; gap: 2rem; text-align: center; }
                    .lp-hero h1 { font-size: 1.85rem; }
                    .lp-hero-btns { justify-content: center; }
                    .lp-hero-img { order: -1; }
                    .lp-compare { grid-template-columns: 1fr; }
                    .lp-testi-grid { grid-template-columns: 1fr; }
                    .lp-section { padding: 3rem 1.25rem; }
                    .lp-section h2 { font-size: 1.5rem; }
                    .lp-nav { padding: 0.75rem 1rem; }
                    .lp-nav-brand { font-size: 1rem; }
                    .lp-btn-sm { padding: 0.4rem 0.7rem; font-size: 0.75rem; }
                    .lp-form-grid { grid-template-columns: 1fr; }
                    .lp-stats { gap: 1rem; }
                    .lp-stat { min-width: unset; padding: 1rem 1.25rem; }
                    .lp-prog-grid { grid-template-columns: repeat(2, 1fr); }
                    .lp-values-grid { grid-template-columns: 1fr; }
                    .lp-alur-grid { grid-template-columns: repeat(2, 1fr); }
                    .lp-about-grid { grid-template-columns: repeat(2, 1fr); gap: 0.75rem; }
                    .lp-journey-flow { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; max-width: 350px; margin: 0 auto 2.5rem; }
                    .lp-journey-arrow { display: none; }
                    .lp-journey-step { padding: 1rem 0.5rem; min-width: unset; }
                    .lp-journey-step .journey-icon { width: 44px; height: 44px; }
                    .lp-journey-step .journey-label { font-size: 0.8rem; }
                    .lp-cta { padding: 3rem 1.25rem; }
                    .lp-cta h2 { font-size: 1.5rem; }
                    .lp-btn-lg { padding: 0.75rem 1.25rem; font-size: 0.95rem; }
                }
                @media (max-width: 480px) {
                    .lp-alur-grid { grid-template-columns: 1fr; }
                    .lp-about-grid { grid-template-columns: 1fr; }
                    .lp-hero h1 { font-size: 1.5rem; }
                    .lp-nav-brand { font-size: 0.9rem; gap: 0.35rem; }
                    .lp-nav-actions { gap: 0.35rem; }
                }
            `}</style>

            <div className="lp">
                {/* NAV */}
                <nav className="lp-nav">
                    <a href="/" className="lp-nav-brand">
                        <BookOpen size={26} /> Naik Kelas
                    </a>
                    <div className="lp-nav-actions">
                        <button onClick={openModal} className="lp-btn lp-btn-green lp-btn-sm">
                            <UserPlus size={16} /> Daftar
                        </button>
                        <Link to="/login" className="lp-btn lp-btn-blue lp-btn-sm">
                            <LogIn size={16} /> Sign In
                        </Link>
                    </div>
                </nav>

                {/* SECTION 1 — HERO */}
                <section className="lp-hero">
                    <div>
                        <div className="lp-hero-badge">
                            <Star size={14} /> Belajar Membaca & Menulis Anak
                        </div>
                        <h1>
                            Mau Masuk SD, <span>Tapi Anak Belum Bisa Membaca?</span>
                        </h1>
                        <p>
                            Hal ini sering membuat orang tua khawatir.
                            Di <strong>Ahe Naik Kelas</strong>, anak belajar membaca dengan <strong>cara yang lebih mudah, bertahap, dan menyenangkan.</strong>

                        </p>
                        <div className="lp-hero-btns">
                            <a href={waLink('Halo Ahe Naik Kelas, saya ingin berkonsultasi tentang program belajar membaca untuk anak saya.')} target="_blank" rel="noreferrer" className="lp-btn lp-btn-wa lp-btn-lg">
                                <MessageCircle size={22} /> Konsultasi via WhatsApp
                            </a>
                            <button onClick={openModal} className="lp-btn lp-btn-outline">
                                <UserPlus size={18} /> Daftar Sekarang
                            </button>
                        </div>
                    </div>
                    <div className="lp-hero-img">
                        <img src="/hero-bimbel.png" alt="Anak belajar membaca bersama tutor" />
                    </div>
                </section>

                {/* SECTION 2 — PERBEDAAN METODE */}
                <section className="lp-section lp-method">
                    <div className="lp-section-center">
                        <h2>Anak Hafal Huruf, Tapi  <span>Belum Tentu Bisa Membaca</span></h2>
                        <p className="lp-subtitle">Bukan soal pintar atau tidak, tapi soal metode yang tepat untuk anak.</p>
                    </div>

                    <div className="lp-compare">
                        <div className="lp-compare-card old">
                            <h3>Metode Umum di Sekolah</h3>
                            <div className="lp-compare-code">
                                B - A = BA<br />
                                B - I = BI
                            </div>
                        </div>
                        <div className="lp-compare-card new">
                            <h3>Metode di Ahe Naik Kelas</h3>
                            <div className="lp-compare-code">
                                BA &nbsp; BI &nbsp; BU<br />
                                BE &nbsp; BO
                            </div>
                        </div>
                    </div>

                    <div className="lp-method-note">
                        Anak belajar langsung membaca suku kata tanpa mengeja panjang — sehingga lebih <strong>mudah dipahami</strong>.
                    </div>
                </section>

                {/* SECTION — ALUR METODE BELAJAR AHE */}
                <section className="lp-section">
                    <div className="lp-section-center">
                        <h2>Alur <span>Metode Belajar</span> AHE</h2>
                        <p className="lp-subtitle">Setiap pertemuan, anak belajar melalui 6 langkah pembelajaran yang sistematis dan menyenangkan.</p>
                    </div>

                    <div className="lp-alur-grid">
                        {[
                            { icon: <Brain size={20} />, title: 'Senam Otak', desc: 'Pemanasan otak agar siap belajar', color: '#2563eb', bg: '#dbeafe' },
                            { icon: <CheckCircle2 size={20} />, title: 'Remidi', desc: 'Review pelajaran sebelumnya', color: '#059669', bg: '#d1fae5' },
                            { icon: <BookOpen size={20} />, title: 'Baca Modul', desc: 'Latihan membaca dengan modul AHE', color: '#d97706', bg: '#fef3c7' },
                            { icon: <Star size={20} />, title: 'Pengayaan', desc: 'Pendalaman materi', color: '#db2777', bg: '#fce7f3' },
                            { icon: <PencilLine size={20} />, title: 'Menulis', desc: 'Memperkuat ingatan lewat menulis', color: '#7c3aed', bg: '#ede9fe' },
                            { icon: <Puzzle size={20} />, title: 'Permainan', desc: 'Belajar sambil bermain', color: '#ea580c', bg: '#fff7ed' },
                        ].map((step, idx) => (
                            <div key={idx} className="lp-alur-card">
                                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: step.bg, color: step.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 800, fontSize: '0.75rem', position: 'relative' }}>
                                    {step.icon}
                                    <span style={{ position: 'absolute', top: '-4px', right: '-4px', width: '18px', height: '18px', borderRadius: '50%', background: 'var(--blue)', color: 'white', fontSize: '0.65rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{idx + 1}</span>
                                </div>
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--gray-800)' }}>{step.title}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--gray-400)', marginTop: '0.1rem' }}>{step.desc}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* SECTION — VALUE UTAMA AHE */}
                <section className="lp-section" style={{ background: 'var(--gray-50)' }}>
                    <div className="lp-section-center">
                        <h2>Kenapa <span>Metode AHE</span> Lebih Efektif?</h2>
                        <p className="lp-subtitle">Ini yang membedakan AHE dari bimbel lainnya.</p>
                    </div>

                    <div className="lp-values-grid">
                        <div className="lp-value-card">
                            <div className="value-icon" style={{ background: '#dbeafe', color: '#2563eb' }}>
                                <BookOpen size={26} />
                            </div>
                            <h3>Membaca Tanpa Mengeja</h3>
                            <p>Anak langsung belajar membaca suku kata — tanpa perlu mengeja huruf satu per satu. Lebih cepat dan lebih natural bagi otak anak.</p>
                            <div className="value-tags">
                                <span className="value-tag" style={{ background: '#dbeafe', color: '#1d4ed8' }}><CheckCircle2 size={12} /> Lebih cepat</span>
                                <span className="value-tag" style={{ background: '#dbeafe', color: '#1d4ed8' }}><CheckCircle2 size={12} /> Lebih natural</span>
                            </div>
                        </div>

                        <div className="lp-value-card">
                            <div className="value-icon" style={{ background: '#fef3c7', color: '#d97706' }}>
                                <Gamepad2 size={26} />
                            </div>
                            <h3>Belajar Sambil Bermain</h3>
                            <p>AHE bukan seperti sekolah formal. Dengan kombinasi belajar, game, dan interaksi — anak tidak merasa sedang belajar.</p>
                            <div className="value-tags">
                                <span className="value-tag" style={{ background: '#fef3c7', color: '#92400e' }}><CheckCircle2 size={12} /> Menyenangkan</span>
                                <span className="value-tag" style={{ background: '#fef3c7', color: '#92400e' }}><CheckCircle2 size={12} /> Interaktif</span>
                            </div>
                        </div>

                        <div className="lp-value-card">
                            <div className="value-icon" style={{ background: '#d1fae5', color: '#059669' }}>
                                <Layers size={26} />
                            </div>
                            <h3>Sistem Level Bertahap</h3>
                            <p>Anak belajar sistematis dari dasar hingga mahir — huruf vokal, suku kata, kata, hingga kalimat. Setiap tahap dikuasai sebelum lanjut.</p>
                            <div className="value-tags">
                                <span className="value-tag" style={{ background: '#d1fae5', color: '#065f46' }}>Tersedia Level 1 → Level 7</span>
                            </div>
                        </div>

                        <div className="lp-value-card">
                            <div className="value-icon" style={{ background: '#fce7f3', color: '#db2777' }}>
                                <FileText size={26} />
                            </div>
                            <h3>Modul Khusus Terstandardisasi</h3>
                            <p>AHE memiliki modul baca, kartu kata, dan game card yang sudah distandardisasi — bukan asal-asalan, tapi dirancang khusus.</p>
                            <div className="value-tags">
                                <span className="value-tag" style={{ background: '#fce7f3', color: '#9d174d' }}><CheckCircle2 size={12} /> Modul Baca</span>
                                <span className="value-tag" style={{ background: '#fce7f3', color: '#9d174d' }}><CheckCircle2 size={12} /> Kartu Kata</span>
                                <span className="value-tag" style={{ background: '#fce7f3', color: '#9d174d' }}><CheckCircle2 size={12} /> Game Card</span>
                            </div>
                        </div>
                    </div>
                </section>

                {/* SECTION — PROGRAM BIMBEL */}
                {programs.length > 0 && (
                    <section className="lp-section lp-programs">
                        <div className="lp-section-center">
                            <h2>Program <span>Ahe Naik Kelas</span></h2>
                            <p className="lp-subtitle">Pilih program yang sesuai untuk anak Anda.</p>
                        </div>

                        <div className="lp-prog-grid">
                            {programs.map((prog, idx) => {
                                const c = cardColors[idx % cardColors.length];
                                return (
                                    <div key={prog.id} className="lp-prog-card" style={{ background: c.bg, borderColor: c.border }}>
                                        <div className="prog-icon" style={{ background: c.border, color: 'white' }}>
                                            <BookOpen size={22} />
                                        </div>
                                        <div className="prog-name" style={{ color: c.color }}>{prog.nama}</div>
                                        {prog.deskripsi && (
                                            <div style={{ fontSize: '0.85rem', color: c.color, opacity: 0.75, marginTop: '0.5rem', lineHeight: 1.5 }}>{prog.deskripsi}</div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                )}

                {/* SECTION — PERJALANAN ANAK + TESTIMONI */}
                <section className="lp-section lp-testimonials">
                    <div className="lp-section-center">
                        <h2>Perjalanan <span>Anak Anda</span> Bersama AHE</h2>
                        <p className="lp-subtitle">Bukan hanya soal metode belajar — tapi dampak nyata yang dirasakan anak dan orang tua.</p>
                    </div>

                    <div className="lp-journey-flow">
                        <div className="lp-journey-step">
                            <div className="journey-icon" style={{ background: '#dbeafe', color: '#2563eb' }}>
                                <BookOpen size={26} />
                            </div>
                            <div className="journey-label">Anak jadi<br />bisa membaca</div>
                        </div>
                        <div className="lp-journey-arrow"><ChevronRight size={28} /></div>
                        <div className="lp-journey-step">
                            <div className="journey-icon" style={{ background: '#d1fae5', color: '#059669' }}>
                                <Smile size={26} />
                            </div>
                            <div className="journey-label">Anak jadi<br />percaya diri</div>
                        </div>
                        <div className="lp-journey-arrow"><ChevronRight size={28} /></div>
                        <div className="lp-journey-step">
                            <div className="journey-icon" style={{ background: '#fef3c7', color: '#d97706' }}>
                                <TrendingUp size={26} />
                            </div>
                            <div className="journey-label">Prestasi sekolah<br />meningkat</div>
                        </div>
                        <div className="lp-journey-arrow"><ChevronRight size={28} /></div>
                        <div className="lp-journey-step">
                            <div className="journey-icon" style={{ background: '#fce7f3', color: '#db2777' }}>
                                <Heart size={26} />
                            </div>
                            <div className="journey-label">Orang tua<br />bangga</div>
                        </div>
                    </div>

                    <div className="lp-section-center" style={{ marginBottom: '1.5rem' }}>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--gray-800)' }}>Yang Dirasakan Orang Tua</h3>
                    </div>

                    <div className="lp-testi-grid">
                        <div className="lp-testi-card">
                            <div className="quote">"</div>
                            <p>Anak saya dulu sudah kenal huruf, tapi belum bisa membaca kata. Sekarang sudah mulai membaca sendiri.</p>
                            <div className="author">— Wali Murid</div>
                        </div>
                        <div className="lp-testi-card">
                            <div className="quote">"</div>
                            <p>Yang paling terasa, anak jadi lebih percaya diri membaca. Tidak takut salah lagi.</p>
                            <div className="author">— Wali Murid</div>
                        </div>
                        <div className="lp-testi-card">
                            <div className="quote">"</div>
                            <p>Belajarnya santai, jadi anak tidak takut belajar membaca. Senang lihat progressnya.</p>
                            <div className="author">— Wali Murid</div>
                        </div>
                    </div>
                </section>

                {/* SECTION 5 — TENTANG */}
                <section className="lp-section lp-about">
                    <div className="lp-section-center">
                        <h2>Tentang <span>Ahe Naik Kelas</span></h2>
                        <p className="lp-subtitle">
                            Kami hadir untuk membantu anak usia <strong>±4,5 tahun ke atas</strong> (TK hingga kelas awal SD) agar <strong>cepat bisa membaca dan percaya diri di sekolah</strong>.
                        </p>
                    </div>

                    <div className="lp-about-grid">
                        <div className="lp-stat">
                            <div className="stat-icon"><Users size={22} /></div>
                            <div className="label">1 Guru Ngajar<br /><strong>Maks 2 Anak</strong></div>
                        </div>
                        <div className="lp-stat">
                            <div className="stat-icon"><Star size={22} /></div>
                            <div className="label">1 Minggu<br /><strong>3x Pertemuan</strong></div>
                        </div>
                        <div className="lp-stat">
                            <div className="stat-icon"><Award size={22} /></div>
                            <div className="label">Tiap Sesi<br /><strong>Max 30 Menit</strong></div>
                        </div>
                        <div className="lp-stat">
                            <div className="stat-icon"><Target size={22} /></div>
                            <div className="label">Dilayani<br /><strong>Privat</strong></div>
                        </div>
                        <div className="lp-stat">
                            <div className="stat-icon"><BookOpen size={22} /></div>
                            <div className="label">Diajarkan<br /><strong>Baca & Tulis</strong></div>
                        </div>
                        <div className="lp-stat">
                            <div className="stat-icon"><Gamepad2 size={22} /></div>
                            <div className="label">Ada Games<br /><strong>di Tiap Sesi</strong></div>
                        </div>
                    </div>
                </section>

                {/* SECTION 6 — CTA PENUTUP */}
                <section className="lp-cta">
                    <h2>Jika Anak Anda Masih Kesulitan Membaca, Anda Bisa Berdiskusi dengan Kami</h2>
                    <p>Konsultasi gratis. Tanpa kewajiban mendaftar. Kami siap membantu.</p>
                    <div className="lp-cta-btns">
                        <a href={waLink('Halo Ahe Naik Kelas, saya ingin berkonsultasi tentang program belajar membaca untuk anak saya.')} target="_blank" rel="noreferrer" className="lp-btn lp-btn-wa lp-btn-lg">
                            <MessageCircle size={22} /> Konsultasi via WhatsApp
                        </a>
                        <button onClick={openModal} className="lp-btn lp-btn-white lp-btn-lg">
                            <UserPlus size={20} /> Daftar Sekarang
                        </button>
                    </div>
                </section>

                {/* FLOATING WA */}
                <a href={waLink('Halo Ahe Naik Kelas, saya ingin bertanya tentang program belajar membaca.')} target="_blank" rel="noreferrer" className="lp-float-wa" title="Chat WhatsApp">
                    <MessageCircle size={30} />
                </a>

                {/* FOOTER */}
                <footer className="lp-footer">
                    &copy; {new Date().getFullYear()} Ahe Naik Kelas — Bimbingan Belajar Membaca Anak. All rights reserved.
                    <div style={{ marginTop: '0.25rem' }}>
                        <Link to="/login" style={{ color: 'var(--blue)', textDecoration: 'none', fontSize: '0.8rem' }}>
                            Sign In <ChevronRight size={12} style={{ verticalAlign: 'middle' }} />
                        </Link>
                    </div>
                </footer>

                {/* REGISTRATION MODAL */}
                {isModalOpen && (
                    <div className="lp-modal-bg">
                        <div className="lp-modal" onClick={e => e.stopPropagation()}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                <h2>Form Pendaftaran Siswa</h2>
                                <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                                    <X size={22} />
                                </button>
                            </div>

                            {submitSuccess ? (
                                <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                                    <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#d1fae5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                                        <CheckCircle2 size={36} />
                                    </div>
                                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>Pendaftaran Berhasil!</h3>
                                    <p style={{ color: '#64748b', marginBottom: '1.5rem' }}>Terima kasih, data Anda telah kami terima. Tim kami akan segera menghubungi Anda.</p>
                                    <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                                        <a href={waLink('Halo Ahe Naik Kelas, saya baru saja mendaftar dan ingin konfirmasi pendaftaran.')} target="_blank" rel="noreferrer" className="lp-btn lp-btn-wa lp-btn-sm">
                                            <MessageCircle size={16} /> Konfirmasi via WA
                                        </a>
                                        <button onClick={() => setIsModalOpen(false)} className="lp-btn lp-btn-sm" style={{ background: '#f3f4f6', color: '#334155' }}>Tutup</button>
                                    </div>
                                </div>
                            ) : (
                                <form onSubmit={handleSubmit} className="lp-form-grid">
                                    <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '0.25rem', marginBottom: '0.25rem' }}>
                                        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>Informasi Dasar</h3>
                                    </div>
                                    <div>
                                        <label>Nama Lengkap Siswa *</label>
                                        <input type="text" name="nama" value={formData.nama} onChange={handleInputChange} required placeholder="Nama siswa" />
                                    </div>
                                    <div>
                                        <label>Nama Orang Tua/Wali *</label>
                                        <input type="text" name="nama_ortu" value={formData.nama_ortu} onChange={handleInputChange} required placeholder="Nama orang tua" />
                                    </div>
                                    <div>
                                        <label>Unit / Cabang *</label>
                                        <select name="unit" value={formData.unit} onChange={handleInputChange} required>
                                            {units.length > 0 ? units.map(u => <option key={u.nama} value={u.nama}>{u.nama}</option>) : <option value="">--</option>}
                                        </select>
                                    </div>
                                    <div>
                                        <label>No. WhatsApp *</label>
                                        <input type="tel" name="nowa" value={formData.nowa} onChange={handleInputChange} required placeholder="08xxxxxxxxxx" />
                                    </div>
                                    <div>
                                        <label>Alamat Lengkap *</label>
                                        <textarea name="alamat" value={formData.alamat} onChange={handleInputChange} rows="2" required placeholder="Alamat tempat tinggal"></textarea>
                                    </div>

                                    <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '0.25rem', marginBottom: '0.25rem', marginTop: '0.5rem' }}>
                                        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>Sosial Media (Opsional)</h3>
                                    </div>
                                    <div>
                                        <label>Instagram</label>
                                        <input type="text" name="ig" value={formData.ig} onChange={handleInputChange} placeholder="@username" />
                                    </div>
                                    <div>
                                        <label>Facebook</label>
                                        <input type="text" name="fb" value={formData.fb} onChange={handleInputChange} placeholder="Nama Facebook" />
                                    </div>
                                    <div>
                                        <label>TikTok</label>
                                        <input type="text" name="tiktok" value={formData.tiktok} onChange={handleInputChange} placeholder="@username" />
                                    </div>



                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.75rem' }}>
                                        <button type="button" onClick={() => setIsModalOpen(false)} className="lp-btn lp-btn-sm" style={{ background: '#f3f4f6', color: '#334155' }}>Batal</button>
                                        <button type="submit" disabled={isSubmitting} className="lp-btn lp-btn-green lp-btn-sm" style={isSubmitting ? { opacity: 0.6, cursor: 'not-allowed' } : {}}>
                                            <Send size={14} /> {isSubmitting ? 'Mengirim...' : 'Kirim Pendaftaran'}
                                        </button>
                                    </div>
                                </form>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
