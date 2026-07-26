-- ============================================================
-- 0018  Kunci lokasi absensi — Tahap 2: tutup celah bypass
--
-- Migrasi 0017 memindahkan penulisan absensi ke RPC, TAPI sengaja
-- membiarkan policy "att_insert_self" tetap hidup sebagai masa transisi.
-- Selama policy itu ada, seluruh validasi lokasi sebenarnya masih bisa
-- dilewati: siapa pun yang paham DevTools bisa menembakkan INSERT
-- langsung ke tabel attendances dari browser, lengkap dengan jam dan
-- status karangan sendiri. Migrasi ini yang benar-benar menutupnya.
--
-- ⚠️ JANGAN JALANKAN SEBELUM:
--   1. Frontend yang memakai RPC sudah tayang dan dipakai semua guru
--      minimal 3 hari (HP yang masih memegang bundel JS lama akan
--      langsung gagal absen setelah ini).
--   2. Kueri kesiapan di bawah mengembalikan 0 baris.
--
-- Migrasi ini MENOLAK BERJALAN SENDIRI kalau syarat itu belum terpenuhi
-- — lihat bagian 1. Itu disengaja: dijalankan terlalu dini, akibatnya
-- seluruh guru gagal absen pada jam masuk keesokan harinya.
--
-- CARA MEMBATALKAN (kalau ternyata ada masalah):
--   CREATE POLICY "att_insert_self" ON attendances FOR INSERT
--     WITH CHECK (guru_id = absensi_guru_id());
-- ============================================================


-- ------------------------------------------------------------
-- 1. Pengaman — pastikan sudah tidak ada yang memakai jalur lama
--
-- Absensi yang ditulis lewat RPC selalu mengisi status_lokasi selama
-- modenya bukan 'nonaktif'. Jadi baris dengan status_lokasi NULL pada
-- shift yang modenya aktif = ditulis lewat jalur langsung, artinya
-- masih ada HP yang memegang bundel JS lama.
-- ------------------------------------------------------------

DO $$
DECLARE
  v_sisa INT;
BEGIN
  SELECT COUNT(*) INTO v_sisa
  FROM public.attendances a
  JOIN public.shift_schedules ss ON ss.id = a.shift_schedule_id
  WHERE a.check_in >= now() - INTERVAL '3 days'
    AND a.status_lokasi IS NULL
    AND public.absensi_mode_efektif(ss.shift_id) <> 'nonaktif';

  IF v_sisa > 0 THEN
    RAISE EXCEPTION
      'Migrasi dibatalkan: masih ada % absensi 3 hari terakhir yang ditulis lewat jalur lama. Pastikan semua guru sudah memakai aplikasi versi terbaru dulu, atau jalankan kueri kesiapan di bagian 5 untuk melihat siapa saja.', v_sisa;
  END IF;
END $$;


-- ------------------------------------------------------------
-- 2. Cabut hak tulis langsung milik guru
--
-- Yang dicabut hanya jalur guru. Policy admin dibiarkan, karena SPV
-- tetap perlu bisa mengabsenkan manual — itu penyangga terakhir ketika
-- HP guru mati, hilang, atau rusak. Tanpa itu, mode 'blokir' berarti
-- guru yang HP-nya bermasalah tidak punya jalan sama sekali.
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "att_insert_self" ON public.attendances;

-- ⚠️ CELAH YANG BELUM TERTUTUP — perlu keputusan terpisah.
--
-- Policy "att_update" masih mengizinkan guru MENGUBAH baris absensinya
-- sendiri (guru_id = absensi_guru_id()). Setelah INSERT dikunci, di
-- sinilah celah berikutnya: lewat panggilan API langsung, guru bisa
-- mengubah status barisnya sendiri dari 'Telat' menjadi 'Hadir', atau
-- menggeser check_in. Ini bukan celah baru — sudah ada sejak awal —
-- tapi jadi lebih menonjol sekarang.
--
-- Policy itu SENGAJA TIDAK diubah di sini, karena menutupnya butuh
-- audit dulu terhadap semua jalur tulis admin yang ada (koreksi absen,
-- catatan di dashboard, verifikasi lokasi). Salah tutup, yang rusak
-- adalah pekerjaan SPV sehari-hari.
--
-- Cara menutupnya nanti: trigger BEFORE UPDATE yang menolak perubahan
-- pada kolom sensitif (check_in, check_out, status, status_lokasi,
-- jarak_*, lat_*, lng_*, lokasi_disetujui) ketika pemanggilnya bukan
-- admin. RPC absen_check_out perlu menandai dirinya sebagai jalur
-- tepercaya lewat SET LOCAL, karena SECURITY DEFINER tidak mengubah
-- auth.uid() sehingga trigger tetap melihatnya sebagai guru biasa.


