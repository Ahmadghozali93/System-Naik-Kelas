-- Tambah kolom tanggal_lahir ke tabel siswa dan gurus
ALTER TABLE siswa ADD COLUMN IF NOT EXISTS tanggal_lahir DATE;
ALTER TABLE gurus ADD COLUMN IF NOT EXISTS tanggal_lahir DATE;
