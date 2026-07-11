-- ============================================================
-- PENILAIAN MENGAJAR — System Naik Kelas
-- Jalankan seluruh file ini di Supabase SQL Editor
-- AMAN: hanya menambah 2 tabel baru, tidak menyentuh data lama.
-- Reuse helper yang sudah ada:
--   task_is_owner(), absensi_is_admin(), absensi_unit_ids(), absensi_guru_id()
-- Reuse tabel tag yang sudah ada: task_labels
-- ============================================================

-- ============================================================
-- 1. TEACHING_ASSESSMENTS — satu entri penilaian per guru per periode
-- ============================================================
CREATE TABLE IF NOT EXISTS teaching_assessments (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  judul         TEXT    NOT NULL,
  assignee_id   TEXT    NOT NULL REFERENCES gurus(id) ON DELETE CASCADE,   -- guru yang dinilai
  bulan         INT     NOT NULL CHECK (bulan BETWEEN 1 AND 12),
  tahun         INT     NOT NULL CHECK (tahun BETWEEN 2020 AND 2100),
  status        TEXT    NOT NULL DEFAULT 'Proses' CHECK (status IN ('Proses', 'Revisi', 'Approve')),
  deskripsi     TEXT,
  label_id      UUID    REFERENCES task_labels(id) ON DELETE SET NULL,      -- reuse tag task management
  unit_id       TEXT    NOT NULL REFERENCES units(id) ON DELETE CASCADE,    -- cabang
  dibuat_oleh   TEXT    REFERENCES gurus(id) ON DELETE SET NULL,
  approved_by   TEXT    REFERENCES gurus(id) ON DELETE SET NULL,
  approved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ta_assignee ON teaching_assessments(assignee_id);
CREATE INDEX IF NOT EXISTS idx_ta_unit     ON teaching_assessments(unit_id);
CREATE INDEX IF NOT EXISTS idx_ta_periode  ON teaching_assessments(tahun, bulan);

ALTER TABLE teaching_assessments ENABLE ROW LEVEL SECURITY;

-- ── Helper SECURITY DEFINER (dipakai policy komentar, hindari rekursi RLS) ──
CREATE OR REPLACE FUNCTION ta_get_unit(p_id UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT unit_id FROM teaching_assessments WHERE id = p_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION ta_get_assignee(p_id UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT assignee_id FROM teaching_assessments WHERE id = p_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION ta_get_creator(p_id UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT dibuat_oleh FROM teaching_assessments WHERE id = p_id LIMIT 1;
$$;

-- ── RLS teaching_assessments ──
DROP POLICY IF EXISTS "tsa_select" ON teaching_assessments;
DROP POLICY IF EXISTS "tsa_insert" ON teaching_assessments;
DROP POLICY IF EXISTS "tsa_update" ON teaching_assessments;
DROP POLICY IF EXISTS "tsa_delete" ON teaching_assessments;

-- Lihat: Owner, atau di cabang saya DAN (admin/SPV, atau saya guru yang dinilai, atau saya pembuatnya)
CREATE POLICY "tsa_select" ON teaching_assessments FOR SELECT
  USING (
    task_is_owner()
    OR (unit_id = ANY(absensi_unit_ids()) AND (
      absensi_is_admin()
      OR assignee_id = absensi_guru_id()
      OR dibuat_oleh = absensi_guru_id()
    ))
  );

-- Buat: Owner, atau admin/SPV di cabang itu
CREATE POLICY "tsa_insert" ON teaching_assessments FOR INSERT
  WITH CHECK (
    task_is_owner()
    OR (unit_id = ANY(absensi_unit_ids()) AND absensi_is_admin())
  );

-- Ubah status/isi & approve: Owner, atau admin/SPV di cabang itu
CREATE POLICY "tsa_update" ON teaching_assessments FOR UPDATE
  USING (
    task_is_owner()
    OR (unit_id = ANY(absensi_unit_ids()) AND absensi_is_admin())
  );

-- Hapus: Owner, atau admin/SPV di cabang itu
CREATE POLICY "tsa_delete" ON teaching_assessments FOR DELETE
  USING (
    task_is_owner()
    OR (unit_id = ANY(absensi_unit_ids()) AND absensi_is_admin())
  );

-- ============================================================
-- 2. TEACHING_ASSESSMENT_COMMENTS — diskusi di dalam entri (pola task_comments)
-- ============================================================
CREATE TABLE IF NOT EXISTS teaching_assessment_comments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES teaching_assessments(id) ON DELETE CASCADE,
  guru_id       TEXT NOT NULL REFERENCES gurus(id) ON DELETE CASCADE,
  isi           TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tac_assessment ON teaching_assessment_comments(assessment_id);

ALTER TABLE teaching_assessment_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tac_select" ON teaching_assessment_comments;
DROP POLICY IF EXISTS "tac_insert" ON teaching_assessment_comments;
DROP POLICY IF EXISTS "tac_delete" ON teaching_assessment_comments;

-- Lihat komentar: sama dengan yang boleh lihat penilaiannya (termasuk guru yang dinilai)
CREATE POLICY "tac_select" ON teaching_assessment_comments FOR SELECT
  USING (
    task_is_owner()
    OR (ta_get_unit(assessment_id) = ANY(absensi_unit_ids()) AND (
      absensi_is_admin()
      OR ta_get_assignee(assessment_id) = absensi_guru_id()
      OR ta_get_creator(assessment_id) = absensi_guru_id()
    ))
  );

-- Tulis komentar: harus komentar atas nama sendiri DAN boleh lihat penilaiannya
CREATE POLICY "tac_insert" ON teaching_assessment_comments FOR INSERT
  WITH CHECK (
    guru_id = absensi_guru_id()
    AND (
      task_is_owner()
      OR (ta_get_unit(assessment_id) = ANY(absensi_unit_ids()) AND (
        absensi_is_admin()
        OR ta_get_assignee(assessment_id) = absensi_guru_id()
        OR ta_get_creator(assessment_id) = absensi_guru_id()
      ))
    )
  );

-- Hapus komentar: penulisnya sendiri, atau admin/SPV, atau Owner
CREATE POLICY "tac_delete" ON teaching_assessment_comments FOR DELETE
  USING (guru_id = absensi_guru_id() OR absensi_is_admin() OR task_is_owner());

-- ============================================================
-- SELESAI. Catatan:
-- - Kunci setelah Approve ditangani di aplikasi (field disable + tombol
--   "Buka Kembali" untuk admin), bukan di database, agar tetap fleksibel.
-- - Cegah dobel (guru+bulan+tahun) = peringatan di aplikasi, bukan constraint,
--   agar tetap bisa dibuat bila memang disengaja.
-- ============================================================
