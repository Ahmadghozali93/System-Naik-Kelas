-- ============================================================
-- 0010 — IMPORT DATA AWAL LISENSI (9 baris + riwayat perpanjangan)
-- ============================================================
--
-- Jalankan SETELAH 0009_fitur_lisensi.sql.
-- AMAN dijalankan berulang (ON CONFLICT DO NOTHING) — tidak akan bikin data dobel.
-- Tidak ada DROP / DELETE / ALTER di file ini. Hanya menambah baris baru.
--
-- JALANKAN DI PROJECT SALINAN (STAGING) DULU, JANGAN DI PRODUCTION.
--
-- CARA MEMBATALKAN (kalau datanya salah dan belum dipakai):
--   DELETE FROM public.lisensi;   -- riwayat & log ikut terhapus otomatis
--
-- ------------------------------------------------------------
-- CATATAN UNTUK PEMILIK — soal data yang terlihat janggal:
--   Ada 3 baris di data asli yang "No Unit" dan "Username"-nya BERBEDA
--   (Ahe/Plantaran, Aga/Plantaran, Ala/Plantaran: No Unit 2143 tapi Username 1061),
--   sementara baris lain selalu sama. Data ini dimasukkan APA ADANYA sesuai sumber.
--   Kalau ternyata itu salah ketik, perbaiki lewat menu Lisensi setelah import.
--
--   Kolom "tanggal perpanjang" di riwayat sengaja DIKOSONGKAN, karena data tanggal
--   aslinya memang tidak ada. Tahun perpanjangannya tetap tercatat.
--
-- ⚠️ PASSWORD PORTAL SENGAJA TIDAK DITULIS DI FILE INI.
--   Alasannya: file ini ikut terunggah ke GitHub, dan repo GitHub proyek ini
--   bisa dibaca siapa saja. Password yang pernah masuk ke GitHub sangat sulit
--   dihapus karena tetap tersimpan di riwayatnya.
--
--   Semua lisensi di-import dengan password bertuliskan 'ISI-MANUAL'.
--   Setelah import selesai, isi password aslinya lewat aplikasi:
--   menu Lisensi → klik lisensinya → tombol Edit → kolom Password Portal.
--
--   Kalau Anda ingin mengisi semua sekaligus (9 lisensi passwordnya sama),
--   jalankan perintah ini di SQL Editor dan ganti bagian dalam tanda kutip:
--     UPDATE public.lisensi SET password_catatan = 'password-asli-anda'
--     WHERE password_catatan = 'ISI-MANUAL';
--   Perintah itu diketik langsung di SQL Editor, JANGAN disimpan ke file.
-- ------------------------------------------------------------


-- ============================================================
-- 1. PENGAMAN: pastikan keempat unit ada di tabel units
-- ============================================================
-- Kalau ada nama unit yang tidak ketemu, SELURUH file ini dibatalkan
-- dan muncul pesan error yang menyebut unit mana yang bermasalah.
-- (Tidak akan ada data yang masuk setengah-setengah.)
DO $$
DECLARE
  v_hilang TEXT;
BEGIN
  SELECT string_agg(t.nama, ', ')
  INTO v_hilang
  FROM (VALUES ('Plantaran'), ('Sarirejo'), ('Krajankulon'), ('Magelung')) AS t(nama)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.units u WHERE lower(trim(u.nama)) = lower(t.nama)
  );

  IF v_hilang IS NOT NULL THEN
    RAISE EXCEPTION
      'IMPORT DIBATALKAN. Unit berikut tidak ditemukan di tabel units: %. Cek penulisan namanya di menu Unit, lalu jalankan ulang file ini.',
      v_hilang;
  END IF;
END $$;


-- ============================================================
-- 2. IMPORT 9 LISENSI
-- ============================================================
-- unit_id dicari lewat pencocokan NAMA unit (tidak ada id yang di-hardcode).
INSERT INTO public.lisensi
  (nama_lisensi, unit_id, tgl_jatuh_tempo, no_unit, username, password_catatan, link_portal, aktif)
