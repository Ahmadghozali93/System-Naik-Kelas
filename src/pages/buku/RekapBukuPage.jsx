import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { formatRupiah } from '../../utils/formatRupiah';

// Ringkasan penjualan buku dari transaksi Divalidasi, berdasarkan tanggal
// bayar. Transaksi yang masih Menunggu hanya ditampilkan jumlahnya.
const awalBulan = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
};
const hariIni = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

// Kelompokkan baris → { kunci, qty, omzet, transaksi } diurutkan omzet terbesar.
const kelompok = (daftar, kunciFn, qtyFn, nilaiFn) => {
  const m = {};
  daftar.forEach(x => {
    const k = kunciFn(x) || '-';
    m[k] = m[k] || { kunci: k, qty: 0, omzet: 0, transaksi: new Set() };
    m[k].qty   += qtyFn(x);
    m[k].omzet += nilaiFn(x);
    m[k].transaksi.add(x.transaksi_id || x.id);
  });
  return Object.values(m).map(v => ({ ...v, transaksi: v.transaksi.size })).sort((a, b) => b.omzet - a.omzet);
};

const th = { padding:'0.55rem 0.75rem', fontWeight:700, fontSize:'0.72rem', color:'var(--text-secondary)', whiteSpace:'nowrap', letterSpacing:'0.06em', textAlign:'left' };
const td = { padding:'0.6rem 0.75rem' };

const Kartu = ({ label, nilai, sub }) => (
  <div className="glass-card" style={{padding:'1rem 1.25rem',flex:'1 1 180px'}}>
    <div style={{fontSize:'0.75rem',color:'var(--text-secondary)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em'}}>{label}</div>
    <div style={{fontSize:'1.4rem',fontWeight:700,marginTop:'0.2rem'}}>{nilai}</div>
    {sub && <div style={{fontSize:'0.75rem',color:'var(--text-secondary)',marginTop:'0.15rem'}}>{sub}</div>}
  </div>
);

