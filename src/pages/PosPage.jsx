import { useState, useEffect } from 'react';
import { Store, ArrowRight } from 'lucide-react';

// Daftar unit + link POS Odoo. Tambah unit baru cukup satu baris di sini.
const POS_UNITS = [
  { nama: 'Sarirejo',    url: 'https://les-baca.odoo.com/pos/ui/1/login' },
  { nama: 'Plantaran',   url: 'https://les-baca.odoo.com/pos/ui/2/login' },
  { nama: 'Krajankulon', url: 'https://les-baca.odoo.com/pos/ui/3/login' },
  { nama: 'Magelung',    url: 'https://les-baca.odoo.com/pos/ui/4/login' },
];

export default function PosPage() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: isMobile ? '1rem' : '1.5rem' }}>
        <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>POS</p>
        <h1 style={{ fontSize: isMobile ? '1.35rem' : '1.6rem', fontWeight: 700, margin: 0 }}>Point of Sale</h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0' }}>
          Pilih unit untuk membuka kasir POS Odoo.
        </p>
      </div>

      {/* Grid unit — kartu besar yang bisa di-tap */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: isMobile ? '0.75rem' : '1rem',
      }}>
        {POS_UNITS.map((u) => (
          // Seluruh kartu = link. Buka di TAB YANG SAMA (tanpa target="_blank")
          <a key={u.nama} href={u.url} className="glass-card"
            style={{
              padding: isMobile ? '1rem 1.15rem' : '1.5rem',
              display: 'flex',
              flexDirection: isMobile ? 'row' : 'column',
              alignItems: isMobile ? 'center' : 'flex-start',
              justifyContent: isMobile ? 'space-between' : 'flex-start',
              gap: isMobile ? '1rem' : '1rem',
              textDecoration: 'none',
              color: 'inherit',
              minHeight: isMobile ? 0 : 160,
              cursor: 'pointer',
              transition: 'transform 0.12s, box-shadow 0.12s',
              WebkitTapHighlightColor: 'transparent',
            }}
            onMouseOver={e => { if (!isMobile) { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)'; } }}
            onMouseOut={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = ''; }}
          >
            <div style={{ display: 'flex', gap: '0.85rem', flexDirection: isMobile ? 'row' : 'column', alignItems: isMobile ? 'center' : 'flex-start' }}>
              <div style={{
                width: isMobile ? 44 : 52, height: isMobile ? 44 : 52,
                borderRadius: '0.75rem', background: 'rgba(79,70,229,0.1)', color: 'var(--primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Store size={isMobile ? 22 : 26} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: isMobile ? '1.05rem' : '1.15rem', lineHeight: 1.2 }}>{u.nama}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>Unit / Cabang</div>
              </div>
            </div>

            {/* Affordance "Buka POS" */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              color: 'var(--primary)', fontWeight: 600, fontSize: '0.85rem',
              marginTop: isMobile ? 0 : 'auto',
            }}>
              Buka POS <ArrowRight size={16} />
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
