-- ============================================================
-- 0028  Jadwal lama bisa dihapus tanpa membuang riwayat reschedule
--
-- Lanjutan migrasi 0027. Di sana setiap baris reschedule sudah
-- menyimpan sendiri identitas jadwalnya (detail_asal / detail_tujuan),
-- jadi penunjuk ke jadwal_master boleh menggantung tanpa riwayatnya
-- ikut kosong. Migrasi ini yang melonggarkan penunjuk itu.
--
-- Sebelum: reschedules.jadwal_asal_id / jadwal_tujuan_id dibuat tanpa
-- klausa ON DELETE, jadi berlaku NO ACTION — jadwal yang pernah dipakai
-- sebagai asal atau tujuan pemindahan TIDAK PERNAH bisa dihapus lagi,
-- bahkan ketika reschedule-nya sudah berstatus Done bertahun lalu dan
-- disembunyikan dari halaman Reschedule. Pengguna melihatnya sebagai
-- "gagal hapus" tanpa petunjuk yang benar.
--
-- Sesudah: penunjuknya menjadi NULL saat jadwalnya dihapus, dan riwayat
-- tetap terbaca lengkap dari salinannya.
--
-- Tapi melonggarkan FK saja terlalu jauh: reschedule yang masih Pending
-- atau Approved adalah rencana yang BELUM terjadi — jadwal tujuannya
-- masih dibutuhkan minggu depan dan tidak boleh hilang diam-diam. Maka
-- larangan itu dipindah, bukan dihapus: dari FK yang memblokir selamanya
-- tanpa peduli status, menjadi trigger yang hanya memblokir selama
-- rencananya masih hidup.
--
-- Yang TIDAK berubah: aktivasi_siswa.jadwal_id dan appointment.jadwal_id
-- tetap ON DELETE RESTRICT. Keduanya memang harus menahan penghapusan.
--
-- Aman dijalankan berulang.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Palang pengaman
--    Melonggarkan FK sebelum semua baris punya salinan identitas jadwal
--    berarti membuang riwayat begitu jadwal pertama dihapus, dan tidak
--    ada cara memulihkannya. Kalau 0027 belum jalan atau backfill-nya
--    belum tuntas, migrasi ini berhenti di sini.
-- ------------------------------------------------------------
DO $$
DECLARE v_kurang INTEGER;
BEGIN
  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'reschedules'
         AND column_name IN ('detail_asal','detail_tujuan')) < 2 THEN
    RAISE EXCEPTION 'Migrasi 0027 belum dijalankan tuntas: kolom detail_asal/detail_tujuan belum lengkap. Jalankan 0027 lebih dulu.';
  END IF;

  SELECT count(*) INTO v_kurang
    FROM public.reschedules
   WHERE (jadwal_asal_id   IS NOT NULL AND COALESCE(detail_asal->>'nama_guru','')   = '')
      OR (jadwal_tujuan_id IS NOT NULL AND COALESCE(detail_tujuan->>'nama_guru','') = '');

  IF v_kurang > 0 THEN
    RAISE EXCEPTION 'Ada % baris reschedule yang salinan identitas jadwalnya masih kosong. Lengkapi dulu (jalankan ulang 0027), jangan longgarkan FK sekarang.', v_kurang;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. Penunjuk jadwal boleh menggantung
--    Nama constraint-nya dibentuk otomatis oleh PostgreSQL saat tabel
--    dibuat, dan bisa berbeda bila tabelnya pernah dibangun ulang. Maka
--    yang dicari relasinya (FK dari reschedules ke jadwal_master),
--    bukan namanya. Constraint yang aturannya sudah SET NULL dilewati,
--    supaya migrasi ini aman diulang.
-- ------------------------------------------------------------
DO $$
DECLARE
  c      RECORD;
  v_kol  TEXT;
