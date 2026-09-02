-- ============================================================
-- 0033  Laporan izin buta terhadap izin tanpa rincian
--
-- Lanjutan 0032, dari penelusuran yang sama.
--
-- v_izin_shift (supabase_izin_absensi_tahap2.sql) dibangun FROM
-- izin_detail. Izin yang tidak punya baris rincian karena itu mustahil
-- muncul di sana - tidak di Laporan Izin, tidak di kolom "Izin Diajukan"
-- pada Rekap Absensi, tidak di indikator KPI.
--
-- Padahal bentuk itu masih resmi didukung di sisi lain. izin_berlaku_shift()
-- punya cabang ketiga khusus untuk izin lama Tahap 1 tanpa rincian
-- (0023), sehingga absensinya tetap ditandai 'Izin' dengan benar. Dua
-- sumber kebenaran yang tidak sinkron: kehadirannya betul, laporannya nol.
--
-- Sejak 0032 ada satu golongan lagi yang jatuh ke lubang yang sama: izin
-- yang rinciannya sudah terlanjur hilang (rincian_per_shift = true tapi
-- nol izin_detail). Tujuh pengajuan Agustus 2026 ada di golongan itu dan
-- selama ini tidak terlihat di mana pun.
--
-- Keduanya ditangani dengan satu cabang UNION: izin yang tidak punya
-- rincian sama sekali dihitung dari JADWAL SHIFT yang benar-benar dimiliki
-- guru itu sepanjang rentang tanggalnya - bukan dari jumlah hari kalender.
-- Dengan begitu semantik view tetap terjaga: satu baris = satu shift.
--
-- >> PERHATIAN: ini MENAIKKAN angka indikator KPI "Izin dalam 1 Bulan"
-- >> untuk sebagian guru, karena izin yang selama ini tak terhitung kini
-- >> ikut masuk. Tinjau ambang batas indikatornya di menu KPI > Master
-- >> Indikator setelah menjalankan file ini.
--
-- AMAN: hanya membaca. Tidak ada tabel/kolom yang diubah.
-- ============================================================

-- Dibuat ulang, bukan CREATE OR REPLACE, karena ada kolom baru di akhir.
DROP VIEW IF EXISTS public.v_izin_shift;

CREATE VIEW public.v_izin_shift
WITH (security_invoker = true) AS

-- 1. Izin yang dirinci per shift (Tahap 2) - sumber aslinya
SELECT
  d.id,
  lr.id       AS leave_request_id,
  lr.guru_id,
  lr.unit_id,
  lr.status,
  d.jenis,
  d.tanggal,
  d.tanggal_pengganti,
  d.guru_pengganti_id,
  lr.alasan,
  lr.created_at,
  true        AS dari_rincian
FROM public.izin_detail d
JOIN public.leave_requests lr ON lr.id = d.leave_request_id
WHERE lr.jenis = 'Izin'

UNION ALL

-- 2. Izin tanpa rincian sama sekali - baik bentuk lama Tahap 1 maupun
--    yang rinciannya hilang. Satu baris per shift yang dijadwalkan pada
--    rentang tanggalnya; jadwal yang dialihkan tidak dihitung karena
--    kelasnya tetap jalan lewat guru lain.
--
--    jenis diambil dari sub_jenis selama masih ada - untuk izin yang
--    kehilangan rinciannya, itu satu-satunya keterangan yang tersisa dan
--    masih akurat. Yang benar-benar kosong ditandai 'tanpa_rincian'
--    supaya tidak menyamar jadi kategori yang bukan haknya.
SELECT
  md5(lr.id::text || ss.id::text)::uuid AS id,
  lr.id       AS leave_request_id,
  lr.guru_id,
  lr.unit_id,
  lr.status,
  COALESCE(lr.sub_jenis, 'tanpa_rincian') AS jenis,
  ss.tanggal,
  NULL::date  AS tanggal_pengganti,
  NULL::text  AS guru_pengganti_id,
  lr.alasan,
  lr.created_at,
  false       AS dari_rincian
FROM public.leave_requests lr
JOIN public.shift_schedules ss
  ON  ss.guru_id = lr.guru_id
  AND ss.tanggal BETWEEN lr.tanggal_mulai AND lr.tanggal_selesai
  AND NOT ss.dialihkan
WHERE lr.jenis = 'Izin'
  AND NOT EXISTS (
    SELECT 1 FROM public.izin_detail d WHERE d.leave_request_id = lr.id
  );

GRANT SELECT ON public.v_izin_shift TO authenticated;

COMMENT ON VIEW public.v_izin_shift IS
  'Satu baris = satu shift yang diizinkan. Dipakai bersama oleh Laporan Izin, '
  'kolom "Izin Diajukan" di Rekap Absensi, dan indikator KPI supaya ketiganya '
  'memakai angka yang sama persis. Kolom dari_rincian = false menandai izin '
  'yang angkanya disimpulkan dari jadwal shift karena izin_detail-nya tidak '
  'ada - lihat migrasi 0033.';


-- ------------------------------------------------------------
-- Daftar pantau: izin yang rinciannya hilang
--
-- rincian_per_shift hanya bisa jadi true lewat trigger AFTER INSERT pada
-- izin_detail (0023), jadi true + nol rincian membuktikan rinciannya
-- pernah ada lalu terhapus. Selama ini korbannya tidak terlihat di mana
-- pun; sekarang bisa dipantau.
--
-- Kalau penjagaan di 0032 bekerja, isi view ini berhenti bertambah.
-- Itu sekaligus alat ukurnya.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_izin_rincian_hilang
WITH (security_invoker = true) AS
SELECT
  lr.id,
  lr.guru_id,
  g.nama AS nama_guru,
  lr.unit_id,
  lr.sub_jenis,
  lr.status,
  lr.tanggal_mulai,
  lr.tanggal_selesai,
  lr.alasan,
  lr.created_at,
  (SELECT count(*) FROM public.shift_schedules ss
    WHERE ss.guru_id = lr.guru_id
      AND ss.tanggal BETWEEN lr.tanggal_mulai AND lr.tanggal_selesai
      AND NOT ss.dialihkan) AS shift_terhitung
FROM public.leave_requests lr
LEFT JOIN public.gurus g ON g.id = lr.guru_id
WHERE lr.jenis = 'Izin'
  AND lr.rincian_per_shift
  AND NOT EXISTS (
    SELECT 1 FROM public.izin_detail d WHERE d.leave_request_id = lr.id
  );

GRANT SELECT ON public.v_izin_rincian_hilang TO authenticated;

COMMENT ON VIEW public.v_izin_rincian_hilang IS
  'Izin yang rincian per shift-nya pernah ada lalu terhapus. Kolom '
  'shift_terhitung menunjukkan berapa shift yang kini disimpulkan untuknya '
  'oleh v_izin_shift. Lihat migrasi 0032 dan 0033.';
