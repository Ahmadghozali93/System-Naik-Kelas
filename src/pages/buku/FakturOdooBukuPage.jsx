import { useState, useEffect, useMemo } from 'react';
import { Search, Send, RefreshCw, AlertCircle, CheckCircle, Settings, ChevronDown, ChevronUp, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatRupiah } from '../../utils/formatRupiah';
import {
  loadOdooSettings, saveOdooSettings, testConnection, configureOdoo, getOrCreatePartner, findProduct,
  createInvoiceBuku, getInvoiceStatus, getCompanyId, getUnitCompany, mappingKeBaris, barisKeMapping,
} from '../../lib/odooApi';
import PengaturanUnitOdoo from '../../components/PengaturanUnitOdoo';

// Transaksi buku yang sudah disetor dikirim jadi invoice Odoo — satu baris
// invoice per produk. Pengaturan Odoo di sini dan di SPP > Faktur Odoo
// menyimpan ke kunci app_settings yang sama — mengubah satu ikut mengubah
// yang lain, karena keduanya mengirim ke Odoo yang sama.
const fmt = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : '-';

const STATUS_ODOO = {
  not_paid:   { label: 'Belum Lunas',  color: '#d97706', bg: '#fef3c7' },
  in_payment: { label: 'Dalam Proses', color: '#2563eb', bg: '#dbeafe' },
  paid:       { label: 'Lunas',        color: '#047857', bg: '#d1fae5' },
  partial:    { label: 'Sebagian',     color: '#7c3aed', bg: '#ede9fe' },
  error:      { label: 'Error',        color: '#b91c1c', bg: '#fee2e2' },
};

const OdooBadge = ({ row }) => {
  if (!row.odoo_invoice_id && row.odoo_status !== 'error') return <span style={{color:'var(--text-secondary)',fontSize:'0.78rem'}}>—</span>;
  const s = STATUS_ODOO[row.odoo_status || 'not_paid'] || STATUS_ODOO.not_paid;
  return <span style={{background:s.bg,color:s.color,padding:'0.15rem 0.55rem',borderRadius:999,fontSize:'0.75rem',fontWeight:700,whiteSpace:'nowrap'}}>{s.label}</span>;
};

