-- ============================================================
-- SCHEMA KPI KARYAWAN — System Naik Kelas
-- Jalankan di Supabase SQL Editor setelah supabase_absensi_schema.sql
-- Fungsi helper (absensi_is_admin, absensi_guru_id) sudah ada dari schema absensi
-- ============================================================


-- ============================================================
-- 1. KPI_INDICATORS — master indikator penilaian kinerja
-- ============================================================
CREATE TABLE IF NOT EXISTS kpi_indicators (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  nama          TEXT         NOT NULL,
  deskripsi     TEXT,
  role_target   TEXT[]       NOT NULL DEFAULT '{}',
  tipe          TEXT         NOT NULL DEFAULT 'Manual'
                             CHECK (tipe IN ('Manual', 'Otomatis')),
  source_field  TEXT         CHECK (source_field IN ('kehadiran', 'ketepatan_waktu', 'lembur')),
  aktif         BOOLEAN      NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ  DEFAULT now()
);

ALTER TABLE kpi_indicators ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ki_select"       ON kpi_indicators;
DROP POLICY IF EXISTS "ki_admin_insert" ON kpi_indicators;
DROP POLICY IF EXISTS "ki_admin_update" ON kpi_indicators;
DROP POLICY IF EXISTS "ki_admin_delete" ON kpi_indicators;
CREATE POLICY "ki_select"       ON kpi_indicators FOR SELECT USING (true);
CREATE POLICY "ki_admin_insert" ON kpi_indicators FOR INSERT WITH CHECK (absensi_is_admin());
CREATE POLICY "ki_admin_update" ON kpi_indicators FOR UPDATE USING (absensi_is_admin());
CREATE POLICY "ki_admin_delete" ON kpi_indicators FOR DELETE USING (absensi_is_admin());


-- ============================================================
-- 2. KPI_TARGETS — bobot & target per indikator per periode
--    periode_bulan NULL = berlaku untuk semua bulan di tahun tsb
-- ============================================================
CREATE TABLE IF NOT EXISTS kpi_targets (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_indicator_id  UUID         NOT NULL REFERENCES kpi_indicators(id) ON DELETE CASCADE,
  periode_tahun     INT          NOT NULL,
  periode_bulan     INT          CHECK (periode_bulan BETWEEN 1 AND 12),
  bobot             NUMERIC(5,2) NOT NULL DEFAULT 0
                                 CHECK (bobot >= 0 AND bobot <= 100),
  target_nilai      NUMERIC(10,2) NOT NULL,
  satuan            TEXT         NOT NULL DEFAULT '%',
  created_at        TIMESTAMPTZ  DEFAULT now()
);

ALTER TABLE kpi_targets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kt_select"       ON kpi_targets;
DROP POLICY IF EXISTS "kt_admin_insert" ON kpi_targets;
DROP POLICY IF EXISTS "kt_admin_update" ON kpi_targets;
DROP POLICY IF EXISTS "kt_admin_delete" ON kpi_targets;
CREATE POLICY "kt_select"       ON kpi_targets FOR SELECT USING (true);
CREATE POLICY "kt_admin_insert" ON kpi_targets FOR INSERT WITH CHECK (absensi_is_admin());
CREATE POLICY "kt_admin_update" ON kpi_targets FOR UPDATE USING (absensi_is_admin());
CREATE POLICY "kt_admin_delete" ON kpi_targets FOR DELETE USING (absensi_is_admin());


-- ============================================================
-- 3. KPI_ASSESSMENTS — header penilaian per karyawan per periode
-- ============================================================
CREATE TABLE IF NOT EXISTS kpi_assessments (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  guru_id         TEXT         NOT NULL REFERENCES gurus(id) ON DELETE CASCADE,
  unit_id         TEXT         NOT NULL REFERENCES units(id),
  periode_tahun   INT          NOT NULL,
  periode_bulan   INT          NOT NULL CHECK (periode_bulan BETWEEN 1 AND 12),
  status          TEXT         NOT NULL DEFAULT 'Draft'
                               CHECK (status IN ('Draft', 'Submitted', 'Approved')),
  skor_akhir      NUMERIC(5,2),
  bonus_eligible  BOOLEAN      NOT NULL DEFAULT false,
  bonus_nominal   BIGINT       NOT NULL DEFAULT 0,
  dinilai_oleh    TEXT         REFERENCES gurus(id),
  disetujui_oleh  TEXT         REFERENCES gurus(id),
  catatan         TEXT,
  created_at      TIMESTAMPTZ  DEFAULT now(),
  UNIQUE(guru_id, periode_tahun, periode_bulan)
);

