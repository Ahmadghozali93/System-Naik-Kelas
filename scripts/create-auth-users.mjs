#!/usr/bin/env node
/**
 * create-auth-users.mjs
 * ------------------------------------------------------------
 * Membuat akun Supabase Auth untuk setiap baris `gurus` yang belum ter-link.
 * Dipakai saat migrasi dari sistem password-plaintext lama ke Supabase Auth.
 *
 * Aman & idempotent: kalau auth user sudah ada / sudah ter-link, dilewati.
 * Trigger DB `on_auth_user_created` otomatis mengisi kolom gurus.auth_user_id.
 *
 * CARA PAKAI:
 *   SUPABASE_URL=...  SUPABASE_SERVICE_ROLE_KEY=...  TEMP_PASSWORD=Rahasia123 \
 *   node scripts/create-auth-users.mjs
 *
 * - SUPABASE_URL                : URL project (lokal: http://127.0.0.1:54321)
 * - SUPABASE_SERVICE_ROLE_KEY   : service_role key (JANGAN pernah dipakai di frontend)
 * - TEMP_PASSWORD               : password sementara untuk semua guru (mereka ganti nanti)
 *
 * Catatan keamanan: password lama yang bocor sengaja TIDAK dibawa.
 * Setiap guru memakai password sementara, lalu disarankan reset/ganti.
 */
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TEMP = process.env.TEMP_PASSWORD || 'BimbelTemp123!';

if (!URL || !KEY) {
  console.error('❌ Set dulu SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const admin = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  // Ambil guru yang belum punya auth_user_id
  const { data: gurus, error } = await admin
    .from('gurus')
    .select('id, email, nama, auth_user_id')
    .is('auth_user_id', null);

  if (error) { console.error('❌ Gagal membaca tabel gurus:', error.message); process.exit(1); }
  if (!gurus.length) { console.log('✅ Semua guru sudah ter-link. Tidak ada yang dibuat.'); return; }

  console.log(`Menemukan ${gurus.length} guru tanpa akun auth. Membuat...\n`);
  const hasil = [];

  for (const g of gurus) {
    if (!g.email) { hasil.push({ nama: g.nama, status: 'DILEWATI (email kosong)' }); continue; }

    const { error: createErr } = await admin.auth.admin.createUser({
      email: g.email,
      password: TEMP,
      email_confirm: true,                 // langsung aktif, tanpa email konfirmasi
      user_metadata: { nama: g.nama || '' },
    });

    if (createErr) {
      // kemungkinan user sudah ada -> coba link manual via email
      hasil.push({ email: g.email, status: `LEWAT (${createErr.message})` });
    } else {
      hasil.push({ email: g.email, status: 'DIBUAT', password: TEMP });
    }
  }

  console.table(hasil);
  console.log('\nSelesai. Bagikan password sementara ke masing-masing guru dan minta segera diganti.');
}

main().catch((e) => { console.error(e); process.exit(1); });
