# Panduan Modul Gaji (Payroll) — System Naik Kelas

Panduan langkah demi langkah, ditulis untuk pengguna non-teknis.
Ikuti berurutan. Bagian 1–4 hanya dilakukan **sekali di awal**.
Bagian 5 adalah **rutinitas tiap bulan**.

---

## Peta singkat

| Bagian | Isi | Seberapa sering |
|---|---|---|
| 1 | Pasang mesinnya di Supabase | Sekali |
| 2 | Beri izin & aktifkan menu | Sekali |
| 3 | Susun aturan gaji | Sekali, lalu sesekali diubah |
| 4 | Pasang gaji ke tiap karyawan | Saat ada karyawan baru / gaji naik |
| 5 | Proses gaji bulanan | Tiap bulan |
| 6 | Pindahkan data payroll lama | Sekali (opsional) |
| 7 | Kalau ada masalah | Saat perlu |

---

# BAGIAN 1 — Pasang mesinnya di Supabase

Dilakukan **sekali saja**. Kalau sudah pernah, lompat ke Bagian 2.

### Cara membuka SQL Editor
1. Buka **supabase.com**, login
2. Pilih project **System Naik Kelas**
3. Menu kiri → klik **SQL Editor**
4. Klik **+ New query**

Di kotak yang muncul itulah semua perintah di bawah ditempelkan.

### Langkah 1.1 — Buat lemari penyimpanannya
- Buka file `supabase/migrations/0006_payroll_fleksibel.sql`
- Salin **seluruh isinya**, tempel ke SQL Editor, klik **Run**
- Berhasil kalau muncul **"Success"**

### Langkah 1.2 — Pasang mesin hitungnya
- Buka file `supabase/migrations/0007_payroll_mesin_hitung.sql`
- Salin seluruh isinya → tempel → **Run**

### Langkah 1.3 — (Disarankan) Uji mesinnya
- Buka file `supabase/migrations/0007b_uji_mesin_payroll.sql`
- Salin seluruh isinya → tempel → **Run**
- Kalau muncul kotak peringatan **"Potential issue detected"**, pilih **"Run without RLS"** (aman — itu cuma tabel coretan sementara)
- Lihat tabel hasilnya, **baris paling bawah (no 99)** harus tertulis **`SEMUA LULUS`**

> Script ini membuat data contoh lalu membuangnya sendiri. Data aslimu tidak tersentuh.

---

# BAGIAN 2 — Beri izin & aktifkan menu

### Langkah 2.1 — Beri dirimu izin mengelola gaji
1. Di Supabase, menu kiri → **Table Editor**
2. Pilih tabel **`gurus`**
3. Cari barismu sendiri
4. Kolom **`boleh_kelola_payroll`** → ubah jadi **`true`** → simpan

> Kalau kamu ber-role **Owner**, langkah ini boleh dilewati — Owner otomatis punya akses.

### Langkah 2.2 — Aktifkan menunya di aplikasi
1. Buka aplikasi → menu **Pengaturan → Setup Hak Akses**
2. Centang 4 menu ini untuk role yang berhak:
   - `Gaji - Komponen Gaji`
   - `Gaji - Paket Gaji`
   - `Gaji - Gaji per Karyawan`
   - `Gaji - Periode Penggajian`
3. Klik **Simpan Perubahan**
4. **Muat ulang halaman** — menu **Gaji** akan muncul di sidebar

---

# BAGIAN 3 — Susun aturan gaji

Semua diisi lewat **menu Gaji → Komponen Gaji**. Kamu tidak perlu tahu istilah teknis apa pun.

### Memahami 4 cara menghitung

| Cara Menghitung | Artinya | Contoh |
|---|---|---|
| **Nominal Tetap** | Angka pasti tiap bulan | Gaji pokok, tunjangan |
| **Per Unit** | Jumlah tatap muka × tarif | Fee mengajar |
| **Bersyarat** | Cair penuh kalau syarat terpenuhi | Bonus kehadiran |
| **Bertingkat** | Tangga pencapaian | Bonus sesuai skor KPI |

---

### Langkah 3.1 — Gaji Pokok

