-- Add reschedule column to jadwal_master
ALTER TABLE jadwal_master ADD COLUMN IF NOT EXISTS reschedule BOOLEAN DEFAULT false;
