-- ============================================================
-- BERSIHKAN absen "Tanpa Shift" (duplikat buatan koreksi) + terapkan ulang
--
-- Latar: bug lama membuat koreksi MENAMBAH baris absen baru tanpa
-- shift_schedule_id (muncul "Tanpa Shift"), sementara baris asli check-in
-- (ber-shift) tetap ada dengan jam yang salah. Jadi ada 2 baris per hari.
--
-- Fakta kunci: check-in asli SELALU punya shift_schedule_id.
-- Maka baris shift_schedule_id IS NULL = artefak koreksi (duplikat).
--
-- Strategi: hapus baris "Tanpa Shift" YANG punya kembaran ber-shift di
-- guru+tanggal sama, lalu terapkan ulang koreksi ke baris ber-shift
-- (lewat tombol "Terapkan Ulang" di aplikasi / RPC yang sudah diperbaiki).
-- Jalankan BERURUTAN di Supabase SQL Editor.
-- ============================================================

-- ── LANGKAH 1: PRATINJAU — baris "Tanpa Shift" yang AKAN DIHAPUS ──
-- (hanya yang punya kembaran ber-shift; kalau tidak ada kembaran, dibiarkan
--  karena itu satu-satunya catatan untuk hari itu)
SELECT g.nama, a.tanggal, a.id, a.check_in, a.check_out, a.status, a.created_at
FROM attendances a
JOIN gurus g ON g.id = a.guru_id
WHERE a.shift_schedule_id IS NULL
  AND EXISTS (
    SELECT 1 FROM attendances b
    WHERE b.guru_id = a.guru_id
      AND b.tanggal = a.tanggal
      AND b.shift_schedule_id IS NOT NULL
  )
ORDER BY a.tanggal DESC;

-- ── LANGKAH 2: HAPUS baris "Tanpa Shift" duplikat tsb ──
-- (jalankan setelah pratinjau Langkah 1 kamu periksa)
-- DELETE FROM attendances a
-- WHERE a.shift_schedule_id IS NULL
--   AND EXISTS (
--     SELECT 1 FROM attendances b
--     WHERE b.guru_id = a.guru_id
--       AND b.tanggal = a.tanggal
--       AND b.shift_schedule_id IS NOT NULL
--   );

-- ── LANGKAH 3: (kalau masih ada) bersihkan duplikat sesama ber-shift ──
-- Untuk guru yang punya >1 baris ber-shift di shift & tanggal sama:
SELECT g.nama, a.tanggal, a.shift_schedule_id, COUNT(*) AS jml,
       array_agg(a.id ORDER BY a.created_at) AS ids
FROM attendances a
JOIN gurus g ON g.id = a.guru_id
WHERE a.shift_schedule_id IS NOT NULL
GROUP BY g.nama, a.guru_id, a.tanggal, a.shift_schedule_id
HAVING COUNT(*) > 1
ORDER BY a.tanggal DESC;
-- Kalau ada hasil, hapus yang salah satu per satu:
--   DELETE FROM attendances WHERE id = '<ID_YANG_SALAH>';

-- ── LANGKAH 4: TERAPKAN ULANG KOREKSI ──
-- Di aplikasi menu Koreksi Absen, klik "Terapkan Ulang" pada tiap koreksi
-- Approved. RPC (versi terbaru) akan mengisi jam ke baris ber-shift yang
-- benar & menghitung ulang status/durasi.
-- Untuk hari dengan BEBERAPA koreksi berbeda, terapkan yang BENAR paling akhir.

-- ── LANGKAH 5: pasang index unik (cegah duplikat ke depan) ──
-- Jalankan setelah Langkah 1 & 3 tidak lagi mengembalikan baris.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_attendance_per_shift
  ON attendances (guru_id, tanggal, shift_schedule_id)
  WHERE shift_schedule_id IS NOT NULL;
