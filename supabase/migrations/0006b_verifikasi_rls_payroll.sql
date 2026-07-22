-- ============================================================
-- 0006b — VERIFIKASI KEAMANAN PAYROLL (hanya membaca, tidak mengubah apa pun)
--
-- Jalankan SETELAH 0006_payroll_fleksibel.sql.
-- Script ini MEMBUKTIKAN bahwa:
--   1. Semua tabel payroll punya RLS aktif + policy (tidak ada yang telanjang)
--   2. Karyawan biasa TIDAK BISA membaca slip gaji orang lain
--   3. Karyawan biasa TIDAK BISA membaca slip miliknya yang belum 'dibayar'
--   4. Karyawan biasa TIDAK BISA mengangkat dirinya jadi pengelola payroll
--
-- Semua langkah memakai transaksi yang DIBATALKAN (ROLLBACK) di akhir,
-- jadi tidak ada data yang tersimpan.
-- ============================================================

-- ── UJI 1: RLS aktif & punya policy di semua tabel payroll ──
SELECT
  c.relname                                   AS tabel,
  c.relrowsecurity                            AS rls_aktif,
  COUNT(p.policyname)                         AS jumlah_policy,
  CASE WHEN c.relrowsecurity AND COUNT(p.policyname) > 0
       THEN 'AMAN' ELSE 'BAHAYA — PERIKSA!' END AS hasil
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policies p ON p.tablename = c.relname AND p.schemaname = 'public'
WHERE n.nspname = 'public'
  AND c.relname IN ('komponen_gaji','paket_gaji','paket_gaji_komponen',
                    'karyawan_komponen','periode_payroll','slip_gaji','slip_gaji_detail')
GROUP BY c.relname, c.relrowsecurity
ORDER BY c.relname;
-- HARAPAN: 7 baris, semuanya 'AMAN'.


-- ── UJI 2–4: simulasi sebagai karyawan biasa ──
-- Ganti dulu 2 nilai di bawah dengan data asli dari database Anda:
--   :guru_biasa      = gurus.id milik karyawan BIASA (bukan Owner/pengelola)
--   :auth_uid_biasa  = gurus.auth_user_id milik karyawan tersebut
--
-- Cara mencari:
--   SELECT id, nama, role, auth_user_id, boleh_kelola_payroll
--   FROM gurus WHERE role NOT IN ('Owner') AND auth_user_id IS NOT NULL LIMIT 5;

BEGIN;

-- Menyamar jadi karyawan biasa
SET LOCAL ROLE authenticated;
-- GANTI dengan auth_user_id karyawan biasa:
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}';

-- UJI 2: Berapa slip yang bisa dia lihat?
--   HARAPAN: hanya slip MILIKNYA yang berstatus 'dibayar'.
SELECT
  COUNT(*)                                                    AS slip_terlihat,
  COUNT(*) FILTER (WHERE guru_id <> public.absensi_guru_id()) AS slip_orang_lain,
  COUNT(*) FILTER (WHERE status <> 'dibayar')                 AS slip_belum_dibayar,
  CASE WHEN COUNT(*) FILTER (WHERE guru_id <> public.absensi_guru_id()) = 0
        AND COUNT(*) FILTER (WHERE status <> 'dibayar') = 0
       THEN 'AMAN' ELSE 'BOCOR — PERIKSA POLICY!' END         AS hasil
FROM public.slip_gaji;

-- UJI 3: Rincian slip orang lain juga harus tidak terlihat.
SELECT
  COUNT(*) AS detail_terlihat,
  CASE WHEN COUNT(*) = 0 THEN 'AMAN (tidak ada slip dibayar) / cek manual'
       ELSE 'ada detail terlihat — pastikan semua milik sendiri & dibayar' END AS catatan
FROM public.slip_gaji_detail d
WHERE NOT EXISTS (
  SELECT 1 FROM public.slip_gaji s
  WHERE s.id = d.slip_gaji_id
    AND s.guru_id = public.absensi_guru_id()
    AND s.status = 'dibayar'
);
-- HARAPAN: detail_terlihat = 0

-- UJI 4: Karyawan mencoba mengangkat dirinya jadi pengelola payroll.
--   HARAPAN: GAGAL dengan pesan "Hanya Owner yang boleh mengubah izin kelola payroll."
DO $$
BEGIN
  UPDATE public.gurus
     SET boleh_kelola_payroll = true
   WHERE auth_user_id = auth.uid();
  RAISE WARNING 'BAHAYA: karyawan BERHASIL mengubah flag payroll — policy bocor!';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'AMAN: percobaan ditolak (%).', SQLERRM;
END $$;

ROLLBACK;   -- tidak ada perubahan yang tersimpan

-- ============================================================
-- Kalau UJI 1 semua 'AMAN', UJI 2 'AMAN', UJI 3 = 0, dan UJI 4
-- menampilkan 'AMAN: percobaan ditolak', maka keamanan payroll lulus.
-- ============================================================
