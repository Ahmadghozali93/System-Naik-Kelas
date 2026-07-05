-- ============================================================
-- Tambah kolom comment_id ke task_attachments
-- Jalankan di Supabase SQL Editor
-- ============================================================

ALTER TABLE task_attachments
  ADD COLUMN IF NOT EXISTS comment_id UUID REFERENCES task_comments(id) ON DELETE CASCADE;

-- Index untuk query per komentar
CREATE INDEX IF NOT EXISTS idx_task_attachments_comment_id ON task_attachments(comment_id);
