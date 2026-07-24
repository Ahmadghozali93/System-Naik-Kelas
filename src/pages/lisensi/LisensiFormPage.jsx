import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import LisensiFormFields from './LisensiFormFields';
import { EMPTY_FORM } from './lisensiHelpers';

export default function LisensiFormPage() {
  const navigate = useNavigate();
  const [form, setForm]       = useState(EMPTY_FORM);
  const [units, setUnits]     = useState([]);
  const [simpan, setSimpan]   = useState(false);

  useEffect(() => {
    supabase.from('units').select('id, nama').eq('aktif', true).order('nama')
      .then(({ data }) => setUnits(data || []));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSimpan(true);
    const { data, error } = await supabase.from('lisensi').insert({
      nama_lisensi:     form.nama_lisensi.trim(),
      unit_id:          form.unit_id,
      tgl_jatuh_tempo:  form.tgl_jatuh_tempo,
      no_unit:          form.no_unit || null,
      link_portal:      form.link_portal || null,
      username:         form.username || null,
      password_catatan: form.password_catatan || null,
      catatan:          form.catatan || null,
      aktif:            form.aktif,
    }).select('id').single();
    setSimpan(false);

    if (error) {
      if (error.code === '23505') {
        return alert('Lisensi dengan nama ini sudah ada di unit tersebut.');
      }
      return alert('Gagal menyimpan: ' + error.message);
    }
    navigate(`/lisensi/${data.id}`);
  };

  return (
    <div>
      <button onClick={() => navigate('/lisensi')}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem', padding: 0, marginBottom: '1rem', fontFamily: 'inherit', fontSize: '0.85rem' }}>
        <ArrowLeft size={16} /> Kembali ke daftar lisensi
      </button>

      <div style={{ marginBottom: '1.5rem' }}>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Lisensi</p>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>Tambah Lisensi</h1>
      </div>

      <div className="glass-card" style={{ padding: '1.5rem', maxWidth: 680 }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <LisensiFormFields form={form} setForm={setForm} units={units} />

          <div style={{ display: 'flex', gap: '0.65rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button type="button" className="btn" onClick={() => navigate('/lisensi')}>Batal</button>
            <button type="submit" className="btn btn-primary" disabled={simpan}>
              {simpan ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
