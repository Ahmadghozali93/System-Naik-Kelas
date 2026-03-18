-- Skema Tabel Jurnal Mengajar

CREATE TABLE IF NOT EXISTS jurnal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  guru_id TEXT REFERENCES gurus(id),
  siswa_id TEXT REFERENCES siswa(id),
  program TEXT,
  unit TEXT,
  level TEXT,
  materi TEXT,
  halaman TEXT,
  hasil TEXT,
  keterangan TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE jurnal_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable ALL mapping for ALL users (DEVELOPMENT ONLY)" ON jurnal_entries;
CREATE POLICY "Enable ALL mapping for ALL users (DEVELOPMENT ONLY)" ON jurnal_entries FOR ALL USING (true) WITH CHECK (true);

-- JALANKAN 2 BARIS INI JIKA TABEL SUDAH TERLANJUR DIBUAT SEBELUMNYA:
ALTER TABLE jurnal_entries ADD COLUMN IF NOT EXISTS program TEXT;
ALTER TABLE jurnal_entries ADD COLUMN IF NOT EXISTS unit TEXT;
