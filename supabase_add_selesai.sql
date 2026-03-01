-- Tambah kolom selesai di tabel aktivasi_siswa
ALTER TABLE aktivasi_siswa ADD COLUMN IF NOT EXISTS selesai BOOLEAN DEFAULT false;
