-- Update roles di Supabase
-- Jalankan di SQL Editor Supabase

-- Hapus role lama (Admin & Guru)
DELETE FROM public.roles WHERE role_name IN ('Admin', 'Guru');

-- Tambah 5 role baru
INSERT INTO public.roles (role_name, allowed_menus) VALUES
  ('Owner',               ARRAY[
    '/siswa','/program','/unit','/user',
    '/jadwal-master','/kanban','/booking','/jadwal-kosong','/reschedule',
    '/aktivasi-rutin','/aktivasi-harian',
    '/spp/tagihan','/spp/rekonsiliasi','/spp/faktur-odoo','/spp/laporan',
    '/jurnal',
    '/absensi/check','/absensi/dashboard','/absensi/shift','/absensi/jadwal-shift',
    '/absensi/izin','/absensi/lembur','/absensi/koreksi','/absensi/rekap','/absensi/hari-libur',
    '/role-setup','/pengaturan'
  ]),
  ('Administrator',       ARRAY[]::text[]),
  ('Supervisor',          ARRAY[]::text[]),
  ('Learning Koordinator',ARRAY[]::text[]),
  ('Tutor',               ARRAY[]::text[])
ON CONFLICT (role_name) DO NOTHING;

-- Update user yang ada: Admin → Owner, Guru → Tutor
UPDATE public.gurus SET role = 'Owner' WHERE role = 'Admin';
UPDATE public.gurus SET role = 'Tutor'  WHERE role = 'Guru';
