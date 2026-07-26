-- ============================================================
-- 0017  Kunci lokasi absensi (geofencing) — Tahap 0: perekaman senyap
--
-- Masalah: guru check-in dari rumah agar tidak tercatat "Telat",
-- lalu sampai di cabang sudah lewat jam. Status absensi jadi tidak
-- mencerminkan kehadiran fisik, dan ikut mengotori KPI + payroll.
--
-- Migrasi ini memasang seluruh mesinnya, TAPI default modenya
-- 'senyap': lokasi direkam dan jaraknya dihitung, tidak ada satu pun
-- guru yang diblokir dan tidak ada peringatan yang muncul di layar.
-- Tujuannya mengumpulkan data nyata dulu, supaya radius per cabang
-- disetel berdasarkan sebaran titik yang sebenarnya — bukan tebakan.
--
-- Empat mode, berlaku berlapis (yang lebih spesifik menang):
--     shifts.wajib_lokasi = false  → shift ini dikecualikan
--     units.mode_lokasi            → setelan per cabang
--     absensi_pengaturan.mode      → default seluruh sistem
--
--   nonaktif : lokasi tidak diminta sama sekali
--   senyap   : direkam, guru tidak diberi tahu apa pun   ← default awal
--   catat    : absen selalu berhasil, penyimpangan ditandai untuk SPV
--   blokir   : di luar area ditolak, harus diajukan & disetujui SPV
--
-- CATATAN PENTING soal penegakan:
-- Selama ini browser guru menulis LANGSUNG ke tabel attendances lewat
-- policy "att_insert_self". Selama policy itu masih ada, validasi
-- lokasi bisa dilewati siapa pun yang paham DevTools. Policy tersebut
-- SENGAJA DIBIARKAN HIDUP di migrasi ini sebagai masa transisi, supaya
-- HP guru yang masih memegang bundel JS lama (service worker) tidak
-- mendadak gagal absen di pagi hari. Pencabutannya menyusul di migrasi
-- terpisah, setelah dipastikan tidak ada lagi yang memakai jalur lama.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Kolom baru
-- ------------------------------------------------------------

-- units.maps yang sudah ada hanya URL teks dan diisi manual, jadi tidak
-- bisa dipakai menghitung jarak. Link pendek maps.app.goo.gl juga tidak
-- bisa diurai. Karena itu koordinatnya disimpan sebagai angka tersendiri.
ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS latitude     NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS longitude    NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS radius_meter INT DEFAULT 150,
  ADD COLUMN IF NOT EXISTS mode_lokasi  TEXT;

DO $$ BEGIN
  ALTER TABLE public.units ADD CONSTRAINT units_mode_lokasi_chk
    CHECK (mode_lokasi IN ('nonaktif','senyap','catat','blokir'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- NULL = ikut setelan cabang. false = shift ini dikecualikan
-- (mis. dinas luar / kunjungan sekolah).
ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS wajib_lokasi BOOLEAN;

ALTER TABLE public.attendances
  ADD COLUMN IF NOT EXISTS lat_checkin       NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS lng_checkin       NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS akurasi_checkin   NUMERIC(8,1),
  ADD COLUMN IF NOT EXISTS jarak_checkin_m   NUMERIC(10,1),
  ADD COLUMN IF NOT EXISTS lat_checkout      NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS lng_checkout      NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS akurasi_checkout  NUMERIC(8,1),
  ADD COLUMN IF NOT EXISTS jarak_checkout_m  NUMERIC(10,1),
  ADD COLUMN IF NOT EXISTS status_lokasi     TEXT,
  ADD COLUMN IF NOT EXISTS alasan_luar_area  TEXT,
  ADD COLUMN IF NOT EXISTS lokasi_disetujui  BOOLEAN,
  -- Waktu guru MENEKAN tombol absen pertama kali, walau percobaan itu
  -- gagal (GPS lemah, sinyal hilang). Tanpa ini, guru yang sudah sampai
  -- pukul 07:02 tapi baru berhasil absen 07:20 akan tercatat Telat —
  -- persis kebalikan dari tujuan fitur ini dibuat.
  ADD COLUMN IF NOT EXISTS waktu_percobaan_1 TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE public.attendances ADD CONSTRAINT att_status_lokasi_chk
    CHECK (status_lokasi IN ('Dalam Area','Luar Area','GPS Lemah','Tanpa Data'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ------------------------------------------------------------
-- 2. Fungsi identitas & jarak
--    (didefinisikan lebih dulu karena dipakai oleh policy di bawah)
-- ------------------------------------------------------------

-- Owner/Administrator saja — sengaja TIDAK memakai is_admin() yang
-- ikut mencakup Supervisor (lihat alasannya di bagian 3).
CREATE OR REPLACE FUNCTION public.absensi_boleh_atur_global()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT role IN ('Owner','Administrator')
     FROM public.gurus WHERE auth_user_id = auth.uid() LIMIT 1),
    false
  );
$$;

-- Identitas guru yang sedang login.
-- absensi_guru_id() yang sudah ada mencarinya lewat email, sedangkan
-- is_admin() lewat auth_user_id. Keduanya dicoba supaya akun yang
-- salah satu tautannya kosong tetap bisa absen.
CREATE OR REPLACE FUNCTION public.absensi_guru_saya()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT id FROM public.gurus WHERE auth_user_id = auth.uid() LIMIT 1),
    public.absensi_guru_id()
  );
