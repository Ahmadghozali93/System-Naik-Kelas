import { useState, useEffect } from 'react';
import { Plus, X, Trash2, Layers, Pencil } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const inp = { padding:'0.55rem 0.75rem', borderRadius:'0.5rem', border:'1px solid var(--glass-border)',
  background:'var(--surface-color)', fontFamily:'inherit', fontSize:'0.88rem', width:'100%', boxSizing:'border-box' };
const lbl = { fontSize:'0.8rem', fontWeight:600, display:'block', marginBottom:'0.3rem' };

export default function PaketGajiPage() {
  const [paket, setPaket]       = useState([]);
  const [komponen, setKomponen] = useState([]);
  const [units, setUnits]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [aktif, setAktif]       = useState(null);

  const [modal, setModal]   = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm]     = useState({ nama:'', unit_id:'', keterangan:'' });
  const [tambahKomp, setTambahKomp] = useState('');

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    const [pRes, kRes, uRes] = await Promise.all([
      supabase.from('paket_gaji')
        .select('*, units:unit_id(nama), isi:paket_gaji_komponen(id, komponen_gaji_id, komponen:komponen_gaji_id(nama, kategori, tipe_perhitungan))')
        .order('nama'),
      supabase.from('komponen_gaji').select('id, nama, kategori').eq('aktif', true).order('urutan_tampil'),
      supabase.from('units').select('id, nama').eq('aktif', true).order('nama'),
    ]);
    setPaket(pRes.data || []);
    setKomponen(kRes.data || []);
    setUnits(uRes.data || []);
    setLoading(false);
    if (aktif) setAktif((pRes.data || []).find(p => p.id === aktif.id) || null);
  };

  const simpan = async (e) => {
    e.preventDefault();
    if (!form.nama.trim()) return alert('Nama paket wajib diisi.');
    const payload = { nama: form.nama.trim(), unit_id: form.unit_id || null, keterangan: form.keterangan || null };
    const { error } = editId
      ? await supabase.from('paket_gaji').update(payload).eq('id', editId)
      : await supabase.from('paket_gaji').insert(payload);
    if (error) return alert('Gagal: ' + error.message);
    setModal(false); setForm({ nama:'', unit_id:'', keterangan:'' }); setEditId(null);
    loadAll();
  };

  const hapusPaket = async (p) => {
    if (!window.confirm(`Hapus paket "${p.nama}"?`)) return;
    const { error } = await supabase.from('paket_gaji').delete().eq('id', p.id);
    if (error) return alert('Gagal: ' + error.message);
    if (aktif?.id === p.id) setAktif(null);
    loadAll();
  };

  const tambahIsi = async () => {
    if (!tambahKomp) return;
    const { error } = await supabase.from('paket_gaji_komponen')
      .insert({ paket_gaji_id: aktif.id, komponen_gaji_id: tambahKomp });
    if (error) {
      if (error.code === '23505') return alert('Komponen itu sudah ada di paket ini.');
      return alert('Gagal: ' + error.message);
    }
    setTambahKomp(''); loadAll();
  };

  const hapusIsi = async (id) => {
    const { error } = await supabase.from('paket_gaji_komponen').delete().eq('id', id);
    if (error) return alert('Gagal: ' + error.message);
    loadAll();
  };

  return (
    <div>
      <div style={{ marginBottom:'1.25rem', display:'flex', justifyContent:'space-between', alignItems:'flex-end', flexWrap:'wrap', gap:'0.75rem' }}>
        <div>
          <p style={{ fontSize:'0.72rem', color:'var(--text-secondary)', margin:0, textTransform:'uppercase', letterSpacing:'0.05em' }}>Payroll</p>
          <h1 style={{ fontSize:'1.6rem', fontWeight:700, margin:0 }}>Paket Gaji</h1>
          <p style={{ fontSize:'0.85rem', color:'var(--text-secondary)', margin:'0.25rem 0 0' }}>
            Kumpulan komponen per jabatan, supaya tidak perlu memasang satu-satu tiap karyawan baru.
          </p>
        </div>
        <button className="btn btn-primary" onClick={()=>{ setEditId(null); setForm({nama:'',unit_id:'',keterangan:''}); setModal(true); }}
          style={{ display:'flex', alignItems:'center', gap:'0.4rem' }}>
          <Plus size={16}/> Buat Paket
        </button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'280px 1fr', gap:'1rem', alignItems:'start' }}>
        <div className="glass-card" style={{ padding:'1rem' }}>
          {loading ? <p style={{ color:'var(--text-secondary)', fontSize:'0.85rem' }}>Memuat...</p>
          : paket.length === 0 ? <p style={{ color:'var(--text-secondary)', fontSize:'0.85rem' }}>Belum ada paket.</p>
          : (
            <div style={{ display:'flex', flexDirection:'column', gap:'0.3rem' }}>
              {paket.map(p => (
                <button key={p.id} onClick={()=>setAktif(p)}
                  style={{ textAlign:'left', border:'none', cursor:'pointer', fontFamily:'inherit',
                    background: aktif?.id===p.id ? 'rgba(79,70,229,0.1)' : 'transparent',
                    borderRadius:'0.45rem', padding:'0.6rem 0.7rem',
                    borderLeft:`3px solid ${aktif?.id===p.id ? 'var(--primary)' : 'transparent'}` }}>
                  <div style={{ fontWeight:600, fontSize:'0.88rem' }}>{p.nama}</div>
                  <div style={{ fontSize:'0.72rem', color:'var(--text-secondary)' }}>
                    {p.units?.nama || 'Semua cabang'} · {p.isi?.length || 0} komponen
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="glass-card" style={{ padding:'1.25rem' }}>
          {!aktif ? (
            <div style={{ textAlign:'center', padding:'3rem', color:'var(--text-secondary)' }}>
              <Layers size={40} style={{ opacity:0.3, marginBottom:'0.75rem' }} />
              <p>Pilih paket di sebelah kiri.</p>
            </div>
          ) : (
            <>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'1rem', flexWrap:'wrap', gap:'0.5rem' }}>
                <div>
                  <h2 style={{ fontSize:'1.05rem', fontWeight:700, margin:0 }}>{aktif.nama}</h2>
                  {aktif.keterangan && <p style={{ fontSize:'0.8rem', color:'var(--text-secondary)', margin:'0.2rem 0 0' }}>{aktif.keterangan}</p>}
                </div>
                <div style={{ display:'flex', gap:'0.4rem' }}>
                  <button onClick={()=>{ setEditId(aktif.id); setForm({nama:aktif.nama,unit_id:aktif.unit_id||'',keterangan:aktif.keterangan||''}); setModal(true); }}
                    style={{ background:'rgba(79,70,229,0.1)', border:'none', borderRadius:'0.4rem', padding:'0.35rem 0.55rem', cursor:'pointer', color:'var(--primary)' }}>
                    <Pencil size={13}/>
                  </button>
                  <button onClick={()=>hapusPaket(aktif)}
                    style={{ background:'#fee2e2', border:'none', borderRadius:'0.4rem', padding:'0.35rem 0.55rem', cursor:'pointer', color:'#b91c1c' }}>
                    <Trash2 size={13}/>
                  </button>
                </div>
              </div>

              <div style={{ display:'flex', gap:'0.5rem', marginBottom:'1rem' }}>
                <select value={tambahKomp} onChange={e=>setTambahKomp(e.target.value)} style={{...inp, flex:1}}>
                  <option value="">— Pilih komponen untuk ditambahkan —</option>
                  {komponen.map(k => <option key={k.id} value={k.id}>{k.nama} ({k.kategori})</option>)}
                </select>
                <button className="btn btn-primary" onClick={tambahIsi} style={{ whiteSpace:'nowrap' }}>Tambah</button>
              </div>

              {(aktif.isi || []).length === 0 ? (
                <p style={{ color:'var(--text-secondary)', fontSize:'0.88rem' }}>Paket ini belum berisi komponen.</p>
              ) : (
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.85rem' }}>
                  <tbody>
                    {aktif.isi.map(i => (
                      <tr key={i.id} style={{ borderBottom:'1px solid var(--glass-border)' }}>
                        <td style={{ padding:'0.6rem 0', fontWeight:600 }}>{i.komponen?.nama}</td>
                        <td style={{ padding:'0.6rem 0', color:'var(--text-secondary)' }}>
                          {i.komponen?.tipe_perhitungan?.replace('_',' ')}
                        </td>
                        <td style={{ padding:'0.6rem 0', textAlign:'right' }}>
                          <button onClick={()=>hapusIsi(i.id)}
                            style={{ background:'#fee2e2', border:'none', borderRadius:'0.4rem', padding:'0.3rem 0.5rem', cursor:'pointer', color:'#b91c1c' }}>
                            <Trash2 size={12}/>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>

      {modal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth:420 }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.25rem' }}>
              <h2 style={{ fontWeight:700, fontSize:'1.05rem', margin:0 }}>{editId ? 'Ubah Paket' : 'Buat Paket'}</h2>
              <button onClick={()=>setModal(false)} style={{ background:'none', border:'none', cursor:'pointer' }}><X size={20}/></button>
            </div>
            <form onSubmit={simpan} style={{ display:'flex', flexDirection:'column', gap:'0.85rem' }}>
              <div>
                <label style={lbl}>Nama Paket *</label>
                <input required value={form.nama} onChange={e=>setForm(f=>({...f,nama:e.target.value}))}
                  style={inp} placeholder="Guru Tetap" />
              </div>
              <div>
                <label style={lbl}>Cabang</label>
                <select value={form.unit_id} onChange={e=>setForm(f=>({...f,unit_id:e.target.value}))} style={inp}>
                  <option value="">Semua cabang</option>
                  {units.map(u=><option key={u.id} value={u.id}>{u.nama}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Keterangan</label>
                <textarea rows={2} value={form.keterangan} onChange={e=>setForm(f=>({...f,keterangan:e.target.value}))}
                  style={{...inp, resize:'vertical'}} />
              </div>
              <div style={{ display:'flex', gap:'0.65rem', justifyContent:'flex-end' }}>
                <button type="button" className="btn" onClick={()=>setModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary">Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
