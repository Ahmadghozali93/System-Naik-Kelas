-- ============================================================
-- 0016  Komponen & paket gaji: pesan penolakan yang jelas + hak akses
--       yang bisa dibaca aplikasi
--
-- Keluhan: SPV menambah komponen gaji → "new row violates row-level
-- security policy for table komponen_gaji".
--
-- Dua sebab, keduanya sah menurut aturan 0006:
--   1. Akun belum diberi izin "Kelola Payroll" (gurus.boleh_kelola_payroll),
--      sehingga payroll_kelola_unit() selalu false.
--   2. Kolom "Berlaku di Cabang" dibiarkan "Semua cabang" (unit_id NULL).
--      Baris global adalah milik Owner — payroll_kelola_unit(NULL) false.
--
-- Migrasi ini TIDAK melonggarkan aturan tulis dan TIDAK menyalakan flag
-- siapa pun. Yang ditambahkan: alasan penolakan yang bisa dimengerti
-- petugas, dan satu RPC agar aplikasi tahu batas hak akses SEBELUM
-- form dikirim (lihat src/hooks/useHakPayroll.js).
-- ============================================================


-- ── 1. Hak payroll akun yang sedang login ──
-- Dipakai UI untuk membatasi pilihan cabang. Memakai helper 0006 apa
-- adanya, jadi tidak mungkin melaporkan hak yang lebih besar dari
-- yang benar-benar diberikan RLS.
CREATE OR REPLACE FUNCTION public.payroll_hak_saya()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'is_owner',     public.payroll_is_owner(),
    'boleh_kelola', public.payroll_is_owner() OR public.payroll_boleh_kelola(),
    'unit_ids',     to_jsonb(public.payroll_unit_ids())
  );
$$;

GRANT EXECUTE ON FUNCTION public.payroll_hak_saya() TO authenticated;


-- ── 2. Penolakan berbahasa manusia untuk komponen & paket gaji ──
-- Pola sama dengan trg_periode_payroll_cek_izin (0015). BEFORE trigger
-- berjalan sebelum WITH CHECK dievaluasi, jadi pesan inilah yang sampai
-- ke petugas — RLS tetap jadi penjaga terakhir kalau trigger dilewati.
CREATE OR REPLACE FUNCTION public.payroll_master_cek_izin()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_unit  TEXT;
  v_objek TEXT := CASE TG_TABLE_NAME WHEN 'paket_gaji' THEN 'Paket gaji' ELSE 'Komponen gaji' END;
BEGIN
  -- Tanpa sesi login (SQL Editor, service role, skrip migrasi) trigger diam.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.payroll_kelola_unit(NEW.unit_id) THEN
    RETURN NEW;
  END IF;

  IF NOT public.payroll_boleh_kelola() THEN
    RAISE EXCEPTION 'Akun Anda belum diberi izin mengelola payroll. Minta Owner menyalakan "Kelola Payroll" di menu User.';
  ELSIF NEW.unit_id IS NULL THEN
    RAISE EXCEPTION '% yang berlaku untuk SEMUA cabang hanya bisa dibuat Owner. Pilih cabang Anda pada kolom "Berlaku di Cabang".', v_objek;
  ELSE
    SELECT nama INTO v_unit FROM units WHERE id = NEW.unit_id;
    RAISE EXCEPTION 'Anda tidak mengelola cabang %. Pilih cabang yang ditugaskan ke akun Anda.',
      COALESCE(v_unit, NEW.unit_id);
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_komponen_gaji_cek_izin ON public.komponen_gaji;
CREATE TRIGGER trg_komponen_gaji_cek_izin
  BEFORE INSERT OR UPDATE ON public.komponen_gaji
  FOR EACH ROW EXECUTE FUNCTION public.payroll_master_cek_izin();

DROP TRIGGER IF EXISTS trg_paket_gaji_cek_izin ON public.paket_gaji;
CREATE TRIGGER trg_paket_gaji_cek_izin
  BEFORE INSERT OR UPDATE ON public.paket_gaji
  FOR EACH ROW EXECUTE FUNCTION public.payroll_master_cek_izin();
