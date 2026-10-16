-- ============================================================
-- Log SPP — hasil scan QR siswa oleh guru, menunggu validasi
--
-- Alur:
--   1. Guru scan QR siswa di SPP > Scan Barcode, memilih program (bila
--      siswa punya lebih dari satu tagihan), lalu mengisi form Bayar SPP
--      (tanggal, metode, diskon, catatan).
--      → satu baris log berstatus 'Menunggu'.
--   2. Learning Koordinator memvalidasi di SPP > Log SPP. Validasi
--      mencatat pembayaran di pembayaran_spp persis seperti tombol Bayar
--      di Tagihan Siswa, lalu log menjadi 'Divalidasi'. Bisa juga 'Ditolak'.
--
-- Log tidak pernah menyentuh pembayaran_spp sendiri; tagihan baru berubah
-- setelah validasi, jadi alur Tagihan / Setor SPP tetap seperti biasa.
-- ============================================================

-- Fungsi bantu dari migrasi 0002 ternyata belum ada di produksi
-- (current_guru_id() tidak ditemukan saat migrasi ini pertama dijalankan).
-- Jadi migrasi ini tidak bergantung pada 0002: current_guru_id dibuat di
-- sini dengan isi yang sama persis, dan pemeriksaan peran membaca tabel
-- gurus langsung alih-alih lewat current_guru_role() / is_admin().
CREATE OR REPLACE FUNCTION public.current_guru_id()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT g.id FROM public.gurus g WHERE g.auth_user_id = auth.uid() LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.current_guru_id() FROM public;
GRANT EXECUTE ON FUNCTION public.current_guru_id() TO authenticated;

-- Peran guru yang sedang login, hanya bila akunnya Aktif; NULL jika tidak.
CREATE OR REPLACE FUNCTION public.log_spp_peran()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT g.role FROM public.gurus g
  WHERE g.auth_user_id = auth.uid() AND g.status = 'Aktif' LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.log_spp_peran() FROM public;
GRANT EXECUTE ON FUNCTION public.log_spp_peran() TO authenticated;

CREATE TABLE IF NOT EXISTS public.log_spp (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Snapshot tagihan saat discan (lihat utils/tagihan.js buildTagihan)
  tagihan_key     TEXT NOT NULL,          -- aktivasi id (rutin) atau induk paket (harian)
  siklus          TEXT NOT NULL CHECK (siklus IN ('bulanan', 'sekali')),
  siswa_id        TEXT NOT NULL REFERENCES public.siswa(id) ON DELETE CASCADE,
  nama_siswa      TEXT NOT NULL,
  nama_program    TEXT,
  unit            TEXT,
  jatuh_tempo     DATE,
  nominal         NUMERIC(15,2) DEFAULT 0,

  discan_oleh_id  TEXT DEFAULT public.current_guru_id(),
  discan_oleh     TEXT,

  status          TEXT NOT NULL DEFAULT 'Menunggu'
                  CHECK (status IN ('Menunggu', 'Divalidasi', 'Ditolak')),
  divalidasi_oleh TEXT,
  divalidasi_pada TIMESTAMPTZ,
  pembayaran_id   TEXT,                   -- pembayaran_spp.id yang terbit dari validasi
  alasan_tolak    TEXT
);

-- Isian form Bayar SPP dari guru saat scan — dipakai sebagai isian awal
-- popup validasi. ADD COLUMN terpisah supaya file ini tetap aman dijalankan
-- ulang di database yang sudah punya tabel log_spp versi awal.
ALTER TABLE public.log_spp
  ADD COLUMN IF NOT EXISTS tanggal_bayar DATE,
  ADD COLUMN IF NOT EXISTS metode        TEXT,
  ADD COLUMN IF NOT EXISTS diskon        NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS catatan       TEXT;

CREATE INDEX IF NOT EXISTS idx_log_spp_status  ON public.log_spp(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_log_spp_siswa   ON public.log_spp(siswa_id);

-- Satu tagihan hanya boleh punya satu log yang masih menunggu — mencegah
-- scan ganda menghasilkan dua pembayaran untuk periode yang sama.
CREATE UNIQUE INDEX IF NOT EXISTS uq_log_spp_menunggu
  ON public.log_spp(tagihan_key) WHERE status = 'Menunggu';

-- Yang boleh memvalidasi / menolak.
CREATE OR REPLACE FUNCTION public.boleh_validasi_spp()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(public.log_spp_peran() IN ('Owner', 'Administrator', 'Supervisor', 'Learning Koordinator'), false);
$$;
REVOKE ALL ON FUNCTION public.boleh_validasi_spp() FROM public;
GRANT EXECUTE ON FUNCTION public.boleh_validasi_spp() TO authenticated;

ALTER TABLE public.log_spp ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS log_spp_select ON public.log_spp;
CREATE POLICY log_spp_select ON public.log_spp FOR SELECT TO authenticated USING (true);

-- Guru hanya bisa membuat log baru atas namanya sendiri, berstatus Menunggu.
DROP POLICY IF EXISTS log_spp_insert ON public.log_spp;
CREATE POLICY log_spp_insert ON public.log_spp FOR INSERT TO authenticated
  WITH CHECK (status = 'Menunggu' AND discan_oleh_id = public.current_guru_id());

DROP POLICY IF EXISTS log_spp_update ON public.log_spp;
CREATE POLICY log_spp_update ON public.log_spp FOR UPDATE TO authenticated
  USING (public.boleh_validasi_spp()) WITH CHECK (public.boleh_validasi_spp());

DROP POLICY IF EXISTS log_spp_delete ON public.log_spp;
CREATE POLICY log_spp_delete ON public.log_spp FOR DELETE TO authenticated
  USING (COALESCE(public.log_spp_peran() IN ('Owner', 'Administrator', 'Supervisor'), false));

-- Cek setelah dijalankan (SQL Editor tidak menampilkan RAISE NOTICE):
--   SELECT to_regclass('public.log_spp'),
--          to_regprocedure('public.current_guru_id()'),
--          to_regprocedure('public.boleh_validasi_spp()');
--   → ketiganya harus terisi, bukan NULL.