$$;

-- Jarak haversine dalam meter. Sengaja dihitung manual supaya tidak
-- bergantung pada extension cube/earthdistance yang belum tentu
-- diaktifkan di project ini.
CREATE OR REPLACE FUNCTION public.absensi_jarak_meter(
  lat1 NUMERIC, lng1 NUMERIC, lat2 NUMERIC, lng2 NUMERIC
) RETURNS NUMERIC LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN lat1 IS NULL OR lng1 IS NULL OR lat2 IS NULL OR lng2 IS NULL THEN NULL
    ELSE ROUND((
      6371000 * 2 * asin(sqrt(
          power(sin(radians(lat2::float8 - lat1::float8) / 2), 2)
        + cos(radians(lat1::float8)) * cos(radians(lat2::float8))
        * power(sin(radians(lng2::float8 - lng1::float8) / 2), 2)
      ))
    )::numeric, 1)
  END;
$$;


-- ------------------------------------------------------------
-- 3. Setelan global
--
-- Disimpan di tabel sendiri, BUKAN di app_settings. Alasannya:
-- policy "settings_write" pada app_settings memakai is_admin(), yang
-- mencakup Supervisor. Kalau saklar global ditaruh di sana, setiap SPV
-- cabang bisa mematikan kunci lokasi untuk seluruh sistem — terlalu
-- luas untuk saklar sepenting ini. Di tabel ini SPV hanya boleh membaca;
-- wewenang tulisnya khusus Owner/Administrator. SPV tetap bisa mengatur
-- cabangnya sendiri lewat units.mode_lokasi.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.absensi_pengaturan (
  id           BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),  -- singleton
  mode         TEXT    NOT NULL DEFAULT 'senyap'
                       CHECK (mode IN ('nonaktif','senyap','catat','blokir')),
  -- Saklar darurat: menurunkan semua cabang bermode 'blokir' menjadi
  -- 'catat' untuk sementara. Untuk hari ketika ada yang salah — layanan
  -- lokasi ngadat, radius satu cabang keliru setel — supaya tidak perlu
  -- membuka SQL editor sambil ditelepon guru-guru.
  darurat      BOOLEAN NOT NULL DEFAULT false,
  akurasi_maks INT     NOT NULL DEFAULT 150,   -- meter; di atas ini = 'GPS Lemah'
  diubah_pada  TIMESTAMPTZ DEFAULT now(),
  diubah_oleh  TEXT
);

INSERT INTO public.absensi_pengaturan (id) VALUES (true) ON CONFLICT DO NOTHING;

ALTER TABLE public.absensi_pengaturan ENABLE ROW LEVEL SECURITY;

-- Semua yang login perlu bisa membacanya — halaman absensi guru harus
-- tahu modenya sebelum meminta izin lokasi.
DROP POLICY IF EXISTS "absensi_set_select" ON public.absensi_pengaturan;
CREATE POLICY "absensi_set_select" ON public.absensi_pengaturan
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "absensi_set_write" ON public.absensi_pengaturan;
CREATE POLICY "absensi_set_write" ON public.absensi_pengaturan
  FOR UPDATE USING (public.absensi_boleh_atur_global())
             WITH CHECK (public.absensi_boleh_atur_global());


