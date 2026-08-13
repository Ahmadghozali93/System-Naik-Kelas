// Perhitungan kuota jadwal — satu sumber untuk semua halaman.
//
// Kursi jadwal RUTIN dipegang terus-menerus oleh siswanya: satu aktivasi
// aktif = satu kursi, tak peduli tanggal.
//
// Kursi jadwal HARIAN hanya terpakai pada tanggal pertemuannya. Satu paket
// privat 5 pertemuan tersimpan sebagai 5 baris aktivasi dengan tgl_mulai
// berbeda; kalau dihitung seperti rutin, paket itu menghabiskan 5 kursi
// sekaligus dan slotnya dianggap penuh selamanya.
//
// Karena itu kuota jadwal harian tidak bermakna tanpa konteks tanggal:
// fungsi di bawah mengembalikan null bila tanggalnya tidak diberikan, dan
// pemanggil menampilkannya sebagai '—', bukan sebagai angka.

const HARIAN = 'Harian';

const isHarian = (jadwal) => jadwal?.jenis_program === HARIAN;

// Jumlah kursi yang dipegang aktivasi siswa pada satu jadwal.
// Mengembalikan null untuk jadwal harian tanpa tanggal.
export function kursiTerpakai(jadwal, aktivasis, { tanggal = null, kecuali = null } = {}) {
  if (!jadwal) return 0;
  if (isHarian(jadwal) && !tanggal) return null;

  return (aktivasis || []).filter(a => {
    if (a.jadwal_id !== jadwal.id) return false;
    if (a.status !== 'Aktif') return false;
    if (kecuali && a.id === kecuali) return false;
    if (isHarian(jadwal) && a.tgl_mulai !== tanggal) return false;
    return true;
  }).length;
}

// Sisa kuota jadwal. null = tidak bermakna tanpa tanggal (jadwal harian).
export function sisaKuota(jadwal, aktivasis, opsi = {}) {
  const terpakai = kursiTerpakai(jadwal, aktivasis, opsi);
  if (terpakai === null) return null;
  return (jadwal?.kuota || 0) - terpakai;
}

// Apakah slot masih bisa diisi? Jadwal harian tanpa tanggal dianggap
// tersedia — yang menentukan adalah tanggal yang nanti dipilih, jadi
// slotnya tidak boleh disembunyikan lebih dulu dari daftar.
export function adaKursi(jadwal, aktivasis, opsi = {}) {
  const sisa = sisaKuota(jadwal, aktivasis, opsi);
  return sisa === null || sisa > 0;
}
