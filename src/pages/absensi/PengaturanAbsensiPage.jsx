import { useState, useEffect } from 'react';
import { MapPin, Save, AlertTriangle, ShieldCheck, Building, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/authStore';

// Empat mode kunci lokasi (lihat migrasi 0017). Urutannya sengaja dari
// paling longgar ke paling ketat — begitu juga urutan penerapannya:
// jangan pernah lompat langsung dari 'senyap' ke 'blokir'.
const MODE = [
  { v: 'nonaktif', judul: 'Nonaktif',
    ket: 'Lokasi tidak diminta sama sekali. Absensi berjalan seperti sebelum fitur ini ada.' },
  { v: 'senyap', judul: 'Senyap — kumpulkan data dulu',
    ket: 'Lokasi direkam dan jaraknya dihitung, tapi guru tidak diberi tahu apa pun dan tidak ada yang diblokir. Dipakai 1–2 minggu untuk mengetahui radius yang benar tiap cabang.' },
  { v: 'catat', judul: 'Catat — tandai penyimpangan',
    ket: 'Guru melihat posisinya. Absen dari luar area tetap berhasil, tapi ditandai dan masuk daftar verifikasi atasan.' },
  { v: 'blokir', judul: 'Blokir — wajib persetujuan',
    ket: 'Absen dari luar area ditolak. Guru bisa mengajukan dengan alasan, dan atasan yang memutuskan.' },
];

const inp = { padding: '0.55rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontFamily: 'inherit', fontSize: '0.88rem', boxSizing: 'border-box' };

export default function PengaturanAbsensiPage() {
  const { user } = useAuth();
  // Sengaja lebih sempit daripada is_admin(): Supervisor tidak boleh
  // mengubah setelan yang berlaku untuk seluruh cabang. RLS di server
  // menegakkan hal yang sama — ini hanya supaya tombolnya tidak menipu.
  const bolehUbah = ['Owner', 'Administrator'].includes(user?.role);

  const [set, setSet]       = useState(null);
  const [units, setUnits]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState(null);

  const fetchAll = async () => {
    const [s, u] = await Promise.all([
      supabase.from('absensi_pengaturan').select('*').maybeSingle(),
      supabase.from('units').select('id, nama, latitude, longitude, radius_meter, mode_lokasi')
        .eq('aktif', true).order('nama'),
    ]);
    setSet(s.data || null);
    setUnits(u.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const simpan = async () => {
    setSaving(true); setMsg(null);
    const { error } = await supabase.from('absensi_pengaturan').update({
      mode: set.mode,
      darurat: set.darurat,
      akurasi_maks: Number(set.akurasi_maks) || 150,
      diubah_pada: new Date().toISOString(),
      diubah_oleh: user?.nama || user?.id || null,
    }).eq('id', true);
    setSaving(false);
    setMsg(error
      ? { ok: false, text: 'Gagal menyimpan: ' + error.message }
      : { ok: true, text: 'Setelan tersimpan.' });
    if (!error) fetchAll();
  };

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-secondary)' }}>Memuat setelan...</div>;

  if (!set) return (
    <div className="glass-card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
      <AlertTriangle size={36} style={{ opacity: 0.4, marginBottom: '0.75rem' }} />
      <p style={{ fontWeight: 600 }}>Setelan kunci lokasi belum tersedia</p>
      <p style={{ fontSize: '0.85rem' }}>Jalankan migrasi <code>0017_absensi_kunci_lokasi.sql</code> lebih dulu di Supabase.</p>
    </div>
  );

  const belumAdaTitik = units.filter(u => u.latitude == null || u.longitude == null);
  const modeKetat = set.mode === 'catat' || set.mode === 'blokir';

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Absensi</p>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>Pengaturan Kunci Lokasi</h1>
      </div>

      {msg && (
        <div style={{ background: msg.ok ? '#d1fae5' : '#fee2e2', color: msg.ok ? '#047857' : '#b91c1c', padding: '0.8rem 1.15rem', borderRadius: '0.65rem', marginBottom: '1rem', fontWeight: 600, fontSize: '0.88rem' }}>
          {msg.text}
        </div>
      )}

      {!bolehUbah && (
        <div style={{ background: '#f1f5f9', color: '#475569', padding: '0.8rem 1.15rem', borderRadius: '0.65rem', marginBottom: '1rem', fontSize: '0.85rem', lineHeight: 1.55 }}>
          <ShieldCheck size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          Setelan ini berlaku untuk semua cabang, jadi hanya Owner/Administrator yang bisa mengubahnya.
          Anda tetap bisa mengatur cabang sendiri lewat menu <strong>Unit / Cabang</strong>.
        </div>
      )}

      {/* Peringatan paling penting di halaman ini: mode ketat tanpa titik
          cabang akan menandai guru sebagai "Tanpa Data" massal. */}
      {modeKetat && belumAdaTitik.length > 0 && (
        <div style={{ background: '#fef3c7', border: '1px solid #fde68a', color: '#92400e', padding: '0.9rem 1.15rem', borderRadius: '0.65rem', marginBottom: '1rem', fontSize: '0.86rem', lineHeight: 1.6 }}>
          <AlertTriangle size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          <strong>{belumAdaTitik.length} cabang belum punya titik absensi:</strong>{' '}
          {belumAdaTitik.map(u => u.nama).join(', ')}.
          <br />Absen di cabang tersebut akan tercatat <em>Tanpa Data</em> dan tidak bisa dinilai. Isi titiknya lewat menu Unit / Cabang.
        </div>
      )}

      <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1.25rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.35rem' }}>Mode Default Seluruh Sistem</h2>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 1.1rem', lineHeight: 1.55 }}>
          Berlaku untuk cabang yang tidak menyetel modenya sendiri.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {MODE.map(m => {
            const aktif = set.mode === m.v;
            return (
              <label key={m.v} style={{
                display: 'flex', alignItems: 'flex-start', gap: '0.7rem', padding: '0.85rem 1rem',
                borderRadius: '0.6rem', cursor: bolehUbah ? 'pointer' : 'not-allowed',
                border: `1px solid ${aktif ? 'var(--primary)' : 'var(--glass-border)'}`,
                background: aktif ? 'rgba(79,70,229,0.05)' : 'var(--surface-color)',
                opacity: bolehUbah ? 1 : 0.7,
              }}>
                <input type="radio" name="mode" value={m.v} checked={aktif} disabled={!bolehUbah}
                  onChange={() => setSet(s => ({ ...s, mode: m.v }))}
                  style={{ marginTop: 3, accentColor: 'var(--primary)', flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{m.judul}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.55, marginTop: '0.15rem' }}>{m.ket}</div>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1.25rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 1rem' }}>Saklar Darurat</h2>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.7rem', cursor: bolehUbah ? 'pointer' : 'not-allowed' }}>
          <input type="checkbox" checked={!!set.darurat} disabled={!bolehUbah}
            onChange={e => setSet(s => ({ ...s, darurat: e.target.checked }))}
            style={{ width: '1rem', height: '1rem', marginTop: 3, accentColor: '#dc2626', flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Turunkan sementara semua cabang dari Blokir ke Catat</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.55, marginTop: '0.15rem' }}>
              Untuk hari ketika ada yang salah — layanan lokasi ngadat, radius satu cabang keliru setel.
              Absen tetap tercatat dan tidak ada guru yang terkunci. Matikan lagi setelah beres.
            </div>
          </div>
        </label>

        {set.darurat && (
          <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '0.7rem 1rem', borderRadius: '0.5rem', marginTop: '0.9rem', fontSize: '0.83rem', fontWeight: 600 }}>
            Saklar darurat sedang menyala — tidak ada cabang yang memblokir absen saat ini.
          </div>
        )}

        <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid var(--glass-border)' }}>
          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.35rem' }}>
            Batas akurasi GPS (meter)
          </label>
          <input type="number" min={50} max={1000} value={set.akurasi_maks} disabled={!bolehUbah}
            onChange={e => setSet(s => ({ ...s, akurasi_maks: e.target.value }))}
            style={{ ...inp, width: 140 }} />
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0.4rem 0 0', lineHeight: 1.55, maxWidth: 620 }}>
            Pembacaan yang lebih kabur dari ini ditandai <em>GPS Lemah</em>, bukan dianggap pelanggaran —
            karena pada jarak sekabur itu posisi guru memang tidak bisa dipastikan. Kasus tersering: iPhone
            dengan &quot;Lokasi Tepat&quot; yang mati, akurasinya bisa 1–5 km. Menaikkan angka ini membuat sistem
            lebih longgar, menurunkannya membuat lebih banyak guru diminta mengulang.
          </p>
        </div>
      </div>

      {bolehUbah && (
        <button className="btn btn-primary" onClick={simpan} disabled={saving} style={{ marginBottom: '1.5rem' }}>
          <Save size={16} /> {saving ? 'Menyimpan...' : 'Simpan Setelan'}
        </button>
      )}

      {/* Ringkasan per cabang — supaya tidak perlu membuka menu Unit satu
          per satu hanya untuk tahu mana yang sudah siap. */}
      <div className="glass-card" style={{ padding: '1.5rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <Building size={17} /> Kesiapan Tiap Cabang
        </h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <th style={{ padding: '0.5rem 0.6rem' }}>Cabang</th>
                <th style={{ padding: '0.5rem 0.6rem' }}>Titik Absensi</th>
                <th style={{ padding: '0.5rem 0.6rem' }}>Radius</th>
                <th style={{ padding: '0.5rem 0.6rem' }}>Mode</th>
              </tr>
            </thead>
            <tbody>
              {units.map(u => {
                const ada = u.latitude != null && u.longitude != null;
                return (
                  <tr key={u.id} style={{ borderTop: '1px solid var(--glass-border)' }}>
                    <td style={{ padding: '0.6rem', fontWeight: 600 }}>{u.nama}</td>
                    <td style={{ padding: '0.6rem' }}>
                      {ada
                        ? <span style={{ color: '#047857', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}><CheckCircle2 size={14} /> Sudah diisi</span>
                        : <span style={{ color: '#b45309', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}><MapPin size={14} /> Belum diisi</span>}
                    </td>
                    <td style={{ padding: '0.6rem' }}>{u.radius_meter ?? 150} m</td>
                    <td style={{ padding: '0.6rem', color: u.mode_lokasi ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                      {u.mode_lokasi || `ikut global (${set.mode})`}
                    </td>
                  </tr>
                );
              })}
              {units.length === 0 && (
                <tr><td colSpan={4} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Belum ada cabang aktif.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
