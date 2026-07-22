-- ============================================================
-- 0007b — UJI MESIN PAYROLL (rapor otomatis LULUS / GAGAL)
--
-- CARA PAKAI:
--   1. Buka Supabase → SQL Editor → + New query
--   2. Salin SELURUH isi file ini, tempel, klik Run
--   3. Lihat tabel hasil: kolom STATUS harus "LULUS" semua
--
-- Script membuat data contoh, menghitung, menilai sendiri hasilnya,
-- lalu MEMBATALKAN semuanya (ROLLBACK). Data Anda tidak tersentuh.
-- Tidak perlu membaca panel "Messages" — semua penilaian ada di tabel.
-- ============================================================

BEGIN;

CREATE TEMP TABLE _rapor (
  no INT, pemeriksaan TEXT, diharapkan TEXT, hasil_nyata TEXT, status TEXT
) ON COMMIT DROP;

-- ── Data contoh ──
INSERT INTO units (id, nama, aktif) VALUES ('UNIT-UJI','Unit Uji Payroll',true)
  ON CONFLICT (id) DO NOTHING;

INSERT INTO programs (id, nama, jenis, status)
VALUES ('PROG-UJI-A','Program Uji A','Rutin','Aktif'),
       ('PROG-UJI-B','Program Uji B','Rutin','Aktif')
  ON CONFLICT (id) DO NOTHING;

INSERT INTO gurus (id, email, nama, role, status)
VALUES ('GURU-UJI1','uji1@contoh.test','Guru Uji Satu','Tutor','Aktif'),
       ('GURU-UJI2','uji2@contoh.test','Guru Uji Dua','Tutor','Aktif')
  ON CONFLICT (id) DO NOTHING;

INSERT INTO guru_units (guru_id, unit_id)
VALUES ('GURU-UJI1','UNIT-UJI'), ('GURU-UJI2','UNIT-UJI') ON CONFLICT DO NOTHING;

INSERT INTO siswa (id, nama, unit, status)
VALUES ('SIS-UJI1','Siswa Uji 1','Unit Uji Payroll','Aktif'),
       ('SIS-UJI2','Siswa Uji 2','Unit Uji Payroll','Aktif'),
       ('SIS-UJI3','Siswa Uji 3','Unit Uji Payroll','Aktif')
  ON CONFLICT (id) DO NOTHING;

-- ── Komponen (angka HANYA untuk uji, dibatalkan di akhir) ──
INSERT INTO komponen_gaji (id, unit_id, kode, nama, kategori, tipe_perhitungan, konfigurasi, urutan_tampil, aktif) VALUES
 ('11111111-1111-1111-1111-111111111111','UNIT-UJI','UJI_POKOK','Uji Gaji Pokok','pendapatan','nominal_tetap',
  '{"nominal": 1500000}'::jsonb, 10, true),
 ('22222222-2222-2222-2222-222222222222','UNIT-UJI','UJI_FEE','Uji Fee Tatap Muka','pendapatan','per_unit',
  jsonb_build_object('sumber_unit','jurnal_mengajar','wajib_terverifikasi',false,'batas_jurnal_per_hari',2,
    'matriks_tarif', jsonb_build_array(jsonb_build_object('program_id','PROG-UJI-A','tarif',25000))), 20, true),
 ('33333333-3333-3333-3333-333333333333','UNIT-UJI','UJI_HADIR','Uji Bonus Kehadiran','pendapatan','bersyarat',
  '{"status_absensi_menghanguskan":["Alpha"],"batas_telat":2,"cara_hangus":"total","nominal":300000}'::jsonb, 30, true),
 ('44444444-4444-4444-4444-444444444444','UNIT-UJI','UJI_KPI','Uji Bonus KPI','pendapatan','bertingkat',
  '{"jika_data_kosong":"nol_dengan_peringatan","tangga":[{"min":90,"nominal":500000},{"min":80,"nominal":300000}]}'::jsonb, 40, true);

