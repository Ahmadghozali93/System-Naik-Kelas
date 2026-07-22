import { useState, useEffect } from 'react';
import { Plus, X, Trash2, UserCog, Search, CalendarRange } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatRupiah } from '../../utils/formatRupiah';

const inp = { padding:'0.55rem 0.75rem', borderRadius:'0.5rem', border:'1px solid var(--glass-border)',
  background:'var(--surface-color)', fontFamily:'inherit', fontSize:'0.88rem', width:'100%', boxSizing:'border-box' };
const lbl = { fontSize:'0.8rem', fontWeight:600, display:'block', marginBottom:'0.3rem' };
const fmtTgl = (d) => d ? new Date(d+'T12:00:00').toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : '';

export default function KaryawanKomponenPage() {
  const [gurus, setGurus]         = useState([]);
  const [komponen, setKomponen]   = useState([]);
  const [paket, setPaket]         = useState([]);
  const [pasangan, setPasangan]   = useState([]);
  const [loading, setLoading]     = useState(true);

  const [guruAktif, setGuruAktif] = useState('');
  const [cari, setCari]           = useState('');

  const [modal, setModal] = useState(false);
  const [form, setForm]   = useState({ komponen_gaji_id:'', berlaku_mulai:'', berlaku_selesai:'', nominal_override:'' });
  const [saving, setSaving] = useState(false);

  const [paketModal, setPaketModal] = useState(false);
  const [paketPilih, setPaketPilih] = useState('');
  const [paketMulai, setPaketMulai] = useState('');

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    const [gRes, kRes, pRes, kkRes] = await Promise.all([
      supabase.from('gurus').select('id, nama, role').eq('status','Aktif').order('nama'),
      supabase.from('komponen_gaji').select('*').eq('aktif', true).order('urutan_tampil'),
      supabase.from('paket_gaji').select('id, nama, paket_gaji_komponen(komponen_gaji_id, konfigurasi_override)').eq('aktif', true).order('nama'),
      supabase.from('karyawan_komponen')
        .select('*, komponen:komponen_gaji_id(id, nama, kode, kategori, tipe_perhitungan, konfigurasi)')
        .order('berlaku_mulai', { ascending:false }),
    ]);
    setGurus(gRes.data || []);
    setKomponen(kRes.data || []);
    setPaket(pRes.data || []);
    setPasangan(kkRes.data || []);
    setLoading(false);
  };

  const milikGuru = pasangan.filter(p => p.guru_id === guruAktif);
  const guruTampil = gurus.filter(g => !cari || g.nama.toLowerCase().includes(cari.toLowerCase()));

  const simpan = async (e) => {
    e.preventDefault();
    if (!guruAktif) return alert('Pilih karyawan dulu.');
    if (!form.komponen_gaji_id) return alert('Pilih komponen.');
    if (!form.berlaku_mulai) return alert('Isi tanggal mulai berlaku.');

    // Nominal khusus karyawan ini (menimpa nominal bawaan komponen)
    let override = null;
    if (form.nominal_override !== '') override = { nominal: Number(form.nominal_override) };

    setSaving(true);
    const { error } = await supabase.from('karyawan_komponen').insert({
      guru_id: guruAktif,
      komponen_gaji_id: form.komponen_gaji_id,
      berlaku_mulai: form.berlaku_mulai,
      berlaku_selesai: form.berlaku_selesai || null,
      konfigurasi_override: override,
    });
    setSaving(false);
    if (error) {
      if (error.message.includes('kk_tanpa_tumpang_tindih'))
        return alert('Gagal: komponen ini sudah terpasang pada rentang tanggal yang bertabrakan.\n\nAkhiri dulu yang lama (isi tanggal selesai), baru pasang yang baru.');
      return alert('Gagal: ' + error.message);
    }
    setModal(false);
    setForm({ komponen_gaji_id:'', berlaku_mulai:'', berlaku_selesai:'', nominal_override:'' });
    loadAll();
  };

  const hapus = async (row) => {
    if (!window.confirm(`Lepas komponen "${row.komponen?.nama}" dari karyawan ini?`)) return;
    const { error } = await supabase.from('karyawan_komponen').delete().eq('id', row.id);
    if (error) return alert('Gagal: ' + error.message);
    loadAll();
  };

  const pasangPaket = async () => {
    if (!paketPilih || !paketMulai) return alert('Pilih paket dan tanggal mulai.');
    const p = paket.find(x => x.id === paketPilih);
    const isi = p?.paket_gaji_komponen || [];
    if (!isi.length) return alert('Paket ini belum berisi komponen.');

    const rows = isi.map(i => ({
      guru_id: guruAktif,
      komponen_gaji_id: i.komponen_gaji_id,
      paket_gaji_id: paketPilih,
      berlaku_mulai: paketMulai,
    }));
    const { error } = await supabase.from('karyawan_komponen').insert(rows);
    if (error) {
      if (error.message.includes('kk_tanpa_tumpang_tindih'))
        return alert('Sebagian komponen dari paket ini sudah terpasang pada rentang tanggal yang bertabrakan. Lepas/akhiri dulu yang lama.');
      return alert('Gagal: ' + error.message);
    }
    setPaketModal(false); setPaketPilih(''); setPaketMulai('');
    loadAll();
  };

  // Nominal yang benar-benar berlaku (bawaan komponen ditimpa override karyawan)
  const nominalEfektif = (row) => {
    const dasar = row.komponen?.konfigurasi?.nominal;
    const over  = row.konfigurasi_override?.nominal;
    return over ?? dasar;
  };

  return (
    <div>
      <div style={{ marginBottom:'1.25rem' }}>
        <p style={{ fontSize:'0.72rem', color:'var(--text-secondary)', margin:0, textTransform:'uppercase', letterSpacing:'0.05em' }}>Payroll</p>
        <h1 style={{ fontSize:'1.6rem', fontWeight:700, margin:0 }}>Gaji per Karyawan</h1>
        <p style={{ fontSize:'0.85rem', color:'var(--text-secondary)', margin:'0.25rem 0 0' }}>
          Pasang komponen gaji ke tiap karyawan, lengkap dengan masa berlakunya.
        </p>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'280px 1fr', gap:'1rem', alignItems:'start' }}>
        {/* Daftar karyawan */}
        <div className="glass-card" style={{ padding:'1rem' }}>
          <div style={{ position:'relative', marginBottom:'0.75rem' }}>
            <Search size={14} style={{ position:'absolute', left:'0.6rem', top:'50%', transform:'translateY(-50%)', color:'var(--text-secondary)' }} />
            <input style={{ ...inp, paddingLeft:'2rem' }} placeholder="Cari karyawan..."
              value={cari} onChange={e=>setCari(e.target.value)} />
          </div>
          <div style={{ maxHeight:'60vh', overflowY:'auto', display:'flex', flexDirection:'column', gap:'0.2rem' }}>
            {loading ? <p style={{ color:'var(--text-secondary)', fontSize:'0.85rem' }}>Memuat...</p>
            : guruTampil.map(g => {
              const jml = pasangan.filter(p => p.guru_id === g.id).length;
              const aktif = guruAktif === g.id;
              return (
                <button key={g.id} onClick={()=>setGuruAktif(g.id)}
                  style={{ textAlign:'left', border:'none', cursor:'pointer', fontFamily:'inherit',
                    background: aktif ? 'rgba(79,70,229,0.1)' : 'transparent',
                    borderRadius:'0.45rem', padding:'0.55rem 0.7rem',
                    borderLeft:`3px solid ${aktif ? 'var(--primary)' : 'transparent'}` }}>
                  <div style={{ fontWeight:600, fontSize:'0.86rem', color: aktif ? 'var(--primary)' : 'inherit' }}>{g.nama}</div>
                  <div style={{ fontSize:'0.72rem', color:'var(--text-secondary)' }}>
                    {g.role} · {jml} komponen
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Komponen milik karyawan terpilih */}
        <div className="glass-card" style={{ padding:'1.25rem' }}>
          {!guruAktif ? (
            <div style={{ textAlign:'center', padding:'3rem', color:'var(--text-secondary)' }}>
              <UserCog size={40} style={{ opacity:0.3, marginBottom:'0.75rem' }} />
              <p>Pilih karyawan di sebelah kiri.</p>
            </div>
          ) : (
            <>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem', flexWrap:'wrap', gap:'0.5rem' }}>
                <h2 style={{ fontSize:'1.05rem', fontWeight:700, margin:0 }}>
                  {gurus.find(g=>g.id===guruAktif)?.nama}
                </h2>
                <div style={{ display:'flex', gap:'0.5rem' }}>
                  <button className="btn" onClick={()=>setPaketModal(true)} style={{ fontSize:'0.82rem' }}>Pasang dari Paket</button>
                  <button className="btn btn-primary" onClick={()=>setModal(true)}
                    style={{ display:'flex', alignItems:'center', gap:'0.35rem', fontSize:'0.82rem' }}>
                    <Plus size={14}/> Tambah Komponen
                  </button>
                </div>
              </div>

              {milikGuru.length === 0 ? (
                <p style={{ color:'var(--text-secondary)', fontSize:'0.88rem' }}>
                  Belum ada komponen gaji terpasang. Karyawan ini tidak akan mendapat slip sampai komponennya dipasang.
                </p>
              ) : (
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.85rem' }}>
                    <thead>
                      <tr style={{ borderBottom:'2px solid var(--glass-border)', background:'rgba(79,70,229,0.04)' }}>
                        {['Komponen','Cara Hitung','Nominal Berlaku','Masa Berlaku','Aksi'].map(h=>(
                          <th key={h} style={{ padding:'0.6rem 0.7rem', textAlign:'left', fontWeight:700, fontSize:'0.72rem', color:'var(--text-secondary)', whiteSpace:'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {milikGuru.map(row => {
                        const nom = nominalEfektif(row);
                        const dioverride = row.konfigurasi_override?.nominal !== undefined;
                        return (
                          <tr key={row.id} style={{ borderBottom:'1px solid var(--glass-border)' }}>
                            <td style={{ padding:'0.65rem 0.7rem', fontWeight:600 }}>
                              {row.komponen?.nama}
                              <span style={{ marginLeft:'0.4rem', fontSize:'0.72rem', color: row.komponen?.kategori==='potongan' ? '#b91c1c' : '#047857' }}>
                                {row.komponen?.kategori === 'potongan' ? '(potongan)' : ''}
                              </span>
                            </td>
                            <td style={{ padding:'0.65rem 0.7rem', color:'var(--text-secondary)' }}>
                              {row.komponen?.tipe_perhitungan?.replace('_',' ')}
                            </td>
                            <td style={{ padding:'0.65rem 0.7rem' }}>
                              {nom != null ? (
                                <>
                                  <strong>{formatRupiah(nom)}</strong>
                                  {dioverride && <div style={{ fontSize:'0.7rem', color:'var(--primary)' }}>khusus karyawan ini</div>}
                                </>
                              ) : <span style={{ color:'var(--text-secondary)' }}>ikut aturan komponen</span>}
                            </td>
                            <td style={{ padding:'0.65rem 0.7rem', whiteSpace:'nowrap' }}>
                              <div style={{ display:'flex', alignItems:'center', gap:'0.3rem' }}>
                                <CalendarRange size={12} style={{ color:'var(--text-secondary)' }} />
                                {fmtTgl(row.berlaku_mulai)} — {row.berlaku_selesai ? fmtTgl(row.berlaku_selesai) : 'sekarang'}
                              </div>
                            </td>
                            <td style={{ padding:'0.65rem 0.7rem' }}>
                              <button onClick={()=>hapus(row)} title="Lepas"
                                style={{ background:'#fee2e2', border:'none', borderRadius:'0.4rem', padding:'0.3rem 0.5rem', cursor:'pointer', color:'#b91c1c' }}>
                                <Trash2 size={13}/>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modal tambah komponen */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth:480 }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.25rem' }}>
              <h2 style={{ fontWeight:700, fontSize:'1.05rem', margin:0 }}>Tambah Komponen</h2>
              <button onClick={()=>setModal(false)} style={{ background:'none', border:'none', cursor:'pointer' }}><X size={20}/></button>
            </div>
            <form onSubmit={simpan} style={{ display:'flex', flexDirection:'column', gap:'0.85rem' }}>
              <div>
                <label style={lbl}>Komponen *</label>
                <select required value={form.komponen_gaji_id}
                  onChange={e=>setForm(f=>({...f,komponen_gaji_id:e.target.value}))} style={inp}>
                  <option value="">— Pilih komponen aktif —</option>
                  {komponen.map(k => <option key={k.id} value={k.id}>{k.nama} ({k.kategori})</option>)}
                </select>
                {komponen.length === 0 && (
                  <p style={{ margin:'0.25rem 0 0', fontSize:'0.75rem', color:'#b45309' }}>
                    Belum ada komponen aktif. Aktifkan dulu di menu Komponen Gaji.
                  </p>
                )}
              </div>
              <div>
                <label style={lbl}>Nominal Khusus Karyawan Ini (Rp)</label>
                <input type="number" min={0} step={1000} value={form.nominal_override}
                  onChange={e=>setForm(f=>({...f,nominal_override:e.target.value}))}
                  style={inp} placeholder="Kosongkan = ikut aturan komponen" />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.65rem' }}>
                <div>
                  <label style={lbl}>Berlaku Mulai *</label>
                  <input type="date" required value={form.berlaku_mulai}
                    onChange={e=>setForm(f=>({...f,berlaku_mulai:e.target.value}))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Berlaku Sampai</label>
                  <input type="date" value={form.berlaku_selesai}
                    onChange={e=>setForm(f=>({...f,berlaku_selesai:e.target.value}))} style={inp} />
                </div>
              </div>
              <p style={{ margin:0, fontSize:'0.75rem', color:'var(--text-secondary)' }}>
                Kalau gaji naik, jangan diubah — akhiri yang lama lalu pasang baris baru. Slip bulan-bulan sebelumnya tetap memakai angka lama.
              </p>
              <div style={{ display:'flex', gap:'0.65rem', justifyContent:'flex-end' }}>
                <button type="button" className="btn" onClick={()=>setModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving?'Menyimpan...':'Simpan'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal pasang paket */}
      {paketModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth:440 }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.25rem' }}>
              <h2 style={{ fontWeight:700, fontSize:'1.05rem', margin:0 }}>Pasang dari Paket</h2>
              <button onClick={()=>setPaketModal(false)} style={{ background:'none', border:'none', cursor:'pointer' }}><X size={20}/></button>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:'0.85rem' }}>
              <div>
                <label style={lbl}>Paket Gaji</label>
                <select value={paketPilih} onChange={e=>setPaketPilih(e.target.value)} style={inp}>
                  <option value="">— Pilih paket —</option>
                  {paket.map(p => <option key={p.id} value={p.id}>{p.nama} ({p.paket_gaji_komponen?.length || 0} komponen)</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Berlaku Mulai</label>
                <input type="date" value={paketMulai} onChange={e=>setPaketMulai(e.target.value)} style={inp} />
              </div>
              <div style={{ display:'flex', gap:'0.65rem', justifyContent:'flex-end' }}>
                <button className="btn" onClick={()=>setPaketModal(false)}>Batal</button>
                <button className="btn btn-primary" onClick={pasangPaket}>Pasang</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
