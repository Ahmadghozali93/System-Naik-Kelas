-- ============================================================
-- 0019  Kunci lokasi absensi — Tahap 2: tutup celah bypass
--
-- Migrasi 0017 memindahkan penulisan absensi ke RPC, TAPI sengaja
-- membiarkan policy "att_insert_self" tetap hidup sebagai masa transisi.
-- Selama policy itu ada, seluruh validasi lokasi sebenarnya masih bisa
-- dilewati: siapa pun yang paham DevTools bisa menembakkan INSERT
-- langsung ke tabel attendances dari browser, lengkap dengan jam dan
-- status karangan sendiri. Migrasi ini yang benar-benar menutupnya.
--
-- INI SATU-SATUNYA MIGRASI RANGKAIAN INI YANG BISA MEMBUAT SELURUH GURU
-- GAGAL ABSEN kalau dijalankan pada waktu yang salah. Karena itu ia
-- dipisahkan dari 0018 (deteksi anomali) yang tidak berisiko apa-apa.
--
-- ⚠️ JANGAN JALANKAN SEBELUM:
--   1. Frontend yang memakai RPC sudah TAYANG, dan
--   2. Satu putaran shift penuh sudah lewat sejak penayangan — supaya
--      semua guru, termasuk shift malam, sudah sempat membuka aplikasi
--      versi baru minimal sekali.
--
-- Kenapa hanya satu putaran shift, bukan berhari-hari: service worker
-- aplikasi ini memakai strategi network-first (lihat public/sw.js), jadi
-- guru yang online SELALU mendapat bundel terbaru begitu membuka
-- aplikasi. Tidak ada bundel lama yang bertahan berhari-hari. Yang
-- benar-benar perlu ditunggu hanyalah setiap orang membuka aplikasinya
-- sekali, dan itu terjadi dengan sendirinya saat mereka absen.
--
-- Migrasi ini MENOLAK BERJALAN SENDIRI kalau syarat itu belum terpenuhi
-- — lihat bagian 1. Kalau Anda melihat pesan "Migrasi dibatalkan", itu
-- bukan kerusakan: seluruh transaksi dibatalkan dan tidak ada satu pun
-- perubahan yang tersimpan. Pastikan dengan:
--
--   SELECT policyname FROM pg_policies
--   WHERE tablename = 'attendances' AND policyname = 'att_insert_self';
--
--   1 baris  → policy masih ada, belum ada yang berubah
--   0 baris  → migrasi sudah berhasil dijalankan
--
-- CARA MEMBATALKAN (kalau ternyata ada masalah setelah dijalankan):
--   CREATE POLICY "att_insert_self" ON attendances FOR INSERT
--     WITH CHECK (guru_id = absensi_guru_id());
-- ============================================================


-- ------------------------------------------------------------
-- 1. Pengaman
--
-- Absensi yang ditulis lewat RPC selalu mengisi status_lokasi selama
-- modenya bukan 'nonaktif'. Jadi baris dengan status_lokasi NULL pada
-- shift yang modenya aktif = ditulis lewat jalur langsung, artinya
-- masih ada HP yang memegang bundel JS lama.
-- ------------------------------------------------------------

DO $$
DECLARE
  v_lama INT;
  v_baru INT;
BEGIN
  -- Sinyal NEGATIF: masih ada yang menulis lewat jalur lama.
  SELECT COUNT(*) INTO v_lama
  FROM public.attendances a
  JOIN public.shift_schedules ss ON ss.id = a.shift_schedule_id
  WHERE a.check_in >= now() - INTERVAL '24 hours'
    AND a.status_lokasi IS NULL
    AND public.absensi_mode_efektif(ss.shift_id) <> 'nonaktif';

  -- Sinyal POSITIF: ada bukti frontend baru benar-benar dipakai.
  --
  -- Ini yang penting, dan sempat terlewat: kalau hanya sinyal negatif
  -- yang diperiksa, pemeriksaan ini LOLOS di hari tanpa absensi sama
  -- sekali (libur, akhir pekan). Migrasi lalu berjalan mulus padahal
  -- frontend-nya belum tayang, dan seluruh guru gagal absen keesokan
  -- paginya — persis bencana yang ingin dicegah.
  SELECT COUNT(*) INTO v_baru
  FROM public.attendances
  WHERE check_in >= now() - INTERVAL '24 hours'
    AND status_lokasi IS NOT NULL;

  IF v_baru = 0 THEN
    RAISE EXCEPTION
      'Migrasi dibatalkan: belum ada satu pun absensi 24 jam terakhir yang ditulis lewat RPC. Kemungkinan frontend versi baru belum tayang, atau memang belum ada yang absen hari ini. Tayangkan dulu, tunggu satu putaran shift penuh, baru jalankan migrasi ini. Tidak ada perubahan yang tersimpan.';
  END IF;

  IF v_lama > 0 THEN
    RAISE EXCEPTION
      'Migrasi dibatalkan: masih ada % absensi 24 jam terakhir yang ditulis lewat jalur lama. Jalankan kueri kesiapan di bagian 3 untuk melihat siapa saja, lalu minta mereka membuka ulang aplikasinya. Tidak ada perubahan yang tersimpan.', v_lama;
  END IF;