-- ------------------------------------------------------------
-- 3. Deteksi anomali lokasi
--
-- Batas kejujuran yang perlu dinyatakan: aplikasi web TIDAK BISA
-- mendeteksi Fake GPS. Tidak ada API browser yang membedakan koordinat
-- palsu dari asli — itu butuh aplikasi native. Yang bisa dilakukan
-- hanya menaikkan risiko ketahuan.
--
-- View ini mencari perpindahan yang mustahil: dua titik absen milik
-- guru yang sama, berjauhan, dalam selisih waktu yang tidak masuk akal.
-- Guru yang check-out di cabang lalu 4 menit kemudian check-in 30 km
-- dari sana jelas ada yang tidak beres — entah GPS palsu, entah HP-nya
-- dipegang orang lain.
--
-- security_invoker: view ini ikut RLS tabel attendances, jadi SPV hanya
-- melihat cabang yang dikelolanya.
--
-- CATATAN: security_invoker butuh PostgreSQL 15 ke atas. Kalau baris
-- CREATE VIEW di bawah gagal dengan "unrecognized parameter", berarti
-- project ini masih PG14. Buang saja klausa WITH (security_invoker = on)
-- — tapi sadari konsekuensinya: tanpa itu view berjalan dengan hak
-- pemiliknya, sehingga SPV bisa melihat anomali dari SEMUA cabang,
-- bukan hanya cabangnya sendiri.
-- ------------------------------------------------------------

DROP VIEW IF EXISTS public.absensi_anomali_lokasi;

CREATE VIEW public.absensi_anomali_lokasi
WITH (security_invoker = on) AS
WITH titik AS (
  -- Check-in dan check-out diperlakukan sama: keduanya bukti "guru ada
  -- di sini pada jam sekian".
  SELECT a.id, a.guru_id, a.unit_id, a.tanggal,
         'checkin'::text AS jenis, a.check_in AS waktu,
         a.lat_checkin AS lat, a.lng_checkin AS lng
  FROM public.attendances a
  WHERE a.check_in IS NOT NULL AND a.lat_checkin IS NOT NULL
  UNION ALL
  SELECT a.id, a.guru_id, a.unit_id, a.tanggal,
         'checkout', a.check_out, a.lat_checkout, a.lng_checkout
  FROM public.attendances a
  WHERE a.check_out IS NOT NULL AND a.lat_checkout IS NOT NULL
),
berpasangan AS (
  SELECT t.*,
         LAG(waktu) OVER w AS waktu_sebelum,
         LAG(lat)   OVER w AS lat_sebelum,
         LAG(lng)   OVER w AS lng_sebelum,
         LAG(jenis) OVER w AS jenis_sebelum
  FROM titik t
  WINDOW w AS (PARTITION BY guru_id ORDER BY waktu)
)
SELECT
  b.id            AS attendance_id,
  b.guru_id,
  b.unit_id,
  b.tanggal,
  b.jenis,
  b.waktu,
  b.jenis_sebelum,
  b.waktu_sebelum,
  ROUND(public.absensi_jarak_meter(b.lat_sebelum, b.lng_sebelum, b.lat, b.lng)) AS jarak_m,
  ROUND(EXTRACT(EPOCH FROM (b.waktu - b.waktu_sebelum))/60)::int                AS selisih_menit,
  ROUND((
    public.absensi_jarak_meter(b.lat_sebelum, b.lng_sebelum, b.lat, b.lng) / 1000.0
  ) / GREATEST(EXTRACT(EPOCH FROM (b.waktu - b.waktu_sebelum))/3600.0, 0.0001))  AS kecepatan_kmh
