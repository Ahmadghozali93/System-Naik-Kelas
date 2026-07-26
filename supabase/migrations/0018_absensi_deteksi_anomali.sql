-- ============================================================
-- 0018  Kunci lokasi absensi — deteksi anomali perpindahan
--
-- AMAN DIJALANKAN KAPAN SAJA. Migrasi ini hanya menambah satu view dan
-- satu fungsi baca; tidak menyentuh policy, tabel, maupun alur absensi.
-- Tidak ada guru yang bisa terkunci karenanya.
--
-- Sengaja dipisahkan dari pencabutan policy (migrasi 0019), karena dua
-- hal itu punya tingkat risiko yang sangat berbeda: yang satu cuma
-- laporan, yang satu bisa membuat seluruh guru gagal absen kalau salah
-- waktu. Menggabungkannya berarti laporan yang tidak berbahaya ikut
-- tersandera oleh pengaman milik perubahan yang berbahaya.
--
-- Justru selama fase 'senyap' inilah view ini paling berguna: lokasi
-- sudah direkam, tapi belum ada yang diblokir, sehingga pola aneh bisa
-- diamati tanpa seorang pun terganggu.
-- ============================================================


-- ------------------------------------------------------------
-- 1. View deteksi anomali
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
-- 2. Fungsi bantu untuk halaman verifikasi
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
