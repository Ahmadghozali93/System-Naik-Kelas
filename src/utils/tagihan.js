// Penyusunan baris tagihan SPP — satu sumber untuk halaman Tagihan Siswa
// dan Laporan SPP, yang sebelumnya menghitung ini sendiri-sendiri dan sudah
// menyimpang satu sama lain.
//
// Satu baris tagihan = satu hal yang ditagih:
//   siklus 'bulanan' → satu aktivasi rutin, berulang tiap bulan
//   siklus 'sekali'  → satu paket harian/privat, gabungan seluruh pertemuan
//                      se-assign_id_induk, sekali bayar
//
// Paket harian tersimpan sebagai satu baris aktivasi per pertemuan. Kalau
// tiap baris diperlakukan sebagai tagihan tersendiri, paket 5 pertemuan
// muncul sebagai 5 tagihan yang masing-masing berulang bulanan — padahal
// lesnya sekali jalan.

export const addOneMonth = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().split('T')[0];
};

const hariIni = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

// Untuk tagihan bulanan, 'Terlambat' menang atas 'Lunas': jatuh tempo yang
// dipakai adalah periode BERIKUTNYA yang belum dibayar, jadi tanggal yang
// sudah lewat berarti tunggakan baru.
//
// Untuk paket sekali bayar tidak ada periode berikutnya — sekali lunas,
// lunas selamanya. Inilah yang dulu membuat paket yang sudah dibayar
// berbalik jadi 'Terlambat' begitu tanggalnya lewat.
export const computeStatus = (hasPayment, currentJT, siklus = 'bulanan') => {
  if (siklus === 'sekali') {
    if (hasPayment) return 'Lunas';
    if (!currentJT) return 'Belum Bayar';
    return new Date(currentJT) < hariIni() ? 'Terlambat' : 'Belum Bayar';
  }
  if (!currentJT) return 'Belum Bayar';
  if (new Date(currentJT) < hariIni()) return 'Terlambat';
  if (hasPayment) return 'Lunas';
  return 'Belum Bayar';
};

// Dipakai untuk menampilkan "Bayar Terakhir". Beberapa periode sering dilunasi
// sekaligus, jadi tanggal_bayar yang sama itu biasa. Array.sort bersifat stabil,
// sehingga hasil seri ikut urutan array — yang berbeda tiap halaman karena
// order query-nya beda. created_at jadi pemutus supaya hasilnya seragam.
const terbaru = (daftar) =>
  [...daftar].sort((a, b) => {
    const selisih = new Date(b.tanggal_bayar || b.created_at) - new Date(a.tanggal_bayar || a.created_at);
    return selisih || new Date(b.created_at) - new Date(a.created_at);
  })[0];

// Periode terjauh yang sudah dibayar — dasar jatuh tempo berikutnya.
//
// Sebelumnya dasarnya adalah transaksi dengan tanggal_bayar paling akhir. Saat
// orang tua melunasi Juli dan Agustus di hari yang sama, kedua baris bertanggal
// bayar sama dan yang terpilih jadi untung-untungan; kalau yang tersangkut baris
// Juli, jatuh tempo mundur sebulan dan tagihan yang sudah lunas tampil
// 'Terlambat'. Kasus yang sama juga muncul saat tunggakan lama baru dibayar
// setelah periode berjalan sudah lunas.
const jatuhTempoTerjauh = (daftar) =>
  daftar.reduce((max, p) => (p.jatuh_tempo && (!max || p.jatuh_tempo > max) ? p.jatuh_tempo : max), null);

const isPaket = (aktivasi) =>
  aktivasi.siklus === 'sekali' || aktivasi.detail_jadwal?.jenis_program === 'Harian';

