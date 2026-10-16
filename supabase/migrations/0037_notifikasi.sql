-- ============================================================
-- Notifikasi untuk guru
--
-- Masalah yang dijawab: penilaian di-update (terutama status Revisi)
-- tetapi guru tidak membuka menunya, sehingga penilaian tertunda.
--
-- Notifikasi dibuat OTOMATIS oleh trigger database, bukan dari kode
-- halaman. Status Penilaian Mengajar bisa diubah dari tiga tempat (form
-- detail, chip status, drag di Kanban) dan admin bisa saja memegang bundel
-- JS lama — trigger menangkap semuanya.
--
-- Kejadian → notifikasi ke guru yang dinilai:
--   teaching_assessments dibuat           → penilaian_baru     (info)
--   teaching_assessments status → Revisi   → penilaian_revisi   (PERLU TINDAKAN)
--   teaching_assessments status → Approve  → penilaian_approve  (info)
--   komentar baru dari penilai             → penilaian_komentar (info)
--   kpi_assessments status → Approved      → kpi_approve        (info)
--
-- Notifikasi info selesai begitu dibaca (dibaca_at). Notifikasi
-- perlu_tindakan baru selesai (selesai_at) saat guru membalas lewat
-- komentar, atau saat status penilaian keluar dari Revisi.
--
-- Bergantung pada: supabase_teaching_assessment.sql, supabase_kpi_schema.sql
-- (absensi_is_admin).
-- ============================================================

-- Id guru yang sedang login, lewat auth_user_id — sama dengan cara
-- AuthContext memuat profil, jadi cocok dengan user.id di aplikasi.
-- (absensi_guru_id() mencocokkan lewat email dan bisa meleset bila email
-- di gurus berbeda dari email login.) Isinya identik dengan 0035, diulang
-- di sini agar migrasi ini tidak bergantung pada 0035.
CREATE OR REPLACE FUNCTION public.current_guru_id()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT g.id FROM public.gurus g WHERE g.auth_user_id = auth.uid() LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.current_guru_id() FROM public;
GRANT EXECUTE ON FUNCTION public.current_guru_id() TO authenticated;

