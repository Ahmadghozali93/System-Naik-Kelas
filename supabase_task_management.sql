-- ============================================================
-- TASK MANAGEMENT — System Naik Kelas
-- Jalankan seluruh file ini di Supabase SQL Editor
-- AMAN dijalankan berulang (IF NOT EXISTS / ON CONFLICT)
-- ============================================================

-- ============================================================
-- HELPER: cek apakah user adalah Owner (lintas cabang)
-- ============================================================
CREATE OR REPLACE FUNCTION task_is_owner()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role = 'Owner' FROM gurus WHERE auth_user_id = auth.uid() LIMIT 1),
    false
  );
$$;

-- ============================================================
-- 1. TASK_STAGES — kolom Kanban, bisa diedit admin
-- ============================================================
CREATE TABLE IF NOT EXISTS task_stages (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  nama       TEXT    NOT NULL UNIQUE,
  urutan     INT     NOT NULL DEFAULT 0,
  warna      TEXT    NOT NULL DEFAULT '#6366f1',
  is_final   BOOLEAN NOT NULL DEFAULT false, -- stage "selesai" → set selesai_pada pada task
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE task_stages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ts_select"       ON task_stages;
DROP POLICY IF EXISTS "ts_admin_insert" ON task_stages;
DROP POLICY IF EXISTS "ts_admin_update" ON task_stages;
DROP POLICY IF EXISTS "ts_admin_delete" ON task_stages;

CREATE POLICY "ts_select"       ON task_stages FOR SELECT USING (true);
CREATE POLICY "ts_admin_insert" ON task_stages FOR INSERT WITH CHECK (absensi_is_admin());
CREATE POLICY "ts_admin_update" ON task_stages FOR UPDATE USING (absensi_is_admin());
CREATE POLICY "ts_admin_delete" ON task_stages FOR DELETE USING (absensi_is_admin());

-- ============================================================
-- 2. TASK_LABELS — label fungsi, bisa diedit admin
-- ============================================================
CREATE TABLE IF NOT EXISTS task_labels (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama       TEXT NOT NULL UNIQUE,
  warna      TEXT NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE task_labels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tl_select"       ON task_labels;
DROP POLICY IF EXISTS "tl_admin_insert" ON task_labels;
DROP POLICY IF EXISTS "tl_admin_update" ON task_labels;
DROP POLICY IF EXISTS "tl_admin_delete" ON task_labels;

CREATE POLICY "tl_select"       ON task_labels FOR SELECT USING (true);
CREATE POLICY "tl_admin_insert" ON task_labels FOR INSERT WITH CHECK (absensi_is_admin());
CREATE POLICY "tl_admin_update" ON task_labels FOR UPDATE USING (absensi_is_admin());
CREATE POLICY "tl_admin_delete" ON task_labels FOR DELETE USING (absensi_is_admin());

-- ============================================================
-- 3. TASK_PROJECTS
-- ============================================================
CREATE TABLE IF NOT EXISTS task_projects (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  nama            TEXT    NOT NULL,
  tipe_project    TEXT    NOT NULL CHECK (tipe_project IN ('rutin', 'sementara')),
  unit_id         TEXT    NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  status          TEXT    NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif', 'selesai', 'arsip')),
  tanggal_mulai   DATE,
  tanggal_selesai DATE,
  deskripsi       TEXT,
  dibuat_oleh     TEXT    REFERENCES gurus(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE task_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tp_select" ON task_projects;
DROP POLICY IF EXISTS "tp_insert" ON task_projects;
DROP POLICY IF EXISTS "tp_update" ON task_projects;
DROP POLICY IF EXISTS "tp_delete" ON task_projects;

CREATE POLICY "tp_select" ON task_projects FOR SELECT
  USING (task_is_owner() OR unit_id = ANY(absensi_unit_ids()));

CREATE POLICY "tp_insert" ON task_projects FOR INSERT
  WITH CHECK (task_is_owner() OR (unit_id = ANY(absensi_unit_ids()) AND absensi_is_admin()));

CREATE POLICY "tp_update" ON task_projects FOR UPDATE
  USING (task_is_owner() OR (unit_id = ANY(absensi_unit_ids()) AND absensi_is_admin()));

CREATE POLICY "tp_delete" ON task_projects FOR DELETE
  USING (task_is_owner() OR (unit_id = ANY(absensi_unit_ids()) AND absensi_is_admin()));

-- ============================================================
-- 4. TASK_RECURRING_RULES (dibuat sebelum tasks karena tasks FK ke sini)
-- ============================================================
CREATE TABLE IF NOT EXISTS task_recurring_rules (
  id                   UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  judul_template       TEXT    NOT NULL,
  deskripsi_template   TEXT,
  unit_id              TEXT    NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  project_id           UUID    REFERENCES task_projects(id) ON DELETE SET NULL,
  stage_id_awal        UUID    REFERENCES task_stages(id) ON DELETE SET NULL,
  prioritas            TEXT    NOT NULL DEFAULT 'Sedang' CHECK (prioritas IN ('Tinggi', 'Sedang', 'Rendah')),
  label_id             UUID    REFERENCES task_labels(id) ON DELETE SET NULL,
  assignee_guru_ids    TEXT[]  NOT NULL DEFAULT '{}',
  frekuensi            TEXT    NOT NULL CHECK (frekuensi IN ('harian', 'mingguan', 'bulanan')),
  hari_dalam_minggu    INT[],  -- 0=Senin ... 6=Minggu (untuk mingguan, bisa multi-hari)
  tanggal_dalam_bulan  INT     CHECK (tanggal_dalam_bulan BETWEEN 1 AND 31),
  aktif                BOOLEAN NOT NULL DEFAULT true,
  next_run_date        DATE,
  dibuat_oleh          TEXT    REFERENCES gurus(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE task_recurring_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trr_select" ON task_recurring_rules;
DROP POLICY IF EXISTS "trr_insert" ON task_recurring_rules;
DROP POLICY IF EXISTS "trr_update" ON task_recurring_rules;
DROP POLICY IF EXISTS "trr_delete" ON task_recurring_rules;

CREATE POLICY "trr_select" ON task_recurring_rules FOR SELECT
  USING (task_is_owner() OR unit_id = ANY(absensi_unit_ids()));

CREATE POLICY "trr_insert" ON task_recurring_rules FOR INSERT
  WITH CHECK (task_is_owner() OR (unit_id = ANY(absensi_unit_ids()) AND absensi_is_admin()));

CREATE POLICY "trr_update" ON task_recurring_rules FOR UPDATE
  USING (task_is_owner() OR (unit_id = ANY(absensi_unit_ids()) AND absensi_is_admin()));

CREATE POLICY "trr_delete" ON task_recurring_rules FOR DELETE
  USING (task_is_owner() OR (unit_id = ANY(absensi_unit_ids()) AND absensi_is_admin()));

-- ============================================================
-- 5. TASKS — tabel utama
-- ============================================================
CREATE TABLE IF NOT EXISTS tasks (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  judul             TEXT    NOT NULL,
  deskripsi         TEXT,
  project_id        UUID    REFERENCES task_projects(id) ON DELETE SET NULL,
  stage_id          UUID    REFERENCES task_stages(id) ON DELETE SET NULL,
  prioritas         TEXT    NOT NULL DEFAULT 'Sedang' CHECK (prioritas IN ('Tinggi', 'Sedang', 'Rendah')),
  deadline          TIMESTAMPTZ,
  unit_id           TEXT    NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  dibuat_oleh       TEXT    REFERENCES gurus(id) ON DELETE SET NULL,
  label_id          UUID    REFERENCES task_labels(id) ON DELETE SET NULL,
  recurring_rule_id UUID    REFERENCES task_recurring_rules(id) ON DELETE SET NULL,
  selesai_pada      TIMESTAMPTZ,             -- set saat task masuk stage is_final
  is_late           BOOLEAN,                  -- true jika selesai_pada > deadline
  created_at        TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tasks_select" ON tasks;
DROP POLICY IF EXISTS "tasks_insert" ON tasks;
DROP POLICY IF EXISTS "tasks_update" ON tasks;
DROP POLICY IF EXISTS "tasks_delete" ON tasks;

CREATE POLICY "tasks_select" ON tasks FOR SELECT
  USING (
    task_is_owner()
    OR (
      unit_id = ANY(absensi_unit_ids())
      AND (
        absensi_is_admin()
        OR dibuat_oleh = absensi_guru_id()
        OR EXISTS (
          SELECT 1 FROM task_assignees ta
          WHERE ta.task_id = tasks.id AND ta.guru_id = absensi_guru_id()
        )
      )
    )
  );

CREATE POLICY "tasks_insert" ON tasks FOR INSERT
  WITH CHECK (
    task_is_owner()
    OR (unit_id = ANY(absensi_unit_ids()) AND absensi_is_admin())
    OR (unit_id = ANY(absensi_unit_ids()) AND dibuat_oleh = absensi_guru_id())
  );

CREATE POLICY "tasks_update" ON tasks FOR UPDATE
  USING (
    task_is_owner()
    OR (
      unit_id = ANY(absensi_unit_ids())
      AND (
        absensi_is_admin()
        OR dibuat_oleh = absensi_guru_id()
        OR EXISTS (
          SELECT 1 FROM task_assignees ta
          WHERE ta.task_id = tasks.id AND ta.guru_id = absensi_guru_id()
        )
      )
    )
  );

CREATE POLICY "tasks_delete" ON tasks FOR DELETE
  USING (
    task_is_owner()
    OR (unit_id = ANY(absensi_unit_ids()) AND absensi_is_admin())
    OR dibuat_oleh = absensi_guru_id()
  );

-- ============================================================
-- 6. TASK_ASSIGNEES — many-to-many task ↔ guru
-- ============================================================
CREATE TABLE IF NOT EXISTS task_assignees (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  guru_id    TEXT NOT NULL REFERENCES gurus(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(task_id, guru_id)
);

ALTER TABLE task_assignees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ta_select" ON task_assignees;
DROP POLICY IF EXISTS "ta_insert" ON task_assignees;
DROP POLICY IF EXISTS "ta_delete" ON task_assignees;

CREATE POLICY "ta_select" ON task_assignees FOR SELECT
  USING (
    task_is_owner()
    OR guru_id = absensi_guru_id()
    OR EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_assignees.task_id
        AND t.unit_id = ANY(absensi_unit_ids())
        AND (absensi_is_admin() OR t.dibuat_oleh = absensi_guru_id())
    )
  );

CREATE POLICY "ta_insert" ON task_assignees FOR INSERT
  WITH CHECK (
    task_is_owner()
    OR EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_assignees.task_id
        AND t.unit_id = ANY(absensi_unit_ids())
        AND (absensi_is_admin() OR t.dibuat_oleh = absensi_guru_id())
    )
  );

CREATE POLICY "ta_delete" ON task_assignees FOR DELETE
  USING (
    task_is_owner()
    OR EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_assignees.task_id
        AND t.unit_id = ANY(absensi_unit_ids())
        AND (absensi_is_admin() OR t.dibuat_oleh = absensi_guru_id())
    )
  );

-- ============================================================
-- 7. TASK_CHECKLISTS
-- ============================================================
CREATE TABLE IF NOT EXISTS task_checklists (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID    NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  teks       TEXT    NOT NULL,
  selesai    BOOLEAN NOT NULL DEFAULT false,
  urutan     INT     NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE task_checklists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tcl_select" ON task_checklists;
DROP POLICY IF EXISTS "tcl_insert" ON task_checklists;
DROP POLICY IF EXISTS "tcl_update" ON task_checklists;
DROP POLICY IF EXISTS "tcl_delete" ON task_checklists;

CREATE POLICY "tcl_select" ON task_checklists FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM tasks t WHERE t.id = task_checklists.task_id
    AND (task_is_owner() OR (t.unit_id = ANY(absensi_unit_ids()) AND (
      absensi_is_admin() OR t.dibuat_oleh = absensi_guru_id()
      OR EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.guru_id = absensi_guru_id())
    )))
  ));

CREATE POLICY "tcl_insert" ON task_checklists FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM tasks t WHERE t.id = task_checklists.task_id
    AND (task_is_owner() OR (t.unit_id = ANY(absensi_unit_ids()) AND (
      absensi_is_admin() OR t.dibuat_oleh = absensi_guru_id()
      OR EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.guru_id = absensi_guru_id())
    )))
  ));

