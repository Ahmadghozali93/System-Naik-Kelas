-- 1. Pastikan nama unit bersifat UNIK agar bisa dijadikan Foreign Key
ALTER TABLE public.units ADD CONSTRAINT units_nama_key UNIQUE (nama);

-- 2. Tambahkan Foreign Key pada tabel siswa ke units(nama)
ALTER TABLE public.siswa 
ADD CONSTRAINT siswa_unit_fkey 
FOREIGN KEY (unit) REFERENCES public.units(nama) ON DELETE RESTRICT;

-- 3. Tambahkan Foreign Key pada tabel jadwal_master ke units(nama)
ALTER TABLE public.jadwal_master 
ADD CONSTRAINT jadwal_master_unit_fkey 
FOREIGN KEY (unit) REFERENCES public.units(nama) ON DELETE RESTRICT;

-- 4. Ubah Foreign Key tabel aktivasi_siswa (dari CASCADE menjadi RESTRICT)
-- Harus disesuaikan constraint lamanya, default biasanya nama constraint 'aktivasi_siswa_siswa_id_fkey'
ALTER TABLE public.aktivasi_siswa DROP CONSTRAINT IF EXISTS aktivasi_siswa_siswa_id_fkey;
ALTER TABLE public.aktivasi_siswa 
ADD CONSTRAINT aktivasi_siswa_siswa_id_fkey 
FOREIGN KEY (siswa_id) REFERENCES public.siswa(id) ON DELETE RESTRICT;

-- 5. Ubah Foreign Key tabel jadwal_master (dari SET NULL menjadi RESTRICT)
ALTER TABLE public.jadwal_master DROP CONSTRAINT IF EXISTS jadwal_master_program_id_fkey;
ALTER TABLE public.jadwal_master 
ADD CONSTRAINT jadwal_master_program_id_fkey 
FOREIGN KEY (program_id) REFERENCES public.programs(id) ON DELETE RESTRICT;

ALTER TABLE public.jadwal_master DROP CONSTRAINT IF EXISTS jadwal_master_guru_id_fkey;
ALTER TABLE public.jadwal_master 
ADD CONSTRAINT jadwal_master_guru_id_fkey 
FOREIGN KEY (guru_id) REFERENCES public.gurus(id) ON DELETE RESTRICT;
