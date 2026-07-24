-- ============================================================
-- 0009 — FITUR LISENSI + ROBOT PENGINGAT RELISENSI
-- ============================================================
--
-- APA ISI FILE INI (bahasa awam):
--   1. Membuat 3 tabel BARU  : lisensi, lisensi_perpanjangan, lisensi_reminder_log
--   2. Membuat 1 "layar hitung" (view) : v_lisensi_status
--   3. Membuat 1 robot        : buat_task_relisensi()
--   4. Menyalakan jadwal robot tiap hari jam 01:00 WIB
--   5. Menambah 1 label baru "Lisensi" di Task Management
--
-- APA YANG TIDAK DISENTUH:
--   Tidak ada tabel lama yang diubah/dihapus. Tidak ada kolom lama yang diubah.
--   Ke tabel `tasks` fitur ini HANYA menambah baris, tidak mengubah strukturnya.
--   Satu-satunya tambahan ke data lama: 1 baris label bernama 'Lisensi'
--   di tabel task_labels (dipakai sebagai penanda "task ini lahir dari fitur Lisensi").
--
-- AMAN DIJALANKAN BERULANG (IF NOT EXISTS / ON CONFLICT / CREATE OR REPLACE).
--
-- JALANKAN DI PROJECT SALINAN (STAGING) DULU, JANGAN DI PRODUCTION.
--
-- ------------------------------------------------------------
-- CARA MEMBATALKAN (ROLLBACK) KALAU ADA MASALAH:
-- Jalankan blok di bawah ini. Ini MENGHAPUS seluruh data lisensi —
-- backup dulu lewat Dashboard → Database → Backups kalau datanya sudah dipakai.
--
--   SELECT cron.unschedule('pengingat-relisensi-harian');
--   DROP FUNCTION IF EXISTS public.buat_task_relisensi();
--   DROP VIEW     IF EXISTS public.v_lisensi_status;
--   DROP TABLE    IF EXISTS public.lisensi_reminder_log;
--   DROP TABLE    IF EXISTS public.lisensi_perpanjangan;
--   DROP TABLE    IF EXISTS public.lisensi;
--   DROP FUNCTION IF EXISTS public.lisensi_unit_id(UUID);
--   DROP FUNCTION IF EXISTS public.lisensi_is_owner();
--   DROP FUNCTION IF EXISTS public.lisensi_tanggal_di_tahun(DATE, INT);
--   -- label 'Lisensi' boleh dibiarkan, tidak mengganggu apa pun.
-- ============================================================


-- ============================================================
-- 1. ALAT BANTU TANGGAL — menangani kasus 29 Februari
-- ============================================================
-- Mengambil tanggal & bulan dari sebuah tanggal, lalu memindahkannya ke tahun lain.
-- Kalau tanggal aslinya 29 Februari dan tahun tujuannya BUKAN tahun kabisat,
-- dimundurkan ke 28 Februari (kalau tidak, Postgres akan error "date out of range").
CREATE OR REPLACE FUNCTION public.lisensi_tanggal_di_tahun(p_tgl DATE, p_tahun INT)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_bulan INT := EXTRACT(MONTH FROM p_tgl)::INT;
  v_hari  INT := EXTRACT(DAY   FROM p_tgl)::INT;
BEGIN
  IF v_bulan = 2 AND v_hari = 29 THEN
    IF (p_tahun % 4 = 0 AND p_tahun % 100 <> 0) OR (p_tahun % 400 = 0) THEN
      v_hari := 29;   -- tahun kabisat, aman
    ELSE
      v_hari := 28;   -- bukan kabisat → mundurkan
    END IF;
  END IF;
  RETURN make_date(p_tahun, v_bulan, v_hari);
END $$;


