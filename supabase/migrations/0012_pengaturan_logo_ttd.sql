-- ============================================================
-- 0012  Logo aplikasi tersimpan di server + tanda tangan persetujuan slip gaji
--
-- Masalah yang diperbaiki:
--   1. Logo/nama aplikasi hanya tersimpan di localStorage. Penyebabnya
--      policy tulis app_settings masih memakai role lama 'Admin', padahal
--      peran yang dipakai sekarang Owner/Administrator/Supervisor —
--      jadi upsert ke Supabase selalu ditolak diam-diam.
--   2. Slip gaji belum menampilkan nama & tanda tangan penyetuju.
-- ============================================================

-- ── 1. app_settings: policy tulis pakai helper peran yang berlaku ──
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS settings_select ON public.app_settings;
DROP POLICY IF EXISTS settings_write  ON public.app_settings;

-- Logo & nama aplikasi juga dipakai di halaman login/booking (anon).
CREATE POLICY settings_select ON public.app_settings
  FOR SELECT USING (true);

CREATE POLICY settings_write ON public.app_settings
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- ── 2. Tanda tangan pribadi (data URI gambar) milik penyetuju ──
ALTER TABLE public.gurus
  ADD COLUMN IF NOT EXISTS ttd_gambar TEXT;

COMMENT ON COLUMN public.gurus.ttd_gambar IS
  'Tanda tangan pribadi (data URI PNG). Dipakai saat menyetujui/mengunci periode payroll.';


-- ── 3. Snapshot penyetuju di periode payroll ──
-- Disalin SAAT dikunci, bukan JOIN: slip yang sudah dicetak tidak boleh
-- ikut berubah kalau orangnya ganti nama/jabatan/tanda tangan.
ALTER TABLE public.periode_payroll
  ADD COLUMN IF NOT EXISTS disetujui_nama    TEXT,
  ADD COLUMN IF NOT EXISTS disetujui_jabatan TEXT,
  ADD COLUMN IF NOT EXISTS disetujui_ttd     TEXT;


-- ── 4. Karyawan boleh membaca periode dari slip miliknya yang sudah dibayar ──
-- Tanpa ini, halaman "Slip Gaji Saya" tidak bisa menampilkan bulan/tahun
-- maupun nama & tanda tangan penyetuju.
DROP POLICY IF EXISTS pp_select ON public.periode_payroll;
CREATE POLICY pp_select ON public.periode_payroll FOR SELECT TO authenticated
  USING (
    public.payroll_is_owner()
    OR public.payroll_kelola_unit(unit_id)
    OR EXISTS (
      SELECT 1 FROM public.slip_gaji s
      WHERE s.periode_payroll_id = periode_payroll.id
        AND s.guru_id = public.absensi_guru_id()
        AND s.status  = 'dibayar'
    )
  );