-- ------------------------------------------------------------
-- 4. Log kegagalan absen
--
-- Setiap kegagalan dicatat, bukan sekadar ditampilkan lalu hilang.
-- Tanpa ini tidak akan pernah ketahuan berapa banyak guru yang diam-diam
-- kesulitan — mereka tidak akan lapor, mereka akan cari jalan lain.
-- Log ini juga yang menentukan kapan sebuah cabang layak dinaikkan dari
-- 'catat' ke 'blokir', dan langsung memperlihatkan kalau ada satu HP
-- yang selalu gagal.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.absensi_gagal_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guru_id      TEXT REFERENCES public.gurus(id) ON DELETE CASCADE,
  schedule_id  UUID REFERENCES public.shift_schedules(id) ON DELETE SET NULL,
  unit_id      TEXT REFERENCES public.units(id) ON DELETE SET NULL,
  tanggal      DATE NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Jakarta')::date,
  jenis        TEXT,          -- checkin | checkout
  kode         TEXT NOT NULL, -- LOC_DENIED, LOC_WEAK, OUT_OF_AREA, ...
  pesan        TEXT,
  lat          NUMERIC(10,7),
  lng          NUMERIC(10,7),
  akurasi      NUMERIC(8,1),
  jarak_m      NUMERIC(10,1),
  perangkat    TEXT,          -- userAgent, untuk membedakan iOS/Android
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gagal_log_tanggal ON public.absensi_gagal_log(tanggal);
CREATE INDEX IF NOT EXISTS idx_gagal_log_guru    ON public.absensi_gagal_log(guru_id, tanggal);

ALTER TABLE public.absensi_gagal_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gagal_log_select" ON public.absensi_gagal_log;
CREATE POLICY "gagal_log_select" ON public.absensi_gagal_log FOR SELECT USING (
  guru_id = public.absensi_guru_saya()
  OR (public.absensi_is_admin() AND unit_id = ANY(public.absensi_unit_ids()))
);
-- Tulisnya hanya lewat RPC (SECURITY DEFINER), tidak ada policy INSERT.


-- ------------------------------------------------------------
-- 5. Fungsi penilaian lokasi
-- ------------------------------------------------------------

-- Mode efektif untuk satu shift, hasil tiga lapis setelan + saklar darurat.
CREATE OR REPLACE FUNCTION public.absensi_mode_efektif(p_shift_id UUID)
RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_wajib   BOOLEAN;
  v_unit    TEXT;
  v_mode    TEXT;
  v_darurat BOOLEAN;
BEGIN
  SELECT s.wajib_lokasi, u.mode_lokasi
    INTO v_wajib, v_mode
  FROM public.shifts s
  LEFT JOIN public.units u ON u.id = s.unit_id
  WHERE s.id = p_shift_id;

  -- Pengecualian per shift menang atas apa pun.
  IF v_wajib IS FALSE THEN
    RETURN 'nonaktif';
  END IF;

  IF v_mode IS NULL THEN
    SELECT mode INTO v_mode FROM public.absensi_pengaturan WHERE id;
  END IF;

  SELECT darurat INTO v_darurat FROM public.absensi_pengaturan WHERE id;
  IF COALESCE(v_darurat, false) AND v_mode = 'blokir' THEN
    v_mode := 'catat';
  END IF;

  RETURN COALESCE(v_mode, 'nonaktif');
END;
$$;

-- Menilai satu titik terhadap cabangnya.
-- Mengembalikan: status_lokasi, jarak_m, radius_m, nama unit.
CREATE OR REPLACE FUNCTION public.absensi_nilai_lokasi(
  p_unit_id TEXT, p_lat NUMERIC, p_lng NUMERIC, p_akurasi NUMERIC
) RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_u        RECORD;
  v_jarak    NUMERIC;
  v_akurasi_maks INT;
  v_status   TEXT;
