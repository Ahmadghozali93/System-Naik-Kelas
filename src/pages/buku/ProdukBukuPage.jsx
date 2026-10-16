import { useState, useEffect, useMemo } from 'react';
import { Plus, Search, Edit, X, ScanLine, Barcode } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/authStore';
import { formatRupiah } from '../../utils/formatRupiah';
import KameraScanner from '../../components/KameraScanner';

// Master buku. Barcode = kode yang tercetak di buku (ISBN/EAN), opsional:
// produk tanpa barcode dipilih manual saat transaksi; yang punya barcode
// wajib discan (diperiksa juga di simpan_transaksi_buku, migrasi 0036).
const PENGELOLA = ['Owner', 'Administrator', 'Supervisor'];
const genId = () => 'BK-' + Math.random().toString(36).substr(2,6).toUpperCase();
const KOSONG = { nama:'', harga:'', barcode:'', aktif:true };

export default function ProdukBukuPage() {
  const { user } = useAuth();
  const bolehKelola = PENGELOLA.includes(user?.role);

  const [produks, setProduks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [muat, setMuat]       = useState(0);
  const [search, setSearch]   = useState('');
  const [filterBarcode, setFilterBarcode] = useState('');   // '', 'ada', 'belum'
  const [filterAktif, setFilterAktif]     = useState('aktif');

  const [modal, setModal]       = useState(null);   // null | { id? }
  const [form, setForm]         = useState(KOSONG);
  const [scanOpen, setScanOpen] = useState(false);
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    let aktif = true;
    supabase.from('produk_buku').select('*').order('nama').then(({ data, error }) => {
      if (!aktif) return;
      if (error) alert('Gagal memuat produk: ' + error.message);
      setProduks(data || []);
      setLoading(false);
    });
    return () => { aktif = false; };
  }, [muat]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return produks.filter(p => {
      if (q && !p.nama?.toLowerCase().includes(q) && !p.id.toLowerCase().includes(q) && !p.barcode?.toLowerCase().includes(q)) return false;
      if (filterBarcode === 'ada'   && !p.barcode) return false;
      if (filterBarcode === 'belum' &&  p.barcode) return false;
      if (filterAktif === 'aktif'    && !p.aktif) return false;
      if (filterAktif === 'nonaktif' &&  p.aktif) return false;
      return true;
    });
  }, [produks, search, filterBarcode, filterAktif]);

  const buka = (p = null) => {
    setForm(p ? { nama:p.nama, harga:String(p.harga ?? ''), barcode:p.barcode || '', aktif:p.aktif } : KOSONG);
    setScanOpen(false);
    setModal({ id: p?.id || null });
  };

  const simpan = async (e) => {
    e.preventDefault();
    const data = {
      nama: form.nama.trim(),
      harga: Number(form.harga) || 0,
      barcode: form.barcode.trim() || null,
      aktif: form.aktif,
    };
    setSaving(true);
    const { error } = modal.id
      ? await supabase.from('produk_buku').update(data).eq('id', modal.id)
      : await supabase.from('produk_buku').insert([{ id: genId(), ...data }]);
    setSaving(false);
    if (error) {
      alert(error.code === '23505' ? `Barcode ${data.barcode} sudah dipakai produk lain.` : 'Gagal menyimpan: ' + error.message);
      return;
    }
    setModal(null);
    setLoading(true);
    setMuat(n => n + 1);
  };

  const inp = { width:'100%', padding:'0.5rem 0.75rem', borderRadius:'0.5rem', border:'1px solid var(--glass-border)',
    background:'var(--surface-color)', fontFamily:'inherit', fontSize:'0.875rem', boxSizing:'border-box' };
  const sel = { padding:'0.5rem 0.75rem', borderRadius:'0.5rem', border:'1px solid var(--glass-border)', background:'var(--surface-color)', fontFamily:'inherit', fontSize:'0.85rem' };
  const th  = { padding:'0.65rem 0.75rem', fontWeight:700, fontSize:'0.72rem', color:'var(--text-secondary)', whiteSpace:'nowrap', letterSpacing:'0.06em', textAlign:'left' };
  const td  = { padding:'0.75rem' };

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.5rem',flexWrap:'wrap',gap:'0.75rem'}}>
        <div>
          <p style={{fontSize:'0.78rem',color:'var(--text-secondary)',margin:0,textTransform:'uppercase',letterSpacing:'0.05em'}}>Penjualan Buku</p>
          <h1 style={{fontSize:'1.6rem',fontWeight:700,margin:0}}>Produk</h1>
        </div>
        {bolehKelola && (
          <button onClick={()=>buka()} className="btn btn-primary" style={{display:'flex',alignItems:'center',gap:'0.4rem'}}>
            <Plus size={18}/> Tambah Produk
          </button>
        )}
      </div>

      <div style={{display:'flex',gap:'0.65rem',marginBottom:'1rem',flexWrap:'wrap',alignItems:'center'}}>
        <div style={{position:'relative',flex:1,minWidth:180}}>
          <Search size={15} style={{position:'absolute',left:'0.75rem',top:'50%',transform:'translateY(-50%)',color:'var(--text-secondary)'}}/>
          <input style={{...inp,paddingLeft:'2.2rem'}} placeholder="Cari nama / ID / barcode..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <select style={sel} value={filterBarcode} onChange={e=>setFilterBarcode(e.target.value)}>
          <option value="">Semua Barcode</option>
          <option value="ada">Punya barcode</option>
          <option value="belum">Belum ada barcode</option>
        </select>
        <select style={sel} value={filterAktif} onChange={e=>setFilterAktif(e.target.value)}>
          <option value="aktif">Aktif</option>
          <option value="nonaktif">Nonaktif</option>
          <option value="">Semua</option>
        </select>
      </div>

      <div className="glass-card" style={{padding:'1.5rem'}}>
        {loading ? <p style={{color:'var(--text-secondary)'}}>Memuat...</p>
          : filtered.length === 0 ? <p style={{color:'var(--text-secondary)'}}>Belum ada produk.</p>
          : (
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.85rem'}}>
              <thead>
                <tr style={{borderBottom:'2px solid var(--glass-border)',background:'rgba(79,70,229,0.04)'}}>
                  <th style={th}>ID PRODUK</th><th style={th}>NAMA</th><th style={{...th,textAlign:'right'}}>HARGA</th>
                  <th style={th}>BARCODE</th><th style={{...th,textAlign:'center'}}>STATUS</th>{bolehKelola && <th style={th}></th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id} style={{borderBottom:'1px solid var(--glass-border)'}}>
                    <td style={{...td,color:'var(--text-secondary)',fontWeight:500,whiteSpace:'nowrap'}}>{p.id}</td>
                    <td style={{...td,fontWeight:600}}>{p.nama}</td>
                    <td style={{...td,textAlign:'right',fontWeight:700,whiteSpace:'nowrap'}}>{formatRupiah(p.harga || 0)}</td>
                    <td style={td}>
                      {p.barcode
                        ? <span style={{display:'inline-flex',alignItems:'center',gap:'0.3rem',fontFamily:'monospace'}}><Barcode size={14}/>{p.barcode}</span>
                        : <span style={{background:'#fef3c7',color:'#92400e',padding:'0.15rem 0.5rem',borderRadius:'999px',fontSize:'0.72rem',fontWeight:600,whiteSpace:'nowrap'}}>Belum ada — pilih manual</span>}
                    </td>
                    <td style={{...td,textAlign:'center'}}>
                      <span style={{background:p.aktif?'#d1fae5':'#f3f4f6',color:p.aktif?'#047857':'#6b7280',padding:'0.15rem 0.55rem',borderRadius:'999px',fontSize:'0.75rem',fontWeight:600}}>
                        {p.aktif ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    {bolehKelola && (
                      <td style={{...td,textAlign:'right'}}>
                        <button onClick={()=>buka(p)} title="Edit"
                          style={{color:'var(--primary)',background:'rgba(79,70,229,0.1)',border:'none',cursor:'pointer',padding:'0.45rem',borderRadius:'0.375rem',display:'inline-flex'}}>
                          <Edit size={15}/>
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div className="modal-overlay modal-tengah" onClick={e=>{ if (e.target === e.currentTarget && !saving) setModal(null); }}>
          <div className="modal-content" style={{maxWidth:460}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
              <h3 style={{margin:0,fontWeight:700}}>{modal.id ? `Edit ${modal.id}` : 'Tambah Produk'}</h3>
              <button onClick={()=>setModal(null)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-secondary)'}}><X size={18}/></button>
            </div>
            <form onSubmit={simpan} style={{display:'flex',flexDirection:'column',gap:'0.9rem'}}>
              <div>
                <label className="form-label">Nama Produk<span className="wajib"> *</span></label>
                <input className="form-input" value={form.nama} required onChange={e=>setForm(f=>({...f,nama:e.target.value}))}/>
              </div>
              <div>
                <label className="form-label">Harga (Rp)<span className="wajib"> *</span></label>
                <input type="number" min="0" className="form-input" value={form.harga} required onChange={e=>setForm(f=>({...f,harga:e.target.value}))}/>
              </div>
              <div>
                <label className="form-label">Barcode</label>
                <div style={{display:'flex',gap:'0.5rem'}}>
                  <input className="form-input" value={form.barcode} placeholder="Kosongkan bila buku tidak punya barcode"
                    onChange={e=>setForm(f=>({...f,barcode:e.target.value}))} style={{flex:1}}/>
                  <button type="button" onClick={()=>setScanOpen(v=>!v)} className="btn"
                    style={{display:'flex',alignItems:'center',gap:'0.3rem',background:'var(--surface-color)',border:'1px solid var(--glass-border)'}}>
                    <ScanLine size={15}/> {scanOpen ? 'Tutup' : 'Scan'}
                  </button>
                </div>
                <p style={{fontSize:'0.75rem',color:'var(--text-secondary)',margin:'0.35rem 0 0'}}>
                  Bila diisi, produk ini wajib discan saat transaksi dan tidak bisa dipilih manual.
                </p>
                {scanOpen && (
                  <div style={{marginTop:'0.6rem'}}>
                    <KameraScanner tinggi={180} onScan={kode => { setForm(f=>({...f,barcode:kode})); setScanOpen(false); }}/>
                  </div>
                )}
              </div>
              <label style={{display:'flex',alignItems:'center',gap:'0.5rem',fontSize:'0.875rem',cursor:'pointer'}}>
                <input type="checkbox" checked={form.aktif} onChange={e=>setForm(f=>({...f,aktif:e.target.checked}))}/>
                Aktif (bisa dijual)
              </label>
              <div style={{display:'flex',gap:'0.75rem'}}>
                <button type="submit" className="btn btn-primary" style={{flex:1}} disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</button>
                <button type="button" className="btn" onClick={()=>setModal(null)} style={{background:'var(--surface-color)'}}>Batal</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
