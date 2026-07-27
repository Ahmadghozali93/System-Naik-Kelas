-- ============================================================
-- 0020  Payroll terpusat — periode global per bulan
--
-- Masalah: periode_payroll ber-UNIQUE (unit_id, tahun, bulan), sehingga
-- periode dibuat SATU PER CABANG. hitung_periode lalu memilih karyawan
-- lewat guru_units yang cocok dengan cabang periode. Akibatnya guru yang
-- terdaftar di dua cabang mendapat DUA slip pada bulan yang sama, dan
-- namanya muncul dua kali di Rekap Gaji.
--
-- Yang membuatnya serius: kedua slip itu isinya SAMA — gaji penuh, bukan
-- porsi per cabang. Tidak ada satu pun penyaring cabang di mesin hitung:
--   • komponen  : WHERE kk.guru_id = p_guru_id AND kk.aktif
--   • absensi   : WHERE a.guru_id  = p_guru_id AND tanggal BETWEEN ...
--   • fee jurnal: WHERE je.guru_id = p_guru_id AND tanggal BETWEEN ...
-- v_per.unit_id hanya dipakai untuk mengisi label snapshot. Jadi Rekap
-- menjumlahkan gaji orang yang sama dua kali, dan kalau kedua periode
-- ditandai dibayar, orangnya benar-benar dibayar dua kali.
--
-- Gaji di tempat ini dikelola TERPUSAT, bukan per cabang. Jadi akar
-- masalahnya bukan nama ganda di layar, melainkan periode yang dipecah
-- per cabang padahal gaji melekat pada orang. Migrasi ini membuang
-- dimensi cabang dari periode dan slip.
--
-- Dijalankan SEBELUM payroll dipakai sungguhan: yang ada baru 4 periode,
-- 23 slip, dan 44 detail hasil uji coba, semuanya masih 'draft'. Tidak
-- ada uang yang telanjur keluar dua kali.
--
-- Pembagian wewenang setelah migrasi ini:
--   • Buat periode, hitung ulang, ubah slip → izin "Kelola Payroll"
--   • Kunci & tandai dibayar                → Owner saja
-- Alasannya: menghitung ulang bisa diulang tanpa akibat, mengunci tidak.
-- Dan karena periodenya kini global, mengunci berdampak ke SELURUH
-- karyawan sekaligus — terlalu besar untuk dipegang tiap pengelola cabang.
--
-- SPV tetap dibatasi cabangnya, tapi lewat CABANG GURU pemilik slip
-- (guru_units), bukan lewat cabang periode yang sudah tidak ada.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Pengaman — tolak jalan kalau payroll ternyata sudah dipakai
--
-- Migrasi ini membuang kolom dan menghapus baris. Kalau ada periode yang
-- sudah dikunci atau dibayar, berarti payroll sungguhan pernah berjalan
-- dan penghapusan di bagian 2 akan membuang catatan keuangan yang sah.
-- ------------------------------------------------------------

DO $$
DECLARE v_terpakai INT;
BEGIN
  SELECT COUNT(*) INTO v_terpakai
  FROM public.periode_payroll
  WHERE status <> 'draft' OR tanggal_kunci IS NOT NULL OR tanggal_bayar IS NOT NULL;

  IF v_terpakai > 0 THEN
    RAISE EXCEPTION
      'Migrasi dibatalkan: ada % periode payroll yang sudah dikunci/dibayar. Migrasi ini dirancang untuk data uji coba yang semuanya masih draft. Rancang ulang migrasinya dengan pemindahan data, jangan penghapusan. Tidak ada perubahan yang tersimpan.', v_terpakai;
  END IF;
END $$;


-- ------------------------------------------------------------
-- 2. Buang data uji coba
--
-- slip_gaji_detail dan slip_gaji ikut terhapus lewat ON DELETE CASCADE.
-- karyawan_komponen TIDAK disentuh — itu master data penetapan komponen
-- per karyawan, dan tetap dipakai setelah migrasi ini.
-- ------------------------------------------------------------

DELETE FROM public.periode_payroll;


-- ------------------------------------------------------------
-- 3. Skema — periode jadi global per bulan
--
-- Policy lama HARUS dihapus lebih dulu. Enam policy menyebut
-- periode_payroll.unit_id di dalam ekspresinya — termasuk policy pada
-- slip_gaji dan slip_gaji_detail yang menengok ke tabel periode lewat
-- sub-query. Selama policy itu masih ada, Postgres menolak membuang
-- kolomnya: "cannot drop column unit_id because other objects depend
-- on it". Penggantinya dibuat di bagian 6.
--
-- Sengaja TIDAK memakai DROP COLUMN ... CASCADE. CASCADE akan ikut
-- menghapus policy-policy itu diam-diam, dan kalau bagian 6 gagal,
-- tabel gaji berakhir tanpa policy sama sekali — RLS menyala tanpa
-- aturan, seluruh akses tertutup, tanpa jejak apa yang hilang.
-- ------------------------------------------------------------

