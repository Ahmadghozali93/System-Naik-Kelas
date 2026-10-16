import { useState, useEffect, useMemo } from 'react';
import { Search, ScanLine, Camera, CameraOff, Minus, Plus, Trash2, X, CheckCircle2, AlertTriangle, UserRound, ShoppingCart, ChevronLeft, ChevronRight } from 'lucide-react';
import { Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/authStore';
import { formatRupiah } from '../../utils/formatRupiah';
import { METODE } from '../../utils/pembayaranSpp';
import KameraScanner from '../../components/KameraScanner';

// Guru mencatat penjualan buku lewat popup bertahap:
//   1. Siswa  → 2. Scan produk (bisa banyak) → 3. Pembayaran.
// Produk yang punya barcode wajib discan; hanya produk tanpa barcode yang
// muncul di pilihan manual. Disimpan lewat simpan_transaksi_buku (migrasi
// 0036) yang juga memeriksa aturan itu dan mengambil harga dari database.
// Hasilnya menunggu validasi koordinator di Log Buku.
const hariIni = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
const FORM_AWAL = () => ({ tanggal_bayar: hariIni(), metode:'Tunai', diskon:'0', catatan:'' });
const FORMAT_QR = [Html5QrcodeSupportedFormats.QR_CODE];
const TAHAP = ['Siswa', 'Scan Produk', 'Pembayaran'];

const fmtWaktu = (d) => d ? new Date(d).toLocaleString('id-ID',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '-';
const statusBadge = (s) => {
  const map = { Menunggu:['#fef3c7','#92400e'], Divalidasi:['#d1fae5','#047857'], Ditolak:['#fee2e2','#b91c1c'] };
  const [bg, color] = map[s] || ['#f3f4f6','#374151'];
  return <span style={{background:bg,color,padding:'0.15rem 0.55rem',borderRadius:'999px',fontSize:'0.72rem',fontWeight:600,whiteSpace:'nowrap'}}>{s}</span>;
};

export default function TransaksiBukuPage() {
  const { user } = useAuth();
  const [produks, setProduks] = useState([]);
  const [riwayat, setRiwayat] = useState([]);
  const [muat, setMuat]       = useState(0);
  const [selesai, setSelesai] = useState(null);   // pesan sukses di halaman

  // Popup
  const [buka, setBuka]   = useState(false);
  const [tahap, setTahap] = useState(1);
  const [siswa, setSiswa]           = useState(null);   // { id, nama, unit }
  const [qSiswa, setQSiswa]         = useState('');
  const [hasilSiswa, setHasilSiswa] = useState([]);
  const [kameraSiswa, setKameraSiswa] = useState(false);
  const [keranjang, setKeranjang] = useState([]);   // [{ produk_id, nama, harga, qty, discan }]
  const [kode, setKode]           = useState('');
  const [manualId, setManualId]   = useState('');
  const [kamera, setKamera]       = useState(true);
  const [info, setInfo]           = useState(null);  // { ok, teks } — umpan balik scan
  const [form, setForm]           = useState(FORM_AWAL);
  const [saving, setSaving]       = useState(false);

  useEffect(() => {
    supabase.from('produk_buku').select('*').eq('aktif', true).order('nama').then(({ data, error }) => {
      if (error) alert('Gagal memuat produk: ' + error.message);
      setProduks(data || []);
    });
  }, []);

  // Transaksi guru ini yang belum divalidasi. Begitu koordinator memvalidasi
  // di Log Buku, transaksinya hilang dari sini. Yang ditolak tetap tampil
  // 7 hari supaya guru sempat membaca alasannya dan input ulang.
  useEffect(() => {
    if (!user?.id) return;
    let aktif = true;
    const seminggu = new Date(Date.now() - 7 * 864e5).toISOString();
    supabase.from('transaksi_buku').select('*, items:transaksi_buku_item(nama_produk, qty)')
      .eq('dicatat_oleh_id', user.id)
      .or(`status.eq.Menunggu,and(status.eq.Ditolak,divalidasi_pada.gte.${seminggu})`)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!aktif) return;
        if (error) alert('Gagal memuat transaksi: ' + error.message);
        setRiwayat(data || []);
      });
    return () => { aktif = false; };
  }, [user?.id, muat]);

  // Cari siswa — dijalankan sebentar setelah berhenti mengetik.
  useEffect(() => {
    const q = qSiswa.trim().replace(/[%,()]/g, '');
    if (q.length < 2) return;
    let aktif = true;
    const t = setTimeout(async () => {
      const { data } = await supabase.from('siswa').select('id, nama, unit, status')
        .or(`nama.ilike.%${q}%,id.ilike.%${q}%`).order('nama').limit(10);
      if (aktif) setHasilSiswa(data || []);
    }, 300);
    return () => { aktif = false; clearTimeout(t); };
  }, [qSiswa]);

  const produkManual = useMemo(() => produks.filter(p => !p.barcode), [produks]);

  const mulai = () => {
    setTahap(1); setSiswa(null); setQSiswa(''); setHasilSiswa([]); setKameraSiswa(false);
    setKeranjang([]); setKode(''); setManualId(''); setKamera(true); setInfo(null);
    setForm(FORM_AWAL()); setSelesai(null);
    setBuka(true);
  };
  const tutup = () => {
    if (keranjang.length > 0 && !window.confirm('Batalkan transaksi ini? Produk yang sudah discan akan hilang.')) return;
    setBuka(false);
  };

  // Memilih siswa langsung lanjut ke tahap 2.
  const pilihSiswa = (s) => {
    setSiswa(s); setQSiswa(''); setHasilSiswa([]); setKameraSiswa(false);
    setInfo(null); setTahap(2);
  };

  const scanSiswa = async (mentah) => {
    const k = (mentah || '').trim().toUpperCase();
    const { data } = await supabase.from('siswa').select('id, nama, unit').eq('id', k).maybeSingle();
    if (data) pilihSiswa(data);
    else setInfo({ ok:false, teks:`QR ${k} bukan kartu siswa yang terdaftar.` });
  };

  const tambah = (p, discan) => {
    setKeranjang(prev => {
      const ada = prev.find(x => x.produk_id === p.id);
      if (ada) return prev.map(x => x.produk_id === p.id ? { ...x, qty: x.qty + 1 } : x);
      return [...prev, { produk_id: p.id, nama: p.nama, harga: Number(p.harga) || 0, qty: 1, discan }];
    });
  };

  // Kamera dan scanner USB / ketik kode di tahap 2.
  const scanProduk = (mentah) => {
    const k = (mentah || '').trim();
    if (!k) return;
    const p = produks.find(x => x.barcode && x.barcode === k);
    if (!p) { setInfo({ ok:false, teks:`Barcode ${k} tidak terdaftar di Produk.` }); return; }
    tambah(p, true);
    setInfo({ ok:true, teks:`+1 ${p.nama}` });
  };

  const ubahQty = (id, delta) => setKeranjang(prev =>
    prev.map(x => x.produk_id === id ? { ...x, qty: Math.max(1, x.qty + delta) } : x));
  const hapus = (id) => setKeranjang(prev => prev.filter(x => x.produk_id !== id));

  const jumlahBuku = keranjang.reduce((s, x) => s + x.qty, 0);
  const subtotal = keranjang.reduce((s, x) => s + x.harga * x.qty, 0);
  const diskon   = Number(form.diskon) || 0;
  const total    = Math.max(subtotal - diskon, 0);

  const simpan = async (e) => {
    e.preventDefault();
    if (diskon > subtotal) { alert('Diskon melebihi subtotal.'); return; }
    setSaving(true);
    const { data: id, error } = await supabase.rpc('simpan_transaksi_buku', {
      p_siswa_id: siswa.id,
      p_tanggal_bayar: form.tanggal_bayar,
      p_metode: form.metode,
      p_diskon: diskon,
      p_catatan: form.catatan,
      p_items: keranjang.map(x => ({ produk_id: x.produk_id, qty: x.qty, discan: x.discan })),
    });
    setSaving(false);
    if (error) { alert('Gagal menyimpan: ' + error.message); return; }
    setSelesai(`Transaksi ${id} (${siswa.nama}, ${formatRupiah(total)}) tersimpan — menunggu validasi koordinator di Log Buku.`);
    setBuka(false);
    setMuat(n => n + 1);
  };

  const inp = { width:'100%', padding:'0.55rem 0.75rem 0.55rem 2.2rem', borderRadius:'0.5rem', border:'1px solid var(--glass-border)',
    background:'var(--surface-color)', fontSize:'0.9rem', fontFamily:'inherit', boxSizing:'border-box' };
  const ikonKiri = { position:'absolute', left:'0.75rem', top:'50%', transform:'translateY(-50%)', color:'var(--text-secondary)' };
  const btnBulat = { background:'var(--surface-color)', border:'1px solid var(--glass-border)', borderRadius:'0.4rem', width:28, height:28,
    display:'inline-flex', alignItems:'center', justifyContent:'center', cursor:'pointer' };
  const btnGaris = { display:'flex', alignItems:'center', gap:'0.35rem', background:'none', border:'1px solid var(--glass-border)',
    borderRadius:'0.4rem', padding:'0.35rem 0.7rem', cursor:'pointer', fontSize:'0.82rem', fontFamily:'inherit' };
  const th = { padding:'0.6rem 0.75rem', fontWeight:700, fontSize:'0.72rem', color:'var(--text-secondary)', whiteSpace:'nowrap', letterSpacing:'0.06em', textAlign:'left' };
  const td = { padding:'0.7rem 0.75rem', verticalAlign:'top' };

  const kotakSiswa = siswa && (
    <div style={{display:'flex',alignItems:'center',gap:'0.6rem',padding:'0.55rem 0.8rem',borderRadius:'0.5rem',background:'rgba(79,70,229,0.06)',border:'1px solid rgba(79,70,229,0.15)',marginBottom:'1rem'}}>
      <UserRound size={18} style={{color:'var(--primary)'}}/>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontWeight:700,fontSize:'0.9rem'}}>{siswa.nama}</div>
        <div style={{fontSize:'0.75rem',color:'var(--text-secondary)'}}>{siswa.id} · {siswa.unit || '-'}</div>
      </div>
    </div>
  );

  const pesanScan = info && (
    <div style={{display:'flex',alignItems:'center',gap:'0.45rem',margin:'0.75rem 0',padding:'0.5rem 0.75rem',borderRadius:'0.5rem',fontSize:'0.85rem',
      background: info.ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.08)', color: info.ok ? '#047857' : '#b91c1c'}}>
      {info.ok ? <CheckCircle2 size={16}/> : <AlertTriangle size={16}/>} {info.teks}
    </div>
  );

  return (
    <div style={{maxWidth:1000,margin:'0 auto'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.5rem',flexWrap:'wrap',gap:'0.75rem'}}>
        <div>
          <p style={{fontSize:'0.78rem',color:'var(--text-secondary)',margin:0,textTransform:'uppercase',letterSpacing:'0.05em'}}>Penjualan Buku</p>
          <h1 style={{fontSize:'1.6rem',fontWeight:700,margin:0}}>Transaksi</h1>
        </div>
        <button onClick={mulai} className="btn btn-primary" style={{display:'flex',alignItems:'center',gap:'0.4rem'}}>
          <Plus size={18}/> Transaksi Baru
        </button>
      </div>

      {selesai && (
        <div style={{display:'flex',alignItems:'flex-start',gap:'0.5rem',marginBottom:'1rem',padding:'0.65rem 0.9rem',borderRadius:'0.5rem',fontSize:'0.875rem',background:'rgba(16,185,129,0.1)',color:'#047857'}}>
          <CheckCircle2 size={17} style={{flexShrink:0}}/><span style={{flex:1}}>{selesai}</span>
          <button onClick={()=>setSelesai(null)} style={{background:'none',border:'none',cursor:'pointer',color:'inherit',padding:0}}><X size={15}/></button>
        </div>
      )}

      {/* Riwayat transaksi guru ini */}
      <div className="glass-card" style={{padding:'1.5rem'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:'0.5rem',flexWrap:'wrap',marginBottom:'0.75rem'}}>
          <p style={{fontWeight:700,margin:0}}>Transaksi saya — belum divalidasi</p>
          <span style={{fontSize:'0.75rem',color:'var(--text-secondary)'}}>Hilang dari daftar setelah divalidasi koordinator</span>
        </div>
        {riwayat.length === 0 ? (
          <p style={{color:'var(--text-secondary)',fontSize:'0.875rem',margin:0}}>Tidak ada transaksi yang menunggu validasi. Klik <b>Transaksi Baru</b> untuk mulai.</p>
        ) : (
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.85rem'}}>
              <thead>
                <tr style={{borderBottom:'2px solid var(--glass-border)',background:'rgba(79,70,229,0.04)'}}>
                  <th style={th}>WAKTU</th><th style={th}>SISWA</th><th style={th}>PRODUK</th>
                  <th style={{...th,textAlign:'right'}}>TOTAL</th><th style={{...th,textAlign:'center'}}>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {riwayat.map(r => (
                  <tr key={r.id} style={{borderBottom:'1px solid var(--glass-border)'}}>
                    <td style={{...td,whiteSpace:'nowrap'}}>{fmtWaktu(r.created_at)}</td>
                    <td style={{...td,fontWeight:600}}>{r.nama_siswa}</td>
                    <td style={{...td,fontSize:'0.82rem'}}>{(r.items || []).map(i => `${i.nama_produk} ×${i.qty}`).join(', ')}</td>
                    <td style={{...td,textAlign:'right',fontWeight:700,whiteSpace:'nowrap'}}>{formatRupiah(r.total || 0)}</td>
                    <td style={{...td,textAlign:'center'}}>
                      {statusBadge(r.status)}
                      {r.status === 'Ditolak' && r.alasan_tolak && <div style={{color:'#b91c1c',fontSize:'0.72rem',marginTop:2}}>{r.alasan_tolak}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Popup bertahap ── */}
      {buka && (
        <div className="modal-overlay modal-tengah">
          <div className="modal-content" style={{maxWidth:520}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'0.9rem'}}>
              <h3 style={{margin:0,fontWeight:700}}>Transaksi Buku</h3>
              <button onClick={tutup} disabled={saving} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-secondary)'}}><X size={18}/></button>
            </div>

            {/* Penunjuk tahap */}
            <div style={{display:'flex',gap:'0.4rem',marginBottom:'1.1rem'}}>
              {TAHAP.map((nama, i) => {
                const no = i + 1, aktif = no === tahap, lewat = no < tahap;
                return (
                  <div key={nama} style={{flex:1}}>
                    <div style={{height:4,borderRadius:2,background: aktif || lewat ? 'var(--primary)' : 'var(--glass-border)'}}/>
                    <div style={{fontSize:'0.75rem',marginTop:'0.35rem',fontWeight: aktif ? 700 : 500,color: aktif ? 'var(--primary)' : 'var(--text-secondary)'}}>
                      {no}. {nama}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Tahap 1: siswa */}
            {tahap === 1 && (
              <>
                <div style={{position:'relative'}}>
                  <Search size={15} style={ikonKiri}/>
                  <input className="input-cari" style={inp} placeholder="Ketik nama / ID siswa" value={qSiswa} autoFocus
                    onChange={e=>{ setQSiswa(e.target.value); if (e.target.value.trim().length < 2) setHasilSiswa([]); }}/>
                </div>
                {hasilSiswa.length > 0 && (
                  <div style={{marginTop:'0.5rem',border:'1px solid var(--glass-border)',borderRadius:'0.5rem',maxHeight:260,overflowY:'auto'}}>
                    {hasilSiswa.map(s => (
                      <button key={s.id} onClick={()=>pilihSiswa(s)}
                        style={{display:'block',width:'100%',textAlign:'left',padding:'0.6rem 0.8rem',border:'none',borderBottom:'1px solid var(--glass-border)',
                          background:'none',cursor:'pointer',fontFamily:'inherit'}}>
                        <div style={{fontWeight:600,fontSize:'0.875rem'}}>{s.nama}</div>
                        <div style={{fontSize:'0.75rem',color:'var(--text-secondary)'}}>{s.id} · {s.unit || '-'} · {s.status || '-'}</div>
                      </button>
                    ))}
                  </div>
                )}
                <div style={{display:'flex',alignItems:'center',gap:'0.6rem',margin:'1rem 0 0.6rem',color:'var(--text-secondary)',fontSize:'0.8rem'}}>
                  <div style={{flex:1,height:1,background:'var(--glass-border)'}}/> atau <div style={{flex:1,height:1,background:'var(--glass-border)'}}/>
                </div>
                <button type="button" onClick={()=>{ setInfo(null); setKameraSiswa(v=>!v); }} style={{...btnGaris,width:'100%',justifyContent:'center'}}>
                  {kameraSiswa ? <><CameraOff size={15}/> Tutup kamera</> : <><Camera size={15}/> Scan QR kartu siswa</>}
                </button>
                {kameraSiswa && <div style={{marginTop:'0.75rem'}}><KameraScanner formats={FORMAT_QR} tinggi={200} onScan={scanSiswa}/></div>}
                {pesanScan}
              </>
            )}

            {/* Tahap 2: scan produk */}
            {tahap === 2 && (
              <>
                {kotakSiswa}
                <div style={{display:'flex',justifyContent:'flex-end',marginBottom:'0.5rem'}}>
                  <button type="button" onClick={()=>setKamera(v=>!v)} style={btnGaris}>
                    {kamera ? <><CameraOff size={15}/> Matikan kamera</> : <><Camera size={15}/> Nyalakan kamera</>}
                  </button>
                </div>
                {kamera && <KameraScanner tinggi={200} onScan={scanProduk}/>}
                <form onSubmit={e=>{ e.preventDefault(); scanProduk(kode); setKode(''); }} style={{marginTop:'0.75rem'}}>
                  <div style={{position:'relative'}}>
                    <ScanLine size={15} style={ikonKiri}/>
                    <input className="input-cari" style={inp} placeholder="Scanner USB / ketik barcode lalu Enter" value={kode} onChange={e=>setKode(e.target.value)}/>
                  </div>
                </form>
                {pesanScan}

                <div style={{marginTop:'0.9rem'}}>
                  <label className="form-label">Produk tanpa barcode (pilih manual)</label>
                  <div style={{display:'flex',gap:'0.5rem'}}>
                    <select className="form-input" value={manualId} onChange={e=>setManualId(e.target.value)} style={{flex:1}}>
                      <option value="">{produkManual.length ? '— pilih produk —' : 'Semua produk sudah punya barcode'}</option>
                      {produkManual.map(p => <option key={p.id} value={p.id}>{p.nama} — {formatRupiah(p.harga || 0)}</option>)}
                    </select>
                    <button type="button" className="btn btn-primary" disabled={!manualId}
                      onClick={()=>{ const p = produkManual.find(x => x.id === manualId); if (p) { tambah(p, false); setManualId(''); setInfo({ ok:true, teks:`+1 ${p.nama}` }); } }}>
                      Tambah
                    </button>
                  </div>
                  <p style={{fontSize:'0.75rem',color:'var(--text-secondary)',margin:'0.35rem 0 0'}}>Produk yang punya barcode tidak muncul di sini — wajib discan.</p>
                </div>

                <div style={{marginTop:'1rem'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'0.4rem',fontWeight:700,fontSize:'0.875rem',marginBottom:'0.5rem'}}>
                    <ShoppingCart size={16}/> Keranjang ({jumlahBuku} buku)
                  </div>
                  {keranjang.length === 0 ? (
                    <p style={{color:'var(--text-secondary)',fontSize:'0.85rem',margin:0}}>Belum ada produk.</p>
                  ) : (
                    <div style={{display:'flex',flexDirection:'column',gap:'0.45rem'}}>
                      {keranjang.map(x => (
                        <div key={x.produk_id} style={{display:'flex',alignItems:'center',gap:'0.5rem',padding:'0.5rem 0.65rem',border:'1px solid var(--glass-border)',borderRadius:'0.5rem'}}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontWeight:600,fontSize:'0.85rem'}}>{x.nama}</div>
                            <div style={{fontSize:'0.72rem',color:'var(--text-secondary)'}}>
                              {formatRupiah(x.harga)} · <span style={{color: x.discan ? '#047857' : '#92400e',fontWeight:600}}>{x.discan ? 'discan' : 'manual'}</span>
                            </div>
                          </div>
                          <button type="button" style={btnBulat} onClick={()=>ubahQty(x.produk_id,-1)}><Minus size={13}/></button>
                          <span style={{minWidth:20,textAlign:'center',fontWeight:700}}>{x.qty}</span>
                          <button type="button" style={btnBulat} onClick={()=>ubahQty(x.produk_id,1)}><Plus size={13}/></button>
                          <button type="button" onClick={()=>hapus(x.produk_id)} style={{background:'none',border:'none',cursor:'pointer',color:'#ef4444'}}><Trash2 size={15}/></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{display:'flex',gap:'0.75rem',marginTop:'1.25rem'}}>
                  <button type="button" className="btn" onClick={()=>{ setInfo(null); setTahap(1); }} style={{background:'var(--surface-color)',display:'flex',alignItems:'center',gap:'0.3rem'}}>
                    <ChevronLeft size={16}/> Ganti siswa
                  </button>
                  <button type="button" className="btn btn-primary" style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:'0.3rem'}}
                    disabled={keranjang.length === 0} onClick={()=>{ setInfo(null); setTahap(3); }}>
                    Lanjut ke Pembayaran <ChevronRight size={16}/>
                  </button>
                </div>
              </>
            )}

            {/* Tahap 3: pembayaran */}
            {tahap === 3 && (
              <form onSubmit={simpan} style={{display:'flex',flexDirection:'column',gap:'0.9rem'}}>
                {kotakSiswa && <div style={{marginBottom:'-1rem'}}>{kotakSiswa}</div>}

                <div style={{border:'1px solid var(--glass-border)',borderRadius:'0.5rem',padding:'0.4rem 0.75rem'}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.82rem'}}>
                    <tbody>
                      {keranjang.map(x => (
                        <tr key={x.produk_id} style={{borderBottom:'1px solid var(--glass-border)'}}>
                          <td style={{padding:'0.4rem 0'}}>{x.nama}</td>
                          <td style={{padding:'0.4rem 0.5rem',textAlign:'right',whiteSpace:'nowrap',color:'var(--text-secondary)'}}>{x.qty} × {formatRupiah(x.harga)}</td>
                          <td style={{padding:'0.4rem 0',textAlign:'right',fontWeight:600,whiteSpace:'nowrap'}}>{formatRupiah(x.harga * x.qty)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{display:'flex',gap:'0.75rem',flexWrap:'wrap'}}>
                  <div style={{flex:'1 1 150px'}}>
                    <label className="form-label">Tanggal Bayar<span className="wajib"> *</span></label>
                    <input type="date" className="form-input" value={form.tanggal_bayar} required onChange={e=>setForm(f=>({...f,tanggal_bayar:e.target.value}))}/>
                  </div>
                  <div style={{flex:'1 1 150px'}}>
                    <label className="form-label">Metode Pembayaran<span className="wajib"> *</span></label>
                    <select className="form-input" value={form.metode} required onChange={e=>setForm(f=>({...f,metode:e.target.value}))}>
                      {METODE.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="form-label">Diskon (Rp)</label>
                  <input type="number" min="0" max={subtotal} className="form-input" value={form.diskon} placeholder="0" onChange={e=>setForm(f=>({...f,diskon:e.target.value}))}/>
                </div>
                <div>
                  <label className="form-label">Catatan</label>
                  <input className="form-input" value={form.catatan} placeholder="Opsional" onChange={e=>setForm(f=>({...f,catatan:e.target.value}))}/>
                </div>

                <div style={{background:'rgba(16,185,129,0.08)',border:'1px solid rgba(16,185,129,0.2)',borderRadius:'0.5rem',padding:'0.7rem 1rem',fontSize:'0.85rem'}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:'0.25rem'}}>
                    <span style={{color:'var(--text-secondary)'}}>Subtotal ({jumlahBuku} buku)</span>
                    <span style={{fontWeight:600}}>{formatRupiah(subtotal)}</span>
                  </div>
                  {diskon > 0 && (
                    <div style={{display:'flex',justifyContent:'space-between',color:'#b45309',marginBottom:'0.25rem'}}>
                      <span>Diskon</span><span style={{fontWeight:600}}>– {formatRupiah(diskon)}</span>
                    </div>
                  )}
                  <div style={{display:'flex',justifyContent:'space-between',paddingTop:'0.35rem',borderTop:'1px solid rgba(16,185,129,0.25)',fontWeight:700}}>
                    <span>Total</span><span style={{color:'#047857'}}>{formatRupiah(total)}</span>
                  </div>
                </div>

                <div style={{fontSize:'0.8rem',color:'var(--text-secondary)'}}>
                  Dicatat oleh <b style={{color:'var(--primary)'}}>{user?.nama || user?.email || '-'}</b> · menunggu validasi koordinator
                </div>

                <div style={{display:'flex',gap:'0.75rem'}}>
                  <button type="button" className="btn" onClick={()=>setTahap(2)} disabled={saving} style={{background:'var(--surface-color)',display:'flex',alignItems:'center',gap:'0.3rem'}}>
                    <ChevronLeft size={16}/> Kembali
                  </button>
                  <button type="submit" className="btn btn-primary" style={{flex:1}} disabled={saving}>
                    {saving ? 'Menyimpan...' : 'Simpan Transaksi'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
