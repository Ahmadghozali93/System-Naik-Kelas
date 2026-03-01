-- Add booking fields to siswa table
ALTER TABLE siswa ADD COLUMN IF NOT EXISTS booking_program TEXT DEFAULT '';
ALTER TABLE siswa ADD COLUMN IF NOT EXISTS booking_jam TEXT DEFAULT '';
