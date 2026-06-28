import { useState, useEffect, useRef } from 'react';
import { Camera, CheckCircle2, LogIn, LogOut, Clock, AlertCircle, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/authStore';

// ── WIB helpers ──────────────────────────────────────────────
const todayWIB = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }); // YYYY-MM-DD

const nowWIBDisplay = () =>
  new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit' });

const fmtTime = (ts) =>
  ts ? new Date(ts).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }) : '-';

const fmtWIBDate = (ts) =>
  ts ? new Date(ts).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '-';

const calcStatus = (checkInISO, shift) => {
  const wib = new Date(new Date(checkInISO).toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  const [h, m] = shift.jam_mulai.split(':').map(Number);
  const limitMin = h * 60 + m + (shift.toleransi_menit || 15);
  const ciMin = wib.getHours() * 60 + wib.getMinutes();
  return ciMin <= limitMin ? 'Hadir' : 'Telat';
};

// ── Komponen Kamera ───────────────────────────────────────────
function CameraModal({ onCapture, onClose, label }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [preview, setPreview] = useState(null); // blob URL setelah ambil foto
  const [capturedBlob, setCapturedBlob] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 } });
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; setReady(true); }
      } catch {
        alert('Tidak bisa akses kamera. Pastikan izin kamera sudah diberikan.');
        onClose();
      }
    })();
    return () => streamRef.current?.getTracks().forEach(t => t.stop());
  }, []);

  const ambilFoto = () => {
    const canvas = document.createElement('canvas');
    canvas.width  = videoRef.current.videoWidth  || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    canvas.getContext('2d').drawImage(videoRef.current, 0, 0);
    canvas.toBlob(blob => {
      setCapturedBlob(blob);
      setPreview(URL.createObjectURL(blob));
      streamRef.current?.getTracks().forEach(t => t.stop());
    }, 'image/jpeg', 0.85);
  };

  const ulangi = async () => {
    setPreview(null); setCapturedBlob(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
    } catch { onClose(); }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '1rem' }}>{label}</h2>

        {!preview ? (
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

// ── Komponen Badge Status ─────────────────────────────────────
const StatusBadge = ({ s }) => {
  const map = { Hadir: ['#d1fae5','#047857'], Telat: ['#fef3c7','#92400e'], Izin: ['#dbeafe','#1e40af'], Alpha: ['#fee2e2','#b91c1c'] };
  const [bg, color] = map[s] || ['#f3f4f6','#374151'];
  return <span style={{ background: bg, color, padding: '0.2rem 0.65rem', borderRadius: 999, fontSize: '0.78rem', fontWeight: 700 }}>{s}</span>;
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

  useEffect(() => {
    const t = setInterval(() => setClock(nowWIBDisplay()), 1000);
    return () => clearInterval(t);
  }, []);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    const today = todayWIB();

    const [ssRes, attRes, hlRes] = await Promise.all([
      supabase.from('shift_schedules')
        .select('*, shifts(*)')
        .eq('guru_id', user.id)
        .eq('tanggal', today),
      supabase.from('attendances')
        .select('*')
        .eq('guru_id', user.id)
        .eq('tanggal', today),
      supabase.from('hari_libur')
        .select('*')
        .eq('tanggal', today),
    ]);

    setMyShifts(ssRes.data || []);
    setAttendances(attRes.data || []);
    setHariLibur((hlRes.data || []).length > 0 ? hlRes.data[0] : null);
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

  const handleCheckIn = async (blob) => {
    setBusy(true); setCamera(null);
    try {
      const { shift, scheduleId, unitId } = camera;
      const now = new Date().toISOString();
      const status = calcStatus(now, shift);
      const fotoUrl = shift.wajib_foto ? await uploadFoto(blob, 'checkin') : null;

      const { error } = await supabase.from('attendances').insert({
        guru_id: user.id,
        shift_schedule_id: scheduleId,
        unit_id: unitId,
        tanggal: todayWIB(),
        check_in: now,
        foto_checkin: fotoUrl,
        status,
      });
      if (error) throw error;
      setMsg({ ok: true, text: `Check-in berhasil! Status: ${status}` });
      fetchData();
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally { setBusy(false); }
  };

  const handleCheckOut = async (blob) => {
    setBusy(true); setCamera(null);
    try {
      const { shift, attendanceId } = camera;
      const now = new Date().toISOString();
      const fotoUrl = shift.wajib_foto ? await uploadFoto(blob, 'checkout') : null;

      const { error } = await supabase.from('attendances').update({
        check_out: now,
        foto_checkout: fotoUrl,
      }).eq('id', attendanceId);
      if (error) throw error;
      setMsg({ ok: true, text: 'Check-out berhasil!' });
      fetchData();
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally { setBusy(false); }
  };

  const onCapture = (blob) => {
    if (camera?.type === 'checkin') handleCheckIn(blob);
    else handleCheckOut(blob);
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
                {att && <StatusBadge s={att.status} />}
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

              {/* Tombol aksi */}
              {!sudahCheckIn && (
                <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}
                  onClick={() => setCamera({ type: 'checkin', scheduleId: ss.id, unitId: shift.unit_id, shift })}>
                  <LogIn size={18} /> Check In Sekarang
                </button>
              )}
              {sudahCheckIn && !sudahCheckOut && (
                <button className="btn" style={{ width: '100%', background: '#10b981', color: '#fff' }} disabled={busy}
                  onClick={() => setCamera({ type: 'checkout', attendanceId: att.id, shift })}>
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
    </div>
  );
}
