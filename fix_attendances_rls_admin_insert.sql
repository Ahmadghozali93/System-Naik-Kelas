-- ============================================================
-- Fix: Izinkan admin insert ke tabel attendances
-- (saat approve koreksi absen untuk guru lain)
-- Jalankan di Supabase SQL Editor
-- ============================================================

-- Tambah policy insert untuk admin
-- Policy permissive di-OR → sudah cukup tambah saja, policy lama tetap ada
DROP POLICY IF EXISTS "att_insert_admin" ON attendances;

CREATE POLICY "att_insert_admin" ON attendances FOR INSERT
  WITH CHECK (
    absensi_is_admin()
    AND unit_id = ANY(absensi_unit_ids())
  );
