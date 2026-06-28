-- ============================================================
-- SCHEMA LENGKAP UNTUK PROJECT SUPABASE BARU
-- Jalankan di SQL Editor project BARU
-- ============================================================

-- Extension yang dibutuhkan
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. TABEL GURUS
-- ============================================================
CREATE TABLE IF NOT EXISTS gurus (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  password TEXT,
  nama TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Guru',
  nowa TEXT,
  status TEXT DEFAULT 'Aktif',
  alamat TEXT,
  maps TEXT,
  tanggal_lahir DATE,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================
-- 2. TABEL SISWA
-- ============================================================
CREATE TABLE IF NOT EXISTS siswa (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  unit TEXT,
  status TEXT DEFAULT 'Aktif',
  nowa TEXT,
  alamat TEXT,
  nama_ortu TEXT,
  ig TEXT,
  fb TEXT,
  tiktok TEXT,
  catatan TEXT,
  dibuat_pada DATE,
  tanggal_lahir DATE,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================
-- 3. TABEL UNITS
-- ============================================================
CREATE TABLE IF NOT EXISTS units (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  maps TEXT,
  aktif BOOLEAN DEFAULT true,
  dibuat_pada DATE,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================
-- 4. TABEL PROGRAMS
-- ============================================================
CREATE TABLE IF NOT EXISTS programs (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  deskripsi TEXT,
  harga TEXT,
  durasi TEXT,
  status TEXT DEFAULT 'Aktif',
  dibuat_pada DATE,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================
-- 5. TABEL ROLES
-- ============================================================
CREATE TABLE IF NOT EXISTS roles (
  role_name TEXT PRIMARY KEY,
  allowed_menus TEXT[] NOT NULL DEFAULT '{}'::text[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ============================================================
-- 6. TABEL MASTER_JAM
-- ============================================================
CREATE TABLE IF NOT EXISTS master_jam (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  waktu TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ============================================================
-- 7. TABEL JURNAL_ENTRIES
-- ============================================================
CREATE TABLE IF NOT EXISTS jurnal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  guru_id TEXT,
  siswa_id TEXT,
  level TEXT,
  materi TEXT,
  halaman TEXT,
  hasil TEXT,
  keterangan TEXT,
  program TEXT,
  unit TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ============================================================
-- 8. TABEL JADWAL_MASTER
-- ============================================================
CREATE TABLE IF NOT EXISTS jadwal_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jadwal_id TEXT NOT NULL,
  guru_id TEXT,
  nama_guru TEXT NOT NULL,
  program_id TEXT,
  nama_program TEXT NOT NULL,
  jenis_program TEXT NOT NULL,
  hari TEXT NOT NULL,
  jam TEXT NOT NULL,
  unit TEXT NOT NULL,
  kuota INTEGER NOT NULL DEFAULT 0,
  reschedule BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ============================================================
-- 9. TABEL AKTIVASI_SISWA
-- ============================================================
CREATE TABLE IF NOT EXISTS aktivasi_siswa (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assign_id VARCHAR(50) NOT NULL,
  siswa_id TEXT NOT NULL,
  nama_siswa VARCHAR(255) NOT NULL,
  jadwal_id UUID NOT NULL,
  detail_jadwal JSONB NOT NULL DEFAULT '{}'::jsonb,
  tgl_mulai DATE NOT NULL,
  spp NUMERIC DEFAULT 0,
  catatan TEXT,
  status VARCHAR(50) DEFAULT 'Aktif',
  selesai BOOLEAN DEFAULT false,
  assign_id_induk TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 10. TABEL RESCHEDULES
-- ============================================================
CREATE TABLE IF NOT EXISTS reschedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aktivasi_id UUID,
  nama_siswa TEXT NOT NULL,
  jadwal_asal_id UUID,
  jadwal_tujuan_id UUID,
  tanggal_asal DATE NOT NULL,
  tanggal_tujuan DATE NOT NULL,
  jam_tujuan TEXT,
  status TEXT DEFAULT 'Pending',
  catatan TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE gurus ENABLE ROW LEVEL SECURITY;
ALTER TABLE siswa ENABLE ROW LEVEL SECURITY;
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_jam ENABLE ROW LEVEL SECURITY;
ALTER TABLE jurnal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE jadwal_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE aktivasi_siswa ENABLE ROW LEVEL SECURITY;
ALTER TABLE reschedules ENABLE ROW LEVEL SECURITY;

-- Policy: izinkan semua operasi (Development mode)
CREATE POLICY "Allow all (dev)" ON gurus FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all (dev)" ON siswa FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all (dev)" ON units FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all (dev)" ON programs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all (dev)" ON roles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all (dev)" ON master_jam FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all (dev)" ON jurnal_entries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all (dev)" ON jadwal_master FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all (dev)" ON aktivasi_siswa FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all (dev)" ON reschedules FOR ALL USING (true) WITH CHECK (true);
