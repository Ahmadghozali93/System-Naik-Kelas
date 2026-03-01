-- 1. Hapus tabel jika sudah ada (opsional, untuk memastikan bersih saat init ulang/testing)
-- DROP TABLE IF EXISTS gurus CASCADE;
-- DROP TABLE IF EXISTS siswa CASCADE;
-- DROP TABLE IF EXISTS units CASCADE;
-- DROP TABLE IF EXISTS programs CASCADE;

-- 2. Buat Tabel "gurus" (UserPage.jsx)
CREATE TABLE gurus (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  password TEXT, -- Harus dienkripsi di produksi jika dipakai auth manual
  nama TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Guru',
  nowa TEXT,
  status TEXT DEFAULT 'Aktif',
  alamat TEXT,
  maps TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Buat Tabel "siswa" (SiswaPage.jsx)
CREATE TABLE siswa (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  unit TEXT,
  status TEXT DEFAULT 'Aktif',
  nowa TEXT,
  alamat TEXT,
  nama_ortu TEXT,
  ig TEXT,
  fb TEXT,
  tiktok TEXT,
  catatan TEXT,
  dibuat_pada DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Buat Tabel "units" (UnitPage.jsx)
CREATE TABLE units (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  maps TEXT,
  aktif BOOLEAN DEFAULT true,
  dibuat_pada DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Buat Tabel "programs" (ProgramPage.jsx)
CREATE TABLE programs (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  deskripsi TEXT,
  harga TEXT,
  durasi TEXT,
  status TEXT DEFAULT 'Aktif',
  dibuat_pada DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Setup Row Level Security (RLS)
-- Mengaktifkan RLS pada seluruh tabel
ALTER TABLE gurus ENABLE ROW LEVEL SECURITY;
ALTER TABLE siswa ENABLE ROW LEVEL SECURITY;
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;

-- Untuk masa DEVELOPMENT saja (Sangat Tidak Aman untuk Produksi!)
-- Kita buat policy yang mengizinkan semua operasi (Select, Insert, Update, Delete)
-- secara publik (anon) agar aplikasi React saat ini bisa langsung interaksi ke Supabase.
-- Nantinya, wajib diganti dengan Auth Session Policy!
CREATE POLICY "Enable ALL mapping for ALL users (DEVELOPMENT ONLY)" ON gurus FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable ALL mapping for ALL users (DEVELOPMENT ONLY)" ON siswa FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable ALL mapping for ALL users (DEVELOPMENT ONLY)" ON units FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable ALL mapping for ALL users (DEVELOPMENT ONLY)" ON programs FOR ALL USING (true) WITH CHECK (true);

-- 7. (Opsional) Insert Data Dummy Pertama 
INSERT INTO gurus (id, email, password, nama, role, nowa, status, alamat, maps) VALUES
('GURU-1A2B31', 'budi@bimbel.com', 'password123', 'Budi Santoso', 'Guru', '08123456781', 'Aktif', 'Jl. Merdeka No.1', 'https://maps.google.com/'),
('GURU-1A2B32', 'admin@bimbel.com', 'adminpassword', 'Admin Pusat', 'Admin', '08123456782', 'Aktif', 'Jl. Sudirman No.2', 'https://maps.google.com/');

INSERT INTO siswa (id, nama, unit, status, nowa, alamat, nama_ortu, ig, fb, tiktok, catatan, dibuat_pada) VALUES
('SISWA-1A2B31', 'Andi Wijaya', 'Cabang Utama Sudirman', 'Aktif', '081234567891', 'Jl. Melati No. 45', 'Bpk. Budi Wijaya', 'andi.wjy', 'Andi Wijaya', '@andiwjya', 'Nilai matematika perlu ditingkatkan.', '2024-05-12'),
('SISWA-1A2B32', 'Cici Paramita', 'Cabang Bekasi Indah', 'Aktif', '081234567892', 'Jl. Anggrek No. 12', 'Ibu Dina Paramita', 'ciciprmta', '-', '@cici.p', 'Siswa berprestasi', '2024-05-15');

INSERT INTO units (id, nama, maps, aktif, dibuat_pada) VALUES
('UNIT-001', 'Cabang Utama Sudirman', 'https://maps.google.com/?q=Sudirman', true, '2024-01-15'),
('UNIT-002', 'Cabang Bekasi Indah', 'https://maps.google.com/?q=Bekasi', false, '2024-03-22');

INSERT INTO programs (id, nama, deskripsi, harga, durasi, status, dibuat_pada) VALUES
('PROG-1A2B31', 'Reguler SD', 'Mata pelajaran sesuai standar nasional dilengkapi try out bulanan.', 'Rp 350.000', '6 Bulan', 'Aktif', '2024-05-01'),
('PROG-1A2B32', 'Intensif SNBT', 'Fokus pada penalaran matematika, literasi bahasa.', 'Rp 850.000', '3 Bulan', 'Aktif', '2024-05-10');
