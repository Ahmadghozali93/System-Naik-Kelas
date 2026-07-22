-- ============================================================
-- 0008b — MEMBATALKAN MIGRASI PAYROLL (ROLLBACK)
--
-- Menghapus SEMUA baris yang dibuat oleh 0008_migrasi_payroll_lama.sql,
-- berdasarkan catatan di migrasi_payroll_log.
--
-- AMAN: hanya menghapus baris hasil migrasi. Data yang Anda buat sendiri
-- lewat aplikasi TIDAK tersentuh, karena tidak tercatat di log.
-- Tabel payroll LAMA juga tidak tersentuh sama sekali.
--
-- Urutan hapus dibalik (anak dulu, induk belakangan) agar tidak
-- melanggar keterkaitan antar tabel.
-- ============================================================

DO $$
DECLARE
  v_det  INT := 0;
  v_slip INT := 0;
  v_per  INT := 0;
  v_kar  INT := 0;
  v_komp INT := 0;
  r      RECORD;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'migrasi_payroll_log') THEN
    RAISE EXCEPTION 'Tidak ada catatan migrasi. Belum pernah dijalankan.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM migrasi_payroll_log) THEN
    RAISE NOTICE 'Catatan migrasi kosong — tidak ada yang perlu dibatalkan.';
    RETURN;
  END IF;

  -- Periode hasil migrasi harus dikembalikan ke 'draft' dulu, karena
  -- periode terkunci/dibayar menolak perubahan pada slip-nya.
  FOR r IN SELECT id_baru::uuid AS id FROM migrasi_payroll_log WHERE tabel = 'periode_payroll' LOOP
    UPDATE periode_payroll SET status = 'draft', tanggal_kunci = NULL, tanggal_bayar = NULL
     WHERE id = r.id;
    UPDATE slip_gaji SET status = 'draft' WHERE periode_payroll_id = r.id;
  END LOOP;

  -- 1. Rincian slip
  DELETE FROM slip_gaji_detail d
   USING migrasi_payroll_log l
   WHERE l.tabel = 'slip_gaji' AND d.slip_gaji_id = l.id_baru::uuid;
  GET DIAGNOSTICS v_det = ROW_COUNT;

  -- 2. Slip
  DELETE FROM slip_gaji s
   USING migrasi_payroll_log l
   WHERE l.tabel = 'slip_gaji' AND s.id = l.id_baru::uuid;
  GET DIAGNOSTICS v_slip = ROW_COUNT;

  -- 3. Periode
  DELETE FROM periode_payroll p
   USING migrasi_payroll_log l
   WHERE l.tabel = 'periode_payroll' AND p.id = l.id_baru::uuid;
  GET DIAGNOSTICS v_per = ROW_COUNT;

  -- 4. Struktur gaji karyawan
  DELETE FROM karyawan_komponen k
   USING migrasi_payroll_log l
   WHERE l.tabel = 'karyawan_komponen' AND k.id = l.id_baru::uuid;
  GET DIAGNOSTICS v_kar = ROW_COUNT;

  -- 5. Komponen gaji
  DELETE FROM komponen_gaji c
   USING migrasi_payroll_log l
   WHERE l.tabel = 'komponen_gaji' AND c.id = l.id_baru::uuid;
  GET DIAGNOSTICS v_komp = ROW_COUNT;

  -- 6. Bersihkan catatan
  DELETE FROM migrasi_payroll_log;

  RAISE NOTICE '=== PEMBATALAN SELESAI ===';
  RAISE NOTICE 'Rincian slip dihapus     : %', v_det;
  RAISE NOTICE 'Slip gaji dihapus        : %', v_slip;
  RAISE NOTICE 'Periode dihapus          : %', v_per;
  RAISE NOTICE 'Struktur karyawan dihapus: %', v_kar;
  RAISE NOTICE 'Komponen gaji dihapus    : %', v_komp;
  RAISE NOTICE 'Data payroll LAMA tetap utuh. Migrasi bisa diulang.';
END $$;

-- ── Pastikan sudah bersih ──
SELECT
  (SELECT COUNT(*) FROM migrasi_payroll_log) AS sisa_catatan,
  CASE WHEN (SELECT COUNT(*) FROM migrasi_payroll_log) = 0
       THEN 'BERSIH — migrasi bisa dijalankan ulang'
       ELSE 'MASIH ADA SISA — periksa manual' END AS status;
