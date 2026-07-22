-- ============================================================
-- 0007b — UJI SKENARIO MESIN PAYROLL
--
-- Script ini MEMBUAT data contoh, menjalankan perhitungan, menampilkan
-- hasilnya, lalu MEMBATALKAN semuanya (ROLLBACK).
-- Tidak ada satu pun data yang tersimpan di database Anda.
--
-- Cara pakai: salin SELURUH isi file ini ke Supabase SQL Editor, klik Run.
-- Perhatikan tab "Results" (angka) dan panel "Messages" (catatan/peringatan).
--
-- Skenario yang diuji:
--   1. Gaji pokok (nominal tetap)
--   2. Fee tatap muka: normal, DUPLIKAT, program tanpa tarif, lewat batas harian
--   3. Bonus kehadiran: guru alpa 1x  → hangus
--   4. Bonus kehadiran: guru telat 3x → hangus karena lewat batas telat
--   5. Bonus KPI: skor kosong         → 0 + peringatan
--   6. Karyawan masuk tengah bulan    → komponen belum berlaku, tidak dihitung
--   7. Opsi "wajib_terverifikasi"     → perhitungan DITOLAK dengan pesan jelas
-- ============================================================

BEGIN;

-- ── Data contoh ──
INSERT INTO units (id, nama, aktif) VALUES ('UNIT-UJI', 'Unit Uji Payroll', true)
  ON CONFLICT (id) DO NOTHING;

INSERT INTO programs (id, nama, jenis, status)
VALUES ('PROG-UJI-A', 'Program Uji A', 'Rutin', 'Aktif'),
       ('PROG-UJI-B', 'Program Uji B', 'Rutin', 'Aktif')
  ON CONFLICT (id) DO NOTHING;

INSERT INTO gurus (id, email, nama, role, status)
VALUES ('GURU-UJI1', 'uji1@contoh.test', 'Guru Uji Satu', 'Tutor', 'Aktif'),
       ('GURU-UJI2', 'uji2@contoh.test', 'Guru Uji Dua', 'Tutor', 'Aktif')
  ON CONFLICT (id) DO NOTHING;

INSERT INTO guru_units (guru_id, unit_id)
VALUES ('GURU-UJI1', 'UNIT-UJI'), ('GURU-UJI2', 'UNIT-UJI')
  ON CONFLICT DO NOTHING;

INSERT INTO siswa (id, nama, unit, status)
VALUES ('SIS-UJI1', 'Siswa Uji 1', 'Unit Uji Payroll', 'Aktif'),
       ('SIS-UJI2', 'Siswa Uji 2', 'Unit Uji Payroll', 'Aktif'),
       ('SIS-UJI3', 'Siswa Uji 3', 'Unit Uji Payroll', 'Aktif')
  ON CONFLICT (id) DO NOTHING;

-- ── Komponen gaji (angka HANYA untuk uji, tidak tersimpan) ──
INSERT INTO komponen_gaji (id, unit_id, kode, nama, kategori, tipe_perhitungan, konfigurasi, urutan_tampil, aktif) VALUES
 ('11111111-1111-1111-1111-111111111111','UNIT-UJI','UJI_POKOK','Uji Gaji Pokok','pendapatan','nominal_tetap',
  '{"nominal": 1500000}'::jsonb, 10, true),

 ('22222222-2222-2222-2222-222222222222','UNIT-UJI','UJI_FEE','Uji Fee Tatap Muka','pendapatan','per_unit',
  jsonb_build_object('sumber_unit','jurnal_mengajar','wajib_terverifikasi',false,
    'batas_jurnal_per_hari',2,
    'matriks_tarif', jsonb_build_array(jsonb_build_object('program_id','PROG-UJI-A','tarif',25000))), 20, true),

 ('33333333-3333-3333-3333-333333333333','UNIT-UJI','UJI_HADIR','Uji Bonus Kehadiran','pendapatan','bersyarat',
  '{"status_absensi_menghanguskan":["Alpha"],"batas_telat":2,"cara_hangus":"total","nominal":300000}'::jsonb, 30, true),

 ('44444444-4444-4444-4444-444444444444','UNIT-UJI','UJI_KPI','Uji Bonus KPI','pendapatan','bertingkat',
  '{"jika_data_kosong":"nol_dengan_peringatan","tangga":[{"min":90,"nominal":500000},{"min":80,"nominal":300000}]}'::jsonb, 40, true);

