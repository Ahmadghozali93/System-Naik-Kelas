import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, KeyRound, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/authStore';
import { tglIndo } from './lisensiHelpers';
import BadgeSisaHari from './BadgeSisaHari';

// Filter di halaman ini lebarnya menyesuaikan isi, jadi tidak memakai `inp` bersama.
const inp = {
  padding: '0.55rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)',
  background: 'var(--surface-color)', fontFamily: 'inherit', fontSize: '0.88rem',
  width: 'auto', boxSizing: 'border-box',
};

export default function LisensiListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const bolehTambah = ['Owner', 'Administrator', 'Supervisor'].includes(user?.role);

  const [rows, setRows]           = useState([]);
  const [units, setUnits]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [filterUnit, setFilterUnit]     = useState('');
  const [filterStatus, setFilterStatus] = useState('');  // '' | 'sudah' | 'belum'
  const [filterAktif, setFilterAktif]   = useState('aktif'); // 'aktif' | 'nonaktif' | ''

  const fetchAll = async () => {
    setLoading(true);
    // CATATAN: sengaja TIDAK mengambil password. Halaman daftar sering dibuka
    // di tempat terbuka dan gampang ke-screenshot.
    const [lRes, uRes] = await Promise.all([
      supabase.from('v_lisensi_status')
        .select('id, nama_lisensi, unit_id, nama_unit, tgl_jatuh_tempo, aktif, tahun_target, jatuh_tempo_berikutnya, sisa_hari, sudah_perpanjang_tahun_target')
        .order('jatuh_tempo_berikutnya', { ascending: true }),
      supabase.from('units').select('id, nama').order('nama'),
    ]);
    if (lRes.error) alert('Gagal memuat data lisensi: ' + lRes.error.message);
    setRows(lRes.data || []);
    setUnits(uRes.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const filtered = rows.filter(r => {
    if (filterUnit && r.unit_id !== filterUnit) return false;
    if (filterStatus === 'sudah' && !r.sudah_perpanjang_tahun_target) return false;
    if (filterStatus === 'belum' &&  r.sudah_perpanjang_tahun_target) return false;
    if (filterAktif === 'aktif'    && !r.aktif) return false;
    if (filterAktif === 'nonaktif' &&  r.aktif) return false;
    return true;
  });

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Manajemen</p>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>Lisensi</h1>
      </div>

      <div className="glass-card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={filterUnit} onChange={e => setFilterUnit(e.target.value)} style={inp}>
              <option value="">Semua Unit</option>
              {units.map(u => <option key={u.id} value={u.id}>{u.nama}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={inp}>
              <option value="">Semua Status</option>
              <option value="sudah">Sudah Perpanjang</option>
              <option value="belum">Belum Perpanjang</option>
            </select>
            <select value={filterAktif} onChange={e => setFilterAktif(e.target.value)} style={inp}>
              <option value="aktif">Hanya Aktif</option>
              <option value="nonaktif">Hanya Nonaktif</option>
              <option value="">Aktif + Nonaktif</option>
            </select>
          </div>
          {bolehTambah && (
            <button className="btn btn-primary" onClick={() => navigate('/lisensi/tambah')}>
              <Plus size={16} /> Tambah Lisensi
            </button>
          )}
        </div>

        {loading ? <p style={{ color: 'var(--text-secondary)' }}>Memuat...</p> : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            <KeyRound size={40} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
            <p>Tidak ada lisensi yang cocok dengan filter ini.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--glass-border)', background: 'rgba(79,70,229,0.04)' }}>
                  {['No', 'Nama Lisensi', 'Unit', 'Jatuh Tempo Berikutnya', 'Sisa Hari', 'Status Tahun Ini', ''].map(h => (
                    <th key={h} style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontWeight: 700, fontSize: '0.72rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.id}
                    onClick={() => navigate(`/lisensi/${r.id}`)}
                    style={{ borderBottom: '1px solid var(--glass-border)', cursor: 'pointer' }}
                    onMouseOver={e => e.currentTarget.style.background = 'rgba(79,70,229,0.03)'}
                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '0.7rem 0.75rem', color: 'var(--text-secondary)' }}>{i + 1}</td>
                    <td style={{ padding: '0.7rem 0.75rem', fontWeight: 600 }}>
                      {r.nama_lisensi}
                      {!r.aktif && (
                        <span style={{ marginLeft: '0.5rem', background: '#fee2e2', color: '#b91c1c', padding: '0.1rem 0.45rem', borderRadius: 999, fontSize: '0.68rem', fontWeight: 600 }}>Nonaktif</span>
                      )}
                    </td>
                    <td style={{ padding: '0.7rem 0.75rem', color: 'var(--text-secondary)' }}>{r.nama_unit}</td>
                    <td style={{ padding: '0.7rem 0.75rem', fontWeight: 600, color: 'var(--primary)', whiteSpace: 'nowrap' }}>
                      {tglIndo(r.jatuh_tempo_berikutnya)}
                    </td>
                    <td style={{ padding: '0.7rem 0.75rem' }}><BadgeSisaHari sisa={r.sisa_hari} /></td>
                    <td style={{ padding: '0.7rem 0.75rem' }}>
                      <span style={{
                        background: r.sudah_perpanjang_tahun_target ? '#d1fae5' : '#fef3c7',
                        color:      r.sudah_perpanjang_tahun_target ? '#047857' : '#b45309',
                        padding: '0.15rem 0.6rem', borderRadius: 999, fontSize: '0.75rem', fontWeight: 600,
                      }}>
                        {r.sudah_perpanjang_tahun_target ? 'Sudah' : 'Belum'} ({r.tahun_target})
                      </span>
                    </td>
                    <td style={{ padding: '0.7rem 0.75rem', color: 'var(--text-secondary)' }}><ChevronRight size={16} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '1rem', marginBottom: 0 }}>
          Tugas perpanjangan dibuat <strong>otomatis</strong> di menu Tugas, 60 hari sebelum jatuh tempo.
          Username & password portal hanya bisa dilihat di halaman detail masing-masing lisensi.
        </p>
      </div>
    </div>
  );
}
