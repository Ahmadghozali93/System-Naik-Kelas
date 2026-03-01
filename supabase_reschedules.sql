-- Create reschedules table
CREATE TABLE IF NOT EXISTS reschedules (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    aktivasi_id UUID REFERENCES aktivasi_siswa(id) ON DELETE CASCADE,
    nama_siswa TEXT NOT NULL,
    jadwal_asal_id UUID REFERENCES jadwal_master(id),
    jadwal_tujuan_id UUID REFERENCES jadwal_master(id),
    tanggal_asal DATE NOT NULL,
    tanggal_tujuan DATE NOT NULL,
    jam_tujuan TEXT,
    status TEXT DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Done', 'Cancelled')),
    catatan TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE reschedules ENABLE ROW LEVEL SECURITY;

-- Allow all for authenticated users
CREATE POLICY "Allow full access to reschedules" ON reschedules
    FOR ALL USING (true) WITH CHECK (true);