-- GURU-UJI1: semua komponen berlaku sejak lama
INSERT INTO karyawan_komponen (guru_id, komponen_gaji_id, berlaku_mulai) VALUES
 ('GURU-UJI1','11111111-1111-1111-1111-111111111111','2020-01-01'),
 ('GURU-UJI1','22222222-2222-2222-2222-222222222222','2020-01-01'),
 ('GURU-UJI1','33333333-3333-3333-3333-333333333333','2020-01-01'),
 ('GURU-UJI1','44444444-4444-4444-4444-444444444444','2020-01-01');

-- GURU-UJI2: SKENARIO 6 — masuk tengah bulan (20 Juni), gaji pokok saja
INSERT INTO karyawan_komponen (guru_id, komponen_gaji_id, berlaku_mulai) VALUES
 ('GURU-UJI2','11111111-1111-1111-1111-111111111111','2026-06-20');

-- ── Periode uji: Juni 2026 ──
INSERT INTO periode_payroll (id, unit_id, tahun, bulan, status)
VALUES ('99999999-9999-9999-9999-999999999999','UNIT-UJI',2026,6,'draft');

-- ── Jurnal GURU-UJI1 (Juni 2026) ──
-- 1 Juni : 2 jurnal sah (siswa 1 & 2)                  → DIBAYAR
--          + 1 jurnal DUPLIKAT (siswa 1 diulang)       → tidak dibayar
-- 2 Juni : 3 jurnal BERBEDA (siswa 1, 2, 3)            → batas 2/hari,
--          yang ke-3 tidak dibayar & slip perlu ditinjau
-- 3 Juni : 1 jurnal Program B (tak ada di matriks)     → tidak dibayar
--
-- CATATAN: agar batas harian benar-benar teruji, jurnal ke-3 pada 2 Juni
-- harus SISWA BERBEDA. Kalau siswanya sama, dia terhitung duplikat lebih
-- dulu dan skenario batas harian tidak pernah tercapai.
INSERT INTO jurnal_entries (guru_id, siswa_id, program, unit, timestamp) VALUES
 ('GURU-UJI1','SIS-UJI1','Program Uji A','Unit Uji Payroll','2026-06-01T03:00:00Z'),
 ('GURU-UJI1','SIS-UJI2','Program Uji A','Unit Uji Payroll','2026-06-01T04:00:00Z'),
 ('GURU-UJI1','SIS-UJI1','Program Uji A','Unit Uji Payroll','2026-06-01T05:00:00Z'), -- duplikat
 ('GURU-UJI1','SIS-UJI1','Program Uji A','Unit Uji Payroll','2026-06-02T03:00:00Z'),
 ('GURU-UJI1','SIS-UJI2','Program Uji A','Unit Uji Payroll','2026-06-02T04:00:00Z'),
 ('GURU-UJI1','SIS-UJI3','Program Uji A','Unit Uji Payroll','2026-06-02T06:00:00Z'), -- ke-3, lewat batas
 ('GURU-UJI1','SIS-UJI1','Program Uji B','Unit Uji Payroll','2026-06-03T03:00:00Z'); -- tanpa tarif

-- ── Absensi GURU-UJI1: SKENARIO 3 (alpa 1x) + telat 3x ──
INSERT INTO attendances (guru_id, unit_id, tanggal, status) VALUES
 ('GURU-UJI1','UNIT-UJI','2026-06-01','Hadir'),
 ('GURU-UJI1','UNIT-UJI','2026-06-02','Telat'),
 ('GURU-UJI1','UNIT-UJI','2026-06-03','Telat'),
 ('GURU-UJI1','UNIT-UJI','2026-06-04','Telat'),
 ('GURU-UJI1','UNIT-UJI','2026-06-05','Alpha');   -- menghanguskan bonus

-- Skor KPI sengaja TIDAK diisi → SKENARIO 5

-- ============================================================
-- JALANKAN PERHITUNGAN
-- ============================================================
SELECT * FROM hitung_periode('99999999-9999-9999-9999-999999999999');

-- ── HASIL 1: ringkasan slip ──
SELECT s.guru_id, g.nama,
       s.total_pendapatan, s.total_potongan, s.gaji_bersih, s.butuh_ditinjau
FROM slip_gaji s JOIN gurus g ON g.id = s.guru_id
WHERE s.periode_payroll_id = '99999999-9999-9999-9999-999999999999'
ORDER BY s.guru_id;
-- HARAPAN:
--   GURU-UJI1 : pokok 1.500.000 + fee (4 x 25.000 = 100.000) + hadir 0 + kpi 0
--               = 1.600.000, butuh_ditinjau = true
--   GURU-UJI2 : 1.500.000 (gaji pokok saja, komponen lain belum dipasang)

-- ── HASIL 2: rincian per komponen ──
SELECT g.nama, d.nama_komponen, d.jumlah_unit, d.nominal,
       d.keterangan_hitung, d.data_mentah
