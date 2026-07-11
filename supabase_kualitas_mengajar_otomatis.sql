-- ============================================================
-- Ubah indikator "Kualitas Mengajar" jadi OTOMATIS
-- Sumber nilai: Penilaian Mengajar (Approve = Sesuai Metode = skor penuh)
-- Jalankan di Supabase SQL Editor. Aman diulang.
-- ============================================================

-- 1. Perluas constraint source_field agar menerima 'kualitas_mengajar'
DO $$
DECLARE con TEXT;
BEGIN
  SELECT conname INTO con
  FROM pg_constraint
  WHERE conrelid = 'kpi_indicators'::regclass
    AND contype   = 'c'
    AND pg_get_constraintdef(oid) LIKE '%source_field%'
  LIMIT 1;
  IF con IS NOT NULL THEN
    EXECUTE 'ALTER TABLE kpi_indicators DROP CONSTRAINT ' || quote_ident(con);
  END IF;
END $$;

ALTER TABLE kpi_indicators
  ADD CONSTRAINT kpi_indicators_source_field_check
  CHECK (source_field IN ('komplain','keterlambatan','seragam','izin','kualitas_mengajar'));

-- 2. Set Kualitas Mengajar jadi Otomatis + sumbernya
UPDATE kpi_indicators
SET tipe         = 'Otomatis',
    source_field = 'kualitas_mengajar',
    deskripsi    = 'Otomatis dari Penilaian Mengajar: sudah Approve = Sesuai Metode (skor penuh), belum Approve = Tidak Sesuai'
WHERE id = 'a0000000-0000-0000-0000-000000000007';

-- Catatan:
-- - Penilaian KPI yang SUDAH ADA & belum final akan ikut menyesuaikan saat
--   dibuka / klik "Refresh Nilai Otomatis".
-- - Penilaian KPI baru langsung menghitung Kualitas Mengajar otomatis.
