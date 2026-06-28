-- ============================================================
-- 0001 BASELINE: struktur tabel produksi saat ini (tanpa policy & tanpa seed)
-- RLS diaktifkan; policy diatur di migrasi 0003.
-- ============================================================

-- 1. Hapus tabel jika sudah ada (opsional, untuk memastikan bersih saat init ulang/testing)
-- DROP TABLE IF EXISTS gurus CASCADE;

-- DROP TABLE IF EXISTS siswa CASCADE;

-- DROP TABLE IF EXISTS units CASCADE;

-- DROP TABLE IF EXISTS programs CASCADE;

-- 2. Buat Tabel "gurus" (UserPage.jsx)
CREATE TABLE gurus (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  password TEXT, -- Harus dienkripsi di produksi jika dipakai auth manual
  nama TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Guru',
  nowa TEXT,
  status TEXT DEFAULT 'Aktif',
  alamat TEXT,
  maps TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Buat Tabel "siswa" (SiswaPage.jsx)
CREATE TABLE siswa (
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
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Buat Tabel "units" (UnitPage.jsx)
CREATE TABLE units (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  maps TEXT,
  aktif BOOLEAN DEFAULT true,
  dibuat_pada DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Buat Tabel "programs" (ProgramPage.jsx)
CREATE TABLE programs (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  deskripsi TEXT,
  harga TEXT,
  durasi TEXT,
  status TEXT DEFAULT 'Aktif',
  dibuat_pada DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Setup Row Level Security (RLS)
-- Mengaktifkan RLS pada seluruh tabel
ALTER TABLE gurus ENABLE ROW LEVEL SECURITY;

ALTER TABLE siswa ENABLE ROW LEVEL SECURITY;

ALTER TABLE units ENABLE ROW LEVEL SECURITY;

ALTER TABLE programs ENABLE ROW LEVEL SECURITY;

-- Tabel Roles untuk Manajemen Hak Akses Menu Dinamis
CREATE TABLE IF NOT EXISTS roles (
  role_name TEXT PRIMARY KEY,
  allowed_menus TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Setup Row Level Security (RLS) untuk tabel roles
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

-- Create Master Jam Table
CREATE TABLE IF NOT EXISTS public.master_jam (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  waktu TEXT UNIQUE NOT NULL, -- Contoh "10.00 - 11.00"
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.master_jam ENABLE ROW LEVEL SECURITY;

-- Create Jadwal Master Table
CREATE TABLE IF NOT EXISTS public.jadwal_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jadwal_id TEXT UNIQUE NOT NULL,
  guru_id TEXT REFERENCES public.gurus(id) ON DELETE SET NULL,
  nama_guru TEXT NOT NULL,
  program_id TEXT REFERENCES public.programs(id) ON DELETE SET NULL,
  nama_program TEXT NOT NULL,
  jenis_program TEXT NOT NULL,
  hari TEXT NOT NULL,
  jam TEXT NOT NULL,
  unit TEXT NOT NULL,
  kuota INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.jadwal_master ENABLE ROW LEVEL SECURITY;

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create aktivasi_siswa table
CREATE TABLE IF NOT EXISTS public.aktivasi_siswa (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assign_id VARCHAR(50) NOT NULL UNIQUE,
    siswa_id TEXT NOT NULL REFERENCES public.siswa(id) ON DELETE CASCADE,
    nama_siswa VARCHAR(255) NOT NULL,
    jadwal_id UUID NOT NULL REFERENCES public.jadwal_master(id) ON DELETE RESTRICT,
    detail_jadwal JSONB NOT NULL DEFAULT '{}'::jsonb, -- Stores snapshot of Guru, Program, Hari, Jam, Unit
    tgl_mulai DATE NOT NULL,
    spp NUMERIC(15,2) DEFAULT 0,
    catatan TEXT,
    status VARCHAR(50) DEFAULT 'Aktif',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Basic RLS for development
ALTER TABLE public.aktivasi_siswa ENABLE ROW LEVEL SECURITY;

-- Adding trigger for updated_at if it's not universally handled
CREATE OR REPLACE FUNCTION update_modified_column() 
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();

RETURN NEW;

END;

$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_aktivasi_siswa_modtime ON public.aktivasi_siswa;

CREATE TRIGGER update_aktivasi_siswa_modtime 
BEFORE UPDATE ON public.aktivasi_siswa 
FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

-- Skema Tabel Jurnal Mengajar

CREATE TABLE IF NOT EXISTS jurnal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  guru_id TEXT REFERENCES gurus(id),
  siswa_id TEXT REFERENCES siswa(id),
  program TEXT,
  unit TEXT,
  level TEXT,
  materi TEXT,
  halaman TEXT,
  hasil TEXT,
  keterangan TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE jurnal_entries ENABLE ROW LEVEL SECURITY;

-- JALANKAN 2 BARIS INI JIKA TABEL SUDAH TERLANJUR DIBUAT SEBELUMNYA:
ALTER TABLE jurnal_entries ADD COLUMN IF NOT EXISTS program TEXT;

ALTER TABLE jurnal_entries ADD COLUMN IF NOT EXISTS unit TEXT;

-- Create reschedules table
CREATE TABLE IF NOT EXISTS reschedules (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    aktivasi_id UUID REFERENCES aktivasi_siswa(id) ON DELETE CASCADE,
    nama_siswa TEXT NOT NULL,
    jadwal_asal_id UUID REFERENCES jadwal_master(id),
    jadwal_tujuan_id UUID REFERENCES jadwal_master(id),
    tanggal_asal DATE NOT NULL,
    tanggal_tujuan DATE NOT NULL,
    jam_tujuan TEXT,
    status TEXT DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Done', 'Cancelled')),
    catatan TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE reschedules ENABLE ROW LEVEL SECURITY;

-- Script ini untuk mengubah tabel 'programs' di database Anda.
-- Menghapus kolom 'harga' dan 'durasi', lalu menambahkan kolom 'jenis' (Rutin / Harian).

ALTER TABLE public.programs
DROP COLUMN IF EXISTS harga,
DROP COLUMN IF EXISTS durasi;

ALTER TABLE public.programs
ADD COLUMN IF NOT EXISTS jenis TEXT CHECK (jenis IN ('Rutin', 'Harian')) DEFAULT 'Rutin';

-- Add booking fields to siswa table
ALTER TABLE siswa ADD COLUMN IF NOT EXISTS booking_program TEXT DEFAULT '';

ALTER TABLE siswa ADD COLUMN IF NOT EXISTS booking_jam TEXT DEFAULT '';

-- Add reschedule column to jadwal_master
ALTER TABLE jadwal_master ADD COLUMN IF NOT EXISTS reschedule BOOLEAN DEFAULT false;

-- Tambah kolom selesai di tabel aktivasi_siswa
ALTER TABLE aktivasi_siswa ADD COLUMN IF NOT EXISTS selesai BOOLEAN DEFAULT false;

-- Add assign_id_induk column to aktivasi_siswa
ALTER TABLE aktivasi_siswa ADD COLUMN IF NOT EXISTS assign_id_induk TEXT;

-- 1. Pastikan nama unit bersifat UNIK agar bisa dijadikan Foreign Key
ALTER TABLE public.units ADD CONSTRAINT units_nama_key UNIQUE (nama);

-- 2. Tambahkan Foreign Key pada tabel siswa ke units(nama)
ALTER TABLE public.siswa 
ADD CONSTRAINT siswa_unit_fkey 
FOREIGN KEY (unit) REFERENCES public.units(nama) ON DELETE RESTRICT;

-- 3. Tambahkan Foreign Key pada tabel jadwal_master ke units(nama)
ALTER TABLE public.jadwal_master 
ADD CONSTRAINT jadwal_master_unit_fkey 
FOREIGN KEY (unit) REFERENCES public.units(nama) ON DELETE RESTRICT;

-- 4. Ubah Foreign Key tabel aktivasi_siswa (dari CASCADE menjadi RESTRICT)
-- Harus disesuaikan constraint lamanya, default biasanya nama constraint 'aktivasi_siswa_siswa_id_fkey'
ALTER TABLE public.aktivasi_siswa DROP CONSTRAINT IF EXISTS aktivasi_siswa_siswa_id_fkey;

ALTER TABLE public.aktivasi_siswa 
ADD CONSTRAINT aktivasi_siswa_siswa_id_fkey 
FOREIGN KEY (siswa_id) REFERENCES public.siswa(id) ON DELETE RESTRICT;

-- 5. Ubah Foreign Key tabel jadwal_master (dari SET NULL menjadi RESTRICT)
ALTER TABLE public.jadwal_master DROP CONSTRAINT IF EXISTS jadwal_master_program_id_fkey;

ALTER TABLE public.jadwal_master 
ADD CONSTRAINT jadwal_master_program_id_fkey 
FOREIGN KEY (program_id) REFERENCES public.programs(id) ON DELETE RESTRICT;

ALTER TABLE public.jadwal_master DROP CONSTRAINT IF EXISTS jadwal_master_guru_id_fkey;

ALTER TABLE public.jadwal_master 
ADD CONSTRAINT jadwal_master_guru_id_fkey 
FOREIGN KEY (guru_id) REFERENCES public.gurus(id) ON DELETE RESTRICT;
