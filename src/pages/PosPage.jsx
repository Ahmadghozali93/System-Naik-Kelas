import { Store, ExternalLink } from 'lucide-react';

// Daftar unit + link POS Odoo. Tambah unit baru cukup satu baris di sini.
const POS_UNITS = [
  { nama: 'Sarirejo',    url: 'https://les-baca.odoo.com/pos/ui/1/login' },
  { nama: 'Plantaran',   url: 'https://les-baca.odoo.com/pos/ui/2/login' },
  { nama: 'Krajankulon', url: 'https://les-baca.odoo.com/pos/ui/3/login' },
  { nama: 'Magelung',    url: 'https://les-baca.odoo.com/pos/ui/4/login' },
];

export default function PosPage() {
  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '1.25rem' }}>
        <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>POS</p>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>Point of Sale</h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0' }}>
          Pilih unit untuk membuka kasir POS Odoo.
        </p>
      </div>

      {/* Daftar unit */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
        {POS_UNITS.map((u) => (
          <div key={u.nama} className="glass-card"
            style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: 42, height: 42, borderRadius: '0.6rem', background: 'rgba(79,70,229,0.1)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Store size={20} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1rem' }}>{u.nama}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Unit / Cabang</div>
              </div>
            </div>
            {/* Buka di TAB YANG SAMA (tanpa target="_blank") */}
            <a href={u.url} className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'nowrap', flexShrink: 0, textDecoration: 'none' }}>
              <ExternalLink size={15} /> Buka POS
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
