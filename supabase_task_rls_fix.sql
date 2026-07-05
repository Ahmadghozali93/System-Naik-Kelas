-- ============================================================
-- FIX: infinite recursion pada RLS tasks ↔ task_assignees
-- Jalankan di Supabase SQL Editor
-- ============================================================

-- Helper SECURITY DEFINER = baca tabel langsung tanpa melewati RLS
-- sehingga tidak terjadi rekursi

CREATE OR REPLACE FUNCTION task_is_assignee(p_task_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM task_assignees WHERE task_id = p_task_id AND guru_id = absensi_guru_id()
  );
$$;

CREATE OR REPLACE FUNCTION task_get_unit(p_task_id UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT unit_id FROM tasks WHERE id = p_task_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION task_get_creator(p_task_id UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT dibuat_oleh FROM tasks WHERE id = p_task_id LIMIT 1;
$$;

-- ── tasks ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "tasks_select" ON tasks;
DROP POLICY IF EXISTS "tasks_update" ON tasks;

CREATE POLICY "tasks_select" ON tasks FOR SELECT
  USING (
    task_is_owner()
    OR (unit_id = ANY(absensi_unit_ids()) AND (
      absensi_is_admin()
      OR dibuat_oleh = absensi_guru_id()
      OR task_is_assignee(id)
    ))
  );

CREATE POLICY "tasks_update" ON tasks FOR UPDATE
  USING (
    task_is_owner()
    OR (unit_id = ANY(absensi_unit_ids()) AND (
      absensi_is_admin()
      OR dibuat_oleh = absensi_guru_id()
      OR task_is_assignee(id)
    ))
  );

-- ── task_assignees ─────────────────────────────────────────
DROP POLICY IF EXISTS "ta_select" ON task_assignees;
DROP POLICY IF EXISTS "ta_insert" ON task_assignees;
DROP POLICY IF EXISTS "ta_delete" ON task_assignees;

CREATE POLICY "ta_select" ON task_assignees FOR SELECT
  USING (
    task_is_owner()
    OR guru_id = absensi_guru_id()
    OR (task_get_unit(task_id) = ANY(absensi_unit_ids()) AND (
      absensi_is_admin() OR task_get_creator(task_id) = absensi_guru_id()
    ))
  );

CREATE POLICY "ta_insert" ON task_assignees FOR INSERT
  WITH CHECK (
    task_is_owner()
    OR (task_get_unit(task_id) = ANY(absensi_unit_ids()) AND (
      absensi_is_admin() OR task_get_creator(task_id) = absensi_guru_id()
    ))
  );

CREATE POLICY "ta_delete" ON task_assignees FOR DELETE
  USING (
    task_is_owner()
    OR (task_get_unit(task_id) = ANY(absensi_unit_ids()) AND (
      absensi_is_admin() OR task_get_creator(task_id) = absensi_guru_id()
    ))
  );

-- ── task_checklists ────────────────────────────────────────
DROP POLICY IF EXISTS "tcl_select" ON task_checklists;
DROP POLICY IF EXISTS "tcl_insert" ON task_checklists;
DROP POLICY IF EXISTS "tcl_update" ON task_checklists;
DROP POLICY IF EXISTS "tcl_delete" ON task_checklists;

CREATE POLICY "tcl_select" ON task_checklists FOR SELECT
  USING (task_is_owner() OR (task_get_unit(task_id) = ANY(absensi_unit_ids()) AND (
    absensi_is_admin() OR task_get_creator(task_id) = absensi_guru_id() OR task_is_assignee(task_id)
  )));

CREATE POLICY "tcl_insert" ON task_checklists FOR INSERT
  WITH CHECK (task_is_owner() OR (task_get_unit(task_id) = ANY(absensi_unit_ids()) AND (
    absensi_is_admin() OR task_get_creator(task_id) = absensi_guru_id() OR task_is_assignee(task_id)
  )));

CREATE POLICY "tcl_update" ON task_checklists FOR UPDATE
  USING (task_is_owner() OR (task_get_unit(task_id) = ANY(absensi_unit_ids()) AND (
    absensi_is_admin() OR task_get_creator(task_id) = absensi_guru_id() OR task_is_assignee(task_id)
  )));

CREATE POLICY "tcl_delete" ON task_checklists FOR DELETE
  USING (task_is_owner() OR (task_get_unit(task_id) = ANY(absensi_unit_ids()) AND (
    absensi_is_admin() OR task_get_creator(task_id) = absensi_guru_id()
  )));

-- ── task_comments ──────────────────────────────────────────
DROP POLICY IF EXISTS "tco_select" ON task_comments;

CREATE POLICY "tco_select" ON task_comments FOR SELECT
  USING (task_is_owner() OR (task_get_unit(task_id) = ANY(absensi_unit_ids()) AND (
    absensi_is_admin() OR task_get_creator(task_id) = absensi_guru_id() OR task_is_assignee(task_id)
  )));

-- ── task_attachments ───────────────────────────────────────
DROP POLICY IF EXISTS "tat_select" ON task_attachments;

CREATE POLICY "tat_select" ON task_attachments FOR SELECT
  USING (task_is_owner() OR (task_get_unit(task_id) = ANY(absensi_unit_ids()) AND (
    absensi_is_admin() OR task_get_creator(task_id) = absensi_guru_id() OR task_is_assignee(task_id)
  )));