-- ============================================================
-- 2. TABEL LISENSI (data induk)
-- ============================================================
-- Catatan: kolom cabang di aplikasi ini bernama `unit_id` dan bertipe TEXT
-- (mengikuti tabel units yang sudah ada, contoh isi: 'UNIT-001').
CREATE TABLE IF NOT EXISTS public.lisensi (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nama_lisensi     TEXT        NOT NULL,                                    -- contoh: Ahe / Aga / Ala
  unit_id          TEXT        NOT NULL REFERENCES public.units(id) ON DELETE RESTRICT,
  tgl_jatuh_tempo  DATE        NOT NULL,                                    -- tanggal acuan, berulang tiap tahun
  no_unit          TEXT,
  link_portal      TEXT,
  username         TEXT,
  password_catatan TEXT,       -- CATATAN kredensial portal LUAR (bukan password login aplikasi ini).
                               -- JANGAN pernah dipakai untuk autentikasi apa pun di aplikasi ini.
  catatan          TEXT,
  aktif            BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Nama lisensi yang sama boleh muncul di unit berbeda (itu lisensi yang berbeda),
-- tapi tidak boleh dobel di unit yang sama.
CREATE UNIQUE INDEX IF NOT EXISTS uq_lisensi_nama_unit
  ON public.lisensi (nama_lisensi, unit_id);

CREATE INDEX IF NOT EXISTS idx_lisensi_jatuh_tempo ON public.lisensi (tgl_jatuh_tempo);
CREATE INDEX IF NOT EXISTS idx_lisensi_aktif       ON public.lisensi (aktif);

-- Pakai fungsi trigger standar yang SUDAH ADA di proyek ini (update_modified_column).
-- Jaring pengaman: kalau fungsi itu ternyata belum ada di project ini, buatkan.
-- Kalau sudah ada, TIDAK diubah sama sekali.
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'update_modified_column'
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION public.update_modified_column()
      RETURNS TRIGGER LANGUAGE plpgsql AS $body$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END $body$;
    $fn$;
  END IF;
END $do$;

DROP TRIGGER IF EXISTS trg_lisensi_updated_at ON public.lisensi;
CREATE TRIGGER trg_lisensi_updated_at
  BEFORE UPDATE ON public.lisensi
  FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();


-- ============================================================
-- 3. TABEL RIWAYAT PERPANJANGAN
-- ============================================================
CREATE TABLE IF NOT EXISTS public.lisensi_perpanjangan (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lisensi_id     UUID        NOT NULL REFERENCES public.lisensi(id) ON DELETE CASCADE,
  tahun          INT         NOT NULL,
  tgl_perpanjang DATE,
  dicatat_oleh   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  catatan        TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_lisensi_perpanjangan_tahun CHECK (tahun BETWEEN 2000 AND 2100)
);

-- Satu lisensi hanya boleh punya satu catatan perpanjangan per tahun.
CREATE UNIQUE INDEX IF NOT EXISTS uq_lisensi_perpanjangan_tahun
  ON public.lisensi_perpanjangan (lisensi_id, tahun);


-- ============================================================
-- 4. TABEL LOG PENGINGAT (pengaman anti-tugas-dobel)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.lisensi_reminder_log (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lisensi_id UUID        NOT NULL REFERENCES public.lisensi(id) ON DELETE CASCADE,
  tahun      INT         NOT NULL,                                        -- tahun jatuh tempo yang diingatkan
  task_id    UUID        REFERENCES public.tasks(id) ON DELETE SET NULL,  -- task dihapus orang → log TETAP ada
  dibuat_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- WAJIB: robot jalan tiap hari. Tanpa kunci ini, task yang sama akan dibuat ulang
-- setiap hari selama 60 hari berturut-turut.
CREATE UNIQUE INDEX IF NOT EXISTS uq_lisensi_reminder_log
  ON public.lisensi_reminder_log (lisensi_id, tahun);


-- ============================================================
-- 5. ALAT BANTU HAK AKSES
-- ============================================================
-- Cek apakah yang login ber-role Owner (bisa lihat semua unit).
CREATE OR REPLACE FUNCTION public.lisensi_is_owner()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role = 'Owner' FROM public.gurus WHERE auth_user_id = auth.uid() LIMIT 1),
    false
  );
