// Baris pembayaran_spp untuk satu tagihan — dipakai tombol Bayar di
// Tagihan Siswa dan validasi di Log SPP, supaya keduanya mencatat
// pembayaran dengan cara yang persis sama.
import { toProperCase } from './formatRupiah';
import { buildTagihan } from './tagihan';
import { supabase } from '../lib/supabase';

export const METODE = ['Tunai','BNI','Xendit'];

export const genPayId = () => 'PAY-' + Math.random().toString(36).substr(2,6).toUpperCase();

const fmt = (d) => d ? new Date(d).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : '-';
const fmtPendek = (d) => d ? new Date(d).toLocaleDateString('id-ID',{day:'2-digit',month:'short'}) : '-';

// "05 Agu – 30 Sep 2026" — tahun cukup ditulis sekali di ujung.
export const rentangPaket = (t) => {
  if (!t?.tgl_mulai) return '';
  if (!t.tgl_selesai || t.tgl_selesai === t.tgl_mulai) return fmt(t.tgl_mulai);
  return `${fmtPendek(t.tgl_mulai)} – ${fmt(t.tgl_selesai)}`;
};

// t    = satu baris dari buildTagihan (utils/tagihan.js)
// form = { tanggal_bayar, metode, catatan, diskon }
export const barisPembayaran = (t, form, dicatatOleh) => {
  const isPaket = t.siklus === 'sekali';
  const diskon  = Number(form.diskon) || 0;
  return {
    id: genPayId(),
    // Paket tetap menunjuk pertemuan pertama supaya relasi lama tidak putus;
    // yang mengikat ke seluruh paket adalah induk_id.
    aktivasi_id: t.aktivasi_ids[0],
    induk_id: isPaket ? t.induk_id : null,
    siswa_id: t.siswa_id,
    nama_siswa: toProperCase(t.nama_siswa || ''),
    nama_program: t.nama_program || '',
    unit: t.unit || '',
    nominal: Math.max(t.nominal - diskon, 0),
    diskon,
    metode: form.metode,
    tanggal_bayar: form.tanggal_bayar || null,
    jatuh_tempo: t.jatuh_tempo,   // simpan periode yg dibayar, bukan tanggal transaksi
    keterangan: form.catatan
      || (isPaket ? `Paket ${t.jumlah_sesi} pertemuan (${rentangPaket(t)})` : ''),
    dicatat_oleh: dicatatOleh || '-',
  };
};

// Tagihan milik satu siswa, dihitung dengan cara yang sama seperti halaman
// Tagihan Siswa. Pembayaran cukup yang ber-siswa_id sama: pencocokan cadangan
// di buildTagihan (tanpa aktivasi_id) pun memeriksa siswa_id.
export async function muatTagihanSiswa(siswaId) {
  const [aRes, pRes] = await Promise.all([
    supabase.from('aktivasi_siswa').select('*').eq('siswa_id', siswaId).eq('status', 'Aktif'),
    supabase.from('pembayaran_spp').select('*').eq('siswa_id', siswaId),
  ]);
  const error = aRes.error || pRes.error;
  if (error) throw error;
  return buildTagihan(aRes.data || [], pRes.data || []);
}