const Tabel = ({ judul, label, daftar }) => (
  <div className="glass-card" style={{padding:'1.25rem',flex:'1 1 420px',minWidth:0}}>
    <p style={{fontWeight:700,margin:'0 0 0.75rem'}}>{judul}</p>
    {daftar.length === 0 ? <p style={{color:'var(--text-secondary)',fontSize:'0.85rem',margin:0}}>Tidak ada data.</p> : (
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.85rem'}}>
          <thead>
            <tr style={{borderBottom:'2px solid var(--glass-border)'}}>
              <th style={th}>{label}</th><th style={{...th,textAlign:'right'}}>TRANSAKSI</th>
              <th style={{...th,textAlign:'right'}}>BUKU</th><th style={{...th,textAlign:'right'}}>OMZET</th>
            </tr>
          </thead>
          <tbody>
            {daftar.map(d => (
              <tr key={d.kunci} style={{borderBottom:'1px solid var(--glass-border)'}}>
                <td style={{...td,fontWeight:600}}>{d.kunci}</td>
                <td style={{...td,textAlign:'right'}}>{d.transaksi}</td>
                <td style={{...td,textAlign:'right'}}>{d.qty}</td>
                <td style={{...td,textAlign:'right',fontWeight:700,whiteSpace:'nowrap'}}>{formatRupiah(d.omzet)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
);

export default function RekapBukuPage() {
  const [dari, setDari]     = useState(awalBulan);
  const [sampai, setSampai] = useState(hariIni);
  const [unit, setUnit]     = useState('');
  const [rows, setRows]     = useState([]);
  const [menunggu, setMenunggu] = useState(0);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    let aktif = true;
    Promise.all([
      supabase.from('transaksi_buku').select('*, items:transaksi_buku_item(*)')
        .eq('status', 'Divalidasi').gte('tanggal_bayar', dari).lte('tanggal_bayar', sampai),
      supabase.from('transaksi_buku').select('id', { count: 'exact', head: true })
        .eq('status', 'Menunggu').gte('tanggal_bayar', dari).lte('tanggal_bayar', sampai),
    ]).then(([tRes, mRes]) => {
      if (!aktif) return;
      if (tRes.error) alert('Gagal memuat rekap: ' + tRes.error.message);
      setRows(tRes.data || []);
      setMenunggu(mRes.count || 0);
      setLoading(false);
    });
    return () => { aktif = false; };
  }, [dari, sampai]);

  const allUnits = useMemo(() => [...new Set(rows.map(r => r.unit).filter(Boolean))].sort(), [rows]);
  const data = useMemo(() => unit ? rows.filter(r => r.unit === unit) : rows, [rows, unit]);

  const items = useMemo(() => data.flatMap(r => (r.items || []).map(i => ({ ...i, unit: r.unit }))), [data]);
  const totalOmzet  = data.reduce((s, r) => s + Number(r.total || 0), 0);
  const totalDiskon = data.reduce((s, r) => s + Number(r.diskon || 0), 0);
  const totalBuku   = items.reduce((s, i) => s + i.qty, 0);
  const belumSetor  = data.filter(r => !r.setor_id).reduce((s, r) => s + Number(r.total || 0), 0);

  // Per produk dihitung dari item (sebelum diskon transaksi); per unit/guru/metode dari total transaksi.
  const perProduk = useMemo(() => kelompok(items, i => i.nama_produk, i => i.qty, i => Number(i.subtotal)), [items]);
  const qtyPerTrx = useMemo(() => Object.fromEntries(data.map(r => [r.id, (r.items || []).reduce((s, i) => s + i.qty, 0)])), [data]);
  const perUnit   = useMemo(() => kelompok(data, r => r.unit, r => qtyPerTrx[r.id], r => Number(r.total)), [data, qtyPerTrx]);
  const perGuru   = useMemo(() => kelompok(data, r => r.dicatat_oleh, r => qtyPerTrx[r.id], r => Number(r.total)), [data, qtyPerTrx]);
  const perMetode = useMemo(() => kelompok(data, r => r.metode, r => qtyPerTrx[r.id], r => Number(r.total)), [data, qtyPerTrx]);

  const inp = { padding:'0.5rem 0.75rem', borderRadius:'0.5rem', border:'1px solid var(--glass-border)', background:'var(--surface-color)', fontFamily:'inherit', fontSize:'0.85rem' };

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.5rem',flexWrap:'wrap',gap:'0.75rem'}}>
        <div>
          <p style={{fontSize:'0.78rem',color:'var(--text-secondary)',margin:0,textTransform:'uppercase',letterSpacing:'0.05em'}}>Penjualan Buku</p>
          <h1 style={{fontSize:'1.6rem',fontWeight:700,margin:0}}>Rekap</h1>
        </div>
        <div style={{display:'flex',gap:'0.5rem',alignItems:'center',flexWrap:'wrap'}}>
          <input type="date" style={inp} value={dari} onChange={e=>{ setLoading(true); setDari(e.target.value); }}/>
          <span style={{color:'var(--text-secondary)'}}>–</span>
          <input type="date" style={inp} value={sampai} onChange={e=>{ setLoading(true); setSampai(e.target.value); }}/>
          <select style={inp} value={unit} onChange={e=>setUnit(e.target.value)}>
            <option value="">Semua Unit</option>
            {allUnits.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      </div>

      {loading ? <p style={{color:'var(--text-secondary)'}}>Memuat...</p> : (
        <>
          <div style={{display:'flex',gap:'1rem',flexWrap:'wrap',marginBottom:'1rem'}}>
            <Kartu label="Omzet" nilai={formatRupiah(totalOmzet)} sub={totalDiskon > 0 ? `setelah diskon ${formatRupiah(totalDiskon)}` : null}/>
            <Kartu label="Buku terjual" nilai={totalBuku} sub={`${data.length} transaksi`}/>
            <Kartu label="Belum disetor" nilai={formatRupiah(belumSetor)} sub="sudah divalidasi, belum masuk Setor Buku"/>
            <Kartu label="Menunggu validasi" nilai={menunggu} sub="transaksi, belum dihitung di rekap"/>
          </div>
          <div style={{display:'flex',gap:'1rem',flexWrap:'wrap'}}>
            <Tabel judul="Per Produk" label="PRODUK" daftar={perProduk}/>
            <Tabel judul="Per Unit" label="UNIT" daftar={perUnit}/>
            <Tabel judul="Per Guru" label="GURU" daftar={perGuru}/>
            <Tabel judul="Per Metode" label="METODE" daftar={perMetode}/>
          </div>
          <p style={{fontSize:'0.75rem',color:'var(--text-secondary)',marginTop:'0.75rem'}}>
            Omzet per produk dihitung sebelum diskon transaksi; per unit, guru, dan metode sesudah diskon.
          </p>
        </>
      )}
    </div>
  );
}
