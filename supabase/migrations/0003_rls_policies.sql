-- ============================================================
-- 0003 RLS POLICIES (berbasis peran). Mengganti SEMUA policy lama.
-- ============================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname='public' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['gurus','siswa','units','programs','roles','master_jam','jadwal_master','aktivasi_siswa','jurnal_entries','reschedules'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
-- ===== gurus (kredensial/profil staf — TIDAK boleh diakses anon) =====
CREATE POLICY gurus_select ON public.gurus FOR SELECT TO authenticated
  USING (public.is_admin() OR auth_user_id = auth.uid());
CREATE POLICY gurus_insert ON public.gurus FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());
CREATE POLICY gurus_update ON public.gurus FOR UPDATE TO authenticated
  USING (public.is_admin() OR auth_user_id = auth.uid())
  WITH CHECK (public.is_admin() OR auth_user_id = auth.uid());
CREATE POLICY gurus_delete ON public.gurus FOR DELETE TO authenticated
  USING (public.is_admin());

-- ===== siswa (PII anak — anon HANYA boleh INSERT booking, tidak boleh baca) =====
CREATE POLICY siswa_select ON public.siswa FOR SELECT TO authenticated USING (true);
CREATE POLICY siswa_insert_auth ON public.siswa FOR INSERT TO authenticated WITH CHECK (true);
-- Form booking publik: anon hanya boleh menambah calon siswa berstatus 'Booking'
CREATE POLICY siswa_insert_booking_anon ON public.siswa FOR INSERT TO anon
  WITH CHECK (status = 'Booking');
CREATE POLICY siswa_update ON public.siswa FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY siswa_delete ON public.siswa FOR DELETE TO authenticated USING (public.is_admin());

-- ===== units =====
CREATE POLICY units_select_anon ON public.units FOR SELECT TO anon USING (aktif = true);
CREATE POLICY units_select_auth ON public.units FOR SELECT TO authenticated USING (true);
CREATE POLICY units_write ON public.units FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ===== programs =====
CREATE POLICY programs_select_anon ON public.programs FOR SELECT TO anon USING (status = 'Aktif');
CREATE POLICY programs_select_auth ON public.programs FOR SELECT TO authenticated USING (true);
CREATE POLICY programs_write ON public.programs FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ===== roles (hak akses menu — admin only utk ubah) =====
CREATE POLICY roles_select ON public.roles FOR SELECT TO authenticated USING (true);
CREATE POLICY roles_write ON public.roles FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ===== master_jam =====
CREATE POLICY master_jam_select ON public.master_jam FOR SELECT TO authenticated USING (true);
CREATE POLICY master_jam_write ON public.master_jam FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ===== jadwal_master (anon boleh baca utk halaman pengajuan reschedule) =====
CREATE POLICY jadwal_select_anon ON public.jadwal_master FOR SELECT TO anon USING (true);
CREATE POLICY jadwal_select_auth ON public.jadwal_master FOR SELECT TO authenticated USING (true);
CREATE POLICY jadwal_write ON public.jadwal_master FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ===== aktivasi_siswa (anon: hanya baca yg status Aktif) =====
CREATE POLICY aktivasi_select_anon ON public.aktivasi_siswa FOR SELECT TO anon USING (status = 'Aktif');
CREATE POLICY aktivasi_select_auth ON public.aktivasi_siswa FOR SELECT TO authenticated USING (true);
CREATE POLICY aktivasi_write ON public.aktivasi_siswa FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ===== jurnal_entries (guru hanya boleh ubah/hapus jurnal miliknya; admin bebas) =====
CREATE POLICY jurnal_select ON public.jurnal_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY jurnal_insert ON public.jurnal_entries FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY jurnal_update ON public.jurnal_entries FOR UPDATE TO authenticated
  USING (public.is_admin() OR guru_id = public.current_guru_id())
  WITH CHECK (public.is_admin() OR guru_id = public.current_guru_id());
CREATE POLICY jurnal_delete ON public.jurnal_entries FOR DELETE TO authenticated
  USING (public.is_admin() OR guru_id = public.current_guru_id());

-- ===== reschedules (anon: boleh baca + ajukan/INSERT; ubah/hapus hanya authenticated) =====
CREATE POLICY resched_select_anon ON public.reschedules FOR SELECT TO anon USING (true);
CREATE POLICY resched_select_auth ON public.reschedules FOR SELECT TO authenticated USING (true);
CREATE POLICY resched_insert_anon ON public.reschedules FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY resched_insert_auth ON public.reschedules FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY resched_update ON public.reschedules FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY resched_delete ON public.reschedules FOR DELETE TO authenticated USING (public.is_admin());
