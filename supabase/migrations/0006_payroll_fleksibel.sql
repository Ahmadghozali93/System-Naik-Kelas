-- ============================================================
-- 0006 — PAYROLL FLEKSIBEL (mesin gaji berbasis komponen)
--
-- TIDAK DESTRUKTIF: tidak ada DROP TABLE / DROP COLUMN / TRUNCATE.
-- Tabel payroll lama (salary_components, employee_salaries, payrolls,
-- payroll_items, loans, loan_deductions) DIBIARKAN UTUH.
-- Migrasi datanya dikerjakan terpisah di Fase 4.
--
-- Menyesuaikan struktur asli project (hasil inventarisasi Fase 0):
--   • karyawan  = gurus.id (TEXT), bukan uuid
--   • cabang    = units.id (TEXT) — kolom dinamai unit_id, ikut payroll lama
--   • jenjang & jenis kelas TIDAK ADA → matriks tarif memakai programs.id
--   • jurnal_entries dibiarkan apa adanya (belum ada verifikasi)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ============================================================
-- 0. IZIN KHUSUS PAYROLL
--    Flag terpisah, tidak menumpang flag modul lain.
-- ============================================================
ALTER TABLE public.gurus
  ADD COLUMN IF NOT EXISTS boleh_kelola_payroll BOOLEAN NOT NULL DEFAULT false;

-- Owner (lintas cabang)
CREATE OR REPLACE FUNCTION public.payroll_is_owner()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT role = 'Owner' FROM gurus WHERE auth_user_id = auth.uid() LIMIT 1), false);
$$;

-- Pengelola payroll (dibatasi cabangnya sendiri)
CREATE OR REPLACE FUNCTION public.payroll_boleh_kelola()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT boleh_kelola_payroll FROM gurus WHERE auth_user_id = auth.uid() LIMIT 1), false);
$$;

-- Cabang yang boleh dikelola user ini
CREATE OR REPLACE FUNCTION public.payroll_unit_ids()
RETURNS TEXT[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT ARRAY_AGG(gu.unit_id)
    FROM guru_units gu JOIN gurus g ON g.id = gu.guru_id
    WHERE g.auth_user_id = auth.uid()
  ), '{}'::TEXT[]);
$$;

-- Anti privilege escalation: hanya Owner yang boleh mengubah flag payroll.
CREATE OR REPLACE FUNCTION public.cegah_ubah_flag_payroll()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.boleh_kelola_payroll IS DISTINCT FROM OLD.boleh_kelola_payroll
     AND NOT public.payroll_is_owner() THEN
    RAISE EXCEPTION 'Hanya Owner yang boleh mengubah izin kelola payroll.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cegah_ubah_flag_payroll ON public.gurus;
CREATE TRIGGER trg_cegah_ubah_flag_payroll
  BEFORE UPDATE ON public.gurus
  FOR EACH ROW EXECUTE FUNCTION public.cegah_ubah_flag_payroll();


