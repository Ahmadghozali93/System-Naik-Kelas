-- Data dummy untuk pengembangan LOKAL saja (jangan dipakai di produksi)
-- Urutan menghormati foreign key (units/programs sebelum siswa).

INSERT INTO units (id, nama, maps, aktif, dibuat_pada) VALUES
('UNIT-001', 'Cabang Utama Sudirman', 'https://maps.google.com/?q=Sudirman', true, '2024-01-15'),
('UNIT-002', 'Cabang Bekasi Indah', 'https://maps.google.com/?q=Bekasi', false, '2024-03-22');

INSERT INTO programs (id, nama, deskripsi, status, jenis, dibuat_pada) VALUES
('PROG-1A2B31', 'Reguler SD', 'Mata pelajaran sesuai standar nasional dilengkapi try out bulanan.', 'Aktif', 'Rutin', '2024-05-01'),
('PROG-1A2B32', 'Intensif SNBT', 'Fokus pada penalaran matematika, literasi bahasa.', 'Aktif', 'Rutin', '2024-05-10');

-- Data dummy untuk pengembangan LOKAL saja (jangan dipakai di produksi)

-- 7. (Opsional) Insert Data Dummy Pertama 
INSERT INTO gurus (id, email, nama, role, nowa, status, alamat, maps) VALUES
('GURU-1A2B31', 'budi@bimbel.com', 'Budi Santoso', 'Guru', '08123456781', 'Aktif', 'Jl. Merdeka No.1', 'https://maps.google.com/'),
('GURU-1A2B32', 'admin@bimbel.com', 'Admin Pusat', 'Admin', '08123456782', 'Aktif', 'Jl. Sudirman No.2', 'https://maps.google.com/');

-- Insert Data Role Default
-- Admin mendapat akses ke semua menu secara default
-- Guru hanya mendapat akses ke menu tertentu secara default (misal: /kanban, /siswa, /program)
INSERT INTO roles (role_name, allowed_menus) VALUES 
('Admin', ARRAY['/kanban', '/jadwal-master', '/siswa', '/program', '/unit', '/user', '/role-setup']),
('Guru', ARRAY['/kanban', '/siswa', '/program'])
ON CONFLICT (role_name) DO UPDATE 
SET allowed_menus = EXCLUDED.allowed_menus;

-- Insert sample data
INSERT INTO public.master_jam (waktu) VALUES
('10.00 - 11.30'),
('11.30 - 13.00'),
('13.00 - 14.30'),
('15.00 - 16.30'),
('16.30 - 18.00')
ON CONFLICT (waktu) DO NOTHING;

INSERT INTO siswa (id, nama, unit, status, nowa, alamat, nama_ortu, ig, fb, tiktok, catatan, dibuat_pada) VALUES
('SISWA-1A2B31', 'Andi Wijaya', 'Cabang Utama Sudirman', 'Aktif', '081234567891', 'Jl. Melati No. 45', 'Bpk. Budi Wijaya', 'andi.wjy', 'Andi Wijaya', '@andiwjya', 'Nilai matematika perlu ditingkatkan.', '2024-05-12'),
('SISWA-1A2B32', 'Cici Paramita', 'Cabang Bekasi Indah', 'Aktif', '081234567892', 'Jl. Anggrek No. 12', 'Ibu Dina Paramita', 'ciciprmta', '-', '@cici.p', 'Siswa berprestasi', '2024-05-15');
