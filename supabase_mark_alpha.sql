-- ============================================================
-- Otomatis tandai karyawan yg tidak absen sebagai 'Alpha' (Mangkir)
-- Jalankan sekali di Supabase SQL Editor
-- ============================================================

-- 1. Buat function
CREATE OR REPLACE FUNCTION mark_alpha_attendance()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  n integer;
BEGIN
  INSERT INTO public.attendances (guru_id, unit_id, shift_schedule_id, tanggal, status)
  SELECT
    ss.guru_id,
    sh.unit_id,
    ss.id        AS shift_schedule_id,
    ss.tanggal,
    'Alpha'      AS status
  FROM public.shift_schedules ss
  JOIN public.shifts sh ON sh.id = ss.shift_id
  WHERE ss.tanggal < CURRENT_DATE        -- hari kemarin ke belakang saja
    AND NOT EXISTS (                     -- belum ada record absensi apapun
      SELECT 1 FROM public.attendances a
      WHERE a.shift_schedule_id = ss.id
    )
    AND NOT EXISTS (                     -- bukan hari libur unit tsb
      SELECT 1 FROM public.hari_libur hl
      WHERE hl.tanggal = ss.tanggal
        AND (hl.unit_id IS NULL OR hl.unit_id = sh.unit_id)
    )
  ON CONFLICT DO NOTHING;               -- aman jika dipanggil berkali-kali

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- 2. Izinkan anon/authenticated memanggil function ini
GRANT EXECUTE ON FUNCTION mark_alpha_attendance() TO authenticated;

-- 3. Jadwalkan otomatis setiap hari jam 23:30 WIB (= 16:30 UTC)
--    Pastikan ekstensi pg_cron sudah aktif di Supabase Dashboard > Database > Extensions
SELECT cron.schedule(
  'mark-alpha-daily',
  '30 16 * * *',
  'SELECT mark_alpha_attendance()'
);
