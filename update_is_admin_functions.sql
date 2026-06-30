-- Fix fungsi is_admin() dan absensi_is_admin()
-- Ganti pengecekan role 'Admin' → Owner/Administrator/Supervisor
-- Jalankan di Supabase SQL Editor

-- 1. Fungsi umum is_admin()
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT role IN ('Owner', 'Administrator', 'Supervisor')
     FROM public.gurus
     WHERE auth_user_id = auth.uid() AND status = 'Aktif'
     LIMIT 1),
    false
  );
$$;

-- 2. Fungsi khusus absensi
CREATE OR REPLACE FUNCTION public.absensi_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT role IN ('Owner', 'Administrator', 'Supervisor')
     FROM public.gurus
     WHERE auth_user_id = auth.uid()
     LIMIT 1),
    false
  );
$$;
