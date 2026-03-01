-- Tabel Roles untuk Manajemen Hak Akses Menu Dinamis
CREATE TABLE IF NOT EXISTS roles (
  role_name TEXT PRIMARY KEY,
  allowed_menus TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Setup Row Level Security (RLS) untuk tabel roles
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

-- Policy DEVELOPMENT (Nantinya harus dilimitasi hanya untuk Admin di Produksi)
CREATE POLICY "Enable ALL mapping for ALL users (DEVELOPMENT ONLY)" ON roles FOR ALL USING (true) WITH CHECK (true);

-- Insert Data Role Default
-- Admin mendapat akses ke semua menu secara default
-- Guru hanya mendapat akses ke menu tertentu secara default (misal: /kanban, /siswa, /program)
INSERT INTO roles (role_name, allowed_menus) VALUES 
('Admin', ARRAY['/kanban', '/jadwal-master', '/siswa', '/program', '/unit', '/user', '/role-setup']),
('Guru', ARRAY['/kanban', '/siswa', '/program'])
ON CONFLICT (role_name) DO UPDATE 
SET allowed_menus = EXCLUDED.allowed_menus;
