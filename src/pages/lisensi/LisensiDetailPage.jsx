import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit, X, Eye, EyeOff, CheckCircle2, ExternalLink } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/authStore';
import LisensiFormFields from './LisensiFormFields';
import BadgeSisaHari from './BadgeSisaHari';
import { inp, tglIndo } from './lisensiHelpers';

const labelSel = { fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' };

export default function LisensiDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const bolehEdit = ['Owner', 'Administrator', 'Supervisor'].includes(user?.role);

  const [lisensi, setLisensi]   = useState(null);
  const [status, setStatus]     = useState(null);   // baris dari v_lisensi_status
  const [riwayat, setRiwayat]   = useState([]);
  const [units, setUnits]       = useState([]);
  const [loading, setLoading]   = useState(true);

  const [lihatKredensial, setLihatKredensial] = useState(false);

  const [modalEdit, setModalEdit] = useState(false);
  const [form, setForm]           = useState(null);
  const [simpan, setSimpan]       = useState(false);

  const [modalTandai, setModalTandai] = useState(false);
  const [formTandai, setFormTandai]   = useState({ tahun: '', tgl_perpanjang: '', catatan: '' });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [lRes, sRes, rRes, uRes] = await Promise.all([
      supabase.from('lisensi').select('*').eq('id', id).maybeSingle(),
      supabase.from('v_lisensi_status').select('*').eq('id', id).maybeSingle(),
      supabase.from('lisensi_perpanjangan').select('*').eq('lisensi_id', id).order('tahun', { ascending: false }),
      supabase.from('units').select('id, nama').order('nama'),
    ]);
    setLisensi(lRes.data || null);
    setStatus(sRes.data || null);
    setRiwayat(rRes.data || []);
    setUnits(uRes.data || []);
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openEdit = () => {
    setForm({
      nama_lisensi:     lisensi.nama_lisensi,
      unit_id:          lisensi.unit_id,
      tgl_jatuh_tempo:  lisensi.tgl_jatuh_tempo,
      no_unit:          lisensi.no_unit || '',
      link_portal:      lisensi.link_portal || '',
      username:         lisensi.username || '',
      password_catatan: lisensi.password_catatan || '',
      catatan:          lisensi.catatan || '',
      aktif:            lisensi.aktif,
    });
    setModalEdit(true);
  };

  const handleSimpanEdit = async (e) => {
    e.preventDefault();
    setSimpan(true);
    const { error } = await supabase.from('lisensi').update({
      nama_lisensi:     form.nama_lisensi.trim(),
      unit_id:          form.unit_id,
      tgl_jatuh_tempo:  form.tgl_jatuh_tempo,
      no_unit:          form.no_unit || null,
      link_portal:      form.link_portal || null,
      username:         form.username || null,
      password_catatan: form.password_catatan || null,
      catatan:          form.catatan || null,
      aktif:            form.aktif,
    }).eq('id', id);
    setSimpan(false);

    if (error) {
      if (error.code === '23505') return alert('Lisensi dengan nama ini sudah ada di unit tersebut.');
      return alert('Gagal menyimpan: ' + error.message);
    }
    setModalEdit(false);
    fetchAll();
  };

  const openTandai = () => {
    setFormTandai({ tahun: String(status?.tahun_target || new Date().getFullYear()), tgl_perpanjang: '', catatan: '' });
    setModalTandai(true);
  };

  const handleTandai = async (e) => {
    e.preventDefault();
    const tahun = Number(formTandai.tahun);
    if (!tahun || tahun < 2000 || tahun > 2100) return alert('Tahun harus antara 2000 dan 2100.');

    // dicatat_oleh memakai id akun login (auth), bukan id guru.
    const { data: authData } = await supabase.auth.getUser();

    const { error } = await supabase.from('lisensi_perpanjangan').insert({
      lisensi_id:     id,
      tahun,
      tgl_perpanjang: formTandai.tgl_perpanjang || null,
      catatan:        formTandai.catatan || null,
      dicatat_oleh:   authData?.user?.id || null,
    });

    if (error) {
      if (error.code === '23505') return alert(`Perpanjangan tahun ${tahun} sudah pernah dicatat untuk lisensi ini.`);
      return alert('Gagal menyimpan: ' + error.message);
    }
    setModalTandai(false);
    fetchAll();
  };

  if (loading) return <p style={{ color: 'var(--text-secondary)' }}>Memuat...</p>;

  if (!lisensi) {
    return (
      <div>
        <button onClick={() => navigate('/lisensi')} className="btn" style={{ marginBottom: '1rem' }}>
          <ArrowLeft size={16} /> Kembali
        </button>
        <div className="glass-card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Data lisensi tidak ditemukan, atau Anda tidak punya akses ke unit lisensi ini.
        </div>
      </div>
    );
  }

  const baris = (label, isi) => (
    <div style={{ display: 'flex', gap: '0.75rem', padding: '0.55rem 0', borderBottom: '1px solid var(--glass-border)' }}>
      <div style={{ width: 190, flexShrink: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{label}</div>
      <div style={{ fontSize: '0.88rem', fontWeight: 500, wordBreak: 'break-word' }}>{isi}</div>
    </div>
  );

  return (
    <div>
      <button onClick={() => navigate('/lisensi')}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem', padding: 0, marginBottom: '1rem', fontFamily: 'inherit', fontSize: '0.85rem' }}>
        <ArrowLeft size={16} /> Kembali ke daftar lisensi
      </button>

      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Lisensi</p>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>
            {lisensi.nama_lisensi} — {status?.nama_unit || ''}
          </h1>
        </div>
        {status && <BadgeSisaHari sisa={status.sisa_hari} />}
      </div>

      {/* ── 1. DATA LISENSI ── */}
      <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Data Lisensi</h2>
          {bolehEdit && (
            <button className="btn" onClick={openEdit}><Edit size={15} /> Edit</button>
          )}
        </div>

        {baris('Nama Lisensi', lisensi.nama_lisensi)}
        {baris('Unit / Cabang', status?.nama_unit || lisensi.unit_id)}
        {baris('Tanggal Jatuh Tempo', tglIndo(lisensi.tgl_jatuh_tempo))}
        {baris('Jatuh Tempo Berikutnya', status ? `${tglIndo(status.jatuh_tempo_berikutnya)} (tahun ${status.tahun_target})` : '-')}
        {baris('No Unit', lisensi.no_unit || '-')}
        {baris('Status', lisensi.aktif ? 'Aktif' : 'Nonaktif — tidak diingatkan otomatis')}
        {baris('Catatan', lisensi.catatan || '-')}
      </div>

      {/* ── 2. KREDENSIAL PORTAL ── */}
      <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Kredensial Portal</h2>
          <button className="btn" onClick={() => setLihatKredensial(v => !v)}>
            {lihatKredensial ? <><EyeOff size={15} /> Sembunyikan</> : <><Eye size={15} /> Lihat</>}
          </button>
        </div>

        <div style={{
          background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)',
          borderRadius: '0.5rem', padding: '0.6rem 0.75rem', fontSize: '0.78rem',
          color: 'var(--text-secondary)', marginBottom: '0.75rem',
        }}>
          Jangan dibagikan ke luar.
        </div>

        {baris('Link Portal', lisensi.link_portal ? (
          <a href={lisensi.link_portal} target="_blank" rel="noopener noreferrer"
            style={{ color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
            {lisensi.link_portal} <ExternalLink size={13} />
          </a>
        ) : '-')}
        {baris('Username', lihatKredensial ? (lisensi.username || '-') : '••••••••')}
        {baris('Password', lihatKredensial ? (lisensi.password_catatan || '-') : '••••••••')}
      </div>

      {/* ── 3. RIWAYAT PERPANJANGAN ── */}
      <div className="glass-card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Riwayat Perpanjangan</h2>
          {bolehEdit && (
            <button className="btn btn-primary" onClick={openTandai}>
              <CheckCircle2 size={15} /> Tandai Sudah Perpanjang
            </button>
          )}
        </div>

        {riwayat.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>Belum ada catatan perpanjangan.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--glass-border)', background: 'rgba(79,70,229,0.04)' }}>
                  {['Tahun', 'Tanggal Perpanjang', 'Catatan'].map(h => (
                    <th key={h} style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontWeight: 700, fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {riwayat.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                    <td style={{ padding: '0.7rem 0.75rem', fontWeight: 600 }}>{r.tahun}</td>
                    <td style={{ padding: '0.7rem 0.75rem' }}>{r.tgl_perpanjang ? tglIndo(r.tgl_perpanjang) : '-'}</td>
                    <td style={{ padding: '0.7rem 0.75rem', color: 'var(--text-secondary)' }}>{r.catatan || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal edit lisensi */}
      {modalEdit && form && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 620 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ fontWeight: 700, fontSize: '1.1rem', margin: 0 }}>Edit Lisensi</h2>
              <button onClick={() => setModalEdit(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleSimpanEdit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <LisensiFormFields form={form} setForm={setForm} units={units} />
              <div style={{ display: 'flex', gap: '0.65rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button type="button" className="btn" onClick={() => setModalEdit(false)}>Batal</button>
                <button type="submit" className="btn btn-primary" disabled={simpan}>{simpan ? 'Menyimpan...' : 'Simpan'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal tandai sudah perpanjang */}
      {modalTandai && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontWeight: 700, fontSize: '1.1rem', margin: 0 }}>Tandai Sudah Perpanjang</h2>
              <button onClick={() => setModalTandai(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleTandai} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={labelSel}>Tahun Perpanjangan *</label>
                <input type="number" required min={2000} max={2100} style={inp}
                  value={formTandai.tahun}
                  onChange={e => setFormTandai(f => ({ ...f, tahun: e.target.value }))} />
                <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '0.3rem 0 0' }}>
                  Sudah diisi otomatis dengan tahun yang sedang jatuh tempo.
                </p>
              </div>
              <div>
                <label style={labelSel}>Tanggal Perpanjang</label>
                <input type="date" style={inp}
                  value={formTandai.tgl_perpanjang}
                  onChange={e => setFormTandai(f => ({ ...f, tgl_perpanjang: e.target.value }))} />
                <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '0.3rem 0 0' }}>
                  Boleh dikosongkan kalau tanggalnya tidak diketahui.
                </p>
              </div>
              <div>
                <label style={labelSel}>Catatan</label>
                <textarea rows={2} style={{ ...inp, resize: 'vertical' }}
                  value={formTandai.catatan}
                  onChange={e => setFormTandai(f => ({ ...f, catatan: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: '0.65rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button type="button" className="btn" onClick={() => setModalTandai(false)}>Batal</button>
                <button type="submit" className="btn btn-primary">Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