CREATE POLICY "tcl_update" ON task_checklists FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM tasks t WHERE t.id = task_checklists.task_id
    AND (task_is_owner() OR (t.unit_id = ANY(absensi_unit_ids()) AND (
      absensi_is_admin() OR t.dibuat_oleh = absensi_guru_id()
      OR EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.guru_id = absensi_guru_id())
    )))
  ));

CREATE POLICY "tcl_delete" ON task_checklists FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM tasks t WHERE t.id = task_checklists.task_id
    AND (task_is_owner() OR (t.unit_id = ANY(absensi_unit_ids()) AND (
      absensi_is_admin() OR t.dibuat_oleh = absensi_guru_id()
    )))
  ));

-- ============================================================
-- 8. TASK_COMMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS task_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  guru_id    TEXT NOT NULL REFERENCES gurus(id) ON DELETE CASCADE,
  isi        TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tco_select" ON task_comments;
DROP POLICY IF EXISTS "tco_insert" ON task_comments;
DROP POLICY IF EXISTS "tco_delete" ON task_comments;

CREATE POLICY "tco_select" ON task_comments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM tasks t WHERE t.id = task_comments.task_id
    AND (task_is_owner() OR (t.unit_id = ANY(absensi_unit_ids()) AND (
      absensi_is_admin() OR t.dibuat_oleh = absensi_guru_id()
      OR EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.guru_id = absensi_guru_id())
    )))
  ));

