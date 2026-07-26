# Panduan Rilis — Kunci Lokasi Absensi

Runbook operasional untuk menayangkan fitur kunci lokasi secara bertahap.
Dokumen ini untuk Owner/Administrator, bukan untuk guru — panduan guru ada di
[PANDUAN_ABSENSI_LOKASI.md](PANDUAN_ABSENSI_LOKASI.md).

**Status per 26 Juli 2026:** frontend sudah tayang, migrasi 0017 sudah jalan,
mode global masih `senyap`.

---

## Peta singkat

| Migrasi | Isi | Risiko |
|---|---|---|
| `0017_absensi_kunci_lokasi.sql` | Mesin geofencing + RPC absensi | Sudah dijalankan |
| `0018_absensi_deteksi_anomali.sql` | View & fungsi deteksi anomali | **Nol** — aman kapan saja |
| `0019_absensi_tutup_jalur_langsung.sql` | Cabut policy `att_insert_self` | **Tinggi** — bisa membuat semua guru gagal absen kalau salah waktu |

Empat mode, dari paling longgar ke paling ketat. Jangan pernah melompat:

```
nonaktif  →  senyap  →  catat  →  blokir
                ↑
          posisi sekarang
```

---

## Tahap A — Sisa persiapan (26 Juli, malam)

- [ ] Beresi izin lokasi di perangkat penguji, ulangi uji check-in sampai kolom
      **Lokasi** di Rekap Absensi berbunyi `Dalam Area · sekian m`.
      Jangan berhenti di status `Tanpa Data`.
- [ ] **Uji check-out juga.** `absen_check_out` fungsi terpisah dengan logikanya
      sendiri (termasuk hitung `durasi_menit`) dan belum pernah dijalankan.
- [ ] Jalankan `0018_absensi_deteksi_anomali.sql`.
- [ ] Daftarkan dua path di menu **/role-setup**:
      `/absensi/verifikasi-lokasi` dan `/absensi/pengaturan`.
      Tanpa ini, Administrator dan Supervisor tidak melihat menunya.
      (Owner selalu melihat semua menu, jadi ini mudah terlewat.)
- [ ] Hapus jadwal shift uji coba supaya tidak mengotori data kalibrasi.

---

## Tahap B — Hari pertama (27 Juli)

### Pagi, sebelum guru datang

- [ ] Buka aplikasi, muat ulang paksa (`Cmd+Shift+R` / `Ctrl+Shift+R`),
      pastikan versi terbaru yang tayang.

Selebihnya tidak ada. Mode `senyap` berarti **bagi guru tidak ada yang berubah** —
tidak ada tampilan baru, tidak ada yang bisa terblokir. Jangan mengumumkan apa pun.

### Siang, setelah shift pagi selesai absen

Pemeriksaan terpenting hari itu:

```sql
SELECT
  COUNT(*)                                            AS total_absen,
  COUNT(*) FILTER (WHERE status_lokasi IS NOT NULL)   AS lewat_rpc,
  COUNT(*) FILTER (WHERE status_lokasi IS NULL)       AS jalur_lama,
  COUNT(*) FILTER (WHERE jarak_checkin_m IS NOT NULL) AS jarak_terhitung,
  COUNT(*) FILTER (WHERE status_lokasi = 'Tanpa Data') AS tanpa_data
FROM attendances
WHERE check_in >= now() - INTERVAL '12 hours';
```

Yang diharapkan: `lewat_rpc` = `total_absen`, `jalur_lama` = 0.

| Temuan | Artinya | Tindakan |
|---|---|---|
| `jalur_lama` > 0 | Ada HP yang masih memegang bundel JS lama | Minta orangnya tutup penuh aplikasi lalu buka lagi. **0019 belum boleh dijalankan.** |
| `tanpa_data` tinggi | Banyak guru menolak izin lokasi | Data kalibrasi tidak terkumpul. Perlu sosialisasi sebelum lanjut. |
| `jarak_terhitung` rendah | Koordinat cabang belum lengkap | Isi titik cabang lewat menu Unit / Cabang. |

Lalu lihat pola kegagalannya:

```sql
SELECT kode, COUNT(*) AS jumlah
FROM absensi_gagal_log
WHERE created_at >= now() - INTERVAL '12 hours'
GROUP BY kode ORDER BY jumlah DESC;
```

| Kode | Sumber masalah | Yang perlu dilakukan |
|---|---|---|
| `LOC_DENIED` | Izin lokasi ditolak di browser | Sosialisasi, bukan perubahan setelan |
| `LOC_WEAK` | Akurasi GPS buruk | Cek iPhone "Lokasi Tepat"; sarankan WiFi menyala |
| `LOC_TIMEOUT` | GPS gagal mengunci | Biasanya sementara; kalau menumpuk, cek perangkatnya |
| `OUT_OF_AREA` | Di luar radius | Radius kemungkinan kesempitan — tunggu kalibrasi |

### Sore, setelah semua shift termasuk malam selesai

- [ ] Jalankan `0019_absensi_tutup_jalur_langsung.sql`.

