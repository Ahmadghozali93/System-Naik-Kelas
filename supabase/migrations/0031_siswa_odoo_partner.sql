-- ============================================================
-- 0031  Tautan siswa ke kontak (res.partner) di Odoo
--
--   Halaman SPP → Faktur Odoo sudah memanggil getOrCreatePartner()
--   setiap kali faktur dikirim, jadi siswa yang pernah difakturkan
--   SUDAH punya kontak di Odoo — hanya saja ID-nya tidak pernah
--   disimpan di sini. Akibatnya tidak ada cara mengetahui siswa mana
--   yang sudah punya kontak, dan pembuatan kontak dari halaman Siswa
--   berisiko melahirkan data kembar.
--
--   Kolom di bawah menyimpan tautannya sekali saja: begitu terisi,
--   tombol "Buat Kontak" di halaman Siswa berubah jadi penanda
--   tersinkron dan tidak bisa ditekan lagi.
--
--   Aditif: tanpa perubahan frontend, aplikasi lama tetap berjalan.
-- ============================================================

ALTER TABLE public.siswa
  ADD COLUMN IF NOT EXISTS odoo_partner_id   INTEGER     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS odoo_partner_name TEXT        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS odoo_synced_at    TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS odoo_error        TEXT        DEFAULT NULL;

COMMENT ON COLUMN public.siswa.odoo_partner_id IS
  'ID res.partner di Odoo. Terisi = kontaknya sudah ada, tombol pembuatan dimatikan.';
COMMENT ON COLUMN public.siswa.odoo_partner_name IS
  'Nama kontak sebagaimana tersimpan di Odoo — bisa berbeda dari nama siswa bila operator menautkan ke kontak yang sudah ada.';
COMMENT ON COLUMN public.siswa.odoo_error IS
  'Pesan galat percobaan terakhir. Dikosongkan begitu penautan berhasil.';

CREATE INDEX IF NOT EXISTS idx_siswa_odoo_partner ON public.siswa(odoo_partner_id);
