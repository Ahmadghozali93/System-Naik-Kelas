-- ============================================================
-- TRIGGER: sinkronisasi auth.users -> profil gurus
--   - Guru lama: auto-link via email yang cocok
--   - Signup baru: buat profil status 'Tidak Aktif', role DIPAKSA 'Guru' (anti privilege-escalation)
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE existing_id text;
BEGIN
  SELECT id INTO existing_id FROM public.gurus WHERE email = NEW.email LIMIT 1;

  IF existing_id IS NOT NULL THEN
    -- Migrasi guru lama: cukup hubungkan
    UPDATE public.gurus SET auth_user_id = NEW.id WHERE id = existing_id;
  ELSE
    -- Pendaftaran baru: profil baru, NONAKTIF, role dipaksa Guru
    INSERT INTO public.gurus (id, auth_user_id, email, nama, role, nowa, alamat, maps, status)
    VALUES (
      'GURU-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'nama', ''),
      'Guru',                                  -- DIPAKSA, abaikan input client
      NEW.raw_user_meta_data->>'nowa',
      NEW.raw_user_meta_data->>'alamat',
      NEW.raw_user_meta_data->>'maps',
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