BEGIN
  FOR c IN
    SELECT conname, conkey, confdeltype
      FROM pg_constraint
     WHERE conrelid = 'public.reschedules'::regclass
       AND contype  = 'f'
       AND confrelid = 'public.jadwal_master'::regclass
  LOOP
    IF c.confdeltype = 'n' THEN
      RAISE NOTICE 'reschedules: % sudah ON DELETE SET NULL, dilewati.', c.conname;
      CONTINUE;
    END IF;

    SELECT attname INTO v_kol
      FROM pg_attribute
     WHERE attrelid = 'public.reschedules'::regclass
       AND attnum   = c.conkey[1];

    EXECUTE format('ALTER TABLE public.reschedules DROP CONSTRAINT %I', c.conname);
    EXECUTE format(
      'ALTER TABLE public.reschedules ADD CONSTRAINT %I FOREIGN KEY (%I) '
      'REFERENCES public.jadwal_master(id) ON DELETE SET NULL',
      c.conname, v_kol);

    RAISE NOTICE 'reschedules.%: FK % kini ON DELETE SET NULL.', v_kol, c.conname;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 3. Rencana yang belum terjadi tetap menahan penghapusan
--    Pending  = diajukan, belum diputuskan.
--    Approved = disetujui, siswanya sudah diberi tahu akan datang.
--    Keduanya menunjuk jadwal yang masih dipakai. Done dan Cancelled
--    sudah selesai — itu catatan, bukan rencana, dan tidak lagi menahan.
--
--    Ditaruh di database, bukan hanya di frontend, karena setelah FK
--    dilonggarkan tidak ada lagi yang menjaganya di sisi data: pengecekan
--    di layar bisa terlewat oleh reschedule yang masuk sesaat setelah
--    pengecekan, atau oleh akses langsung ke tabel.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cegah_hapus_jadwal_terpakai()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE v_jumlah INTEGER;
BEGIN
  SELECT count(*) INTO v_jumlah
    FROM public.reschedules r
   WHERE r.status IN ('Pending','Approved')
     AND (r.jadwal_asal_id = OLD.id OR r.jadwal_tujuan_id = OLD.id);

  IF v_jumlah > 0 THEN
    RAISE EXCEPTION
      'Jadwal % masih dipakai % pengajuan reschedule berstatus Pending/Approved. Selesaikan atau batalkan pengajuan itu dulu di halaman Reschedule.',
      OLD.jadwal_id, v_jumlah;
  END IF;

  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_cegah_hapus_jadwal_terpakai ON public.jadwal_master;
CREATE TRIGGER trg_cegah_hapus_jadwal_terpakai
  BEFORE DELETE ON public.jadwal_master
  FOR EACH ROW EXECUTE FUNCTION public.cegah_hapus_jadwal_terpakai();

COMMENT ON FUNCTION public.cegah_hapus_jadwal_terpakai() IS
  'Menahan penghapusan jadwal_master selama masih ada reschedule Pending/Approved yang '
  'menunjuknya. Menggantikan penjagaan oleh FK, yang sejak migrasi 0028 melepas '
  'penunjuknya (SET NULL) tanpa memandang status.';

-- ------------------------------------------------------------
-- 4. Laporan
--    Angka "terkunci reschedule aktif" adalah jadwal yang memang masih
--    seharusnya tidak bisa dihapus. Selain itu, jadwal yang tadinya
--    tersandera reschedule Done/Cancelled kini sudah bisa diarsipkan —
--    kecuali bila masih dipegang aktivasi_siswa atau appointment.
-- ------------------------------------------------------------
DO $$
DECLARE v_terkunci INTEGER;
BEGIN
  SELECT count(DISTINCT j.id) INTO v_terkunci
    FROM public.jadwal_master j
    JOIN public.reschedules r
      ON (r.jadwal_asal_id = j.id OR r.jadwal_tujuan_id = j.id)
   WHERE r.status IN ('Pending','Approved');

  RAISE NOTICE 'Selesai. % jadwal masih ditahan reschedule Pending/Approved.', v_terkunci;
END $$;