SELECT
  d.nama_lisensi,
  u.id,
  d.tgl_jatuh_tempo,
  d.no_unit,
  d.username,
  'ISI-MANUAL',   -- password asli diisi lewat menu Lisensi setelah import (lihat catatan di atas)
  'https://oauth.jannah.education',
  true
FROM (VALUES
  ('Ahe', 'Plantaran',   DATE '2025-03-30', '2143', '1061'),
  ('Aga', 'Plantaran',   DATE '2025-04-26', '2143', '1061'),
  ('Ala', 'Sarirejo',    DATE '2024-08-27', '1061', '1061'),
  ('Ahe', 'Krajankulon', DATE '2024-08-30', '3416', '3416'),
  ('Ahe', 'Sarirejo',    DATE '2024-09-27', '1061', '1061'),
  ('Ahe', 'Magelung',    DATE '2024-10-01', '7493', '7493'),
  ('Aga', 'Sarirejo',    DATE '2024-11-18', '1061', '1061'),
  ('Ala', 'Plantaran',   DATE '2024-12-13', '2143', '1061'),
  ('Ala', 'Krajankulon', DATE '2024-12-26', '3416', '3416')
) AS d(nama_lisensi, nama_unit, tgl_jatuh_tempo, no_unit, username)
JOIN public.units u ON lower(trim(u.nama)) = lower(d.nama_unit)
ON CONFLICT (nama_lisensi, unit_id) DO NOTHING;


-- ============================================================
-- 3. IMPORT RIWAYAT PERPANJANGAN
-- ============================================================
-- tgl_perpanjang dibiarkan NULL — tanggal aslinya tidak ada, jangan mengarang.
INSERT INTO public.lisensi_perpanjangan (lisensi_id, tahun, tgl_perpanjang)
SELECT l.id, d.tahun, NULL
FROM (VALUES
  ('Ahe', 'Plantaran',   2024), ('Ahe', 'Plantaran',   2025), ('Ahe', 'Plantaran',   2026),
  ('Aga', 'Plantaran',   2024), ('Aga', 'Plantaran',   2025), ('Aga', 'Plantaran',   2026),
  ('Ala', 'Sarirejo',    2024), ('Ala', 'Sarirejo',    2025), ('Ala', 'Sarirejo',    2026),
  ('Ahe', 'Krajankulon', 2024), ('Ahe', 'Krajankulon', 2025), ('Ahe', 'Krajankulon', 2026),
  ('Ahe', 'Sarirejo',    2024), ('Ahe', 'Sarirejo',    2025),
  ('Ahe', 'Magelung',    2024), ('Ahe', 'Magelung',    2025),
  ('Aga', 'Sarirejo',    2024), ('Aga', 'Sarirejo',    2025),
  ('Ala', 'Plantaran',   2024), ('Ala', 'Plantaran',   2025),
  ('Ala', 'Krajankulon', 2024), ('Ala', 'Krajankulon', 2025)
) AS d(nama_lisensi, nama_unit, tahun)
JOIN public.units   u ON lower(trim(u.nama)) = lower(d.nama_unit)
JOIN public.lisensi l ON l.nama_lisensi = d.nama_lisensi AND l.unit_id = u.id
ON CONFLICT (lisensi_id, tahun) DO NOTHING;


-- ============================================================
-- 4. CEK HASIL IMPORT (jalankan dan lihat hasilnya)
-- ============================================================
-- Harusnya: 9 baris lisensi, 22 baris riwayat perpanjangan.
SELECT
  (SELECT count(*) FROM public.lisensi)              AS jumlah_lisensi,
  (SELECT count(*) FROM public.lisensi_perpanjangan) AS jumlah_riwayat;

-- Tampilan lengkap hasil hitungan robot:
SELECT nama_lisensi, nama_unit, tgl_jatuh_tempo, tahun_target,
       jatuh_tempo_berikutnya, sisa_hari, sudah_perpanjang_tahun_target
FROM public.v_lisensi_status
ORDER BY jatuh_tempo_berikutnya;
