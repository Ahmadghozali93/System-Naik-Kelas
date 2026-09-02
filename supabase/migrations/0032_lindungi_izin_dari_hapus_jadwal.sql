-- ============================================================
-- 0032  Izin yang sudah disetujui bisa lenyap tanpa jejak
--
-- Ditemukan 2026-09-02 dari laporan "izin sudah diinput dan disetujui,
-- tapi tidak muncul di rekap". Tujuh pengajuan berstatus Approved
-- ternyata sudah kehilangan seluruh baris izin_detail-nya, enam di
-- antaranya tukar_shift, rentang 3-26 Agustus 2026.
--
-- Buktinya kolom rincian_per_shift (0023): ia hanya bisa jadi true lewat
-- trigger AFTER INSERT pada izin_detail, jadi true + nol rincian berarti
-- rinciannya PERNAH ada lalu terhapus. Jadwal asalnya pun kembali bersih
-- (dialihkan = false, izin_detail_id lepas) - sidik jari
-- bongkar_jadwal_izin_detail yang sudah dijalankan.
--
-- ── A. izin_detail.shift_schedule_id memakai ON DELETE CASCADE ──
--
-- Menghapus satu baris shift_schedules ikut menghapus rincian izin yang
-- menunjuknya, lalu memicu bongkar_jadwal_izin_detail (0023) yang
-- membongkar jadwal turunan dan melepas tanda dialihkan. Seluruh tukar
-- shift terurai, sementara leave_requests tetap berstatus Approved.
-- Tidak ada error, tidak ada peringatan - hanya rekap yang aneh berminggu
-- kemudian. Jalur yang bisa memicunya: tombol hapus di grid Jadwal Shift
-- (src/pages/absensi/ShiftSchedulePage.jsx), terapkan_penyesuaian_shift,
-- dan penghapusan master shift atau guru yang meng-cascade ke jadwal.
--
-- Pasangan tukar shift lebih rapuh lagi: tukar_dengan_schedule_id memakai
-- ON DELETE SET NULL, jadi menghapus jadwal guru pengganti merusak izin
-- tanpa menghapus apa pun - dan sejak 0022 melepas CHECK constraint-nya,
-- tidak ada lagi yang menahan.
--
-- Yang dipakai di sini adalah trigger, bukan mengubah FK jadi RESTRICT:
-- pesannya bisa menyebut siapa dan tanggal berapa, dan penjagaan hanya
-- berlaku selama izinnya Approved - izin yang ditolak atau kedaluwarsa
-- tidak perlu menahan jadwal siapa pun.
--
-- ── B. Persetujuan tukar shift bisa separuh diterapkan ──
--
-- Pembuatan jadwal titipan memakai ON CONFLICT DO NOTHING (tahap2, lalu
-- 0024). Kalau gurunya sudah punya shift itu di tanggal tersebut, insert-
-- nya dilewati diam-diam: pertukarannya jadi timpang, dan izin_detail_id
-- tidak pernah tertempel di jadwal itu sehingga jalur pencabutan kelak
-- tidak mengenalinya. Sama untuk jadwal ganti_hari.
--
-- DO UPDATE bukan jawabannya - itu akan menempelkan izin_detail_id pada
-- jadwal yang sudah ada lebih dulu, dan pencabutan nanti akan menghapus
-- jadwal sah milik guru itu. Yang benar: gagal dengan jelas.
--
-- AMAN: hanya menambah penjagaan. Tidak ada data yang diubah/dihapus.
-- ============================================================


-- ------------------------------------------------------------
-- A. Jadwal yang dipegang izin Approved tidak boleh dihapus
--
--    Menyala BEFORE DELETE, jadi ia mendahului aksi CASCADE dari
--    izin_detail.shift_schedule_id.
--
--    Tidak mengganggu pembongkaran yang sah:
--    • terapkan_izin_ke_jadwal (0024) menghapus jadwal TURUNAN
--      (izin_detail_id terisi, NOT dialihkan) - bukan jadwal asal yang
--      ditunjuk izin_detail.shift_schedule_id. Lagipula ia AFTER UPDATE,
--      jadi saat DELETE-nya jalan statusnya sudah bukan Approved lagi.
--    • bongkar_jadwal_izin_detail (0023) juga hanya menyentuh turunan.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cegah_hapus_jadwal_berizin()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_pemakai TEXT;
BEGIN
  SELECT string_agg(DISTINCT COALESCE(g.nama, lr.guru_id) ||
                    ' pada ' || to_char(d.tanggal, 'DD-MM-YYYY'), '; ')
    INTO v_pemakai
  FROM public.izin_detail d
  JOIN public.leave_requests lr ON lr.id = d.leave_request_id
  LEFT JOIN public.gurus g      ON g.id = lr.guru_id
  WHERE lr.status = 'Approved'
    AND (d.shift_schedule_id = OLD.id OR d.tukar_dengan_schedule_id = OLD.id);

  IF v_pemakai IS NOT NULL THEN
    RAISE EXCEPTION
      'Tidak bisa dihapus: jadwal ini dipakai izin yang sudah disetujui (%). Cabut dulu persetujuan izinnya lewat menu Izin & Cuti, baru jadwalnya boleh diubah.',
      v_pemakai;
  END IF;

  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_cegah_hapus_jadwal_berizin ON public.shift_schedules;
