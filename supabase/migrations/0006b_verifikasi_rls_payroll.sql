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
--
--   PENTING: UJI 2 & 3 hanya bermakna kalau di database SUDAH ADA data slip
--   (yaitu setelah Fase 2 dijalankan). Selama tabel slip masih kosong,
--   hasil "0" itu WAJAR dan BUKAN bukti keamanan. Kolom `catatan_validitas`
--   di bawah memberi tahu apakah tes ini bisa dipercaya atau belum.
SELECT
  COUNT(*)                                                    AS slip_terlihat,
  COUNT(*) FILTER (WHERE guru_id <> public.absensi_guru_id()) AS slip_orang_lain,
  COUNT(*) FILTER (WHERE status <> 'dibayar')                 AS slip_belum_dibayar,
  CASE WHEN COUNT(*) FILTER (WHERE guru_id <> public.absensi_guru_id()) = 0
        AND COUNT(*) FILTER (WHERE status <> 'dibayar') = 0
       THEN 'AMAN' ELSE 'BOCOR — PERIKSA POLICY!' END         AS hasil,
  CASE
    WHEN public.absensi_guru_id() IS NULL
      THEN 'TIDAK VALID — UUID di request.jwt.claims belum diganti'
    WHEN (SELECT COUNT(*) FROM public.slip_gaji) = 0
      THEN 'BELUM BERMAKNA — belum ada data slip (jalankan lagi setelah Fase 2)'
    ELSE 'VALID — hasil bisa dipercaya'
  END                                                          AS catatan_validitas
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
DECLARE v_rows INT; v_guru TEXT;
BEGIN
  v_guru := public.absensi_guru_id();
  IF v_guru IS NULL THEN
    RAISE NOTICE 'TES DILEWATI — UUID di request.jwt.claims belum diganti dengan auth_user_id karyawan asli. Hasil tes tidak bermakna.';
    RETURN;
  END IF;

  UPDATE public.gurus
     SET boleh_kelola_payroll = true
   WHERE auth_user_id = auth.uid();
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows > 0 THEN
    RAISE WARNING 'BAHAYA: karyawan BERHASIL mengubah flag payroll (% baris) — policy bocor!', v_rows;
  ELSE
    RAISE NOTICE 'AMAN: tidak ada baris yang berubah (ditolak policy).';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'AMAN: percobaan ditolak oleh pengaman (%).', SQLERRM;
END $$;

ROLLBACK;   -- tidak ada perubahan yang tersimpan

-- ============================================================
-- CARA MEMBACA HASIL
--
-- Sekarang (tabel slip masih kosong, Fase 2 belum jalan):
--   • UJI 1 = satu-satunya yang BERMAKNA. Harus 7 baris 'AMAN'.
--   • UJI 2 & 3 akan menunjukkan 0 — itu WAJAR, bukan bukti apa-apa.
--   • UJI 4 bermakna HANYA kalau UUID sudah diganti (lihat kolom catatan).
--
-- Nanti (setelah Fase 2 & sudah ada slip):
--   Jalankan ulang script ini. Baru UJI 2 & 3 bisa dipercaya,
--   ditandai catatan_validitas = 'VALID'.
-- ============================================================
