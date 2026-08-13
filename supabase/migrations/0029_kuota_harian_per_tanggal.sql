-- ============================================================
-- 0029  Kuota jadwal harian dihitung per tanggal
--
--   Kursi jadwal RUTIN dipegang terus-menerus oleh siswanya: satu
--   aktivasi = satu kursi, selama status masih 'Aktif'.
--
--   Kursi jadwal HARIAN hanya terpakai pada tanggal pertemuannya.
--   Satu paket privat 5 pertemuan tersimpan sebagai 5 baris aktivasi
--   dengan tgl_mulai berbeda-beda, jadi kalau dihitung rata seperti
--   rutin, paket itu langsung menghabiskan 5 kursi sekaligus dan
--   slotnya dianggap penuh selamanya — padahal tiap tanggal cuma
--   dipakai satu anak. Akibatnya slot les privat lenyap dari daftar
--   jadwal kosong dan operator terpaksa membuat jadwal master baru
--   tiap kali paket diperpanjang.
--
--   Fungsi di bawah sudah meniatkan pembedaan ini sejak awal —
--   komentarnya menulis "siswa rutin" — tapi query-nya menghitung
--   semua aktivasi tanpa memandang jenis maupun tanggal.
-- ============================================================

CREATE OR REPLACE FUNCTION public.appointment_cek_kuota()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kuota INT;
  v_rutin INT;
  v_appt  INT;
BEGIN
  -- Appointment yang dibatalkan tidak memakai kuota
  IF NEW.status = 'batal' THEN
    RETURN NEW;
  END IF;

  SELECT kuota INTO v_kuota FROM jadwal_master WHERE id = NEW.jadwal_id;
  IF v_kuota IS NULL THEN
    RAISE EXCEPTION 'Jadwal tidak ditemukan.';
  END IF;

  -- Siswa yang sudah memegang kursi jadwal ini pada tanggal yang dipesan.
  -- Rutin: sepanjang aktivasinya aktif. Harian: hanya pada tanggal pertemuannya.
  SELECT COUNT(*) INTO v_rutin
  FROM aktivasi_siswa a
  WHERE a.jadwal_id = NEW.jadwal_id
    AND a.status    = 'Aktif'
    AND ( a.detail_jadwal->>'jenis_program' IS DISTINCT FROM 'Harian'
          OR a.tgl_mulai = NEW.tanggal );

  -- Appointment aktif lain di jadwal & tanggal yang sama (kecuali baris ini sendiri)
  SELECT COUNT(*) INTO v_appt
  FROM appointment
  WHERE jadwal_id = NEW.jadwal_id
    AND tanggal   = NEW.tanggal
    AND status   <> 'batal'
    AND id       <> NEW.id;

  IF (v_rutin + v_appt) >= v_kuota THEN
    RAISE EXCEPTION 'Slot sudah dibooking, pilih slot lain.';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_appointment_cek_kuota ON public.appointment;
CREATE TRIGGER trg_appointment_cek_kuota
  BEFORE INSERT OR UPDATE ON public.appointment
  FOR EACH ROW EXECUTE FUNCTION public.appointment_cek_kuota();

-- Pencarian kursi harian selalu menyaring jadwal + tanggal sekaligus.
CREATE INDEX IF NOT EXISTS idx_aktivasi_siswa_jadwal_tgl
  ON public.aktivasi_siswa(jadwal_id, tgl_mulai);
