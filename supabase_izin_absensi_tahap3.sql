-- ============================================================
-- IZIN & ABSENSI — TAHAP 3
-- Atur ulang shift oleh SPV + status "Menunggu Penyesuaian Shift".
--
-- Jalankan SETELAH Tahap 1 & 2. Aman diulang.
--
-- SITUASI: guru mau izin PAGI saja, tapi shift terjadwalnya "Pagi-Siang"
-- (satu blok besar). Dia minta SPV memecah/mengganti shift itu KHUSUS di
-- tanggal tersebut, tanpa mengubah master shift yang dipakai hari lain.
--
-- PRINSIP (sesuai keputusan pemilik):
--   • Master shift TIDAK diubah — hanya boleh DITAMBAH shift baru.
--   • Yang dibongkar hanya JADWAL di tanggal yang diminta.
--   • Kalau tanggal itu sudah ada absensi, penataan ulang DITOLAK.
-- ============================================================

-- ============================================================
-- 1. Status baru pada pengajuan izin (kolom status = teks bebas,
--    jadi cukup dipakai — tidak ada constraint yang menghalangi)
--    Nilai baru: 'Menunggu Penyesuaian Shift', 'Kedaluwarsa'
-- ============================================================

-- ============================================================
-- 2. TABEL PERMINTAAN PENYESUAIAN SHIFT
-- ============================================================
CREATE TABLE IF NOT EXISTS public.penyesuaian_shift (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guru_id           TEXT NOT NULL REFERENCES public.gurus(id) ON DELETE CASCADE,
  unit_id           TEXT REFERENCES public.units(id),
  shift_schedule_id UUID REFERENCES public.shift_schedules(id) ON DELETE SET NULL, -- shift asal yg mau ditata ulang
  tanggal           DATE NOT NULL,
  keterangan        TEXT NOT NULL,                 -- apa yang diinginkan guru
  status            TEXT NOT NULL DEFAULT 'Menunggu'
                    CHECK (status IN ('Menunggu','Selesai','Ditolak')),
  catatan_spv       TEXT,
  ditangani_oleh    TEXT REFERENCES public.gurus(id),
  leave_request_id  UUID REFERENCES public.leave_requests(id) ON DELETE SET NULL,
  dibuat_pada       TIMESTAMPTZ NOT NULL DEFAULT now(),
  diubah_pada       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_penyesuaian_status  ON public.penyesuaian_shift(status);
CREATE INDEX IF NOT EXISTS idx_penyesuaian_tanggal ON public.penyesuaian_shift(tanggal);

ALTER TABLE public.penyesuaian_shift ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ps_select" ON public.penyesuaian_shift;
DROP POLICY IF EXISTS "ps_insert" ON public.penyesuaian_shift;
DROP POLICY IF EXISTS "ps_update" ON public.penyesuaian_shift;
DROP POLICY IF EXISTS "ps_delete" ON public.penyesuaian_shift;

CREATE POLICY "ps_select" ON public.penyesuaian_shift FOR SELECT
  USING (guru_id = absensi_guru_id() OR absensi_is_admin());
CREATE POLICY "ps_insert" ON public.penyesuaian_shift FOR INSERT
  WITH CHECK (guru_id = absensi_guru_id());
CREATE POLICY "ps_update" ON public.penyesuaian_shift FOR UPDATE
  USING (absensi_is_admin());               -- hanya SPV/admin yang menangani
CREATE POLICY "ps_delete" ON public.penyesuaian_shift FOR DELETE
  USING (guru_id = absensi_guru_id() OR absensi_is_admin());

DROP TRIGGER IF EXISTS trg_penyesuaian_diubah ON public.penyesuaian_shift;
CREATE TRIGGER trg_penyesuaian_diubah
  BEFORE UPDATE ON public.penyesuaian_shift
  FOR EACH ROW EXECUTE FUNCTION public.set_diubah_pada();


-- ============================================================
-- 3. TERAPKAN PENATAAN ULANG (server-side, aman)
--    p_id       : permintaan penyesuaian
--    p_shift_ids: daftar shift PENGGANTI (dari master) untuk tanggal itu
--
--    Yang terjadi:
--    • Cek: tanggal itu belum ada absensi pada shift asal
--    • Hapus jadwal shift asal di tanggal itu
--    • Buat jadwal baru untuk tiap shift pengganti
--    • Tandai permintaan 'Selesai'
-- ============================================================
CREATE OR REPLACE FUNCTION public.terapkan_penyesuaian_shift(
  p_id UUID, p_shift_ids UUID[]
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v    penyesuaian_shift%ROWTYPE;
  v_ss shift_schedules%ROWTYPE;
  sid  UUID;
  v_n  INT := 0;
BEGIN
  IF NOT public.absensi_is_admin() THEN
    RAISE EXCEPTION 'Hanya SPV/admin yang boleh menata ulang shift.';
  END IF;

  SELECT * INTO v FROM penyesuaian_shift WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Permintaan tidak ditemukan.'; END IF;
  IF v.status <> 'Menunggu' THEN
    RAISE EXCEPTION 'Permintaan ini sudah %.', v.status;
  END IF;
  IF array_length(p_shift_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Pilih minimal satu shift pengganti.';
  END IF;

  -- Jadwal asal (kalau masih ada)
  IF v.shift_schedule_id IS NOT NULL THEN
    SELECT * INTO v_ss FROM shift_schedules WHERE id = v.shift_schedule_id;

    IF FOUND THEN
      -- PENGAMAN: tolak kalau tanggal itu sudah ada absensinya
      IF EXISTS (SELECT 1 FROM attendances a WHERE a.shift_schedule_id = v_ss.id) THEN
        RAISE EXCEPTION 'Tanggal ini sudah ada catatan absensi pada shift tersebut. Betulkan lewat Koreksi Absen dulu.';
      END IF;
      -- Tolak kalau shift asal sedang dialihkan/titipan (bagian dari tukar shift)
      IF v_ss.dialihkan OR v_ss.titipan_dari IS NOT NULL THEN
        RAISE EXCEPTION 'Shift ini sedang dipakai tukar shift. Selesaikan/cabut izinnya dulu.';
      END IF;

      DELETE FROM shift_schedules WHERE id = v_ss.id;
    END IF;
  END IF;

  -- Buat jadwal baru untuk tiap shift pengganti di tanggal yang sama
  FOREACH sid IN ARRAY p_shift_ids LOOP
    INSERT INTO shift_schedules (guru_id, shift_id, tanggal, catatan)
    VALUES (v.guru_id, sid, v.tanggal, 'Hasil penyesuaian shift')
    ON CONFLICT (guru_id, shift_id, tanggal) DO NOTHING;
    v_n := v_n + 1;
  END LOOP;

  UPDATE penyesuaian_shift
     SET status = 'Selesai', ditangani_oleh = public.absensi_guru_id()
   WHERE id = p_id;

  RETURN 'Selesai: ' || v_n || ' shift dijadwalkan untuk ' || v.tanggal;
END $$;

GRANT EXECUTE ON FUNCTION public.terapkan_penyesuaian_shift(UUID, UUID[]) TO authenticated;


-- ============================================================
-- 4. TANDAI KEDALUWARSA
--    Izin & permintaan penyesuaian yang tanggalnya sudah lewat tapi
--    belum sempat ditangani → ditandai supaya tidak menggantung.
--    Panggil dari jadwal harian (sama seperti mark_alpha).
-- ============================================================
CREATE OR REPLACE FUNCTION public.tandai_penyesuaian_kedaluwarsa()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE penyesuaian_shift
     SET status = 'Ditolak',
         catatan_spv = COALESCE(catatan_spv,'') || ' [otomatis: tanggal sudah lewat sebelum ditangani]'
   WHERE status = 'Menunggu' AND tanggal < CURRENT_DATE;
  GET DIAGNOSTICS n = ROW_COUNT;

  UPDATE leave_requests
     SET status = 'Kedaluwarsa'
   WHERE status = 'Menunggu Penyesuaian Shift' AND tanggal_selesai < CURRENT_DATE;

  RETURN n;
END $$;

GRANT EXECUTE ON FUNCTION public.tandai_penyesuaian_kedaluwarsa() TO authenticated;

-- ============================================================
-- SELESAI TAHAP 3.
-- Aktifkan menu "Absensi - Penyesuaian Shift" di Setup Hak Akses.
-- (Opsional) jadwalkan tandai_penyesuaian_kedaluwarsa() harian via pg_cron.
-- ============================================================
