-- ============================================================
-- SCHEMA MODUL SPP
-- Jalankan di SQL Editor Supabase (project baru)
-- ============================================================

-- Tabel Tahun Ajaran
CREATE TABLE IF NOT EXISTS tahun_ajaran (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  aktif BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabel Kelas
CREATE TABLE IF NOT EXISTS kelas_spp (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabel Komponen Biaya
CREATE TABLE IF NOT EXISTS komponen_biaya (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  nominal NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabel Tagihan SPP
CREATE TABLE IF NOT EXISTS tagihan_spp (
  id TEXT PRIMARY KEY,
  siswa_id TEXT NOT NULL,
  nama_siswa TEXT NOT NULL,
  komponen_id TEXT NOT NULL,
  nama_komponen TEXT NOT NULL,
  tahun_ajaran_id TEXT NOT NULL,
  nama_tahun_ajaran TEXT NOT NULL,
  periode TEXT NOT NULL,
  total NUMERIC NOT NULL DEFAULT 0,
  terbayar NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Belum Bayar',
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabel Pembayaran SPP
CREATE TABLE IF NOT EXISTS pembayaran_spp (
  id TEXT PRIMARY KEY,
  tagihan_id TEXT NOT NULL,
  nominal NUMERIC NOT NULL,
  metode TEXT NOT NULL DEFAULT 'Tunai',
  keterangan TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS
ALTER TABLE tahun_ajaran ENABLE ROW LEVEL SECURITY;
ALTER TABLE kelas_spp ENABLE ROW LEVEL SECURITY;
ALTER TABLE komponen_biaya ENABLE ROW LEVEL SECURITY;
ALTER TABLE tagihan_spp ENABLE ROW LEVEL SECURITY;
ALTER TABLE pembayaran_spp ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all (dev)" ON tahun_ajaran FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all (dev)" ON kelas_spp FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all (dev)" ON komponen_biaya FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all (dev)" ON tagihan_spp FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all (dev)" ON pembayaran_spp FOR ALL USING (true) WITH CHECK (true);
