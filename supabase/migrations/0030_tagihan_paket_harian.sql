-- ============================================================
-- 0030  Tagihan paket harian: sekali bayar, bukan berulang bulanan
--
--   Tagihan SPP tidak punya tabelnya sendiri — ia diturunkan dari
--   baris aktivasi_siswa dengan rumus yang selalu bulanan: jatuh
--   tempo berikutnya = jatuh tempo pembayaran terakhir + 1 bulan.
--
--   Untuk les harian/privat rumus itu salah dua kali:
--     • Pembayarannya sekali untuk seluruh paket, bukan langganan.
--       Sesudah dibayar, bulan depan tagihannya terbit lagi sendiri
--       dan berujung "Terlambat" selamanya.
--     • Satu paket tersimpan sebagai satu baris per pertemuan, jadi
--       paket 5 pertemuan tampil sebagai 5 tagihan terpisah.
--
--   Dua kolom di bawah memberi tahu lapisan tagihan mana yang
--   berulang dan mana yang sekali jalan, serta mengikat pembayaran
--   ke paketnya — bukan ke satu pertemuan yang kebetulan terpilih.
--
--   Aditif: tanpa perubahan frontend, aplikasi lama tetap berjalan
--   seperti sebelumnya.
-- ============================================================

-- ── 1. Siklus tagihan ──
ALTER TABLE public.aktivasi_siswa
  ADD COLUMN IF NOT EXISTS siklus TEXT NOT NULL DEFAULT 'bulanan';

ALTER TABLE public.aktivasi_siswa
  DROP CONSTRAINT IF EXISTS aktivasi_siswa_siklus_check;
ALTER TABLE public.aktivasi_siswa
  ADD CONSTRAINT aktivasi_siswa_siklus_check CHECK (siklus IN ('bulanan','sekali'));

COMMENT ON COLUMN public.aktivasi_siswa.siklus IS
  'bulanan = SPP berulang tiap bulan (les rutin). sekali = paket harian/privat, satu kali bayar untuk seluruh pertemuan.';

-- ── 2. Pengikat pembayaran ke paket ──
ALTER TABLE public.pembayaran_spp
  ADD COLUMN IF NOT EXISTS induk_id TEXT;

COMMENT ON COLUMN public.pembayaran_spp.induk_id IS
  'assign_id_induk paket harian yang dibayar. Kosong untuk SPP rutin.';

CREATE INDEX IF NOT EXISTS idx_pembayaran_spp_induk_id ON public.pembayaran_spp(induk_id);
CREATE INDEX IF NOT EXISTS idx_aktivasi_siswa_induk    ON public.aktivasi_siswa(assign_id_induk);

-- ── 3. Backfill siklus untuk data harian yang sudah ada ──
UPDATE public.aktivasi_siswa
   SET siklus = 'sekali'
 WHERE detail_jadwal->>'jenis_program' = 'Harian'
   AND siklus <> 'sekali';

-- ── 4. Backfill induk_id pada pembayaran yang sudah tercatat ──
-- Pembayaran lama menunjuk ke SATU pertemuan lewat aktivasi_id; dari
-- situ paketnya bisa ditemukan. Pembayaran yang bahkan tidak punya
-- aktivasi_id tidak tersentuh di sini — penanganannya ada di
-- src/utils/tagihan.js, yang mencocokkannya lewat siswa + program +
-- unit selama jatuh temponya jatuh di dalam rentang pertemuan paket.
UPDATE public.pembayaran_spp p
   SET induk_id = a.assign_id_induk
  FROM public.aktivasi_siswa a
 WHERE p.aktivasi_id = a.id
   AND a.assign_id_induk IS NOT NULL
   AND p.induk_id IS NULL;
