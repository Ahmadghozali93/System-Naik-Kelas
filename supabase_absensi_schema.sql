-- ============================================================
-- SCHEMA ABSENSI KARYAWAN — System Naik Kelas
-- Jalankan SELURUH file ini di Supabase SQL Editor
-- ============================================================

-- ============================================================
-- LANGKAH MANUAL SEBELUM JALANKAN SQL INI:
-- 1. Buka Supabase Dashboard → Storage → Buckets → New Bucket
--    Nama: absensi-foto  |  Public: YES
-- 2. Di menu Storage → Policies, tambah:
--    - INSERT: untuk authenticated users
--    - SELECT: public
-- ============================================================


-- ============================================================
-- LANGKAH 1 — Buat tabel guru_units LEBIH DULU
-- agar fungsi helper yang mereferensikannya bisa divalidasi.
-- ============================================================

CREATE TABLE IF NOT EXISTS guru_units (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guru_id     TEXT NOT NULL REFERENCES gurus(id)  ON DELETE CASCADE,
  unit_id     TEXT NOT NULL REFERENCES units(id)  ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(guru_id, unit_id)
);


-- ============================================================
-- LANGKAH 2 — Helper functions untuk RLS
-- Semua fungsi pakai SECURITY DEFINER agar bisa bypass RLS
-- saat dipanggil dari dalam policy.
-- ============================================================

CREATE OR REPLACE FUNCTION absensi_guru_id()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM gurus WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION absensi_is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role = 'Admin' FROM gurus WHERE auth_user_id = auth.uid() LIMIT 1),
    false
  );
$$;

-- Kembalikan array unit_id milik user yang sedang login
CREATE OR REPLACE FUNCTION absensi_unit_ids()
RETURNS TEXT[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT ARRAY_AGG(gu.unit_id)
      FROM guru_units gu
      JOIN gurus g ON g.id = gu.guru_id
      WHERE g.auth_user_id = auth.uid()
    ),
    '{}'::TEXT[]
  );
$$;


-- ============================================================
-- LANGKAH 3 — Enable RLS + Policies untuk guru_units
-- (tabelnya sudah ada dari Langkah 1)
-- ============================================================

ALTER TABLE guru_units ENABLE ROW LEVEL SECURITY;

-- Drop dulu jika sudah ada (idempotent)
DROP POLICY IF EXISTS "gu_select"       ON guru_units;
DROP POLICY IF EXISTS "gu_admin_insert" ON guru_units;
DROP POLICY IF EXISTS "gu_admin_delete" ON guru_units;

CREATE POLICY "gu_select" ON guru_units FOR SELECT USING (
  guru_id = absensi_guru_id()
  OR (absensi_is_admin() AND unit_id = ANY(absensi_unit_ids()))
);

CREATE POLICY "gu_admin_insert" ON guru_units FOR INSERT
  WITH CHECK (absensi_is_admin());

CREATE POLICY "gu_admin_delete" ON guru_units FOR DELETE
  USING (absensi_is_admin());


-- ============================================================
-- 2. SHIFTS — definisi shift kerja per unit
-- ============================================================

CREATE TABLE IF NOT EXISTS shifts (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id           TEXT    NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  nama              TEXT    NOT NULL,
  jam_mulai         TIME    NOT NULL,
  jam_selesai       TIME    NOT NULL,
  toleransi_menit   INT     NOT NULL DEFAULT 15,
  lintas_hari       BOOLEAN NOT NULL DEFAULT false,
  wajib_foto        BOOLEAN NOT NULL DEFAULT true,
  aktif             BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shifts_select"       ON shifts;
DROP POLICY IF EXISTS "shifts_admin_insert" ON shifts;
DROP POLICY IF EXISTS "shifts_admin_update" ON shifts;
DROP POLICY IF EXISTS "shifts_admin_delete" ON shifts;

CREATE POLICY "shifts_select" ON shifts FOR SELECT
  USING (true);

CREATE POLICY "shifts_admin_insert" ON shifts FOR INSERT
  WITH CHECK (absensi_is_admin());

CREATE POLICY "shifts_admin_update" ON shifts FOR UPDATE
  USING (absensi_is_admin())
  WITH CHECK (absensi_is_admin());

CREATE POLICY "shifts_admin_delete" ON shifts FOR DELETE
  USING (absensi_is_admin());


-- ============================================================
-- 3. SHIFT_SCHEDULES — assignment karyawan ke shift per tanggal
-- ============================================================

CREATE TABLE IF NOT EXISTS shift_schedules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guru_id     TEXT NOT NULL REFERENCES gurus(id)  ON DELETE CASCADE,
  shift_id    UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  tanggal     DATE NOT NULL,
  catatan     TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(guru_id, shift_id, tanggal)
);