$$;

-- Ambil unit dari sebuah lisensi (dipakai policy tabel riwayat & log,
-- supaya tidak terjadi "kejar-kejaran" aturan antar tabel).
CREATE OR REPLACE FUNCTION public.lisensi_unit_id(p_lisensi_id UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT unit_id FROM public.lisensi WHERE id = p_lisensi_id LIMIT 1;
$$;


-- ============================================================
-- 6. ATURAN AKSES (RLS)
-- ============================================================
-- Pola mengikuti Task Management yang sudah ada:
--   Owner            → semua unit
--   Admin (fungsi absensi_is_admin: Owner/Administrator/Supervisor)
--                    → hanya unit tempat dia terdaftar di guru_units
--   Role lain        → tidak ada akses sama sekali
-- Hapus data (DELETE) khusus Owner.

ALTER TABLE public.lisensi              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lisensi_perpanjangan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lisensi_reminder_log ENABLE ROW LEVEL SECURITY;

-- ---------- lisensi ----------
DROP POLICY IF EXISTS "lis_select" ON public.lisensi;
DROP POLICY IF EXISTS "lis_insert" ON public.lisensi;
DROP POLICY IF EXISTS "lis_update" ON public.lisensi;
DROP POLICY IF EXISTS "lis_delete" ON public.lisensi;

CREATE POLICY "lis_select" ON public.lisensi FOR SELECT
  USING (
    public.lisensi_is_owner()
    OR (public.absensi_is_admin() AND unit_id = ANY(public.absensi_unit_ids()))
  );

CREATE POLICY "lis_insert" ON public.lisensi FOR INSERT
  WITH CHECK (
    public.lisensi_is_owner()
    OR (public.absensi_is_admin() AND unit_id = ANY(public.absensi_unit_ids()))
  );

CREATE POLICY "lis_update" ON public.lisensi FOR UPDATE
  USING (
    public.lisensi_is_owner()
    OR (public.absensi_is_admin() AND unit_id = ANY(public.absensi_unit_ids()))
  )
  WITH CHECK (
    public.lisensi_is_owner()
    OR (public.absensi_is_admin() AND unit_id = ANY(public.absensi_unit_ids()))
  );

CREATE POLICY "lis_delete" ON public.lisensi FOR DELETE
  USING (public.lisensi_is_owner());

-- ---------- lisensi_perpanjangan ----------
DROP POLICY IF EXISTS "lisp_select" ON public.lisensi_perpanjangan;
DROP POLICY IF EXISTS "lisp_insert" ON public.lisensi_perpanjangan;
DROP POLICY IF EXISTS "lisp_update" ON public.lisensi_perpanjangan;
DROP POLICY IF EXISTS "lisp_delete" ON public.lisensi_perpanjangan;

CREATE POLICY "lisp_select" ON public.lisensi_perpanjangan FOR SELECT
  USING (
    public.lisensi_is_owner()
    OR (public.absensi_is_admin() AND public.lisensi_unit_id(lisensi_id) = ANY(public.absensi_unit_ids()))
  );

CREATE POLICY "lisp_insert" ON public.lisensi_perpanjangan FOR INSERT
  WITH CHECK (
    public.lisensi_is_owner()
    OR (public.absensi_is_admin() AND public.lisensi_unit_id(lisensi_id) = ANY(public.absensi_unit_ids()))
  );

CREATE POLICY "lisp_update" ON public.lisensi_perpanjangan FOR UPDATE
  USING (
    public.lisensi_is_owner()
    OR (public.absensi_is_admin() AND public.lisensi_unit_id(lisensi_id) = ANY(public.absensi_unit_ids()))
  )
  WITH CHECK (
    public.lisensi_is_owner()
    OR (public.absensi_is_admin() AND public.lisensi_unit_id(lisensi_id) = ANY(public.absensi_unit_ids()))
  );

CREATE POLICY "lisp_delete" ON public.lisensi_perpanjangan FOR DELETE
  USING (public.lisensi_is_owner());

-- ---------- lisensi_reminder_log ----------
-- HANYA BOLEH DIBACA. Tidak ada policy INSERT/UPDATE/DELETE sama sekali,
-- jadi aplikasi (frontend) tidak akan pernah bisa menulis ke sini.
-- Yang boleh menulis cuma robot buat_task_relisensi() (SECURITY DEFINER).
DROP POLICY IF EXISTS "lisrl_select" ON public.lisensi_reminder_log;

CREATE POLICY "lisrl_select" ON public.lisensi_reminder_log FOR SELECT
  USING (
    public.lisensi_is_owner()
    OR (public.absensi_is_admin() AND public.lisensi_unit_id(lisensi_id) = ANY(public.absensi_unit_ids()))
  );


-- Izin dasar untuk user yang sudah login. Ini HANYA membuka pintu;
-- yang menentukan siapa melihat baris apa tetap aturan RLS di atas.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lisensi              TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lisensi_perpanjangan TO authenticated;
GRANT SELECT                         ON public.lisensi_reminder_log TO authenticated;


-- ============================================================
-- 7. VIEW v_lisensi_status — "layar hitung", tidak menyimpan data
-- ============================================================
-- PENTING — security_invoker = on:
--   Tanpa setelan ini, view akan MENEMBUS pembatasan per-unit; Administrator
--   Sarirejo bisa ikut melihat lisensi Magelung lewat view walaupun tabel aslinya
--   sudah terkunci. Dengan setelan ini, view ikut aturan orang yang membukanya.
--   (Butuh Postgres 15+. Kalau muncul error "unrecognized parameter", berhenti
--    dan beri tahu — berarti versi Postgres project ini lebih tua.)
--
-- CATATAN: kolom `password_catatan` SENGAJA TIDAK ikut di view ini, karena view
-- inilah yang dipakai halaman DAFTAR lisensi. Kredensial hanya dibaca dari tabel
-- `lisensi` langsung di halaman detail, setelah tombol "Lihat" diklik.
--
-- Rumus tahun_target:
--   tahun_A = tahun dari ulang-tahun jatuh tempo terdekat yang BELUM lewat
--   tahun_B = tahun perpanjangan terakhir + 1 (diabaikan kalau belum ada riwayat)
--   tahun_target = yang LEBIH BESAR di antara keduanya
-- Kenapa: ada lisensi yang diperpanjang lebih awal (contoh Ala/Sarirejo, perpanjangan
-- 2026 sudah tercatat padahal 27 Agustus 2026 belum lewat → jawaban benar 2027).
DROP VIEW IF EXISTS public.v_lisensi_status;

CREATE VIEW public.v_lisensi_status
WITH (security_invoker = on)
AS
SELECT
  l.id,
  l.nama_lisensi,
  l.unit_id,
  u.nama                                                              AS nama_unit,
  l.tgl_jatuh_tempo,
  l.no_unit,
  l.link_portal,
  l.username,
  l.catatan,
  l.aktif,
  l.created_at,
  l.updated_at,
  t.tahun_target,
  public.lisensi_tanggal_di_tahun(l.tgl_jatuh_tempo, t.tahun_target)  AS jatuh_tempo_berikutnya,
  (public.lisensi_tanggal_di_tahun(l.tgl_jatuh_tempo, t.tahun_target) - h.hari_ini) AS sisa_hari,
  EXISTS (
    SELECT 1 FROM public.lisensi_perpanjangan p
    WHERE p.lisensi_id = l.id AND p.tahun = t.tahun_target
  )                                                                   AS sudah_perpanjang_tahun_target
FROM public.lisensi l
JOIN public.units u ON u.id = l.unit_id
-- "hari ini" versi WIB, bukan UTC
CROSS JOIN LATERAL (
  SELECT (now() AT TIME ZONE 'Asia/Jakarta')::date AS hari_ini
) h
CROSS JOIN LATERAL (
  SELECT CASE
           WHEN public.lisensi_tanggal_di_tahun(l.tgl_jatuh_tempo, EXTRACT(YEAR FROM h.hari_ini)::INT) >= h.hari_ini
           THEN EXTRACT(YEAR FROM h.hari_ini)::INT
           ELSE EXTRACT(YEAR FROM h.hari_ini)::INT + 1
         END AS tahun_a,
         (SELECT MAX(p.tahun) + 1 FROM public.lisensi_perpanjangan p WHERE p.lisensi_id = l.id) AS tahun_b
) a
CROSS JOIN LATERAL (
  SELECT GREATEST(a.tahun_a, COALESCE(a.tahun_b, a.tahun_a)) AS tahun_target
) t;

GRANT SELECT ON public.v_lisensi_status TO authenticated;


-- ============================================================
-- 8. LABEL PENANDA di Task Management
-- ============================================================
-- Menambah 1 BARIS label (bukan mengubah struktur tabel), supaya task yang
-- lahir dari fitur ini gampang dikenali & difilter di papan Kanban.
INSERT INTO public.task_labels (nama, warna)
VALUES ('Lisensi', '#0ea5e9')
ON CONFLICT (nama) DO NOTHING;


-- ============================================================
-- 9. ROBOT PENGINGAT — buat_task_relisensi()
-- ============================================================
-- Mengembalikan JUMLAH task yang berhasil dibuat, supaya bisa dicek manual.
-- Aman dijalankan berkali-kali dalam sehari (idempoten).
CREATE OR REPLACE FUNCTION public.buat_task_relisensi()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r           RECORD;
  v_log_id    UUID;
  v_task_id   UUID;
  v_stage_id  UUID;
  v_label_id  UUID;
  v_judul     TEXT;
  v_deskripsi TEXT;
  v_jumlah    INT := 0;
BEGIN
  -- Task masuk ke kolom Kanban paling kiri (urutan terkecil, biasanya "Backlog").
  SELECT id INTO v_stage_id FROM public.task_stages ORDER BY urutan LIMIT 1;
  SELECT id INTO v_label_id FROM public.task_labels WHERE nama = 'Lisensi' LIMIT 1;

  FOR r IN
    SELECT *
    FROM public.v_lisensi_status
    WHERE aktif = true
      AND sisa_hari <= 60                       -- pakai <=, bukan =, supaya tahan kalau cron mati sehari
      AND sudah_perpanjang_tahun_target = false -- sudah diperpanjang → tidak perlu diingatkan
    ORDER BY jatuh_tempo_berikutnya
  LOOP
    -- Kunci dulu, baru bikin task. Kalau log-nya sudah ada (berarti sudah pernah
    -- diingatkan), lewati — ini yang mencegah task dobel.
    v_log_id := NULL;

    INSERT INTO public.lisensi_reminder_log (lisensi_id, tahun)
    VALUES (r.id, r.tahun_target)
    ON CONFLICT (lisensi_id, tahun) DO NOTHING
    RETURNING id INTO v_log_id;

    CONTINUE WHEN v_log_id IS NULL;

    v_judul :=
      CASE WHEN r.sisa_hari < 0 THEN 'TERLAMBAT — ' ELSE '' END
      || 'Perpanjang lisensi ' || r.nama_lisensi || ' — ' || r.nama_unit;

    -- Username & password SENGAJA tidak dimasukkan ke deskripsi task,
    -- karena task bisa dilihat orang yang tidak berhak melihat kredensial.
    v_deskripsi :=
         'Unit          : ' || r.nama_unit
      || E'\nNo Unit       : ' || COALESCE(r.no_unit, '-')
      || E'\nLink portal   : ' || COALESCE(r.link_portal, '-')
      || E'\nJatuh tempo   : ' || to_char(r.jatuh_tempo_berikutnya, 'DD-MM-YYYY')
      || E'\nSisa hari     : ' || r.sisa_hari::TEXT
      || E'\n\nKredensial ada di menu Lisensi.'
      || E'\n(Task ini dibuat otomatis oleh pengingat relisensi.)';

    INSERT INTO public.tasks (judul, deskripsi, unit_id, stage_id, prioritas, deadline, label_id, dibuat_oleh)
    VALUES (
      v_judul,
      v_deskripsi,
      r.unit_id,
      v_stage_id,
      'Tinggi',
      -- deadline disimpan sebagai jam 23:59 WIB pada hari jatuh tempo,
      -- supaya tidak tampil mundur sehari akibat beda zona waktu.
      (r.jatuh_tempo_berikutnya + TIME '23:59') AT TIME ZONE 'Asia/Jakarta',
      v_label_id,
      NULL   -- dibuat robot, bukan orang
    )
    RETURNING id INTO v_task_id;

    -- Penerima tugas: semua Owner + Administrator yang terdaftar di unit lisensi ini.
    INSERT INTO public.task_assignees (task_id, guru_id)
    SELECT v_task_id, g.id
    FROM public.gurus g
    WHERE g.status = 'Aktif'
      AND (
        g.role = 'Owner'
        OR (
          g.role = 'Administrator'
          AND EXISTS (
            SELECT 1 FROM public.guru_units gu
            WHERE gu.guru_id = g.id AND gu.unit_id = r.unit_id
          )
        )
      )
    ON CONFLICT (task_id, guru_id) DO NOTHING;

    UPDATE public.lisensi_reminder_log SET task_id = v_task_id WHERE id = v_log_id;

    v_jumlah := v_jumlah + 1;
  END LOOP;

  RETURN v_jumlah;
END $$;

-- Robot ini TIDAK boleh dipanggil dari aplikasi/frontend.
-- Alasan: satu-satunya pembuat task adalah robot cron. Kalau ada dua jalur pembuat,
-- asal-usul task dobel tidak bisa dilacak.
REVOKE ALL ON FUNCTION public.buat_task_relisensi() FROM PUBLIC, anon, authenticated;


-- ============================================================
-- 10. JADWAL HARIAN (pg_cron)
-- ============================================================
-- pg_cron sudah dipakai di proyek ini (hapus foto absen, tandai foto task kedaluwarsa).
--
-- ⚠️ PENTING: pg_cron memakai JAM UTC, bukan jam Indonesia.
--    '0 18 * * *'  =  jam 18:00 UTC  =  jam 01:00 DINI HARI WIB keesokan harinya.
--    Jadi ini BUKAN jam 6 sore.
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pengingat-relisensi-harian') THEN
    PERFORM cron.unschedule('pengingat-relisensi-harian');
  END IF;

  PERFORM cron.schedule(
    'pengingat-relisensi-harian',
    '0 18 * * *',
    $cron$ SELECT public.buat_task_relisensi(); $cron$
  );
END $do$;

-- ------------------------------------------------------------
-- PERINTAH BERGUNA UNTUK PEMILIK:
--
--   -- lihat semua jadwal yang aktif
--   SELECT jobid, jobname, schedule, active FROM cron.job;
--
--   -- matikan pengingat relisensi
--   SELECT cron.unschedule('pengingat-relisensi-harian');
--
--   -- jalankan robot manual sekarang juga (menampilkan jumlah task yang dibuat)
--   SELECT public.buat_task_relisensi();
--
--   -- lihat status semua lisensi
--   SELECT nama_lisensi, nama_unit, jatuh_tempo_berikutnya, sisa_hari,
--          tahun_target, sudah_perpanjang_tahun_target
--   FROM public.v_lisensi_status ORDER BY jatuh_tempo_berikutnya;
-- ------------------------------------------------------------
