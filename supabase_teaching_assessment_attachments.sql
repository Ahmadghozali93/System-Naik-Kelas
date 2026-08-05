-- ============================================================
-- FOTO LAMPIRAN KOMENTAR — PENILAIAN MENGAJAR
-- Jalankan seluruh file ini di Supabase SQL Editor
-- AMAN: hanya menambah 1 tabel baru + 1 cron job, tidak menyentuh data lama.
--
-- Mengikuti model yang sama dengan Task Management:
--   - tabel task_attachments        → teaching_assessment_attachments
--   - bucket 'task-photos' DIPAKAI ULANG, prefix path 'assessments/<id>/...'
--     (policy storage sudah "authenticated" saja, jadi tidak perlu bucket baru)
--   - masa simpan 45 hari, ditandai is_expired oleh pg_cron,
--     file fisik dihapus Edge Function cleanup-task-photos
--
-- Prasyarat: supabase_teaching_assessment.sql & supabase_task_management.sql
--            sudah dijalankan (butuh helper ta_get_*, absensi_*, task_is_owner).
-- ============================================================

-- ============================================================
-- 1. TABEL
-- ============================================================
CREATE TABLE IF NOT EXISTS teaching_assessment_attachments (
  id                 UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id      UUID    NOT NULL REFERENCES teaching_assessments(id) ON DELETE CASCADE,
  comment_id         UUID    REFERENCES teaching_assessment_comments(id) ON DELETE CASCADE,
  guru_id            TEXT    NOT NULL REFERENCES gurus(id) ON DELETE CASCADE,
  storage_path       TEXT,
  original_name      TEXT    NOT NULL,
  mime_type          TEXT    NOT NULL
    CHECK (mime_type IN ('image/jpeg', 'image/jpg', 'image/png', 'image/webp')),
  size_bytes         INT,
  uploaded_at        TIMESTAMPTZ DEFAULT now(),
  expires_at         TIMESTAMPTZ DEFAULT (now() + INTERVAL '45 days'),
  is_expired         BOOLEAN NOT NULL DEFAULT false,
  storage_deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_taa_assessment ON teaching_assessment_attachments(assessment_id);
CREATE INDEX IF NOT EXISTS idx_taa_comment    ON teaching_assessment_attachments(comment_id);

ALTER TABLE teaching_assessment_attachments ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. RLS — mengikuti aturan komentar (tac_*)
-- ============================================================
DROP POLICY IF EXISTS "taa_select" ON teaching_assessment_attachments;
DROP POLICY IF EXISTS "taa_insert" ON teaching_assessment_attachments;
DROP POLICY IF EXISTS "taa_delete" ON teaching_assessment_attachments;

-- Lihat: sama dengan yang boleh lihat penilaiannya (termasuk guru yang dinilai)
CREATE POLICY "taa_select" ON teaching_assessment_attachments FOR SELECT
  USING (
    task_is_owner()
    OR (ta_get_unit(assessment_id) = ANY(absensi_unit_ids()) AND (
      absensi_is_admin()
      OR ta_get_assignee(assessment_id) = absensi_guru_id()
      OR ta_get_creator(assessment_id) = absensi_guru_id()
    ))
  );

-- Upload: harus atas nama sendiri DAN boleh lihat penilaiannya
CREATE POLICY "taa_insert" ON teaching_assessment_attachments FOR INSERT
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

-- Hapus: pengunggahnya sendiri, atau admin/SPV, atau Owner
CREATE POLICY "taa_delete" ON teaching_assessment_attachments FOR DELETE
  USING (guru_id = absensi_guru_id() OR absensi_is_admin() OR task_is_owner());

-- ============================================================
-- 3. AUTO-EXPIRE — pg_cron, tiap tengah malam WIB (17:00 UTC)
-- Sama polanya dengan 'task-mark-expired-photos'
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Idempoten: hapus job lama bila sudah pernah dibuat
SELECT cron.unschedule('ta-mark-expired-photos')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ta-mark-expired-photos');

SELECT cron.schedule(
  'ta-mark-expired-photos',
  '5 17 * * *',
  $$UPDATE teaching_assessment_attachments
    SET is_expired = true
    WHERE expires_at < now() AND is_expired = false$$
);

-- ============================================================
-- SELESAI. Catatan:
-- - File fisik di Storage dihapus oleh Edge Function cleanup-task-photos
--   yang sudah diperbarui untuk memproses kedua tabel. Deploy ulang:
--       supabase functions deploy cleanup-task-photos
-- - Path file: assessments/<assessment_id>/<uuid>.<ext> di bucket 'task-photos'.
-- ============================================================
