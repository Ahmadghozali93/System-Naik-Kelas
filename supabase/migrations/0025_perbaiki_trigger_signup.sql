-- ============================================================
-- 0025 PERBAIKI TRIGGER SIGNUP
--
-- Gejala: guru baru isi formulir signup -> akun muncul di Authentication,
--         tapi profilnya TIDAK muncul di tabel `gurus`.
--
-- Yang diperbaiki:
--   1. Pasang ulang trigger `on_auth_user_created` (di produksi kemungkinan
--      belum pernah dijalankan / terhapus, mis. saat restore atau DROP CASCADE).
--   2. `tanggal_lahir` ikut disimpan. Formulir signup mewajibkan tanggal lahir,
--      tapi trigger versi 0004 tidak pernah menuliskannya -> datanya hilang diam-diam.
--   3. Jangan menimpa guru lama yang sudah ter-link ke akun auth lain
--      (UPDATE-nya akan melanggar UNIQUE auth_user_id dan bikin signup gagal total).
--   4. Backfill: akun auth yang sudah terlanjur mendaftar tanpa profil dibuatkan
--      profilnya sekarang, supaya tidak perlu daftar ulang.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_id      text;
  existing_auth_id uuid;
BEGIN
  SELECT id, auth_user_id INTO existing_id, existing_auth_id
  FROM public.gurus WHERE email = NEW.email LIMIT 1;

  IF existing_id IS NOT NULL THEN
    -- Guru lama: hubungkan, tapi hanya kalau belum terpakai akun auth lain.
    IF existing_auth_id IS NULL THEN
      UPDATE public.gurus SET auth_user_id = NEW.id WHERE id = existing_id;
    END IF;
  ELSE
    -- Pendaftaran baru: profil baru, NONAKTIF, role dipaksa Guru
    INSERT INTO public.gurus (
      id, auth_user_id, email, nama, role, nowa, alamat, maps, tanggal_lahir, status
    )
    VALUES (
      'GURU-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'nama', ''),
      'Guru',                                  -- DIPAKSA, abaikan input client
      NEW.raw_user_meta_data->>'nowa',
      NEW.raw_user_meta_data->>'alamat',
      NEW.raw_user_meta_data->>'maps',
      NULLIF(NEW.raw_user_meta_data->>'tanggal_lahir', '')::date,
      'Tidak Aktif'                            -- admin yang mengaktifkan
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();


-- ============================================================
-- BACKFILL: akun auth yatim (sudah daftar, profilnya tidak pernah dibuat)
-- ============================================================

-- 1) Guru lama yang akun authnya ada tapi kolom auth_user_id-nya masih kosong.
UPDATE public.gurus g
SET auth_user_id = u.id
FROM auth.users u
WHERE g.auth_user_id IS NULL
  AND lower(g.email) = lower(u.email)
  AND NOT EXISTS (SELECT 1 FROM public.gurus x WHERE x.auth_user_id = u.id);

-- 2) Pendaftar baru yang belum punya baris di `gurus` sama sekali.
--    Tetap 'Tidak Aktif' -> admin yang mengaktifkan lewat menu User.
INSERT INTO public.gurus (
  id, auth_user_id, email, nama, role, nowa, alamat, maps, tanggal_lahir, status
)
SELECT
  'GURU-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'nama', ''),
  'Guru',
  u.raw_user_meta_data->>'nowa',
  u.raw_user_meta_data->>'alamat',
  u.raw_user_meta_data->>'maps',
  NULLIF(u.raw_user_meta_data->>'tanggal_lahir', '')::date,
  'Tidak Aktif'
FROM auth.users u
WHERE u.email IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.gurus g WHERE g.auth_user_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM public.gurus g WHERE lower(g.email) = lower(u.email));

-- 3) Isi tanggal_lahir yang hilang untuk pendaftar sebelum perbaikan ini.
UPDATE public.gurus g
SET tanggal_lahir = NULLIF(u.raw_user_meta_data->>'tanggal_lahir', '')::date
FROM auth.users u
WHERE g.auth_user_id = u.id
  AND g.tanggal_lahir IS NULL
  AND NULLIF(u.raw_user_meta_data->>'tanggal_lahir', '') IS NOT NULL;