END $$;


-- ------------------------------------------------------------
-- 2. Cabut hak tulis langsung milik guru
--
-- Yang dicabut hanya jalur guru. Policy admin dibiarkan, karena SPV
-- tetap perlu bisa mengabsenkan manual — itu penyangga terakhir ketika
-- HP guru mati, hilang, atau rusak. Tanpa itu, mode 'blokir' berarti
-- guru yang HP-nya bermasalah tidak punya jalan sama sekali.
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "att_insert_self" ON public.attendances;

-- ⚠️ CELAH YANG BELUM TERTUTUP — perlu keputusan terpisah.
--
-- Policy "att_update" masih mengizinkan guru MENGUBAH baris absensinya
-- sendiri (guru_id = absensi_guru_id()). Setelah INSERT dikunci, di
-- sinilah celah berikutnya: lewat panggilan API langsung, guru bisa
-- mengubah status barisnya sendiri dari 'Telat' menjadi 'Hadir', atau
-- menggeser check_in. Ini bukan celah baru — sudah ada sejak awal —
-- tapi jadi lebih menonjol sekarang.
--
-- Policy itu SENGAJA TIDAK diubah di sini, karena menutupnya butuh
-- audit dulu terhadap semua jalur tulis admin yang ada (koreksi absen,
-- catatan di dashboard, verifikasi lokasi). Salah tutup, yang rusak
-- adalah pekerjaan SPV sehari-hari.
--
-- Cara menutupnya nanti: trigger BEFORE UPDATE yang menolak perubahan
-- pada kolom sensitif (check_in, check_out, status, status_lokasi,
-- jarak_*, lat_*, lng_*, lokasi_disetujui) ketika pemanggilnya bukan
-- admin. RPC absen_check_out perlu menandai dirinya sebagai jalur
-- tepercaya lewat SET LOCAL, karena SECURITY DEFINER tidak mengubah
-- auth.uid() sehingga trigger tetap melihatnya sebagai guru biasa.


-- ------------------------------------------------------------
-- 3. Kueri kesiapan & pemantauan
--
-- Jalankan SEBELUM migrasi ini, untuk melihat siapa yang masih memakai
-- jalur lama (harus kosong):
--
--   SELECT g.nama, COUNT(*) AS jumlah, MAX(a.check_in) AS terakhir
--   FROM attendances a
--   JOIN shift_schedules ss ON ss.id = a.shift_schedule_id
--   JOIN gurus g ON g.id = a.guru_id
--   WHERE a.check_in >= now() - INTERVAL '24 hours'
--     AND a.status_lokasi IS NULL
--     AND absensi_mode_efektif(ss.shift_id) <> 'nonaktif'
--   GROUP BY g.nama ORDER BY jumlah DESC;
--
-- Dan pastikan yang ini ADA isinya (bukti frontend baru sudah dipakai):
--
--   SELECT COUNT(*) FROM attendances
--   WHERE check_in >= now() - INTERVAL '24 hours' AND status_lokasi IS NOT NULL;
--
-- Kalau kueri pertama masih ada isinya, minta guru tersebut menutup
-- penuh aplikasinya lalu membukanya lagi.
--
-- Kalibrasi radius sebelum menaikkan cabang ke 'blokir' — jangan pakai
-- rata-rata, pakai persentil, supaya satu pencilan tidak melebarkan
-- radius untuk semua orang:
--
--   SELECT u.nama,
--          COUNT(*) AS total,
--          ROUND(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY a.jarak_checkin_m)) AS p90_m,
--          ROUND(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY a.jarak_checkin_m)) AS p99_m,
--          MAX(a.jarak_checkin_m) AS terjauh_m
--   FROM attendances a JOIN units u ON u.id = a.unit_id
--   WHERE a.jarak_checkin_m IS NOT NULL
--     AND a.tanggal >= (now() AT TIME ZONE 'Asia/Jakarta')::date - 14
--   GROUP BY u.nama;
--
-- Patokan: setel radius di sekitar p99, dibulatkan ke atas. Kalau p99
-- sebuah cabang ternyata ribuan meter, itu bukan tanda radiusnya kurang
-- lebar — itu tanda memang ada yang absen dari rumah.
-- ------------------------------------------------------------