CREATE TABLE IF NOT EXISTS public.notifikasi (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  guru_id                 TEXT NOT NULL REFERENCES public.gurus(id) ON DELETE CASCADE,
  jenis                   TEXT NOT NULL CHECK (jenis IN (
                            'penilaian_baru', 'penilaian_revisi', 'penilaian_approve',
                            'penilaian_komentar', 'kpi_approve')),
  judul                   TEXT NOT NULL,
  isi                     TEXT,
  -- Sumber notifikasi; ikut terhapus bila penilaiannya dihapus.
  teaching_assessment_id  UUID REFERENCES public.teaching_assessments(id) ON DELETE CASCADE,
  kpi_assessment_id       UUID REFERENCES public.kpi_assessments(id) ON DELETE CASCADE,
  perlu_tindakan          BOOLEAN NOT NULL DEFAULT false,
  dibaca_at               TIMESTAMPTZ,
  selesai_at              TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notifikasi_guru ON public.notifikasi(guru_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifikasi_ta   ON public.notifikasi(teaching_assessment_id)
  WHERE teaching_assessment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifikasi_kpi  ON public.notifikasi(kpi_assessment_id)
  WHERE kpi_assessment_id IS NOT NULL;

-- ── RLS ─────────────────────────────────────────────────────
-- Guru membaca notifikasinya sendiri; admin membaca semua untuk pantauan
-- "belum dilihat / belum dibalas". Tidak ada policy INSERT/UPDATE/DELETE:
-- baris dibuat oleh trigger (SECURITY DEFINER) dan ditandai dibaca lewat
-- RPC notifikasi_tandai_dibaca, supaya guru tidak bisa mengubah kolom lain
-- (mis. menutup sendiri selesai_at tanpa membalas).
ALTER TABLE public.notifikasi ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifikasi_select" ON public.notifikasi;
CREATE POLICY "notifikasi_select" ON public.notifikasi FOR SELECT
  USING (guru_id = current_guru_id() OR absensi_is_admin());

-- ── Helper ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notifikasi_periode(p_bulan INT, p_tahun INT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT (ARRAY['Januari','Februari','Maret','April','Mei','Juni','Juli',
                'Agustus','September','Oktober','November','Desember'])[p_bulan]
         || ' ' || p_tahun;
$$;

-- ── RPC: tandai dibaca ──────────────────────────────────────
-- Dipanggil saat guru menutup pop-up, mengklik notifikasi, atau membuka
-- penilaiannya langsung. Hanya menyentuh notifikasi milik pemanggil.
CREATE OR REPLACE FUNCTION public.notifikasi_tandai_dibaca(
  p_ids                    UUID[] DEFAULT NULL,
  p_teaching_assessment_id UUID   DEFAULT NULL,
  p_kpi_assessment_id      UUID   DEFAULT NULL
)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_guru TEXT := current_guru_id();
  v_n    INT;
BEGIN
  IF v_guru IS NULL THEN RETURN 0; END IF;
  UPDATE notifikasi SET dibaca_at = now()
   WHERE guru_id = v_guru
     AND dibaca_at IS NULL
     AND (id = ANY(p_ids)
          OR teaching_assessment_id = p_teaching_assessment_id
          OR kpi_assessment_id = p_kpi_assessment_id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.notifikasi_tandai_dibaca(UUID[], UUID, UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.notifikasi_tandai_dibaca(UUID[], UUID, UUID) TO authenticated;

-- ── Trigger: Penilaian Mengajar (dibuat / status berubah) ───
CREATE OR REPLACE FUNCTION public.notifikasi_dari_penilaian_mengajar()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_isi TEXT := NEW.judul || ' — ' || notifikasi_periode(NEW.bulan, NEW.tahun);
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Status apa pun yang baru berarti permintaan revisi sebelumnya sudah
  -- tidak berlaku: tutup dulu, baru buat yang baru bila perlu.
  IF TG_OP = 'UPDATE' THEN
    UPDATE notifikasi SET selesai_at = now()
     WHERE teaching_assessment_id = NEW.id AND perlu_tindakan AND selesai_at IS NULL;
  END IF;

  -- Jangan memberi tahu guru tentang perubahan yang ia buat sendiri.
  IF NEW.assignee_id IS NOT DISTINCT FROM current_guru_id() THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'Revisi' THEN
    INSERT INTO notifikasi (guru_id, jenis, judul, isi, teaching_assessment_id, perlu_tindakan)
    VALUES (NEW.assignee_id, 'penilaian_revisi', 'Penilaian mengajar perlu direvisi',
            v_isi || '. Buka penilaiannya dan balas di kolom komentar.', NEW.id, true);
  ELSIF NEW.status = 'Approve' THEN
    INSERT INTO notifikasi (guru_id, jenis, judul, isi, teaching_assessment_id)
    VALUES (NEW.assignee_id, 'penilaian_approve', 'Penilaian mengajar disetujui', v_isi, NEW.id);
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO notifikasi (guru_id, jenis, judul, isi, teaching_assessment_id)
    VALUES (NEW.assignee_id, 'penilaian_baru', 'Penilaian mengajar baru', v_isi, NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notifikasi_penilaian_mengajar ON public.teaching_assessments;
CREATE TRIGGER trg_notifikasi_penilaian_mengajar
  AFTER INSERT OR UPDATE OF status ON public.teaching_assessments
  FOR EACH ROW EXECUTE FUNCTION public.notifikasi_dari_penilaian_mengajar();

-- ── Trigger: komentar Penilaian Mengajar ────────────────────
CREATE OR REPLACE FUNCTION public.notifikasi_dari_komentar_penilaian()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ta      teaching_assessments%ROWTYPE;
  v_penulis TEXT;
  v_isi     TEXT;
BEGIN
  SELECT * INTO v_ta FROM teaching_assessments WHERE id = NEW.assessment_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Guru yang dinilai membalas → permintaan revisi terjawab, dan semua
  -- notifikasi penilaian ini jelas sudah ia lihat.
  IF NEW.guru_id = v_ta.assignee_id THEN
    UPDATE notifikasi
       SET selesai_at = CASE WHEN perlu_tindakan AND selesai_at IS NULL THEN now() ELSE selesai_at END,
           dibaca_at  = COALESCE(dibaca_at, now())
     WHERE teaching_assessment_id = NEW.assessment_id
       AND guru_id = v_ta.assignee_id
       AND (dibaca_at IS NULL OR (perlu_tindakan AND selesai_at IS NULL));
    RETURN NEW;
  END IF;

  SELECT nama INTO v_penulis FROM gurus WHERE id = NEW.guru_id;
  -- Komentar boleh kosong bila hanya berisi foto.
  v_isi := COALESCE(v_penulis, 'Penilai') || ': '
        || COALESCE(NULLIF(left(btrim(NEW.isi), 140), ''), '(mengirim foto)')
        || ' — ' || v_ta.judul;

  -- Satu notifikasi komentar yang belum dibaca per penilaian sudah cukup;
  -- komentar berikutnya memperbarui isinya alih-alih menumpuk.
  UPDATE notifikasi SET isi = v_isi, created_at = now()
   WHERE teaching_assessment_id = NEW.assessment_id
     AND guru_id = v_ta.assignee_id
     AND jenis = 'penilaian_komentar'
     AND dibaca_at IS NULL;
  IF NOT FOUND THEN
    INSERT INTO notifikasi (guru_id, jenis, judul, isi, teaching_assessment_id)
    VALUES (v_ta.assignee_id, 'penilaian_komentar', 'Komentar baru di penilaian mengajar',
            v_isi, NEW.assessment_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notifikasi_komentar_penilaian ON public.teaching_assessment_comments;
CREATE TRIGGER trg_notifikasi_komentar_penilaian
  AFTER INSERT ON public.teaching_assessment_comments
  FOR EACH ROW EXECUTE FUNCTION public.notifikasi_dari_komentar_penilaian();

-- ── Trigger: Penilaian KPI di-Approve ───────────────────────
CREATE OR REPLACE FUNCTION public.notifikasi_dari_kpi()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'Approved' AND OLD.status IS DISTINCT FROM 'Approved'
     AND NEW.guru_id IS DISTINCT FROM current_guru_id() THEN
    INSERT INTO notifikasi (guru_id, jenis, judul, isi, kpi_assessment_id)
    VALUES (NEW.guru_id, 'kpi_approve', 'Penilaian KPI disetujui',
            'KPI ' || notifikasi_periode(NEW.periode_bulan, NEW.periode_tahun)
            || COALESCE(' — skor ' || NEW.skor_akhir::TEXT, ''), NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notifikasi_kpi ON public.kpi_assessments;
CREATE TRIGGER trg_notifikasi_kpi
  AFTER UPDATE OF status ON public.kpi_assessments
  FOR EACH ROW EXECUTE FUNCTION public.notifikasi_dari_kpi();

-- ── Isi awal: penilaian yang SAAT INI berstatus Revisi ──────
-- Supaya revisi yang sudah tertunda langsung muncul begitu fitur aktif.
-- Idempoten: dilewati bila notifikasinya sudah ada.
INSERT INTO public.notifikasi (guru_id, jenis, judul, isi, teaching_assessment_id, perlu_tindakan)
SELECT ta.assignee_id, 'penilaian_revisi', 'Penilaian mengajar perlu direvisi',
       ta.judul || ' — ' || public.notifikasi_periode(ta.bulan, ta.tahun)
       || '. Buka penilaiannya dan balas di kolom komentar.',
       ta.id, true
  FROM public.teaching_assessments ta
 WHERE ta.status = 'Revisi'
   AND NOT EXISTS (SELECT 1 FROM public.notifikasi n
                    WHERE n.teaching_assessment_id = ta.id AND n.jenis = 'penilaian_revisi');

-- ── Verifikasi (hasilnya tampil sebagai tabel di SQL Editor) ─
SELECT 'tabel notifikasi' AS objek, to_regclass('public.notifikasi') IS NOT NULL AS ada
UNION ALL SELECT 'rpc notifikasi_tandai_dibaca',
       to_regprocedure('public.notifikasi_tandai_dibaca(uuid[],uuid,uuid)') IS NOT NULL
UNION ALL SELECT 'trigger penilaian mengajar',
       EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notifikasi_penilaian_mengajar')
UNION ALL SELECT 'trigger komentar',
       EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notifikasi_komentar_penilaian')
UNION ALL SELECT 'trigger kpi',
       EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notifikasi_kpi')
UNION ALL SELECT 'revisi terbuka (isi awal): ' || count(*)::TEXT, true
  FROM public.notifikasi WHERE perlu_tindakan AND selesai_at IS NULL;
