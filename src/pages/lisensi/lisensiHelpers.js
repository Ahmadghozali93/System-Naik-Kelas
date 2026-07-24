// Nilai & fungsi bantu yang dipakai bersama oleh halaman-halaman Lisensi.
// Sengaja dipisah dari file komponen supaya Fast Refresh (auto-reload saat
// ngoding) tetap bekerja normal.

export const inp = {
  padding: '0.55rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)',
  background: 'var(--surface-color)', fontFamily: 'inherit', fontSize: '0.88rem',
  width: '100%', boxSizing: 'border-box',
};

export const EMPTY_FORM = {
  nama_lisensi: '',
  unit_id: '',
  tgl_jatuh_tempo: '',
  no_unit: '',
  link_portal: 'https://oauth.jannah.education',
  username: '',
  password_catatan: '',
  catatan: '',
  aktif: true,
};

// Ubah tanggal 2026-03-30 menjadi 30-03-2026
export const tglIndo = (iso) => {
  if (!iso) return '-';
  const [y, m, d] = String(iso).split('-');
  return `${d}-${m}-${y}`;
};