DROP POLICY IF EXISTS pp_select  ON public.periode_payroll;
DROP POLICY IF EXISTS pp_write   ON public.periode_payroll;
DROP POLICY IF EXISTS sg_select  ON public.slip_gaji;
DROP POLICY IF EXISTS sg_write   ON public.slip_gaji;
DROP POLICY IF EXISTS sgd_select ON public.slip_gaji_detail;
DROP POLICY IF EXISTS sgd_write  ON public.slip_gaji_detail;

ALTER TABLE public.periode_payroll DROP CONSTRAINT IF EXISTS periode_payroll_unit_id_tahun_bulan_key;
ALTER TABLE public.periode_payroll DROP COLUMN IF EXISTS unit_id;

DO $$ BEGIN
  ALTER TABLE public.periode_payroll ADD CONSTRAINT periode_payroll_tahun_bulan_key UNIQUE (tahun, bulan);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- slip_gaji sengaja TIDAK diberi kolom cabang. Payroll di sini tidak
-- membebankan biaya gaji ke cabang mana pun, jadi kolom itu hanya akan
-- memunculkan kembali pertanyaan "guru dua cabang dihitung di mana".


-- ------------------------------------------------------------
-- 4. Mesin hitung — ambil semua karyawan aktif, bukan per cabang
-- ------------------------------------------------------------

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
    -- Join ke guru_units dibuang bersama unit_id periode. Perlu dicatat:
    -- join itu diam-diam punya tugas kedua — menyaring siapa yang dapat
    -- slip. Tanpa penggantinya, slip akan terbit untuk karyawan yang
    -- sudah resign selama komponen gajinya belum dinonaktifkan. Karena
    -- itu syarat status 'Aktif' di bawah wajib ada, bukan hiasan.
    SELECT DISTINCT kk.guru_id
    FROM karyawan_komponen kk
    JOIN gurus g2 ON g2.id = kk.guru_id AND g2.status = 'Aktif'
    WHERE kk.aktif
  LOOP
    v_slip := public.hitung_slip_gaji(p_periode_id, g.guru_id);
    RETURN QUERY
      SELECT s.guru_id, s.id, s.gaji_bersih, s.butuh_ditinjau
      FROM slip_gaji s WHERE s.id = v_slip;
  END LOOP;
END $$;


-- ------------------------------------------------------------
-- 5. hitung_slip_gaji — ditulis ulang tanpa unit_id
--
-- Fungsi ini menyalin v_per.unit_id ke dalam snapshot_karyawan. Kolom itu
-- sudah dibuang di bagian 3, jadi tanpa penulisan ulang ini perhitungan
-- akan gagal dengan "record has no field unit_id" pada slip pertama.
--
-- Isinya SAMA PERSIS dengan versi 0011 kecuali satu baris snapshot yang
-- menghilang. Seluruh logika perhitungan — komponen, fee jurnal, absensi,
-- bonus KPI — tidak disentuh sama sekali.
-- ------------------------------------------------------------

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
                            'role_guru', g.role_guru,
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


