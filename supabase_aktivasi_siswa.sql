-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create aktivasi_siswa table
CREATE TABLE IF NOT EXISTS public.aktivasi_siswa (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assign_id VARCHAR(50) NOT NULL UNIQUE,
    siswa_id TEXT NOT NULL REFERENCES public.siswa(id) ON DELETE CASCADE,
    nama_siswa VARCHAR(255) NOT NULL,
    jadwal_id UUID NOT NULL REFERENCES public.jadwal_master(id) ON DELETE RESTRICT,
    detail_jadwal JSONB NOT NULL DEFAULT '{}'::jsonb, -- Stores snapshot of Guru, Program, Hari, Jam, Unit
    tgl_mulai DATE NOT NULL,
    spp NUMERIC(15,2) DEFAULT 0,
    catatan TEXT,
    status VARCHAR(50) DEFAULT 'Aktif',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Basic RLS for development
ALTER TABLE public.aktivasi_siswa ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON public.aktivasi_siswa FOR SELECT USING (true);
CREATE POLICY "Enable insert for all users" ON public.aktivasi_siswa FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for all users" ON public.aktivasi_siswa FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Enable delete for all users" ON public.aktivasi_siswa FOR DELETE USING (true);

-- Adding trigger for updated_at if it's not universally handled
CREATE OR REPLACE FUNCTION update_modified_column() 
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW; 
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_aktivasi_siswa_modtime ON public.aktivasi_siswa;
CREATE TRIGGER update_aktivasi_siswa_modtime 
BEFORE UPDATE ON public.aktivasi_siswa 
FOR EACH ROW EXECUTE PROCEDURE update_modified_column();