1. Menu **Gaji → Komponen Gaji** → klik **Tambah Komponen**
2. Isi:
   - **Kode**: `GAJI_POKOK`
   - **Nama**: `Gaji Pokok`
   - **Kategori**: Pendapatan (menambah gaji)
   - **Berlaku di Cabang**: *Semua cabang* (atau pilih satu)
   - **Cara Menghitung**: **Nominal Tetap**
3. Di bagian **Pengaturan**, isi **Nominal per Bulan**

   > Angka di sini adalah **nilai bawaan**. Nanti tiap karyawan bisa punya nominal sendiri. Kalau semua karyawan beda-beda, isi saja `0` di sini.

4. Centang **Aktifkan komponen ini** → **Simpan**

---

### Langkah 3.2 — Fee Tatap Muka

Ini yang paling banyak pengaturannya. Sumber datanya adalah **menu Jurnal Mengajar**.

1. **Tambah Komponen** → Kode `FEE_TM`, Nama `Fee Tatap Muka`, Kategori **Pendapatan**
2. **Cara Menghitung**: **Per Unit**
3. Di bagian Pengaturan:

   **a. Tarif per Program**
   - Klik **+ Tambah baris tarif**
   - Pilih **program** dari daftar, isi **tarifnya**
   - Ulangi untuk tiap program yang punya tarif berbeda

   > ⚠️ **Penting:** jurnal dengan program **di luar daftar ini tidak akan dibayar**, dan akan muncul sebagai peringatan di slip. Ini disengaja supaya kamu tahu ada data yang perlu dibetulkan — bukan diam-diam dianggap nol.

   **b. Batas Jurnal per Hari**
   - Isi angka wajar, misal `6`. Kalau dikosongkan = tanpa batas
   - Kelebihannya tidak dibayar, dan slipnya ditandai **"perlu ditinjau"**

   **c. Hanya hitung jurnal terverifikasi**
   - 🔴 **JANGAN dicentang.** Fitur verifikasi jurnal belum ada. Kalau dicentang, perhitungan akan ditolak.

4. Centang **Aktifkan** → **Simpan**

> **Cara menghitungnya:** 1 baris jurnal = 1 siswa = 1 unit dibayar. Kalau mengajar kelas berisi 5 anak dan dibuat 5 baris jurnal, dihitung 5 unit.

---

### Langkah 3.3 — Bonus Kehadiran

1. **Tambah Komponen** → Kode `BONUS_HADIR`, Nama `Bonus Kehadiran`, Kategori **Pendapatan**
2. **Cara Menghitung**: **Bersyarat**
3. Di bagian Pengaturan:
   - **Nominal Bonus** — misal `300000`
   - **Status Absensi yang Menghanguskan Bonus** — centang misalnya `Alpha`
   - **Batas Toleransi Telat** — misal `2` (artinya telat 3× ke atas → bonus hangus). Kosongkan = tidak ada toleransi sama sekali
   - **Kalau Melanggar** — pilih *Hangus total* atau *Dipotong proporsional*
4. Centang **Aktifkan** → **Simpan**

---

### Langkah 3.4 — Bonus KPI

1. **Tambah Komponen** → Kode `BONUS_KPI`, Nama `Bonus Target KPI`, Kategori **Pendapatan**
2. **Cara Menghitung**: **Bertingkat**
3. Di bagian Pengaturan → klik **+ Tambah tangga** beberapa kali:

   | Skor ≥ | Dapat Rp |
   |---|---|
   | 90 | 500.000 |
   | 80 | 300.000 |
   | 70 | 150.000 |

   > Yang dipakai adalah **tangga tertinggi yang tercapai**. Skor 85 → dapat 300.000.

4. **Kalau Skor KPI Belum Diinput** — pilih salah satu:
   - *Anggap nol, beri peringatan* ← disarankan
   - *Lewati komponen ini*
   - *Blokir — periode tidak bisa dihitung*
5. Centang **Aktifkan** → **Simpan**

---

### Langkah 3.5 — Potongan (kalau perlu)

Caranya sama, cukup pilih **Kategori: Potongan (mengurangi gaji)**. Contoh: denda, potongan seragam.

