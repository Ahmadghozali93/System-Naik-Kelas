import { useState, useEffect, useRef } from 'react';
import { Camera, CheckCircle2, LogIn, LogOut, Clock, AlertCircle, RefreshCw, MapPin, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/authStore';
import { ambilLokasi, jarakMeter, pesanGagal } from '../../hooks/useGeolocation';

// ── WIB helpers ──────────────────────────────────────────────
const todayWIB = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }); // YYYY-MM-DD

const nowWIBDisplay = () =>
  new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit' });

const fmtTime = (ts) =>
  ts ? new Date(ts).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }) : '-';

const fmtWIBDate = (ts) =>
  ts ? new Date(ts).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '-';

// ── Mode kunci lokasi ─────────────────────────────────────────
// Cerminan absensi_mode_efektif() di migrasi 0017. Dipakai hanya untuk
// memutuskan apa yang ditampilkan; keputusan yang mengikat tetap di server.
const modeEfektif = (shift, pengaturan) => {
  if (shift?.wajib_lokasi === false) return 'nonaktif';
  let m = shift?.units?.mode_lokasi || pengaturan?.mode || 'nonaktif';
  if (pengaturan?.darurat && m === 'blokir') m = 'catat';
  return m;
};

// Di mode 'senyap' lokasi tetap direkam, tapi guru tidak diberi tahu
// apa pun — layarnya harus persis seperti sebelum fitur ini ada.
const tampilkanLokasi = (mode) => mode === 'catat' || mode === 'blokir';

