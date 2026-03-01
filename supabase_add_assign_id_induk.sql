-- Add assign_id_induk column to aktivasi_siswa
ALTER TABLE aktivasi_siswa ADD COLUMN IF NOT EXISTS assign_id_induk TEXT;
