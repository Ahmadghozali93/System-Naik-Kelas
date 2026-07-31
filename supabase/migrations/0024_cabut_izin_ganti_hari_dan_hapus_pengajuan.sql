-- ============================================================
-- 0024  Dua kebocoran senyap di alur izin
--
-- Lanjutan 0022 & 0023, dan keduanya ditemukan saat mengerjakan itu.
-- Sama-sama tidak pernah melempar pesan gagal, jadi hanya terlihat lewat
-- jadwal atau rekap yang aneh berminggu-minggu kemudian.
--
-- ── A. Mencabut persetujuan ganti hari menyisakan jadwal ganda ──
--
-- terapkan_izin_ke_jadwal (supabase_izin_absensi_tahap2.sql) membongkar
-- jadwal turunan hanya untuk baris ber-titipan_dari. Patokan itu benar
-- untuk tukar shift, tapi jadwal hasil 'ganti_hari' lahir TANPA
-- titipan_dari — ia bukan titipan siapa-siapa, melainkan jadwal guru itu
-- sendiri yang dipindah hari. Maka ia selamat dari pembongkaran.
--
-- Jadwal asalnya pun tidak menolong: untuk ganti_hari ia sengaja tidak
-- pernah ditandai dialihkan, supaya tetap tercatat 'Izin'. Jadi setelah
-- persetujuan dicabut, gurunya memegang DUA jadwal sekaligus — yang asli
-- dan yang pengganti — dan keduanya menagih kehadiran.
--
-- Patokan yang benar sudah dipakai 0023: jadwal asal ditandai dialihkan,
-- jadwal yang DILAHIRKAN izin tidak. Jalur pencabutan diluruskan ke sana
-- supaya kedua jalur membongkar dengan ukuran yang sama.
--
-- Penjaganya ikut melebar: sebelumnya hanya jadwal titipan yang diperiksa
-- sudah dipakai check-in atau belum, kini semua jadwal turunan.
--
-- ── B. leave_requests tidak punya policy DELETE ──
--
-- RLS-nya hanya select / insert_self / update_admin (supabase_absensi_
-- schema_v2.sql). RLS menolak apa pun yang tidak diizinkan policy, dan
-- DELETE tanpa policy bukan error — ia hanya menghapus nol baris. Jadi
-- penghapusan dari klien selalu "berhasil" tanpa menghapus apa pun.
--
-- Yang terkena: rollback di src/pages/absensi/LeaveRequestPage.jsx —
-- kalau insert rincian gagal, pengajuannya dihapus supaya tidak
-- menggantung. Penghapusan itu tidak pernah terjadi, dan pengajuan tanpa
-- rincian tertinggal berstatus Pending. Sekali disetujui, ia berlaku
-- sepanjang rentang tanggalnya (kolom rincian_per_shift dari 0023 tidak
-- menolong: rinciannya memang tidak pernah berhasil dibuat).
-- ============================================================

