-- ============================================================
-- DIAGNOSA: "Slip Gaji Saya" kosong padahal periode sudah dibayar
--
-- Jalankan di Supabase SQL Editor (sebagai service role — auth.uid()
-- di sini NULL, jadi semua pemeriksaan berbasis data, bukan sesi).
-- ============================================================

-- ── 1. Apakah status slip ikut berubah saat periode ditandai dibayar? ──
-- Halaman "Slip Gaji Saya" menyaring slip_gaji.status = 'dibayar',
-- BUKAN status periodenya. Kalau ada baris dengan status_periode
-- 'dibayar' tapi status_slip 'terkunci'/'draft' → penyebab (B):
-- UPDATE slip_gaji di PeriodePayrollPage gagal diam-diam.
SELECT pp.tahun, pp.bulan,
       pp.status AS status_periode,
       s.status  AS status_slip,
       COUNT(*)  AS jumlah_slip
FROM   public.periode_payroll pp
JOIN   public.slip_gaji s ON s.periode_payroll_id = pp.id
GROUP  BY 1,2,3,4
ORDER  BY 1 DESC, 2 DESC, 4;


-- ── 2. Apakah tautan identitas guru konsisten? ──
-- RLS slip (sg_select) mengenali "slip milik saya" lewat
-- absensi_guru_id() yang mencocokkan EMAIL, sedangkan aplikasi
-- mengenali user lewat auth_user_id. Kalau kedua tautan itu beda,
-- slip tetap tidak terlihat walau statusnya 'dibayar' → penyebab (A).
SELECT g.id, g.nama, g.role,
       g.email          AS email_di_gurus,
       u.email          AS email_di_auth,
       g.auth_user_id,
       CASE
         WHEN g.auth_user_id IS NULL                       THEN 'auth_user_id KOSONG'
         WHEN u.id IS NULL                                 THEN 'auth_user_id menunjuk user yang tidak ada'
         WHEN lower(coalesce(g.email,'')) IS DISTINCT FROM
              lower(coalesce(u.email,''))                  THEN 'EMAIL BEDA'
         ELSE 'ok'
       END AS masalah
FROM   public.gurus g
LEFT   JOIN auth.users u ON u.id = g.auth_user_id
WHERE  g.auth_user_id IS NULL
   OR  u.id IS NULL
   OR  lower(coalesce(g.email,'')) IS DISTINCT FROM lower(coalesce(u.email,''))
ORDER  BY g.nama;


-- ── 3. Email ganda di tabel gurus ──
-- absensi_guru_id() memakai LIMIT 1, jadi email kembar bisa
-- mengembalikan guru yang salah.
SELECT lower(email) AS email, COUNT(*) AS jumlah_baris,
       string_agg(id || ' / ' || nama, ' | ') AS baris
FROM   public.gurus
WHERE  email IS NOT NULL AND email <> ''
GROUP  BY 1
HAVING COUNT(*) > 1;


-- ── 4. Simulasi per orang: apa yang akan dilihat guru X? ──
-- Ganti nilainya dengan email login orang yang mengeluh.
WITH target AS (
  SELECT id, nama, email FROM public.gurus WHERE lower(email) = lower('ganti@email.com')
)
SELECT t.nama, pp.tahun, pp.bulan, pp.status AS status_periode, s.status AS status_slip,
       s.gaji_bersih,
       (s.status = 'dibayar') AS akan_terlihat_di_slip_saya
FROM   target t
LEFT   JOIN public.slip_gaji s      ON s.guru_id = t.id
LEFT   JOIN public.periode_payroll pp ON pp.id = s.periode_payroll_id
ORDER  BY pp.tahun DESC, pp.bulan DESC;
