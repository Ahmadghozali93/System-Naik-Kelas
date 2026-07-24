// Kolom-kolom isian lisensi.
// Dipakai bersama oleh halaman Tambah Lisensi dan tombol Edit di halaman Detail,
// supaya kalau ada kolom baru cukup diubah di satu tempat.

import { inp } from './lisensiHelpers';

const lbl = { fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' };

export default function LisensiFormFields({ form, setForm, units }) {
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
        <div>
          <label style={lbl}>Nama Lisensi *</label>
          <input required value={form.nama_lisensi} onChange={e => set('nama_lisensi', e.target.value)}
            placeholder="cth: Ahe" style={inp} />
        </div>
        <div>
          <label style={lbl}>Unit / Cabang *</label>
          <select required value={form.unit_id} onChange={e => set('unit_id', e.target.value)} style={inp}>
            <option value="">-- Pilih Unit --</option>
            {units.map(u => <option key={u.id} value={u.id}>{u.nama}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
        <div>
          <label style={lbl}>Tanggal Jatuh Tempo *</label>
          <input type="date" required value={form.tgl_jatuh_tempo}
            onChange={e => set('tgl_jatuh_tempo', e.target.value)} style={inp} />
          <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '0.3rem 0 0' }}>
            Tanggal & bulan ini dipakai ulang tiap tahun.
          </p>
        </div>
        <div>
          <label style={lbl}>No Unit</label>
          <input value={form.no_unit || ''} onChange={e => set('no_unit', e.target.value)}
            placeholder="cth: 2143" style={inp} />
        </div>
      </div>

      <div>
        <label style={lbl}>Link Portal</label>
        <input value={form.link_portal || ''} onChange={e => set('link_portal', e.target.value)}
          placeholder="https://..." style={inp} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
        <div>
          <label style={lbl}>Username Portal</label>
          <input value={form.username || ''} onChange={e => set('username', e.target.value)} style={inp} />
        </div>
        <div>
          <label style={lbl}>Password Portal</label>
          <input value={form.password_catatan || ''} onChange={e => set('password_catatan', e.target.value)} style={inp} />
        </div>
      </div>

      <div style={{
        background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)',
        borderRadius: '0.5rem', padding: '0.6rem 0.75rem', fontSize: '0.78rem', color: 'var(--text-secondary)',
      }}>
        Username & password di atas adalah <strong>catatan kredensial portal luar</strong>,
        bukan password login aplikasi ini. Jangan dibagikan ke luar.
      </div>

      <div>
        <label style={lbl}>Catatan</label>
        <textarea rows={3} value={form.catatan || ''} onChange={e => set('catatan', e.target.value)}
          style={{ ...inp, resize: 'vertical' }} />
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.88rem' }}>
        <input type="checkbox" checked={form.aktif} onChange={e => set('aktif', e.target.checked)}
          style={{ width: 16, height: 16 }} />
        Aktif (kalau dimatikan, lisensi ini tidak lagi diingatkan otomatis)
      </label>
    </>
  );
}
