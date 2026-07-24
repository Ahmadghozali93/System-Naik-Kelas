-- ============================================================
-- IZIN & ABSENSI — TAHAP 2
-- Tukar shift, ganti hari, jadwal titipan, pencatatan per shift.
--
-- Jalankan SETELAH supabase_izin_absensi_tahap1.sql. Aman diulang.
--
-- YANG DITAMBAHKAN:
--   • izin_detail — satu baris per shift (inilah yang membuat "tambah
--     baris" dan hitungan per shift jadi mungkin)
--   • Penanda pada jadwal shift: "dialihkan" & "titipan dari"
--   • Pemeriksaan bentrok 2 arah (shift sama + jam bertabrakan)
--   • Pembuatan jadwal otomatis saat izin disetujui, dan pembatalannya
--     saat persetujuan dicabut
--
-- AMAN: hanya menambah. Tidak ada tabel/kolom yang dihapus.
-- ============================================================

-- ============================================================
-- 1. RINCIAN IZIN — satu baris = satu shift
-- ============================================================
CREATE TABLE IF NOT EXISTS public.izin_detail (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_request_id  UUID NOT NULL REFERENCES public.leave_requests(id) ON DELETE CASCADE,

  -- Jenis dipilih PER BARIS, jadi satu pengajuan boleh campur
  jenis             TEXT NOT NULL CHECK (jenis IN ('tukar_shift','ganti_hari','tanpa_pengganti')),

  -- Shift yang ditinggalkan (milik pengaju)
  shift_schedule_id UUID NOT NULL REFERENCES public.shift_schedules(id) ON DELETE CASCADE,
  tanggal           DATE NOT NULL,          -- disalin dari jadwal, untuk memudahkan hitungan bulanan

  -- Khusus tukar_shift: shift milik guru lain yang diambil sebagai gantinya
  tukar_dengan_schedule_id UUID REFERENCES public.shift_schedules(id) ON DELETE SET NULL,
  guru_pengganti_id        TEXT REFERENCES public.gurus(id) ON DELETE SET NULL,

  -- Khusus ganti_hari: tanggal pengganti
  tanggal_pengganti DATE,

  catatan     TEXT,
  dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Kelengkapan data sesuai jenisnya
  CHECK (jenis <> 'tukar_shift' OR (tukar_dengan_schedule_id IS NOT NULL AND guru_pengganti_id IS NOT NULL)),
  CHECK (jenis <> 'ganti_hari'  OR tanggal_pengganti IS NOT NULL),
  -- Satu shift hanya boleh diurus sekali dalam satu pengajuan
  UNIQUE (leave_request_id, shift_schedule_id)
);

CREATE INDEX IF NOT EXISTS idx_izin_detail_req     ON public.izin_detail(leave_request_id);
CREATE INDEX IF NOT EXISTS idx_izin_detail_tanggal ON public.izin_detail(tanggal);

ALTER TABLE public.izin_detail ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "id_select" ON public.izin_detail;
DROP POLICY IF EXISTS "id_insert" ON public.izin_detail;
DROP POLICY IF EXISTS "id_update" ON public.izin_detail;
DROP POLICY IF EXISTS "id_delete" ON public.izin_detail;

-- Mengikuti aturan induknya (leave_requests)
CREATE POLICY "id_select" ON public.izin_detail FOR SELECT USING (
  EXISTS (SELECT 1 FROM leave_requests lr WHERE lr.id = leave_request_id
          AND (lr.guru_id = absensi_guru_id() OR absensi_is_admin()))
);
CREATE POLICY "id_insert" ON public.izin_detail FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM leave_requests lr WHERE lr.id = leave_request_id
          AND lr.guru_id = absensi_guru_id())
);
CREATE POLICY "id_update" ON public.izin_detail FOR UPDATE USING (absensi_is_admin());
CREATE POLICY "id_delete" ON public.izin_detail FOR DELETE USING (
  EXISTS (SELECT 1 FROM leave_requests lr WHERE lr.id = leave_request_id
          AND (lr.guru_id = absensi_guru_id() OR absensi_is_admin()))
);


