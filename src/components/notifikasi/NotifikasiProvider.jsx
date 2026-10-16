import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, X, AlertTriangle, CheckCircle2, MessageSquare, ClipboardCheck, Award, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/authStore';
import { NotifikasiContext } from '../../context/notifikasiStore';

// Notifikasi perlu tindakan (Revisi) muncul lagi saat aplikasi dibuka kembali
// dari latar belakang, tapi paling sering sekali per jeda ini — cukup untuk
// terlihat saat guru membuka aplikasi untuk absen, tanpa mengganggu.
const JEDA_ULANG_MS = 3 * 60 * 60 * 1000;

const KOLOM = 'id, created_at, jenis, judul, isi, teaching_assessment_id, kpi_assessment_id, perlu_tindakan, dibaca_at, selesai_at, kpi_assessments(periode_tahun, periode_bulan)';

const perluPerhatian =(n) => !n.dibaca_at || (n.perlu_tindakan && !n.selesai_at);

const tautan = (n) => {
  if (n.teaching_assessment_id) return `/penilaian?buka=${n.teaching_assessment_id}`;
  if (n.kpi_assessment_id) {
    const k = n.kpi_assessments;
    return `/kpi/penilaian?buka=${n.kpi_assessment_id}` + (k ? `&tahun=${k.periode_tahun}&bulan=${k.periode_bulan}` : '');
  }
  return null;
};

const IKON = {
  penilaian_revisi:   { Ikon: AlertTriangle,  warna: '#b91c1c' },
  penilaian_komentar: { Ikon: MessageSquare,  warna: '#4f46e5' },
  penilaian_approve:  { Ikon: CheckCircle2,   warna: '#047857' },
  penilaian_baru:     { Ikon: ClipboardCheck, warna: '#d97706' },
  kpi_approve:        { Ikon: Award,          warna: '#047857' },
};

const waktuLalu = (d) => {
  const menit = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (menit < 1)  return 'baru saja';
  if (menit < 60) return `${menit} menit lalu`;
  const jam = Math.floor(menit / 60);
  if (jam < 24)   return `${jam} jam lalu`;
  const hari = Math.floor(jam / 24);
  if (hari < 7)   return `${hari} hari lalu`;
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
};

