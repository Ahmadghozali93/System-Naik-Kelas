// Lencana sisa hari menuju jatuh tempo.
// Merah <= 30 hari, kuning <= 60 hari, hijau > 60 hari. Minus = sudah terlewat.

export default function BadgeSisaHari({ sisa }) {
  const n = Number(sisa);
  let bg = '#d1fae5', fg = '#047857', teks = `${n} hari lagi`;

  if (n < 0)        { bg = '#fee2e2'; fg = '#b91c1c'; teks = `Terlambat ${Math.abs(n)} hari`; }
  else if (n <= 30) { bg = '#fee2e2'; fg = '#b91c1c'; }
  else if (n <= 60) { bg = '#fef3c7'; fg = '#b45309'; }

  return (
    <span style={{
      background: bg, color: fg, padding: '0.15rem 0.6rem', borderRadius: 999,
      fontSize: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap',
    }}>{teks}</span>
  );
}
