-- Tambah kolom nominal_spp ke tabel jadwal_master
-- Jalankan sekali di Supabase SQL Editor

ALTER TABLE public.jadwal_master
  ADD COLUMN IF NOT EXISTS nominal_spp INTEGER NOT NULL DEFAULT 0;
