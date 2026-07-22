-- ============================================================
-- 0007 — MESIN PERHITUNGAN PAYROLL (Fase 2)
--
-- Semua perhitungan dikerjakan di DATABASE, bukan di browser,
-- supaya angka gaji tidak bisa diubah dari sisi pengguna.
--
-- ATURAN UANG:
--   • Semua nominal bertipe NUMERIC (bukan float) — tidak ada
--     pembulatan tersembunyi seperti 1.999.999,9999.
--   • Pembulatan akhir tiap komponen: round(x, 0) = ke RUPIAH PENUH,
--     pembulatan setengah ke atas (0,5 → 1). Contoh: 1.500,4 → 1.500
--     dan 1.500,5 → 1.501.
--
-- BATASAN YANG DIKETAHUI (akibat jurnal tidak diubah — keputusan pemilik):
--   • Opsi "wajib_terverifikasi" TIDAK DIDUKUNG. Kalau dinyalakan,
--     perhitungan DITOLAK dengan pesan jelas (bukan diam-diam dilewati).
--   • Jurnal tidak bisa dikunci setelah periode dibayar.
-- ============================================================

-- Agar prioritas konfigurasi 3 lapis bisa jalan, karyawan_komponen perlu
-- tahu berasal dari paket mana (opsional, boleh NULL).
ALTER TABLE public.karyawan_komponen
  ADD COLUMN IF NOT EXISTS paket_gaji_id UUID REFERENCES public.paket_gaji(id) ON DELETE SET NULL;


-- ============================================================
-- 1. PENGAMAN: periode terkunci menolak perubahan slip
-- ============================================================
CREATE OR REPLACE FUNCTION public.cegah_ubah_slip_terkunci()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status TEXT; v_periode UUID;
BEGIN
  v_periode := COALESCE(NEW.periode_payroll_id, OLD.periode_payroll_id);
  SELECT status INTO v_status FROM periode_payroll WHERE id = v_periode;

  -- Perubahan status slip itu sendiri (kunci/bayar) tetap diizinkan
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF v_status IN ('terkunci','dibayar') THEN
    RAISE EXCEPTION 'Periode sudah % — angka slip tidak bisa diubah lagi.', v_status;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_slip_terkunci ON public.slip_gaji;
CREATE TRIGGER trg_slip_terkunci
  BEFORE INSERT OR UPDATE OR DELETE ON public.slip_gaji
  FOR EACH ROW EXECUTE FUNCTION public.cegah_ubah_slip_terkunci();

CREATE OR REPLACE FUNCTION public.cegah_ubah_detail_terkunci()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status TEXT;
BEGIN
  SELECT pp.status INTO v_status
  FROM slip_gaji s JOIN periode_payroll pp ON pp.id = s.periode_payroll_id
  WHERE s.id = COALESCE(NEW.slip_gaji_id, OLD.slip_gaji_id);

  IF v_status IN ('terkunci','dibayar') THEN
    RAISE EXCEPTION 'Periode sudah % — rincian slip tidak bisa diubah lagi.', v_status;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_detail_terkunci ON public.slip_gaji_detail;
CREATE TRIGGER trg_detail_terkunci
  BEFORE INSERT OR UPDATE OR DELETE ON public.slip_gaji_detail
  FOR EACH ROW EXECUTE FUNCTION public.cegah_ubah_detail_terkunci();


