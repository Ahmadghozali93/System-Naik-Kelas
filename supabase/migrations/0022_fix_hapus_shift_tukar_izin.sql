-- ============================================================
-- 0022  Perbaikan: hapus jadwal shift gagal karena izin tukar shift
--
-- Gejala: menghapus satu jadwal shift guru gagal dengan
--   new row for relation "izin_detail" violates check constraint
--   "izin_detail_check"
--
-- Sebab: izin_detail (supabase_izin_absensi_tahap2.sql) menyimpan dua
-- rujukan yang boleh hilang sendiri:
--
--   tukar_dengan_schedule_id → shift_schedules(id) ON DELETE SET NULL
--   guru_pengganti_id        → gurus(id)           ON DELETE SET NULL
--
-- sementara aturan kelengkapannya berupa CHECK baris penuh:
--
--   CHECK (jenis <> 'tukar_shift'
--          OR (tukar_dengan_schedule_id IS NOT NULL
--              AND guru_pengganti_id IS NOT NULL))
--
-- Jadi begitu shift lawan tukar dihapus, FK memaksa kolomnya jadi NULL,
-- dan CHECK yang sama menolak hasilnya. Penghapusan pun batal — yang
-- terlihat oleh pengguna sebagai "gagal hapus" tanpa petunjuk apa pun,
-- sebab shift yang dihapus dan izin yang mengeluh bisa milik guru
-- berbeda.
--
-- Perbaikannya: kelengkapan itu syarat PENGAJUAN, bukan syarat abadi.
-- Rincian izin adalah catatan riwayat — kalau shift lawannya kelak
-- dihapus, catatannya tetap sah (nama guru penggantinya masih tersimpan),
-- hanya penunjuk barisnya yang menggantung. Maka aturannya dipindah dari
-- CHECK ke pemeriksaan saat INSERT.
--
-- Yang TIDAK berubah: pengajuan tukar shift tanpa lawan/tanpa guru
-- pengganti tetap ditolak, dengan pesan yang lebih jelas dari sebelumnya.
-- Aturan 'ganti_hari' wajib tanggal_pengganti ikut pindah supaya kedua
-- aturan itu tinggal di satu tempat.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Lepas kedua CHECK tingkat-tabel
--    Keduanya dibuat tanpa nama, jadi penamaannya diserahkan ke
--    PostgreSQL (izin_detail_check, izin_detail_check1) — urutan yang
--    bisa berbeda bila tabelnya pernah dibangun ulang. Karena itu yang
--    dicari isi aturannya, bukan namanya.
--    CHECK pada kolom jenis TIDAK ikut terlepas: isinya hanya menyebut
--    kolom jenis, jadi daftar jenis yang sah tetap dijaga database.
-- ------------------------------------------------------------
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.izin_detail'::regclass
       AND contype = 'c'
       AND (pg_get_constraintdef(oid) LIKE '%tukar_dengan_schedule_id%'
         OR pg_get_constraintdef(oid) LIKE '%tanggal_pengganti%')
  LOOP
    EXECUTE format('ALTER TABLE public.izin_detail DROP CONSTRAINT %I', c.conname);
    RAISE NOTICE 'izin_detail: CHECK % dilepas, pindah ke trigger.', c.conname;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 2. Kelengkapan diperiksa saat baris dibuat
--    Juga saat jenisnya diubah — di situ isian lamanya bisa jadi tidak
--    lagi cocok. Perubahan lain (termasuk FK yang meng-NULL-kan kolom
--    saat shift lawan dihapus) dibiarkan lewat.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cek_kelengkapan_izin_detail()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.jenis IS NOT DISTINCT FROM OLD.jenis THEN
    RETURN NEW;
  END IF;

  IF NEW.jenis = 'tukar_shift'
     AND (NEW.tukar_dengan_schedule_id IS NULL OR NEW.guru_pengganti_id IS NULL) THEN
    RAISE EXCEPTION 'Tukar shift harus menyebutkan shift lawan tukar dan guru penggantinya.';
  END IF;

  IF NEW.jenis = 'ganti_hari' AND NEW.tanggal_pengganti IS NULL THEN
    RAISE EXCEPTION 'Ganti hari harus menyebutkan tanggal penggantinya.';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cek_kelengkapan_izin_detail ON public.izin_detail;
CREATE TRIGGER trg_cek_kelengkapan_izin_detail
  BEFORE INSERT OR UPDATE ON public.izin_detail
  FOR EACH ROW EXECUTE FUNCTION public.cek_kelengkapan_izin_detail();

COMMENT ON COLUMN public.izin_detail.tukar_dengan_schedule_id IS
  'Shift guru lain yang diambil sebagai ganti. Wajib saat pengajuan tukar_shift, '
  'tapi boleh menggantung (NULL) bila shift itu kemudian dihapus — lihat migrasi 0022.';
