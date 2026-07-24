-- ============================================================
-- TASK REMINDERS — Pengingat berjadwal (Owner-only)
-- System Naik Kelas
-- Jalankan seluruh file ini di Supabase SQL Editor
-- AMAN dijalankan berulang (IF NOT EXISTS / OR REPLACE / ON CONFLICT)
--
-- Konsep:
--   Owner membuat daftar pengingat one-shot dengan tanggal tertentu.
--   Saat tanggalnya tiba, pg_cron (00:00 WIB) menjalankan
--   task_fire_reminders() yang otomatis membuat 1 task di Task
--   Management dan meng-assign ke guru sesuai pengaturan pengingat.
--   Setelah itu pengingat ditandai 'sudah_dibuat' dan tidak diulang.
--
-- Prasyarat: file supabase_task_management.sql sudah dijalankan
--            (butuh tabel tasks, task_assignees, task_stages,
--             task_labels, task_projects, units, gurus, dan
--             fungsi helper task_is_owner()).
-- ============================================================

-- ============================================================
-- 1. TASK_REMINDERS
-- ============================================================
CREATE TABLE IF NOT EXISTS task_reminders (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  judul             TEXT    NOT NULL,
  deskripsi         TEXT,
  tanggal_pengingat DATE    NOT NULL,
  -- Atribut task yang akan dibuat saat pengingat aktif:
  unit_id           TEXT    NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  project_id        UUID    REFERENCES task_projects(id) ON DELETE SET NULL,
  stage_id_awal     UUID    REFERENCES task_stages(id) ON DELETE SET NULL,
  prioritas         TEXT    NOT NULL DEFAULT 'Sedang' CHECK (prioritas IN ('Tinggi', 'Sedang', 'Rendah')),
  label_id          UUID    REFERENCES task_labels(id) ON DELETE SET NULL,
  deadline          TIMESTAMPTZ,
  assignee_guru_ids TEXT[]  NOT NULL DEFAULT '{}',
  -- Status siklus hidup pengingat:
  status            TEXT    NOT NULL DEFAULT 'menunggu'
                            CHECK (status IN ('menunggu', 'sudah_dibuat', 'batal')),
  task_id_hasil     UUID    REFERENCES tasks(id) ON DELETE SET NULL,
  fired_at          TIMESTAMPTZ,
  dibuat_oleh       TEXT    REFERENCES gurus(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_reminders_due
  ON task_reminders (tanggal_pengingat)
  WHERE status = 'menunggu';

ALTER TABLE task_reminders ENABLE ROW LEVEL SECURITY;

-- RLS: HANYA Owner yang bisa melihat & mengelola pengingat.
DROP POLICY IF EXISTS "trm_select" ON task_reminders;
DROP POLICY IF EXISTS "trm_insert" ON task_reminders;
DROP POLICY IF EXISTS "trm_update" ON task_reminders;
DROP POLICY IF EXISTS "trm_delete" ON task_reminders;

CREATE POLICY "trm_select" ON task_reminders FOR SELECT
  USING (task_is_owner());

CREATE POLICY "trm_insert" ON task_reminders FOR INSERT
  WITH CHECK (task_is_owner());

CREATE POLICY "trm_update" ON task_reminders FOR UPDATE
  USING (task_is_owner());

CREATE POLICY "trm_delete" ON task_reminders FOR DELETE
  USING (task_is_owner());

-- ============================================================
-- 2. FUNGSI MATERIALISASI — pengingat jatuh tempo → task + assignee
--    SECURITY DEFINER agar bisa dijalankan pg_cron (tanpa sesi user)
--    dan menembus RLS tasks/task_assignees.
--    Memakai tanggal WIB (Asia/Jakarta) agar konsisten dengan jadwal
--    cron 00:00 WIB.
-- ============================================================
CREATE OR REPLACE FUNCTION task_fire_reminders()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r          task_reminders%ROWTYPE;
  v_task_id  UUID;
  v_today    DATE := (now() AT TIME ZONE 'Asia/Jakarta')::date;
  v_count    INT  := 0;
  v_guru     TEXT;
BEGIN
  FOR r IN
    SELECT * FROM task_reminders
    WHERE status = 'menunggu'
      AND tanggal_pengingat <= v_today
    ORDER BY tanggal_pengingat
  LOOP
    -- Buat task dari pengingat
    INSERT INTO tasks (
      judul, deskripsi, project_id, stage_id, prioritas,
      deadline, label_id, unit_id, dibuat_oleh
    ) VALUES (
      r.judul, r.deskripsi, r.project_id, r.stage_id_awal, r.prioritas,
      r.deadline, r.label_id, r.unit_id, r.dibuat_oleh
    )
    RETURNING id INTO v_task_id;

    -- Assign ke tiap guru sesuai pengaturan pengingat (abaikan duplikat)
    IF array_length(r.assignee_guru_ids, 1) IS NOT NULL THEN
      FOREACH v_guru IN ARRAY r.assignee_guru_ids LOOP
        INSERT INTO task_assignees (task_id, guru_id)
        VALUES (v_task_id, v_guru)
        ON CONFLICT (task_id, guru_id) DO NOTHING;
      END LOOP;
    END IF;

    -- Tandai pengingat sudah dibuat
    UPDATE task_reminders
      SET status = 'sudah_dibuat',
          task_id_hasil = v_task_id,
          fired_at = now()
      WHERE id = r.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- Izinkan pemanggilan manual dari klien (mis. tombol "Jalankan sekarang"
-- untuk uji coba). Fungsi tetap SECURITY DEFINER; batasi hanya untuk
-- authenticated. Pengaman peran ada di RLS + pemakaian di UI owner-only.
GRANT EXECUTE ON FUNCTION task_fire_reminders() TO authenticated;

-- ============================================================
-- 3. JADWAL pg_cron — jalankan tiap 00:00 WIB (= 17:00 UTC)
--    Syarat: ekstensi pg_cron aktif (sudah dipakai project ini).
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Hapus jadwal lama bila ada, lalu daftarkan ulang (idempoten)
SELECT cron.unschedule('task-fire-reminders')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'task-fire-reminders');

SELECT cron.schedule(
  'task-fire-reminders',
  '0 17 * * *',
  $$SELECT task_fire_reminders()$$
);