-- ------------------------------------------------------------
-- 6. Hak akses
--
-- periode_payroll : baca untuk semua yang login (halaman gaji karyawan
--                   perlu menampilkan nama bulannya); tulis untuk
--                   pemegang izin Kelola Payroll; kunci/bayar Owner saja.
-- slip_gaji       : Owner semua; karyawan slipnya sendiri yang sudah
--                   dibayar; pengelola payroll dibatasi cabang GURU-nya.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.payroll_kelola_guru(p_guru_id TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT public.payroll_is_owner()
      OR (public.payroll_boleh_kelola() AND EXISTS (
            SELECT 1 FROM public.guru_units gu
            WHERE gu.guru_id = p_guru_id
              AND gu.unit_id = ANY(public.payroll_unit_ids())));
$$;

GRANT EXECUTE ON FUNCTION public.payroll_kelola_guru(TEXT) TO authenticated;

-- ── periode_payroll ──
DROP POLICY IF EXISTS pp_select ON public.periode_payroll;
DROP POLICY IF EXISTS pp_write  ON public.periode_payroll;
DROP POLICY IF EXISTS pp_insert ON public.periode_payroll;
DROP POLICY IF EXISTS pp_update ON public.periode_payroll;
DROP POLICY IF EXISTS pp_delete ON public.periode_payroll;

CREATE POLICY pp_select ON public.periode_payroll FOR SELECT TO authenticated
  USING (true);

CREATE POLICY pp_insert ON public.periode_payroll FOR INSERT TO authenticated
  WITH CHECK (public.payroll_is_owner() OR public.payroll_boleh_kelola());

-- Mengunci & menandai dibayar berdampak ke SELURUH karyawan sekaligus,
-- karena periodenya kini global. Perubahan status hanya boleh Owner;
-- sisanya (mis. catatan) boleh pengelola payroll selama masih draft.
CREATE POLICY pp_update ON public.periode_payroll FOR UPDATE TO authenticated
  USING (public.payroll_is_owner()
         OR (public.payroll_boleh_kelola() AND status = 'draft'))
  WITH CHECK (public.payroll_is_owner()
              OR (public.payroll_boleh_kelola() AND status = 'draft'));

CREATE POLICY pp_delete ON public.periode_payroll FOR DELETE TO authenticated
  USING (public.payroll_is_owner() AND status = 'draft');

-- ── slip_gaji ──
DROP POLICY IF EXISTS sg_select ON public.slip_gaji;
DROP POLICY IF EXISTS sg_write  ON public.slip_gaji;

CREATE POLICY sg_select ON public.slip_gaji FOR SELECT TO authenticated
  USING (
    public.payroll_is_owner()
    OR (guru_id = public.absensi_guru_id() AND status = 'dibayar')
    OR public.payroll_kelola_guru(guru_id)
  );

CREATE POLICY sg_write ON public.slip_gaji FOR ALL TO authenticated
  USING (public.payroll_kelola_guru(guru_id))
  WITH CHECK (public.payroll_kelola_guru(guru_id));

-- ── slip_gaji_detail (ikut slip induknya) ──
DROP POLICY IF EXISTS sgd_select ON public.slip_gaji_detail;
DROP POLICY IF EXISTS sgd_write  ON public.slip_gaji_detail;

CREATE POLICY sgd_select ON public.slip_gaji_detail FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.slip_gaji s
    WHERE s.id = slip_gaji_id
      AND (public.payroll_is_owner()
           OR (s.guru_id = public.absensi_guru_id() AND s.status = 'dibayar')
           OR public.payroll_kelola_guru(s.guru_id))
  ));

CREATE POLICY sgd_write ON public.slip_gaji_detail FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.slip_gaji s
                 WHERE s.id = slip_gaji_id AND public.payroll_kelola_guru(s.guru_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.slip_gaji s
                      WHERE s.id = slip_gaji_id AND public.payroll_kelola_guru(s.guru_id)));


-- ------------------------------------------------------------
-- 7. Trigger pesan galat — ditulis ulang tanpa unit_id
--
-- Tugasnya hanya memperjelas pesan untuk pengguna aplikasi; penjaga
-- sebenarnya tetap RLS di bagian 6.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.periode_payroll_cek_izin()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Tanpa sesi login (SQL Editor, service role, skrip migrasi) diam saja.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.payroll_is_owner() OR public.payroll_boleh_kelola() THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Akun Anda belum diberi izin mengelola payroll. Minta Owner menyalakan "Kelola Payroll" di menu User.';
END $$;

DROP TRIGGER IF EXISTS trg_periode_payroll_cek_izin ON public.periode_payroll;
CREATE TRIGGER trg_periode_payroll_cek_izin
  BEFORE INSERT ON public.periode_payroll
  FOR EACH ROW EXECUTE FUNCTION public.periode_payroll_cek_izin();


-- ------------------------------------------------------------
-- 8. Setelah migrasi ini
--
--   1. Buat periode Juli 2026 lewat menu Periode Payroll — pemilih
--      cabang sudah tidak ada, cukup bulan & tahun.
--   2. Tekan Hitung, lalu pastikan tiap nama muncul TEPAT SEKALI:
--
--        SELECT g.nama, COUNT(*) AS jumlah_slip
--        FROM slip_gaji s JOIN gurus g ON g.id = s.guru_id
--        GROUP BY g.nama HAVING COUNT(*) > 1;
--
--      Harus kosong.
--
--   3. Periksa tidak ada slip untuk karyawan nonaktif:
--
--        SELECT g.nama, g.status
--        FROM slip_gaji s JOIN gurus g ON g.id = s.guru_id
--        WHERE g.status <> 'Aktif';
--
--      Harus kosong juga.
-- ------------------------------------------------------------
