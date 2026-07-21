-- ============================================================
-- FITUR APPOINTMENT (Trial Class) — System Naik Kelas
-- FASE 1: Database
-- Jalankan di Supabase SQL Editor. Aman diulang.
--
-- AMAN: hanya menambah 1 tabel baru + 1 fungsi + 1 trigger.
-- TIDAK mengubah/menghapus tabel yang sudah ada.
--
-- Hasil inspeksi yang dipakai (bukan tebakan):
--   • "Booking"      = tabel `siswa` dengan status = 'Booking'  → PK: siswa.id (TEXT)
--   • "Jadwal Kosong"= tabel `jadwal_master` yang sisa kuotanya > 0 → PK: id (UUID)
--   • "Cabang"       = kolom `unit` (TEXT) seperti di siswa & jadwal_master
--   • RLS            = pola existing (authenticated baca semua, tulis admin)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.appointment (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Cabang. Mengikuti pola siswa/jadwal_master: nama unit disimpan sebagai TEXT.
  unit        TEXT NOT NULL,

  -- Pemesan: baris siswa berstatus 'Booking' (PK-nya TEXT, bukan uuid)
  siswa_id    TEXT NOT NULL REFERENCES public.siswa(id) ON DELETE CASCADE,

  -- Slot: jadwal rutin dari jadwal_master (hari + jam + kuota)
  jadwal_id   UUID NOT NULL REFERENCES public.jadwal_master(id) ON DELETE RESTRICT,

  -- Tanggal trial yang dituju (jadwal_master hanya menyimpan "hari", bukan tanggal)
  tanggal     DATE NOT NULL,

  jenis       TEXT NOT NULL DEFAULT 'trial'
              CHECK (jenis IN ('trial','konsultasi','lainnya')),
  status      TEXT NOT NULL DEFAULT 'dijadwalkan'
              CHECK (status IN ('dijadwalkan','hadir','batal','selesai')),
  catatan     TEXT,

  -- Pembuat. Pola project: TEXT ref gurus(id) (bukan uuid ref auth.users)
  dibuat_oleh TEXT REFERENCES public.gurus(id) ON DELETE SET NULL,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointment_jadwal  ON public.appointment(jadwal_id, tanggal);
CREATE INDEX IF NOT EXISTS idx_appointment_siswa   ON public.appointment(siswa_id);
CREATE INDEX IF NOT EXISTS idx_appointment_unit    ON public.appointment(unit);
CREATE INDEX IF NOT EXISTS idx_appointment_tanggal ON public.appointment(tanggal);

-- ── Cegah pemesan yang sama didaftarkan 2x di jadwal & tanggal yang sama ──
--    Hanya berlaku untuk appointment AKTIF; kalau dibatalkan, boleh daftar lagi.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_appointment_aktif
  ON public.appointment (siswa_id, jadwal_id, tanggal)
  WHERE status <> 'batal';

-- ============================================================
-- Anti over-booking berbasis KUOTA jadwal
-- Kapasitas pada suatu tanggal =
--   kuota jadwal − siswa rutin aktif − appointment aktif di tanggal itu
-- ============================================================
CREATE OR REPLACE FUNCTION public.appointment_cek_kuota()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kuota INT;
  v_rutin INT;
  v_appt  INT;
BEGIN
  -- Appointment yang dibatalkan tidak memakai kuota
  IF NEW.status = 'batal' THEN
    RETURN NEW;
  END IF;

  SELECT kuota INTO v_kuota FROM jadwal_master WHERE id = NEW.jadwal_id;
  IF v_kuota IS NULL THEN
    RAISE EXCEPTION 'Jadwal tidak ditemukan.';
  END IF;

  -- Siswa rutin yang sudah mengisi jadwal ini
  SELECT COUNT(*) INTO v_rutin
  FROM aktivasi_siswa
  WHERE jadwal_id = NEW.jadwal_id AND status = 'Aktif';

  -- Appointment aktif lain di jadwal & tanggal yang sama (kecuali baris ini sendiri)
  SELECT COUNT(*) INTO v_appt
  FROM appointment
  WHERE jadwal_id = NEW.jadwal_id
    AND tanggal   = NEW.tanggal
    AND status   <> 'batal'
    AND id       <> NEW.id;

  IF (v_rutin + v_appt) >= v_kuota THEN
    RAISE EXCEPTION 'Slot sudah dibooking, pilih slot lain.';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_appointment_cek_kuota ON public.appointment;
CREATE TRIGGER trg_appointment_cek_kuota
  BEFORE INSERT OR UPDATE ON public.appointment
  FOR EACH ROW EXECUTE FUNCTION public.appointment_cek_kuota();

-- ── Trigger updated_at (memakai fungsi yang sudah ada di project) ──
DROP TRIGGER IF EXISTS trg_appointment_updated_at ON public.appointment;
CREATE TRIGGER trg_appointment_updated_at
  BEFORE UPDATE ON public.appointment
  FOR EACH ROW EXECUTE PROCEDURE public.update_modified_column();

-- ============================================================
-- RLS — MIRROR pola tabel siswa (Booking) & jadwal_master (Jadwal Kosong):
-- semua user login boleh baca & catat; hapus hanya admin.
-- ============================================================
ALTER TABLE public.appointment ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS appointment_select ON public.appointment;
DROP POLICY IF EXISTS appointment_insert ON public.appointment;
DROP POLICY IF EXISTS appointment_update ON public.appointment;
DROP POLICY IF EXISTS appointment_delete ON public.appointment;

CREATE POLICY appointment_select ON public.appointment
  FOR SELECT TO authenticated USING (true);

CREATE POLICY appointment_insert ON public.appointment
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY appointment_update ON public.appointment
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY appointment_delete ON public.appointment
  FOR DELETE TO authenticated USING (public.is_admin());

-- ============================================================
-- SELESAI FASE 1.
-- Catatan: status slot ("Kosong"/"Terisi") TIDAK disimpan sebagai kolom —
-- akan diturunkan lewat JOIN di Fase 2 agar selalu sinkron.
-- ============================================================