FROM slip_gaji_detail d
JOIN slip_gaji s ON s.id = d.slip_gaji_id
JOIN gurus g ON g.id = s.guru_id
WHERE s.periode_payroll_id = '99999999-9999-9999-9999-999999999999'
ORDER BY g.nama, d.urutan_tampil;
-- HARAPAN GURU-UJI1:
--   Uji Fee Tatap Muka   → jumlah_unit = 4, nominal = 100.000
--   Uji Bonus Kehadiran  → 0, keterangan "Hangus (pelanggaran: 1, telat: 3)"
--   Uji Bonus KPI        → 0, keterangan "Skor KPI 0"

-- ── HASIL 3: peringatan yang tercatat ──
SELECT g.nama, jsonb_pretty(s.peringatan) AS peringatan
FROM slip_gaji s JOIN gurus g ON g.id = s.guru_id
WHERE s.periode_payroll_id = '99999999-9999-9999-9999-999999999999';
-- HARAPAN GURU-UJI1: 3 peringatan (jurnal tanpa tarif, lewat batas harian,
--                    duplikat) + 1 peringatan skor KPI kosong

-- ── HASIL 4: rincian jurnal — mana dibayar, mana tidak & alasannya ──
SELECT tanggal, program, siswa_id, dibayar, tarif, alasan
FROM rincian_jurnal_fee('GURU-UJI1','2026-06-01','2026-06-30',
  (SELECT konfigurasi FROM komponen_gaji WHERE kode='UJI_FEE'));
-- Sengaja TANPA ORDER BY tambahan: fungsi sudah mengurutkan menurut waktu
-- mengajar. Kalau diurutkan ulang di sini, ketidakberesan urutan (mis. yang
-- lebih awal justru ditolak) jadi tidak kelihatan.
-- HARAPAN: 7 baris, URUT menurut waktu mengajar, 4 DIBAYAR & 3 TIDAK:
--   06-01 SIS-UJI1 (03:00)  DIBAYAR
--   06-01 SIS-UJI2 (04:00)  DIBAYAR
--   06-01 SIS-UJI1 (05:00)  TIDAK — "Duplikat, tidak dibayar"
--   06-02 SIS-UJI1 (03:00)  DIBAYAR
--   06-02 SIS-UJI2 (04:00)  DIBAYAR
--   06-02 SIS-UJI3 (06:00)  TIDAK — "Melebihi batas 2 jurnal/hari"
--   06-03 SIS-UJI1 (03:00)  TIDAK — "Tarif tidak ditemukan ... Program Uji B"
--
-- PERIKSA URUTANNYA, bukan cuma jumlahnya:
--   • Pada 06-01, yang ditandai duplikat harus yang PALING AKHIR (05:00),
--     bukan yang 03:00.
--   • Pada 06-02, yang ditolak karena batas harian harus SIS-UJI3 (06:00),
--     yaitu yang datang PALING AKHIR — bukan SIS-UJI2.
-- Kalau yang ditolak justru yang lebih awal, berarti urutan tidak stabil
-- dan hasil perhitungan bisa berubah-ubah tiap kali dihitung ulang.

-- ── SKENARIO 7: opsi "wajib_terverifikasi" harus DITOLAK ──
DO $$
BEGIN
  UPDATE komponen_gaji
     SET konfigurasi = konfigurasi || '{"wajib_terverifikasi": true}'::jsonb
   WHERE kode = 'UJI_FEE';

  PERFORM hitung_slip_gaji('99999999-9999-9999-9999-999999999999','GURU-UJI1');
  RAISE WARNING 'MASALAH: seharusnya ditolak, tapi perhitungan malah jalan!';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'BENAR — perhitungan ditolak: %', SQLERRM;
END $$;

-- ── SKENARIO 8: periode terkunci harus menolak perhitungan ulang ──
DO $$
BEGIN
  UPDATE periode_payroll SET status = 'terkunci'
   WHERE id = '99999999-9999-9999-9999-999999999999';

  PERFORM hitung_slip_gaji('99999999-9999-9999-9999-999999999999','GURU-UJI2');
  RAISE WARNING 'MASALAH: periode terkunci masih bisa dihitung ulang!';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'BENAR — periode terkunci menolak: %', SQLERRM;
END $$;

ROLLBACK;   -- semua data contoh dibuang, database kembali seperti semula

-- ============================================================
-- CARA MEMBACA:
--   • Tab "Results"  → angka slip & rinciannya (HASIL 1–4)
--   • Panel "Messages" → harus ada 2 baris "BENAR — ..." (skenario 7 & 8).
--     Kalau muncul "MASALAH: ...", berarti ada pengaman yang tidak bekerja.
-- ============================================================
