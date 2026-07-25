-- ============================================================
-- 0013  Nota bayar (kwitansi) + link publik per transaksi
--
--   • Nomor nota: <urut>/<UNIT>/<bulan>/<tahun>, urutan direset
--     tiap bulan per unit.
--   • Nomor TERBIT saat transaksi diverifikasi, bukan saat dicatat,
--     supaya deret nomor tidak bolong karena setoran yang batal.
--   • Halaman nota dibuka orang tua TANPA login. Aksesnya lewat
--     fungsi SECURITY DEFINER di bawah, bukan dengan membuka policy
--     anon di pembayaran_spp — kalau tabelnya dibuka, seluruh data
--     pembayaran ikut terbaca siapa pun.
-- ============================================================

-- ── 1. Kolom nota ──
ALTER TABLE public.pembayaran_spp
  ADD COLUMN IF NOT EXISTS nota_token       UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS nomor_nota       TEXT,
  ADD COLUMN IF NOT EXISTS nota_terbit_pada TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nota_dicabut     BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.pembayaran_spp.nota_token IS
  'Kunci URL nota publik (/nota/<token>). Acak 128-bit supaya tidak bisa ditebak.';
COMMENT ON COLUMN public.pembayaran_spp.nota_dicabut IS
  'true = link nota dimatikan (mis. token terlanjur tersebar ke orang yang salah).';

CREATE UNIQUE INDEX IF NOT EXISTS idx_pembayaran_nota_token ON public.pembayaran_spp(nota_token);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pembayaran_nomor_nota ON public.pembayaran_spp(nomor_nota);


-- ── 2. Kode unit untuk nomor nota ──
-- Nama unit dipakai apa adanya (huruf & angka saja, huruf besar) supaya
-- dua cabang tidak pernah tertukar. 'Krajankulon' → 'KRAJANKULON'.
CREATE OR REPLACE FUNCTION public.nota_kode_unit(p_unit TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(
    NULLIF(upper(regexp_replace(COALESCE(p_unit, ''), '[^a-zA-Z0-9]', '', 'g')), ''),
    'UMUM');
$$;


-- ── 3. Penerbitan nomor nota ──
CREATE OR REPLACE FUNCTION public.nota_terbitkan_nomor()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_tgl   DATE;
  v_kode  TEXT;
  v_bulan TEXT;
  v_tahun TEXT;
  v_urut  INT;
BEGIN
  IF NEW.nota_token IS NULL THEN
    NEW.nota_token := gen_random_uuid();
  END IF;

  -- Nota hanya terbit untuk transaksi yang sudah diverifikasi, dan
  -- nomor yang sudah pernah terbit tidak pernah dihitung ulang.
  IF NEW.status IS DISTINCT FROM 'Terverifikasi' OR NEW.nomor_nota IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_tgl   := COALESCE(NULLIF(NEW.tanggal_bayar::TEXT, '')::DATE, NEW.created_at::DATE, CURRENT_DATE);
  v_kode  := public.nota_kode_unit(NEW.unit);
  v_bulan := to_char(v_tgl, 'MM');
  v_tahun := to_char(v_tgl, 'YYYY');

  -- Dua verifikasi bersamaan pada unit & bulan yang sama tidak boleh
  -- mendapat nomor kembar (indeks unik akan menolak, transaksi gagal).
  PERFORM pg_advisory_xact_lock(hashtext(v_kode || '/' || v_bulan || '/' || v_tahun));

  SELECT COALESCE(MAX(split_part(nomor_nota, '/', 1)::INT), 0) + 1
    INTO v_urut
    FROM public.pembayaran_spp
   WHERE nomor_nota LIKE '%/' || v_kode || '/' || v_bulan || '/' || v_tahun;

  NEW.nomor_nota       := lpad(v_urut::TEXT, 4, '0') || '/' || v_kode || '/' || v_bulan || '/' || v_tahun;
  NEW.nota_terbit_pada := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_nota_terbitkan_nomor ON public.pembayaran_spp;
CREATE TRIGGER trg_nota_terbitkan_nomor
  BEFORE INSERT OR UPDATE ON public.pembayaran_spp
  FOR EACH ROW EXECUTE FUNCTION public.nota_terbitkan_nomor();


-- ── 4. Backfill data lama ──
UPDATE public.pembayaran_spp SET nota_token = gen_random_uuid() WHERE nota_token IS NULL;

-- Nomor untuk transaksi lama yang sudah terverifikasi, diurutkan menurut
-- tanggal bayar supaya deretnya masuk akal secara pembukuan.
DO $$
DECLARE
  r       RECORD;
  v_kode  TEXT;
  v_bulan TEXT;
  v_tahun TEXT;
  v_urut  INT;
BEGIN
  FOR r IN
    SELECT id, unit,
           COALESCE(NULLIF(tanggal_bayar::TEXT, '')::DATE, created_at::DATE) AS tgl
      FROM public.pembayaran_spp
     WHERE status = 'Terverifikasi' AND nomor_nota IS NULL
     ORDER BY 3, created_at, id
  LOOP
    v_kode  := public.nota_kode_unit(r.unit);
    v_bulan := to_char(r.tgl, 'MM');
    v_tahun := to_char(r.tgl, 'YYYY');

    SELECT COALESCE(MAX(split_part(nomor_nota, '/', 1)::INT), 0) + 1
      INTO v_urut
      FROM public.pembayaran_spp
     WHERE nomor_nota LIKE '%/' || v_kode || '/' || v_bulan || '/' || v_tahun;

    UPDATE public.pembayaran_spp
       SET nomor_nota       = lpad(v_urut::TEXT, 4, '0') || '/' || v_kode || '/' || v_bulan || '/' || v_tahun,
           nota_terbit_pada = COALESCE(nota_terbit_pada, now())
     WHERE id = r.id;
  END LOOP;
END $$;


-- ── 5. Pembacaan nota oleh publik ──
-- Hanya mengembalikan kolom yang tercetak di nota — tanpa siswa_id,
-- nomor WA, pencatat, catatan internal, maupun id rekonsiliasi.
-- Satu token = satu nota; tidak ada cara mendaftar nota lain dari sini.
CREATE OR REPLACE FUNCTION public.nota_publik(p_token UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'nomor_nota',    p.nomor_nota,
    'tanggal_bayar', COALESCE(NULLIF(p.tanggal_bayar::TEXT, ''), p.created_at::DATE::TEXT),
    'periode',       p.jatuh_tempo,
    'nama_siswa',    p.nama_siswa,
    'nama_program',  p.nama_program,
    'unit',          p.unit,
    'nominal',       p.nominal,
    'diskon',        COALESCE(p.diskon, 0),
    'metode',        p.metode,
    'terbit_pada',   p.nota_terbit_pada,
    'lembaga',       (SELECT value FROM app_settings WHERE key = 'app_name'),
    'logo',          (SELECT value FROM app_settings WHERE key = 'logo_url')
  )
  FROM pembayaran_spp p
  WHERE p.nota_token = p_token
    AND p.status     = 'Terverifikasi'
    AND COALESCE(p.nota_dicabut, false) = false;
$$;

REVOKE ALL    ON FUNCTION public.nota_publik(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.nota_publik(UUID) TO anon, authenticated;