---

### Langkah 3.6 — (Opsional) Paket Gaji

Supaya tidak memasang komponen satu-satu tiap ada karyawan baru.

1. Menu **Gaji → Paket Gaji** → **Buat Paket**
2. Nama misal `Guru Tetap` → **Simpan**
3. Klik paketnya, lalu pilih komponen dari dropdown → **Tambah**. Ulangi.

---

# BAGIAN 4 — Pasang gaji ke tiap karyawan

Menu **Gaji → Gaji per Karyawan**.

1. Pilih **karyawan** di daftar sebelah kiri
2. Klik **Tambah Komponen**:
   - **Komponen** — pilih dari daftar
   - **Nominal Khusus Karyawan Ini** — isi kalau nominalnya berbeda dari bawaan. Kosongkan = ikut aturan komponen
   - **Berlaku Mulai** — tanggal mulai berlaku
   - **Berlaku Sampai** — kosongkan kalau masih berlaku sampai sekarang
3. **Simpan**

Atau klik **Pasang dari Paket** untuk memasang sekaligus.

### ⚠️ Aturan penting: kalau gaji naik

**JANGAN mengubah baris yang lama.** Caranya:
1. Baris lama → isi **Berlaku Sampai** = hari terakhir gaji lama (misal `30 Juni 2026`)
2. Tambah **baris baru** dengan nominal baru, **Berlaku Mulai** = `1 Juli 2026`

> Dengan begitu, slip bulan Juni tetap memakai angka lama. Kalau langsung diubah, slip lama ikut berubah — itu berbahaya.

Kalau tanggalnya bertabrakan, sistem akan menolak dan memberi tahu.

---

# BAGIAN 5 — Proses gaji bulanan

### Langkah 5.1 — Uji coba dulu (sangat disarankan pertama kali)

1. Menu **Gaji → Komponen Gaji** → klik **Uji Coba Hitung**
2. Pilih **karyawan**, **bulan**, **tahun** → klik **Hitung Sekarang**
3. Muncul rincian gajinya **tanpa menyimpan apa pun**
4. **Bandingkan dengan hitungan manualmu.** Kalau beda, perbaiki dulu pengaturannya

> Aman dicoba berkali-kali.

### Langkah 5.2 — Buat periode

1. Menu **Gaji → Periode Penggajian** → **Buat Periode**
2. Pilih **Cabang**, **Bulan**, **Tahun** → **Buat**

### Langkah 5.3 — Hitung semua

1. Klik periode yang baru dibuat
2. Klik **Hitung Semua** → konfirmasi
3. Muncul tabel semua karyawan beserta gajinya

### Langkah 5.4 — Periksa hasilnya

- Baris bertanda **"perlu ditinjau"** (kuning) = ada yang perlu dicek
- **Klik baris karyawan** → muncul slipnya di bawah
- Di slip, klik **"lihat rincian jurnal"** untuk melihat jurnal mana yang dibayar dan mana yang tidak, **beserta alasannya**

> Ini yang kamu tunjukkan kalau ada guru protes soal jumlah fee.

### Langkah 5.5 — Penyesuaian manual (kalau perlu)

Untuk kejadian sekali jalan, misal honor try out.

1. Buka slip karyawan → klik **+ Penyesuaian Manual**
2. Isi **Nama**, **Jenis** (menambah/mengurangi), **Nominal**, dan **Alasan** (wajib)
3. **Tambahkan**

### Langkah 5.6 — Kunci periode

Kalau semua sudah benar:
1. Klik **Kunci Periode** → konfirmasi
2. Setelah dikunci, **angka tidak bisa diubah lagi** — tidak bisa dihitung ulang, tidak bisa ditambah penyesuaian

### Langkah 5.7 — Tandai sudah dibayar

Setelah gaji benar-benar ditransfer:
1. Klik **Tandai Sudah Dibayar**
2. Barulah slip bisa dilihat oleh masing-masing karyawan

> Karyawan **hanya** bisa melihat slipnya sendiri, dan **hanya** yang sudah berstatus *dibayar*.

---

# BAGIAN 6 — Pindahkan data payroll lama (opsional)

