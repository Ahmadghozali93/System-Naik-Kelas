export const formatRupiah = (val) => {
  if (!val && val !== 0) return 'Rp 0';
  return 'Rp ' + Number(val).toLocaleString('id-ID');
};

// Proper case seperti rumus PROPER di Excel
// "ahmad ghozali" → "Ahmad Ghozali"
export const toProperCase = (str) =>
  str.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
