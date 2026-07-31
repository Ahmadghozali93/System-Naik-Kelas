-- ============================================================
-- 0023  Menghapus shift asal pengaju izin tidak lagi merusak diam-diam
--
-- Lanjutan 0022. Di sana yang diperbaiki sisi shift LAWAN tukar — yang
-- gagal terang-terangan. Yang ini sisi sebaliknya: shift ASAL pengaju.
-- Penghapusannya justru selalu berhasil, dan itulah masalahnya.
--
-- Sebab: dua rujukan ke rincian izin dibuat dengan sikap berlawanan.
--
--   izin_detail.shift_schedule_id  → shift_schedules  ON DELETE CASCADE
--   shift_schedules.izin_detail_id → izin_detail      ON DELETE SET NULL
--
-- Jadi menghapus shift asal ikut menghapus baris rincian izinnya, lalu
-- jadwal-jadwal yang lahir dari rincian itu ditinggalkan hidup tanpa
-- induk. Tiga kerusakan menyusul, semuanya tanpa satu pun pesan:
--
--   1. Jadwal titipan hasil tukar shift tetap berdiri di kalender guru
--      pengganti, padahal izin yang melahirkannya sudah tiada.
--   2. Shift lawan tukar tertinggal dengan dialihkan = true selamanya:
--      digembok di halaman check-in dan dilewati penanda mangkir, tanpa
--      rincian izin yang menjelaskan kenapa.
--   3. Kalau itu rincian terakhir milik pengajuan tersebut, pengajuannya
--      berubah makna. izin_berlaku_shift punya cabang ketiga untuk izin
--      lama Tahap 1 yang memang tidak punya rincian — izin sepanjang
--      rentang tanggal. Pengajuan per-shift yang kehilangan seluruh
--      rincian jatuh ke cabang itu, dan mendadak seluruh shift guru itu
--      pada rentang tanggalnya ikut berstatus Izin.
--
-- Kerusakan macam ini baru ketahuan berbulan-bulan kemudian, lewat
-- rekap absensi yang salah — bukan lewat keluhan saat menghapus.
--
-- Perbaikannya ada tiga bagian. Yang pertama menaruh pembongkaran pada
-- izin_detail, bukan pada shift_schedules: dengan begitu semua jalur
-- yang menghapus rincian — shift asalnya dihapus, atau pengajuannya
-- yang dihapus — sama-sama tertangani satu tempat.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Rincian izin dihapus → jadwal turunannya ikut dibongkar
--
--    Persis seperti yang terjadi saat persetujuan dicabut, termasuk
--    penjaganya: jadwal yang sudah dipakai check-in tidak boleh lenyap
--    begitu saja, sebab attendances.shift_schedule_id memakai SET NULL —
--    catatan absennya akan tinggal tanpa rujukan jadwal.
--
--    Membedakan mana yang turunan: jadwal asal yang ditinggalkan ditandai
--    dialihkan = true, sedangkan jadwal yang dilahirkan izin (titipan
--    tukar shift maupun jadwal ganti hari) tidak.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bongkar_jadwal_izin_detail()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_terpakai TEXT;
BEGIN
  SELECT string_agg(DISTINCT COALESCE(g.nama, ss.guru_id) ||
                    ' pada ' || to_char(ss.tanggal, 'DD-MM-YYYY'), '; ')
    INTO v_terpakai
  FROM public.shift_schedules ss
  JOIN public.attendances a ON a.shift_schedule_id = ss.id
  LEFT JOIN public.gurus g  ON g.id = ss.guru_id
  WHERE ss.izin_detail_id = OLD.id
    AND NOT ss.dialihkan
    AND a.check_in IS NOT NULL;

  IF v_terpakai IS NOT NULL THEN
    RAISE EXCEPTION
      'Tidak bisa dihapus: jadwal yang lahir dari izin ini sudah dipakai check-in oleh %. Perbaiki lewat menu Koreksi Absen dulu.',
      v_terpakai;
  END IF;

  -- Jadwal yang lahir dari rincian ini tidak punya alasan untuk tinggal
  DELETE FROM public.shift_schedules
   WHERE izin_detail_id = OLD.id AND NOT dialihkan;

  -- Jadwal asal yang ditinggalkan dikembalikan seperti sedia kala
  UPDATE public.shift_schedules
     SET dialihkan = false, izin_detail_id = NULL
   WHERE izin_detail_id = OLD.id AND dialihkan;

  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_bongkar_jadwal_izin_detail ON public.izin_detail;