BEGIN
  SELECT nama, latitude, longitude, COALESCE(radius_meter,150) AS radius
    INTO v_u FROM public.units WHERE id = p_unit_id;

  SELECT akurasi_maks INTO v_akurasi_maks FROM public.absensi_pengaturan WHERE id;
  v_akurasi_maks := COALESCE(v_akurasi_maks, 150);

  -- Admin belum mengisi koordinat cabang. Ini bukan salah guru, jadi
  -- tidak boleh diperlakukan sebagai pelanggaran.
  IF v_u.latitude IS NULL OR v_u.longitude IS NULL THEN
    RETURN jsonb_build_object(
      'status_lokasi','Tanpa Data', 'kode','UNIT_NO_COORD',
      'unit_nama', v_u.nama, 'radius_m', v_u.radius);
  END IF;

  IF p_lat IS NULL OR p_lng IS NULL THEN
    RETURN jsonb_build_object(
      'status_lokasi','Tanpa Data', 'kode','LOC_NONE',
      'unit_nama', v_u.nama, 'radius_m', v_u.radius);
  END IF;

  v_jarak := public.absensi_jarak_meter(p_lat, p_lng, v_u.latitude, v_u.longitude);

  IF COALESCE(p_akurasi, 0) > v_akurasi_maks THEN
    -- Pembacaan terlalu kabur untuk dijadikan dasar penilaian. Sering
    -- terjadi di iPhone yang "Lokasi Tepat"-nya mati (akurasi 1–5 km).
    v_status := 'GPS Lemah';
  ELSIF (v_jarak - COALESCE(p_akurasi, 0)) <= v_u.radius THEN
    -- Kelonggaran sebesar akurasi: guru tidak dihukum karena GPS meleset.
    v_status := 'Dalam Area';
  ELSE
    v_status := 'Luar Area';
  END IF;

  RETURN jsonb_build_object(
    'status_lokasi', v_status,
    'kode', CASE v_status WHEN 'Dalam Area' THEN 'OK'
                          WHEN 'GPS Lemah'  THEN 'LOC_WEAK'
                          ELSE 'OUT_OF_AREA' END,
    'jarak_m',    v_jarak,
    'radius_m',   v_u.radius,
    'unit_nama',  v_u.nama);
END;
$$;


