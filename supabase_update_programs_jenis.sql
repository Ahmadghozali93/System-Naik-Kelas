-- Script ini untuk mengubah tabel 'programs' di database Anda.
-- Menghapus kolom 'harga' dan 'durasi', lalu menambahkan kolom 'jenis' (Rutin / Harian).

ALTER TABLE public.programs
DROP COLUMN IF EXISTS harga,
DROP COLUMN IF EXISTS durasi;

ALTER TABLE public.programs
ADD COLUMN IF NOT EXISTS jenis TEXT CHECK (jenis IN ('Rutin', 'Harian')) DEFAULT 'Rutin';
