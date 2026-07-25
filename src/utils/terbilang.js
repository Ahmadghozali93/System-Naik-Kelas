// Angka → kata dalam Bahasa Indonesia, untuk baris "terbilang" di nota.
// Contoh: 300000 → "tiga ratus ribu"

const SATUAN = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];

function keKata(n) {
  if (n < 12) return SATUAN[n];
  if (n < 20) return keKata(n - 10) + ' belas';
  if (n < 100) return keKata(Math.floor(n / 10)) + ' puluh' + (n % 10 ? ' ' + keKata(n % 10) : '');
  if (n < 200) return 'seratus' + (n % 100 ? ' ' + keKata(n % 100) : '');
  if (n < 1000) return keKata(Math.floor(n / 100)) + ' ratus' + (n % 100 ? ' ' + keKata(n % 100) : '');
  if (n < 2000) return 'seribu' + (n % 1000 ? ' ' + keKata(n % 1000) : '');
  if (n < 1e6) return keKata(Math.floor(n / 1000)) + ' ribu' + (n % 1000 ? ' ' + keKata(n % 1000) : '');
  if (n < 1e9) return keKata(Math.floor(n / 1e6)) + ' juta' + (n % 1e6 ? ' ' + keKata(n % 1e6) : '');
  return keKata(Math.floor(n / 1e9)) + ' miliar' + (n % 1e9 ? ' ' + keKata(n % 1e9) : '');
}

// Pembulatan ke rupiah penuh — nota tidak pernah menyebut sen.
export function terbilang(val) {
  const n = Math.floor(Math.abs(Number(val) || 0));
  if (n === 0) return 'nol';
  return keKata(n).replace(/\s+/g, ' ').trim();
}

export const terbilangRupiah = (val) => {
  const kata = terbilang(val) + ' rupiah';
  return kata.charAt(0).toUpperCase() + kata.slice(1);
};
