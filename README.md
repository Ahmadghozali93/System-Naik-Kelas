# System Naik Kelas — Aplikasi Jadwal Bimbel

Aplikasi manajemen operasional bimbingan belajar (multi-cabang): data master, penjadwalan, aktivasi siswa, reschedule, jurnal, dan papan Kanban. Dibangun dengan React 19 + Vite, dengan Supabase sebagai backend.

## Tech Stack
- **Frontend:** React 19, React Router v7, Vite 7
- **Backend:** Supabase (PostgreSQL)
- **UI/Util:** lucide-react (ikon), @hello-pangea/dnd (drag & drop Kanban), Leaflet (peta), date-fns, xlsx (export Excel)
- **PWA:** Service worker (network-first)

## Menjalankan secara lokal

```bash
npm install
cp .env.example .env   # lalu isi kredensial Supabase
npm run dev
```

### Environment variables
Buat file `.env` di root (lihat `.env.example`):

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxxx
```

> File `.env` sudah masuk `.gitignore` — jangan pernah di-commit.

## Script
| Perintah | Fungsi |
|----------|--------|
| `npm run dev` | Jalankan dev server |
| `npm run build` | Build produksi ke `dist/` |
| `npm run preview` | Preview hasil build |
| `npm run lint` | Cek ESLint |

## Setup Database
Jalankan file SQL di folder root pada SQL Editor Supabase, sesuai urutan kebutuhan
(`supabase_schema.sql` lebih dulu sebagai dasar, lalu file migrasi lainnya).

## Struktur Halaman
- **Master:** User, Unit, Siswa, Program, Jadwal Master
- **Operasional:** Aktivasi Rutin/Harian, Kanban, Booking, Jadwal Kosong, Reschedule, Jurnal
- **Sistem:** Login, Role Setup, Dashboard, Settings, Landing Page, Pengajuan Reschedule (publik)

## Catatan Keamanan
Auth & RLS sedang dalam proses pengetatan (migrasi ke Supabase Auth + RLS berbasis sesi).
Lihat catatan audit untuk detail.
