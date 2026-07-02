-- ============================================================
-- KPI V2 SCHEMA — System Naik Kelas
-- Ganti total sistem KPI lama dengan 7 kriteria tetap
-- Jalankan di Supabase SQL Editor (baca WARNING di bawah)
-- ============================================================

-- ⚠️  WARNING: Script ini MENGHAPUS SEMUA data KPI yang ada
--    (penilaian, skor, target, indikator). Pastikan sudah
--    backup atau memang tidak ada data penting sebelum lanjut.

-- ============================================================
-- 1. TAMBAH KOLOM DI gurus
-- ============================================================
ALTER TABLE gurus
  ADD COLUMN IF NOT EXISTS tanggal_masuk DATE,
  ADD COLUMN IF NOT EXISTS role_guru     TEXT
    CHECK (role_guru IN ('learning_coordinator', 'tutor'));

-- ============================================================
-- 2. TAMBAH KOLOM DI kpi_assessments
-- ============================================================
ALTER TABLE kpi_assessments
  ADD COLUMN IF NOT EXISTS jumlah_tm        INT,
  ADD COLUMN IF NOT EXISTS tm_minimum       INT,
  ADD COLUMN IF NOT EXISTS status_kelayakan TEXT
    CHECK (status_kelayakan IN ('LAYAK', 'TIDAK LAYAK'));

-- ============================================================
-- 3. UPDATE CONSTRAINT source_field DI kpi_indicators
--    (nama constraint berbeda per instance, pakai dynamic SQL)
-- ============================================================
DO $$
DECLARE
  con TEXT;
BEGIN
  SELECT conname INTO con
  FROM pg_constraint
  WHERE conrelid = 'kpi_indicators'::regclass
    AND contype   = 'c'
    AND pg_get_constraintdef(oid) LIKE '%source_field%'
  LIMIT 1;

  IF con IS NOT NULL THEN
    EXECUTE 'ALTER TABLE kpi_indicators DROP CONSTRAINT ' || quote_ident(con);
  END IF;
END $$;

ALTER TABLE kpi_indicators
  ADD CONSTRAINT kpi_indicators_source_field_check
  CHECK (source_field IN ('komplain','keterlambatan','seragam','izin'));

-- ============================================================
-- 4. TABEL BARU: kpi_scoring_rules
-- ============================================================
CREATE TABLE IF NOT EXISTS kpi_scoring_rules (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_indicator_id  UUID         NOT NULL UNIQUE REFERENCES kpi_indicators(id) ON DELETE CASCADE,
  skor_maksimal     INT          NOT NULL DEFAULT 20,
  tier1_maks        INT,
  skor_tier1        INT          NOT NULL DEFAULT 0,
  tier2_maks        INT,
  skor_tier2        INT          NOT NULL DEFAULT 0,
  skor_tier3        INT          NOT NULL DEFAULT 0,
  deskripsi_aturan  TEXT,
  created_at        TIMESTAMPTZ  DEFAULT now()
);

ALTER TABLE kpi_scoring_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ksr_select"       ON kpi_scoring_rules;
DROP POLICY IF EXISTS "ksr_admin_insert" ON kpi_scoring_rules;
DROP POLICY IF EXISTS "ksr_admin_update" ON kpi_scoring_rules;
DROP POLICY IF EXISTS "ksr_admin_delete" ON kpi_scoring_rules;
CREATE POLICY "ksr_select"       ON kpi_scoring_rules FOR SELECT USING (true);
CREATE POLICY "ksr_admin_insert" ON kpi_scoring_rules FOR INSERT WITH CHECK (absensi_is_admin());
CREATE POLICY "ksr_admin_update" ON kpi_scoring_rules FOR UPDATE USING (absensi_is_admin());
CREATE POLICY "ksr_admin_delete" ON kpi_scoring_rules FOR DELETE USING (absensi_is_admin());

