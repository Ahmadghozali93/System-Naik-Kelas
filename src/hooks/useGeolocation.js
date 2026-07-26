import { useCallback, useRef, useState } from 'react';

// ─────────────────────────────────────────────────────────────
// Pengambilan lokasi untuk absensi.
//
// Guru absen memakai HP pribadi lewat browser, jadi kegagalan yang
// bukan salah mereka itu banyak: izin lokasi ditolak, layanan lokasi
// OS mati, mode hemat baterai, dan — paling sering di iPhone —
// "Lokasi Tepat" yang mati sehingga akurasinya jadi 1–5 km.
//
// Karena itu setiap kegagalan diberi kode + langkah perbaikan yang
// bisa dikerjakan guru sendiri, bukan "hubungi admin".
// ─────────────────────────────────────────────────────────────

export const IOS = typeof navigator !== 'undefined' && (
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
);

// Panduan dibedakan per sistem operasi — langkahnya memang berbeda,
// dan panduan yang tidak cocok sama saja dengan tidak ada panduan.
const PANDUAN_IZIN = IOS
  ? ['Buka Pengaturan → Safari → Lokasi, pilih "Tanya" atau "Izinkan".',
     'Kembali ke halaman ini, lalu muat ulang.']
  : ['Ketuk ikon gembok di sebelah alamat situs.',
     'Pilih Izin / Perizinan situs → Lokasi → Izinkan.',
     'Muat ulang halaman ini.'];

const PANDUAN_AKURASI = IOS
  ? ['Buka Pengaturan → Privasi & Keamanan → Layanan Lokasi → Safari.',
     'Nyalakan "Lokasi Tepat" (Precise Location).',
     'Matikan Mode Daya Rendah, lalu coba lagi.']
  : ['Nyalakan WiFi (tidak perlu tersambung) — akurasi lokasi ikut naik.',
     'Matikan mode hemat baterai.',
     'Berdiri dekat jendela atau di luar ruangan, lalu coba lagi.'];

// Katalog pesan. Kunci yang sama dipakai untuk kode dari server,
// supaya guru melihat gaya pesan yang konsisten dari mana pun asalnya.
export const KATALOG_GAGAL = {
  LOC_UNSUPPORTED: {
    judul: 'Browser tidak mendukung deteksi lokasi',
    pesan: 'Coba buka aplikasi ini lewat Chrome atau Safari versi terbaru.',
    langkah: [], ulangi: false,
  },
  LOC_INSECURE: {
    judul: 'Alamat situs tidak aman',
    pesan: 'Deteksi lokasi hanya bisa jalan di alamat https. Buka aplikasi lewat tautan resmi.',
    langkah: [], ulangi: false,
  },
  LOC_DENIED: {
    judul: 'Izin lokasi ditolak',
    pesan: 'Aplikasi tidak diizinkan membaca lokasi HP Anda.',
    langkah: PANDUAN_IZIN, ulangi: true,
  },
  LOC_OFF: {
    judul: 'Layanan Lokasi mati',
    pesan: 'Layanan Lokasi di HP Anda sedang tidak aktif.',
    langkah: IOS
      ? ['Buka Pengaturan → Privasi & Keamanan → Layanan Lokasi.', 'Nyalakan, lalu coba lagi.']
      : ['Geser panel notifikasi, nyalakan ikon Lokasi / GPS.', 'Lalu coba lagi.'],
    ulangi: true,
  },
  LOC_TIMEOUT: {
    judul: 'Belum dapat sinyal GPS',
    pesan: 'HP Anda belum berhasil menentukan lokasi.',
    langkah: ['Berdiri dekat jendela atau di luar ruangan.', 'Nyalakan WiFi, lalu coba lagi.'],
    ulangi: true,
  },
  LOC_WEAK: {
    judul: 'Sinyal GPS lemah',
    pesan: 'Lokasi Anda terbaca terlalu kabur untuk dipastikan.',
    langkah: PANDUAN_AKURASI, ulangi: true,
  },
  OUT_OF_AREA: {
    judul: 'Anda berada di luar area cabang',
    pesan: 'Absen belum bisa diproses dari lokasi ini.',
    langkah: ['Kalau Anda memang sedang bertugas di luar, ajukan persetujuan ke atasan.'],
    ulangi: true,
  },
  LOC_REQUIRED: {
    judul: 'Absen di cabang ini wajib menyertakan lokasi',
    pesan: 'Lokasi Anda belum terbaca.',
    langkah: PANDUAN_IZIN, ulangi: true,
  },
  NET_OFFLINE: {
    judul: 'Tidak ada koneksi internet',
    pesan: 'Absen belum terkirim — jangan tutup halaman ini.',
    langkah: ['Periksa data seluler atau WiFi Anda, lalu kirim ulang.'],
    ulangi: true,
  },
  UPLOAD_FAILED: {
    judul: 'Foto gagal diunggah',
    pesan: 'Absen belum tercatat karena fotonya tidak berhasil dikirim.',
    langkah: ['Biasanya karena sinyal lemah. Coba lagi di tempat bersinyal lebih baik.'],
    ulangi: true,
  },
  SESSION_EXPIRED: {
    judul: 'Sesi Anda sudah berakhir',
    pesan: 'Masuk kembali untuk melanjutkan absen.',
    langkah: [], ulangi: false,
  },
  APP_OUTDATED: {
    judul: 'Aplikasi perlu diperbarui',
    pesan: 'HP Anda masih memakai versi lama aplikasi ini.',
    langkah: ['Tekan tombol Muat Ulang di bawah.'],
    ulangi: false,
  },
};