-- ============================================================
-- 2. PENANDA PADA JADWAL SHIFT
--    dialihkan   : shift ditinggalkan karena tukar shift.
--                  Penanda mangkir MELEWATINYA (tidak ada catatan absensi),
--                  dan di halaman check-in shift ini digembok.
--    titipan_dari: jadwal ini titipan dari guru lain.
-- ============================================================
ALTER TABLE public.shift_schedules
  ADD COLUMN IF NOT EXISTS dialihkan      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS titipan_dari   TEXT REFERENCES public.gurus(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS izin_detail_id UUID REFERENCES public.izin_detail(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ss_izin_detail ON public.shift_schedules(izin_detail_id);


-- ============================================================
-- 3. PEMERIKSAAN BENTROK (2 jenis)
--    Jenis 1: shift yang sama persis di tanggal yang sama
--    Jenis 2: jam yang bertabrakan meski shift-nya berbeda
--             ← ini yang TIDAK tertangkap aturan database
--    Mengembalikan NULL kalau aman, atau pesan kalau bentrok.
-- ============================================================
CREATE OR REPLACE FUNCTION public.cek_bentrok_jadwal(
  p_guru_id TEXT, p_shift_id UUID, p_tanggal DATE
) RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_nama  TEXT;
  v_mulai TIME;
  v_akhir TIME;
  r       RECORD;
BEGIN
  SELECT nama, jam_mulai, jam_selesai INTO v_nama, v_mulai, v_akhir
  FROM shifts WHERE id = p_shift_id;
  IF NOT FOUND THEN RETURN 'Shift tidak ditemukan.'; END IF;

  -- Jenis 1 — shift yang sama persis
  IF EXISTS (
    SELECT 1 FROM shift_schedules ss
    WHERE ss.guru_id = p_guru_id AND ss.shift_id = p_shift_id
      AND ss.tanggal = p_tanggal AND NOT ss.dialihkan
  ) THEN
    RETURN 'Sudah punya ' || v_nama || ' pada tanggal tersebut.';
  END IF;

  -- Jenis 2 — jam bertabrakan dengan shift lain di tanggal yang sama
  FOR r IN
    SELECT s.nama, s.jam_mulai, s.jam_selesai
    FROM shift_schedules ss JOIN shifts s ON s.id = ss.shift_id
    WHERE ss.guru_id = p_guru_id AND ss.tanggal = p_tanggal
      AND ss.shift_id <> p_shift_id AND NOT ss.dialihkan
  LOOP
    -- Bertabrakan bila: mulai_A < selesai_B DAN mulai_B < selesai_A
    IF v_mulai < r.jam_selesai AND r.jam_mulai < v_akhir THEN
      RETURN 'Jam bertabrakan dengan ' || r.nama || ' ('
             || to_char(r.jam_mulai,'HH24:MI') || '–' || to_char(r.jam_selesai,'HH24:MI')
             || ') pada tanggal tersebut.';
    END IF;
  END LOOP;

  RETURN NULL;   -- aman
END $$;

GRANT EXECUTE ON FUNCTION public.cek_bentrok_jadwal(TEXT, UUID, DATE) TO authenticated;


-- ============================================================
-- 4. PEMBUATAN & PEMBATALAN JADWAL OTOMATIS
--
--    Saat izin DISETUJUI:
--      tukar_shift → buat 2 jadwal titipan (saling silang),
--                    tandai 2 jadwal asal sebagai "dialihkan"
--      ganti_hari  → buat 1 jadwal di tanggal pengganti.
--                    Jadwal asal TIDAK dialihkan, supaya tetap
--                    tercatat 'Izin' (guru memang tidak masuk hari itu)
--      tanpa_pengganti → tidak ada jadwal yang dibuat
--
--    Saat persetujuan DICABUT:
--      Jadwal titipan dihapus & penanda dialihkan dilepas —
--      TAPI ditolak bila jadwal titipan sudah dipakai check-in.
-- ============================================================
CREATE OR REPLACE FUNCTION public.terapkan_izin_ke_jadwal()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  d        RECORD;
  v_asal   RECORD;
  v_tujuan RECORD;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- ══ DISETUJUI → bangun jadwalnya ══
  IF NEW.status = 'Approved' THEN
    FOR d IN SELECT * FROM izin_detail WHERE leave_request_id = NEW.id LOOP

      SELECT ss.*, s.unit_id AS s_unit INTO v_asal
      FROM shift_schedules ss JOIN shifts s ON s.id = ss.shift_id
      WHERE ss.id = d.shift_schedule_id;
      CONTINUE WHEN NOT FOUND;

      IF d.jenis = 'tukar_shift' THEN
        SELECT ss.* INTO v_tujuan FROM shift_schedules ss
        WHERE ss.id = d.tukar_dengan_schedule_id;
        CONTINUE WHEN NOT FOUND;

        -- Pengaju mengambil shift guru pengganti
        INSERT INTO shift_schedules (guru_id, shift_id, tanggal, titipan_dari, izin_detail_id, catatan)
        VALUES (NEW.guru_id, v_tujuan.shift_id, v_tujuan.tanggal,
                v_tujuan.guru_id, d.id, 'Tukar shift')
        ON CONFLICT (guru_id, shift_id, tanggal) DO NOTHING;

        -- Guru pengganti mengambil shift pengaju
        INSERT INTO shift_schedules (guru_id, shift_id, tanggal, titipan_dari, izin_detail_id, catatan)
        VALUES (v_tujuan.guru_id, v_asal.shift_id, v_asal.tanggal,
                NEW.guru_id, d.id, 'Tukar shift')
        ON CONFLICT (guru_id, shift_id, tanggal) DO NOTHING;

        -- Dua jadwal asal ditinggalkan
        UPDATE shift_schedules SET dialihkan = true, izin_detail_id = d.id
         WHERE id IN (v_asal.id, v_tujuan.id);

      ELSIF d.jenis = 'ganti_hari' THEN
        -- Shift yang sama, tanggal berbeda. Jadwal asal dibiarkan
        -- supaya tetap tercatat 'Izin'.
        INSERT INTO shift_schedules (guru_id, shift_id, tanggal, izin_detail_id, catatan)
        VALUES (NEW.guru_id, v_asal.shift_id, d.tanggal_pengganti, d.id, 'Ganti hari')
        ON CONFLICT (guru_id, shift_id, tanggal) DO NOTHING;
      END IF;

    END LOOP;

  -- ══ PERSETUJUAN DICABUT → bongkar lagi ══
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'Approved' THEN

    -- Tolak kalau jadwal titipan sudah dipakai check-in
    IF EXISTS (
      SELECT 1 FROM shift_schedules ss
      JOIN izin_detail d ON d.id = ss.izin_detail_id
      JOIN attendances a ON a.shift_schedule_id = ss.id
      WHERE d.leave_request_id = NEW.id
        AND ss.titipan_dari IS NOT NULL
        AND a.check_in IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Tidak bisa dibatalkan: jadwal titipannya sudah dipakai check-in. Perbaiki lewat menu Koreksi Absen.';
    END IF;

    DELETE FROM shift_schedules ss
     USING izin_detail d
     WHERE d.id = ss.izin_detail_id
       AND d.leave_request_id = NEW.id
       AND ss.titipan_dari IS NOT NULL;

    UPDATE shift_schedules ss
       SET dialihkan = false, izin_detail_id = NULL
      FROM izin_detail d
     WHERE d.id = ss.izin_detail_id
       AND d.leave_request_id = NEW.id
       AND ss.dialihkan;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_terapkan_izin_jadwal ON public.leave_requests;
CREATE TRIGGER trg_terapkan_izin_jadwal
  AFTER UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.terapkan_izin_ke_jadwal();


-- ============================================================
-- 5. IZIN YANG BERLAKU — PER SHIFT (bukan per tanggal)
--
--    Ini penting: guru bisa punya 2 shift dalam sehari dan hanya
--    SATU yang diizinkan. Kalau memakai patokan tanggal saja, shift
--    yang lain ikut tertandai izin — padahal dia mestinya masuk.
--
--    Urutan pemeriksaan:
--      1. Rincian yang menunjuk PERSIS shift ini        (Tahap 2)
--      2. Cuti / Sakit berbasis rentang tanggal
--      3. Izin lama tanpa rincian                        (Tahap 1)
-- ============================================================
CREATE OR REPLACE FUNCTION public.izin_berlaku_shift(
  p_ss_id UUID, p_guru_id TEXT, p_tanggal DATE
) RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT CASE WHEN d.jenis = 'tanpa_pengganti'
                 THEN 'Izin Tanpa Pengganti' ELSE 'Izin' END
     FROM izin_detail d
     JOIN leave_requests lr ON lr.id = d.leave_request_id
     WHERE d.shift_schedule_id = p_ss_id AND lr.status = 'Approved'
     ORDER BY d.dibuat_pada DESC LIMIT 1),

    (SELECT public.status_absensi_dari_izin(lr.jenis, lr.sub_jenis)
     FROM leave_requests lr
     WHERE lr.guru_id = p_guru_id AND lr.status = 'Approved'
       AND lr.jenis IN ('Cuti','Sakit')
       AND p_tanggal BETWEEN lr.tanggal_mulai AND lr.tanggal_selesai
     ORDER BY lr.created_at DESC LIMIT 1),

    (SELECT public.status_absensi_dari_izin(lr.jenis, lr.sub_jenis)
     FROM leave_requests lr
     WHERE lr.guru_id = p_guru_id AND lr.status = 'Approved'
       AND NOT EXISTS (SELECT 1 FROM izin_detail d2 WHERE d2.leave_request_id = lr.id)
       AND p_tanggal BETWEEN lr.tanggal_mulai AND lr.tanggal_selesai
     ORDER BY lr.created_at DESC LIMIT 1)
  );
$$;

GRANT EXECUTE ON FUNCTION public.izin_berlaku_shift(UUID, TEXT, DATE) TO authenticated;


-- PENANDA MANGKIR — lewati jadwal yang dialihkan, cek izin per shift
CREATE OR REPLACE FUNCTION public.mark_alpha_attendance()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  INSERT INTO public.attendances (guru_id, unit_id, shift_schedule_id, tanggal, status)
  SELECT ss.guru_id, sh.unit_id, ss.id, ss.tanggal,
         COALESCE(public.izin_berlaku_shift(ss.id, ss.guru_id, ss.tanggal), 'Alpha')
  FROM public.shift_schedules ss
  JOIN public.shifts sh ON sh.id = ss.shift_id
  WHERE ss.tanggal < CURRENT_DATE
    AND NOT ss.dialihkan                     -- ← shift yang ditukar dilewati
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


-- PEMBETULAN OTOMATIS — versi per shift (menggantikan versi Tahap 1)
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
     AND NOT EXISTS (
       SELECT 1 FROM public.periode_payroll pp
       WHERE pp.unit_id = a.unit_id
         AND pp.tahun   = EXTRACT(YEAR  FROM a.tanggal)
         AND pp.bulan   = EXTRACT(MONTH FROM a.tanggal)
         AND pp.status IN ('terkunci','dibayar')
     );

  RETURN NEW;
END $$;


-- ============================================================
-- 6. SUMBER ANGKA LAPORAN & KPI
--    Satu baris = satu shift yang diizinkan.
--    Dipakai laporan, kolom Rekap, dan indikator KPI — supaya
--    ketiganya memakai angka yang sama persis.
-- ============================================================
CREATE OR REPLACE VIEW public.v_izin_shift
WITH (security_invoker = true) AS
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
  lr.created_at
FROM public.izin_detail d
JOIN public.leave_requests lr ON lr.id = d.leave_request_id
WHERE lr.jenis = 'Izin';

GRANT SELECT ON public.v_izin_shift TO authenticated;

-- ============================================================
-- SELESAI TAHAP 2.
--
-- Setelah menjalankan ini, jangan lupa:
-- 1. Longgarkan ambang batas indikator "Izin dalam 1 Bulan" di
--    menu KPI → Master Indikator, karena hitungannya kini PER SHIFT.
-- 2. Aktifkan menu "Laporan Izin per Shift" di Setup Hak Akses.
-- ============================================================
