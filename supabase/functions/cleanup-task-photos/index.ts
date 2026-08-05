// Edge Function: cleanup-task-photos
// Hapus foto lampiran yang sudah expired (>45 hari) dari Supabase Storage.
// Memproses dua tabel yang memakai bucket 'task-photos':
//   - task_attachments                   (Task Management)
//   - teaching_assessment_attachments    (Penilaian Mengajar)
//
// Cara deploy:
//   supabase functions deploy cleanup-task-photos
// Atau paste kode ini di Supabase Dashboard → Edge Functions → New Function
//
// Cara trigger manual (untuk tes):
//   POST https://<project>.supabase.co/functions/v1/cleanup-task-photos
//   Header: Authorization: Bearer <service_role_key>
//
// Cek logs: Supabase Dashboard → Edge Functions → cleanup-task-photos → Logs

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Jadwal ditangani pg_cron di database. Function ini dipanggil via HTTP.
// HTTP handler untuk trigger manual / dipanggil pg_cron
Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  const result = await doCleanup();
  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
    status: result.error ? 500 : 200,
  });
});

// Tabel lampiran yang strukturnya sama & memakai bucket 'task-photos'
const TABLES = ['task_attachments', 'teaching_assessment_attachments'];

async function doCleanup() {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const perTable: Record<string, unknown> = {};
  let processed = 0;
  let error: string | null = null;

  for (const table of TABLES) {
    const res = await cleanupTable(supabase, table);
    perTable[table] = res;
    processed += res.processed;
    // Error tabel satu tidak menghentikan tabel lain; laporkan yang pertama muncul
    if (res.error && !error) error = `${table}: ${res.error}`;
  }

  const result = { processed, tables: perTable, error };
  console.log('Cleanup result:', JSON.stringify(result));
  return result;
}

async function cleanupTable(supabase: any, table: string) {
  // Cari foto yang sudah expired tapi storage_path masih ada (belum dihapus)
  const { data: expired, error: queryError } = await supabase
    .from(table)
    .select('id, storage_path')
    .eq('is_expired', true)
    .is('storage_deleted_at', null)
    .not('storage_path', 'is', null)
    .limit(200);

  if (queryError) {
    console.error(`Query error (${table}):`, queryError.message);
    return { processed: 0, error: queryError.message };
  }

  // Tandai is_expired untuk yang belum ditandai (safety-net, pg_cron seharusnya sudah handle ini)
  await supabase
    .from(table)
    .update({ is_expired: true })
    .lt('expires_at', new Date().toISOString())
    .eq('is_expired', false);

  if (!expired || expired.length === 0) {
    console.log(`Tidak ada foto expired untuk dibersihkan (${table}).`);
    return { processed: 0, error: null };
  }

  // Hapus file dari Storage (batch)
  const paths = expired.map((a: any) => a.storage_path).filter(Boolean) as string[];
  const { error: storageError } = await supabase.storage
    .from('task-photos')
    .remove(paths);

  if (storageError) {
    // Non-fatal: file mungkin sudah tidak ada, tetap lanjutkan update DB
    console.warn(`Storage deletion warning (${table}):`, storageError.message);
  }

  // Tandai storage_deleted_at di DB
  const ids = expired.map((a: any) => a.id);
  const { error: updateError } = await supabase
    .from(table)
    .update({
      storage_deleted_at: new Date().toISOString(),
      storage_path: null,
    })
    .in('id', ids);

  return {
    processed: expired.length,
    storage_error: storageError?.message || null,
    db_error: updateError?.message || null,
    error: updateError?.message || null,
  };
}