Migrasi ini berpengaman ganda dan **menolak berjalan sendiri** kalau syaratnya
belum terpenuhi. Pesan "Migrasi dibatalkan" **bukan kerusakan** — seluruh
transaksi dibatalkan dan tidak ada satu pun perubahan yang tersimpan.

Verifikasi hasilnya:

```sql
SELECT policyname FROM pg_policies
WHERE tablename = 'attendances' AND policyname = 'att_insert_self';
```

- **0 baris** → berhasil, celah bypass tertutup
- **1 baris** → belum jalan, policy masih ada

---

## Tahap C — Kalibrasi (sekitar 10 Agustus, setelah 2 minggu data)

Radius bawaan 150 m masih **tebakan**. Jangan naikkan mode sebelum menggantinya
dengan angka dari data nyata.

```sql
SELECT u.nama,
       COUNT(*) AS total,
       ROUND(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY a.jarak_checkin_m)) AS p90_m,
       ROUND(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY a.jarak_checkin_m)) AS p99_m,
       MAX(a.jarak_checkin_m) AS terjauh_m
FROM attendances a JOIN units u ON u.id = a.unit_id
WHERE a.jarak_checkin_m IS NOT NULL
  AND a.tanggal >= (now() AT TIME ZONE 'Asia/Jakarta')::date - 14
GROUP BY u.nama;
```

**Pakai persentil, jangan rata-rata.** Satu pencilan bisa melebarkan radius untuk
semua orang.

Patokan: setel radius di sekitar **p99**, dibulatkan ke atas.

> Kalau p99 sebuah cabang ternyata ribuan meter, itu **bukan** tanda radiusnya
> kurang lebar — itu tanda memang ada yang absen dari rumah. Justru itu temuan
> yang Anda cari sejak awal.

- [ ] Setel radius tiap cabang di menu **Unit / Cabang**
- [ ] Bagikan [PANDUAN_ABSENSI_LOKASI.md](PANDUAN_ABSENSI_LOKASI.md) ke semua guru
- [ ] Beri tenggang beberapa hari supaya mereka sempat memasang aplikasi ke layar
      utama dan membetulkan setelan iPhone
- [ ] Baru naikkan mode global ke **`catat`** lewat menu Pengaturan Lokasi

Di mode `catat`, absen dari luar area **tetap berhasil** tapi ditandai dan masuk
menu Verifikasi Lokasi. Tidak ada yang terkunci.

---

## Tahap D — Penegakan (setelah `catat` berjalan tenang)

Naikkan ke `blokir` **per cabang**, bukan serentak. Mulai dari cabang yang datanya
paling bersih dan gurunya paling sedikit bermasalah dengan perangkat.

Syarat sebuah cabang layak dinaikkan:

- Angka `LOC_DENIED` dan `LOC_WEAK` cabang itu sudah mendekati nol
- Radiusnya sudah dikalibrasi dari data nyata
- Sudah beberapa minggu di mode `catat` tanpa keluhan berulang

Setelan per cabang ada di menu **Unit / Cabang** → kolom Mode Kunci.

---

## Kalau ada yang gawat

**Guru tidak bisa absen sama sekali.**
Jangan utak-atik SQL. SPV bisa mengabsenkan manual — policy admin sengaja tidak
pernah dicabut justru untuk ini. Absenkan manual dulu, kumpulkan pesan errornya,
baru cari sebabnya.

**Banyak cabang terkunci sekaligus setelah mode dinaikkan.**
Menu **Pengaturan Lokasi** → nyalakan **Saklar Darurat**. Semua cabang bermode
`blokir` langsung turun ke `catat`, absen kembali lolos, tanpa menyentuh SQL.
Matikan lagi setelah beres.

**Perlu membatalkan 0019.**

```sql
CREATE POLICY "att_insert_self" ON attendances FOR INSERT
  WITH CHECK (guru_id = absensi_guru_id());
```

Perlu diingat: mengembalikan policy ini saja tidak cukup untuk memulihkan absensi,
karena frontend sudah tidak punya jalur mundur. Kalau masalahnya di aplikasi,
yang benar adalah rollback deploy di Vercel.

---

## Yang perlu diingat sepanjang rilis

**Mode `senyap` tidak pernah menolak absen siapa pun.** Apa pun hasil pembacaan
GPS-nya, absen tetap lolos. Selama masih di mode ini, tidak ada risiko guru
terkunci.

**Aplikasi web tidak bisa mendeteksi Fake GPS.** Tidak ada API browser yang
membedakan koordinat palsu dari asli — itu butuh aplikasi native. Deteksi anomali
menaikkan risiko ketahuan, bukan bukti. Foto selfie yang menutup celah "titip
absen ke teman", bukan lokasi. Jangan matikan `wajib_foto`.

**Celah yang masih terbuka:** policy `att_update` mengizinkan guru mengubah baris
absensinya sendiri, termasuk membalik status Telat menjadi Hadir lewat panggilan
API langsung. Ini bukan celah baru, tapi jadi lebih menonjol setelah INSERT
dikunci. Penjelasan dan cara menutupnya ada di dalam `0019`, bagian 2.
