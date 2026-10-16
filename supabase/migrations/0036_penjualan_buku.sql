-- ============================================================
-- Penjualan Buku
--
-- Alur:
--   1. Produk     — master buku: id, nama, harga, barcode (opsional;
--                   barcode/ISBN yang tercetak di buku).
--   2. Transaksi  — guru memilih siswa, scan produk (bisa banyak), mengisi
--                   tanggal/metode/diskon. Produk yang punya barcode WAJIB
--                   discan; yang belum punya barcode dipilih manual.
--                   → transaksi_buku berstatus 'Menunggu'.
--   3. Log Buku   — koordinator memvalidasi ('Divalidasi') atau menolak.
--   4. Setor Buku — transaksi Divalidasi dikumpulkan jadi satu setoran
--                   (transaksi_buku.setor_id terisi).
--   5. Faktur Odoo— transaksi yang sudah disetor dikirim jadi invoice.
--   6. Rekap      — ringkasan transaksi Divalidasi.
--
-- Bergantung pada migrasi 0035 (current_guru_id, log_spp_peran,
-- boleh_validasi_spp) — jalankan 0035 lebih dulu.
-- ============================================================

-- ── Produk ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.produk_buku (
  id          TEXT PRIMARY KEY,                 -- BK-XXXXXX
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  nama        TEXT NOT NULL,
  harga       NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (harga >= 0),
  barcode     TEXT,                             -- NULL = belum punya barcode → boleh dipilih manual
  aktif       BOOLEAN NOT NULL DEFAULT true
);
-- Satu barcode hanya untuk satu produk, supaya hasil scan tidak ambigu.
CREATE UNIQUE INDEX IF NOT EXISTS uq_produk_buku_barcode
  ON public.produk_buku(barcode) WHERE barcode IS NOT NULL;

-- ── Setoran ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.setor_buku (
  id                TEXT PRIMARY KEY,           -- SB-XXXXXX
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  tanggal           DATE NOT NULL,
  total             NUMERIC(15,2) NOT NULL DEFAULT 0,
  jumlah_transaksi  INTEGER NOT NULL DEFAULT 0,
  catatan           TEXT,
  created_by        TEXT
);

