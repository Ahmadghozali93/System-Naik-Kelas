-- ============================================================
-- 0014  Pencabutan link nota + penutupan akses anonim ke tabel SPP
--
-- Migrasi 0013 sengaja tidak membuka policy anon di pembayaran_spp dan
-- memakai fungsi SECURITY DEFINER supaya orang tua hanya bisa melihat
-- SATU nota miliknya. Ternyata pengamanan itu percuma: tabel-tabel SPP
-- masih memakai policy bawaan supabase_spp_schema.sql —
--
--     CREATE POLICY "Allow all (dev)" ON pembayaran_spp
--       FOR ALL USING (true) WITH CHECK (true);
--
-- Tanpa klausa TO, policy berlaku untuk role PUBLIC, termasuk `anon`.
-- Padahal anon key ikut terkirim ke browser di dalam bundle JavaScript,
-- jadi siapa pun yang membuka halaman nota bisa mengambil kuncinya lalu
-- membaca SELURUH riwayat pembayaran — nama siswa, nominal, dan semua
-- nota_token milik orang lain — bahkan mengubah dan menghapusnya.
--
-- Sudah diuji sebelum migrasi ini dijalankan:
--   GET /rest/v1/pembayaran_spp?select=id,nama_siswa,nominal  → 200 OK
--
-- Bagian 1 menutup itu. Perilaku di dalam aplikasi tidak berubah sama
-- sekali: semua halaman SPP ada di balik login, dan siapa boleh membuka
-- menu apa tetap diatur oleh hasPermission() di sisi aplikasi.
-- ============================================================

-- ── 1. Tabel SPP hanya untuk pengguna yang sudah login ──
-- Tidak ada satu pun halaman publik (LandingPage, PengajuanReschedule,
-- NotaPublik) yang menyentuh tabel-tabel ini secara langsung; nota publik
-- lewat fungsi nota_publik() yang SECURITY DEFINER, jadi tetap jalan.
-- Penghapusan tidak berdasarkan nama policy: yang dicari adalah SIFATnya —
-- policy apa pun yang berlaku untuk role PUBLIC atau anon. Kalau ada policy
-- longgar lain yang pernah dibuat lewat dashboard, ikut tertutup di sini.
DO $$
DECLARE
  t TEXT;
  r RECORD;
BEGIN
  FOREACH t IN ARRAY ARRAY['pembayaran_spp','tagihan_spp','kelas_spp','komponen_biaya','tahun_ajaran']
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    FOR r IN
      SELECT policyname FROM pg_policies
       WHERE schemaname = 'public' AND tablename = t
         AND (roles && ARRAY['public','anon']::name[])
    LOOP
      RAISE NOTICE 'Policy terbuka dihapus: %.%', t, r.policyname;
      EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, t);
    END LOOP;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_authenticated', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      t || '_authenticated', t);
  END LOOP;
END $$;


-- ── 2. Jejak pencabutan nota ──
-- Mencabut nota = mematikan bukti bayar yang sudah dipegang orang tua,
-- jadi harus ada catatan siapa yang melakukannya dan kapan.
ALTER TABLE public.pembayaran_spp
  ADD COLUMN IF NOT EXISTS nota_dicabut_pada TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nota_dicabut_oleh TEXT;

COMMENT ON COLUMN public.pembayaran_spp.nota_dicabut_pada IS
  'Waktu link nota dimatikan. Dikosongkan lagi saat nota diaktifkan ulang.';
COMMENT ON COLUMN public.pembayaran_spp.nota_dicabut_oleh IS
  'Nama/email petugas yang mencabut link nota.';


-- ── 3. Token baru saat nota diaktifkan kembali ──
-- Alasan mencabut biasanya karena token terlanjur tersebar ke orang yang
-- salah. Kalau diaktifkan lagi dengan token yang sama, orang itu tetap
-- bisa membukanya — jadi tokennya diganti, dan link lama mati permanen.
-- Nomor notanya tidak ikut berubah supaya pembukuan tetap nyambung.
CREATE OR REPLACE FUNCTION public.nota_token_baru_saat_diaktifkan()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.nota_dicabut IS TRUE AND NEW.nota_dicabut IS FALSE THEN
    NEW.nota_token := gen_random_uuid();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_nota_token_baru ON public.pembayaran_spp;
CREATE TRIGGER trg_nota_token_baru
  BEFORE UPDATE OF nota_dicabut ON public.pembayaran_spp
  FOR EACH ROW EXECUTE FUNCTION public.nota_token_baru_saat_diaktifkan();