INSERT INTO karyawan_komponen (guru_id, komponen_gaji_id, berlaku_mulai) VALUES
 ('GURU-UJI1','11111111-1111-1111-1111-111111111111','2020-01-01'),
 ('GURU-UJI1','22222222-2222-2222-2222-222222222222','2020-01-01'),
 ('GURU-UJI1','33333333-3333-3333-3333-333333333333','2020-01-01'),
 ('GURU-UJI1','44444444-4444-4444-4444-444444444444','2020-01-01'),
 -- GURU-UJI2 baru masuk 20 Juni: hanya gaji pokok
 ('GURU-UJI2','11111111-1111-1111-1111-111111111111','2026-06-20');

INSERT INTO periode_payroll (id, unit_id, tahun, bulan, status)
VALUES ('99999999-9999-9999-9999-999999999999','UNIT-UJI',2026,6,'draft');

-- Jurnal: 2 sah + 1 duplikat (1 Jun); 3 berbeda → batas 2/hari (2 Jun);
--         1 program tanpa tarif (3 Jun)
INSERT INTO jurnal_entries (guru_id, siswa_id, program, unit, timestamp) VALUES
 ('GURU-UJI1','SIS-UJI1','Program Uji A','Unit Uji Payroll','2026-06-01T03:00:00Z'),
 ('GURU-UJI1','SIS-UJI2','Program Uji A','Unit Uji Payroll','2026-06-01T04:00:00Z'),
 ('GURU-UJI1','SIS-UJI1','Program Uji A','Unit Uji Payroll','2026-06-01T05:00:00Z'),
 ('GURU-UJI1','SIS-UJI1','Program Uji A','Unit Uji Payroll','2026-06-02T03:00:00Z'),
 ('GURU-UJI1','SIS-UJI2','Program Uji A','Unit Uji Payroll','2026-06-02T04:00:00Z'),
 ('GURU-UJI1','SIS-UJI3','Program Uji A','Unit Uji Payroll','2026-06-02T06:00:00Z'),
 ('GURU-UJI1','SIS-UJI1','Program Uji B','Unit Uji Payroll','2026-06-03T03:00:00Z');

INSERT INTO attendances (guru_id, unit_id, tanggal, status) VALUES
 ('GURU-UJI1','UNIT-UJI','2026-06-01','Hadir'),
 ('GURU-UJI1','UNIT-UJI','2026-06-02','Telat'),
 ('GURU-UJI1','UNIT-UJI','2026-06-03','Telat'),
 ('GURU-UJI1','UNIT-UJI','2026-06-04','Telat'),
 ('GURU-UJI1','UNIT-UJI','2026-06-05','Alpha');
-- Skor KPI sengaja dikosongkan

-- ── Hitung ──
DO $$ BEGIN PERFORM hitung_periode('99999999-9999-9999-9999-999999999999'); END $$;

-- ============================================================
-- PENILAIAN
-- ============================================================
INSERT INTO _rapor
-- 1. Gaji pokok + fee
SELECT 1, 'Gaji bersih Guru Uji Satu', 'Rp 1.600.000',
       'Rp ' || to_char(s.gaji_bersih,'FM999G999G999'),
       CASE WHEN s.gaji_bersih = 1600000 THEN 'LULUS' ELSE 'GAGAL' END
FROM slip_gaji s WHERE s.guru_id='GURU-UJI1'
  AND s.periode_payroll_id='99999999-9999-9999-9999-999999999999';

INSERT INTO _rapor
-- 2. Masuk tengah bulan → komponen lain belum berlaku
SELECT 2, 'Gaji Guru Uji Dua (masuk 20 Juni)', 'Rp 1.500.000',
       'Rp ' || to_char(s.gaji_bersih,'FM999G999G999'),
       CASE WHEN s.gaji_bersih = 1500000 THEN 'LULUS' ELSE 'GAGAL' END
FROM slip_gaji s WHERE s.guru_id='GURU-UJI2'
  AND s.periode_payroll_id='99999999-9999-9999-9999-999999999999';