function ItemNotifikasi({ n, onBuka }) {
  const { Ikon, warna } = IKON[n.jenis] || IKON.penilaian_baru;
  const aktif = perluPerhatian(n);
  const link = tautan(n);
  return (
    <div style={{ display: 'flex', gap: '0.65rem', padding: '0.75rem', borderRadius: '0.6rem',
      border: `1px solid ${n.perlu_tindakan && !n.selesai_at ? 'rgba(185,28,28,0.35)' : 'var(--glass-border)'}`,
      background: aktif ? 'var(--surface-color)' : 'transparent', opacity: aktif ? 1 : 0.7 }}>
      <Ikon size={18} style={{ color: warna, flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>{n.judul}</span>
          {n.perlu_tindakan && !n.selesai_at && (
            <span style={{ background: 'rgba(185,28,28,0.12)', color: '#b91c1c', padding: '0.05rem 0.45rem', borderRadius: 999, fontSize: '0.68rem', fontWeight: 700 }}>
              Perlu tindakan
            </span>
          )}
        </div>
        {n.isi && <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.2rem', wordBreak: 'break-word' }}>{n.isi}</div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginTop: '0.45rem' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{waktuLalu(n.created_at)}</span>
          {link && (
            <button type="button" className="btn btn-primary" onClick={() => onBuka(n)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', padding: '0.3rem 0.7rem', fontSize: '0.78rem' }}>
              {n.kpi_assessment_id ? 'Buka KPI' : 'Buka Penilaian'} <ChevronRight size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function NotifikasiProvider({ children }) {
  const { user } = useAuth();
  const guruId = user?.id;
  const navigate = useNavigate();

  const [items, setItems]     = useState([]);
  const [popup, setPopup]     = useState(false);   // pop-up otomatis: hanya yang perlu perhatian
  const [panel, setPanel]     = useState(false);   // dibuka dari lonceng: riwayat terbaru
  const sudahTampil = useRef(new Set());            // id yang sudah pernah tampil di pop-up sesi ini
  const terakhirPopup = useRef(0);

  const muat = useCallback(async () => {
    if (!guruId) return [];
    // Riwayat terbaru untuk panel + semua yang masih perlu perhatian
    // (bisa lebih tua dari 30 terbaru) untuk pop-up dan badge.
    const [terbaru, terbuka] = await Promise.all([
      supabase.from('notifikasi').select(KOLOM).eq('guru_id', guruId)
        .order('created_at', { ascending: false }).limit(30),
      supabase.from('notifikasi').select(KOLOM).eq('guru_id', guruId)
        .or('dibaca_at.is.null,and(perlu_tindakan.is.true,selesai_at.is.null)')
        .order('created_at', { ascending: false }),
    ]);
    // Tabel belum ada (migrasi belum dijalankan) → diam saja.
    if (terbaru.error || terbuka.error) return [];
    const peta = new Map();
    [...(terbuka.data || []), ...(terbaru.data || [])].forEach(n => peta.set(n.id, n));
    const semua = [...peta.values()].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    setItems(semua);
    return semua;
  }, [guruId]);

  const cekPopup = useCallback(async () => {
    const semua = await muat();
    const perlu = semua.filter(perluPerhatian);
    if (!perlu.length) return;
    const adaBaru = perlu.some(n => !n.dibaca_at && !sudahTampil.current.has(n.id));
    const sudahLama = Date.now() - terakhirPopup.current > JEDA_ULANG_MS;
    if (adaBaru || sudahLama) {
      perlu.forEach(n => sudahTampil.current.add(n.id));
      terakhirPopup.current = Date.now();
      setPopup(true);
    }
  }, [muat]);

  // Saat login / aplikasi dimuat, dan setiap kali PWA kembali dari latar
  // belakang — guru jarang benar-benar menutup aplikasinya.
  useEffect(() => {
    if (!guruId) return;
    cekPopup();
    const onVisible = () => { if (document.visibilityState === 'visible') cekPopup(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [guruId, cekPopup]);

  const tandaiDibaca = useCallback(async (ids) => {
    const belum = ids.filter(id => items.find(n => n.id === id && !n.dibaca_at));
    if (!belum.length) return;
    const now = new Date().toISOString();
    setItems(prev => prev.map(n => belum.includes(n.id) ? { ...n, dibaca_at: now } : n));
    await supabase.rpc('notifikasi_tandai_dibaca', { p_ids: belum });
  }, [items]);

  const buka = (n) => {
    tandaiDibaca([n.id]);
    setPopup(false);
    setPanel(false);
    const link = tautan(n);
    if (link) navigate(link);
  };

  const daftarPopup = useMemo(() => items.filter(perluPerhatian), [items]);
  const jumlah = daftarPopup.length;

  const tutupPopup = () => {
    // Ditutup = sudah dilihat. Yang perlu tindakan tetap terbuka sampai dibalas.
    tandaiDibaca(daftarPopup.map(n => n.id));
    setPopup(false);
  };

  const nilai = useMemo(() => ({ items, jumlah, muat, bukaPanel: () => setPanel(true) }), [items, jumlah, muat]);

  const adaTindakan = daftarPopup.some(n => n.perlu_tindakan && !n.selesai_at);

  return (
    <NotifikasiContext.Provider value={nilai}>
      {children}

      {popup && daftarPopup.length > 0 && (
        <div className="modal-overlay modal-tengah" style={{ zIndex: 200 }}
          onClick={e => { if (e.target === e.currentTarget) tutupPopup(); }}>
          <div className="modal-content" style={{ maxWidth: 460 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Bell size={18} style={{ color: 'var(--primary)' }} />
                <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Notifikasi untuk Anda</h3>
              </div>
              <button type="button" onClick={tutupPopup} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
              {daftarPopup.map(n => <ItemNotifikasi key={n.id} n={n} onBuka={buka} />)}
            </div>
            {adaTindakan && (
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0.85rem 0 0' }}>
                Penilaian yang perlu tindakan akan terus muncul sampai Anda membalasnya di kolom komentar.
              </p>
            )}
            <button type="button" className="btn" onClick={tutupPopup}
              style={{ width: '100%', marginTop: '0.85rem', background: 'var(--surface-color)' }}>
              {adaTindakan ? 'Nanti saja' : 'Tutup'}
            </button>
          </div>
        </div>
      )}

      {panel && (
        <div className="modal-overlay modal-tengah" style={{ zIndex: 200 }}
          onClick={e => { if (e.target === e.currentTarget) setPanel(false); }}>
          <div className="modal-content" style={{ maxWidth: 460 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', gap: '0.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Notifikasi</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {items.some(n => !n.dibaca_at) && (
                  <button type="button" onClick={() => tandaiDibaca(items.map(n => n.id))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontSize: '0.78rem', fontWeight: 600, fontFamily: 'inherit' }}>
                    Tandai semua dibaca
                  </button>
                )}
                <button type="button" onClick={() => setPanel(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                  <X size={18} />
                </button>
              </div>
            </div>
            {items.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', textAlign: 'center', padding: '1.5rem 0' }}>Belum ada notifikasi.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                {items.map(n => <ItemNotifikasi key={n.id} n={n} onBuka={buka} />)}
              </div>
            )}
          </div>
        </div>
      )}
    </NotifikasiContext.Provider>
  );
}
