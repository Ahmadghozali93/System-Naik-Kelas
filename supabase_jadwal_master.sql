-- Create Jadwal Master Table
CREATE TABLE IF NOT EXISTS public.jadwal_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jadwal_id TEXT UNIQUE NOT NULL,
  guru_id TEXT REFERENCES public.gurus(id) ON DELETE SET NULL,
  nama_guru TEXT NOT NULL,
  program_id TEXT REFERENCES public.programs(id) ON DELETE SET NULL,
  nama_program TEXT NOT NULL,
  jenis_program TEXT NOT NULL,
  hari TEXT NOT NULL,
  jam TEXT NOT NULL,
  unit TEXT NOT NULL,
  kuota INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.jadwal_master ENABLE ROW LEVEL SECURITY;

-- Create policy for development (allow all)
CREATE POLICY "Enable ALL mapping for ALL users (DEVELOPMENT ONLY)" 
ON public.jadwal_master FOR ALL USING (true) WITH CHECK (true);