-- ============================================================
-- 1. KOMPONEN_GAJI — master "resep" perhitungan
--    Semua aturan/nominal disimpan di kolom `konfigurasi` (JSONB),
--    sehingga menambah komponen baru = menambah BARIS, bukan kolom.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.komponen_gaji (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id           TEXT REFERENCES public.units(id) ON DELETE CASCADE,  -- NULL = berlaku global
  kode              TEXT NOT NULL,
  nama              TEXT NOT NULL,
  kategori          TEXT NOT NULL CHECK (kategori IN ('pendapatan','potongan')),
  tipe_perhitungan  TEXT NOT NULL CHECK (tipe_perhitungan IN ('nominal_tetap','per_unit','bersyarat','bertingkat')),
  konfigurasi       JSONB,
  kena_pajak        BOOLEAN NOT NULL DEFAULT false,
  urutan_tampil     INT     NOT NULL DEFAULT 0,
  aktif             BOOLEAN NOT NULL DEFAULT false,
  dibuat_pada       TIMESTAMPTZ NOT NULL DEFAULT now(),
  diubah_pada       TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Kode unik per cabang; untuk komponen global (unit_id NULL) unik secara menyeluruh
CREATE UNIQUE INDEX IF NOT EXISTS uniq_komponen_kode_unit
  ON public.komponen_gaji (unit_id, kode) WHERE unit_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_komponen_kode_global
  ON public.komponen_gaji (kode) WHERE unit_id IS NULL;


-- ============================================================
-- 2. PAKET_GAJI — template per jabatan
-- ============================================================
CREATE TABLE IF NOT EXISTS public.paket_gaji (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id     TEXT REFERENCES public.units(id) ON DELETE CASCADE,
  nama        TEXT NOT NULL,
  keterangan  TEXT,
  aktif       BOOLEAN NOT NULL DEFAULT true,
  dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT now(),
  diubah_pada TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.paket_gaji_komponen (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paket_gaji_id         UUID NOT NULL REFERENCES public.paket_gaji(id) ON DELETE CASCADE,
  komponen_gaji_id      UUID NOT NULL REFERENCES public.komponen_gaji(id) ON DELETE RESTRICT,
  konfigurasi_override  JSONB,
  UNIQUE (paket_gaji_id, komponen_gaji_id)
);


-- ============================================================
-- 3. KARYAWAN_KOMPONEN — komponen yang menempel ke karyawan
--    berlaku_mulai/selesai menjaga histori: kalau gaji naik Juli,
--    slip Juni tetap memakai angka lama.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.karyawan_komponen (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guru_id               TEXT NOT NULL REFERENCES public.gurus(id) ON DELETE CASCADE,
  komponen_gaji_id      UUID NOT NULL REFERENCES public.komponen_gaji(id) ON DELETE RESTRICT,
  konfigurasi_override  JSONB,
  berlaku_mulai         DATE NOT NULL,
  berlaku_selesai       DATE,
  aktif                 BOOLEAN NOT NULL DEFAULT true,
  dibuat_pada           TIMESTAMPTZ NOT NULL DEFAULT now(),
  diubah_pada           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (berlaku_selesai IS NULL OR berlaku_selesai >= berlaku_mulai)
);
-- Cegah periode tumpang tindih untuk karyawan + komponen yang sama
ALTER TABLE public.karyawan_komponen DROP CONSTRAINT IF EXISTS kk_tanpa_tumpang_tindih;
ALTER TABLE public.karyawan_komponen ADD CONSTRAINT kk_tanpa_tumpang_tindih
  EXCLUDE USING gist (
    guru_id          WITH =,
    komponen_gaji_id WITH =,
    daterange(berlaku_mulai, berlaku_selesai, '[]') WITH &&
  ) WHERE (aktif);

CREATE INDEX IF NOT EXISTS idx_kk_guru ON public.karyawan_komponen(guru_id);


-- ============================================================
-- 4. PERIODE_PAYROLL
-- ============================================================
CREATE TABLE IF NOT EXISTS public.periode_payroll (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id        TEXT NOT NULL REFERENCES public.units(id) ON DELETE RESTRICT,
  tahun          INT  NOT NULL CHECK (tahun BETWEEN 2020 AND 2100),
  bulan          INT  NOT NULL CHECK (bulan BETWEEN 1 AND 12),
  status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','terkunci','dibayar')),
  tanggal_kunci  TIMESTAMPTZ,
  tanggal_bayar  TIMESTAMPTZ,
  dikunci_oleh   TEXT REFERENCES public.gurus(id) ON DELETE SET NULL,
  catatan        TEXT,
  dibuat_pada    TIMESTAMPTZ NOT NULL DEFAULT now(),
  diubah_pada    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (unit_id, tahun, bulan)
);


-- ============================================================
-- 5. SLIP_GAJI
--    Semua uang memakai NUMERIC (bukan float) agar tidak ada
--    pembulatan yang menyesatkan.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.slip_gaji (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  periode_payroll_id  UUID NOT NULL REFERENCES public.periode_payroll(id) ON DELETE CASCADE,
  guru_id             TEXT NOT NULL REFERENCES public.gurus(id) ON DELETE RESTRICT,
  total_pendapatan    NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_potongan      NUMERIC(14,2) NOT NULL DEFAULT 0,
  gaji_bersih         NUMERIC(14,2) NOT NULL DEFAULT 0,
  snapshot_karyawan   JSONB,            -- nama/jabatan/cabang SAAT slip dibuat
  status              TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','terkunci','dibayar')),
  butuh_ditinjau      BOOLEAN NOT NULL DEFAULT false,
  peringatan          JSONB,            -- daftar peringatan perhitungan
  catatan             TEXT,
  dibuat_pada         TIMESTAMPTZ NOT NULL DEFAULT now(),
  diubah_pada         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (periode_payroll_id, guru_id)
);
CREATE INDEX IF NOT EXISTS idx_slip_guru ON public.slip_gaji(guru_id);


-- ============================================================
-- 6. SLIP_GAJI_DETAIL — rincian per komponen (SNAPSHOT)
--    nama_komponen sengaja DISALIN, bukan JOIN: slip yang sudah
--    dicetak tidak boleh ikut berubah kalau master diubah.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.slip_gaji_detail (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slip_gaji_id       UUID NOT NULL REFERENCES public.slip_gaji(id) ON DELETE CASCADE,
  komponen_gaji_id   UUID REFERENCES public.komponen_gaji(id) ON DELETE SET NULL,  -- NULL = penyesuaian manual
  nama_komponen      TEXT NOT NULL,
  kategori           TEXT NOT NULL CHECK (kategori IN ('pendapatan','potongan')),
  urutan_tampil      INT  NOT NULL DEFAULT 0,
  jumlah_unit        NUMERIC(12,2),
  tarif_per_unit     NUMERIC(14,2),
  nominal            NUMERIC(14,2) NOT NULL DEFAULT 0,
  keterangan_hitung  TEXT,             -- mis. "48 sesi x Rp 25.000"
  sumber             TEXT NOT NULL DEFAULT 'otomatis' CHECK (sumber IN ('otomatis','manual')),
  alasan             TEXT,
  data_mentah        JSONB,            -- angka absensi/KPI/jurnal yang dipakai
  dibuat_pada        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Penyesuaian manual WAJIB punya alasan
  CHECK (sumber <> 'manual' OR (alasan IS NOT NULL AND length(btrim(alasan)) > 0))
);
CREATE INDEX IF NOT EXISTS idx_detail_slip ON public.slip_gaji_detail(slip_gaji_id);


-- ============================================================
-- 7. Trigger diubah_pada (pakai fungsi yang sudah ada di project)
-- ============================================================
-- Fungsi pendamping (update_modified_column() memakai kolom updated_at,
-- tabel payroll ini memakai diubah_pada)
CREATE OR REPLACE FUNCTION public.set_diubah_pada()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.diubah_pada = now();
  RETURN NEW;
END $$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['komponen_gaji','paket_gaji','karyawan_komponen','periode_payroll','slip_gaji'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_diubah ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_diubah BEFORE UPDATE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.set_diubah_pada()', t, t);
  END LOOP;
END $$;


-- ============================================================
-- 8. RLS — semua tabel wajib punya policy
--    • Karyawan  : hanya slip MILIKNYA dan hanya yang sudah 'dibayar'
--    • Pengelola : penuh, TERBATAS cabangnya sendiri
--    • Owner     : semua cabang
-- ============================================================
ALTER TABLE public.komponen_gaji       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paket_gaji          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paket_gaji_komponen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.karyawan_komponen   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.periode_payroll     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slip_gaji           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slip_gaji_detail    ENABLE ROW LEVEL SECURITY;

-- Pengelola cabang ini? (unit_id NULL = global, hanya Owner)
CREATE OR REPLACE FUNCTION public.payroll_kelola_unit(p_unit_id TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.payroll_is_owner()
      OR (p_unit_id IS NOT NULL
          AND public.payroll_boleh_kelola()
          AND p_unit_id = ANY(public.payroll_unit_ids()));
$$;

-- ── komponen_gaji ──
DROP POLICY IF EXISTS kg_select ON public.komponen_gaji;
DROP POLICY IF EXISTS kg_write  ON public.komponen_gaji;
CREATE POLICY kg_select ON public.komponen_gaji FOR SELECT TO authenticated
  USING (public.payroll_is_owner() OR unit_id IS NULL OR public.payroll_kelola_unit(unit_id));
CREATE POLICY kg_write ON public.komponen_gaji FOR ALL TO authenticated
  USING (public.payroll_is_owner() OR public.payroll_kelola_unit(unit_id))
  WITH CHECK (public.payroll_is_owner() OR public.payroll_kelola_unit(unit_id));

-- ── paket_gaji ──
DROP POLICY IF EXISTS pg_select ON public.paket_gaji;
DROP POLICY IF EXISTS pg_write  ON public.paket_gaji;
CREATE POLICY pg_select ON public.paket_gaji FOR SELECT TO authenticated
  USING (public.payroll_is_owner() OR public.payroll_kelola_unit(unit_id));
CREATE POLICY pg_write ON public.paket_gaji FOR ALL TO authenticated
  USING (public.payroll_is_owner() OR public.payroll_kelola_unit(unit_id))
  WITH CHECK (public.payroll_is_owner() OR public.payroll_kelola_unit(unit_id));

-- ── paket_gaji_komponen (ikut induknya) ──
DROP POLICY IF EXISTS pgk_all ON public.paket_gaji_komponen;
CREATE POLICY pgk_all ON public.paket_gaji_komponen FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.paket_gaji p
                 WHERE p.id = paket_gaji_id
                   AND (public.payroll_is_owner() OR public.payroll_kelola_unit(p.unit_id))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.paket_gaji p
                 WHERE p.id = paket_gaji_id
                   AND (public.payroll_is_owner() OR public.payroll_kelola_unit(p.unit_id))));

-- ── karyawan_komponen: karyawan boleh LIHAT miliknya, tidak boleh mengubah ──
DROP POLICY IF EXISTS kk_select ON public.karyawan_komponen;
DROP POLICY IF EXISTS kk_write  ON public.karyawan_komponen;
CREATE POLICY kk_select ON public.karyawan_komponen FOR SELECT TO authenticated
  USING (
    public.payroll_is_owner()
    OR guru_id = public.absensi_guru_id()
    OR (public.payroll_boleh_kelola() AND EXISTS (
          SELECT 1 FROM public.guru_units gu
          WHERE gu.guru_id = karyawan_komponen.guru_id
            AND gu.unit_id = ANY(public.payroll_unit_ids())))
  );
CREATE POLICY kk_write ON public.karyawan_komponen FOR ALL TO authenticated
  USING (
    public.payroll_is_owner()
    OR (public.payroll_boleh_kelola() AND EXISTS (
          SELECT 1 FROM public.guru_units gu
          WHERE gu.guru_id = karyawan_komponen.guru_id
            AND gu.unit_id = ANY(public.payroll_unit_ids())))
  )
  WITH CHECK (
    public.payroll_is_owner()
    OR (public.payroll_boleh_kelola() AND EXISTS (
          SELECT 1 FROM public.guru_units gu
          WHERE gu.guru_id = karyawan_komponen.guru_id
            AND gu.unit_id = ANY(public.payroll_unit_ids())))
  );

-- ── periode_payroll ──
DROP POLICY IF EXISTS pp_select ON public.periode_payroll;
DROP POLICY IF EXISTS pp_write  ON public.periode_payroll;
CREATE POLICY pp_select ON public.periode_payroll FOR SELECT TO authenticated
  USING (public.payroll_is_owner() OR public.payroll_kelola_unit(unit_id));
CREATE POLICY pp_write ON public.periode_payroll FOR ALL TO authenticated
  USING (public.payroll_is_owner() OR public.payroll_kelola_unit(unit_id))
  WITH CHECK (public.payroll_is_owner() OR public.payroll_kelola_unit(unit_id));

-- ── slip_gaji ──
-- Karyawan: HANYA slip sendiri, HANYA yang sudah 'dibayar'.
DROP POLICY IF EXISTS sg_select ON public.slip_gaji;
DROP POLICY IF EXISTS sg_write  ON public.slip_gaji;
CREATE POLICY sg_select ON public.slip_gaji FOR SELECT TO authenticated
  USING (
    public.payroll_is_owner()
    OR (guru_id = public.absensi_guru_id() AND status = 'dibayar')
    OR EXISTS (SELECT 1 FROM public.periode_payroll pp
               WHERE pp.id = periode_payroll_id AND public.payroll_kelola_unit(pp.unit_id))
  );
CREATE POLICY sg_write ON public.slip_gaji FOR ALL TO authenticated
  USING (
    public.payroll_is_owner()
    OR EXISTS (SELECT 1 FROM public.periode_payroll pp
               WHERE pp.id = periode_payroll_id AND public.payroll_kelola_unit(pp.unit_id))
  )
  WITH CHECK (
    public.payroll_is_owner()
    OR EXISTS (SELECT 1 FROM public.periode_payroll pp
               WHERE pp.id = periode_payroll_id AND public.payroll_kelola_unit(pp.unit_id))
  );

-- ── slip_gaji_detail (ikut slip induknya) ──
DROP POLICY IF EXISTS sgd_select ON public.slip_gaji_detail;
DROP POLICY IF EXISTS sgd_write  ON public.slip_gaji_detail;
CREATE POLICY sgd_select ON public.slip_gaji_detail FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.slip_gaji s
    WHERE s.id = slip_gaji_id
      AND (public.payroll_is_owner()
           OR (s.guru_id = public.absensi_guru_id() AND s.status = 'dibayar')
           OR EXISTS (SELECT 1 FROM public.periode_payroll pp
                      WHERE pp.id = s.periode_payroll_id AND public.payroll_kelola_unit(pp.unit_id)))
  ));
