-- ============================================================
-- 0008a — PRATINJAU MIGRASI PAYROLL LAMA  (HANYA MEMBACA)
--
-- Script ini TIDAK MENGUBAH APA PUN. Jalankan dulu untuk melihat
-- apa saja yang akan dipindahkan ke struktur payroll baru.
--
-- Jalankan di Supabase SQL Editor, lihat tabel hasilnya.
-- ============================================================

SELECT * FROM (
  SELECT 1 AS urut, 'Komponen gaji (salary_components)' AS yang_dipindah,
         COUNT(*)::text AS jumlah,
         'Menjadi baris di komponen_gaji, semua bertipe "nominal tetap"' AS keterangan
  FROM salary_components

  UNION ALL
  SELECT 2, 'Struktur gaji karyawan (employee_salaries)',
         COUNT(*)::text,
         'Menjadi karyawan_komponen. Nominal jadi "nilai khusus karyawan".'
  FROM employee_salaries

  UNION ALL
  SELECT 3, '↳ karyawan yang punya struktur gaji',
         COUNT(DISTINCT guru_id)::text, 'orang'
  FROM employee_salaries

  UNION ALL
  SELECT 4, '↳ riwayat kenaikan gaji (>1 baris per komponen)',
         COUNT(*)::text,
         'Masa berlakunya diisi otomatis agar tidak tumpang tindih'
  FROM (
    SELECT guru_id, salary_component_id
    FROM employee_salaries
    GROUP BY guru_id, salary_component_id HAVING COUNT(*) > 1
  ) x

  UNION ALL
  SELECT 5, 'Periode penggajian (payrolls)',
         COUNT(*)::text,
         'Draft→draft, Review→terkunci, Final→dibayar'
  FROM payrolls

  UNION ALL
  SELECT 6, 'Slip gaji lama (payroll_items)',
         COUNT(*)::text,
         'Menjadi slip_gaji + rinciannya (apa adanya, tidak dihitung ulang)'
  FROM payroll_items

  UNION ALL
  SELECT 7, 'Kasbon (loans)',
         COUNT(*)::text,
         'TIDAK dipindahkan — tetap di modul lama (lihat catatan di bawah)'
  FROM loans

  UNION ALL
  SELECT 8, '⚠ Periode yang BENTROK dengan periode baru',
         COUNT(*)::text,
         'Akan DILEWATI agar data baru tidak tertimpa'
  FROM payrolls p
  WHERE EXISTS (
    SELECT 1 FROM periode_payroll pp
    WHERE pp.unit_id = p.unit_id AND pp.tahun = p.periode_tahun AND pp.bulan = p.periode_bulan
  )

  UNION ALL
  SELECT 9, '⚠ Sudah pernah dimigrasi?',
         CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
                           WHERE table_name = 'migrasi_payroll_log')
              THEN 'CEK LOG' ELSE 'BELUM' END,
         'Kalau sudah pernah, jalankan rollback dulu sebelum mengulang'
) t
ORDER BY urut;


-- ── Contoh 10 baris pertama struktur gaji yang akan dipindah ──
SELECT g.nama AS karyawan, sc.nama AS komponen, sc.tipe,
       es.nominal, es.berlaku_mulai,
       COALESCE(
         (LEAD(es.berlaku_mulai) OVER (PARTITION BY es.guru_id, es.salary_component_id
                                       ORDER BY es.berlaku_mulai) - 1)::text,
         'sekarang') AS berlaku_sampai
FROM employee_salaries es
JOIN gurus g ON g.id = es.guru_id
JOIN salary_components sc ON sc.id = es.salary_component_id
ORDER BY g.nama, sc.nama, es.berlaku_mulai
LIMIT 10;

-- ============================================================
-- CATATAN
-- • KASBON tidak ikut dipindah karena bentuknya angsuran per periode,
--   berbeda dengan komponen gaji. Modul kasbon lama tetap bisa dipakai.
--   Kalau nanti mau, buat komponen bertipe "potongan" secara manual.
-- • Slip lama dipindah APA ADANYA (tidak dihitung ulang), supaya angka
--   yang sudah dibayarkan tidak berubah.
-- • Semua tabel payroll lama TIDAK dihapus dan TIDAK diubah.
-- ============================================================
