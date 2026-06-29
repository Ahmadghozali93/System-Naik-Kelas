-- Tambah kolom kesesuaian seragam dan catatan ke tabel attendances
ALTER TABLE public.attendances
  ADD COLUMN IF NOT EXISTS seragam  TEXT  CHECK (seragam IN ('Sesuai','Tidak Sesuai')) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS catatan  TEXT  DEFAULT NULL;
