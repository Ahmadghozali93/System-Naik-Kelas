-- ============================================================
-- 0011 — PAYROLL: SUMBER BONUS KPI LANGSUNG DARI MODUL KPI
--
-- Masalah yang diperbaiki:
--   Bonus KPI di payroll sebelumnya HANYA bisa dihitung ulang dari
--   skor (tipe 'bertingkat' + tangga sendiri). Padahal modul KPI SUDAH
--   menghitung & menyimpan nominal bonusnya di kpi_assessments.bonus_nominal
--   (hasil lookup bonus_tiers: role_guru + jumlah TM), lengkap dengan
--   status_kelayakan (LAYAK / TIDAK LAYAK).
--
-- Solusi (config-driven, sekali koding):
--   Tambah cara hitung baru 'ambil_kpi' yang MENARIK bonus_nominal itu
--   langsung — satu sumber kebenaran, tidak menduplikasi tangga.
--
--   Variabel di konfigurasi komponen (diatur lewat UI, tanpa SQL):
--     {
--       "hanya_jika_layak": true,                       -- TIDAK LAYAK → 0
--       "jika_data_kosong": "nol_dengan_peringatan"     -- | "lewati" | "blokir"
--     }
--
-- AMAN dijalankan berulang (CREATE OR REPLACE / cek constraint dinamis).
-- Prasyarat: 0006 & 0007 sudah dijalankan; tabel kpi_assessments punya
--            kolom bonus_nominal & status_kelayakan (dari supabase_kpi_v2).
-- ============================================================

-- ============================================================
-- 1. Izinkan nilai 'ambil_kpi' pada komponen_gaji.tipe_perhitungan
--    (nama constraint auto-generate → cari dinamis lalu ganti)
-- ============================================================
DO $$
DECLARE con TEXT;
BEGIN
  SELECT conname INTO con
  FROM pg_constraint
  WHERE conrelid = 'public.komponen_gaji'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%tipe_perhitungan%';
  IF con IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.komponen_gaji DROP CONSTRAINT ' || quote_ident(con);
  END IF;
END $$;

ALTER TABLE public.komponen_gaji
  ADD CONSTRAINT komponen_gaji_tipe_perhitungan_check
  CHECK (tipe_perhitungan IN ('nominal_tetap','per_unit','bersyarat','bertingkat','ambil_kpi'));


