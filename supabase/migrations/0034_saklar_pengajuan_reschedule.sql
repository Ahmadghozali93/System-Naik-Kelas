-- ============================================================
-- Aturan form publik /pengajuan-reschedule
--
-- 1. Saklar buka/tutup form. Disimpan di app_settings
--    (key 'pengajuan_reschedule_aktif', nilai 'true' / 'false').
--    Baca: semua orang (policy settings_select).
--    Tulis: is_admin() — Owner, Administrator, Supervisor.
--
-- 2. Satu siswa hanya boleh punya satu pengajuan berjalan
--    (status Pending atau Approved). Pengajuan baru baru bisa dibuat
--    setelah yang lama Done atau Cancelled.
--
-- Menyembunyikan form di frontend saja tidak cukup: halaman lama yang
-- masih terbuka (atau panggilan API langsung) tetap bisa INSERT. Jadi
-- policy INSERT anon pada reschedules ikut memeriksa kedua aturan ini.
-- Reschedule yang dibuat pengguna login (admin dari halaman Reschedule)
-- tidak terpengaruh.
-- ============================================================

INSERT INTO public.app_settings (key, value)
VALUES ('pengajuan_reschedule_aktif', 'true')
ON CONFLICT (key) DO NOTHING;

-- Siswa dikenali lewat siswa_id dari aktivasinya (satu siswa bisa punya
-- beberapa aktivasi), dengan cadangan nama_siswa untuk baris lama yang
-- aktivasinya sudah tidak ada. SECURITY DEFINER supaya pemeriksaan tetap
-- melihat aktivasi berstatus non-Aktif yang tak terbaca oleh anon.
CREATE OR REPLACE FUNCTION public.ada_reschedule_berjalan(p_aktivasi_id UUID, p_nama_siswa TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM reschedules r
    WHERE r.status IN ('Pending', 'Approved')
      AND (
        lower(trim(r.nama_siswa)) = lower(trim(p_nama_siswa))
        OR r.aktivasi_id IN (
          SELECT a2.id
          FROM aktivasi_siswa a1
          JOIN aktivasi_siswa a2 ON a2.siswa_id = a1.siswa_id
          WHERE a1.id = p_aktivasi_id
            AND a1.siswa_id IS NOT NULL
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.ada_reschedule_berjalan(UUID, TEXT) TO anon, authenticated;

DROP POLICY IF EXISTS resched_insert_anon ON public.reschedules;
CREATE POLICY resched_insert_anon ON public.reschedules
  FOR INSERT TO anon
  WITH CHECK (
    COALESCE(
      (SELECT value FROM public.app_settings WHERE key = 'pengajuan_reschedule_aktif'),
      'true'
    ) <> 'false'
    AND NOT public.ada_reschedule_berjalan(aktivasi_id, nama_siswa)
  );
