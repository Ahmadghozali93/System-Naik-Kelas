-- ============================================================
-- IZIN & ABSENSI — TAHAP 1
-- Jalankan di Supabase SQL Editor. Aman diulang.
--
-- MASALAH YANG DISELESAIKAN:
-- Fungsi penanda mangkir tiap malam hanya memeriksa hari libur. Guru
-- yang cuti/sakitnya SUDAH DISETUJUI tetap ditandai 'Alpha' (mangkir),
-- sehingga bonus kehadirannya hangus tanpa alasan.
--
-- SETELAH INI:
--   Shift terjadwal tanpa absensi
--     → hari libur?          → dilewati
--     → ada izin disetujui?  → Cuti / Sakit / Izin / Izin Tanpa Pengganti
--     → selain itu           → Alpha
--
-- AMAN: hanya menambah 1 kolom & memperbarui 1 fungsi.
-- Tidak ada tabel/kolom yang dihapus.
-- ============================================================

-- ============================================================
-- 1. Jenis izin (khusus jenis = 'Izin')
-- ============================================================
ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS sub_jenis TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.leave_requests'::regclass
      AND conname  = 'leave_requests_sub_jenis_check'
  ) THEN
    ALTER TABLE public.leave_requests
      ADD CONSTRAINT leave_requests_sub_jenis_check
      CHECK (sub_jenis IS NULL OR sub_jenis IN ('tukar_shift','ganti_hari','tanpa_pengganti'));
  END IF;
END $$;

COMMENT ON COLUMN public.leave_requests.sub_jenis IS
  'Hanya untuk jenis = Izin. tukar_shift / ganti_hari / tanpa_pengganti. '
  'Cuti & Sakit dibiarkan NULL.';


-- ============================================================
-- 2. Penerjemah: dari pengajuan izin → status absensi
--    Dipakai penanda mangkir DAN pembetulan otomatis.
--
--    Catatan Tahap 1: 'tukar_shift' masih menghasilkan 'Izin'.
--    Di Tahap 2 (mekanisme tukar & jadwal titipan) ini berubah jadi
--    "jadwal dialihkan" — tanpa catatan absensi sama sekali.
-- ============================================================
CREATE OR REPLACE FUNCTION public.status_absensi_dari_izin(
  p_jenis TEXT, p_sub_jenis TEXT
) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_jenis = 'Cuti'  THEN 'Cuti'
    WHEN p_jenis = 'Sakit' THEN 'Sakit'
    WHEN p_jenis = 'Izin'  THEN
      CASE WHEN p_sub_jenis = 'tanpa_pengganti'
           THEN 'Izin Tanpa Pengganti'
           ELSE 'Izin' END
    ELSE 'Izin'
  END;
$$;


-- ============================================================
-- 3. Cari izin yang berlaku untuk seorang guru di tanggal tertentu
--    Kalau ada beberapa, yang diajukan paling akhir yang dipakai.
-- ============================================================
CREATE OR REPLACE FUNCTION public.izin_berlaku(p_guru_id TEXT, p_tanggal DATE)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.status_absensi_dari_izin(lr.jenis, lr.sub_jenis)
  FROM leave_requests lr
  WHERE lr.guru_id = p_guru_id
    AND lr.status  = 'Approved'
    AND p_tanggal BETWEEN lr.tanggal_mulai AND lr.tanggal_selesai
  ORDER BY lr.created_at DESC
  LIMIT 1;
$$;


-- ============================================================
-- 4. PENANDA MANGKIR — versi yang sudah melihat izin
-- ============================================================
CREATE OR REPLACE FUNCTION public.mark_alpha_attendance()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  INSERT INTO public.attendances (guru_id, unit_id, shift_schedule_id, tanggal, status)
  SELECT
    ss.guru_id,
    sh.unit_id,
    ss.id,
    ss.tanggal,
    -- Ada izin disetujui? pakai statusnya. Kalau tidak ada → Alpha.
    COALESCE(public.izin_berlaku(ss.guru_id, ss.tanggal), 'Alpha')
  FROM public.shift_schedules ss
  JOIN public.shifts sh ON sh.id = ss.shift_id
  WHERE ss.tanggal < CURRENT_DATE
    AND NOT EXISTS (
      SELECT 1 FROM public.attendances a WHERE a.shift_schedule_id = ss.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.hari_libur hl
      WHERE hl.tanggal = ss.tanggal
        AND (hl.unit_id IS NULL OR hl.unit_id = sh.unit_id)
    )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

