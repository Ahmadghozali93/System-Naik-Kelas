-- ============================================================
-- BONUS TIERS — tambahan untuk supabase_kpi_v2_schema.sql
-- Jalankan ini jika sudah punya tabel kpi yang lama tapi
-- belum punya tabel bonus_tiers dan kolom role_guru di gurus.
-- AMAN dijalankan berulang (IF NOT EXISTS / ON CONFLICT).
-- ============================================================

-- 1. Kolom role_guru di gurus (jika belum ada)
ALTER TABLE gurus
  ADD COLUMN IF NOT EXISTS role_guru TEXT
    CHECK (role_guru IN ('learning_coordinator', 'tutor'));

-- 2. Tabel bonus_tiers
CREATE TABLE IF NOT EXISTS bonus_tiers (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  role_guru     TEXT    NOT NULL CHECK (role_guru IN ('learning_coordinator', 'tutor')),
  tm_dari       INT     NOT NULL,
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

-- 3. Kolom tanggal_masuk di gurus (jika belum ada)
ALTER TABLE gurus
  ADD COLUMN IF NOT EXISTS tanggal_masuk DATE;

-- 4. Kolom tambahan di kpi_assessments (jika belum ada)
ALTER TABLE kpi_assessments
  ADD COLUMN IF NOT EXISTS jumlah_tm        INT,
  ADD COLUMN IF NOT EXISTS tm_minimum       INT,
  ADD COLUMN IF NOT EXISTS status_kelayakan TEXT
    CHECK (status_kelayakan IN ('LAYAK', 'TIDAK LAYAK'));

-- 5. Seed tier default (aman dijalankan ulang)
INSERT INTO bonus_tiers (role_guru, tm_dari, bonus_nominal) VALUES
  ('learning_coordinator', 200, 200000),
  ('learning_coordinator', 300, 300000),
  ('learning_coordinator', 400, 400000),
  ('tutor', 100, 100000),
  ('tutor', 200, 200000),
  ('tutor', 300, 300000)
ON CONFLICT (role_guru, tm_dari) DO NOTHING;
