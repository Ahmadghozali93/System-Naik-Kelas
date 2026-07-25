-- ============================================================
-- 0015  Akses payroll untuk pengelola non-Owner (mis. Supervisor)
--
-- Dua keluhan yang ditangani:
--   1. "Uji coba hitung" gagal: new row violates row-level security
--      policy for table "periode_payroll".
--   2. Paket gaji yang dibuat Owner tidak terlihat saat SPV login.
--
-- Keduanya berasal dari satu hal: payroll TIDAK memakai kolom `role`,
-- melainkan flag terpisah gurus.boleh_kelola_payroll (lihat 0006).
-- Selama flag itu false, payroll_kelola_unit() selalu false — menulis
-- ditolak, dan baris yang unitnya tidak dikelola tidak ikut terbaca.
--
-- Migrasi ini TIDAK menyalakan flag siapa pun. Menaikkan hak akses
-- seseorang harus keputusan Owner, bukan efek samping migrasi. Yang
-- diperbaiki di sini: caranya sekarang ada di aplikasi (halaman User),
-- dan satu celah tampilan pada paket gaji global.
-- ============================================================

-- ── 1. Paket gaji global ikut terbaca pengelola cabang ──
-- komponen_gaji sudah punya aturan ini sejak 0006 (kg_select memberi
-- "OR unit_id IS NULL"), tapi paket_gaji terlewat. Akibatnya paket yang
-- dibuat Owner untuk SEMUA cabang (unit_id NULL) hanya kelihatan oleh
-- Owner, sedangkan komponen di dalamnya kelihatan — tampilan jadi tidak
-- konsisten dan pengelola cabang mengira datanya hilang.
--
-- Hanya SELECT yang dilonggarkan. Menyunting paket global tetap milik
-- Owner, karena payroll_kelola_unit(NULL) tetap false pada pg_write.
DROP POLICY IF EXISTS pg_select ON public.paket_gaji;
CREATE POLICY pg_select ON public.paket_gaji FOR SELECT TO authenticated
  USING (
    public.payroll_is_owner()
    OR unit_id IS NULL
    OR public.payroll_kelola_unit(unit_id)
  );

-- Isi paket ikut induknya: kalau paketnya boleh dilihat, komponennya juga.
DROP POLICY IF EXISTS pgk_select ON public.paket_gaji_komponen;
CREATE POLICY pgk_select ON public.paket_gaji_komponen FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.paket_gaji p
     WHERE p.id = paket_gaji_id
       AND (public.payroll_is_owner()
            OR p.unit_id IS NULL
            OR public.payroll_kelola_unit(p.unit_id))
  ));

-- pgk_all (dari 0006) tetap ada untuk INSERT/UPDATE/DELETE. Policy PostgreSQL
-- bersifat permisif, jadi pgk_select hanya menambah hak baca, tidak menambah
-- hak tulis atas paket global.


-- ── 2. Alasan penolakan yang bisa dibaca manusia ──
-- "violates row-level security policy" tidak memberi tahu apa pun kepada
-- petugas. Trigger ini memeriksa lebih dulu dan menyebutkan penyebabnya.
CREATE OR REPLACE FUNCTION public.periode_payroll_cek_izin()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_unit TEXT;
BEGIN
  -- Tanpa sesi login (SQL Editor, service role, skrip migrasi) trigger ini
  -- diam saja. Tugasnya hanya memperjelas pesan untuk pengguna aplikasi;
  -- penjaga sebenarnya tetap RLS, dan role tersebut memang melewatinya.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.payroll_kelola_unit(NEW.unit_id) THEN
    RETURN NEW;
  END IF;

  SELECT nama INTO v_unit FROM units WHERE id = NEW.unit_id;

  IF NOT public.payroll_boleh_kelola() THEN
    RAISE EXCEPTION 'Akun Anda belum diberi izin mengelola payroll. Minta Owner menyalakan "Kelola Payroll" di menu User.';
  ELSE
    RAISE EXCEPTION 'Anda tidak mengelola cabang %. Payroll hanya bisa dijalankan untuk cabang yang ditugaskan ke akun Anda.',
      COALESCE(v_unit, NEW.unit_id);
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_periode_payroll_cek_izin ON public.periode_payroll;
CREATE TRIGGER trg_periode_payroll_cek_izin
  BEFORE INSERT ON public.periode_payroll
  FOR EACH ROW EXECUTE FUNCTION public.periode_payroll_cek_izin();