INSERT INTO _rapor
-- 3. Jumlah tatap muka yang dibayar
SELECT 3, 'Tatap muka dibayar', '4 unit = Rp 100.000',
       COALESCE(d.jumlah_unit::text,'-') || ' unit = Rp ' || to_char(d.nominal,'FM999G999G999'),
       CASE WHEN d.jumlah_unit = 4 AND d.nominal = 100000 THEN 'LULUS' ELSE 'GAGAL' END
FROM slip_gaji_detail d JOIN slip_gaji s ON s.id=d.slip_gaji_id
WHERE s.guru_id='GURU-UJI1' AND d.nama_komponen='Uji Fee Tatap Muka';

INSERT INTO _rapor
-- 4. Bonus kehadiran hangus (ada 1 Alpha)
SELECT 4, 'Bonus kehadiran (ada 1 alpa)', 'Rp 0 — hangus',
       'Rp ' || to_char(d.nominal,'FM999G999G999') || ' — ' || COALESCE(d.keterangan_hitung,''),
       CASE WHEN d.nominal = 0 THEN 'LULUS' ELSE 'GAGAL' END
FROM slip_gaji_detail d JOIN slip_gaji s ON s.id=d.slip_gaji_id
WHERE s.guru_id='GURU-UJI1' AND d.nama_komponen='Uji Bonus Kehadiran';

INSERT INTO _rapor
-- 5. Bonus KPI 0 karena skor belum diinput
SELECT 5, 'Bonus KPI (skor belum diinput)', 'Rp 0 + peringatan',
       'Rp ' || to_char(d.nominal,'FM999G999G999'),
       CASE WHEN d.nominal = 0 THEN 'LULUS' ELSE 'GAGAL' END
FROM slip_gaji_detail d JOIN slip_gaji s ON s.id=d.slip_gaji_id
WHERE s.guru_id='GURU-UJI1' AND d.nama_komponen='Uji Bonus KPI';

INSERT INTO _rapor
-- 6. Slip ditandai perlu ditinjau
SELECT 6, 'Slip ditandai "perlu ditinjau"', 'ya',
       CASE WHEN s.butuh_ditinjau THEN 'ya' ELSE 'tidak' END,
       CASE WHEN s.butuh_ditinjau THEN 'LULUS' ELSE 'GAGAL' END
FROM slip_gaji s WHERE s.guru_id='GURU-UJI1'
  AND s.periode_payroll_id='99999999-9999-9999-9999-999999999999';

INSERT INTO _rapor
-- 7. Peringatan tercatat (tidak gagal diam-diam)
SELECT 7, 'Peringatan tercatat di slip', 'minimal 3',
       jsonb_array_length(COALESCE(s.peringatan,'[]'::jsonb))::text,
       CASE WHEN jsonb_array_length(COALESCE(s.peringatan,'[]'::jsonb)) >= 3
            THEN 'LULUS' ELSE 'GAGAL' END
FROM slip_gaji s WHERE s.guru_id='GURU-UJI1'
  AND s.periode_payroll_id='99999999-9999-9999-9999-999999999999';

-- 8–11: rincian jurnal
INSERT INTO _rapor
SELECT 8, 'Jurnal duplikat ditolak', '1 jurnal',
       COUNT(*)::text || ' jurnal',
       CASE WHEN COUNT(*)=1 THEN 'LULUS' ELSE 'GAGAL' END
FROM rincian_jurnal_fee('GURU-UJI1','2026-06-01','2026-06-30',
       (SELECT konfigurasi FROM komponen_gaji WHERE kode='UJI_FEE'))
WHERE alasan LIKE 'Duplikat%';

INSERT INTO _rapor
SELECT 9, 'Jurnal lewat batas harian ditolak', '1 jurnal, siswa SIS-UJI3',
       COUNT(*)::text || ' jurnal, siswa ' || COALESCE(MAX(siswa_id),'-'),
       CASE WHEN COUNT(*)=1 AND MAX(siswa_id)='SIS-UJI3' THEN 'LULUS' ELSE 'GAGAL' END
FROM rincian_jurnal_fee('GURU-UJI1','2026-06-01','2026-06-30',
       (SELECT konfigurasi FROM komponen_gaji WHERE kode='UJI_FEE'))
