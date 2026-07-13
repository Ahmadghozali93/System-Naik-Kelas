-- ============================================================
-- FIX: Koreksi Absen di-Approve tapi absen tidak berubah
-- Jalankan di Supabase SQL Editor. Aman diulang.
--
-- AKAR MASALAH:
-- Policy lama attendances mensyaratkan unit absen ada di guru_units
-- pengguna (absensi_unit_ids()). Kalau Owner/admin tidak terdaftar di
-- guru_units unit tsb, UPDATE ditolak DIAM-DIAM (0 baris, tanpa error),
-- sehingga koreksi tercatat "Approved" tapi absen tidak berubah.
--
-- Sementara policy approve koreksi (ac_update_admin) TIDAK punya cek unit,
-- jadi admin bisa approve tapi gagal menerapkannya. Ini sumber ketidakcocokan.
--
-- SOLUSI: beri Owner akses penuh, dan izinkan admin/SPV membuat + mengubah
-- absen di unit yang mereka kelola.
-- (File ini menggantikan fix_attendances_rls_admin_insert.sql)
-- ============================================================

-- Helper: apakah pengguna saat ini Owner (lintas cabang)
CREATE OR REPLACE FUNCTION absensi_is_owner()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT role = 'Owner' FROM gurus WHERE auth_user_id = auth.uid() LIMIT 1),
    false
  );
$$;

-- Bersihkan policy lama
DROP POLICY IF EXISTS "att_select"       ON attendances;
DROP POLICY IF EXISTS "att_insert_self"  ON attendances;
DROP POLICY IF EXISTS "att_insert_admin" ON attendances;
DROP POLICY IF EXISTS "att_update"       ON attendances;

-- LIHAT: Owner semua; guru lihat miliknya; admin lihat unit yang dikelola
CREATE POLICY "att_select" ON attendances FOR SELECT USING (
  absensi_is_owner()
  OR guru_id = absensi_guru_id()
  OR (absensi_is_admin() AND unit_id = ANY(absensi_unit_ids()))
);

-- BUAT (guru absen sendiri)
CREATE POLICY "att_insert_self" ON attendances FOR INSERT
  WITH CHECK (guru_id = absensi_guru_id());

-- BUAT (admin/Owner, mis. saat approve koreksi untuk guru lain)
CREATE POLICY "att_insert_admin" ON attendances FOR INSERT
  WITH CHECK (
    absensi_is_owner()
    OR (absensi_is_admin() AND unit_id = ANY(absensi_unit_ids()))
  );

-- UBAH: Owner semua; guru ubah miliknya; admin ubah unit yang dikelola
CREATE POLICY "att_update" ON attendances FOR UPDATE USING (
  absensi_is_owner()
  OR guru_id = absensi_guru_id()
  OR (absensi_is_admin() AND unit_id = ANY(absensi_unit_ids()))
);

-- ============================================================
-- Catatan:
-- Kalau admin/SPV (bukan Owner) masih gagal approve koreksi untuk unit
-- tertentu, berarti dia belum terdaftar di guru_units untuk unit tsb.
-- Daftarkan lewat menu User/Unit, atau jadikan Owner.
-- ============================================================
