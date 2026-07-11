import { supabase } from '../lib/supabase';

// Indikator "Kualitas Mengajar" di KPI (nilai 1 = Sesuai Metode = skor penuh)
export const IND_KUALITAS_MENGAJAR = 'a0000000-0000-0000-0000-000000000007';

/**
 * Saat sebuah Penilaian Mengajar di-Approve, tandai indikator "Kualitas Mengajar"
 * pada penilaian KPI guru tsb (periode bulan/tahun sama) menjadi "Sesuai" (terpenuhi).
 *
 * Aturan:
 * - Hanya update kalau penilaian KPI-nya SUDAH ADA.
 *   (Kalau belum ada, nanti terisi otomatis saat penilaian KPI dibuat — lihat KpiAssessmentPage.)
 * - JANGAN timpa penilaian KPI yang sudah final (status 'Approved').
 * - Setelah update, skor total (skor_akhir) dihitung ulang.
 */
export async function syncKualitasMengajar({ guruId, bulan, tahun }) {
  if (!guruId || !bulan || !tahun) return;

  // 1. Cari penilaian KPI guru untuk periode tsb
  const { data: ass } = await supabase
    .from('kpi_assessments')
    .select('id, status')
    .eq('guru_id', guruId)
    .eq('periode_tahun', Number(tahun))
    .eq('periode_bulan', Number(bulan))
    .maybeSingle();

  if (!ass) return;                       // belum ada → akan di-prefill saat KPI dibuat
  if (ass.status === 'Approved') return;  // sudah final → jangan timpa

  // 2. Ambil skor penuh Kualitas Mengajar dari aturan scoring
  const { data: rule } = await supabase
    .from('kpi_scoring_rules')
    .select('skor_maksimal')
    .eq('kpi_indicator_id', IND_KUALITAS_MENGAJAR)
    .maybeSingle();
  const skorPenuh = rule?.skor_maksimal ?? 5;

  // 3. Set baris skor Kualitas Mengajar → Sesuai (nilai 1, skor penuh)
  const { error: upErr } = await supabase
    .from('kpi_scores')
    .update({ nilai_aktual: 1, nilai_skor: skorPenuh })
    .eq('kpi_assessment_id', ass.id)
    .eq('kpi_indicator_id', IND_KUALITAS_MENGAJAR);
  if (upErr) return;

  // 4. Hitung ulang skor total penilaian KPI
  const { data: scores } = await supabase
    .from('kpi_scores')
    .select('nilai_skor')
    .eq('kpi_assessment_id', ass.id);
  const total = (scores || []).reduce((s, r) => s + (Number(r.nilai_skor) || 0), 0);
  await supabase.from('kpi_assessments').update({ skor_akhir: total }).eq('id', ass.id);
}