-- ── Transaksi ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.transaksi_buku (
  id                TEXT PRIMARY KEY,           -- TB-XXXXXXXX
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  siswa_id          TEXT NOT NULL REFERENCES public.siswa(id) ON DELETE RESTRICT,
  nama_siswa        TEXT NOT NULL,
  unit              TEXT,

  tanggal_bayar     DATE NOT NULL,
  metode            TEXT NOT NULL,
  subtotal          NUMERIC(15,2) NOT NULL DEFAULT 0,
  diskon            NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (diskon >= 0),
  total             NUMERIC(15,2) NOT NULL DEFAULT 0,   -- subtotal − diskon
  catatan           TEXT,

  dicatat_oleh_id   TEXT DEFAULT public.current_guru_id(),
  dicatat_oleh      TEXT,

  status            TEXT NOT NULL DEFAULT 'Menunggu'
                    CHECK (status IN ('Menunggu', 'Divalidasi', 'Ditolak')),
  divalidasi_oleh   TEXT,
  divalidasi_pada   TIMESTAMPTZ,
  alasan_tolak      TEXT,

  setor_id          TEXT REFERENCES public.setor_buku(id) ON DELETE SET NULL,

  odoo_invoice_id   INTEGER,
  odoo_invoice_name TEXT,
  odoo_status       TEXT,
  odoo_synced_at    TIMESTAMPTZ,
  odoo_error        TEXT
);
CREATE INDEX IF NOT EXISTS idx_transaksi_buku_status ON public.transaksi_buku(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transaksi_buku_setor  ON public.transaksi_buku(setor_id);
CREATE INDEX IF NOT EXISTS idx_transaksi_buku_siswa  ON public.transaksi_buku(siswa_id);

CREATE TABLE IF NOT EXISTS public.transaksi_buku_item (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaksi_id  TEXT NOT NULL REFERENCES public.transaksi_buku(id) ON DELETE CASCADE,
  produk_id     TEXT NOT NULL REFERENCES public.produk_buku(id) ON DELETE RESTRICT,
  nama_produk   TEXT NOT NULL,                  -- snapshot, supaya ganti nama produk tidak mengubah riwayat
  harga         NUMERIC(15,2) NOT NULL,         -- snapshot harga saat transaksi
  qty           INTEGER NOT NULL CHECK (qty > 0),
  subtotal      NUMERIC(15,2) NOT NULL,
  discan        BOOLEAN NOT NULL DEFAULT false  -- true = masuk lewat scan barcode
);
CREATE INDEX IF NOT EXISTS idx_transaksi_buku_item_trx    ON public.transaksi_buku_item(transaksi_id);
CREATE INDEX IF NOT EXISTS idx_transaksi_buku_item_produk ON public.transaksi_buku_item(produk_id);

-- ── Simpan transaksi (satu pintu untuk guru) ─────────────────
-- Header dan item disimpan dalam satu transaksi database, dan harga diambil
-- dari produk_buku di sini — bukan dari browser — jadi harga tidak bisa
-- diubah dari sisi guru. Aturan "produk berbarcode wajib discan" juga
-- diperiksa di sini.
-- SECURITY INVOKER: policy RLS di bawah tetap berlaku untuk pemanggil.
--
-- p_items: [{ "produk_id": "BK-...", "qty": 2, "discan": true }, ...]
CREATE OR REPLACE FUNCTION public.simpan_transaksi_buku(
  p_siswa_id      TEXT,
  p_tanggal_bayar DATE,
  p_metode        TEXT,
  p_diskon        NUMERIC,
  p_catatan       TEXT,
  p_items         JSONB
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id       TEXT := 'TB-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
  v_siswa    RECORD;
  v_guru     TEXT;
  v_item     JSONB;
  v_produk   RECORD;
  v_qty      INTEGER;
  v_discan   BOOLEAN;
  v_subtotal NUMERIC := 0;
  v_diskon   NUMERIC := GREATEST(COALESCE(p_diskon, 0), 0);
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Belum ada produk di transaksi.';
  END IF;

  SELECT id, nama, unit INTO v_siswa FROM siswa WHERE id = p_siswa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Siswa % tidak ditemukan.', p_siswa_id;
  END IF;

  SELECT nama INTO v_guru FROM gurus WHERE id = current_guru_id();

  -- Hitung subtotal & periksa produk lebih dulu, sebelum menulis apa pun.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty    := COALESCE((v_item->>'qty')::INTEGER, 0);
    v_discan := COALESCE((v_item->>'discan')::BOOLEAN, false);
    SELECT id, nama, harga, barcode, aktif INTO v_produk FROM produk_buku WHERE id = v_item->>'produk_id';
    IF NOT FOUND OR NOT v_produk.aktif THEN
      RAISE EXCEPTION 'Produk % tidak ada atau sudah nonaktif.', v_item->>'produk_id';
    END IF;
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Jumlah untuk % harus lebih dari 0.', v_produk.nama;
    END IF;
    IF v_produk.barcode IS NOT NULL AND NOT v_discan THEN
      RAISE EXCEPTION '% punya barcode — wajib discan, tidak bisa dipilih manual.', v_produk.nama;
    END IF;
    v_subtotal := v_subtotal + v_produk.harga * v_qty;
  END LOOP;

  IF v_diskon > v_subtotal THEN
    RAISE EXCEPTION 'Diskon melebihi subtotal.';
  END IF;

  INSERT INTO transaksi_buku (id, siswa_id, nama_siswa, unit, tanggal_bayar, metode,
                              subtotal, diskon, total, catatan, dicatat_oleh)
  VALUES (v_id, v_siswa.id, v_siswa.nama, v_siswa.unit, p_tanggal_bayar, p_metode,
          v_subtotal, v_diskon, v_subtotal - v_diskon, NULLIF(trim(p_catatan), ''), v_guru);

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty    := (v_item->>'qty')::INTEGER;
    v_discan := COALESCE((v_item->>'discan')::BOOLEAN, false);
    SELECT id, nama, harga INTO v_produk FROM produk_buku WHERE id = v_item->>'produk_id';
    INSERT INTO transaksi_buku_item (transaksi_id, produk_id, nama_produk, harga, qty, subtotal, discan)
    VALUES (v_id, v_produk.id, v_produk.nama, v_produk.harga, v_qty, v_produk.harga * v_qty, v_discan);
  END LOOP;

  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.simpan_transaksi_buku(TEXT, DATE, TEXT, NUMERIC, TEXT, JSONB) FROM public;
GRANT EXECUTE ON FUNCTION public.simpan_transaksi_buku(TEXT, DATE, TEXT, NUMERIC, TEXT, JSONB) TO authenticated;

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.produk_buku         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.setor_buku          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaksi_buku      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaksi_buku_item ENABLE ROW LEVEL SECURITY;

-- Produk: semua user login boleh membaca; yang mengelola Owner/Administrator/Supervisor.
DROP POLICY IF EXISTS produk_buku_select ON public.produk_buku;
CREATE POLICY produk_buku_select ON public.produk_buku FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS produk_buku_write ON public.produk_buku;
CREATE POLICY produk_buku_write ON public.produk_buku FOR ALL TO authenticated
  USING (COALESCE(public.log_spp_peran() IN ('Owner', 'Administrator', 'Supervisor'), false))
  WITH CHECK (COALESCE(public.log_spp_peran() IN ('Owner', 'Administrator', 'Supervisor'), false));

-- Transaksi: guru hanya membuat atas namanya sendiri, berstatus Menunggu.
-- Validasi, setor, dan sinkron Odoo = boleh_validasi_spp() (Owner,
-- Administrator, Supervisor, Learning Koordinator).
DROP POLICY IF EXISTS transaksi_buku_select ON public.transaksi_buku;
CREATE POLICY transaksi_buku_select ON public.transaksi_buku FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS transaksi_buku_insert ON public.transaksi_buku;
CREATE POLICY transaksi_buku_insert ON public.transaksi_buku FOR INSERT TO authenticated
  WITH CHECK (status = 'Menunggu' AND setor_id IS NULL AND dicatat_oleh_id = public.current_guru_id());
DROP POLICY IF EXISTS transaksi_buku_update ON public.transaksi_buku;
CREATE POLICY transaksi_buku_update ON public.transaksi_buku FOR UPDATE TO authenticated
  USING (public.boleh_validasi_spp()) WITH CHECK (public.boleh_validasi_spp());
DROP POLICY IF EXISTS transaksi_buku_delete ON public.transaksi_buku;
CREATE POLICY transaksi_buku_delete ON public.transaksi_buku FOR DELETE TO authenticated
  USING (COALESCE(public.log_spp_peran() IN ('Owner', 'Administrator', 'Supervisor'), false));

DROP POLICY IF EXISTS transaksi_buku_item_select ON public.transaksi_buku_item;
CREATE POLICY transaksi_buku_item_select ON public.transaksi_buku_item FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS transaksi_buku_item_insert ON public.transaksi_buku_item;
CREATE POLICY transaksi_buku_item_insert ON public.transaksi_buku_item FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.transaksi_buku t
    WHERE t.id = transaksi_id AND t.status = 'Menunggu' AND t.dicatat_oleh_id = public.current_guru_id()
  ));
