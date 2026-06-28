export const formatRupiah = (val) => {
  if (!val && val !== 0) return 'Rp 0';
  return 'Rp ' + Number(val).toLocaleString('id-ID');
};
