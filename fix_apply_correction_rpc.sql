-- ============================================================
-- FIX TUNTAS: Koreksi absen di-approve tapi absen tidak berubah
-- Jalankan di Supabase SQL Editor. Aman diulang.
--
-- AKAR MASALAH:
-- Penerapan koreksi dilakukan dari browser memakai hak akses user yang
-- login, sehingga bisa diblokir RLS tabel attendances secara diam-diam
-- (0 baris, tanpa error). Bahkan MEMBACA absennya pun bisa terblokir,
-- membuat sistem salah mengira "belum ada absen".
--
-- SOLUSI:
-- Pindahkan seluruh proses ke fungsi server SECURITY DEFINER yang berjalan
-- dengan hak penuh (bypass RLS), TAPI tetap memverifikasi pemanggilnya
-- adalah admin/SPV/Owner. Perhitungan status & durasi juga di sini agar
-- konsisten (timezone Asia/Jakarta).
-- ============================================================

CREATE OR REPLACE FUNCTION apply_attendance_correction(p_correction_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  corr       attendance_corrections%ROWTYPE;
  att        attendances%ROWTYPE;
  sh         shifts%ROWTYPE;
  v_ss_id    uuid;
  v_ci       timestamptz;
  v_co       timestamptz;
  v_status   text;
  v_durasi   int;
  v_diff     numeric;
  v_found    boolean := false;
BEGIN
  -- 1. Otorisasi: hanya admin/SPV/Owner
  IF NOT absensi_is_admin() THEN
    RAISE EXCEPTION 'Tidak berwenang menerapkan koreksi absen (harus admin/SPV/Owner).';
  END IF;

  -- 2. Ambil data koreksi
  SELECT * INTO corr FROM attendance_corrections WHERE id = p_correction_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Data koreksi tidak ditemukan.';
  END IF;

  -- 3. Cari absen target: lewat attendance_id, lalu lewat guru + tanggal
  IF corr.attendance_id IS NOT NULL THEN
    SELECT * INTO att FROM attendances WHERE id = corr.attendance_id;
    v_found := FOUND;
  END IF;
  IF NOT v_found THEN
    SELECT * INTO att FROM attendances
    WHERE guru_id = corr.guru_id AND tanggal = corr.tanggal
    ORDER BY check_in NULLS LAST
    LIMIT 1;
    v_found := FOUND;
  END IF;

  -- 4. Tentukan jam final + shift schedule
  IF v_found THEN
    v_ci    := COALESCE(corr.check_in_koreksi,  att.check_in);
    v_co    := COALESCE(corr.check_out_koreksi, att.check_out);
    v_ss_id := att.shift_schedule_id;
  ELSE
    v_ci    := corr.check_in_koreksi;
    v_co    := corr.check_out_koreksi;
    SELECT id INTO v_ss_id FROM shift_schedules
      WHERE guru_id = corr.guru_id AND tanggal = corr.tanggal
      LIMIT 1;
  END IF;

  -- 5. Ambil detail shift (untuk hitung status & durasi)
  IF v_ss_id IS NOT NULL THEN
    SELECT s.* INTO sh
    FROM shift_schedules ssd
    JOIN shifts s ON s.id = ssd.shift_id
    WHERE ssd.id = v_ss_id;
  END IF;

  -- 6. Hitung status
  IF v_ci IS NULL THEN
    v_status := 'Alpha';
  ELSIF sh.id IS NULL THEN
    v_status := 'Hadir';
  ELSE
    v_diff := EXTRACT(EPOCH FROM (
      (v_ci AT TIME ZONE 'Asia/Jakarta')
      - (date_trunc('day', v_ci AT TIME ZONE 'Asia/Jakarta') + sh.jam_mulai)
    )) / 60;
    IF v_diff <= COALESCE(sh.toleransi_menit, 0) THEN
      v_status := 'Hadir';
    ELSE
      v_status := 'Telat';
    END IF;
  END IF;

  -- 7. Hitung durasi (menit)
  IF v_ci IS NULL OR v_co IS NULL THEN
    v_durasi := NULL;
  ELSE
    v_diff := EXTRACT(EPOCH FROM (v_co - v_ci)) / 60;
    IF COALESCE(sh.lintas_hari, false) AND v_diff < 0 THEN
      v_diff := v_diff + 1440;
    END IF;
    v_durasi := GREATEST(0, round(v_diff));
  END IF;

  -- 8. Terapkan: UPDATE kalau absen sudah ada, INSERT kalau belum
  IF v_found THEN
    UPDATE attendances SET
      check_in     = v_ci,
      check_out    = v_co,
      durasi_menit = COALESCE(v_durasi, durasi_menit),
      status       = v_status
    WHERE id = att.id;
    RETURN 'updated';
  ELSE
    IF v_ci IS NULL THEN
      RAISE EXCEPTION 'Koreksi hanya berisi jam check-out, tapi belum ada absen di tanggal itu. Isi juga jam check-in.';
    END IF;
    INSERT INTO attendances (guru_id, unit_id, shift_schedule_id, tanggal, check_in, check_out, durasi_menit, status)
    VALUES (corr.guru_id, corr.unit_id, v_ss_id, corr.tanggal, v_ci, v_co, v_durasi, v_status);
    RETURN 'inserted';
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION apply_attendance_correction(uuid) TO authenticated;

-- ============================================================
-- SELESAI. Setelah ini, tombol Setuju & Terapkan Ulang di aplikasi
-- akan memanggil fungsi ini — tidak lagi terblokir RLS diam-diam.
-- ============================================================
