import { Bell } from 'lucide-react';
import { useNotifikasi } from '../../context/notifikasiStore';

// Tombol lonceng + badge jumlah notifikasi yang belum dibaca / masih perlu
// tindakan. Dipasang di header mobile dan di area profil Sidebar.
export default function LoncengNotifikasi({ onClick }) {
  const notif = useNotifikasi();
  if (!notif) return null;
  const { jumlah, bukaPanel } = notif;
  return (
    <button type="button" title="Notifikasi" aria-label={`Notifikasi${jumlah ? `, ${jumlah} baru` : ''}`}
      onClick={() => { onClick?.(); bukaPanel(); }}
      style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)',
        padding: '0.25rem', borderRadius: '0.4rem', display: 'flex', alignItems: 'center' }}>
      <Bell size={18} />
      {jumlah > 0 && (
        <span style={{ position: 'absolute', top: -4, right: -6, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 999,
          background: '#dc2626', color: '#fff', fontSize: '0.65rem', fontWeight: 700, lineHeight: '16px', textAlign: 'center', boxSizing: 'border-box' }}>
          {jumlah > 9 ? '9+' : jumlah}
        </span>
      )}
    </button>
  );
}