ALTER TABLE shift_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ss_select"       ON shift_schedules;
DROP POLICY IF EXISTS "ss_admin_insert" ON shift_schedules;
DROP POLICY IF EXISTS "ss_admin_update" ON shift_schedules;
DROP POLICY IF EXISTS "ss_admin_delete" ON shift_schedules;

CREATE POLICY "ss_select" ON shift_schedules FOR SELECT
  USING (true);

CREATE POLICY "ss_admin_insert" ON shift_schedules FOR INSERT
  WITH CHECK (absensi_is_admin());

CREATE POLICY "ss_admin_update" ON shift_schedules FOR UPDATE
  USING (absensi_is_admin());

CREATE POLICY "ss_admin_delete" ON shift_schedules FOR DELETE
  USING (absensi_is_admin());


-- ============================================================
-- 4. ATTENDANCES — catatan check-in & check-out
-- ============================================================

CREATE TABLE IF NOT EXISTS attendances (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  guru_id             TEXT        NOT NULL REFERENCES gurus(id) ON DELETE CASCADE,
  shift_schedule_id   UUID        REFERENCES shift_schedules(id) ON DELETE SET NULL,
  unit_id             TEXT        NOT NULL REFERENCES units(id),
  tanggal             DATE        NOT NULL,
  check_in            TIMESTAMPTZ,
  check_out           TIMESTAMPTZ,
  foto_checkin        TEXT,
  foto_checkout       TEXT,
  status              TEXT        NOT NULL DEFAULT 'Hadir',
  durasi_menit        INT,
  catatan             TEXT,
  created_at          TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE attendances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "att_select"      ON attendances;
DROP POLICY IF EXISTS "att_insert_self" ON attendances;
DROP POLICY IF EXISTS "att_update"      ON attendances;

CREATE POLICY "att_select" ON attendances FOR SELECT USING (
  guru_id = absensi_guru_id()
  OR (absensi_is_admin() AND unit_id = ANY(absensi_unit_ids()))
);

CREATE POLICY "att_insert_self" ON attendances FOR INSERT
  WITH CHECK (guru_id = absensi_guru_id());

CREATE POLICY "att_update" ON attendances FOR UPDATE
  USING (
    guru_id = absensi_guru_id()
    OR (absensi_is_admin() AND unit_id = ANY(absensi_unit_ids()))
  );


-- ============================================================
-- 5. LEAVE_REQUESTS — pengajuan izin / sakit / cuti
-- ============================================================

CREATE TABLE IF NOT EXISTS leave_requests (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  guru_id           TEXT    NOT NULL REFERENCES gurus(id) ON DELETE CASCADE,
  unit_id           TEXT    NOT NULL REFERENCES units(id),
  jenis             TEXT    NOT NULL,
  tanggal_mulai     DATE    NOT NULL,
  tanggal_selesai   DATE    NOT NULL,
  alasan            TEXT,
  lampiran_url      TEXT,
  status            TEXT    NOT NULL DEFAULT 'Pending',
  disetujui_oleh    TEXT    REFERENCES gurus(id),
  catatan_admin     TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lr_select"       ON leave_requests;
DROP POLICY IF EXISTS "lr_insert_self"  ON leave_requests;
DROP POLICY IF EXISTS "lr_update_admin" ON leave_requests;

CREATE POLICY "lr_select" ON leave_requests FOR SELECT USING (
  guru_id = absensi_guru_id()
  OR absensi_is_admin()
);

CREATE POLICY "lr_insert_self" ON leave_requests FOR INSERT
  WITH CHECK (guru_id = absensi_guru_id());

CREATE POLICY "lr_update_admin" ON leave_requests FOR UPDATE
  USING (absensi_is_admin());


-- ============================================================
-- 6. OVERTIME — lembur di luar jam shift
-- ============================================================

CREATE TABLE IF NOT EXISTS overtime (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  guru_id             TEXT        NOT NULL REFERENCES gurus(id) ON DELETE CASCADE,
  unit_id             TEXT        NOT NULL REFERENCES units(id),
  shift_schedule_id   UUID        REFERENCES shift_schedules(id) ON DELETE SET NULL,
  tanggal             DATE        NOT NULL,
  mulai               TIMESTAMPTZ NOT NULL,
  selesai             TIMESTAMPTZ,
  durasi_menit        INT,
  keterangan          TEXT,
  status              TEXT        NOT NULL DEFAULT 'Pending',
  disetujui_oleh      TEXT        REFERENCES gurus(id),
  created_at          TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE overtime ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ot_select"      ON overtime;
DROP POLICY IF EXISTS "ot_insert_self" ON overtime;
DROP POLICY IF EXISTS "ot_update"      ON overtime;

CREATE POLICY "ot_select" ON overtime FOR SELECT USING (
  guru_id = absensi_guru_id()
  OR absensi_is_admin()
);

CREATE POLICY "ot_insert_self" ON overtime FOR INSERT
  WITH CHECK (guru_id = absensi_guru_id());

CREATE POLICY "ot_update" ON overtime FOR UPDATE
  USING (
    guru_id = absensi_guru_id()
    OR absensi_is_admin()
  );


-- ============================================================
-- 7. ATTENDANCE_CORRECTIONS — koreksi absen + approval
-- ============================================================

CREATE TABLE IF NOT EXISTS attendance_corrections (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_id       UUID        REFERENCES attendances(id) ON DELETE SET NULL,
  guru_id             TEXT        NOT NULL REFERENCES gurus(id) ON DELETE CASCADE,
  unit_id             TEXT        NOT NULL REFERENCES units(id),
  tanggal             DATE        NOT NULL,
  check_in_koreksi    TIMESTAMPTZ,
  check_out_koreksi   TIMESTAMPTZ,
  alasan              TEXT        NOT NULL,
  status              TEXT        NOT NULL DEFAULT 'Pending',
  disetujui_oleh      TEXT        REFERENCES gurus(id),
  created_at          TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE attendance_corrections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ac_select"       ON attendance_corrections;
DROP POLICY IF EXISTS "ac_insert_self"  ON attendance_corrections;
DROP POLICY IF EXISTS "ac_update_admin" ON attendance_corrections;

CREATE POLICY "ac_select" ON attendance_corrections FOR SELECT USING (
  guru_id = absensi_guru_id()
  OR absensi_is_admin()
);

CREATE POLICY "ac_insert_self" ON attendance_corrections FOR INSERT
  WITH CHECK (guru_id = absensi_guru_id());

CREATE POLICY "ac_update_admin" ON attendance_corrections FOR UPDATE
  USING (absensi_is_admin());


-- ============================================================
-- 8. HARI_LIBUR — hari libur manual
-- unit_id NULL = berlaku untuk semua unit
-- ============================================================

CREATE TABLE IF NOT EXISTS hari_libur (
  id          UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id     TEXT  REFERENCES units(id) ON DELETE CASCADE,
  tanggal     DATE  NOT NULL,
  keterangan  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(unit_id, tanggal)
);

ALTER TABLE hari_libur ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hl_select"       ON hari_libur;
DROP POLICY IF EXISTS "hl_admin_insert" ON hari_libur;
DROP POLICY IF EXISTS "hl_admin_update" ON hari_libur;
DROP POLICY IF EXISTS "hl_admin_delete" ON hari_libur;

CREATE POLICY "hl_select" ON hari_libur FOR SELECT
  USING (true);

CREATE POLICY "hl_admin_insert" ON hari_libur FOR INSERT
  WITH CHECK (absensi_is_admin());

CREATE POLICY "hl_admin_update" ON hari_libur FOR UPDATE
  USING (absensi_is_admin());

CREATE POLICY "hl_admin_delete" ON hari_libur FOR DELETE
  USING (absensi_is_admin());


-- ============================================================
-- INDEX untuk performa query umum
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_guru_units_guru    ON guru_units(guru_id);
CREATE INDEX IF NOT EXISTS idx_guru_units_unit    ON guru_units(unit_id);
CREATE INDEX IF NOT EXISTS idx_shifts_unit        ON shifts(unit_id);
CREATE INDEX IF NOT EXISTS idx_ss_guru_tanggal    ON shift_schedules(guru_id, tanggal);
CREATE INDEX IF NOT EXISTS idx_att_guru_tanggal   ON attendances(guru_id, tanggal);
CREATE INDEX IF NOT EXISTS idx_att_unit_tanggal   ON attendances(unit_id, tanggal);
CREATE INDEX IF NOT EXISTS idx_lr_guru            ON leave_requests(guru_id);
CREATE INDEX IF NOT EXISTS idx_lr_unit_status     ON leave_requests(unit_id, status);
CREATE INDEX IF NOT EXISTS idx_ot_guru            ON overtime(guru_id);
CREATE INDEX IF NOT EXISTS idx_ac_guru            ON attendance_corrections(guru_id);
CREATE INDEX IF NOT EXISTS idx_hl_tanggal         ON hari_libur(tanggal);