export default function FakturOdooBukuPage() {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey]   = useState('');
  const [email, setEmail]     = useState('');
  const [odooUrl, setOdooUrl] = useState('https://naik-kelas.odoo.com');
  const [odooDb, setOdooDb]   = useState('naik-kelas');
  const [showSettings, setShowSettings] = useState(false);
  const [showKey, setShowKey]           = useState(false);
  const [testMsg, setTestMsg]           = useState(null);
  const [testLoading, setTestLoading]   = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [unitBaris, setUnitBaris] = useState(() => mappingKeBaris(getUnitCompany()));
  const [selected, setSelected] = useState(new Set());
  const [sending, setSending]   = useState(new Set());

  const [search, setSearch]         = useState('');
  const [filterUnit, setFilterUnit] = useState('');
  const [filterOdoo, setFilterOdoo] = useState('belum');
  const [dateFrom, setDateFrom]     = useState('');
  const [dateTo, setDateTo]         = useState('');

  useEffect(() => {
    let aktif = true;
    Promise.all([
      supabase.from('transaksi_buku')
        .select('*, items:transaksi_buku_item(*), siswa:siswa_id(odoo_partner_id)')
        .eq('status', 'Divalidasi').not('setor_id', 'is', null)
        .order('tanggal_bayar', { ascending: false }),
      loadOdooSettings(supabase),
    ]).then(([tRes, settings]) => {
      if (!aktif) return;
      if (tRes.error) alert('Gagal memuat transaksi: ' + tRes.error.message);
      setRows(tRes.data || []);
      setApiKey(settings.odoo_api_key || '');
      setEmail(settings.odoo_email || '');
      if (settings.odoo_url) setOdooUrl(settings.odoo_url);
      if (settings.odoo_db)  setOdooDb(settings.odoo_db);
      configureOdoo({ odooUrl: settings.odoo_url, odooDb: settings.odoo_db, unitCompany: settings.odoo_unit_company });
      setUnitBaris(mappingKeBaris(getUnitCompany()));
      setLoading(false);
    }).catch(err => {
      if (!aktif) return;
      alert('Gagal memuat: ' + (err?.message || err));
      setLoading(false);
    });
    return () => { aktif = false; };
  }, []);

  const allUnits = useMemo(() => [...new Set(rows.map(r => r.unit).filter(Boolean))].sort(), [rows]);

  const filtered = useMemo(() => rows.filter(r => {
    const q = search.toLowerCase();
    if (q && !r.nama_siswa?.toLowerCase().includes(q) && !r.id.toLowerCase().includes(q)
          && !(r.items || []).some(i => i.nama_produk?.toLowerCase().includes(q))) return false;
    if (filterUnit && r.unit !== filterUnit) return false;
    if (filterOdoo === 'belum' && r.odoo_invoice_id) return false;
    if (filterOdoo === 'sudah' && !r.odoo_invoice_id) return false;
    if (filterOdoo === 'error' && r.odoo_status !== 'error') return false;
    if (dateFrom && r.tanggal_bayar < dateFrom) return false;
    if (dateTo   && r.tanggal_bayar > dateTo)   return false;
    return true;
  }), [rows, search, filterUnit, filterOdoo, dateFrom, dateTo]);

  const simpanPengaturan = async () => {
    if (!apiKey) { alert('API Key wajib diisi.'); return; }
    const { map, error } = barisKeMapping(unitBaris);
    if (error) { alert(error); return; }
    setSavingSettings(true);
    try {
      await saveOdooSettings(supabase, { apiKey, email, odooUrl, odooDb, unitCompany: map });
      configureOdoo({ odooUrl, odooDb, unitCompany: map });
      alert('Pengaturan Odoo berhasil disimpan.');
    } catch (e) {
      alert('Gagal simpan: ' + e.message);
    }
    setSavingSettings(false);
  };

  const tesKoneksi = async () => {
    if (!apiKey) { setTestMsg({ ok: false, msg: 'API Key belum diisi.' }); return; }
    setTestLoading(true);
    setTestMsg(null);
    // Tes memakai URL/DB yang sedang diketik, belum tentu yang tersimpan.
    configureOdoo({ odooUrl, odooDb });
    try {
      const u = await testConnection(apiKey, email);
      setTestMsg({ ok: true, msg: `Terhubung sebagai: ${u.name}` });
    } catch (e) {
      setTestMsg({ ok: false, msg: e.message });
    }
    setTestLoading(false);
  };

  const perbarui = (id, data) => setRows(prev => prev.map(r => r.id === id ? { ...r, ...data } : r));

  const kirimSatu = async (r) => {
    if (!apiKey) { alert('API Key Odoo belum diatur. Buka panel Pengaturan Odoo.'); setShowSettings(true); return; }
    const companyId = getCompanyId(r.unit);
    if (!companyId) { alert(`Unit "${r.unit}" tidak ada di mapping Odoo. Tambahkan di Pengaturan Odoo › Mapping Unit.`); return; }

    setSending(prev => new Set([...prev, r.id]));
    try {
      // Kontak yang sudah ditautkan di menu Siswa dipakai lebih dulu.
      const partnerId = r.siswa?.odoo_partner_id || await getOrCreatePartner(apiKey, email, r.nama_siswa);
      const items = [];
      for (const i of r.items || []) {
        const prod = await findProduct(apiKey, email, i.nama_produk, companyId);
        items.push({ productId: prod?.id, nama: i.nama_produk, qty: i.qty, harga: Number(i.harga) });
      }
      const inv = await createInvoiceBuku(apiKey, email, {
        companyId, partnerId, items, diskon: Number(r.diskon) || 0,
        tanggalBayar: r.tanggal_bayar, namaSiswa: r.nama_siswa, metodeBayar: r.metode,
      });
      const data = { odoo_invoice_id: inv.id, odoo_invoice_name: inv.name, odoo_status: inv.status || 'not_paid',
        odoo_synced_at: new Date().toISOString(), odoo_error: null };
      await supabase.from('transaksi_buku').update(data).eq('id', r.id);
      perbarui(r.id, data);
    } catch (e) {
      const data = { odoo_status: 'error', odoo_error: e.message, odoo_synced_at: new Date().toISOString() };
      await supabase.from('transaksi_buku').update(data).eq('id', r.id);
      perbarui(r.id, data);
      alert(`Gagal kirim untuk ${r.nama_siswa}:\n${e.message}`);
    }
    setSending(prev => { const s = new Set(prev); s.delete(r.id); return s; });
  };

  const kirimTerpilih = async () => {
    const ids = [...selected];
    setSelected(new Set());
    for (const id of ids) {
      const r = rows.find(x => x.id === id);
      if (r && !r.odoo_invoice_id) await kirimSatu(r);
    }
  };

  const refreshStatus = async (r) => {
    try {
      const inv = await getInvoiceStatus(apiKey, email, r.odoo_invoice_id, getCompanyId(r.unit));
      const data = { odoo_status: inv.payment_state, odoo_synced_at: new Date().toISOString() };
      await supabase.from('transaksi_buku').update(data).eq('id', r.id);
      perbarui(r.id, data);
    } catch (e) {
      alert('Gagal refresh: ' + e.message);
    }
  };

  const belumKirim = filtered.filter(r => !r.odoo_invoice_id);
  const semuaTerpilih = belumKirim.length > 0 && belumKirim.every(r => selected.has(r.id));
  const toggle = (id) => setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const toggleSemua = () => setSelected(prev => {
    const s = new Set(prev);
    belumKirim.forEach(r => semuaTerpilih ? s.delete(r.id) : s.add(r.id));
    return s;
  });

  const inp = { padding:'0.5rem 0.75rem', borderRadius:'0.5rem', border:'1px solid var(--glass-border)', background:'var(--surface-color)', fontFamily:'inherit', fontSize:'0.85rem', boxSizing:'border-box' };
  const th = { padding:'0.65rem 0.75rem', fontWeight:700, fontSize:'0.72rem', color:'var(--text-secondary)', whiteSpace:'nowrap', letterSpacing:'0.06em', textAlign:'left' };
  const td = { padding:'0.75rem', verticalAlign:'top' };

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.5rem',flexWrap:'wrap',gap:'0.75rem'}}>
        <div>
          <p style={{fontSize:'0.78rem',color:'var(--text-secondary)',margin:0,textTransform:'uppercase',letterSpacing:'0.05em'}}>Penjualan Buku</p>
          <h1 style={{fontSize:'1.6rem',fontWeight:700,margin:0}}>Faktur Odoo</h1>
        </div>
        <div style={{display:'flex',gap:'0.5rem',flexWrap:'wrap'}}>
          <button onClick={()=>setShowSettings(v=>!v)}
            style={{display:'flex',alignItems:'center',gap:'0.45rem',padding:'0.5rem 1rem',borderRadius:'0.5rem',border:'1px solid var(--glass-border)',
              background: showSettings ? 'rgba(79,70,229,0.08)' : 'var(--surface-color)',cursor:'pointer',fontSize:'0.85rem',fontWeight:600,fontFamily:'inherit'}}>
            <Settings size={15}/> Pengaturan Odoo {showSettings ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
          </button>
          <button onClick={kirimTerpilih} disabled={selected.size === 0} className="btn btn-primary" style={{display:'flex',alignItems:'center',gap:'0.4rem'}}>
            <Send size={16}/> Kirim Terpilih ({selected.size})
          </button>
        </div>
      </div>

      {!loading && !apiKey && !showSettings && (
        <div style={{display:'flex',gap:'0.5rem',alignItems:'center',background:'#fffbeb',border:'1px solid #fde68a',color:'#92400e',borderRadius:'0.5rem',padding:'0.7rem 0.9rem',fontSize:'0.85rem',marginBottom:'1rem'}}>
          <AlertCircle size={16}/> API Key Odoo belum diatur. Buka <b>Pengaturan Odoo</b> di kanan atas.
        </div>
      )}

      {showSettings && (
        <div className="glass-card" style={{padding:'1.25rem',marginBottom:'1rem',borderLeft:'3px solid var(--primary)'}}>
          <div style={{fontWeight:700,fontSize:'0.88rem',marginBottom:'0.35rem',color:'var(--primary)'}}>Konfigurasi Odoo</div>
          <div style={{fontSize:'0.75rem',color:'var(--text-secondary)',marginBottom:'1rem'}}>
            Pengaturan ini dipakai bersama dengan SPP › Faktur Odoo — mengubahnya di sini juga mengubah yang di sana.
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(260px, 1fr))',gap:'0.75rem',marginBottom:'1rem'}}>
            <div>
              <label style={{fontSize:'0.78rem',fontWeight:600,display:'block',marginBottom:'0.3rem'}}>URL Odoo</label>
              <input type="url" placeholder="https://naik-kelas.odoo.com" value={odooUrl} onChange={e=>setOdooUrl(e.target.value)} style={{...inp,width:'100%'}}/>
            </div>
            <div>
              <label style={{fontSize:'0.78rem',fontWeight:600,display:'block',marginBottom:'0.3rem'}}>Database Odoo</label>
              <input type="text" placeholder="naik-kelas" value={odooDb} onChange={e=>setOdooDb(e.target.value)} style={{...inp,width:'100%'}}/>
            </div>
            <div>
              <label style={{fontSize:'0.78rem',fontWeight:600,display:'block',marginBottom:'0.3rem'}}>Email Login Odoo</label>
              <input type="email" placeholder="admin@naik-kelas.com" value={email} onChange={e=>setEmail(e.target.value)} style={{...inp,width:'100%'}}/>
            </div>
            <div>
              <label style={{fontSize:'0.78rem',fontWeight:600,display:'block',marginBottom:'0.3rem'}}>API Key Odoo</label>
              <div style={{position:'relative'}}>
                <input type={showKey ? 'text' : 'password'} placeholder="API Key dari Odoo..." value={apiKey} onChange={e=>setApiKey(e.target.value)}
                  style={{...inp,width:'100%',paddingRight:'2.5rem'}}/>
                <button onClick={()=>setShowKey(v=>!v)}
                  style={{position:'absolute',right:'0.6rem',top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'var(--text-secondary)',display:'flex'}}>
                  {showKey ? <EyeOff size={15}/> : <Eye size={15}/>}
                </button>
              </div>
            </div>
          </div>
          <div style={{display:'flex',gap:'0.65rem',alignItems:'center',flexWrap:'wrap'}}>
            <button onClick={tesKoneksi} disabled={testLoading}
              style={{padding:'0.45rem 1rem',borderRadius:'0.5rem',border:'1px solid var(--glass-border)',background:'var(--surface-color)',cursor:'pointer',fontSize:'0.85rem',fontWeight:600,display:'flex',alignItems:'center',gap:'0.4rem',fontFamily:'inherit'}}>
              <RefreshCw size={14}/> {testLoading ? 'Mengecek...' : 'Test Koneksi'}
            </button>
            <button onClick={simpanPengaturan} disabled={savingSettings}
              style={{padding:'0.45rem 1rem',borderRadius:'0.5rem',border:'none',background:'var(--primary)',color:'#fff',cursor:'pointer',fontSize:'0.85rem',fontWeight:600,fontFamily:'inherit'}}>
              {savingSettings ? 'Menyimpan...' : 'Simpan Pengaturan'}
            </button>
            {testMsg && (
              <span style={{fontSize:'0.82rem',color: testMsg.ok ? '#047857' : '#b91c1c',display:'flex',alignItems:'center',gap:'0.35rem',fontWeight:600}}>
                {testMsg.ok ? <CheckCircle size={14}/> : <AlertCircle size={14}/>} {testMsg.msg}
              </span>
            )}
          </div>
          <div style={{marginTop:'1rem',paddingTop:'1rem',borderTop:'1px solid var(--glass-border)'}}>
            <PengaturanUnitOdoo baris={unitBaris} setBaris={setUnitBaris}/>
          </div>
        </div>
      )}

      <div style={{display:'flex',gap:'0.65rem',marginBottom:'1rem',flexWrap:'wrap',alignItems:'center'}}>
        <div style={{position:'relative',flex:1,minWidth:180}}>
          <Search size={15} style={{position:'absolute',left:'0.75rem',top:'50%',transform:'translateY(-50%)',color:'var(--text-secondary)'}}/>
          <input style={{...inp,width:'100%',paddingLeft:'2.2rem'}} placeholder="Cari siswa / produk / ID..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <select style={inp} value={filterUnit} onChange={e=>setFilterUnit(e.target.value)}>
          <option value="">Semua Unit</option>
          {allUnits.map(u=><option key={u} value={u}>{u}</option>)}
        </select>
        <select style={inp} value={filterOdoo} onChange={e=>setFilterOdoo(e.target.value)}>
          <option value="">Semua Status Odoo</option>
          <option value="belum">Belum dikirim</option>
          <option value="sudah">Sudah dikirim</option>
          <option value="error">Error</option>
        </select>
        <input type="date" style={inp} value={dateFrom} onChange={e=>setDateFrom(e.target.value)} title="Dari tanggal bayar"/>
        <span style={{color:'var(--text-secondary)'}}>–</span>
        <input type="date" style={inp} value={dateTo} onChange={e=>setDateTo(e.target.value)} title="Sampai tanggal bayar"/>
      </div>

      <div className="glass-card" style={{padding:'1.5rem'}}>
        {loading ? <p style={{color:'var(--text-secondary)'}}>Memuat...</p>
          : filtered.length === 0 ? <p style={{color:'var(--text-secondary)'}}>Tidak ada transaksi. Hanya transaksi yang sudah disetor yang muncul di sini.</p>
          : (
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.85rem'}}>
              <thead>
                <tr style={{borderBottom:'2px solid var(--glass-border)',background:'rgba(79,70,229,0.04)'}}>
                  <th style={{...th,width:36}}><input type="checkbox" checked={semuaTerpilih} onChange={toggleSemua} disabled={belumKirim.length === 0}/></th>
                  <th style={th}>TGL BAYAR</th><th style={th}>SISWA</th><th style={th}>PRODUK</th>
                  <th style={{...th,textAlign:'right'}}>TOTAL</th><th style={th}>METODE</th><th style={th}>INVOICE</th>
                  <th style={{...th,textAlign:'center'}}>STATUS ODOO</th><th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} style={{borderBottom:'1px solid var(--glass-border)'}}>
                    <td style={td}>{!r.odoo_invoice_id && <input type="checkbox" checked={selected.has(r.id)} onChange={()=>toggle(r.id)}/>}</td>
                    <td style={{...td,whiteSpace:'nowrap'}}>{fmt(r.tanggal_bayar)}</td>
                    <td style={td}>
                      <div style={{fontWeight:600}}>{r.nama_siswa}</div>
                      <div style={{fontSize:'0.75rem',color:'var(--text-secondary)'}}>{r.unit || '-'} · {r.id}</div>
                    </td>
                    <td style={{...td,fontSize:'0.82rem',maxWidth:260}}>{(r.items || []).map(i => `${i.nama_produk} ×${i.qty}`).join(', ')}</td>
                    <td style={{...td,textAlign:'right',fontWeight:700,whiteSpace:'nowrap'}}>{formatRupiah(r.total || 0)}</td>
                    <td style={td}>{r.metode}</td>
                    <td style={{...td,fontSize:'0.8rem'}}>
                      {r.odoo_invoice_name || '-'}
                      {r.odoo_status === 'error' && r.odoo_error && <div style={{color:'#b91c1c',fontSize:'0.72rem',maxWidth:220}}>{r.odoo_error}</div>}
                    </td>
                    <td style={{...td,textAlign:'center'}}><OdooBadge row={r}/></td>
                    <td style={{...td,textAlign:'right',whiteSpace:'nowrap'}}>
                      {r.odoo_invoice_id ? (
                        <button onClick={()=>refreshStatus(r)} title="Refresh status"
                          style={{background:'none',border:'1px solid var(--glass-border)',borderRadius:'0.4rem',padding:'0.3rem 0.5rem',cursor:'pointer',display:'inline-flex'}}>
                          <RefreshCw size={14}/>
                        </button>
                      ) : (
                        <button onClick={()=>kirimSatu(r)} disabled={sending.has(r.id)}
                          style={{display:'inline-flex',alignItems:'center',gap:'0.3rem',background:'rgba(79,70,229,0.1)',color:'var(--primary)',border:'none',borderRadius:'0.4rem',padding:'0.35rem 0.65rem',cursor:'pointer',fontWeight:600,fontSize:'0.78rem',fontFamily:'inherit'}}>
                          <Send size={13}/> {sending.has(r.id) ? 'Mengirim...' : 'Kirim'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
