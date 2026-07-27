-- ============================================================
-- 0021  Perbaikan: approve izin gagal setelah periode jadi global
--
-- Gejala: menyetujui pengajuan izin gagal dengan
--   "column pp.unit_id does not exist"
--
-- Sebab: trigger sinkron_absensi_dari_izin (didefinisikan di
-- supabase_izin_absensi_tahap2.sql) menyentuh periode_payroll untuk
-- memastikan absensi pada periode gaji yang sudah dikunci tidak ikut
-- berubah. Pemeriksaannya mencocokkan pp.unit_id dengan cabang absensi
-- — kolom yang dibuang migrasi 0020.
--
-- Kenapa lolos dari penelusuran 0020: fungsi ini tinggal di berkas SQL
-- lepas di akar repo, bukan di supabase/migrations/, sehingga tidak
-- ikut tersapu saat memetakan rujukan ke periode_payroll.unit_id.
--
-- Perbaikannya sekaligus meluruskan maknanya: periode kini global, satu
-- per bulan untuk seluruh perusahaan, jadi memang tidak ada cabang yang
-- perlu dicocokkan. Pemeriksaan cukup memakai tahun & bulan.
--
-- Sisa berkas yang masih menyebut pp.unit_id — 0006, 0008, 0008a, dan
-- tahap1 — TIDAK perlu diperbaiki: policy 0006 sudah diganti di 0020,
-- 0008/0008a skrip migrasi sekali-jalan yang sudah lewat, dan fungsi
-- tahap1 sudah ditimpa oleh tahap2.
-- ============================================================

CREATE OR REPLACE FUNCTION public.sinkron_absensi_dari_izin()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF NEW.status <> 'Approved'
     AND (TG_OP = 'INSERT' OR OLD.status <> 'Approved') THEN
    RETURN NEW;
  END IF;

  UPDATE public.attendances a
     SET status = COALESCE(public.izin_berlaku_shift(a.shift_schedule_id, a.guru_id, a.tanggal), 'Alpha')
   WHERE a.guru_id = NEW.guru_id
     AND a.tanggal BETWEEN NEW.tanggal_mulai AND NEW.tanggal_selesai
     AND a.check_in IS NULL
     AND a.status IS DISTINCT FROM
         COALESCE(public.izin_berlaku_shift(a.shift_schedule_id, a.guru_id, a.tanggal), 'Alpha')
     -- Periode gaji yang sudah dikunci tidak boleh berubah lagi.
     -- Sejak 0020 periode bersifat GLOBAL — satu per bulan untuk seluruh
     -- perusahaan — jadi tidak ada lagi pencocokan cabang di sini.
     AND NOT EXISTS (
       SELECT 1 FROM public.periode_payroll pp
       WHERE pp.tahun = EXTRACT(YEAR  FROM a.tanggal)
         AND pp.bulan = EXTRACT(MONTH FROM a.tanggal)
         AND pp.status IN ('terkunci','dibayar')
     );

  RETURN NEW;
END $$;

-- Trigger-nya dibuat di supabase_izin_absensi_tahap1.sql dan tidak pernah
-- dibuat ulang di tahap2. CREATE OR REPLACE FUNCTION sebenarnya sudah
-- mempertahankan ikatannya, tapi dibuat ulang di sini supaya migrasi ini
-- berdiri sendiri dan tidak bergantung pada asumsi itu.
DROP TRIGGER IF EXISTS trg_sinkron_absensi_izin ON public.leave_requests;
CREATE TRIGGER trg_sinkron_absensi_izin
  AFTER INSERT OR UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.sinkron_absensi_dari_izin();