CREATE POLICY "tco_insert" ON task_comments FOR INSERT
  WITH CHECK (
    guru_id = absensi_guru_id()
    AND EXISTS (
      SELECT 1 FROM tasks t WHERE t.id = task_comments.task_id
      AND (task_is_owner() OR t.unit_id = ANY(absensi_unit_ids()))
    )
  );

CREATE POLICY "tco_delete" ON task_comments FOR DELETE
  USING (guru_id = absensi_guru_id() OR absensi_is_admin() OR task_is_owner());

-- ============================================================
-- 9. TASK_ATTACHMENTS — foto lampiran (maks 45 hari)
-- ============================================================
CREATE TABLE IF NOT EXISTS task_attachments (
  id                 UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id            UUID    NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  guru_id            TEXT    NOT NULL REFERENCES gurus(id) ON DELETE CASCADE,
  storage_path       TEXT,   -- NULL setelah file dihapus dari Storage oleh Edge Function
  original_name      TEXT    NOT NULL,
  mime_type          TEXT    NOT NULL
    CHECK (mime_type IN ('image/jpeg', 'image/jpg', 'image/png', 'image/webp')),
  size_bytes         INT,
  uploaded_at        TIMESTAMPTZ DEFAULT now(),
  expires_at         TIMESTAMPTZ DEFAULT (now() + INTERVAL '45 days'),
  is_expired         BOOLEAN NOT NULL DEFAULT false,
  storage_deleted_at TIMESTAMPTZ -- set oleh Edge Function setelah file Storage benar-benar dihapus
);

