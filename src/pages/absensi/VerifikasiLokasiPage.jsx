import { useState, useEffect, useMemo } from 'react';
import { MapPin, Check, X, AlertTriangle, ExternalLink, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/authStore';

const todayWIB = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
const awalBulan = () => todayWIB().slice(0, 8) + '01';
const fmtTgl  = (d)  => d ? new Date(d + 'T12:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const fmtJam  = (ts) => ts ? new Date(ts).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }) : '-';

const inp = { padding: '0.55rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontFamily: 'inherit', fontSize: '0.88rem', boxSizing: 'border-box' };

const LokasiBadge = ({ v }) => {
  const map = {
    'Luar Area':  ['#fef3c7', '#92400e'],
    'GPS Lemah':  ['#e0e7ff', '#3730a3'],
    'Tanpa Data': ['#f3f4f6', '#4b5563'],
    'Dalam Area': ['#d1fae5', '#047857'],
  };
  const [bg, color] = map[v] || ['#f3f4f6', '#4b5563'];
  return <span style={{ background: bg, color, padding: '0.15rem 0.55rem', borderRadius: 999, fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{v || '—'}</span>;
};

export default function VerifikasiLokasiPage() {
  const { user } = useAuth();
  const bolehVerifikasi = ['Owner', 'Administrator', 'Supervisor'].includes(user?.role);

  const [tab, setTab]           = useState('verifikasi'); // 'verifikasi' | 'gagal'
  const [rows, setRows]         = useState([]);
  const [logGagal, setLogGagal] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [dariTgl, setDariTgl]   = useState(awalBulan());
  const [sampaiTgl, setSampaiTgl] = useState(todayWIB());
  const [hanyaPending, setHanyaPending] = useState(true);
  const [proses, setProses]     = useState(null); // id yang sedang diproses

  const fetchData = async () => {
    setLoading(true);

    let q = supabase.from('attendances')
      .select('id, tanggal, check_in, check_out, status, status_lokasi, jarak_checkin_m, akurasi_checkin, lat_checkin, lng_checkin, alasan_luar_area, lokasi_disetujui, waktu_percobaan_1, gurus!guru_id(nama), units!unit_id(nama, radius_meter)')
      .gte('tanggal', dariTgl).lte('tanggal', sampaiTgl)
      .in('status_lokasi', ['Luar Area', 'GPS Lemah'])
      .order('tanggal', { ascending: false });
    if (hanyaPending) q = q.is('lokasi_disetujui', null);

    const [attRes, logRes] = await Promise.all([
      q,
      supabase.from('absensi_gagal_log')
        .select('kode, tanggal, perangkat, akurasi, jarak_m, gurus!guru_id(nama), units!unit_id(nama)')
        .gte('tanggal', dariTgl).lte('tanggal', sampaiTgl)
        .order('created_at', { ascending: false })
        .limit(300),
    ]);

    setRows(attRes.data || []);
    setLogGagal(logRes.data || []);
    setLoading(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, [dariTgl, sampaiTgl, hanyaPending]);

  const putuskan = async (id, setuju) => {
    setProses(id);
    const { error } = await supabase.from('attendances')
      .update({ lokasi_disetujui: setuju }).eq('id', id);
    setProses(null);
    if (error) return alert('Gagal menyimpan keputusan: ' + error.message);
    fetchData();
  };

  // Kode kegagalan diringkas supaya kelihatan polanya: kalau LOC_DENIED
  // menumpuk, masalahnya izin browser (perlu sosialisasi); kalau LOC_WEAK
  // menumpuk di satu cabang, kemungkinan radiusnya yang terlalu sempit.
  const ringkasanGagal = useMemo(() => {
    const m = {};
    logGagal.forEach(l => { m[l.kode] = (m[l.kode] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [logGagal]);

  const pendingCount = rows.filter(r => r.lokasi_disetujui == null).length;

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Absensi</p>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>Verifikasi Lokasi</h1>
      </div>

      {/* Filter */}
      <div className="glass-card" style={{ padding: '1.1rem 1.25rem', marginBottom: '1.25rem', display: 'flex', gap: '0.85rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Dari</label>
          <input type="date" value={dariTgl} onChange={e => setDariTgl(e.target.value)} style={inp} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sampai</label>
          <input type="date" value={sampaiTgl} onChange={e => setSampaiTgl(e.target.value)} style={inp} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, paddingBottom: '0.55rem' }}>
          <input type="checkbox" checked={hanyaPending} onChange={e => setHanyaPending(e.target.checked)}
            style={{ width: '1rem', height: '1rem', accentColor: 'var(--primary)' }} />
          Hanya yang belum diputuskan
        </label>
      </div>

      {/* Tab */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {[['verifikasi', `Perlu Diperiksa${pendingCount ? ` (${pendingCount})` : ''}`], ['gagal', `Kegagalan Absen (${logGagal.length})`]].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className="btn"
            style={{ background: tab === k ? 'var(--primary)' : 'var(--surface-color)', color: tab === k ? '#fff' : 'var(--text-primary)', border: tab === k ? 'none' : '1px solid var(--glass-border)', fontSize: '0.85rem' }}>
            {label}
          </button>
        ))}
      </div>

      {loading && <div style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Memuat...</div>}

      {/* ── Daftar absen yang perlu diperiksa ── */}
      {!loading && tab === 'verifikasi' && (
        rows.length === 0 ? (
          <div className="glass-card" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <MapPin size={38} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
            <p style={{ fontWeight: 600 }}>Tidak ada absen yang perlu diperiksa</p>
            <p style={{ fontSize: '0.85rem' }}>Semua absen pada rentang ini berada di dalam area cabang.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {rows.map(r => {
              // Percobaan pertama yang jauh lebih awal dari check-in berarti
              // guru sudah di tempat tapi tertahan kendala teknis. Ini yang
              // mencegah fitur ini menciptakan "telat" palsu.
              const jedaMenit = r.waktu_percobaan_1 && r.check_in
                ? Math.round((new Date(r.check_in) - new Date(r.waktu_percobaan_1)) / 60000) : 0;

              return (
                <div key={r.id} className="glass-card" style={{ padding: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '1rem' }}>{r.gurus?.nama || '—'}</div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                        {fmtTgl(r.tanggal)} · {r.units?.nama || '—'} · masuk {fmtJam(r.check_in)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.3rem' }}>
                      <LokasiBadge v={r.status_lokasi} />
                      {r.lokasi_disetujui === true && <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#047857' }}>Disetujui</span>}
                      {r.lokasi_disetujui === false && <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#b91c1c' }}>Ditolak</span>}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.84rem', marginBottom: '0.85rem' }}>
                    <div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Jarak</div>
                      <div style={{ fontWeight: 700, color: '#92400e' }}>
                        {r.jarak_checkin_m != null ? `${Math.round(r.jarak_checkin_m)} m` : '—'}
                        <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}> / batas {r.units?.radius_meter ?? 150} m</span>
                      </div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Akurasi GPS</div>
                      <div style={{ fontWeight: 600 }}>{r.akurasi_checkin != null ? `±${Math.round(r.akurasi_checkin)} m` : '—'}</div>
                    </div>
                    {r.lat_checkin != null && (
                      <div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Titik</div>
                        <a href={`https://www.google.com/maps?q=${r.lat_checkin},${r.lng_checkin}`} target="_blank" rel="noreferrer"
                          style={{ color: 'var(--primary)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}>
                          Lihat di peta <ExternalLink size={13} />
                        </a>
                      </div>
                    )}
                  </div>

                  {jedaMenit >= 3 && (
                    <div style={{ background: '#eff6ff', color: '#1e40af', padding: '0.6rem 0.85rem', borderRadius: '0.5rem', fontSize: '0.82rem', marginBottom: '0.85rem', lineHeight: 1.55 }}>
                      <Clock size={14} style={{ verticalAlign: 'middle', marginRight: 5 }} />
                      Sudah mencoba absen pukul <strong>{fmtJam(r.waktu_percobaan_1)}</strong>, {jedaMenit} menit sebelum berhasil.
                      Kalau statusnya <em>Telat</em>, pertimbangkan koreksi — kendalanya teknis, bukan keterlambatan.
                    </div>
                  )}

                  <div style={{ background: 'rgba(79,70,229,0.04)', padding: '0.7rem 0.9rem', borderRadius: '0.5rem', fontSize: '0.85rem', lineHeight: 1.55, marginBottom: bolehVerifikasi ? '0.85rem' : 0 }}>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Alasan: </span>
                    {r.alasan_luar_area || <em style={{ color: 'var(--text-secondary)' }}>tidak diisi</em>}
                  </div>

                  {bolehVerifikasi && r.lokasi_disetujui == null && (
                    <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                      <button className="btn" disabled={proses === r.id}
                        style={{ background: '#10b981', color: '#fff', fontSize: '0.85rem' }}
                        onClick={() => putuskan(r.id, true)}>
                        <Check size={15} /> Setujui
                      </button>
                      <button className="btn" disabled={proses === r.id}
                        style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca', fontSize: '0.85rem' }}
                        onClick={() => putuskan(r.id, false)}>
                        <X size={15} /> Tolak
                      </button>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', alignSelf: 'center', lineHeight: 1.5 }}>
                        Menolak tidak mengubah status kehadiran — koreksinya lewat menu Koreksi Absen.
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ── Log kegagalan absen ── */}
      {!loading && tab === 'gagal' && (
        <>
          <div className="glass-card" style={{ padding: '1.25rem', marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0 0 0.3rem' }}>Sebab Kegagalan</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 1rem', lineHeight: 1.55 }}>
              Kalau <code>LOC_DENIED</code> menumpuk, masalahnya izin lokasi di browser guru — perlu sosialisasi, bukan perubahan setelan.
              Kalau <code>LOC_WEAK</code> atau <code>OUT_OF_AREA</code> menumpuk di satu cabang, kemungkinan besar radiusnya yang terlalu sempit.
            </p>
            {ringkasanGagal.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>Tidak ada kegagalan tercatat pada rentang ini.</p>
            ) : (
              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                {ringkasanGagal.map(([kode, n]) => (
                  <div key={kode} style={{ background: 'rgba(79,70,229,0.06)', borderRadius: '0.5rem', padding: '0.6rem 0.9rem', minWidth: 120 }}>
                    <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--primary)', lineHeight: 1 }}>{n}</div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 700, marginTop: '0.2rem' }}>{kode}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="glass-card" style={{ padding: '1.25rem', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem', minWidth: 680 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-secondary)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <th style={{ padding: '0.5rem 0.6rem' }}>Tanggal</th>
                  <th style={{ padding: '0.5rem 0.6rem' }}>Guru</th>
                  <th style={{ padding: '0.5rem 0.6rem' }}>Cabang</th>
                  <th style={{ padding: '0.5rem 0.6rem' }}>Kode</th>
                  <th style={{ padding: '0.5rem 0.6rem' }}>Akurasi</th>
                  <th style={{ padding: '0.5rem 0.6rem' }}>Jarak</th>
                  <th style={{ padding: '0.5rem 0.6rem' }}>Perangkat</th>
                </tr>
              </thead>
              <tbody>
                {logGagal.map((l, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--glass-border)' }}>
                    <td style={{ padding: '0.55rem 0.6rem', whiteSpace: 'nowrap' }}>{fmtTgl(l.tanggal)}</td>
                    <td style={{ padding: '0.55rem 0.6rem', fontWeight: 600 }}>{l.gurus?.nama || '—'}</td>
                    <td style={{ padding: '0.55rem 0.6rem' }}>{l.units?.nama || '—'}</td>
                    <td style={{ padding: '0.55rem 0.6rem', fontWeight: 700, color: '#b45309' }}>{l.kode}</td>
                    <td style={{ padding: '0.55rem 0.6rem' }}>{l.akurasi != null ? `±${Math.round(l.akurasi)} m` : '—'}</td>
                    <td style={{ padding: '0.55rem 0.6rem' }}>{l.jarak_m != null ? `${Math.round(l.jarak_m)} m` : '—'}</td>
                    <td style={{ padding: '0.55rem 0.6rem', color: 'var(--text-secondary)', fontSize: '0.75rem', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.perangkat || ''}>
                      {/iPhone|iPad/i.test(l.perangkat || '') ? 'iPhone/iPad'
                        : /Android/i.test(l.perangkat || '') ? 'Android' : (l.perangkat || '—')}
                    </td>
                  </tr>
                ))}
                {logGagal.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Belum ada catatan kegagalan.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!bolehVerifikasi && (
        <div style={{ background: '#f1f5f9', color: '#475569', padding: '0.8rem 1.15rem', borderRadius: '0.65rem', marginTop: '1rem', fontSize: '0.85rem' }}>
          <AlertTriangle size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          Anda hanya bisa melihat. Keputusan setujui/tolak dilakukan oleh Supervisor ke atas.
        </div>
      )}
    </div>
  );
}