-- ------------------------------------------------------------
-- A. Pencabutan persetujuan membongkar semua jadwal turunan
--    Cabang "DISETUJUI" disalin apa adanya dari tahap2 — yang berubah
--    hanya cabang pencabutan di bawahnya.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.terapkan_izin_ke_jadwal()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  d          RECORD;
  v_asal     RECORD;
  v_tujuan   RECORD;
  v_terpakai TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- ══ DISETUJUI → bangun jadwalnya ══
  IF NEW.status = 'Approved' THEN
    FOR d IN SELECT * FROM izin_detail WHERE leave_request_id = NEW.id LOOP

      SELECT ss.*, s.unit_id AS s_unit INTO v_asal
      FROM shift_schedules ss JOIN shifts s ON s.id = ss.shift_id
      WHERE ss.id = d.shift_schedule_id;
      CONTINUE WHEN NOT FOUND;

      IF d.jenis = 'tukar_shift' THEN
        SELECT ss.* INTO v_tujuan FROM shift_schedules ss
        WHERE ss.id = d.tukar_dengan_schedule_id;
        CONTINUE WHEN NOT FOUND;

        -- Pengaju mengambil shift guru pengganti
        INSERT INTO shift_schedules (guru_id, shift_id, tanggal, titipan_dari, izin_detail_id, catatan)
        VALUES (NEW.guru_id, v_tujuan.shift_id, v_tujuan.tanggal,
                v_tujuan.guru_id, d.id, 'Tukar shift')
        ON CONFLICT (guru_id, shift_id, tanggal) DO NOTHING;

        -- Guru pengganti mengambil shift pengaju
        INSERT INTO shift_schedules (guru_id, shift_id, tanggal, titipan_dari, izin_detail_id, catatan)
        VALUES (v_tujuan.guru_id, v_asal.shift_id, v_asal.tanggal,
                NEW.guru_id, d.id, 'Tukar shift')
        ON CONFLICT (guru_id, shift_id, tanggal) DO NOTHING;

        -- Dua jadwal asal ditinggalkan
        UPDATE shift_schedules SET dialihkan = true, izin_detail_id = d.id
         WHERE id IN (v_asal.id, v_tujuan.id);

      ELSIF d.jenis = 'ganti_hari' THEN
        -- Shift yang sama, tanggal berbeda. Jadwal asal dibiarkan
        -- supaya tetap tercatat 'Izin'.
        INSERT INTO shift_schedules (guru_id, shift_id, tanggal, izin_detail_id, catatan)
        VALUES (NEW.guru_id, v_asal.shift_id, d.tanggal_pengganti, d.id, 'Ganti hari')
        ON CONFLICT (guru_id, shift_id, tanggal) DO NOTHING;
      END IF;

    END LOOP;

  -- ══ PERSETUJUAN DICABUT → bongkar lagi ══
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'Approved' THEN

    -- Tolak kalau ada jadwal turunan yang sudah dipakai check-in.
    -- attendances.shift_schedule_id memakai ON DELETE SET NULL, jadi
    -- menghapus jadwalnya akan menyisakan catatan absen tanpa rujukan.
    SELECT string_agg(DISTINCT COALESCE(g.nama, ss.guru_id) ||
                      ' pada ' || to_char(ss.tanggal, 'DD-MM-YYYY'), '; ')
      INTO v_terpakai
    FROM shift_schedules ss
    JOIN izin_detail d2      ON d2.id = ss.izin_detail_id
    JOIN attendances a       ON a.shift_schedule_id = ss.id
    LEFT JOIN gurus g        ON g.id = ss.guru_id
    WHERE d2.leave_request_id = NEW.id
      AND NOT ss.dialihkan
      AND a.check_in IS NOT NULL;

    IF v_terpakai IS NOT NULL THEN
      RAISE EXCEPTION
        'Tidak bisa dibatalkan: jadwal dari izin ini sudah dipakai check-in oleh %. Perbaiki lewat menu Koreksi Absen.',
        v_terpakai;
    END IF;

    -- Jadwal yang dilahirkan izin ini — titipan tukar shift maupun
    -- jadwal ganti hari — sama-sama kehilangan alasan untuk tinggal
    DELETE FROM shift_schedules ss
     USING izin_detail d2
     WHERE d2.id = ss.izin_detail_id
       AND d2.leave_request_id = NEW.id
       AND NOT ss.dialihkan;

    -- Jadwal asal yang ditinggalkan dikembalikan seperti sedia kala
    UPDATE shift_schedules ss
       SET dialihkan = false, izin_detail_id = NULL
      FROM izin_detail d2
     WHERE d2.id = ss.izin_detail_id
       AND d2.leave_request_id = NEW.id
       AND ss.dialihkan;
  END IF;

  RETURN NEW;
END $$;


-- ------------------------------------------------------------
-- B. Policy DELETE untuk leave_requests
--
--    Pengaju boleh membatalkan pengajuannya sendiri selama belum
--    diputuskan — itu yang dibutuhkan rollback di LeaveRequestPage, dan
--    sekaligus membuat tombol batal masuk akal untuk dibuat nanti.
--    Setelah diputuskan, hanya admin — dan penghapusannya kini aman
--    karena rinciannya membongkar jadwal lewat trigger dari 0023,
--    lengkap dengan penjaga check-in yang sama.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "lr_delete" ON public.leave_requests;
CREATE POLICY "lr_delete" ON public.leave_requests FOR DELETE USING (
  (guru_id = absensi_guru_id() AND status = 'Pending') OR absensi_is_admin()
);