ALTER TABLE kpi_assessments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ka_select"       ON kpi_assessments;
DROP POLICY IF EXISTS "ka_admin_insert" ON kpi_assessments;
DROP POLICY IF EXISTS "ka_admin_update" ON kpi_assessments;
DROP POLICY IF EXISTS "ka_admin_delete" ON kpi_assessments;
-- Karyawan hanya lihat penilaian miliknya; admin lihat semua
CREATE POLICY "ka_select" ON kpi_assessments FOR SELECT USING (
  guru_id = absensi_guru_id() OR absensi_is_admin()
);
CREATE POLICY "ka_admin_insert" ON kpi_assessments FOR INSERT
  WITH CHECK (absensi_is_admin());
CREATE POLICY "ka_admin_update" ON kpi_assessments FOR UPDATE
  USING (absensi_is_admin());
-- Penilaian Approved tidak bisa dihapus
CREATE POLICY "ka_admin_delete" ON kpi_assessments FOR DELETE
  USING (absensi_is_admin() AND status != 'Approved');


-- ============================================================
-- 4. KPI_SCORES — skor per indikator dalam satu penilaian
-- ============================================================
CREATE TABLE IF NOT EXISTS kpi_scores (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_assessment_id   UUID         NOT NULL REFERENCES kpi_assessments(id) ON DELETE CASCADE,
  kpi_indicator_id    UUID         NOT NULL REFERENCES kpi_indicators(id),
  kpi_target_id       UUID         REFERENCES kpi_targets(id),
  nilai_aktual        NUMERIC(10,2),
  nilai_skor          NUMERIC(5,2)  NOT NULL DEFAULT 0,
  tipe                TEXT         NOT NULL DEFAULT 'Manual',
  catatan             TEXT,
  created_at          TIMESTAMPTZ  DEFAULT now()
);

ALTER TABLE kpi_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ks_select"       ON kpi_scores;
DROP POLICY IF EXISTS "ks_admin_insert" ON kpi_scores;
DROP POLICY IF EXISTS "ks_admin_update" ON kpi_scores;
DROP POLICY IF EXISTS "ks_admin_delete" ON kpi_scores;
-- Karyawan lihat skor miliknya via assessment
CREATE POLICY "ks_select" ON kpi_scores FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM kpi_assessments ka
    WHERE ka.id = kpi_assessment_id
      AND (ka.guru_id = absensi_guru_id() OR absensi_is_admin())
  )
);
CREATE POLICY "ks_admin_insert" ON kpi_scores FOR INSERT WITH CHECK (absensi_is_admin());
CREATE POLICY "ks_admin_update" ON kpi_scores FOR UPDATE USING (absensi_is_admin());
CREATE POLICY "ks_admin_delete" ON kpi_scores FOR DELETE USING (absensi_is_admin());


-- ============================================================
-- INDEX performa
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_kpi_targets_indicator    ON kpi_targets(kpi_indicator_id);
CREATE INDEX IF NOT EXISTS idx_kpi_targets_periode      ON kpi_targets(periode_tahun, periode_bulan);
CREATE INDEX IF NOT EXISTS idx_kpi_assessments_guru     ON kpi_assessments(guru_id);
CREATE INDEX IF NOT EXISTS idx_kpi_assessments_periode  ON kpi_assessments(periode_tahun, periode_bulan);
CREATE INDEX IF NOT EXISTS idx_kpi_assessments_unit     ON kpi_assessments(unit_id);
CREATE INDEX IF NOT EXISTS idx_kpi_assessments_status   ON kpi_assessments(status);
CREATE INDEX IF NOT EXISTS idx_kpi_scores_assessment    ON kpi_scores(kpi_assessment_id);
CREATE INDEX IF NOT EXISTS idx_kpi_scores_indicator     ON kpi_scores(kpi_indicator_id);