// Haversine, meter. Kembarannya ada di absensi_jarak_meter() pada migrasi
// 0017 — yang di server tetap jadi penentu; ini hanya untuk tampilan,
// supaya guru tahu posisinya sebelum menekan tombol.
export function jarakMeter(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some(v => v === null || v === undefined || Number.isNaN(Number(v)))) return null;
  const R = 6371000, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.asin(Math.sqrt(a)));
}

export function pesanGagal(kode, tambahan = {}) {
  const dasar = KATALOG_GAGAL[kode] || {
    judul: 'Absen gagal diproses',
    pesan: tambahan.pesan || 'Terjadi kendala yang tidak dikenali.',
    langkah: [], ulangi: true,
  };
  return { kode, ...dasar, ...tambahan };
}

const petakanErrorBrowser = (err) => {
  if (err?.code === 1) return 'LOC_DENIED';
  if (err?.code === 2) return 'LOC_OFF';
  if (err?.code === 3) return 'LOC_TIMEOUT';
  return 'LOC_TIMEOUT';
};

/**
 * Ambil koordinat dengan akurasi sebaik mungkin.
 *
 * Sengaja memakai watchPosition, bukan getCurrentPosition sekali tembak:
 * GPS butuh 10–60 detik untuk "cold start", dan pembacaan pertama hampir
 * selalu jauh lebih kabur daripada pembacaan beberapa detik berikutnya.
 * Pembacaan terbaik dikumpulkan sampai targetnya tercapai atau waktunya habis.
 *
 * Tidak pernah throw — selalu mengembalikan objek hasil, supaya pemanggil
 * yang sedang berjalan di mode senyap bisa mengabaikannya begitu saja.
 */
export function ambilLokasi({
  timeoutMs = 15000,
  akurasiTarget = 30,     // meter; kalau tercapai, berhenti lebih awal
  akurasiMaks = 150,      // di atas ini dianggap terlalu kabur
  onProgress,
} = {}) {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return resolve({ ok: false, ...pesanGagal('LOC_UNSUPPORTED') });
    }
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      return resolve({ ok: false, ...pesanGagal('LOC_INSECURE') });
    }

    let terbaik = null;
    let selesai = false;
    let watchId = null;

    const tutup = () => {
      if (watchId !== null) { try { navigator.geolocation.clearWatch(watchId); } catch { /* abaikan */ } }
      clearTimeout(timer);
    };

    const jawab = (hasil) => {
      if (selesai) return;
      selesai = true;
      tutup();
      resolve(hasil);
    };

    const timer = setTimeout(() => {
      if (!terbaik) return jawab({ ok: false, ...pesanGagal('LOC_TIMEOUT') });
      // Dapat pembacaan, tapi tidak ada yang cukup tajam sampai waktu habis.
      jawab(hasilDari(terbaik, akurasiMaks));
    }, timeoutMs);

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        if (!terbaik || accuracy < terbaik.accuracy) {
          terbaik = { latitude, longitude, accuracy };
          onProgress?.(Math.round(accuracy));
        }
        if (terbaik.accuracy <= akurasiTarget) jawab(hasilDari(terbaik, akurasiMaks));
      },
      (err) => {
        // Izin ditolak / layanan mati bersifat final — tidak ada gunanya menunggu.
        // Sisanya masih mungkin membaik, jadi biarkan sampai waktunya habis.
        const kode = petakanErrorBrowser(err);
        if (kode === 'LOC_DENIED' || kode === 'LOC_OFF') {
          jawab({ ok: false, ...pesanGagal(kode) });
        } else if (!terbaik) {
          jawab({ ok: false, ...pesanGagal(kode) });
        }
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
    );
  });
}

function hasilDari(p, akurasiMaks) {
  const akurasi = Math.round(p.accuracy);
  if (akurasi > akurasiMaks) {
    return {
      ok: false, lemah: true,
      lat: p.latitude, lng: p.longitude, akurasi,
      ...pesanGagal('LOC_WEAK', { akurasi }),
    };
  }
  return { ok: true, lat: p.latitude, lng: p.longitude, akurasi };
}

export function useGeolocation() {
  const [status, setStatus] = useState('idle'); // idle | mencari | ok | gagal
  const [akurasiKini, setAkurasiKini] = useState(null);
  const [hasil, setHasil] = useState(null);
  const berjalan = useRef(false);

  const cari = useCallback(async (opsi = {}) => {
    if (berjalan.current) return null;
    berjalan.current = true;
    setStatus('mencari');
    setAkurasiKini(null);

    const r = await ambilLokasi({ ...opsi, onProgress: setAkurasiKini });

    setHasil(r);
    setStatus(r.ok ? 'ok' : 'gagal');
    berjalan.current = false;
    return r;
  }, []);

  const reset = useCallback(() => {
    setStatus('idle'); setAkurasiKini(null); setHasil(null);
  }, []);

  return { status, akurasiKini, hasil, cari, reset };
}