-- ------------------------------------------------------------
-- 6. RPC absensi
--
-- Mulai sekarang absensi ditulis lewat sini, bukan INSERT langsung dari
-- browser. Selain menutup celah pemalsuan lokasi, waktunya juga diambil
-- dari now() milik server — sekalian menutup celah manipulasi jam HP
-- yang selama ini juga terbuka.
--
-- Kegagalan dikembalikan sebagai JSON berkode, BUKAN dilempar sebagai
-- exception, supaya aplikasi bisa menampilkan pesan yang bisa dikerjakan
-- guru ("nyalakan WiFi", "aktifkan Lokasi Tepat") alih-alih pesan error
-- database yang tidak berarti apa-apa buat mereka.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.absen_check_in(
  p_schedule_id   UUID,
  p_lat           NUMERIC DEFAULT NULL,
  p_lng           NUMERIC DEFAULT NULL,
  p_akurasi       NUMERIC DEFAULT NULL,
  p_foto          TEXT    DEFAULT NULL,
  p_alasan        TEXT    DEFAULT NULL,
  p_percobaan_1   TIMESTAMPTZ DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_guru     TEXT;
  v_ss       RECORD;
  v_mode     TEXT;
  v_nilai    JSONB;
  v_status   TEXT;
  v_now      TIMESTAMPTZ := now();
  v_wib      TIME;
  v_tanggal  DATE;
  v_batas_min INT;
  v_kini_min  INT;
  v_id       UUID;
  v_slok     TEXT;
BEGIN
  v_guru := public.absensi_guru_saya();
  IF v_guru IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'kode','NO_IDENTITY',
      'pesan','Akun Anda belum tertaut ke data guru. Hubungi admin.');
  END IF;

  SELECT ss.id, ss.guru_id, ss.dialihkan, ss.shift_id,
         s.unit_id, s.jam_mulai, s.toleransi_menit, s.wajib_foto
    INTO v_ss
  FROM public.shift_schedules ss
  JOIN public.shifts s ON s.id = ss.shift_id
  WHERE ss.id = p_schedule_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'kode','NO_SCHEDULE',
      'pesan','Jadwal shift tidak ditemukan.');
  END IF;

  IF v_ss.guru_id <> v_guru THEN
    RETURN jsonb_build_object('ok', false, 'kode','NOT_YOURS',
      'pesan','Jadwal ini bukan milik Anda.');
  END IF;

  IF v_ss.dialihkan THEN
    RETURN jsonb_build_object('ok', false, 'kode','SHIFT_DIALIHKAN',
      'pesan','Shift ini sudah ditukar dengan guru lain, jadi tidak perlu di-check-in.');
  END IF;

  v_wib     := (v_now AT TIME ZONE 'Asia/Jakarta')::time;
  v_tanggal := (v_now AT TIME ZONE 'Asia/Jakarta')::date;

  IF EXISTS (SELECT 1 FROM public.attendances
             WHERE shift_schedule_id = p_schedule_id AND check_in IS NOT NULL) THEN
    RETURN jsonb_build_object('ok', false, 'kode','ALREADY_CHECKED_IN',
      'pesan','Anda sudah check-in untuk shift ini.');
  END IF;

  -- Status telat — aturannya sengaja dibuat sama persis dengan yang
  -- selama ini dipakai di aplikasi, supaya hasil KPI dan payroll tidak
  -- ikut berubah gara-gara migrasi ini.
  --
  -- Dihitung dalam menit, BUKAN sebagai TIME + INTERVAL: penjumlahan TIME
  -- membungkus lewat tengah malam (23:50 + 15 mnt → 00:05), sehingga shift
  -- malam yang absen 23:55 akan salah dinilai Telat.
  v_batas_min := EXTRACT(HOUR FROM v_ss.jam_mulai)::int * 60
               + EXTRACT(MINUTE FROM v_ss.jam_mulai)::int
               + COALESCE(v_ss.toleransi_menit, 15);
  v_kini_min  := EXTRACT(HOUR FROM v_wib)::int * 60 + EXTRACT(MINUTE FROM v_wib)::int;
  v_status    := CASE WHEN v_kini_min <= v_batas_min THEN 'Hadir' ELSE 'Telat' END;

  v_mode := public.absensi_mode_efektif(v_ss.shift_id);

  IF v_mode = 'nonaktif' THEN
    v_slok := NULL;
    v_nilai := '{}'::jsonb;
  ELSE
    v_nilai := public.absensi_nilai_lokasi(v_ss.unit_id, p_lat, p_lng, p_akurasi);
    v_slok  := v_nilai->>'status_lokasi';

    -- Penolakan hanya terjadi di mode 'blokir'. Mode 'senyap' dan
    -- 'catat' selalu meloloskan absen — bedanya cuma pada apa yang
    -- ditampilkan ke guru, yang diputuskan di sisi aplikasi.
    IF v_mode = 'blokir' THEN
      IF v_slok = 'Luar Area' AND COALESCE(TRIM(p_alasan), '') = '' THEN
        RETURN jsonb_build_object('ok', false, 'kode','OUT_OF_AREA',
          'pesan', format('Anda berada %s m dari %s (batas %s m), jadi absen belum bisa diproses.',
                          v_nilai->>'jarak_m', v_nilai->>'unit_nama', v_nilai->>'radius_m'),
          'jarak_m', v_nilai->'jarak_m', 'radius_m', v_nilai->'radius_m',
          'unit_nama', v_nilai->>'unit_nama', 'boleh_ajukan', true);
      END IF;

      -- Pembacaan kabur juga bisa diajukan dengan alasan: kalau tidak,
      -- guru yang HP-nya memang selalu buruk sinyalnya tidak akan pernah
      -- bisa absen sama sekali.
      IF v_slok = 'GPS Lemah' AND COALESCE(TRIM(p_alasan), '') = '' THEN
        RETURN jsonb_build_object('ok', false, 'kode','LOC_WEAK',
          'pesan', format('Sinyal GPS lemah (meleset ±%s m), lokasi Anda belum bisa dipastikan.', p_akurasi),
          'akurasi', p_akurasi, 'boleh_ajukan', true);
      END IF;

      -- Koordinat cabang belum diisi admin — jangan hukum gurunya,
      -- absen tetap diloloskan dan ditandai 'Tanpa Data'.
      IF v_slok = 'Tanpa Data' AND v_nilai->>'kode' = 'LOC_NONE' THEN
        RETURN jsonb_build_object('ok', false, 'kode','LOC_REQUIRED',
          'pesan','Absen di cabang ini wajib menyertakan lokasi. Izinkan akses lokasi lalu coba lagi.');
      END IF;
    END IF;
  END IF;

  INSERT INTO public.attendances (
    guru_id, shift_schedule_id, unit_id, tanggal, check_in, foto_checkin, status,
    lat_checkin, lng_checkin, akurasi_checkin, jarak_checkin_m,
    status_lokasi, alasan_luar_area, lokasi_disetujui, waktu_percobaan_1
  ) VALUES (
    v_guru, p_schedule_id, v_ss.unit_id, v_tanggal, v_now, p_foto, v_status,
    p_lat, p_lng, p_akurasi, (v_nilai->>'jarak_m')::numeric,
    v_slok, NULLIF(TRIM(COALESCE(p_alasan,'')), ''),
    -- Absen di luar area menunggu verifikasi SPV; sisanya tidak perlu.
    CASE WHEN v_slok = 'Luar Area' AND v_mode IN ('catat','blokir') THEN NULL ELSE true END,
    p_percobaan_1
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'ok', true, 'kode','OK', 'attendance_id', v_id,
    'status', v_status, 'mode', v_mode,
    'status_lokasi', v_slok,
    'jarak_m',   v_nilai->'jarak_m',
    'radius_m',  v_nilai->'radius_m',
    'unit_nama', v_nilai->>'unit_nama');
