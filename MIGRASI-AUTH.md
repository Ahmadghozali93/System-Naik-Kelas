# MIGRASI-AUTH — Panduan Perbaikan Keamanan (Lokal dulu, Produksi aman)

Dokumen ini memandu kamu memperbaiki 3 masalah kritis **di lokal**, pakai **salinan** backend Supabase, tanpa menyentuh aplikasi yang sedang dipakai.

## Apa yang diperbaiki
1. **Password plaintext** → dipindah ke Supabase Auth (terenkripsi). Kolom `gurus.password` dihapus.
2. **Login cuma di sisi browser** (bisa dibypass via localStorage) → diganti sesi/JWT Supabase Auth asli.
3. **RLS terbuka** (`USING(true)`) yang bikin seluruh DB bisa dibaca/ditulis siapa saja → diganti aturan berbasis peran (Admin/Guru) + akses publik (anon) yang dibatasi ketat.

---

## Persiapan (sekali saja)
1. Install **Docker Desktop** (Supabase lokal jalan di atas Docker).
2. Install **Supabase CLI**: https://supabase.com/docs/guides/cli
3. Di folder repo, struktur `supabase/` sudah disiapkan:
   ```
   supabase/
     config.toml
     migrations/0001_baseline_schema.sql      # struktur tabel (tanpa policy/seed)
     migrations/0002_auth_link_and_helpers.sql # link ke Auth + fungsi peran
     migrations/0003_rls_policies.sql          # RLS berbasis peran
     migrations/0004_signup_sync_trigger.sql   # auto-link guru lama / signup baru
     migrations/0005_drop_plaintext_password.sql # buang kolom password (paling akhir)
     seed.sql                                   # data dummy LOKAL saja
   scripts/create-auth-users.mjs                # bikin akun Auth utk guru lama
   ```

---

## JALUR A — Backend lokal dari NOL (cepat untuk eksperimen)
Cocok kalau cuma mau mencoba alurnya tanpa data asli.

```bash
supabase start                 # menjalankan Postgres + Auth + Studio lokal
supabase db reset              # menjalankan semua migrasi 0001..0005 lalu seed.sql
```

`supabase start` akan mencetak **API URL** dan **anon key** lokal. Masukkan ke `.env`:
```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<anon key dari output supabase start>
```

Buat akun Auth untuk 2 guru dummy (admin & budi):
```bash
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_SERVICE_ROLE_KEY=<service_role key dari supabase start> \
TEMP_PASSWORD=Rahasia123 \
node scripts/create-auth-users.mjs
```

Jalankan app: `npm run dev` → login pakai `admin@bimbel.com` / `Rahasia123`.

---

## JALUR B — Salinan dari PRODUKSI (disarankan, karena app sudah dipakai)
Tujuannya: uji perbaikan di atas **struktur + data asli** tanpa menyentuh produksi.

### 1. Ambil salinan dari produksi ke lokal
```bash
supabase start
# Dump struktur + data dari produksi (butuh connection string DB produksi)
supabase db dump --db-url "postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres" -f dump_prod.sql
# Muat ke DB lokal
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f dump_prod.sql
```
> Connection string ada di Supabase Dashboard produksi → Project Settings → Database.
> Kalau khawatir PII, kamu bisa dump struktur saja (`--data-only=false`) atau menyensor data sensitif sebelum diuji.

### 2. Terapkan HANYA migrasi pengetatan (jangan 0005 dulu)
Salinan sudah punya semua tabel dari produksi, jadi lewati `0001`. Terapkan berurutan:
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -f supabase/migrations/0002_auth_link_and_helpers.sql \
  -f supabase/migrations/0003_rls_policies.sql \
  -f supabase/migrations/0004_signup_sync_trigger.sql
```

### 3. Buat akun Auth untuk semua guru lama
```bash
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_SERVICE_ROLE_KEY=<service_role lokal> \
TEMP_PASSWORD=GantiNanti123 \
node scripts/create-auth-users.mjs
```
Trigger akan otomatis mengisi `gurus.auth_user_id` (cocokkan via email). Cek:
```sql
SELECT nama, email, (auth_user_id IS NOT NULL) AS sudah_terlink FROM gurus;
```

### 4. Uji login semua peran di app lokal
- Admin bisa masuk & akses semua menu.
- Guru bisa masuk, **tidak** bisa ubah data master.
- Halaman publik (Landing & Pengajuan Reschedule) tetap jalan tanpa login.

### 5. Baru buang password plaintext (langkah TERAKHIR)
Setelah semua login terverifikasi:
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -f supabase/migrations/0005_drop_plaintext_password.sql
```

---

## Checklist uji RLS (yang sudah saya verifikasi di lokal)
- [ ] Anon **tidak** bisa membaca tabel `gurus` (kredensial) maupun `siswa` (PII).
- [ ] Anon **boleh** kirim booking (INSERT siswa status `Booking`) tapi **tidak** bisa set status `Aktif`.
- [ ] Anon **tidak** bisa DELETE/UPDATE apa pun.
- [ ] Guru cuma melihat profil sendiri di `gurus`, **tidak** bisa menulis data master (units/programs/dll).
- [ ] Guru cuma bisa ubah/hapus **jurnal miliknya**.
- [ ] Admin punya akses penuh.
- [ ] Signup baru otomatis jadi **Guru / Tidak Aktif** (tidak bisa daftar langsung jadi Admin).

## Promote ke produksi (NANTI, setelah yakin)
Lakukan saat kamu sudah puas dengan hasil di lokal:
1. **Backup** dulu DB produksi.
2. Aktifkan Email provider di Supabase Auth (Dashboard produksi).
3. Jalankan `0002`, `0003`, `0004` di produksi.
4. Jalankan `create-auth-users.mjs` menunjuk ke **produksi**.
5. Verifikasi login beberapa guru.
6. Terakhir jalankan `0005` (buang password).

> Saran: lakukan langkah produksi di jam sepi, dan siapkan rencana rollback (restore backup) seandainya ada yang meleset.

## Catatan tindak lanjut (belum dikerjakan, opsional)
- Halaman publik Pengajuan Reschedule masih membaca sebagian kolom `aktivasi_siswa`/`reschedules` (mis. `nama_siswa`). Untuk privasi lebih ketat, ganti akses langsung anon dengan **fungsi RPC SECURITY DEFINER** yang hanya mengembalikan data seperlunya.
- Bundle JS masih ~1.1 MB; bisa di-_code-split_ (lazy-load per route) untuk loading lebih cepat.