FROM berpasangan b
WHERE b.waktu_sebelum IS NOT NULL
  -- Ambang sengaja longgar supaya tidak membanjiri SPV dengan kasus
  -- wajar. 2 km menyaring guru yang pindah cabang beneran; 120 km/jam
  -- tidak mungkin dicapai di jalanan kota dalam hitungan menit.
  AND public.absensi_jarak_meter(b.lat_sebelum, b.lng_sebelum, b.lat, b.lng) > 2000
  AND (
    public.absensi_jarak_meter(b.lat_sebelum, b.lng_sebelum, b.lat, b.lng) / 1000.0
  ) / GREATEST(EXTRACT(EPOCH FROM (b.waktu - b.waktu_sebelum))/3600.0, 0.0001) > 120;

GRANT SELECT ON public.absensi_anomali_lokasi TO authenticated;


-- ------------------------------------------------------------
-- 4. Fungsi bantu untuk halaman verifikasi
--
-- View di atas tidak bisa langsung di-JOIN ke gurus/units lewat
-- PostgREST, jadi disediakan RPC yang sudah lengkap dengan namanya.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.absensi_anomali(
  p_dari  DATE DEFAULT (now() AT TIME ZONE 'Asia/Jakarta')::date - 30,
  p_sampai DATE DEFAULT (now() AT TIME ZONE 'Asia/Jakarta')::date
) RETURNS TABLE (
  attendance_id UUID, tanggal DATE, guru_nama TEXT, unit_nama TEXT,
  jenis TEXT, waktu TIMESTAMPTZ, jenis_sebelum TEXT, waktu_sebelum TIMESTAMPTZ,
  jarak_m NUMERIC, selisih_menit INT, kecepatan_kmh NUMERIC
) LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public AS $$
  SELECT v.attendance_id, v.tanggal, g.nama, u.nama,
         v.jenis, v.waktu, v.jenis_sebelum, v.waktu_sebelum,
         v.jarak_m, v.selisih_menit, v.kecepatan_kmh
  FROM public.absensi_anomali_lokasi v
  LEFT JOIN public.gurus g ON g.id = v.guru_id
  LEFT JOIN public.units u ON u.id = v.unit_id
  WHERE v.tanggal BETWEEN p_dari AND p_sampai
  ORDER BY v.waktu DESC
  LIMIT 200;
$$;

GRANT EXECUTE ON FUNCTION public.absensi_anomali(DATE, DATE) TO authenticated;


-- ------------------------------------------------------------
-- 5. Kueri kesiapan & pemantauan
--
-- Jalankan SEBELUM migrasi ini, untuk melihat siapa yang masih memakai
-- jalur lama (harus kosong):
--
--   SELECT g.nama, COUNT(*) AS jumlah, MAX(a.check_in) AS terakhir
--   FROM attendances a
--   JOIN shift_schedules ss ON ss.id = a.shift_schedule_id
--   JOIN gurus g ON g.id = a.guru_id
--   WHERE a.check_in >= now() - INTERVAL '3 days'
--     AND a.status_lokasi IS NULL
--     AND absensi_mode_efektif(ss.shift_id) <> 'nonaktif'
--   GROUP BY g.nama ORDER BY jumlah DESC;
--
-- Kalau masih ada isinya, minta guru tersebut menutup penuh aplikasinya
-- lalu membukanya lagi (bundel lama tersangkut di service worker).
--
-- Kalibrasi radius sebelum menaikkan cabang ke 'blokir' — jangan pakai
-- rata-rata, pakai persentil, supaya satu pencilan tidak melebarkan
-- radius untuk semua orang:
--
--   SELECT u.nama,
--          COUNT(*) AS total,
--          ROUND(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY a.jarak_checkin_m)) AS p90_m,
--          ROUND(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY a.jarak_checkin_m)) AS p99_m,
--          MAX(a.jarak_checkin_m) AS terjauh_m
--   FROM attendances a JOIN units u ON u.id = a.unit_id
--   WHERE a.jarak_checkin_m IS NOT NULL
--     AND a.tanggal >= (now() AT TIME ZONE 'Asia/Jakarta')::date - 14
--   GROUP BY u.nama;
--
-- Patokan: setel radius di sekitar p99, dibulatkan ke atas. Kalau p99
-- sebuah cabang ternyata ribuan meter, itu bukan tanda radiusnya kurang
-- lebar — itu tanda memang ada yang absen dari rumah.
-- ------------------------------------------------------------
