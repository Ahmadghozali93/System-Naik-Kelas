-- Tambah kolom aktivasi_id ke pembayaran_spp
-- Jalankan di Supabase SQL Editor

ALTER TABLE pembayaran_spp
  ADD COLUMN IF NOT EXISTS aktivasi_id TEXT REFERENCES aktivasi_siswa(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pembayaran_spp_aktivasi_id
  ON pembayaran_spp(aktivasi_id);