END;
$$;


CREATE OR REPLACE FUNCTION public.absen_check_out(
  p_attendance_id UUID,
  p_lat           NUMERIC DEFAULT NULL,
  p_lng           NUMERIC DEFAULT NULL,
  p_akurasi       NUMERIC DEFAULT NULL,
  p_foto          TEXT    DEFAULT NULL,
  p_alasan        TEXT    DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_guru   TEXT;
  v_att    RECORD;
  v_shift  UUID;
  v_mode   TEXT;
  v_nilai  JSONB := '{}'::jsonb;
  v_slok   TEXT;
  v_now    TIMESTAMPTZ := now();
BEGIN
  v_guru := public.absensi_guru_saya();
  IF v_guru IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'kode','NO_IDENTITY',
      'pesan','Akun Anda belum tertaut ke data guru. Hubungi admin.');
  END IF;

  SELECT a.id, a.guru_id, a.unit_id, a.check_in, a.check_out, ss.shift_id
    INTO v_att
  FROM public.attendances a
  LEFT JOIN public.shift_schedules ss ON ss.id = a.shift_schedule_id
  WHERE a.id = p_attendance_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'kode','NOT_FOUND',
      'pesan','Data absensi tidak ditemukan.');
  END IF;

  IF v_att.guru_id <> v_guru THEN
    RETURN jsonb_build_object('ok', false, 'kode','NOT_YOURS',
      'pesan','Absensi ini bukan milik Anda.');
  END IF;

  IF v_att.check_out IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'kode','ALREADY_CHECKED_OUT',
      'pesan','Anda sudah check-out untuk shift ini.');
  END IF;

  v_mode := COALESCE(public.absensi_mode_efektif(v_att.shift_id), 'nonaktif');

  -- Check-out ikut dikunci. Kalau hanya check-in yang dijaga, celahnya
  -- tinggal pindah: pulang lebih awal lalu check-out dari rumah.
  IF v_mode <> 'nonaktif' THEN
    v_nilai := public.absensi_nilai_lokasi(v_att.unit_id, p_lat, p_lng, p_akurasi);
    v_slok  := v_nilai->>'status_lokasi';

    IF v_mode = 'blokir' AND v_slok = 'Luar Area'
       AND COALESCE(TRIM(p_alasan), '') = '' THEN
      RETURN jsonb_build_object('ok', false, 'kode','OUT_OF_AREA',
        'pesan', format('Anda berada %s m dari %s (batas %s m), jadi check-out belum bisa diproses.',
                        v_nilai->>'jarak_m', v_nilai->>'unit_nama', v_nilai->>'radius_m'),
        'jarak_m', v_nilai->'jarak_m', 'radius_m', v_nilai->'radius_m',
        'unit_nama', v_nilai->>'unit_nama', 'boleh_ajukan', true);
    END IF;
  END IF;

  UPDATE public.attendances SET
    check_out        = v_now,
    foto_checkout    = COALESCE(p_foto, foto_checkout),
    lat_checkout     = p_lat,
    lng_checkout     = p_lng,
    akurasi_checkout = p_akurasi,
    jarak_checkout_m = (v_nilai->>'jarak_m')::numeric,
    durasi_menit     = CASE WHEN check_in IS NOT NULL
                            THEN EXTRACT(EPOCH FROM (v_now - check_in))::int / 60 END,
    alasan_luar_area = COALESCE(NULLIF(TRIM(COALESCE(p_alasan,'')), ''), alasan_luar_area)
  WHERE id = p_attendance_id;

  RETURN jsonb_build_object(
    'ok', true, 'kode','OK', 'mode', v_mode,
    'status_lokasi', v_slok,
    'jarak_m',   v_nilai->'jarak_m',
    'radius_m',  v_nilai->'radius_m',
    'unit_nama', v_nilai->>'unit_nama');