ALTER TABLE task_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tat_select" ON task_attachments;
DROP POLICY IF EXISTS "tat_insert" ON task_attachments;
DROP POLICY IF EXISTS "tat_delete" ON task_attachments;

CREATE POLICY "tat_select" ON task_attachments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM tasks t WHERE t.id = task_attachments.task_id
    AND (task_is_owner() OR (t.unit_id = ANY(absensi_unit_ids()) AND (
      absensi_is_admin() OR t.dibuat_oleh = absensi_guru_id()
      OR EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.guru_id = absensi_guru_id())
    )))
  ));

CREATE POLICY "tat_insert" ON task_attachments FOR INSERT
  WITH CHECK (
    guru_id = absensi_guru_id()
    AND EXISTS (
      SELECT 1 FROM tasks t WHERE t.id = task_attachments.task_id
      AND (task_is_owner() OR t.unit_id = ANY(absensi_unit_ids()))
    )
  );

CREATE POLICY "tat_delete" ON task_attachments FOR DELETE
  USING (guru_id = absensi_guru_id() OR absensi_is_admin() OR task_is_owner());

-- ============================================================
-- 10. STORAGE BUCKET: task-photos (private, validasi tipe file)
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'task-photos',
  'task-photos',
  false,
  3145728,  -- 3 MB max (setelah kompresi jauh lebih kecil)
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS Policies
DROP POLICY IF EXISTS "task_photos_select" ON storage.objects;
DROP POLICY IF EXISTS "task_photos_insert" ON storage.objects;
DROP POLICY IF EXISTS "task_photos_delete" ON storage.objects;

CREATE POLICY "task_photos_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'task-photos' AND auth.role() = 'authenticated');

CREATE POLICY "task_photos_insert" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'task-photos'
    AND auth.role() = 'authenticated'
    AND lower(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'webp')
  );

CREATE POLICY "task_photos_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'task-photos' AND auth.role() = 'authenticated');

-- ============================================================
-- 11. AUTO-DELETE: pg_cron — tandai foto expired tiap tengah malam WIB
-- ============================================================
-- LANGKAH: Aktifkan ekstensi pg_cron di Supabase Dashboard
--   → Database → Extensions → cari "pg_cron" → Enable
-- Setelah diaktifkan, jalankan perintah di bawah ini:
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'task-mark-expired-photos',
  '0 17 * * *',  -- 17:00 UTC = 00:00 WIB
  $$UPDATE task_attachments
    SET is_expired = true
    WHERE expires_at < now() AND is_expired = false$$
);

-- ============================================================
-- 12. SEED DATA — stage & label default
-- ============================================================
INSERT INTO task_stages (nama, urutan, warna, is_final) VALUES
  ('Backlog',    1, '#94a3b8', false),
  ('Dikerjakan', 2, '#3b82f6', false),
  ('Review',     3, '#f59e0b', false),
  ('Selesai',    4, '#22c55e', true)
ON CONFLICT (nama) DO NOTHING;

INSERT INTO task_labels (nama, warna) VALUES
  ('Keuangan',    '#ef4444'),
  ('Akademik',    '#3b82f6'),
  ('Operasional', '#f59e0b'),
  ('Marketing',   '#8b5cf6'),
  ('IT',          '#06b6d4')
ON CONFLICT (nama) DO NOTHING;
