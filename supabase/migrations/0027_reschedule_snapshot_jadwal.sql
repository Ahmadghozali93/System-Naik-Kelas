-- ============================================================
-- 0027  Riwayat reschedule menyimpan sendiri identitas jadwalnya
--
-- Gejala: menghapus jadwal di Master Jadwal gagal dengan pesan
--   "sudah ada siswa yang terdaftar di dalamnya (Aktivasi Siswa)"
-- padahal di halaman Aktivasi Siswa jadwal itu benar-benar kosong.
--
-- Sebab: pesan itu tebakan. JadwalMasterPage menerjemahkan setiap
-- error 23503 (foreign key violation) sebagai aktivasi_siswa, padahal
-- ada tiga tabel yang mereferensi jadwal_master:
--
--   aktivasi_siswa.jadwal_id                     ON DELETE RESTRICT
--   appointment.jadwal_id                        ON DELETE RESTRICT
--   reschedules.jadwal_asal_id / jadwal_tujuan_id  (tanpa klausa
--                                                   ON DELETE = NO ACTION)
--
-- Yang mengunci pada kasus nyata (JDW-NTHHN5, JDW-Q67F83, JDW-10VG62)
-- adalah reschedules — dan reschedule berstatus Done/Cancelled pun ikut
-- mengunci, padahal halaman Reschedule menyembunyikannya secara default.
-- Jadwal lama praktis tidak bisa diarsipkan selamanya.
--
-- Perbaikannya bertahap, dan migrasi ini SENGAJA belum menyentuh FK.
-- Baris reschedule saat ini tidak menyimpan nama guru/program/unit-nya
-- sendiri; ketiganya dicari saat tampil lewat jadwal_asal_id /
-- jadwal_tujuan_id. Kalau FK dilonggarkan lebih dulu, penghapusan jadwal
-- akan meng-NULL-kan penunjuk itu dan riwayatnya kehilangan isi tanpa
-- bisa dipulihkan. Maka snapshot-nya dibuat dan diisi dulu di sini;
-- pelonggaran FK menyusul di migrasi berikutnya, setelah diverifikasi
-- tidak ada baris yang snapshot-nya masih kosong.
--
-- Pengisian snapshot ditaruh di trigger, bukan di frontend, karena ada
-- dua jalur insert (ReschedulePage dan PengajuanReschedulePage) dan
-- pengguna PWA bisa masih berjalan di bundel lama — di database, versi
-- bundel tidak lagi jadi soal.
--
-- Aman dijalankan berulang.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Kolom snapshot
--    Bentuk isinya mengikuti pola yang sudah ada di
--    aktivasi_siswa.detail_jadwal, ditambah jadwal_kode (kode JDW-xxxxxx
--    yang dikenal pengguna) supaya riwayat tetap bisa ditelusuri setelah
--    baris jadwal_master-nya hilang.
-- ------------------------------------------------------------
ALTER TABLE public.reschedules
  ADD COLUMN IF NOT EXISTS detail_asal   JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.reschedules
  ADD COLUMN IF NOT EXISTS detail_tujuan JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.reschedules.detail_asal IS
  'Salinan identitas jadwal asal saat reschedule dibuat: guru, program, unit, hari, jam, '
  'kode jadwal. Diisi trigger, bukan frontend. Tetap utuh walau jadwal_asal_id kelak '
  'menggantung karena jadwalnya dihapus — lihat migrasi 0027.';

COMMENT ON COLUMN public.reschedules.detail_tujuan IS
  'Salinan identitas jadwal tujuan saat reschedule dibuat. Lihat detail_asal.';

-- ------------------------------------------------------------
-- 2. Pembentuk snapshot
--    Dipakai bersama oleh backfill dan trigger supaya bentuk isinya
--    tidak pernah bercabang. Mengembalikan '{}' bila jadwalnya tidak
--    ada, sehingga baris yang penunjuknya sudah menggantung tidak
--    memalsukan isi.
--
--    SECURITY DEFINER karena pengajuan reschedule dari halaman publik
--    berjalan sebagai anon. Tanpa itu, RLS jadwal_master yang kelak
--    diperketat akan membuat snapshot diam-diam terisi '{}' — persis
--    kehilangan riwayat yang hendak dicegah migrasi ini. Tidak ada
--    data baru yang terbuka: jadwal_master sudah dapat dibaca anon
--    (policy jadwal_select_anon, migrasi 0003).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.snapshot_jadwal(p_jadwal_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT jsonb_build_object(
              'jadwal_kode',   j.jadwal_id,
              'guru_id',       j.guru_id,
              'nama_guru',     j.nama_guru,
              'program_id',    j.program_id,
              'nama_program',  j.nama_program,
              'jenis_program', j.jenis_program,
              'hari',          j.hari,
              'jam',           j.jam,
              'unit',          j.unit
            )
       FROM public.jadwal_master j
      WHERE j.id = p_jadwal_id),
    '{}'::jsonb
  );
