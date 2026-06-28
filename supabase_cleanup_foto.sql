-- ============================================================
-- AUTO CLEANUP FOTO ABSEN > 14 HARI
-- Jalankan file ini SEKALI di Supabase SQL Editor
-- ============================================================

-- LANGKAH 1: Aktifkan pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;


-- LANGKAH 2: Buat fungsi cleanup
CREATE OR REPLACE FUNCTION hapus_foto_absen_kadaluarsa()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_foto_deleted  INT := 0;
  v_att_updated   INT;
BEGIN
  DELETE FROM storage.objects
  WHERE bucket_id = 'absensi-foto'
    AND created_at < NOW() - INTERVAL '14 days';
  GET DIAGNOSTICS v_foto_deleted = ROW_COUNT;

  UPDATE attendances
  SET foto_checkin = NULL, foto_checkout = NULL
  WHERE tanggal < CURRENT_DATE - 14
    AND (foto_checkin IS NOT NULL OR foto_checkout IS NOT NULL);
  GET DIAGNOSTICS v_att_updated = ROW_COUNT;

  RETURN format('%s file dihapus, %s baris diperbarui.', v_foto_deleted, v_att_updated);
END;
$$;


-- LANGKAH 3: Jadwalkan cron (aman jika belum ada maupun sudah ada)
DO $$
BEGIN
  -- Hapus job lama jika ada, abaikan error jika belum ada
  BEGIN
    PERFORM cron.unschedule('hapus-foto-absen-kadaluarsa');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Daftarkan job baru: tiap hari 02:00 WIB = 19:00 UTC
  PERFORM cron.schedule(
    'hapus-foto-absen-kadaluarsa',
    '0 19 * * *',
    'SELECT hapus_foto_absen_kadaluarsa()'
  );
END;
$$;


-- Verifikasi job terdaftar:
SELECT jobid, jobname, schedule, command, active
FROM cron.job
WHERE jobname = 'hapus-foto-absen-kadaluarsa';
