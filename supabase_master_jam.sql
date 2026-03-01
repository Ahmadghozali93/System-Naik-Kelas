-- Create Master Jam Table
CREATE TABLE IF NOT EXISTS public.master_jam (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  waktu TEXT UNIQUE NOT NULL, -- Contoh "10.00 - 11.00"
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.master_jam ENABLE ROW LEVEL SECURITY;

-- Create policy for development (allow all)
CREATE POLICY "Enable ALL mapping for ALL users (DEVELOPMENT ONLY)" 
ON public.master_jam FOR ALL USING (true) WITH CHECK (true);

-- Insert sample data
INSERT INTO public.master_jam (waktu) VALUES
('10.00 - 11.30'),
('11.30 - 13.00'),
('13.00 - 14.30'),
('15.00 - 16.30'),
('16.30 - 18.00')
ON CONFLICT (waktu) DO NOTHING;