$$;

-- ------------------------------------------------------------
-- 3. Backfill baris lama
--    Hanya menyentuh baris yang snapshot-nya masih kosong, jadi
--    menjalankan ulang migrasi ini tidak menimpa apa pun.
-- ------------------------------------------------------------
UPDATE public.reschedules
   SET detail_asal = public.snapshot_jadwal(jadwal_asal_id)
 WHERE jadwal_asal_id IS NOT NULL
   AND detail_asal = '{}'::jsonb;

UPDATE public.reschedules
   SET detail_tujuan = public.snapshot_jadwal(jadwal_tujuan_id)
 WHERE jadwal_tujuan_id IS NOT NULL
   AND detail_tujuan = '{}'::jsonb;

-- ------------------------------------------------------------
-- 4. Baris baru mengisi snapshot-nya sendiri
--    Isi diperbarui saat baris dibuat dan saat penunjuk jadwalnya
--    diganti ke jadwal lain. Kalau penunjuknya justru menjadi NULL —
--    yang nanti terjadi otomatis ketika jadwalnya dihapus, setelah
--    migrasi berikutnya — snapshot lama sengaja DIBIARKAN. Justru itu
--    yang menyelamatkan riwayatnya.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.isi_snapshot_reschedule()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.jadwal_asal_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.jadwal_asal_id IS DISTINCT FROM OLD.jadwal_asal_id) THEN
    NEW.detail_asal := public.snapshot_jadwal(NEW.jadwal_asal_id);
  END IF;

  IF NEW.jadwal_tujuan_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.jadwal_tujuan_id IS DISTINCT FROM OLD.jadwal_tujuan_id) THEN
    NEW.detail_tujuan := public.snapshot_jadwal(NEW.jadwal_tujuan_id);
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_isi_snapshot_reschedule ON public.reschedules;
CREATE TRIGGER trg_isi_snapshot_reschedule
  BEFORE INSERT OR UPDATE OF jadwal_asal_id, jadwal_tujuan_id ON public.reschedules
  FOR EACH ROW EXECUTE FUNCTION public.isi_snapshot_reschedule();

-- ------------------------------------------------------------
-- 5. Laporan hasil
--    Angka "belum lengkap" HARUS 0 sebelum migrasi 0028 dijalankan.
--    Selama masih di atas 0, melonggarkan FK berarti membuang riwayat.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_total   INTEGER;
  v_kurang  INTEGER;
  v_gantung INTEGER;
BEGIN
  SELECT count(*) INTO v_total FROM public.reschedules;

  SELECT count(*) INTO v_kurang
    FROM public.reschedules
   WHERE (jadwal_asal_id   IS NOT NULL AND COALESCE(detail_asal->>'nama_guru','')   = '')
      OR (jadwal_tujuan_id IS NOT NULL AND COALESCE(detail_tujuan->>'nama_guru','') = '');

  SELECT count(*) INTO v_gantung
    FROM public.reschedules
   WHERE (jadwal_asal_id   IS NULL AND detail_asal   = '{}'::jsonb)
      OR (jadwal_tujuan_id IS NULL AND detail_tujuan = '{}'::jsonb);

  RAISE NOTICE 'reschedules: % baris, % belum lengkap snapshot-nya, % tanpa penunjuk jadwal.',
    v_total, v_kurang, v_gantung;

  IF v_kurang > 0 THEN
    RAISE WARNING 'Masih ada % baris ber-penunjuk jadwal tapi snapshot-nya kosong. JANGAN jalankan migrasi 0028 sebelum angka ini 0.', v_kurang;
  END IF;
END $$;
