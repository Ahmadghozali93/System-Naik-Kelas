-- ============================================================
-- 0005 BUANG KOLOM PASSWORD PLAINTEXT
-- Aman dijalankan: kredensial kini di Supabase Auth (auth.users).
-- Pada migrasi data produksi, jalankan SETELAH auth user dibuat
-- (lihat scripts/create-auth-users.mjs).
-- ============================================================
ALTER TABLE public.gurus DROP COLUMN IF EXISTS password;