CREATE POLICY sgd_write ON public.slip_gaji_detail FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.slip_gaji s JOIN public.periode_payroll pp ON pp.id = s.periode_payroll_id
    WHERE s.id = slip_gaji_id AND (public.payroll_is_owner() OR public.payroll_kelola_unit(pp.unit_id))))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.slip_gaji s JOIN public.periode_payroll pp ON pp.id = s.periode_payroll_id
    WHERE s.id = slip_gaji_id AND (public.payroll_is_owner() OR public.payroll_kelola_unit(pp.unit_id))));


-- ============================================================
-- 9. SEED — 4 komponen KOSONG.
--    Sengaja TANPA nominal/tarif/ambang batas apa pun, dan aktif = false.
--    Semua angka diisi sendiri lewat UI (Fase 3).
-- ============================================================
INSERT INTO public.komponen_gaji (unit_id, kode, nama, kategori, tipe_perhitungan, konfigurasi, urutan_tampil, aktif)
VALUES
  (NULL, 'GAJI_POKOK',   'Gaji Pokok',       'pendapatan', 'nominal_tetap', NULL, 10, false),
  (NULL, 'FEE_TM',       'Fee Tatap Muka',   'pendapatan', 'per_unit',      NULL, 20, false),
  (NULL, 'BONUS_HADIR',  'Bonus Kehadiran',  'pendapatan', 'bersyarat',     NULL, 30, false),
  (NULL, 'BONUS_KPI',    'Bonus Target KPI', 'pendapatan', 'bertingkat',    NULL, 40, false)
ON CONFLICT DO NOTHING;

-- ============================================================
-- SELESAI FASE 1.
-- Belum ada mesin perhitungan (Fase 2) dan belum ada UI (Fase 3).
-- ============================================================
