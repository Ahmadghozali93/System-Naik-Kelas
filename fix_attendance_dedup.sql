-- ============================================================
-- Bersihkan absen GANDA (duplikat) + cegah terulang
-- Penyebab: bug lama koreksi absen yang MEMBUAT baris baru alih-alih
-- mengubah absen yang ada (saat attendance_id kosong). Sekarang sudah
-- diperbaiki (pakai RPC apply_attendance_correction), tapi duplikat lama
-- masih tertinggal.
-- Jalankan BERURUTAN. JANGAN loncat ke Langkah 3 sebelum 1 & 2 selesai.
-- ============================================================

-- ── LANGKAH 1: Lihat semua absen ganda (guru + tanggal + shift sama) ──
-- Periksa hasilnya dulu. Kolom check_ins/statuses/created_ats diurutkan
-- dari yang paling LAMA ke paling BARU dibuat.
SELECT
  a.guru_id, g.nama, a.tanggal, a.shift_schedule_id,
  COUNT(*)                                     AS jumlah_baris,
  array_agg(a.id         ORDER BY a.created_at) AS ids,
  array_agg(a.check_in   ORDER BY a.created_at) AS check_ins,
  array_agg(a.status     ORDER BY a.created_at) AS statuses,
  array_agg(a.created_at ORDER BY a.created_at) AS created_ats
FROM attendances a
JOIN gurus g ON g.id = a.guru_id
WHERE a.shift_schedule_id IS NOT NULL
GROUP BY a.guru_id, g.nama, a.tanggal, a.shift_schedule_id
HAVING COUNT(*) > 1
ORDER BY a.tanggal DESC;


-- ── LANGKAH 2: BERSIHKAN DUPLIKAT ──
-- Pilih SALAH SATU cara (A atau B).

-- ── CARA A (OTOMATIS, disarankan): simpan baris TERBARU per shift,
--    hapus sisanya. Baris terbaru = hasil koreksi (dibuat belakangan).
--
--    A1. PRATINJAU dulu — ini daftar baris yang AKAN DIHAPUS. Cek dulu!
SELECT a.id, a.guru_id, a.tanggal, a.check_in, a.check_out, a.status, a.created_at
FROM attendances a
WHERE a.shift_schedule_id IS NOT NULL
  AND a.id NOT IN (
    SELECT DISTINCT ON (guru_id, tanggal, shift_schedule_id) id
    FROM attendances
    WHERE shift_schedule_id IS NOT NULL
    ORDER BY guru_id, tanggal, shift_schedule_id, created_at DESC
  )
ORDER BY a.tanggal DESC;

--    A2. Kalau daftar di A1 sudah benar, jalankan penghapusan:
-- DELETE FROM attendances a
-- WHERE a.shift_schedule_id IS NOT NULL
--   AND a.id NOT IN (
--     SELECT DISTINCT ON (guru_id, tanggal, shift_schedule_id) id
--     FROM attendances
--     WHERE shift_schedule_id IS NOT NULL
--     ORDER BY guru_id, tanggal, shift_schedule_id, created_at DESC
--   );

-- ── CARA B (MANUAL): hapus baris salah satu per satu berdasarkan hasil
--    Langkah 1. Pakai ini kalau ada grup yang baris benarnya BUKAN yang
--    terbaru.
--      DELETE FROM attendances WHERE id = '<ID_YANG_SALAH>';
--    Contoh kasus Dian (baris check-in 20:46 yang keliru):
--      DELETE FROM attendances WHERE id = '6780ab42-c1a5-4b9c-be0f-07087976cd3e';


-- ── LANGKAH 3: Cegah duplikat ke depan ──
-- Jalankan SETELAH Langkah 2 selesai & Langkah 1 tidak lagi mengembalikan baris.
-- Kalau masih gagal "is duplicated", berarti masih ada duplikat — ulangi Langkah 1-2.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_attendance_per_shift
  ON attendances (guru_id, tanggal, shift_schedule_id)
  WHERE shift_schedule_id IS NOT NULL;

-- ============================================================
-- Setelah index ini ada, satu guru tidak bisa lagi punya 2 absen
-- untuk shift terjadwal yang sama di tanggal yang sama.
-- ============================================================
