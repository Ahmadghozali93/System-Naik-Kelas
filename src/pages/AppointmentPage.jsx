import { useState, useEffect } from 'react';
import { CalendarPlus, X, Search, CheckCircle2, XCircle, Flag } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/authStore';

const HARI_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const todayWIB = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
const fmtTgl = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const namaHari = (d) => d ? HARI_ID[new Date(d + 'T12:00:00').getDay()] : '';

const JENIS_OPT = [
  { value: 'trial', label: 'Trial' },
  { value: 'konsultasi', label: 'Konsultasi' },
  { value: 'lainnya', label: 'Lainnya' },
];

const STATUS_CFG = {
  dijadwalkan: { label: 'Dijadwalkan', bg: '#dbeafe', color: '#1d4ed8' },
  hadir:       { label: 'Hadir',       bg: '#d1fae5', color: '#047857' },
  selesai:     { label: 'Selesai',     bg: '#e0e7ff', color: '#4338ca' },
  batal:       { label: 'Batal',       bg: '#fee2e2', color: '#b91c1c' },
};
const StatusBadge = ({ s }) => {
  const c = STATUS_CFG[s] || STATUS_CFG.dijadwalkan;
  return <span style={{ background: c.bg, color: c.color, padding: '0.18rem 0.65rem', borderRadius: 999, fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{c.label}</span>;
};

const inp = { padding: '0.55rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontFamily: 'inherit', fontSize: '0.88rem', width: '100%', boxSizing: 'border-box' };

// Jadwal cocok dengan tanggal bila nama harinya termasuk, atau jadwal harian (hari kosong)
const jadwalCocokTanggal = (jadwal, tanggal) => {
  if (!tanggal) return false;
  if (!jadwal.hari || !jadwal.hari.trim()) return true;           // program harian
  const target = namaHari(tanggal);
  return jadwal.hari.split(',').map(h => h.trim()).includes(target);
};

export default function AppointmentPage() {
  const { user } = useAuth();

  const [appointments, setAppointments] = useState([]);
  const [bookings, setBookings]         = useState([]);
  const [jadwals, setJadwals]           = useState([]);
  const [aktivasis, setAktivasis]       = useState([]);
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);

  const [modal, setModal]               = useState(false);
  const [search, setSearch]             = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const [form, setForm] = useState({ tanggal: todayWIB(), siswa_id: '', jadwal_id: '', jenis: 'trial', catatan: '' });

  const fetchAll = async () => {
    setLoading(true);
    const [apRes, bkRes, jdRes, akRes] = await Promise.all([
      // Daftar appointment: join pemesan (siswa) + slot (jadwal_master)
      supabase.from('appointment')
        .select('*, siswa:siswa_id(id, nama, nowa, unit), jadwal:jadwal_id(id, jadwal_id, nama_guru, nama_program, hari, jam, unit, kuota)')
        .order('tanggal', { ascending: false }).order('created_at', { ascending: false }),
      // Pemesan = siswa berstatus 'Booking'
      supabase.from('siswa').select('id, nama, nowa, unit, booking_program, booking_jam')
        .eq('status', 'Booking').order('nama'),
      supabase.from('jadwal_master').select('*').order('unit').order('hari'),
      supabase.from('aktivasi_siswa').select('jadwal_id, status'),
    ]);
    setAppointments(apRes.data || []);
    setBookings(bkRes.data || []);
    setJadwals(jdRes.data || []);
    setAktivasis(akRes.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  // ── Hitung sisa kuota slot pada tanggal tertentu ──
  // sisa = kuota − siswa rutin aktif − appointment aktif di tanggal itu
  const sisaKuota = (jadwal, tanggal) => {
    const rutin = aktivasis.filter(a => a.jadwal_id === jadwal.id && a.status === 'Aktif').length;
    const appt  = appointments.filter(a => a.jadwal_id === jadwal.id && a.tanggal === tanggal && a.status !== 'batal').length;
    return (jadwal.kuota || 0) - rutin - appt;
  };

  // ── Slot tersedia untuk tanggal terpilih ──
  const slotTersedia = jadwals
    .filter(j => jadwalCocokTanggal(j, form.tanggal))
    .map(j => ({ ...j, sisa: sisaKuota(j, form.tanggal) }))
    .filter(j => j.sisa > 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.siswa_id)  return alert('Pilih pemesan terlebih dahulu.');
    if (!form.jadwal_id) return alert('Pilih slot terlebih dahulu.');

    const jadwal = jadwals.find(j => j.id === form.jadwal_id);
    setSaving(true);
    const { error } = await supabase.from('appointment').insert({
      unit:        jadwal?.unit || '',
      siswa_id:    form.siswa_id,
      jadwal_id:   form.jadwal_id,
      tanggal:     form.tanggal,
      jenis:       form.jenis,
      catatan:     form.catatan || null,
      dibuat_oleh: user?.id || null,
    });
    setSaving(false);
    if (error) {
      // Pesan dari trigger kuota / unique index
      if (/sudah dibooking|duplicate key|uniq_appointment_aktif/i.test(error.message)) {
        return alert('Slot sudah dibooking, pilih slot lain.');
      }
      return alert('Gagal: ' + error.message);
    }
    setModal(false);
    fetchAll();
  };

  const ubahStatus = async (id, status) => {
    const { error } = await supabase.from('appointment').update({ status }).eq('id', id);
    if (error) {
      if (/sudah dibooking/i.test(error.message)) return alert('Slot sudah dibooking, pilih slot lain.');
      return alert('Gagal ubah status: ' + error.message);
    }
    fetchAll();
  };

  const filtered = appointments.filter(a => {
    if (filterStatus && a.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!a.siswa?.nama?.toLowerCase().includes(q)
        && !a.jadwal?.nama_guru?.toLowerCase().includes(q)
        && !a.jadwal?.nama_program?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const openAdd = () => {
    setForm({ tanggal: todayWIB(), siswa_id: '', jadwal_id: '', jenis: 'trial', catatan: '' });
    setModal(true);
  };

  return (
    <div>
      <div style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Jadwal</p>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>Appointment</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0' }}>
            Jadwalkan trial class / konsultasi untuk calon siswa yang sudah booking.
          </p>
        </div>
        <button className="btn btn-primary" onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', whiteSpace: 'nowrap' }}>
          <CalendarPlus size={16} /> Tambah Appointment
        </button>
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 320 }}>
          <Search size={14} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input style={{ ...inp, paddingLeft: '2.1rem' }} placeholder="Cari nama pemesan / guru / program..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select style={{ ...inp, width: 'auto' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Semua Status</option>
          {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* Daftar */}
      <div className="glass-card" style={{ padding: '1.5rem' }}>
        {loading ? <p style={{ color: 'var(--text-secondary)' }}>Memuat...</p>
        : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            <CalendarPlus size={40} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
            <p>Belum ada appointment.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--glass-border)', background: 'rgba(79,70,229,0.04)' }}>
                  {['No', 'Pemesan', 'Tanggal', 'Slot (Hari & Jam)', 'Guru / Program', 'Unit', 'Jenis', 'Status', 'Aksi'].map(h => (
                    <th key={h} style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontWeight: 700, fontSize: '0.72rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((a, i) => (
                  <tr key={a.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                    <td style={{ padding: '0.7rem 0.75rem', color: 'var(--text-secondary)' }}>{i + 1}</td>
                    <td style={{ padding: '0.7rem 0.75rem', fontWeight: 600 }}>
                      {a.siswa?.nama || '-'}
                      {a.siswa?.nowa && <div style={{ fontSize: '0.75rem', color: '#25d366' }}>{a.siswa.nowa}</div>}
                    </td>
                    <td style={{ padding: '0.7rem 0.75rem', whiteSpace: 'nowrap' }}>{fmtTgl(a.tanggal)}</td>
                    <td style={{ padding: '0.7rem 0.75rem', whiteSpace: 'nowrap' }}>
                      {a.jadwal?.hari || 'Harian'} · {a.jadwal?.jam || '-'}
                    </td>
                    <td style={{ padding: '0.7rem 0.75rem' }}>
                      <div style={{ color: 'var(--primary)' }}>{a.jadwal?.nama_program || '-'}</div>
                      <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>{a.jadwal?.nama_guru || '-'}</div>
                    </td>
                    <td style={{ padding: '0.7rem 0.75rem', color: 'var(--text-secondary)' }}>{a.unit || '-'}</td>
                    <td style={{ padding: '0.7rem 0.75rem', textTransform: 'capitalize' }}>{a.jenis}</td>
                    <td style={{ padding: '0.7rem 0.75rem' }}><StatusBadge s={a.status} /></td>
                    <td style={{ padding: '0.7rem 0.75rem' }}>
                      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                        {a.status !== 'hadir' && a.status !== 'batal' && (
                          <button onClick={() => ubahStatus(a.id, 'hadir')} title="Tandai hadir"
                            style={{ background: '#d1fae5', border: 'none', borderRadius: '0.35rem', padding: '0.3rem 0.5rem', cursor: 'pointer', color: '#047857', display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.75rem', fontFamily: 'inherit', fontWeight: 600 }}>
                            <CheckCircle2 size={12} /> Hadir
                          </button>
                        )}
                        {a.status !== 'selesai' && a.status !== 'batal' && (
                          <button onClick={() => ubahStatus(a.id, 'selesai')} title="Tandai selesai"
                            style={{ background: '#e0e7ff', border: 'none', borderRadius: '0.35rem', padding: '0.3rem 0.5rem', cursor: 'pointer', color: '#4338ca', display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.75rem', fontFamily: 'inherit', fontWeight: 600 }}>
                            <Flag size={12} /> Selesai
                          </button>
                        )}
                        {a.status !== 'batal' && (
                          <button onClick={() => { if (window.confirm('Batalkan appointment ini? Slot akan kembali tersedia.')) ubahStatus(a.id, 'batal'); }}
                            title="Batalkan"
                            style={{ background: '#fee2e2', border: 'none', borderRadius: '0.35rem', padding: '0.3rem 0.5rem', cursor: 'pointer', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.75rem', fontFamily: 'inherit', fontWeight: 600 }}>
                            <XCircle size={12} /> Batal
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal tambah */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontWeight: 700, fontSize: '1.1rem', margin: 0 }}>Tambah Appointment</h2>
              <button onClick={() => setModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Tanggal *</label>
                <input type="date" required value={form.tanggal}
                  onChange={e => setForm(f => ({ ...f, tanggal: e.target.value, jadwal_id: '' }))} style={inp} />
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Hari <strong>{namaHari(form.tanggal) || '—'}</strong> — slot di bawah menyesuaikan hari ini.
                </p>
              </div>

              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Pemesan (dari Booking) *</label>
                <select required value={form.siswa_id} onChange={e => setForm(f => ({ ...f, siswa_id: e.target.value }))} style={inp}>
                  <option value="">-- Pilih pemesan --</option>
                  {bookings.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.nama}{b.unit ? ` · ${b.unit}` : ''}{b.booking_program ? ` · ${b.booking_program}` : ''}
                    </option>
                  ))}
                </select>
                {bookings.length === 0 && (
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#b45309' }}>
                    Belum ada calon siswa berstatus Booking.
                  </p>
                )}
              </div>

              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Slot Tersedia *</label>
                <select required value={form.jadwal_id} onChange={e => setForm(f => ({ ...f, jadwal_id: e.target.value }))} style={inp}>
                  <option value="">-- Pilih slot --</option>
                  {slotTersedia.map(j => (
                    <option key={j.id} value={j.id}>
                      {(j.hari || 'Harian')} {j.jam} · {j.nama_program} · {j.nama_guru} · {j.unit} (sisa {j.sisa})
                    </option>
                  ))}
                </select>
                {slotTersedia.length === 0 && (
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#b45309' }}>
                    Tidak ada slot tersedia di hari {namaHari(form.tanggal) || '—'}. Coba tanggal lain.
                  </p>
                )}
              </div>

              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Jenis *</label>
                <select value={form.jenis} onChange={e => setForm(f => ({ ...f, jenis: e.target.value }))} style={inp}>
                  {JENIS_OPT.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Catatan</label>
                <textarea rows={3} value={form.catatan} onChange={e => setForm(f => ({ ...f, catatan: e.target.value }))}
                  placeholder="Opsional..." style={{ ...inp, resize: 'vertical' }} />
              </div>

              <div style={{ display: 'flex', gap: '0.65rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn" onClick={() => setModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