CREATE TRIGGER trg_cegah_hapus_jadwal_berizin
  BEFORE DELETE ON public.shift_schedules
  FOR EACH ROW EXECUTE FUNCTION public.cegah_hapus_jadwal_berizin();


-- ------------------------------------------------------------
-- A2. Penataan ulang shift oleh SPV memeriksa hal yang sama
--
--     terapkan_penyesuaian_shift (tahap3) menghapus jadwal asal dan hanya
--     memeriksa attendances, dialihkan, dan titipan_dari. Trigger di atas
--     akan menangkapnya, tapi pesannya tidak nyambung dengan konteks
--     penyesuaian shift - jadi diperiksa lebih awal dengan bahasa yang
--     sesuai. Sisa fungsinya disalin apa adanya dari tahap3.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.terapkan_penyesuaian_shift(
  p_id UUID, p_shift_ids UUID[]
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v    penyesuaian_shift%ROWTYPE;
  v_ss shift_schedules%ROWTYPE;
  sid  UUID;
  v_n  INT := 0;
BEGIN
  IF NOT public.absensi_is_admin() THEN
    RAISE EXCEPTION 'Hanya SPV/admin yang boleh menata ulang shift.';
  END IF;

  SELECT * INTO v FROM penyesuaian_shift WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Permintaan tidak ditemukan.'; END IF;
  IF v.status <> 'Menunggu' THEN
    RAISE EXCEPTION 'Permintaan ini sudah %.', v.status;
  END IF;
  IF array_length(p_shift_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Pilih minimal satu shift pengganti.';
  END IF;

  -- Jadwal asal (kalau masih ada)
  IF v.shift_schedule_id IS NOT NULL THEN
    SELECT * INTO v_ss FROM shift_schedules WHERE id = v.shift_schedule_id;

    IF FOUND THEN
      -- PENGAMAN: tolak kalau tanggal itu sudah ada absensinya
      IF EXISTS (SELECT 1 FROM attendances a WHERE a.shift_schedule_id = v_ss.id) THEN
        RAISE EXCEPTION 'Tanggal ini sudah ada catatan absensi pada shift tersebut. Betulkan lewat Koreksi Absen dulu.';
      END IF;
      -- Tolak kalau shift asal sedang dialihkan/titipan (bagian dari tukar shift)
      IF v_ss.dialihkan OR v_ss.titipan_dari IS NOT NULL THEN
        RAISE EXCEPTION 'Shift ini sedang dipakai tukar shift. Selesaikan/cabut izinnya dulu.';
      END IF;
      -- BARU (0032): tolak kalau masih dipegang izin yang sudah disetujui.
      -- Tanpa ini penghapusan di bawah meng-cascade dan izinnya lenyap.
      IF EXISTS (
        SELECT 1 FROM izin_detail d
        JOIN leave_requests lr ON lr.id = d.leave_request_id
        WHERE lr.status = 'Approved'
          AND (d.shift_schedule_id = v_ss.id OR d.tukar_dengan_schedule_id = v_ss.id)
      ) THEN
        RAISE EXCEPTION 'Shift ini masih dipegang izin yang sudah disetujui. Cabut dulu persetujuan izinnya, baru jadwalnya boleh ditata ulang.';
      END IF;

      DELETE FROM shift_schedules WHERE id = v_ss.id;
    END IF;
  END IF;

  -- Buat jadwal baru untuk tiap shift pengganti di tanggal yang sama
  FOREACH sid IN ARRAY p_shift_ids LOOP
    INSERT INTO shift_schedules (guru_id, shift_id, tanggal, catatan)
    VALUES (v.guru_id, sid, v.tanggal, 'Hasil penyesuaian shift')
    ON CONFLICT (guru_id, shift_id, tanggal) DO NOTHING;
    v_n := v_n + 1;
  END LOOP;

  UPDATE penyesuaian_shift
     SET status = 'Selesai', ditangani_oleh = public.absensi_guru_id()
   WHERE id = p_id;

  RETURN 'Selesai: ' || v_n || ' shift dijadwalkan untuk ' || v.tanggal;
END $$;

GRANT EXECUTE ON FUNCTION public.terapkan_penyesuaian_shift(UUID, UUID[]) TO authenticated;


-- ------------------------------------------------------------
-- B. Persetujuan tukar shift / ganti hari gagal dengan jelas
--
--    Disalin dari 0024; yang berubah hanya tiga INSERT jadwal, yang kini
--    memeriksa apakah barisnya benar-benar lahir. Cabang pencabutan tidak
--    disentuh.
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
  v_n        INT;
  v_nama     TEXT;
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
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          SELECT COALESCE(g.nama, NEW.guru_id) INTO v_nama FROM gurus g WHERE g.id = NEW.guru_id;
          RAISE EXCEPTION
            'Tukar shift tidak bisa diterapkan: % sudah punya shift "%" pada %. Rapikan jadwalnya dulu, atau tolak pengajuan ini.',
            v_nama,
            (SELECT s.nama FROM shifts s WHERE s.id = v_tujuan.shift_id),
            to_char(v_tujuan.tanggal, 'DD-MM-YYYY');
        END IF;

        -- Guru pengganti mengambil shift pengaju
        INSERT INTO shift_schedules (guru_id, shift_id, tanggal, titipan_dari, izin_detail_id, catatan)
        VALUES (v_tujuan.guru_id, v_asal.shift_id, v_asal.tanggal,
                NEW.guru_id, d.id, 'Tukar shift')
        ON CONFLICT (guru_id, shift_id, tanggal) DO NOTHING;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          SELECT COALESCE(g.nama, v_tujuan.guru_id) INTO v_nama FROM gurus g WHERE g.id = v_tujuan.guru_id;
          RAISE EXCEPTION
            'Tukar shift tidak bisa diterapkan: % sudah punya shift "%" pada %. Rapikan jadwalnya dulu, atau tolak pengajuan ini.',
            v_nama,
            (SELECT s.nama FROM shifts s WHERE s.id = v_asal.shift_id),
            to_char(v_asal.tanggal, 'DD-MM-YYYY');
        END IF;

        -- Dua jadwal asal ditinggalkan
        UPDATE shift_schedules SET dialihkan = true, izin_detail_id = d.id
         WHERE id IN (v_asal.id, v_tujuan.id);

      ELSIF d.jenis = 'ganti_hari' THEN
        -- Shift yang sama, tanggal berbeda. Jadwal asal dibiarkan
        -- supaya tetap tercatat 'Izin'.
        INSERT INTO shift_schedules (guru_id, shift_id, tanggal, izin_detail_id, catatan)
        VALUES (NEW.guru_id, v_asal.shift_id, d.tanggal_pengganti, d.id, 'Ganti hari')
        ON CONFLICT (guru_id, shift_id, tanggal) DO NOTHING;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          SELECT COALESCE(g.nama, NEW.guru_id) INTO v_nama FROM gurus g WHERE g.id = NEW.guru_id;
          RAISE EXCEPTION
            'Ganti hari tidak bisa diterapkan: % sudah punya shift "%" pada %. Pilih tanggal pengganti lain.',
            v_nama,
            (SELECT s.nama FROM shifts s WHERE s.id = v_asal.shift_id),
            to_char(d.tanggal_pengganti, 'DD-MM-YYYY');
        END IF;
      END IF;

    END LOOP;

  -- ══ PERSETUJUAN DICABUT → bongkar lagi ══
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'Approved' THEN

    -- Tolak kalau ada jadwal turunan yang sudah dipakai check-in.
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

    DELETE FROM shift_schedules ss
     USING izin_detail d2
     WHERE d2.id = ss.izin_detail_id
       AND d2.leave_request_id = NEW.id
       AND NOT ss.dialihkan;

    UPDATE shift_schedules ss
       SET dialihkan = false, izin_detail_id = NULL
      FROM izin_detail d2
     WHERE d2.id = ss.izin_detail_id
       AND d2.leave_request_id = NEW.id
       AND ss.dialihkan;
  END IF;

  RETURN NEW;
END $$;

-- Trigger-nya sudah terpasang sejak tahap2; didaftarkan ulang agar file
-- ini tetap aman dijalankan di basis data yang belum pernah kena tahap2.
DROP TRIGGER IF EXISTS trg_terapkan_izin_jadwal ON public.leave_requests;
CREATE TRIGGER trg_terapkan_izin_jadwal
  AFTER UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.terapkan_izin_ke_jadwal();