// Pembayaran milik satu paket. Diurutkan dari pengikat yang paling pasti:
//   1. induk_id            — sejak migrasi 0030
//   2. aktivasi_id         — pembayaran lama, sebelum induk_id di-backfill
//   3. siswa+program+unit  — pembayaran yang bahkan tidak punya aktivasi_id,
//      dan hanya bila jatuh temponya berada di dalam rentang pertemuan paket
//      supaya tidak menyambar pembayaran paket lain milik siswa yang sama.
const pembayaranPaket = (pembayarans, t) =>
  pembayarans.filter(p => {
    if (p.induk_id) return p.induk_id === t.induk_id;
    if (p.aktivasi_id) return t.aktivasi_ids.includes(p.aktivasi_id);
    if (p.siswa_id !== t.siswa_id) return false;
    if (p.nama_program !== t.nama_program || p.unit !== t.unit) return false;
    if (!p.jatuh_tempo) return false;
    return p.jatuh_tempo >= t.tgl_mulai && p.jatuh_tempo <= t.tgl_selesai;
  });

const pembayaranRutin = (pembayarans, t) =>
  pembayarans.filter(p =>
    p.aktivasi_id
      ? p.aktivasi_id === t.key
      : p.siswa_id === t.siswa_id && p.nama_program === t.nama_program && p.unit === t.unit
  );

export function buildTagihan(aktivasis, pembayarans) {
  const daftar = [];
  const indexPaket = {};   // assign_id_induk → posisi di daftar

  (aktivasis || []).forEach(a => {
    const dj = a.detail_jadwal || {};

    if (!isPaket(a)) {
      daftar.push({
        key: a.id,
        siklus: 'bulanan',
        aktivasi_ids: [a.id],
        induk_id: null,
        siswa_id: a.siswa_id,
        nama_siswa: a.nama_siswa,
        nowa: a.siswa?.nowa || null,
        nama_program: dj.nama_program || '',
        unit: dj.unit || '',
        nominal: Number(a.spp) || 0,
        jumlah_sesi: null,
        tgl_mulai: a.tgl_mulai,
        tgl_selesai: null,
      });
      return;
    }

    // Paket tanpa assign_id_induk (data sebelum kolom itu ada) berdiri sendiri.
    const induk = a.assign_id_induk || a.id;
    const sudahAda = indexPaket[induk];

    if (sudahAda === undefined) {
      indexPaket[induk] = daftar.length;
      daftar.push({
        key: induk,
        siklus: 'sekali',
        aktivasi_ids: [a.id],
        induk_id: a.assign_id_induk || null,
        siswa_id: a.siswa_id,
        nama_siswa: a.nama_siswa,
        nowa: a.siswa?.nowa || null,
        nama_program: dj.nama_program || '',
        unit: dj.unit || '',
        nominal: Number(a.spp) || 0,
        jumlah_sesi: 1,
        tgl_mulai: a.tgl_mulai,
        tgl_selesai: a.tgl_mulai,
      });
      return;
    }

    const t = daftar[sudahAda];
    t.aktivasi_ids.push(a.id);
    t.nominal += Number(a.spp) || 0;
    t.jumlah_sesi += 1;
    if (a.tgl_mulai && (!t.tgl_mulai   || a.tgl_mulai < t.tgl_mulai))   t.tgl_mulai   = a.tgl_mulai;
    if (a.tgl_mulai && (!t.tgl_selesai || a.tgl_mulai > t.tgl_selesai)) t.tgl_selesai = a.tgl_mulai;
  });

  return daftar.map(t => {
    const milik = t.siklus === 'sekali'
      ? pembayaranPaket(pembayarans || [], t)
      : pembayaranRutin(pembayarans || [], t);
    const last = terbaru(milik);

    const jtDibayar = t.siklus === 'sekali' ? null : jatuhTempoTerjauh(milik);

    let jatuh_tempo;
    if (t.siklus === 'sekali') {
      // Paket dibayar sekali di muka: jatuh temponya tetap pertemuan pertama,
      // tidak pernah maju sebulan.
      jatuh_tempo = t.tgl_mulai;
    } else if (jtDibayar) {
      const next = addOneMonth(jtDibayar);
      // Siswa yang mendaftar ulang setelah sempat berhenti: pakai tanggal
      // mulai yang baru, bukan lanjutan periode lama.
      jatuh_tempo = (next && t.tgl_mulai && next < t.tgl_mulai) ? t.tgl_mulai : next;
    } else {
      jatuh_tempo = t.tgl_mulai;
    }

    return {
      ...t,
      jatuh_tempo,
      pembayaran_terakhir: last || null,
      status: computeStatus(!!last, jatuh_tempo, t.siklus),
    };
  });
}
