-- Perbaiki casing nama siswa di semua tabel
-- Jalankan di Supabase SQL Editor

-- 1. Master data siswa
UPDATE siswa
SET nama = INITCAP(nama)
WHERE nama IS NOT NULL AND nama != INITCAP(nama);

-- 2. Aktivasi siswa (denormalized copy)
UPDATE aktivasi_siswa
SET nama_siswa = INITCAP(nama_siswa)
WHERE nama_siswa IS NOT NULL AND nama_siswa != INITCAP(nama_siswa);

-- 3. Pembayaran SPP
UPDATE pembayaran_spp
SET nama_siswa = INITCAP(nama_siswa)
WHERE nama_siswa IS NOT NULL AND nama_siswa != INITCAP(nama_siswa);

-- 4. Rekonsiliasi SPP (jika ada kolom nama_siswa)
UPDATE rekonsiliasi_spp
SET nama_siswa = INITCAP(nama_siswa)
WHERE nama_siswa IS NOT NULL AND nama_siswa != INITCAP(nama_siswa);