// ── Komponen Kamera ───────────────────────────────────────────
function CameraModal({ onCapture, onClose, label }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [preview, setPreview] = useState(null); // blob URL setelah ambil foto
  const [capturedBlob, setCapturedBlob] = useState(null);
  const [camError, setCamError] = useState(null); // pesan error kamera

  const stopStream = () => {
    try { streamRef.current?.getTracks().forEach(t => t.stop()); } catch (_e) {}
  };

  const getCamErrorMsg = (err) => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)
      return 'Kamera tidak tersedia di browser ini. Coba buka lewat Chrome dan pastikan menggunakan HTTPS.';
    const name = err?.name || '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError')
      return 'Izin kamera ditolak. Buka Pengaturan > Privasi > Kamera dan izinkan akses untuk browser ini.';
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError')
      return 'Tidak ada kamera yang terdeteksi di perangkat ini.';
    if (name === 'NotReadableError' || name === 'TrackStartError')
      return 'Kamera sedang digunakan aplikasi lain. Tutup aplikasi lain lalu coba lagi.';
    if (name === 'OverconstrainedError')
      return 'Kamera tidak mendukung resolusi yang diminta.';
    return 'Gagal membuka kamera: ' + (err?.message || String(err));
  };

  const startCamera = async () => {
    setCamError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('MediaDevices API tidak tersedia');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 } });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; setReady(true); }
    } catch (err) {
      setCamError(getCamErrorMsg(err));
    }
  };

  useEffect(() => {
    startCamera();
    return () => stopStream();
  }, []);

  const ambilFoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width  = videoRef.current.videoWidth  || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    canvas.getContext('2d').drawImage(videoRef.current, 0, 0);
    canvas.toBlob(blob => {
      if (!blob) { setCamError('Gagal mengambil foto. Coba lagi.'); return; }
      setCapturedBlob(blob);
      setPreview(URL.createObjectURL(blob));
      stopStream();
    }, 'image/jpeg', 0.85);
  };

  const ulangi = async () => {
    setPreview(null); setCapturedBlob(null);
    await startCamera();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '1rem' }}>{label}</h2>

        {camError ? (
          <>
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.65rem', padding: '1rem', marginBottom: '1rem', color: '#b91c1c', fontSize: '0.88rem', lineHeight: 1.5 }}>
              <AlertCircle size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
              {camError}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn" style={{ flex: 1 }} onClick={onClose}>Tutup</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={startCamera}>
                <RefreshCw size={14} /> Coba Lagi
              </button>
            </div>
          </>
        ) : !preview ? (
          <>
            <video ref={videoRef} autoPlay playsInline muted
              style={{ width: '100%', borderRadius: '0.75rem', background: '#000', display: 'block' }} />
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
              <button className="btn" style={{ flex: 1 }} onClick={onClose}>Batal</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={ambilFoto} disabled={!ready}>
                <Camera size={16} /> Ambil Foto
              </button>
            </div>
          </>
        ) : (
          <>
            <img src={preview} alt="preview" style={{ width: '100%', borderRadius: '0.75rem', display: 'block' }} />
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
              <button className="btn" style={{ flex: 1 }} onClick={ulangi}>
                <RefreshCw size={14} /> Ulangi
              </button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => onCapture(capturedBlob)}>
                <CheckCircle2 size={14} /> Gunakan Foto Ini
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Kartu Kegagalan ───────────────────────────────────────────
// Kegagalan absen tidak boleh berhenti di "gagal". Guru perlu tahu
// sebabnya dan langkah yang bisa mereka kerjakan sendiri — kalau tidak,
// yang terjadi bukan mereka membetulkan setelan HP, melainkan menelepon
// SPV, dan fitur ini akan dianggap biang masalah lalu dimatikan.
function KartuGagal({ g, onTutup, onUlangi, onAjukan }) {
  return (
    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.65rem', padding: '1rem 1.15rem', marginBottom: '1rem', color: '#7f1d1d' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
        <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 2, color: '#dc2626' }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{g.judul}</div>
          <div style={{ fontSize: '0.86rem', marginTop: '0.2rem', lineHeight: 1.5 }}>{g.pesan}</div>

          {g.langkah?.length > 0 && (
            <ol style={{ margin: '0.65rem 0 0 1.1rem', padding: 0, fontSize: '0.82rem', lineHeight: 1.6 }}>
              {g.langkah.map((l, i) => <li key={i}>{l}</li>)}
            </ol>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.85rem', flexWrap: 'wrap' }}>
            {g.ulangi && onUlangi && (
              <button className="btn btn-primary" style={{ padding: '0.4rem 0.9rem', fontSize: '0.82rem' }} onClick={onUlangi}>
                <RefreshCw size={14} /> Coba Lagi
              </button>
            )}
            {g.boleh_ajukan && onAjukan && (
              <button className="btn" style={{ padding: '0.4rem 0.9rem', fontSize: '0.82rem', background: '#fff', border: '1px solid #fecaca' }} onClick={onAjukan}>
                Ajukan Absen Luar Area
              </button>
            )}
            {g.kode === 'APP_OUTDATED' && (
              <button className="btn btn-primary" style={{ padding: '0.4rem 0.9rem', fontSize: '0.82rem' }}
                onClick={async () => {
                  // Bundel lama tersangkut di service worker — bersihkan
                  // dulu, kalau tidak muat ulang biasa akan memuat versi
                  // lama yang sama lagi.
                  try {
                    const regs = await navigator.serviceWorker?.getRegistrations?.() || [];
                    await Promise.all(regs.map(r => r.unregister()));
                    const keys = await caches?.keys?.() || [];
                    await Promise.all(keys.map(k => caches.delete(k)));
                  } catch { /* abaikan, muat ulang tetap dicoba */ }
                  window.location.reload(true);
                }}>
                <RefreshCw size={14} /> Muat Ulang Aplikasi
              </button>
            )}
            <button className="btn" style={{ padding: '0.4rem 0.9rem', fontSize: '0.82rem', background: '#fff', border: '1px solid #fecaca' }} onClick={onTutup}>
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Modal Alasan Absen di Luar Area ───────────────────────────
function AlasanModal({ jarak, unitNama, onKirim, onClose, busy }) {
  const [alasan, setAlasan] = useState('');
  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: '0.5rem' }}>Absen dari Luar Area</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: '1rem' }}>
          Posisi Anda {jarak != null ? `${jarak} m` : 'jauh'} dari {unitNama || 'cabang'}.
          Absen tetap akan dicatat, tapi ditandai untuk diperiksa atasan. Tuliskan alasannya.
        </p>
        <textarea
          value={alasan} onChange={e => setAlasan(e.target.value)} rows={3}
          placeholder="Mis: mengantar siswa lomba di SMPN 5"
          style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontSize: '0.875rem', fontFamily: 'inherit', color: 'var(--text-primary)', resize: 'vertical' }}
        />
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
          <button className="btn" style={{ flex: 1 }} onClick={onClose} disabled={busy}>Batal</button>
          <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy || alasan.trim().length < 5}
            onClick={() => onKirim(alasan.trim())}>
            {busy ? 'Mengirim...' : 'Kirim Pengajuan'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Status lokasi di kartu shift ──────────────────────────────
function StripLokasi({ state }) {
  if (!state) return null;
  const { fase, jarak, unitNama, akurasi, radius } = state;
  const gaya = { mencari: ['#f1f5f9', '#475569'], ok: ['#d1fae5', '#047857'], jauh: ['#fef3c7', '#92400e'], gagal: ['#fee2e2', '#b91c1c'] }[fase] || ['#f1f5f9', '#475569'];
  const teks = {
    mencari: akurasi ? `Mencari lokasi... (±${akurasi} m)` : 'Mencari lokasi...',
    ok: `${jarak} m dari ${unitNama} · dalam area`,
    jauh: `${jarak} m dari ${unitNama} · di luar area (batas ${radius} m)`,
    gagal: 'Lokasi belum terbaca',
  }[fase];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: gaya[0], color: gaya[1], padding: '0.5rem 0.75rem', borderRadius: '0.5rem', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.85rem' }}>
      {fase === 'mencari' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <MapPin size={14} />}
      {teks}
    </div>
  );
}