CREATE TRIGGER trg_bongkar_jadwal_izin_detail
  BEFORE DELETE ON public.izin_detail
  FOR EACH ROW EXECUTE FUNCTION public.bongkar_jadwal_izin_detail();


-- ------------------------------------------------------------
-- 2. Penanda "pengajuan ini dirinci per shift"
--
--    Kerusakan ketiga tidak terjawab oleh pembongkaran di atas: setelah
--    jadwalnya rapi, pengajuannya sendiri masih berstatus Approved
--    dengan nol rincian — bentuk yang selama ini hanya dimiliki izin
--    lama Tahap 1, dan diperlakukan sebagai izin sepanjang rentang
--    tanggal.
--
--    "Punya rincian atau tidak" dipakai untuk membedakan keduanya, dan
--    itu keliru: ia menggambarkan keadaan sekarang, padahal yang perlu
--    diketahui adalah pengajuan ini DIBUAT sebagai apa. Maka niatnya
--    dicatat sekali, dan tidak ikut luntur saat rinciannya hilang.
-- ------------------------------------------------------------
ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS rincian_per_shift BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.leave_requests.rincian_per_shift IS
  'true = pengajuan Tahap 2 yang dirinci per shift lewat izin_detail. Tetap true '
  'walau rinciannya kemudian terhapus, supaya tidak salah dibaca sebagai izin '
  'lama Tahap 1 yang berlaku sepanjang rentang tanggal — lihat migrasi 0023.';

-- Pengajuan lama: yang sekarang punya rincian, memang dibuat berincian
UPDATE public.leave_requests lr
   SET rincian_per_shift = true
 WHERE NOT lr.rincian_per_shift
   AND EXISTS (SELECT 1 FROM public.izin_detail d WHERE d.leave_request_id = lr.id);

CREATE OR REPLACE FUNCTION public.tandai_izin_berincian()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.leave_requests
     SET rincian_per_shift = true
   WHERE id = NEW.leave_request_id
     AND NOT rincian_per_shift;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_tandai_izin_berincian ON public.izin_detail;
CREATE TRIGGER trg_tandai_izin_berincian
  AFTER INSERT ON public.izin_detail
  FOR EACH ROW EXECUTE FUNCTION public.tandai_izin_berincian();


-- ------------------------------------------------------------
-- 3. izin_berlaku_shift memakai penanda itu
--
--    Sama persis dengan versi di supabase_izin_absensi_tahap2.sql;
--    yang berubah hanya syarat cabang ketiga.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.izin_berlaku_shift(
  p_ss_id UUID, p_guru_id TEXT, p_tanggal DATE
) RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    -- 1. Rincian yang menunjuk PERSIS shift ini
    (SELECT CASE WHEN d.jenis = 'tanpa_pengganti'
                 THEN 'Izin Tanpa Pengganti' ELSE 'Izin' END
     FROM izin_detail d
     JOIN leave_requests lr ON lr.id = d.leave_request_id
     WHERE d.shift_schedule_id = p_ss_id AND lr.status = 'Approved'
     ORDER BY d.dibuat_pada DESC LIMIT 1),

    -- 2. Cuti / Sakit berbasis rentang tanggal
    (SELECT public.status_absensi_dari_izin(lr.jenis, lr.sub_jenis)
     FROM leave_requests lr
     WHERE lr.guru_id = p_guru_id AND lr.status = 'Approved'
       AND lr.jenis IN ('Cuti','Sakit')
       AND p_tanggal BETWEEN lr.tanggal_mulai AND lr.tanggal_selesai
     ORDER BY lr.created_at DESC LIMIT 1),

    -- 3. Izin lama Tahap 1 — yang memang tidak pernah dirinci per shift.
    --    Sebelumnya diuji dengan "tidak punya rincian", yang membuat
    --    pengajuan berincian yang rinciannya terhapus ikut tertarik ke
    --    sini dan berlaku sepanjang rentang tanggal.
    (SELECT public.status_absensi_dari_izin(lr.jenis, lr.sub_jenis)
     FROM leave_requests lr
     WHERE lr.guru_id = p_guru_id AND lr.status = 'Approved'
       AND NOT lr.rincian_per_shift
       AND p_tanggal BETWEEN lr.tanggal_mulai AND lr.tanggal_selesai
     ORDER BY lr.created_at DESC LIMIT 1)
  );
$$;

GRANT EXECUTE ON FUNCTION public.izin_berlaku_shift(UUID, TEXT, DATE) TO authenticated;
