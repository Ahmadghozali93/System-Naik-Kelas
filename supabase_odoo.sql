-- ============================================================
-- Integrasi Odoo: kolom di pembayaran_spp + tabel settings
-- Jalankan sekali di Supabase SQL Editor
-- ============================================================

-- 1. Kolom Odoo di pembayaran_spp
ALTER TABLE public.pembayaran_spp
  ADD COLUMN IF NOT EXISTS odoo_invoice_id    INTEGER    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS odoo_invoice_name  TEXT       DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS odoo_status        TEXT       DEFAULT NULL,  -- draft | posted | paid | error
  ADD COLUMN IF NOT EXISTS odoo_synced_at     TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS odoo_error         TEXT       DEFAULT NULL;

-- 2. Tabel settings aplikasi
CREATE TABLE IF NOT EXISTS public.app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- RLS: hanya admin yg bisa baca/tulis
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS settings_select ON public.app_settings;
CREATE POLICY settings_select ON public.app_settings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS settings_write ON public.app_settings;
CREATE POLICY settings_write ON public.app_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.gurus
      WHERE auth_user_id = auth.uid() AND role = 'Admin'
    )
  );

-- 3. Default settings Odoo (isi api_key dan email di halaman Pengaturan Odoo)
INSERT INTO public.app_settings (key, value) VALUES
  ('odoo_url',               'https://naik-kelas.odoo.com'),
  ('odoo_db',                'naik-kelas'),
  ('odoo_api_key',           'b4d5c5e43da7f52678c630b94a1427709c6d0b44'),
  ('odoo_email',             'ghozaliahmad83@gmail.com'),
  ('odoo_company_Sarirejo',  '2'),
  ('odoo_company_Plantaran', '3'),
  ('odoo_company_Krajankulon','4'),
  ('odoo_company_Magelung',  '5')
ON CONFLICT (key) DO NOTHING;
