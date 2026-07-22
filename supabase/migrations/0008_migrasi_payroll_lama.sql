-- ============================================================
-- 0008 — MIGRASI DATA PAYROLL LAMA KE STRUKTUR BARU
--
-- JALANKAN 0008a (pratinjau) DULU sebelum ini.
--
-- SIFAT SCRIPT INI:
--   • TIDAK menghapus/mengubah tabel payroll lama sama sekali
--   • Setiap baris yang dibuat DICATAT di migrasi_payroll_log,
--     sehingga bisa DIBATALKAN penuh lewat 0008b_rollback
--   • Menolak jalan kalau migrasi sudah pernah dilakukan
--
-- YANG DIPINDAH:
--   salary_components   → komponen_gaji      (semua jadi "nominal tetap")
--   employee_salaries   → karyawan_komponen  (nominal jadi nilai khusus karyawan)
--   payrolls            → periode_payroll
--   payroll_items       → slip_gaji + slip_gaji_detail (apa adanya)
--
-- YANG TIDAK DIPINDAH:
--   loans / loan_deductions (kasbon) — bentuknya angsuran, beda konsep
-- ============================================================

-- ── Catatan migrasi, dipakai untuk pembatalan ──
CREATE TABLE IF NOT EXISTS public.migrasi_payroll_log (
  id          BIGSERIAL PRIMARY KEY,
  batch       UUID        NOT NULL,
  tabel       TEXT        NOT NULL,
  id_baru     TEXT        NOT NULL,
  id_lama     TEXT,
  dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.migrasi_payroll_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mpl_all ON public.migrasi_payroll_log;
CREATE POLICY mpl_all ON public.migrasi_payroll_log FOR ALL TO authenticated
  USING (public.payroll_is_owner()) WITH CHECK (public.payroll_is_owner());

DO $$
DECLARE
  v_batch   UUID := gen_random_uuid();
  v_n_komp  INT := 0;
  v_n_kar   INT := 0;
  v_n_per   INT := 0;
  v_n_slip  INT := 0;
  v_n_det   INT := 0;
  v_lewat   INT := 0;
  r         RECORD;
  v_id      UUID;
  v_slip    UUID;
  v_jml_det NUMERIC;
  v_warn    JSONB;
BEGIN
  -- Cegah migrasi ganda
  IF EXISTS (SELECT 1 FROM migrasi_payroll_log) THEN
    RAISE EXCEPTION 'Migrasi sudah pernah dijalankan. Jalankan 0008b_rollback dulu kalau mau mengulang.';
  END IF;

  -- ══ 1. salary_components → komponen_gaji ══
  FOR r IN
    SELECT sc.*, ROW_NUMBER() OVER (ORDER BY sc.created_at, sc.nama) AS rn
    FROM salary_components sc
  LOOP
    INSERT INTO komponen_gaji (unit_id, kode, nama, kategori, tipe_perhitungan,
                               konfigurasi, urutan_tampil, aktif)
    VALUES (
      NULL,                                        -- komponen lama berlaku semua cabang
      'LAMA' || lpad(r.rn::text, 3, '0') || '_' ||
        upper(left(regexp_replace(r.nama, '[^a-zA-Z0-9]+', '_', 'g'), 20)),
      r.nama,
      CASE WHEN r.tipe = 'Potongan' THEN 'potongan' ELSE 'pendapatan' END,
      'nominal_tetap',                             -- payroll lama semuanya nominal tetap
      '{"nominal": 0}'::jsonb,                     -- nominal sebenarnya per karyawan
      (r.rn * 10)::int,
      COALESCE(r.aktif, true)
    )
    RETURNING id INTO v_id;

    INSERT INTO migrasi_payroll_log (batch, tabel, id_baru, id_lama)
    VALUES (v_batch, 'komponen_gaji', v_id::text, r.id::text);
    v_n_komp := v_n_komp + 1;
  END LOOP;

  -- ══ 2. employee_salaries → karyawan_komponen ══
  --    berlaku_selesai diisi otomatis dari baris berikutnya, supaya
  --    tidak melanggar aturan "masa berlaku tidak boleh tumpang tindih".
  FOR r IN
    SELECT es.id, es.guru_id, es.salary_component_id, es.nominal,
           es.berlaku_mulai, es.catatan,
           (LEAD(es.berlaku_mulai) OVER (PARTITION BY es.guru_id, es.salary_component_id
                                         ORDER BY es.berlaku_mulai) - 1) AS berlaku_selesai
    FROM employee_salaries es
    ORDER BY es.guru_id, es.salary_component_id, es.berlaku_mulai
  LOOP
    SELECT id_baru::uuid INTO v_id FROM migrasi_payroll_log
     WHERE batch = v_batch AND tabel = 'komponen_gaji' AND id_lama = r.salary_component_id::text;
    CONTINUE WHEN v_id IS NULL;

    INSERT INTO karyawan_komponen (guru_id, komponen_gaji_id, konfigurasi_override,
                                   berlaku_mulai, berlaku_selesai, aktif)
    VALUES (r.guru_id, v_id, jsonb_build_object('nominal', r.nominal),
            r.berlaku_mulai, r.berlaku_selesai, true)
    RETURNING id INTO v_id;

    INSERT INTO migrasi_payroll_log (batch, tabel, id_baru, id_lama)
    VALUES (v_batch, 'karyawan_komponen', v_id::text, r.id::text);
    v_n_kar := v_n_kar + 1;
  END LOOP;

  -- ══ 3. payrolls → periode_payroll ══
  --    Dibuat sebagai 'draft' dulu supaya slip bisa dimasukkan;
  --    statusnya diselaraskan di langkah 5.
  FOR r IN SELECT * FROM payrolls ORDER BY periode_tahun, periode_bulan LOOP
    -- Lewati kalau periode itu sudah dibuat di sistem baru
    IF EXISTS (SELECT 1 FROM periode_payroll pp
               WHERE pp.unit_id = r.unit_id AND pp.tahun = r.periode_tahun
                 AND pp.bulan = r.periode_bulan) THEN
      v_lewat := v_lewat + 1;
      CONTINUE;
    END IF;

    INSERT INTO periode_payroll (unit_id, tahun, bulan, status, catatan)
    VALUES (r.unit_id, r.periode_tahun, r.periode_bulan, 'draft',
            COALESCE(r.catatan,'') || ' [dipindahkan dari payroll lama]')
    RETURNING id INTO v_id;

    INSERT INTO migrasi_payroll_log (batch, tabel, id_baru, id_lama)
    VALUES (v_batch, 'periode_payroll', v_id::text, r.id::text);
    v_n_per := v_n_per + 1;
  END LOOP;

  -- ══ 4. payroll_items → slip_gaji + slip_gaji_detail ══
  FOR r IN
    SELECT pi.*, p.id AS payroll_lama_id
    FROM payroll_items pi JOIN payrolls p ON p.id = pi.payroll_id
  LOOP
    SELECT id_baru::uuid INTO v_id FROM migrasi_payroll_log
     WHERE batch = v_batch AND tabel = 'periode_payroll' AND id_lama = r.payroll_lama_id::text;
    CONTINUE WHEN v_id IS NULL;   -- periodenya dilewati

    -- Cek selisih antara total lama dan jumlah rinciannya
    SELECT COALESCE(SUM(
             CASE WHEN e->>'tipe' = 'Potongan' THEN -(e->>'nominal')::numeric
                  ELSE (e->>'nominal')::numeric END), 0)
      INTO v_jml_det
    FROM jsonb_array_elements(COALESCE(r.komponen, '[]'::jsonb)) e;

    v_warn := '[]'::jsonb;
    IF v_jml_det <> r.total_netto THEN
      v_warn := v_warn || jsonb_build_object('komponen', 'Migrasi',
        'pesan', 'Jumlah rincian (' || v_jml_det || ') berbeda dengan total gaji lama (' ||
                 r.total_netto || '). Angka total mengikuti data lama.');
    END IF;

    INSERT INTO slip_gaji (periode_payroll_id, guru_id, total_pendapatan, total_potongan,
                           gaji_bersih, snapshot_karyawan, status, peringatan, catatan)
    SELECT v_id, r.guru_id, r.total_bruto, r.total_potongan, r.total_netto,
           jsonb_build_object('nama', g.nama, 'jabatan', g.role,
                              'hari_kerja', r.hari_kerja, 'hari_hadir', r.hari_hadir,
                              'hari_alpha', r.hari_alpha, 'bonus_kpi', r.bonus_kpi),
           'draft', v_warn,
           COALESCE(r.catatan,'') || ' [dipindahkan dari payroll lama]'
    FROM gurus g WHERE g.id = r.guru_id
    RETURNING id INTO v_slip;
    CONTINUE WHEN v_slip IS NULL;

    INSERT INTO migrasi_payroll_log (batch, tabel, id_baru, id_lama)
    VALUES (v_batch, 'slip_gaji', v_slip::text, r.id::text);
    v_n_slip := v_n_slip + 1;

    -- Rincian dari snapshot JSONB lama
    INSERT INTO slip_gaji_detail (slip_gaji_id, komponen_gaji_id, nama_komponen, kategori,
                                  urutan_tampil, nominal, keterangan_hitung, sumber)
    SELECT v_slip, NULL, COALESCE(e->>'nama','(tanpa nama)'),
           CASE WHEN e->>'tipe' = 'Potongan' THEN 'potongan' ELSE 'pendapatan' END,
           (ord * 10)::int, COALESCE((e->>'nominal')::numeric, 0),
           'Dipindahkan dari payroll lama', 'otomatis'
    FROM jsonb_array_elements(COALESCE(r.komponen,'[]'::jsonb)) WITH ORDINALITY AS t(e, ord);
    GET DIAGNOSTICS v_jml_det = ROW_COUNT;
    v_n_det := v_n_det + v_jml_det::int;
  END LOOP;

  -- ══ 5. Selaraskan status periode (setelah slip masuk) ══
  --    Draft→draft, Review→terkunci, Final→dibayar
  FOR r IN
    SELECT l.id_baru::uuid AS id_baru, p.status AS status_lama
    FROM migrasi_payroll_log l
    JOIN payrolls p ON p.id = l.id_lama::uuid
    WHERE l.batch = v_batch AND l.tabel = 'periode_payroll'
  LOOP
    UPDATE slip_gaji SET status = CASE r.status_lama
        WHEN 'Final' THEN 'dibayar' WHEN 'Review' THEN 'terkunci' ELSE 'draft' END
      WHERE periode_payroll_id = r.id_baru;

    UPDATE periode_payroll SET
      status = CASE r.status_lama
        WHEN 'Final' THEN 'dibayar' WHEN 'Review' THEN 'terkunci' ELSE 'draft' END,
      tanggal_kunci = CASE WHEN r.status_lama IN ('Review','Final') THEN now() END,
      tanggal_bayar = CASE WHEN r.status_lama = 'Final' THEN now() END
    WHERE id = r.id_baru;
  END LOOP;

  RAISE NOTICE '=== MIGRASI SELESAI (batch %) ===', v_batch;
  RAISE NOTICE 'Komponen gaji      : % baris', v_n_komp;
  RAISE NOTICE 'Struktur karyawan  : % baris', v_n_kar;
  RAISE NOTICE 'Periode penggajian : % baris (% dilewati karena sudah ada)', v_n_per, v_lewat;
  RAISE NOTICE 'Slip gaji          : % baris', v_n_slip;
  RAISE NOTICE 'Rincian slip       : % baris', v_n_det;
  RAISE NOTICE 'Untuk membatalkan  : jalankan 0008b_rollback_migrasi_payroll.sql';
END $$;

-- ── Ringkasan hasil (lihat tabel ini) ──
SELECT tabel, COUNT(*) AS jumlah_baris_dipindah,
       MIN(dibuat_pada) AS waktu_migrasi
FROM migrasi_payroll_log
GROUP BY tabel
ORDER BY CASE tabel
  WHEN 'komponen_gaji' THEN 1 WHEN 'karyawan_komponen' THEN 2
  WHEN 'periode_payroll' THEN 3 WHEN 'slip_gaji' THEN 4 ELSE 5 END;