DROP POLICY IF EXISTS transaksi_buku_item_write ON public.transaksi_buku_item;
CREATE POLICY transaksi_buku_item_write ON public.transaksi_buku_item FOR UPDATE TO authenticated
  USING (public.boleh_validasi_spp()) WITH CHECK (public.boleh_validasi_spp());
DROP POLICY IF EXISTS transaksi_buku_item_delete ON public.transaksi_buku_item;
CREATE POLICY transaksi_buku_item_delete ON public.transaksi_buku_item FOR DELETE TO authenticated
  USING (COALESCE(public.log_spp_peran() IN ('Owner', 'Administrator', 'Supervisor'), false));

DROP POLICY IF EXISTS setor_buku_select ON public.setor_buku;
CREATE POLICY setor_buku_select ON public.setor_buku FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS setor_buku_write ON public.setor_buku;
CREATE POLICY setor_buku_write ON public.setor_buku FOR ALL TO authenticated
  USING (public.boleh_validasi_spp()) WITH CHECK (public.boleh_validasi_spp());

-- Cek setelah dijalankan (SQL Editor tidak menampilkan RAISE NOTICE):
--   SELECT to_regclass('public.produk_buku'), to_regclass('public.transaksi_buku'),
--          to_regclass('public.transaksi_buku_item'), to_regclass('public.setor_buku'),
--          to_regprocedure('public.simpan_transaksi_buku(text,date,text,numeric,text,jsonb)');
--   → kelimanya harus terisi, bukan NULL.