GRANT EXECUTE ON FUNCTION public.mark_alpha_attendance()             TO authenticated;
GRANT EXECUTE ON FUNCTION public.izin_berlaku(TEXT, DATE)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.status_absensi_dari_izin(TEXT,TEXT) TO authenticated;


-- ============================================================
-- 5. PEMBETULAN OTOMATIS
--    Izin sering baru disetujui SETELAH tanggalnya lewat — saat itu
--    guru sudah terlanjur ditandai 'Alpha'. Trigger ini membetulkannya.
--
--    Pengaman:
--    • Hanya baris yang dibuat otomatis (belum pernah check-in)
--    • TIDAK menyentuh periode gaji yang sudah dikunci/dibayar
-- ============================================================
CREATE OR REPLACE FUNCTION public.sinkron_absensi_dari_izin()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Status persetujuan tidak berubah → tidak ada dampak
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Hanya bertindak kalau menyangkut 'Approved' (baru disetujui, atau
  -- persetujuannya dicabut). Pengajuan Pending/Rejected yang tidak pernah
  -- disetujui TIDAK boleh menyentuh absensi sama sekali.
  IF NEW.status <> 'Approved'
     AND (TG_OP = 'INSERT' OR OLD.status <> 'Approved') THEN
    RETURN NEW;
  END IF;

  -- Hitung ulang status dari izin yang BERLAKU pada tiap tanggal.
  -- Cara ini benar untuk dua arah sekaligus:
  --   • baru disetujui        → memakai status izin ini
  --   • persetujuan dicabut   → memakai izin lain bila ada, kalau tidak → Alpha
  UPDATE public.attendances a
     SET status = COALESCE(public.izin_berlaku(a.guru_id, a.tanggal), 'Alpha')
   WHERE a.guru_id = NEW.guru_id
     AND a.tanggal BETWEEN NEW.tanggal_mulai AND NEW.tanggal_selesai
     AND a.check_in IS NULL                  -- hanya baris otomatis, jangan sentuh yang sudah check-in
     AND a.status IS DISTINCT FROM COALESCE(public.izin_berlaku(a.guru_id, a.tanggal), 'Alpha')
     AND NOT EXISTS (                        -- lewati periode gaji yang sudah dikunci
       SELECT 1 FROM public.periode_payroll pp
       WHERE pp.unit_id = a.unit_id
         AND pp.tahun   = EXTRACT(YEAR  FROM a.tanggal)
         AND pp.bulan   = EXTRACT(MONTH FROM a.tanggal)
         AND pp.status IN ('terkunci','dibayar')
     );

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sinkron_absensi_izin ON public.leave_requests;
CREATE TRIGGER trg_sinkron_absensi_izin
  AFTER INSERT OR UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.sinkron_absensi_dari_izin();


-- ============================================================
-- 6. PEMBETULAN DATA LAMA (jalankan sekali, opsional)
--    Membetulkan guru yang terlanjur 'Alpha' padahal izinnya disetujui.
--    Periode gaji yang sudah dikunci tidak disentuh.
--
--    Lihat dulu apa yang akan berubah:
-- ============================================================
SELECT g.nama, a.tanggal, a.status AS status_sekarang,
       public.izin_berlaku(a.guru_id, a.tanggal) AS akan_jadi
FROM public.attendances a
JOIN public.gurus g ON g.id = a.guru_id
WHERE a.status = 'Alpha'
  AND a.check_in IS NULL
  AND public.izin_berlaku(a.guru_id, a.tanggal) IS NOT NULL
ORDER BY a.tanggal DESC;

-- Kalau daftar di atas sudah benar, buka komentar di bawah lalu jalankan:
-- UPDATE public.attendances a
--    SET status = public.izin_berlaku(a.guru_id, a.tanggal)
--  WHERE a.status = 'Alpha'
--    AND a.check_in IS NULL
--    AND public.izin_berlaku(a.guru_id, a.tanggal) IS NOT NULL
--    AND NOT EXISTS (
--      SELECT 1 FROM public.periode_payroll pp
--      WHERE pp.unit_id = a.unit_id
--        AND pp.tahun   = EXTRACT(YEAR  FROM a.tanggal)
--        AND pp.bulan   = EXTRACT(MONTH FROM a.tanggal)
--        AND pp.status IN ('terkunci','dibayar')
--    );

-- ============================================================
-- SELESAI TAHAP 1.
-- Tahap 2 (tukar shift, ganti hari, jadwal titipan) menyusul.
-- ============================================================