END;
$$;


-- Dipanggil aplikasi setiap kali guru gagal absen, termasuk kegagalan
-- yang terjadi murni di HP (izin ditolak, GPS tidak dapat sinyal) dan
-- tidak pernah sampai ke server.
CREATE OR REPLACE FUNCTION public.absen_catat_gagal(
  p_kode        TEXT,
  p_pesan       TEXT    DEFAULT NULL,
  p_schedule_id UUID    DEFAULT NULL,
  p_jenis       TEXT    DEFAULT NULL,
  p_lat         NUMERIC DEFAULT NULL,
  p_lng         NUMERIC DEFAULT NULL,
  p_akurasi     NUMERIC DEFAULT NULL,
  p_perangkat   TEXT    DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_guru TEXT := public.absensi_guru_saya();
  v_unit TEXT;
  v_jarak NUMERIC;
BEGIN
  IF v_guru IS NULL THEN RETURN; END IF;

  SELECT s.unit_id INTO v_unit
  FROM public.shift_schedules ss JOIN public.shifts s ON s.id = ss.shift_id
  WHERE ss.id = p_schedule_id;

  IF v_unit IS NOT NULL AND p_lat IS NOT NULL THEN
    SELECT public.absensi_jarak_meter(p_lat, p_lng, u.latitude, u.longitude)
      INTO v_jarak FROM public.units u WHERE u.id = v_unit;
  END IF;

  INSERT INTO public.absensi_gagal_log
    (guru_id, schedule_id, unit_id, jenis, kode, pesan, lat, lng, akurasi, jarak_m, perangkat)
  VALUES
    (v_guru, p_schedule_id, v_unit, p_jenis, p_kode, LEFT(COALESCE(p_pesan,''), 500),
     p_lat, p_lng, p_akurasi, v_jarak, LEFT(COALESCE(p_perangkat,''), 300));
END;
$$;


-- ------------------------------------------------------------
-- 7. Hak akses
-- ------------------------------------------------------------

GRANT EXECUTE ON FUNCTION public.absen_check_in(UUID,NUMERIC,NUMERIC,NUMERIC,TEXT,TEXT,TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.absen_check_out(UUID,NUMERIC,NUMERIC,NUMERIC,TEXT,TEXT)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.absen_catat_gagal(TEXT,TEXT,UUID,TEXT,NUMERIC,NUMERIC,NUMERIC,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.absensi_mode_efektif(UUID)                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.absensi_nilai_lokasi(TEXT,NUMERIC,NUMERIC,NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.absensi_jarak_meter(NUMERIC,NUMERIC,NUMERIC,NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.absensi_guru_saya()                              TO authenticated;
GRANT EXECUTE ON FUNCTION public.absensi_boleh_atur_global()                      TO authenticated;


-- ------------------------------------------------------------
-- 8. Setelah migrasi ini
--
--   1. Isi titik & radius tiap cabang lewat menu Unit / Cabang.
--      Selama koordinat kosong, absen tetap jalan dan ditandai
--      'Tanpa Data' — tidak ada yang terkunci.
--   2. Biarkan mode 'senyap' 1–2 minggu, lalu periksa sebarannya:
--
--        SELECT u.nama,
--               COUNT(*)                              AS total,
--               ROUND(AVG(a.jarak_checkin_m))         AS rata2_m,
--               MAX(a.jarak_checkin_m)                AS terjauh_m,
--               COUNT(*) FILTER (WHERE a.jarak_checkin_m > 500) AS di_luar_500m
--        FROM attendances a JOIN units u ON u.id = a.unit_id
--        WHERE a.jarak_checkin_m IS NOT NULL
--        GROUP BY u.nama;
--
--      Dari situ radius tiap cabang disetel, baru modenya dinaikkan
--      ke 'catat'. Jangan langsung ke 'blokir'.
--   3. Pantau juga yang gagal:
--        SELECT kode, COUNT(*) FROM absensi_gagal_log GROUP BY kode ORDER BY 2 DESC;
-- ------------------------------------------------------------