-- ============================================================
-- 2. RINCIAN JURNAL UNTUK FEE TATAP MUKA
--    Dipakai mesin hitung DAN halaman "lihat rincian" di slip,
--    supaya angka yang dibayar bisa ditelusuri satu per satu.
--
--    Keputusan pemilik: 1 baris jurnal = 1 SISWA = 1 unit dibayar.
--    Tarif diambil per PROGRAM (master `programs`).
-- ============================================================
CREATE OR REPLACE FUNCTION public.rincian_jurnal_fee(
  p_guru_id TEXT, p_awal DATE, p_akhir DATE, p_cfg JSONB
)
RETURNS TABLE (
  jurnal_id  UUID,
  tanggal    DATE,
  program    TEXT,
  siswa_id   TEXT,
  dibayar    BOOLEAN,
  tarif      NUMERIC,
  alasan     TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH batas AS (
  SELECT NULLIF(p_cfg->>'batas_jurnal_per_hari','')::INT AS maks_per_hari
),
-- Matriks tarif menyimpan program_id (ID, bukan teks). Nama program
-- dicari dari master agar bisa dicocokkan dengan jurnal (yang menyimpan teks).
tarif_map AS (
  SELECT pr.nama AS nama_program, (m->>'tarif')::NUMERIC AS tarif
  FROM jsonb_array_elements(COALESCE(p_cfg->'matriks_tarif','[]'::jsonb)) m
  JOIN programs pr ON pr.id = (m->>'program_id')
),
j AS (
  SELECT je.id, (je.timestamp AT TIME ZONE 'Asia/Jakarta')::date AS tgl,
         je.program, je.siswa_id, je.created_at
  FROM jurnal_entries je
  WHERE je.guru_id = p_guru_id
    AND (je.timestamp AT TIME ZONE 'Asia/Jakarta')::date BETWEEN p_awal AND p_akhir
),
-- Jurnal ganda (siswa + tanggal + program sama) hanya dihitung SEKALI
tandai_dup AS (
  SELECT j.*,
         ROW_NUMBER() OVER (PARTITION BY j.siswa_id, j.tgl, j.program
                            ORDER BY j.created_at, j.id) AS urut_dup
  FROM j
),
-- Setelah duplikat disingkirkan, hitung urutan per hari untuk batas harian
tandai_harian AS (
  SELECT t.*,
         CASE WHEN t.urut_dup = 1
              THEN ROW_NUMBER() OVER (PARTITION BY t.tgl
                                      ORDER BY (t.urut_dup <> 1), t.created_at, t.id)
         END AS urut_hari
  FROM tandai_dup t
)
SELECT
  th.id, th.tgl, th.program, th.siswa_id,
  (th.urut_dup = 1
    AND tm.tarif IS NOT NULL
    AND (b.maks_per_hari IS NULL OR th.urut_hari <= b.maks_per_hari)) AS dibayar,
  tm.tarif,
  CASE
    WHEN th.urut_dup > 1 THEN 'Duplikat, tidak dibayar'
    WHEN tm.tarif IS NULL THEN
      'Tarif tidak ditemukan untuk program "' || COALESCE(th.program,'(kosong)') || '" — perbaiki data / lengkapi matriks tarif'
    WHEN b.maks_per_hari IS NOT NULL AND th.urut_hari > b.maks_per_hari THEN
      'Melebihi batas ' || b.maks_per_hari || ' jurnal/hari — perlu ditinjau'
    ELSE NULL
  END AS alasan
FROM tandai_harian th
CROSS JOIN batas b
LEFT JOIN tarif_map tm ON tm.nama_program = th.program
ORDER BY th.tgl, th.created_at;
$$;


-- ============================================================
-- 3. MESIN UTAMA — hitung slip 1 karyawan
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
      v_warn := v_warn || jsonb_build_object('komponen', k.nama,
                'pesan', 'Konfigurasi belum diisi — komponen dilewati.');
      v_tinjau := true;
      CONTINUE;
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

    -- ══ bertingkat (bonus KPI) ══
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
    END IF;

    -- Pembulatan ke rupiah penuh (lihat catatan aturan uang di atas)
    v_nominal := round(COALESCE(v_nominal, 0), 0);

    INSERT INTO slip_gaji_detail (
      slip_gaji_id, komponen_gaji_id, nama_komponen, kategori, urutan_tampil,
      jumlah_unit, tarif_per_unit, nominal, keterangan_hitung, sumber, data_mentah)
    VALUES (
      v_slip_id, k.komponen_id, k.nama, k.kategori, k.urutan_tampil,
      v_unit_qty, v_tarif, v_nominal, v_ket, 'otomatis', v_mentah);

    IF k.kategori = 'pendapatan' THEN v_pend := v_pend + v_nominal;
    ELSE v_pot := v_pot + v_nominal; END IF;
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


-- ============================================================
-- 4. Hitung seluruh karyawan dalam satu periode
-- ============================================================
CREATE OR REPLACE FUNCTION public.hitung_periode(p_periode_id UUID)
RETURNS TABLE (guru_id TEXT, slip_id UUID, gaji_bersih NUMERIC, butuh_ditinjau BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_per periode_payroll%ROWTYPE; g RECORD; v_slip UUID;
BEGIN
  SELECT * INTO v_per FROM periode_payroll WHERE id = p_periode_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Periode payroll tidak ditemukan.'; END IF;
  IF v_per.status <> 'draft' THEN
    RAISE EXCEPTION 'Periode sudah %. Perhitungan hanya boleh saat status draft.', v_per.status;
  END IF;

  FOR g IN
    SELECT DISTINCT kk.guru_id
    FROM karyawan_komponen kk
    JOIN guru_units gu ON gu.guru_id = kk.guru_id AND gu.unit_id = v_per.unit_id
    WHERE kk.aktif
  LOOP
    v_slip := public.hitung_slip_gaji(p_periode_id, g.guru_id);
    RETURN QUERY
      SELECT s.guru_id, s.id, s.gaji_bersih, s.butuh_ditinjau
      FROM slip_gaji s WHERE s.id = v_slip;
  END LOOP;
END $$;


-- ============================================================
-- 5. Uji coba hitung TANPA menyimpan (untuk tombol "Uji Coba Hitung")
-- ============================================================
CREATE OR REPLACE FUNCTION public.simulasi_slip_gaji(p_periode_id UUID, p_guru_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_slip UUID; v_hasil JSONB;
BEGIN
  v_slip := public.hitung_slip_gaji(p_periode_id, p_guru_id);

  SELECT jsonb_build_object(
    'total_pendapatan', s.total_pendapatan,
    'total_potongan',   s.total_potongan,
    'gaji_bersih',      s.gaji_bersih,
    'butuh_ditinjau',   s.butuh_ditinjau,
    'peringatan',       s.peringatan,
    'rincian', (SELECT jsonb_agg(jsonb_build_object(
                  'komponen', d.nama_komponen, 'kategori', d.kategori,
                  'jumlah_unit', d.jumlah_unit, 'nominal', d.nominal,
                  'keterangan', d.keterangan_hitung, 'data_mentah', d.data_mentah)
                  ORDER BY d.urutan_tampil)
               FROM slip_gaji_detail d WHERE d.slip_gaji_id = s.id)
  ) INTO v_hasil
  FROM slip_gaji s WHERE s.id = v_slip;

  -- Simulasi: buang lagi, tidak ada yang tersimpan
  DELETE FROM slip_gaji WHERE id = v_slip;
  RETURN v_hasil;
END $$;


GRANT EXECUTE ON FUNCTION public.hitung_slip_gaji(UUID, TEXT)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.hitung_periode(UUID)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.simulasi_slip_gaji(UUID, TEXT)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.rincian_jurnal_fee(TEXT, DATE, DATE, JSONB) TO authenticated;