-- ============================================================
-- 5. TABEL BARU: kpi_complaints
-- ============================================================
CREATE TABLE IF NOT EXISTS kpi_complaints (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  guru_id         TEXT        NOT NULL REFERENCES gurus(id) ON DELETE CASCADE,
  periode_tahun   INT         NOT NULL,
  periode_bulan   INT         NOT NULL CHECK (periode_bulan BETWEEN 1 AND 12),
  kategori        TEXT        NOT NULL CHECK (kategori IN ('dihitung', 'toleransi')),
  deskripsi       TEXT        NOT NULL,
  dicatat_oleh    TEXT        REFERENCES gurus(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE kpi_complaints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kc_select"       ON kpi_complaints;
DROP POLICY IF EXISTS "kc_admin_insert" ON kpi_complaints;
DROP POLICY IF EXISTS "kc_admin_update" ON kpi_complaints;
DROP POLICY IF EXISTS "kc_admin_delete" ON kpi_complaints;
CREATE POLICY "kc_select"       ON kpi_complaints FOR SELECT USING (guru_id = absensi_guru_id() OR absensi_is_admin());
CREATE POLICY "kc_admin_insert" ON kpi_complaints FOR INSERT WITH CHECK (absensi_is_admin());
CREATE POLICY "kc_admin_update" ON kpi_complaints FOR UPDATE USING (absensi_is_admin());
CREATE POLICY "kc_admin_delete" ON kpi_complaints FOR DELETE USING (absensi_is_admin());

CREATE INDEX IF NOT EXISTS idx_kpi_complaints_guru    ON kpi_complaints(guru_id);
CREATE INDEX IF NOT EXISTS idx_kpi_complaints_periode ON kpi_complaints(periode_tahun, periode_bulan);

-- ============================================================
-- 6. TABEL BARU: bonus_tiers
--    Pemetaan role_guru + TM minimum → nominal bonus
--    Admin bisa edit threshold & nominal kapan saja
-- ============================================================
CREATE TABLE IF NOT EXISTS bonus_tiers (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  role_guru     TEXT    NOT NULL CHECK (role_guru IN ('learning_coordinator', 'tutor')),
  tm_dari       INT     NOT NULL,       -- TM minimum untuk tier ini
  bonus_nominal BIGINT  NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (role_guru, tm_dari)
);

ALTER TABLE bonus_tiers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bt_select"       ON bonus_tiers;
DROP POLICY IF EXISTS "bt_admin_insert" ON bonus_tiers;
DROP POLICY IF EXISTS "bt_admin_update" ON bonus_tiers;
DROP POLICY IF EXISTS "bt_admin_delete" ON bonus_tiers;
CREATE POLICY "bt_select"       ON bonus_tiers FOR SELECT USING (true);
CREATE POLICY "bt_admin_insert" ON bonus_tiers FOR INSERT WITH CHECK (absensi_is_admin());
CREATE POLICY "bt_admin_update" ON bonus_tiers FOR UPDATE USING (absensi_is_admin());
CREATE POLICY "bt_admin_delete" ON bonus_tiers FOR DELETE USING (absensi_is_admin());

-- Seed tier default (bisa diedit admin kapan saja di halaman Tier Bonus)
INSERT INTO bonus_tiers (role_guru, tm_dari, bonus_nominal) VALUES
  ('learning_coordinator', 200, 200000),
  ('learning_coordinator', 300, 300000),
  ('learning_coordinator', 400, 400000),
  ('tutor', 100, 100000),
  ('tutor', 200, 200000),
  ('tutor', 300, 300000)
ON CONFLICT (role_guru, tm_dari) DO NOTHING;

-- ============================================================
-- 7. BERSIHKAN DATA LAMA (urutan penting karena FK)
-- ============================================================
DELETE FROM kpi_scores;
DELETE FROM kpi_assessments;
DELETE FROM kpi_targets;
DELETE FROM kpi_scoring_rules;
DELETE FROM kpi_indicators;

-- ============================================================
-- 8. SEED 7 INDIKATOR BARU (UUID tetap supaya bisa di-referensi)
-- ============================================================
INSERT INTO kpi_indicators (id, nama, deskripsi, tipe, source_field, role_target, aktif) VALUES
  ('a0000000-0000-0000-0000-000000000001',
   'Komplain CS',
   'Komplain dari Customer Service yang dihitung (ngajar <30 menit, guru terlambat, ngajar >2 anak)',
   'Otomatis', 'komplain', '{}', true),

  ('a0000000-0000-0000-0000-000000000002',
   'Ketepatan Waktu Hadir',
   'Jumlah keterlambatan (status Telat) dalam 1 bulan berdasarkan data absensi',
   'Otomatis', 'keterlambatan', '{}', true),

  ('a0000000-0000-0000-0000-000000000003',
   'Kepatuhan Seragam & Tagname',
   'Jumlah hari seragam tidak sesuai berdasarkan validasi foto check-in',
   'Otomatis', 'seragam', '{}', true),

  ('a0000000-0000-0000-0000-000000000004',
   'Izin dalam 1 Bulan',
   'Jumlah pengajuan izin yang disetujui (bukan sakit/cuti) dalam 1 bulan',
   'Otomatis', 'izin', '{}', true),

  ('a0000000-0000-0000-0000-000000000005',
   'Pelaksanaan Piket Harian',
   'Jumlah hari tidak melaksanakan piket dalam 1 bulan (diisi atasan)',
   'Manual', null, '{}', true),

  ('a0000000-0000-0000-0000-000000000006',
   'Mengajar Lebih dari 1 Program',
   'Jumlah program yang diajarkan guru dalam 1 bulan (diisi atasan)',
   'Manual', null, '{}', true),

  ('a0000000-0000-0000-0000-000000000007',
   'Kualitas Mengajar',
   'Penilaian kualitas mengajar oleh atasan: 1 = Sesuai Metode, 0 = Tidak Sesuai',
   'Manual', null, '{}', true);

-- ============================================================
-- 9. SEED ATURAN SCORING PER INDIKATOR
-- ============================================================
INSERT INTO kpi_scoring_rules
  (kpi_indicator_id, skor_maksimal, tier1_maks, skor_tier1, tier2_maks, skor_tier2, skor_tier3, deskripsi_aturan)
VALUES
  -- 1. Komplain CS (maks 20): 0 komplain→20, ≥1→0
  ('a0000000-0000-0000-0000-000000000001',
   20, 0, 20, null, 0, 0,
   '0 komplain → 20 | ≥1 komplain → 0'),

  -- 2. Ketepatan Waktu (maks 20): 0x telat→20, 1–2x→10, ≥3x→0
  ('a0000000-0000-0000-0000-000000000002',
   20, 0, 20, 2, 10, 0,
   '0× telat → 20 | 1–2× → 10 | ≥3× → 0'),

  -- 3. Seragam (maks 15): 0x→15, 1–4x→8, ≥5x→0
  ('a0000000-0000-0000-0000-000000000003',
   15, 0, 15, 4, 8, 0,
   '0× tidak sesuai → 15 | 1–4× → 8 | ≥5× → 0'),

  -- 4. Izin (maks 15): 0–1x→15, 2–3x→8, ≥4x→0
  ('a0000000-0000-0000-0000-000000000004',
   15, 1, 15, 3, 8, 0,
   '0–1 izin → 15 | 2–3 → 8 | ≥4 → 0'),

  -- 5. Piket (maks 20): 0x tidak piket→20, 1–2x→10, >2x→0
  ('a0000000-0000-0000-0000-000000000005',
   20, 0, 20, 2, 10, 0,
   '0× tidak piket → 20 | 1–2× → 10 | >2× → 0'),

  -- 6. Multi-program (maks 5): 1 program→0, >1 program→5
  ('a0000000-0000-0000-0000-000000000006',
   5, 1, 0, null, 0, 5,
   '1 program → 0 | >1 program → 5'),

  -- 7. Kualitas (maks 5): 0=Tidak Sesuai→0, 1=Sesuai→5
  ('a0000000-0000-0000-0000-000000000007',
   5, 0, 0, null, 0, 5,
   '0 (Tidak Sesuai Metode) → 0 | 1 (Sesuai Metode) → 5');

-- ============================================================
-- SELESAI — Total skor maksimal: 20+20+15+15+20+5+5 = 100
-- ============================================================
