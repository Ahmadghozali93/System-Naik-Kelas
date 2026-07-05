// Edge Function: cleanup-task-photos
// Hapus foto lampiran task yang sudah expired (>45 hari) dari Supabase Storage
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

// Jadwal otomatis: jalan setiap tengah malam WIB (17:00 UTC)
Deno.cron('cleanup-task-photos-cron', '0 17 * * *', doCleanup);

// HTTP handler untuk trigger manual
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

async function doCleanup() {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Cari foto yang sudah expired tapi storage_path masih ada (belum dihapus)
  const { data: expired, error: queryError } = await supabase
    .from('task_attachments')
    .select('id, storage_path')
    .eq('is_expired', true)
    .is('storage_deleted_at', null)
    .not('storage_path', 'is', null)
    .limit(200);

  if (queryError) {
    console.error('Query error:', queryError.message);
    return { processed: 0, error: queryError.message };
  }

  // Tandai is_expired untuk yang belum ditandai (safety-net, pg_cron seharusnya sudah handle ini)
  await supabase
    .from('task_attachments')
    .update({ is_expired: true })
    .lt('expires_at', new Date().toISOString())
    .eq('is_expired', false);

  if (!expired || expired.length === 0) {
    console.log('Tidak ada foto expired untuk dibersihkan.');
    return { processed: 0, error: null };
  }

  // Hapus file dari Storage (batch)
  const paths = expired.map((a) => a.storage_path).filter(Boolean) as string[];
  const { error: storageError } = await supabase.storage
    .from('task-photos')
    .remove(paths);

  if (storageError) {
    // Non-fatal: file mungkin sudah tidak ada, tetap lanjutkan update DB
    console.warn('Storage deletion warning:', storageError.message);
  }

  // Tandai storage_deleted_at di DB
  const ids = expired.map((a) => a.id);
  const { error: updateError } = await supabase
    .from('task_attachments')
    .update({
      storage_deleted_at: new Date().toISOString(),
      storage_path: null,
    })
    .in('id', ids);

  const result = {
    processed: expired.length,
    storage_error: storageError?.message || null,
    db_error: updateError?.message || null,
    error: updateError?.message || null,
  };

  console.log('Cleanup result:', JSON.stringify(result));
  return result;
}