-- ============================================================
-- 2. MESIN UTAMA — versi baru dengan cabang 'ambil_kpi'
--    (menggantikan definisi di 0007; hanya menambah satu cabang +
--     dua variabel; sisanya identik)
-- ============================================================
CREATE OR REPLACE FUNCTION public.hitung_slip_gaji(p_periode_id UUID, p_guru_id TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_per         periode_payroll%ROWTYPE;
  v_awal        DATE;
  v_akhir       DATE;
  v_slip_id     UUID;
  k             RECORD;
  v_cfg         JSONB;
  v_nominal     NUMERIC;
  v_unit_qty    NUMERIC;
  v_tarif       NUMERIC;
  v_ket         TEXT;
  v_mentah      JSONB;
  v_pend        NUMERIC := 0;
  v_pot         NUMERIC := 0;
  v_warn        JSONB   := '[]'::jsonb;
  v_tinjau      BOOLEAN := false;
  v_skor        NUMERIC;
  v_alpa        INT;
  v_telat       INT;
  v_hangus      BOOLEAN;
  v_hari_kerja  INT;
  v_bonus       NUMERIC;   -- 0011: nominal bonus dari modul KPI
  v_kelayakan   TEXT;      -- 0011: LAYAK / TIDAK LAYAK
  v_ada_kpi     BOOLEAN;   -- 0011: apakah baris penilaian KPI ditemukan
BEGIN
  SELECT * INTO v_per FROM periode_payroll WHERE id = p_periode_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Periode payroll tidak ditemukan.'; END IF;
  IF v_per.status <> 'draft' THEN
    RAISE EXCEPTION 'Periode sudah %. Perhitungan hanya boleh saat status draft.', v_per.status;
  END IF;

  v_awal  := make_date(v_per.tahun, v_per.bulan, 1);
  v_akhir := (v_awal + INTERVAL '1 month' - INTERVAL '1 day')::date;

  -- Hitung ulang = buang slip lama, buat baru
  DELETE FROM slip_gaji WHERE periode_payroll_id = p_periode_id AND guru_id = p_guru_id;

  INSERT INTO slip_gaji (periode_payroll_id, guru_id, snapshot_karyawan)
  SELECT p_periode_id, p_guru_id,
         jsonb_build_object('nama', g.nama, 'jabatan', g.role,
                            'role_guru', g.role_guru, 'unit_id', v_per.unit_id,
                            'periode', v_per.tahun || '-' || lpad(v_per.bulan::text,2,'0'))
  FROM gurus g WHERE g.id = p_guru_id
  RETURNING id INTO v_slip_id;

  IF v_slip_id IS NULL THEN RAISE EXCEPTION 'Karyawan % tidak ditemukan.', p_guru_id; END IF;

  -- ── Komponen yang berlaku pada periode ini ──
  FOR k IN
    SELECT kg.id AS komponen_id, kg.nama, kg.kategori, kg.tipe_perhitungan, kg.urutan_tampil,
           COALESCE(kg.konfigurasi, '{}'::jsonb)
             || COALESCE(pgk.konfigurasi_override, '{}'::jsonb)   -- lapis paket
             || COALESCE(kk.konfigurasi_override,  '{}'::jsonb)   -- lapis karyawan
           AS cfg
    FROM karyawan_komponen kk
    JOIN komponen_gaji kg ON kg.id = kk.komponen_gaji_id
    LEFT JOIN paket_gaji_komponen pgk
           ON pgk.paket_gaji_id = kk.paket_gaji_id
          AND pgk.komponen_gaji_id = kk.komponen_gaji_id
    WHERE kk.guru_id = p_guru_id
      AND kk.aktif AND kg.aktif
      AND kk.berlaku_mulai <= v_akhir
      AND (kk.berlaku_selesai IS NULL OR kk.berlaku_selesai >= v_awal)
    ORDER BY kg.urutan_tampil, kg.nama
  LOOP
    v_cfg := k.cfg; v_nominal := 0; v_unit_qty := NULL; v_tarif := NULL;
    v_ket := NULL; v_mentah := '{}'::jsonb;

    IF v_cfg IS NULL OR v_cfg = '{}'::jsonb THEN
      -- 'ambil_kpi' boleh berjalan tanpa konfigurasi (pakai default),
      -- tipe lain wajib dikonfigurasi dulu.
      IF k.tipe_perhitungan <> 'ambil_kpi' THEN
        v_warn := v_warn || jsonb_build_object('komponen', k.nama,
                  'pesan', 'Konfigurasi belum diisi — komponen dilewati.');
        v_tinjau := true;
        CONTINUE;
      END IF;
    END IF;

    -- ══ nominal_tetap ══
    IF k.tipe_perhitungan = 'nominal_tetap' THEN
      v_nominal := COALESCE((v_cfg->>'nominal')::NUMERIC, 0);
      v_ket := 'Nominal tetap';

    -- ══ per_unit (fee tatap muka dari jurnal) ══
    ELSIF k.tipe_perhitungan = 'per_unit' THEN
      IF COALESCE((v_cfg->>'wajib_terverifikasi')::BOOLEAN, false) THEN
        RAISE EXCEPTION
          'Komponen "%": opsi "wajib_terverifikasi" belum didukung karena tabel jurnal belum punya kolom verifikasi. Matikan opsi ini, atau tambahkan fitur verifikasi jurnal terlebih dahulu.', k.nama;
      END IF;

      SELECT COALESCE(SUM(CASE WHEN r.dibayar THEN 1 ELSE 0 END), 0),
             COALESCE(SUM(CASE WHEN r.dibayar THEN r.tarif ELSE 0 END), 0),
             COUNT(*) FILTER (WHERE NOT r.dibayar AND r.alasan LIKE 'Duplikat%'),
             COUNT(*) FILTER (WHERE NOT r.dibayar AND r.alasan LIKE 'Tarif tidak%'),
             COUNT(*) FILTER (WHERE NOT r.dibayar AND r.alasan LIKE 'Melebihi batas%')
        INTO v_unit_qty, v_nominal, v_alpa, v_telat, v_hari_kerja
      FROM rincian_jurnal_fee(p_guru_id, v_awal, v_akhir, v_cfg) r;

      v_ket := v_unit_qty || ' tatap muka dibayar';
      v_mentah := jsonb_build_object('unit_dibayar', v_unit_qty,
                    'duplikat_tidak_dibayar', v_alpa,
                    'tanpa_tarif', v_telat, 'lewat_batas_harian', v_hari_kerja);

      IF v_telat > 0 THEN
        v_warn := v_warn || jsonb_build_object('komponen', k.nama,
                  'pesan', v_telat || ' jurnal tidak dibayar karena programnya tidak ada di matriks tarif. Periksa rincian slip.');
        v_tinjau := true;
      END IF;
      IF v_hari_kerja > 0 THEN
        v_warn := v_warn || jsonb_build_object('komponen', k.nama,
                  'pesan', v_hari_kerja || ' jurnal melebihi batas harian — slip perlu ditinjau.');
        v_tinjau := true;
      END IF;
      IF v_alpa > 0 THEN
        v_warn := v_warn || jsonb_build_object('komponen', k.nama,
                  'pesan', v_alpa || ' jurnal duplikat tidak dibayar.');
      END IF;

    -- ══ bersyarat (bonus kehadiran) ══
    ELSIF k.tipe_perhitungan = 'bersyarat' THEN
      SELECT COUNT(*) FILTER (
               WHERE a.status = ANY (
                 SELECT jsonb_array_elements_text(COALESCE(v_cfg->'status_absensi_menghanguskan','[]'::jsonb)))),
             COUNT(*) FILTER (WHERE a.status = 'Telat'),
             COUNT(*)
        INTO v_alpa, v_telat, v_hari_kerja
      FROM attendances a
      WHERE a.guru_id = p_guru_id AND a.tanggal BETWEEN v_awal AND v_akhir;

      IF v_hari_kerja = 0 THEN
        v_warn := v_warn || jsonb_build_object('komponen', k.nama,
                  'pesan', 'Tidak ada data absensi pada periode ini — bonus dihitung 0.');
        v_tinjau := true;
      END IF;

      v_hangus := (v_alpa > 0)
        OR (NULLIF(v_cfg->>'batas_telat','') IS NOT NULL
            AND v_telat > (v_cfg->>'batas_telat')::INT);

      IF NOT v_hangus THEN
        v_nominal := COALESCE((v_cfg->>'nominal')::NUMERIC, 0);
        v_ket := 'Syarat terpenuhi — bonus penuh';
      ELSIF COALESCE(v_cfg->>'cara_hangus','total') = 'proporsional' AND v_hari_kerja > 0 THEN
        v_nominal := COALESCE((v_cfg->>'nominal')::NUMERIC, 0)
                     * GREATEST(0, (v_hari_kerja - v_alpa))::NUMERIC / v_hari_kerja;
        v_ket := 'Dipotong proporsional: ' || v_alpa || ' dari ' || v_hari_kerja || ' hari';
      ELSE
        v_nominal := 0;
        v_ket := 'Hangus (pelanggaran: ' || v_alpa || ', telat: ' || v_telat || ')';
      END IF;
      v_mentah := jsonb_build_object('hari_tercatat', v_hari_kerja,
                    'menghanguskan', v_alpa, 'telat', v_telat);

    -- ══ bertingkat (bonus KPI — hitung dari skor via tangga) ══
    ELSIF k.tipe_perhitungan = 'bertingkat' THEN
      SELECT ka.skor_akhir INTO v_skor
      FROM kpi_assessments ka
      WHERE ka.guru_id = p_guru_id
        AND ka.periode_tahun = v_per.tahun AND ka.periode_bulan = v_per.bulan
      LIMIT 1;

      IF v_skor IS NULL THEN
        CASE COALESCE(v_cfg->>'jika_data_kosong','nol_dengan_peringatan')
          WHEN 'blokir' THEN
            RAISE EXCEPTION 'Komponen "%": skor KPI % periode %-% belum diinput. Periode tidak bisa dihitung.',
              k.nama, p_guru_id, v_per.tahun, v_per.bulan;
          WHEN 'lewati' THEN
            v_warn := v_warn || jsonb_build_object('komponen', k.nama,
                      'pesan', 'Skor KPI belum ada — komponen dilewati.');
            v_tinjau := true;
            CONTINUE;
          ELSE
            v_warn := v_warn || jsonb_build_object('komponen', k.nama,
                      'pesan', 'Skor KPI belum ada — bonus dihitung 0.');
            v_tinjau := true;
            v_skor := 0;
        END CASE;
      END IF;

      SELECT COALESCE(MAX((t->>'nominal')::NUMERIC), 0) INTO v_nominal
      FROM jsonb_array_elements(COALESCE(v_cfg->'tangga','[]'::jsonb)) t
      WHERE v_skor >= (t->>'min')::NUMERIC;

      v_ket := 'Skor KPI ' || v_skor;
      v_mentah := jsonb_build_object('skor_kpi', v_skor);

    -- ══ ambil_kpi (0011: tarik nominal bonus dari modul KPI) ══
    ELSIF k.tipe_perhitungan = 'ambil_kpi' THEN
      SELECT ka.bonus_nominal, ka.status_kelayakan, ka.skor_akhir, true
        INTO v_bonus, v_kelayakan, v_skor, v_ada_kpi
      FROM kpi_assessments ka
      WHERE ka.guru_id = p_guru_id
        AND ka.periode_tahun = v_per.tahun AND ka.periode_bulan = v_per.bulan
      LIMIT 1;

      IF NOT COALESCE(v_ada_kpi, false) THEN
        -- Belum ada penilaian KPI untuk periode ini
        CASE COALESCE(v_cfg->>'jika_data_kosong','nol_dengan_peringatan')
          WHEN 'blokir' THEN
            RAISE EXCEPTION 'Komponen "%": penilaian KPI % periode %-% belum diinput. Periode tidak bisa dihitung.',
              k.nama, p_guru_id, v_per.tahun, v_per.bulan;
          WHEN 'lewati' THEN
            v_warn := v_warn || jsonb_build_object('komponen', k.nama,
                      'pesan', 'Penilaian KPI belum ada — komponen dilewati.');
            v_tinjau := true;
            CONTINUE;
          ELSE
            v_warn := v_warn || jsonb_build_object('komponen', k.nama,
                      'pesan', 'Penilaian KPI belum ada — bonus dihitung 0.');
            v_tinjau := true;
            v_nominal := 0;
            v_ket := 'Penilaian KPI belum ada';
        END CASE;
      ELSIF COALESCE((v_cfg->>'hanya_jika_layak')::BOOLEAN, true)
            AND v_kelayakan IS DISTINCT FROM 'LAYAK' THEN
        -- Ada penilaian tapi status TIDAK LAYAK → bonus hangus
        v_nominal := 0;
        v_ket := 'Status kelayakan: ' || COALESCE(v_kelayakan,'(kosong)') || ' — bonus 0';
        v_mentah := jsonb_build_object('bonus_nominal_kpi', COALESCE(v_bonus,0),
                      'status_kelayakan', v_kelayakan, 'skor_kpi', v_skor);
      ELSE
        -- Layak (atau syarat kelayakan dimatikan) → pakai nominal dari KPI
        v_nominal := COALESCE(v_bonus, 0);
        v_ket := 'Bonus KPI (kelayakan: ' || COALESCE(v_kelayakan,'-') || ', skor ' || COALESCE(v_skor::text,'-') || ')';
        v_mentah := jsonb_build_object('bonus_nominal_kpi', COALESCE(v_bonus,0),
                      'status_kelayakan', v_kelayakan, 'skor_kpi', v_skor);
      END IF;
    END IF;

    -- Pembulatan ke rupiah penuh (lihat catatan aturan uang di 0007)
    v_nominal := round(COALESCE(v_nominal, 0), 0);

    INSERT INTO slip_gaji_detail (
      slip_gaji_id, komponen_gaji_id, nama_komponen, kategori, urutan_tampil,
      jumlah_unit, tarif_per_unit, nominal, keterangan_hitung, sumber, data_mentah)
    VALUES (
      v_slip_id, k.komponen_id, k.nama, k.kategori, k.urutan_tampil,
      v_unit_qty, v_tarif, v_nominal, v_ket, 'otomatis', v_mentah);

    IF k.kategori = 'pendapatan' THEN v_pend := v_pend + v_nominal;
    ELSE v_pot := v_pot + v_nominal; END IF;

    -- reset penanda KPI agar tidak bocor ke komponen berikutnya
    v_ada_kpi := NULL; v_bonus := NULL; v_kelayakan := NULL;
  END LOOP;

  UPDATE slip_gaji
     SET total_pendapatan = v_pend,
         total_potongan   = v_pot,
         gaji_bersih      = v_pend - v_pot,
         peringatan       = v_warn,
         butuh_ditinjau   = v_tinjau
   WHERE id = v_slip_id;

  RETURN v_slip_id;
END $$;

GRANT EXECUTE ON FUNCTION public.hitung_slip_gaji(UUID, TEXT) TO authenticated;

-- ============================================================
-- SELESAI 0011.
-- 'hitung_periode' & 'simulasi_slip_gaji' tidak berubah — keduanya
-- memanggil hitung_slip_gaji sehingga otomatis ikut versi baru.
-- ============================================================
