-- ============================================================
-- SCHEMA PAYROLL — System Naik Kelas
-- Jalankan di Supabase SQL Editor setelah supabase_kpi_schema.sql
-- Fungsi helper (absensi_is_admin, absensi_guru_id) sudah ada
-- ============================================================


-- ============================================================
-- 1. SALARY_COMPONENTS — master komponen gaji
-- ============================================================
CREATE TABLE IF NOT EXISTS salary_components (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  nama        TEXT    NOT NULL,
  tipe        TEXT    NOT NULL CHECK (tipe IN ('Pokok', 'Tunjangan', 'Potongan')),
  deskripsi   TEXT,
  aktif       BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE salary_components ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sc_select"       ON salary_components;
DROP POLICY IF EXISTS "sc_admin_insert" ON salary_components;
DROP POLICY IF EXISTS "sc_admin_update" ON salary_components;
DROP POLICY IF EXISTS "sc_admin_delete" ON salary_components;
CREATE POLICY "sc_select"       ON salary_components FOR SELECT USING (true);
CREATE POLICY "sc_admin_insert" ON salary_components FOR INSERT WITH CHECK (absensi_is_admin());
CREATE POLICY "sc_admin_update" ON salary_components FOR UPDATE USING (absensi_is_admin());
CREATE POLICY "sc_admin_delete" ON salary_components FOR DELETE USING (absensi_is_admin());


-- ============================================================
-- 2. EMPLOYEE_SALARIES — struktur gaji per karyawan per komponen
--    berlaku_mulai: histori perubahan gaji; ambil yang terbaru <= periode
-- ============================================================
CREATE TABLE IF NOT EXISTS employee_salaries (
  id                    UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  guru_id               TEXT  NOT NULL REFERENCES gurus(id) ON DELETE CASCADE,
  salary_component_id   UUID  NOT NULL REFERENCES salary_components(id) ON DELETE CASCADE,
  nominal               BIGINT NOT NULL,
  berlaku_mulai         DATE  NOT NULL,
  catatan               TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  UNIQUE(guru_id, salary_component_id, berlaku_mulai)
);

ALTER TABLE employee_salaries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "es_select"       ON employee_salaries;
DROP POLICY IF EXISTS "es_admin_insert" ON employee_salaries;
DROP POLICY IF EXISTS "es_admin_update" ON employee_salaries;
DROP POLICY IF EXISTS "es_admin_delete" ON employee_salaries;
-- Karyawan hanya lihat gaji miliknya; admin lihat semua
CREATE POLICY "es_select" ON employee_salaries FOR SELECT USING (
  guru_id = absensi_guru_id() OR absensi_is_admin()
);
CREATE POLICY "es_admin_insert" ON employee_salaries FOR INSERT WITH CHECK (absensi_is_admin());
CREATE POLICY "es_admin_update" ON employee_salaries FOR UPDATE USING (absensi_is_admin());
CREATE POLICY "es_admin_delete" ON employee_salaries FOR DELETE USING (absensi_is_admin());


-- ============================================================
-- 3. PAYROLLS — header proses penggajian per periode per unit
-- ============================================================
CREATE TABLE IF NOT EXISTS payrolls (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id         TEXT    NOT NULL REFERENCES units(id),
  periode_tahun   INT     NOT NULL,
  periode_bulan   INT     NOT NULL CHECK (periode_bulan BETWEEN 1 AND 12),
  status          TEXT    NOT NULL DEFAULT 'Draft'
                          CHECK (status IN ('Draft', 'Review', 'Final')),
  total_bruto     BIGINT  NOT NULL DEFAULT 0,
  total_potongan  BIGINT  NOT NULL DEFAULT 0,
  total_netto     BIGINT  NOT NULL DEFAULT 0,
  catatan         TEXT,
  dibuat_oleh     TEXT    REFERENCES gurus(id),
  disetujui_oleh  TEXT    REFERENCES gurus(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(unit_id, periode_tahun, periode_bulan)
);

ALTER TABLE payrolls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pr_select"       ON payrolls;
DROP POLICY IF EXISTS "pr_admin_insert" ON payrolls;
DROP POLICY IF EXISTS "pr_admin_update" ON payrolls;
DROP POLICY IF EXISTS "pr_admin_delete" ON payrolls;
CREATE POLICY "pr_select" ON payrolls FOR SELECT USING (absensi_is_admin());
CREATE POLICY "pr_admin_insert" ON payrolls FOR INSERT WITH CHECK (absensi_is_admin());
CREATE POLICY "pr_admin_update" ON payrolls FOR UPDATE USING (absensi_is_admin());
-- Final tidak bisa dihapus
CREATE POLICY "pr_admin_delete" ON payrolls FOR DELETE
  USING (absensi_is_admin() AND status != 'Final');


-- ============================================================
-- 4. PAYROLL_ITEMS — rincian gaji per karyawan dalam satu payroll
--    komponen: JSONB snapshot [{nama, tipe, nominal}]
--    Snapshot dibuat saat generate — tidak berubah meskipun struktur gaji diubah
-- ============================================================
CREATE TABLE IF NOT EXISTS payroll_items (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_id      UUID    NOT NULL REFERENCES payrolls(id) ON DELETE CASCADE,
  guru_id         TEXT    NOT NULL REFERENCES gurus(id),
  hari_kerja      INT     NOT NULL DEFAULT 0,
  hari_hadir      INT     NOT NULL DEFAULT 0,
  hari_telat      INT     NOT NULL DEFAULT 0,
  hari_izin       INT     NOT NULL DEFAULT 0,
  hari_alpha      INT     NOT NULL DEFAULT 0,
  menit_lembur    INT     NOT NULL DEFAULT 0,
  bonus_kpi       BIGINT  NOT NULL DEFAULT 0,
  komponen        JSONB   NOT NULL DEFAULT '[]'::jsonb,
  total_bruto     BIGINT  NOT NULL DEFAULT 0,
  total_potongan  BIGINT  NOT NULL DEFAULT 0,
  total_netto     BIGINT  NOT NULL DEFAULT 0,
  catatan         TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE payroll_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pi_select"       ON payroll_items;
DROP POLICY IF EXISTS "pi_admin_insert" ON payroll_items;
DROP POLICY IF EXISTS "pi_admin_update" ON payroll_items;
DROP POLICY IF EXISTS "pi_admin_delete" ON payroll_items;
-- Karyawan lihat slip gaji miliknya; admin lihat semua
CREATE POLICY "pi_select" ON payroll_items FOR SELECT USING (
  guru_id = absensi_guru_id() OR absensi_is_admin()
);
-- Hanya bisa insert/update/delete kalau payroll belum Final
CREATE POLICY "pi_admin_insert" ON payroll_items FOR INSERT
  WITH CHECK (
    absensi_is_admin() AND
    EXISTS (SELECT 1 FROM payrolls p WHERE p.id = payroll_id AND p.status != 'Final')
  );
CREATE POLICY "pi_admin_update" ON payroll_items FOR UPDATE
  USING (
    absensi_is_admin() AND
    EXISTS (SELECT 1 FROM payrolls p WHERE p.id = payroll_id AND p.status != 'Final')
  );
CREATE POLICY "pi_admin_delete" ON payroll_items FOR DELETE
  USING (
    absensi_is_admin() AND
    EXISTS (SELECT 1 FROM payrolls p WHERE p.id = payroll_id AND p.status != 'Final')
  );


-- ============================================================
-- 5. LOANS — kasbon / pinjaman karyawan
-- ============================================================
CREATE TABLE IF NOT EXISTS loans (
  id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  guru_id             TEXT    NOT NULL REFERENCES gurus(id) ON DELETE CASCADE,
  unit_id             TEXT    NOT NULL REFERENCES units(id),
  jumlah              BIGINT  NOT NULL,
  sisa                BIGINT  NOT NULL,
  cicilan_per_bulan   BIGINT  NOT NULL,
  mulai               DATE    NOT NULL,
  keterangan          TEXT,
  status              TEXT    NOT NULL DEFAULT 'Aktif'
                              CHECK (status IN ('Aktif', 'Lunas')),
  dibuat_oleh         TEXT    REFERENCES gurus(id),
  created_at          TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE loans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lo_select"       ON loans;
DROP POLICY IF EXISTS "lo_admin_insert" ON loans;
DROP POLICY IF EXISTS "lo_admin_update" ON loans;
DROP POLICY IF EXISTS "lo_admin_delete" ON loans;
-- Karyawan lihat kasbon miliknya
CREATE POLICY "lo_select" ON loans FOR SELECT USING (
  guru_id = absensi_guru_id() OR absensi_is_admin()
);
CREATE POLICY "lo_admin_insert" ON loans FOR INSERT WITH CHECK (absensi_is_admin());
CREATE POLICY "lo_admin_update" ON loans FOR UPDATE USING (absensi_is_admin());
CREATE POLICY "lo_admin_delete" ON loans FOR DELETE USING (absensi_is_admin());


-- ============================================================
-- 6. LOAN_DEDUCTIONS — cicilan dipotong per payroll item
-- ============================================================
CREATE TABLE IF NOT EXISTS loan_deductions (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id           UUID    NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  payroll_item_id   UUID    NOT NULL REFERENCES payroll_items(id) ON DELETE CASCADE,
  periode_tahun     INT     NOT NULL,
  periode_bulan     INT     NOT NULL,
  nominal           BIGINT  NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE loan_deductions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ld_select"       ON loan_deductions;
DROP POLICY IF EXISTS "ld_admin_insert" ON loan_deductions;
DROP POLICY IF EXISTS "ld_admin_delete" ON loan_deductions;
CREATE POLICY "ld_select" ON loan_deductions FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM loans l WHERE l.id = loan_id
      AND (l.guru_id = absensi_guru_id() OR absensi_is_admin())
  )
);
CREATE POLICY "ld_admin_insert" ON loan_deductions FOR INSERT WITH CHECK (absensi_is_admin());
CREATE POLICY "ld_admin_delete" ON loan_deductions FOR DELETE USING (absensi_is_admin());


-- ============================================================
-- INDEX
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_emp_sal_guru      ON employee_salaries(guru_id);
CREATE INDEX IF NOT EXISTS idx_emp_sal_comp       ON employee_salaries(salary_component_id);
CREATE INDEX IF NOT EXISTS idx_emp_sal_berlaku    ON employee_salaries(berlaku_mulai);
CREATE INDEX IF NOT EXISTS idx_payrolls_unit      ON payrolls(unit_id);
CREATE INDEX IF NOT EXISTS idx_payrolls_periode   ON payrolls(periode_tahun, periode_bulan);
CREATE INDEX IF NOT EXISTS idx_pi_payroll         ON payroll_items(payroll_id);
CREATE INDEX IF NOT EXISTS idx_pi_guru            ON payroll_items(guru_id);
CREATE INDEX IF NOT EXISTS idx_loans_guru         ON loans(guru_id);
CREATE INDEX IF NOT EXISTS idx_loans_unit         ON loans(unit_id);
CREATE INDEX IF NOT EXISTS idx_loans_status       ON loans(status);
CREATE INDEX IF NOT EXISTS idx_ld_loan            ON loan_deductions(loan_id);
CREATE INDEX IF NOT EXISTS idx_ld_pi              ON loan_deductions(payroll_item_id);