Hanya kalau kamu mau memindahkan data dari menu Payroll lama.

### Langkah 6.1 — Lihat dulu (aman, tidak mengubah apa pun)
- Jalankan `supabase/migrations/0008a_pratinjau_migrasi_payroll.sql`
- Muncul daftar apa saja yang akan dipindah

### Langkah 6.2 — Jalankan migrasi
- Jalankan `supabase/migrations/0008_migrasi_payroll_lama.sql`
- Di akhir muncul ringkasan berapa baris yang dipindah

### Langkah 6.3 — Periksa di aplikasi
- **Komponen Gaji** → komponen lama muncul dengan kode berawalan `LAMA...`
- **Gaji per Karyawan** → cek beberapa guru
- **Periode Penggajian** → buka slip lama, bandingkan dengan menu Payroll lama

### Langkah 6.4 — Kalau tidak sesuai, batalkan
- Jalankan `supabase/migrations/0008b_rollback_migrasi_payroll.sql`
- Semua hasil migrasi terhapus, data lama tetap utuh, bisa diulang

> Menu Payroll lama **tetap berfungsi**. Jangan dimatikan sampai kamu yakin yang baru sudah benar.

---

# BAGIAN 7 — Kalau ada masalah

| Pesan / Gejala | Artinya | Yang harus dilakukan |
|---|---|---|
| *"Komponen belum bisa diaktifkan..."* | Ada pengaturan yang belum diisi | Baca daftarnya, lengkapi |
| *"wajib_terverifikasi belum didukung"* | Saklar verifikasi jurnal tercentang | Buka komponen, hilangkan centangnya |
| *"Periode sudah terkunci..."* | Periode sudah dikunci | Tidak bisa diubah. Ini memang disengaja |
| *"komponen ini sudah terpasang pada rentang tanggal yang bertabrakan"* | Masa berlaku bertumpuk | Isi **Berlaku Sampai** pada baris lama dulu |
| Slip bertanda **"perlu ditinjau"** | Ada peringatan | Buka slipnya, baca kotak kuning di bawah |
| Guru tidak muncul saat Hitung Semua | Belum punya komponen, atau bukan anggota cabang itu | Cek **Gaji per Karyawan** dan keanggotaan unitnya |
| Fee tatap muka lebih kecil dari perkiraan | Ada jurnal yang tidak dibayar | Klik **"lihat rincian jurnal"**, baca kolom alasan |
| Menu Gaji tidak muncul | Izin belum diaktifkan | Ulangi Bagian 2 |

---

# BAGIAN 8 — Hal yang perlu kamu ingat

### 1. Jurnal masih bisa diubah setelah gaji dibayar
Guru membuat jurnalnya sendiri, dan dibayar berdasarkan jurnal itu. Saat ini **belum ada verifikasi**, dan jurnal **masih bisa diedit/dihapus** bahkan setelah gaji cair.

Yang **sudah** dijaga sistem: jurnal duplikat hanya dibayar sekali, kelebihan batas harian ditandai, dan program tanpa tarif tidak dibayar diam-diam.

### 2. Status absensi masih berupa tulisan bebas
`Hadir` / `Telat` / `Alpha` tidak punya daftar resmi. Kalau ada salah ketik, perhitungan bonus bisa meleset.

### 3. Slip yang sudah dikunci tidak berubah selamanya
Nama komponen **disalin** ke slip, bukan disambung. Jadi kalau tahun depan nama komponen diganti, slip lama tetap seperti aslinya — seperti struk belanja.

### 4. Semua pembulatan ke rupiah penuh
Tidak ada angka koma di slip.

### 5. Hitung ulang selalu memberi hasil sama
Selama data pendukungnya tidak berubah, menghitung ulang tidak akan mengubah angka.

---

# Ringkasan rutinitas bulanan

```
1. Uji Coba Hitung untuk 1–2 guru        (pastikan wajar)
2. Periode Penggajian → Buat Periode
3. Hitung Semua
4. Periksa yang bertanda "perlu ditinjau"
5. Penyesuaian manual bila ada
6. Kunci Periode
7. Transfer gaji
8. Tandai Sudah Dibayar
```
