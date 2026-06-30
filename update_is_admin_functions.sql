-- Fix fungsi is_admin() dan absensi_is_admin()
-- Ganti pengecekan role 'Admin' → Owner/Administrator/Supervisor
-- Jalankan di Supabase SQL Editor

-- 1. Fungsi umum is_admin()
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT public.current_guru_role() IN ('Owner', 'Administrator', 'Supervisor');
$$;

-- 2. Fungsi khusus absensi
CREATE OR REPLACE FUNCTION absensi_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM gurus
    WHERE auth_user_id = auth.uid()
      AND role IN ('Owner', 'Administrator', 'Supervisor')
    LIMIT 1
  );
$$;
