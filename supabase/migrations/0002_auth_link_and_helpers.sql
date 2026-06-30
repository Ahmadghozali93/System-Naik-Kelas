-- ============================================================
-- 0002 AUTH LINK + HELPER FUNCTIONS
-- Hubungkan profil gurus ke Supabase Auth + fungsi peran (anti-rekursi RLS)
-- ============================================================
ALTER TABLE public.gurus
  ADD COLUMN IF NOT EXISTS auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.current_guru_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT g.role FROM public.gurus g
  WHERE g.auth_user_id = auth.uid() AND g.status = 'Aktif' LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT public.current_guru_role() IN ('Owner', 'Administrator', 'Supervisor');
$$;

CREATE OR REPLACE FUNCTION public.current_guru_id()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT g.id FROM public.gurus g WHERE g.auth_user_id = auth.uid() LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_guru_role() FROM public;
REVOKE ALL ON FUNCTION public.is_admin() FROM public;
REVOKE ALL ON FUNCTION public.current_guru_id() FROM public;
GRANT EXECUTE ON FUNCTION public.current_guru_role() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.current_guru_id() TO authenticated;
