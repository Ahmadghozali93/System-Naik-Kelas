-- ============================================================
-- 0026 — "Slip Gaji Saya" kosong padahal periode sudah dibayar
--
-- Dua sebab yang saling menutupi:
--
-- (A) IDENTITAS. RLS slip (sg_select/sgd_select) mengenali "slip milik
--     saya" lewat absensi_guru_id(), yang mencocokkan lewat EMAIL.
--     Seluruh sisa payroll (payroll_is_owner, payroll_boleh_kelola,
--     payroll_unit_ids) dan aplikasi mengenali user lewat auth_user_id.
--     Begitu email di tabel gurus berbeda dari email login — akun lama,
--     email diganti, profil dibuat trigger signup — slip jadi tak
--     terlihat walau statusnya sudah 'dibayar'. 0017 sudah menyadari
--     ini dan membuat absensi_guru_saya(); payroll belum ikut pindah.
--
-- (B) STATUS SLIP TERTINGGAL. Halaman "Slip Gaji Saya" menyaring
--     slip_gaji.status, bukan status periode. Penandaan "dibayar" di
--     PeriodePayrollPage mengubah periode lalu slip lewat dua perintah
--     terpisah dari browser, dan galat perintah kedua tidak diperiksa.
--     Kalau yang kedua gagal, periode tampak "Dibayar" di layar admin
--     sementara slipnya masih 'terkunci' dan tidak pernah muncul.
--     Terbukti terjadi pada Juli 2026: 15 dari 15 slip tertinggal di
--     'terkunci'. Penolaknya trigger cegah_ubah_slip_terkunci — lihat
--     bagian 3. Propagasinya dipindahkan ke trigger DB supaya tidak
--     bisa setengah jalan lagi.
--
-- Aman dijalankan ulang.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Identitas guru yang sedang login (auth_user_id dulu, email cadangan)
--    Ditulis ulang di sini supaya migrasi ini berdiri sendiri kalau
--    0017 ternyata belum pernah dijalankan di produksi.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.absensi_guru_saya()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT id FROM public.gurus WHERE auth_user_id = auth.uid() LIMIT 1),
    public.absensi_guru_id()
  );
$$;
GRANT EXECUTE ON FUNCTION public.absensi_guru_saya() TO authenticated;


-- ------------------------------------------------------------
-- 2. RLS slip memakai identitas yang sama dengan aplikasi
-- ------------------------------------------------------------
DROP POLICY IF EXISTS sg_select ON public.slip_gaji;
CREATE POLICY sg_select ON public.slip_gaji FOR SELECT TO authenticated
  USING (
    public.payroll_is_owner()
    OR (guru_id = public.absensi_guru_saya() AND status = 'dibayar')
    OR public.payroll_kelola_guru(guru_id)
  );

DROP POLICY IF EXISTS sgd_select ON public.slip_gaji_detail;
CREATE POLICY sgd_select ON public.slip_gaji_detail FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.slip_gaji s
    WHERE s.id = slip_gaji_id
      AND (public.payroll_is_owner()
           OR (s.guru_id = public.absensi_guru_saya() AND s.status = 'dibayar')
           OR public.payroll_kelola_guru(s.guru_id))
  ));

-- Dipakai policy periode_payroll di 0012. Sejak 0020 pp_select memang
-- terbuka untuk semua, tapi fungsinya disamakan supaya tidak menjadi
-- jebakan kalau policy itu diketatkan lagi nanti.
CREATE OR REPLACE FUNCTION public.punya_slip_dibayar(p_periode_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM slip_gaji s
    WHERE s.periode_payroll_id = p_periode_id
      AND s.guru_id = public.absensi_guru_saya()
      AND s.status  = 'dibayar'
  );
$$;


-- ------------------------------------------------------------
-- 3. Penjaga periode terkunci: perubahan STATUS harus tetap lolos
--
--    Inilah yang menahan slip Juli 2026 (15 dari 15 gagal — bukan pola
--    RLS per-unit, melainkan penolakan menyeluruh). Urutannya: periode
--    diubah jadi 'dibayar' lebih dulu, lalu UPDATE slip menyusul, dan
--    trigger ini membaca status periode yang SUDAH 'dibayar' lalu
--    menolak. 0007 sebenarnya sudah memberi pengecualian untuk
--    perubahan status; ditulis ulang di sini kalau-kalau yang terpasang
--    di produksi versi tanpa pengecualian itu. Tanpa ini, trigger
--    propagasi di bagian 4 akan terbentur penjaga yang sama.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cegah_ubah_slip_terkunci()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status TEXT; v_periode UUID;
BEGIN
  v_periode := COALESCE(NEW.periode_payroll_id, OLD.periode_payroll_id);
  SELECT status INTO v_status FROM periode_payroll WHERE id = v_periode;

  -- Perubahan status slip itu sendiri (kunci/bayar) tetap diizinkan,
  -- selama angkanya tidak ikut berubah.
  IF TG_OP = 'UPDATE'
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.total_pendapatan IS NOT DISTINCT FROM OLD.total_pendapatan
     AND NEW.total_potongan   IS NOT DISTINCT FROM OLD.total_potongan
     AND NEW.gaji_bersih      IS NOT DISTINCT FROM OLD.gaji_bersih THEN
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


-- ------------------------------------------------------------
-- 4. Status slip mengikuti periode secara otomatis
--    Trigger, bukan perintah kedua dari browser: satu transaksi,
--    tidak tersaring RLS, tidak bisa gagal separuh.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sinkron_status_slip()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE public.slip_gaji
       SET status = NEW.status, diubah_pada = now()
     WHERE periode_payroll_id = NEW.id
       AND status IS DISTINCT FROM NEW.status;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sinkron_status_slip ON public.periode_payroll;
CREATE TRIGGER trg_sinkron_status_slip
  AFTER UPDATE OF status ON public.periode_payroll
  FOR EACH ROW EXECUTE FUNCTION public.sinkron_status_slip();


-- ------------------------------------------------------------
-- 5. Perbaiki slip yang terlanjur tertinggal
--    Hanya menyentuh baris yang statusnya berbeda dari periodenya.
--    Jalankan bagian 1 skrip cek_slip_saya.sql sesudah ini: seharusnya
--    tidak ada lagi kombinasi status_periode <> status_slip.
-- ------------------------------------------------------------
UPDATE public.slip_gaji s
   SET status = pp.status, diubah_pada = now()
  FROM public.periode_payroll pp
 WHERE pp.id = s.periode_payroll_id
   AND s.status IS DISTINCT FROM pp.status;
