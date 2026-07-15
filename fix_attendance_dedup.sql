-- ============================================================
-- Bersihkan absen GANDA (duplikat) + cegah terulang
-- Penyebab: bug lama koreksi absen yang MEMBUAT baris baru alih-alih
-- mengubah absen yang ada (saat attendance_id kosong). Sekarang sudah
-- diperbaiki (pakai RPC apply_attendance_correction), tapi duplikat lama
-- masih tertinggal.
-- Jalankan bertahap di Supabase SQL Editor.
-- ============================================================

-- ── LANGKAH 1: Lihat semua absen ganda (guru + tanggal + shift sama) ──
-- Periksa hasilnya dulu sebelum menghapus apa pun.
SELECT
  a.guru_id, g.nama, a.tanggal, a.shift_schedule_id,
  COUNT(*)                                   AS jumlah_baris,
  array_agg(a.id ORDER BY a.created_at)       AS ids,
  array_agg(a.check_in ORDER BY a.created_at) AS check_ins,
  array_agg(a.status ORDER BY a.created_at)   AS statuses
FROM attendances a
JOIN gurus g ON g.id = a.guru_id
WHERE a.shift_schedule_id IS NOT NULL
GROUP BY a.guru_id, g.nama, a.tanggal, a.shift_schedule_id
HAVING COUNT(*) > 1
ORDER BY a.tanggal DESC;

-- ── LANGKAH 2: Hapus baris yang salah SATU PER SATU ──
-- Untuk tiap grup duplikat di atas, putuskan baris mana yang benar
-- (biasanya yang sudah sesuai koreksi), lalu hapus yang salah:
--
--   DELETE FROM attendances WHERE id = '<ID_YANG_SALAH>';
--
-- Contoh kasus Dian (hapus baris check-in 20:46 yang keliru):
--   DELETE FROM attendances WHERE id = '6780ab42-c1a5-4b9c-be0f-07087976cd3e';

-- ── LANGKAH 3: Cegah duplikat ke depan ──
-- Jalankan SETELAH semua duplikat di Langkah 2 dibersihkan
-- (kalau masih ada duplikat, perintah ini akan gagal — itu memang sengaja,
--  supaya tidak menutupi data ganda yang belum dibereskan).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_attendance_per_shift
  ON attendances (guru_id, tanggal, shift_schedule_id)
  WHERE shift_schedule_id IS NOT NULL;

-- ============================================================
-- Setelah index ini ada, satu guru tidak bisa lagi punya 2 absen
-- untuk shift terjadwal yang sama di tanggal yang sama.
-- ============================================================
