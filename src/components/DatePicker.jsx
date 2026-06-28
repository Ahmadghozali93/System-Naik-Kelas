import { useState, useEffect } from 'react';

const MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

function getDaysInMonth(year, month) {
  if (!year || month === '') return 31;
  return new Date(parseInt(year), parseInt(month), 0).getDate();
}

function parseDate(val) {
  if (!val) return { year: '', month: '', day: '' };
  const [y, m, d] = val.split('-');
  return {
    year: y || '',
    month: m ? String(parseInt(m)) : '',
    day: d ? String(parseInt(d)) : ''
  };
}

export default function DatePicker({ name, value, onChange, required, disabled }) {
  const [parts, setParts] = useState(() => parseDate(value));

  useEffect(() => {
    setParts(parseDate(value));
  }, [value]);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 1939 }, (_, i) => currentYear - i);
  const daysInMonth = getDaysInMonth(parts.year, parts.month);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const emit = (newParts) => {
    if (newParts.year && newParts.month && newParts.day) {
      const formatted = `${newParts.year}-${String(newParts.month).padStart(2, '0')}-${String(newParts.day).padStart(2, '0')}`;
      onChange?.({ target: { name, value: formatted } });
    }
  };

  const handleChange = (field, val) => {
    const newParts = { ...parts, [field]: val };
    if (field === 'month' || field === 'year') {
      const maxDay = getDaysInMonth(newParts.year, newParts.month);
      if (parseInt(newParts.day) > maxDay) newParts.day = String(maxDay);
    }
    setParts(newParts);
    emit(newParts);
  };

  const sel = {
    flex: 1,
    padding: '0.5rem 0.4rem',
    borderRadius: '0.5rem',
    border: '1px solid var(--glass-border)',
    background: 'var(--surface-color)',
    fontFamily: 'inherit',
    fontSize: '0.88rem',
    outline: 'none',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    color: 'var(--text-color)',
  };

  const hiddenVal = parts.year && parts.month && parts.day
    ? `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
    : '';

  return (
    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
      {/* invisible input so HTML5 required validation works */}
      <input
        tabIndex={-1}
        readOnly
        required={required}
        value={hiddenVal}
        style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
      />

      <select value={parts.day} onChange={e => handleChange('day', e.target.value)} disabled={disabled} style={sel}>
        <option value="">Tgl</option>
        {days.map(d => <option key={d} value={String(d)}>{d}</option>)}
      </select>

      <select value={parts.month} onChange={e => handleChange('month', e.target.value)} disabled={disabled} style={{ ...sel, flex: 1.6 }}>
        <option value="">Bulan</option>
        {MONTHS.map((m, i) => <option key={i} value={String(i + 1)}>{m}</option>)}
      </select>

      <select value={parts.year} onChange={e => handleChange('year', e.target.value)} disabled={disabled} style={{ ...sel, flex: 1.3 }}>
        <option value="">Tahun</option>
        {years.map(y => <option key={y} value={String(y)}>{y}</option>)}
      </select>
    </div>
  );
}