WHERE alasan LIKE 'Melebihi batas%';

INSERT INTO _rapor
SELECT 10, 'Program tanpa tarif tidak dibayar diam-diam', '1 jurnal, program disebut',
       COUNT(*)::text || ' jurnal, program ' || COALESCE(MAX(program),'-'),
       CASE WHEN COUNT(*)=1 AND MAX(program)='Program Uji B' THEN 'LULUS' ELSE 'GAGAL' END
FROM rincian_jurnal_fee('GURU-UJI1','2026-06-01','2026-06-30',
       (SELECT konfigurasi FROM komponen_gaji WHERE kode='UJI_FEE'))
WHERE alasan LIKE 'Tarif tidak%';

INSERT INTO _rapor
SELECT 11, 'Urutan stabil (yang ditolak = paling akhir)', 'SIS-UJI3 di posisi terakhir 2 Juni',
       COALESCE((SELECT siswa_id FROM rincian_jurnal_fee('GURU-UJI1','2026-06-02','2026-06-02',
                 (SELECT konfigurasi FROM komponen_gaji WHERE kode='UJI_FEE'))
                 OFFSET 2 LIMIT 1),'-'),
       CASE WHEN (SELECT siswa_id FROM rincian_jurnal_fee('GURU-UJI1','2026-06-02','2026-06-02',
                  (SELECT konfigurasi FROM komponen_gaji WHERE kode='UJI_FEE'))
                  OFFSET 2 LIMIT 1) = 'SIS-UJI3'
            THEN 'LULUS' ELSE 'GAGAL' END;

-- 12. Opsi "wajib_terverifikasi" harus DITOLAK
DO $$
BEGIN
  UPDATE komponen_gaji SET konfigurasi = konfigurasi || '{"wajib_terverifikasi": true}'::jsonb
   WHERE kode='UJI_FEE';
  PERFORM hitung_slip_gaji('99999999-9999-9999-9999-999999999999','GURU-UJI1');
  INSERT INTO _rapor VALUES (12,'Opsi verifikasi jurnal (belum didukung)','ditolak','malah diproses','GAGAL');
EXCEPTION WHEN OTHERS THEN
  INSERT INTO _rapor VALUES (12,'Opsi verifikasi jurnal (belum didukung)','ditolak','ditolak dengan pesan jelas','LULUS');
END $$;

-- 13. Periode terkunci harus menolak perhitungan ulang
DO $$
BEGIN
  UPDATE periode_payroll SET status='terkunci'
   WHERE id='99999999-9999-9999-9999-999999999999';
  PERFORM hitung_slip_gaji('99999999-9999-9999-9999-999999999999','GURU-UJI2');
  INSERT INTO _rapor VALUES (13,'Periode terkunci','menolak perhitungan ulang','masih bisa dihitung','GAGAL');
EXCEPTION WHEN OTHERS THEN
  INSERT INTO _rapor VALUES (13,'Periode terkunci','menolak perhitungan ulang','ditolak','LULUS');
END $$;

-- ============================================================
-- RAPOR AKHIR — ini satu-satunya tabel yang perlu Anda lihat
-- ============================================================
SELECT no, pemeriksaan, diharapkan, hasil_nyata, status FROM _rapor
UNION ALL
SELECT 99, '=== KESIMPULAN ===',
       COUNT(*)::text || ' pemeriksaan',
       COUNT(*) FILTER (WHERE status='LULUS')::text || ' lulus, ' ||
       COUNT(*) FILTER (WHERE status='GAGAL')::text || ' gagal',
       CASE WHEN COUNT(*) FILTER (WHERE status='GAGAL') = 0
            THEN 'SEMUA LULUS' ELSE 'ADA YANG GAGAL' END
FROM _rapor
ORDER BY no;

ROLLBACK;   -- semua data contoh dibuang

-- ============================================================
-- Baris terakhir (no 99) adalah kesimpulannya.
-- Kalau tertulis "SEMUA LULUS" → mesin payroll bekerja benar.
-- Kalau "ADA YANG GAGAL" → lihat baris mana yang status-nya GAGAL.
-- ============================================================