// ── Komponen Badge Status ─────────────────────────────────────
const STATUS_LABEL = { Alpha: 'Mangkir' };
const StatusBadge = ({ s }) => {
  const map = { Hadir: ['#d1fae5','#047857'], Telat: ['#fef3c7','#92400e'], Izin: ['#dbeafe','#1e40af'], Alpha: ['#fee2e2','#b91c1c'] };
  const [bg, color] = map[s] || ['#f3f4f6','#374151'];
  return <span style={{ background: bg, color, padding: '0.2rem 0.65rem', borderRadius: 999, fontSize: '0.78rem', fontWeight: 700 }}>{STATUS_LABEL[s]||s}</span>;
};

// ─────────────────────────────────────────────────────────────
export default function AbsensiCheckPage() {
  const { user } = useAuth();
  const [clock, setClock]           = useState(nowWIBDisplay());
  const [myShifts, setMyShifts]     = useState([]); // shift_schedules hari ini
  const [attendances, setAttendances] = useState([]); // absen hari ini
  const [hariLibur, setHariLibur]   = useState(null);
  const [loading, setLoading]       = useState(true);
  const [camera, setCamera]         = useState(null); // { type:'checkin'|'checkout', scheduleId, unitId, shift }
  const [busy, setBusy]             = useState(false);
  const [msg, setMsg]               = useState(null); // { ok, text }
  const [pengaturan, setPengaturan] = useState(null); // setelan kunci lokasi
  const [gagal, setGagal]           = useState(null); // kartu kegagalan
  const [lokasiState, setLokasiState] = useState({}); // { [scheduleId]: {fase,jarak,...} }
  const [alasanFor, setAlasanFor]   = useState(null); // konteks modal luar area

  // Pencarian lokasi dijalankan berbarengan dengan kamera dibuka, lalu
  // hasilnya ditunggu saat foto dikirim. GPS butuh 10–60 detik untuk
  // "cold start"; kalau dikerjakan berurutan, guru menunggu dua kali.
  const lokasiPromise = useRef(null);
  // Waktu tombol absen PERTAMA kali ditekan untuk tiap shift, walau
  // percobaan itu gagal. Tanpa ini, guru yang sudah sampai pukul 07:02
  // tapi baru berhasil absen 07:20 akan tercatat Telat.
  const percobaan1 = useRef({});
  // Foto & konteks absen terakhir, supaya pengajuan "luar area" bisa
  // dikirim ulang tanpa memaksa guru berfoto dari awal.
  const fotoTerakhir = useRef(null);
  const konteksTerakhir = useRef(null);

  useEffect(() => {
    const t = setInterval(() => setClock(nowWIBDisplay()), 1000);
    return () => clearInterval(t);
  }, []);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    const today = todayWIB();

    const [ssRes, attRes, hlRes, setRes] = await Promise.all([
      supabase.from('shift_schedules')
        .select('*, shifts(*, units(nama, latitude, longitude, radius_meter, mode_lokasi)), penitip:titipan_dari(nama)')
        .eq('guru_id', user.id)
        .eq('tanggal', today),
      supabase.from('attendances')
        .select('*')
        .eq('guru_id', user.id)
        .eq('tanggal', today),
      supabase.from('hari_libur')
        .select('*')
        .eq('tanggal', today),
      supabase.from('absensi_pengaturan')
        .select('mode, darurat, akurasi_maks')
        .maybeSingle(),
    ]);

    // Urutkan shift berdasarkan jam mulai (pagi di atas, malam di bawah)
    const sortedShifts = (ssRes.data || []).slice().sort((a, b) =>
      (a.shifts?.jam_mulai || '').localeCompare(b.shifts?.jam_mulai || '')
    );
    setMyShifts(sortedShifts);
    setAttendances(attRes.data || []);
    setHariLibur((hlRes.data || []).length > 0 ? hlRes.data[0] : null);
    // Kalau tabel setelan belum ada (migrasi 0017 belum dijalankan),
    // fitur ini diam total dan absensi berjalan seperti biasa.
    setPengaturan(setRes.data || null);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [user]);

  const uploadFoto = async (blob, type) => {
    const today = todayWIB();
    const path = `${user.id}/${today}_${type}_${Date.now()}.jpg`;
    const { error } = await supabase.storage.from('absensi-foto').upload(path, blob, { contentType: 'image/jpeg', upsert: true });
    if (error) throw new Error('Upload foto gagal: ' + error.message);
    const { data: { publicUrl } } = supabase.storage.from('absensi-foto').getPublicUrl(path);
    return publicUrl;
  };

  // Setiap kegagalan dicatat, bukan sekadar ditampilkan lalu hilang —
  // tanpa ini tidak akan ketahuan berapa banyak guru yang diam-diam
  // kesulitan, karena mereka tidak akan lapor.
  const catatGagal = async (kode, pesan, extra = {}) => {
    try {
      await supabase.rpc('absen_catat_gagal', {
        p_kode: kode,
        p_pesan: pesan || null,
        p_schedule_id: extra.scheduleId || null,
        p_jenis: extra.jenis || null,
        p_lat: extra.lat ?? null,
        p_lng: extra.lng ?? null,
        p_akurasi: extra.akurasi ?? null,
        p_perangkat: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      });
    } catch { /* log tidak boleh ikut menggagalkan absen */ }
  };

  const tampilkanGagal = (kode, extra = {}) => {
    const g = pesanGagal(kode, extra);
    setGagal(g);
    return g;
  };

  // Mulai mencari lokasi. Di mode 'senyap' hasilnya cuma direkam; di mode
  // lain fase-nya ikut ditampilkan di kartu shift.
  const mulaiCariLokasi = (ss, mode) => {
    if (mode === 'nonaktif') { lokasiPromise.current = Promise.resolve(null); return; }

    const unit = ss.shifts?.units;
    if (tampilkanLokasi(mode)) {
      setLokasiState(s => ({ ...s, [ss.id]: { fase: 'mencari' } }));
    }

    lokasiPromise.current = ambilLokasi({
      akurasiMaks: pengaturan?.akurasi_maks || 150,
      onProgress: (akurasi) => {
        if (!tampilkanLokasi(mode)) return;
        setLokasiState(s => ({ ...s, [ss.id]: { ...s[ss.id], fase: 'mencari', akurasi } }));
      },
    }).then(r => {
      if (tampilkanLokasi(mode)) {
        const jarak = r.lat != null && unit?.latitude != null
          ? jarakMeter(r.lat, r.lng, Number(unit.latitude), Number(unit.longitude)) : null;
        const radius = unit?.radius_meter || 150;
        setLokasiState(s => ({
          ...s,
          [ss.id]: {
            fase: !r.ok ? 'gagal' : (jarak != null && jarak > radius ? 'jauh' : 'ok'),
            jarak, radius, akurasi: r.akurasi, unitNama: unit?.nama || 'cabang',
          },
        }));
      }
      return r;
    });
  };

  const mulaiCheckIn = (ss) => {
    const shift = ss.shifts;
    const mode = modeEfektif(shift, pengaturan);
    setGagal(null);
    if (!percobaan1.current[ss.id]) percobaan1.current[ss.id] = new Date().toISOString();
    mulaiCariLokasi(ss, mode);
    setCamera({ type: 'checkin', scheduleId: ss.id, unitId: shift.unit_id, shift, mode, ss });
  };

  const mulaiCheckOut = (ss, att) => {
    const shift = ss.shifts;
    const mode = modeEfektif(shift, pengaturan);
    setGagal(null);
    mulaiCariLokasi(ss, mode);
    setCamera({ type: 'checkout', attendanceId: att.id, scheduleId: ss.id, shift, mode, ss });
  };

  // Tunggu hasil pencarian lokasi yang sudah berjalan sejak kamera dibuka.
  const ambilHasilLokasi = async (mode, jenis, scheduleId, alasan) => {
    if (mode === 'nonaktif') return { kirim: {}, lanjut: true };

    const r = (await lokasiPromise.current) || { ok: false, kode: 'LOC_TIMEOUT' };
    const kirim = { p_lat: r.lat ?? null, p_lng: r.lng ?? null, p_akurasi: r.akurasi ?? null };

    if (!r.ok) {
      await catatGagal(r.kode || 'LOC_TIMEOUT', r.pesan, { scheduleId, jenis, lat: r.lat, lng: r.lng, akurasi: r.akurasi });

      // Di 'senyap' dan 'catat', lokasi yang gagal terbaca tidak boleh
      // menghalangi absen — guru tetap masuk kerja, hanya datanya kosong.
      // Di 'blokir', pengajuan beralasan tetap diteruskan supaya server
      // yang memutuskan; kalau tidak, guru yang HP-nya memang selalu
      // buruk sinyalnya tidak akan pernah bisa absen sama sekali.
      if (mode !== 'blokir' || alasan) return { kirim, lanjut: true };

      tampilkanGagal(r.kode || 'LOC_TIMEOUT', { akurasi: r.akurasi, boleh_ajukan: r.lemah === true });
      return { lanjut: false };
    }

    return { kirim, lanjut: true };
  };

  // Jalur absensi sebelum migrasi 0017 — INSERT/UPDATE langsung ke tabel.
  // Hanya dipakai sebagai jaring pengaman kalau RPC belum ada di database,
  // supaya rilis frontend yang mendahului migrasi tidak mematikan absensi
  // sepagi hari. Hapus bersamaan dengan pencabutan policy "att_insert_self".
  const kirimAbsenCaraLama = async (konteks, fotoUrl) => {
    const { type, shift, scheduleId, attendanceId } = konteks;
    const now = new Date().toISOString();

    if (type === 'checkin') {
      const wib = new Date(new Date(now).toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
      const [h, m] = shift.jam_mulai.split(':').map(Number);
      const batas = h * 60 + m + (shift.toleransi_menit || 15);
      const status = (wib.getHours() * 60 + wib.getMinutes()) <= batas ? 'Hadir' : 'Telat';

      const { error } = await supabase.from('attendances').insert({
        guru_id: user.id, shift_schedule_id: scheduleId, unit_id: shift.unit_id,
        tanggal: todayWIB(), check_in: now, foto_checkin: fotoUrl, status,
      });
      if (error) { tampilkanGagal('RPC_ERROR', { pesan: error.message }); return; }
      setMsg({ ok: true, text: `Check-in berhasil! Status: ${status}` });
    } else {
      const { error } = await supabase.from('attendances')
        .update({ check_out: now, foto_checkout: fotoUrl }).eq('id', attendanceId);
      if (error) { tampilkanGagal('RPC_ERROR', { pesan: error.message }); return; }
      setMsg({ ok: true, text: 'Check-out berhasil!' });
    }
    fetchData();
  };

  const kirimAbsen = async (blob, alasan = null) => {
    const konteks = camera || alasanFor || konteksTerakhir.current;
    if (!konteks) return;
    konteksTerakhir.current = konteks;
    const { type, shift, scheduleId, attendanceId, mode } = konteks;
    const jenis = type === 'checkin' ? 'checkin' : 'checkout';

    setBusy(true); setCamera(null);
    try {
      const lok = await ambilHasilLokasi(mode, jenis, scheduleId, alasan);
      if (!lok.lanjut) return;

      let fotoUrl = null;
      if (shift.wajib_foto && blob) {
        try {
          fotoUrl = await uploadFoto(blob, jenis);
        } catch (e) {
          await catatGagal('UPLOAD_FAILED', e.message, { scheduleId, jenis });
          tampilkanGagal('UPLOAD_FAILED');
          return;
        }
      }

      const { data, error } = type === 'checkin'
        ? await supabase.rpc('absen_check_in', {
            p_schedule_id: scheduleId, p_foto: fotoUrl, p_alasan: alasan,
            p_percobaan_1: percobaan1.current[scheduleId] || null, ...lok.kirim,
          })
        : await supabase.rpc('absen_check_out', {
            p_attendance_id: attendanceId, p_foto: fotoUrl, p_alasan: alasan, ...lok.kirim,
          });

      if (error) {
        // RPC belum ada → migrasi 0017 belum dijalankan di database ini.
        // Jangan matikan absensi hanya karena urutan rilis: pakai jalur
        // lama yang policy-nya memang sengaja masih hidup. Absen tetap
        // tercatat, hanya tanpa data lokasi.
        if (/PGRST202|function .* does not exist|schema cache/i.test(error.message)) {
          await kirimAbsenCaraLama(konteks, fotoUrl);
          return;
        }
        const kode = /JWT|token/i.test(error.message) ? 'SESSION_EXPIRED'
                   : /fetch|network/i.test(error.message) ? 'NET_OFFLINE' : null;
        await catatGagal(kode || 'RPC_ERROR', error.message, { scheduleId, jenis });
        tampilkanGagal(kode || 'RPC_ERROR', kode ? {} : { pesan: error.message });
        return;
      }

      if (!data?.ok) {
        await catatGagal(data?.kode || 'UNKNOWN', data?.pesan, { scheduleId, jenis });
        tampilkanGagal(data?.kode || 'UNKNOWN', {
          pesan: data?.pesan,
          boleh_ajukan: data?.boleh_ajukan,
          jarak: data?.jarak_m, unitNama: data?.unit_nama,
        });
        return;
      }

      delete percobaan1.current[scheduleId];
      setAlasanFor(null);
      setMsg({
        ok: true,
        text: type === 'checkin'
          ? `Check-in berhasil! Status: ${data.status}` +
            (tampilkanLokasi(mode) && data.status_lokasi === 'Luar Area'
              ? ` — tercatat ${data.jarak_m} m dari ${data.unit_nama}, akan diperiksa atasan.` : '')
          : 'Check-out berhasil!',
      });
      fetchData();
    } catch (e) {
      const kode = !navigator.onLine ? 'NET_OFFLINE' : null;
      await catatGagal(kode || 'EXCEPTION', e.message, { scheduleId, jenis });
      tampilkanGagal(kode || 'EXCEPTION', kode ? {} : { pesan: e.message });
    } finally { setBusy(false); }
  };

  const onCapture = (blob) => {
    // Foto disimpan supaya pengajuan luar area tidak perlu berfoto ulang.
    fotoTerakhir.current = blob;
    kirimAbsen(blob);
  };

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-secondary)' }}>Memuat data shift...</div>;

  const today = todayWIB();
  const tglDisplay = fmtWIBDate(new Date(today + 'T12:00:00'));

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Absensi</p>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>Check-in / Check-out</h1>
      </div>

      {/* Jam & Tanggal */}
      <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1.25rem', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', fontWeight: 800, color: 'var(--primary)', letterSpacing: '0.04em', lineHeight: 1 }}>{clock}</div>
        <div style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>{tglDisplay} · WIB</div>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, marginTop: '0.5rem' }}>
          Halo, <span style={{ color: 'var(--primary)' }}>{user?.nama}</span>
        </div>
      </div>

      {/* Notif pesan */}
      {msg && (
        <div style={{ background: msg.ok ? '#d1fae5' : '#fee2e2', color: msg.ok ? '#047857' : '#b91c1c', padding: '0.85rem 1.25rem', borderRadius: '0.65rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
          {msg.ok ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />} {msg.text}
          <button onClick={() => setMsg(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: 'inherit' }}>×</button>
        </div>
      )}

      {/* Kegagalan absen — sebab + langkah perbaikan */}
      {gagal && (
        <KartuGagal
          g={gagal}
          onTutup={() => setGagal(null)}
          onUlangi={() => {
            setGagal(null);
            const k = konteksTerakhir.current;
            if (!k) return;
            if (k.type === 'checkin') mulaiCheckIn(k.ss);
            else mulaiCheckOut(k.ss, { id: k.attendanceId });
          }}
          onAjukan={() => {
            setAlasanFor({ ...konteksTerakhir.current, jarak: gagal.jarak, unitNama: gagal.unitNama });
            setGagal(null);
          }}
        />
      )}

      {/* Hari Libur */}
      {hariLibur && (
        <div style={{ background: '#fef3c7', color: '#92400e', padding: '0.85rem 1.25rem', borderRadius: '0.65rem', marginBottom: '1rem', fontWeight: 600 }}>
          🏖️ Hari ini libur: {hariLibur.keterangan || 'Hari Libur'}
        </div>
      )}

      {/* Tidak ada jadwal shift */}
      {myShifts.length === 0 && !hariLibur && (
        <div className="glass-card" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <Clock size={40} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
          <p style={{ fontWeight: 600 }}>Tidak ada jadwal shift hari ini</p>
          <p style={{ fontSize: '0.85rem' }}>Hubungi admin jika kamu seharusnya ada jadwal.</p>
        </div>
      )}

      {/* Kartu per shift */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {myShifts.map(ss => {
          const shift = ss.shifts;
          const att = attendances.find(a => a.shift_schedule_id === ss.id);
          const sudahCheckIn  = !!att?.check_in;
          const sudahCheckOut = !!att?.check_out;

          return (
            <div key={ss.id} className="glass-card" style={{ padding: '1.5rem' }}>
              {/* Info shift */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{shift.nama}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    <Clock size={13} style={{ verticalAlign: 'middle', marginRight: 3 }} />
                    {shift.jam_mulai} – {shift.jam_selesai}
                    {shift.lintas_hari && <span style={{ marginLeft: 6, fontSize: '0.75rem', color: '#8b5cf6' }}>lintas hari</span>}
                    <span style={{ marginLeft: 8, color: '#b45309' }}>toleransi {shift.toleransi_menit} mnt</span>
                  </div>
                </div>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:'0.3rem' }}>
                  {att && <StatusBadge s={att.status} />}
                  {ss.dialihkan && (
                    <span style={{ background:'#f3f4f6', color:'#6b7280', padding:'0.2rem 0.6rem', borderRadius:999, fontSize:'0.75rem', fontWeight:700, whiteSpace:'nowrap' }}>
                      🔒 Ditukar — tidak bisa check-in
                    </span>
                  )}
                  {ss.titipan_dari && (
                    <span style={{ background:'#ede9fe', color:'#7c3aed', padding:'0.2rem 0.6rem', borderRadius:999, fontSize:'0.75rem', fontWeight:700, whiteSpace:'nowrap' }}>
                      📥 Titipan dari {ss.penitip?.nama || 'guru lain'}
                    </span>
                  )}
                </div>
              </div>

              {/* Timeline check-in / check-out */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                {[
                  { label: 'Check-in', time: att?.check_in, foto: att?.foto_checkin },
                  { label: 'Check-out', time: att?.check_out, foto: att?.foto_checkout },
                ].map(({ label, time, foto }) => (
                  <div key={label} style={{ background: 'rgba(79,70,229,0.04)', borderRadius: '0.5rem', padding: '0.75rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 700, color: time ? 'var(--primary)' : 'var(--text-secondary)', marginTop: '0.25rem' }}>
                      {time ? fmtTime(time) : '--:--'}
                    </div>
                    {foto && (
                      <img src={foto} alt={label} style={{ width: 48, height: 48, borderRadius: '0.35rem', objectFit: 'cover', marginTop: '0.4rem' }}
                        onClick={() => window.open(foto, '_blank')} className="cursor-pointer" />
                    )}
                  </div>
                ))}
              </div>

              {/* Status lokasi — hanya muncul di mode 'catat'/'blokir' */}
              {tampilkanLokasi(modeEfektif(shift, pengaturan)) && !sudahCheckOut && (
                <StripLokasi state={lokasiState[ss.id]} />
              )}

              {/* Tombol aksi — shift yang ditukar digembok */}
              {ss.dialihkan ? (
                <div style={{ textAlign:'center', background:'#f3f4f6', color:'#6b7280', borderRadius:'0.5rem', padding:'0.75rem', fontSize:'0.85rem', lineHeight:1.5 }}>
                  Shift ini sudah ditukar dengan guru lain, jadi tidak perlu di-check-in.<br/>
                  <span style={{ fontSize:'0.78rem' }}>Kalau ternyata Anda tetap masuk, minta admin mencabut izinnya dulu.</span>
                </div>
              ) : !sudahCheckIn && (
                <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}
                  onClick={() => mulaiCheckIn(ss)}>
                  <LogIn size={18} /> Check In Sekarang
                </button>
              )}
              {!ss.dialihkan && sudahCheckIn && !sudahCheckOut && (
                <button className="btn" style={{ width: '100%', background: '#10b981', color: '#fff' }} disabled={busy}
                  onClick={() => mulaiCheckOut(ss, att)}>
                  <LogOut size={18} /> Check Out Sekarang
                </button>
              )}
              {sudahCheckIn && sudahCheckOut && (
                <div style={{ textAlign: 'center', color: '#047857', fontWeight: 600, padding: '0.5rem' }}>
                  <CheckCircle2 size={18} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                  Absensi hari ini selesai
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal kamera */}
      {camera && (
        <CameraModal
          label={camera.type === 'checkin' ? 'Foto Check-in' : 'Foto Check-out'}
          onCapture={onCapture}
          onClose={() => setCamera(null)}
        />
      )}

      {/* Modal alasan absen di luar area */}
      {alasanFor && (
        <AlasanModal
          jarak={alasanFor.jarak} unitNama={alasanFor.unitNama} busy={busy}
          onClose={() => setAlasanFor(null)}
          onKirim={(alasan) => kirimAbsen(fotoTerakhir.current, alasan)}
        />
      )}
    </div>
  );
}
