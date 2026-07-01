import { useState, useEffect, useMemo } from 'react';
import { Search, X, FileText, Receipt, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatRupiah } from '../utils/formatRupiah';
import { useAuth } from '../context/authStore';

const genId    = () => 'TG-'  + Math.random().toString(36).substr(2,6).toUpperCase();
const genPayId = () => 'PAY-' + Math.random().toString(36).substr(2,6).toUpperCase();
const METODE   = ['Tunai','BNI','Xendit'];
const PER_PAGE = 20;

const fmt = (d) => d ? new Date(d).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : '-';

const addOneMonth = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().split('T')[0];
};

// currentJT = periode jatuh tempo yang sedang berjalan (dihitung dari jatuh_tempo pembayaran terakhir)
// hasPayment = apakah sudah ada pembayaran sama sekali
const computeStatus = (hasPayment, currentJT) => {
  if (!currentJT) return 'Belum Bayar';
  const now = new Date(); now.setHours(0,0,0,0);
  if (new Date(currentJT) < now) return 'Terlambat';
  if (hasPayment) return 'Lunas';
  return 'Belum Bayar';
};

const statusBadge = (s) => {
  const map = {
    Lunas:           ['#d1fae5','#047857'],
    Terlambat:       ['#fee2e2','#b91c1c'],
    'Belum Bayar':   ['#fef3c7','#92400e'],
    Terverifikasi:   ['#dbeafe','#1d4ed8'],
    Pending:         ['#f3f4f6','#6b7280'],
  };
  const [bg, color] = map[s] || ['#f3f4f6','#374151'];
  return <span style={{background:bg,color,padding:'0.18rem 0.6rem',borderRadius:'999px',fontSize:'0.75rem',fontWeight:600,whiteSpace:'nowrap'}}>{s||'Pending'}</span>;
};

const TAB = (active) => ({
  padding:'0.45rem 1.1rem', border:'none', borderRadius:'0.4rem', cursor:'pointer',
  fontWeight:600, fontSize:'0.875rem', fontFamily:'inherit',
  background: active ? 'var(--primary)' : 'transparent',
  color: active ? '#fff' : 'var(--text-secondary)', transition:'all 0.15s'
});

export default function TagihanSiswaPage() {
  const { user } = useAuth();
  const [tab, setTab]               = useState('tagihan');
  const [aktivasis, setAktivasis]   = useState([]);
  const [transaksis, setTransaksis] = useState([]);
  const [loading, setLoading]       = useState(true);

  // Filter tagihan
  const [search, setSearch]           = useState('');
  const [filterUnit, setFilterUnit]   = useState('');
  const [filterProg, setFilterProg]   = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage]               = useState(1);

  // Filter transaksi
  const [trSearch, setTrSearch]     = useState('');
  const [trUnit, setTrUnit]         = useState('');
  const [trProg, setTrProg]         = useState('');
  const [trDateFrom, setTrDateFrom] = useState('');
  const [trDateTo, setTrDateTo]     = useState('');
  const [trPage, setTrPage]         = useState(1);

  // Modal
  const [modal, setModal]         = useState(null);
  const [modalForm, setModalForm] = useState({ tanggal_bayar:'', metode:'Tunai', catatan:'', diskon:'0' });

  const fetchAll = async () => {
    setLoading(true);
    const [aRes, pRes] = await Promise.all([
      supabase.from('aktivasi_siswa').select('*').eq('status','Aktif').order('nama_siswa'),
      supabase.from('pembayaran_spp').select('*').order('created_at',{ascending:false}),
    ]);
    setAktivasis(aRes.data || []);
    setTransaksis(pRes.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const allUnits    = useMemo(() => [...new Set(aktivasis.map(a=>a.detail_jadwal?.unit).filter(Boolean))].sort(), [aktivasis]);
  const allPrograms = useMemo(() => [...new Set(aktivasis.map(a=>a.detail_jadwal?.nama_program).filter(Boolean))].sort(), [aktivasis]);

  // Cari pembayaran terakhir untuk kombinasi siswa + program + unit
  const getLastPayment = (siswaId, namaProgram, unit) =>
    transaksis
      .filter(p => p.siswa_id === siswaId && p.nama_program === namaProgram && p.unit === unit)
      .sort((a,b) => new Date(b.tanggal_bayar||b.created_at) - new Date(a.tanggal_bayar||a.created_at))[0];

  const getJatuhTempo = (aktivasi) => {
    const dj_  = aktivasi.detail_jadwal || {};
    const last = getLastPayment(aktivasi.siswa_id, dj_.nama_program, dj_.unit);
    if (last?.jatuh_tempo) {
      const nextJT = addOneMonth(last.jatuh_tempo);
      // Jika siswa re-enroll (tgl_mulai baru lebih baru dari next JT lama), pakai tgl_mulai
      if (nextJT && aktivasi.tgl_mulai && nextJT < aktivasi.tgl_mulai) {
        return aktivasi.tgl_mulai;
      }
      return nextJT;
    }
    return aktivasi.tgl_mulai;
  };

  const getNominal = (aktivasi) => Number(aktivasi.spp) || 0;

  const handleDelete = async (id) => {
    if (!window.confirm('Hapus transaksi ini?')) return;
    const { error } = await supabase.from('pembayaran_spp').delete().eq('id', id);
    if (error) { alert('Gagal hapus: ' + error.message); return; }
    fetchAll();
  };

  // Filter & paginate tagihan
  const filteredAll = useMemo(() => aktivasis.filter(a => {
    const dj     = a.detail_jadwal || {};
    const last   = getLastPayment(a.siswa_id, dj.nama_program, dj.unit);
    const status = computeStatus(!!last, getJatuhTempo(a));
    const q      = search.toLowerCase();
    if (search && !a.nama_siswa?.toLowerCase().includes(q) && !dj.nama_program?.toLowerCase().includes(q)) return false;
    if (filterUnit   && dj.unit         !== filterUnit)   return false;
    if (filterProg   && dj.nama_program !== filterProg)   return false;
    if (filterStatus && status          !== filterStatus) return false;
    return true;
  }), [aktivasis, transaksis, search, filterUnit, filterProg, filterStatus]);

  const totalPages = Math.max(1, Math.ceil(filteredAll.length / PER_PAGE));
  const safePage   = Math.min(page, totalPages);
  const filtered   = filteredAll.slice((safePage-1)*PER_PAGE, safePage*PER_PAGE);

  // Transaksi enriched — semua data sudah ada di row pembayaran_spp sendiri
  const filteredTr = useMemo(() => transaksis.filter(p => {
    const q   = trSearch.toLowerCase();
    const tgl = p.tanggal_bayar || p.created_at?.split('T')[0];
    if (trSearch && !p.nama_siswa?.toLowerCase().includes(q) && !p.nama_program?.toLowerCase().includes(q)) return false;
    if (trUnit     && p.unit         !== trUnit)     return false;
    if (trProg     && p.nama_program !== trProg)     return false;
    if (trDateFrom && tgl < trDateFrom) return false;
    if (trDateTo   && tgl > trDateTo)   return false;
    return true;
  }), [transaksis, trSearch, trUnit, trProg, trDateFrom, trDateTo]);

  const trTotalPages = Math.max(1, Math.ceil(filteredTr.length / PER_PAGE));
  const trSafePage   = Math.min(trPage, trTotalPages);
  const filteredTrPage = filteredTr.slice((trSafePage-1)*PER_PAGE, trSafePage*PER_PAGE);

  const trAllUnits    = useMemo(() => [...new Set(transaksis.map(p=>p.unit).filter(Boolean))].sort(), [transaksis]);
  const trAllPrograms = useMemo(() => [...new Set(transaksis.map(p=>p.nama_program).filter(Boolean))].sort(), [transaksis]);

  const openModal = (aktivasi) => {
    const today = new Date().toISOString().split('T')[0];
    setModal({ aktivasi });
    setModalForm({ tanggal_bayar:today, metode:'Tunai', catatan:'', diskon:'0' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { aktivasi } = modal;
    const dj        = aktivasi.detail_jadwal || {};
    const nominal   = getNominal(aktivasi);
    const diskon    = Number(modalForm.diskon) || 0;
    const bayar     = Math.max(nominal - diskon, 0);
    const currentJT = getJatuhTempo(aktivasi); // periode yg sedang dibayar

    const { error } = await supabase.from('pembayaran_spp').insert([{
      id: genPayId(),
      siswa_id: aktivasi.siswa_id,
      nama_siswa: aktivasi.nama_siswa,
      nama_program: dj.nama_program || '',
      unit: dj.unit || '',
      nominal: bayar,
      diskon,
      metode: modalForm.metode,
      tanggal_bayar: modalForm.tanggal_bayar || null,
      jatuh_tempo: currentJT,   // simpan periode yg dibayar, bukan tanggal transaksi
      keterangan: modalForm.catatan,
      dicatat_oleh: user?.nama || user?.email || '-'
    }]);

    if (error) {
      alert('Gagal menyimpan: ' + error.message);
      return;
    }

    setModal(null);
    fetchAll();
  };

  const inp = {
    width:'100%', padding:'0.5rem 0.75rem', borderRadius:'0.5rem',
    border:'1px solid var(--glass-border)', background:'var(--surface-color)',
    fontFamily:'inherit', fontSize:'0.875rem', color:'var(--text-primary)', boxSizing:'border-box'
  };
  const sel = { padding:'0.5rem 0.75rem', borderRadius:'0.5rem', border:'1px solid var(--glass-border)', background:'var(--surface-color)', fontFamily:'inherit', fontSize:'0.85rem' };
  const lb  = (text, req) => (
    <label style={{display:'block',marginBottom:'0.3rem',fontWeight:600,fontSize:'0.78rem',color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.05em'}}>
      {text}{req && <span style={{color:'#ef4444'}}> *</span>}
    </label>
  );

  const Pager = ({ cur, total, onChange }) => total <= 1 ? null : (
    <div style={{display:'flex',alignItems:'center',gap:'0.4rem',marginTop:'0.85rem',justifyContent:'flex-end'}}>
      <button onClick={()=>onChange(cur-1)} disabled={cur<=1}
        style={{background:'var(--surface-color)',border:'1px solid var(--glass-border)',borderRadius:'0.4rem',padding:'0.3rem 0.6rem',cursor:cur<=1?'not-allowed':'pointer',opacity:cur<=1?0.4:1}}>
        <ChevronLeft size={14}/>
      </button>
      <span style={{fontSize:'0.82rem',color:'var(--text-secondary)'}}>Hal {cur} / {total}</span>
      <button onClick={()=>onChange(cur+1)} disabled={cur>=total}
        style={{background:'var(--surface-color)',border:'1px solid var(--glass-border)',borderRadius:'0.4rem',padding:'0.3rem 0.6rem',cursor:cur>=total?'not-allowed':'pointer',opacity:cur>=total?0.4:1}}>
        <ChevronRight size={14}/>
      </button>
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.5rem',flexWrap:'wrap',gap:'0.75rem'}}>
        <div>
          <p style={{fontSize:'0.78rem',color:'var(--text-secondary)',margin:0,textTransform:'uppercase',letterSpacing:'0.05em'}}>SPP</p>
          <h1 style={{fontSize:'1.6rem',fontWeight:700,margin:0}}>Tagihan Siswa</h1>
        </div>
        <div style={{display:'flex',background:'var(--surface-color)',borderRadius:'0.5rem',padding:'0.25rem',border:'1px solid var(--glass-border)',gap:'0.25rem'}}>
          <button style={TAB(tab==='tagihan')} onClick={()=>setTab('tagihan')}>
            <span style={{display:'flex',alignItems:'center',gap:'0.4rem'}}><Receipt size={15}/> Tagihan Siswa</span>
          </button>
          <button style={TAB(tab==='transaksi')} onClick={()=>setTab('transaksi')}>
            <span style={{display:'flex',alignItems:'center',gap:'0.4rem'}}><FileText size={15}/> Daftar Transaksi ({transaksis.length})</span>
          </button>
        </div>
      </div>

      {/* ── TAB: TAGIHAN SISWA ── */}
      {tab === 'tagihan' && (
        <>
          <div style={{display:'flex',gap:'0.65rem',marginBottom:'1rem',flexWrap:'wrap',alignItems:'center'}}>
            <div style={{position:'relative',flex:1,minWidth:180}}>
              <Search size={15} style={{position:'absolute',left:'0.75rem',top:'50%',transform:'translateY(-50%)',color:'var(--text-secondary)'}}/>
              <input style={{...inp,paddingLeft:'2.2rem'}} placeholder="Cari nama / program..." value={search}
                onChange={e=>{setSearch(e.target.value);setPage(1);}}/>
            </div>
            <select style={sel} value={filterUnit} onChange={e=>{setFilterUnit(e.target.value);setPage(1);}}>
              <option value="">Semua Unit</option>
              {allUnits.map(u=><option key={u} value={u}>{u}</option>)}
            </select>
            <select style={sel} value={filterProg} onChange={e=>{setFilterProg(e.target.value);setPage(1);}}>
              <option value="">Semua Program</option>
              {allPrograms.map(p=><option key={p} value={p}>{p}</option>)}
            </select>
            <select style={sel} value={filterStatus} onChange={e=>{setFilterStatus(e.target.value);setPage(1);}}>
              <option value="">Semua Status</option>
              <option value="Lunas">Lunas</option>
              <option value="Terlambat">Terlambat</option>
              <option value="Belum Bayar">Belum Bayar</option>
            </select>
          </div>

          <div className="glass-card" style={{padding:'1.5rem'}}>
            {loading ? <p style={{color:'var(--text-secondary)'}}>Memuat...</p>
              : filteredAll.length === 0 ? <p style={{color:'var(--text-secondary)'}}>Tidak ada data.</p>
              : (
              <>
                <div style={{overflowX:'auto'}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.85rem'}}>
                    <thead>
                      <tr style={{borderBottom:'2px solid var(--glass-border)',background:'rgba(79,70,229,0.04)'}}>
                        {[{l:'NO',a:'center',w:44},{l:'NAMA SISWA',a:'left'},{l:'PROGRAM',a:'left'},
                          {l:'UNIT',a:'left'},{l:'TGL MULAI LES',a:'left'},{l:'JATUH TEMPO',a:'left'},
                          {l:'NOMINAL SPP',a:'right'},{l:'STATUS',a:'center'},{l:'',a:'right'}].map(h=>(
                          <th key={h.l} style={{textAlign:h.a,width:h.w,padding:'0.65rem 0.75rem',fontWeight:700,fontSize:'0.72rem',color:'var(--text-secondary)',whiteSpace:'nowrap',letterSpacing:'0.06em'}}>{h.l}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((a,idx)=>{
                        const dj      = a.detail_jadwal || {};
                        const last    = getLastPayment(a.siswa_id, dj.nama_program, dj.unit);
                        const jt      = getJatuhTempo(a);
                        const status  = computeStatus(!!last, jt);
                        const nominal = getNominal(a);
                        const isTerlambat = status === 'Terlambat';

                        return (
                          <tr key={a.id} style={{borderBottom:'1px solid var(--glass-border)'}}
                            onMouseOver={e=>e.currentTarget.style.background='rgba(79,70,229,0.03)'}
                            onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                            <td style={{padding:'0.75rem',textAlign:'center',color:'var(--text-secondary)',fontSize:'0.8rem'}}>{(safePage-1)*PER_PAGE+idx+1}</td>
                            <td style={{padding:'0.75rem',fontWeight:600,whiteSpace:'nowrap'}}>{a.nama_siswa}</td>
                            <td style={{padding:'0.75rem',color:'var(--primary)',fontWeight:500}}>{dj.nama_program||'-'}</td>
                            <td style={{padding:'0.75rem',color:'var(--text-secondary)'}}>{dj.unit||'-'}</td>
                            <td style={{padding:'0.75rem',whiteSpace:'nowrap',fontSize:'0.82rem'}}>{fmt(a.tgl_mulai)}</td>
                            <td style={{padding:'0.75rem',whiteSpace:'nowrap',fontSize:'0.82rem',fontWeight:isTerlambat?700:400,color:isTerlambat?'#b91c1c':'inherit'}}>
                              {fmt(jt)}
                            </td>
                            <td style={{padding:'0.75rem',textAlign:'right',fontWeight:700}}>
                              {nominal>0 ? formatRupiah(nominal) : <span style={{color:'#d97706',fontSize:'0.78rem'}}>Belum diset</span>}
                            </td>
                            <td style={{padding:'0.75rem',textAlign:'center'}}>{statusBadge(status)}</td>
                            <td style={{padding:'0.75rem',textAlign:'right'}}>
                              <button onClick={()=>openModal(a)} disabled={nominal===0}
                                style={{background:'var(--primary)',color:'#fff',border:'none',borderRadius:'0.4rem',
                                  padding:'0.35rem 0.85rem',cursor:nominal===0?'not-allowed':'pointer',
                                  fontSize:'0.82rem',fontWeight:600,whiteSpace:'nowrap',opacity:nominal===0?0.4:1}}>
                                Bayar SPP
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Footer */}
                <div style={{marginTop:'0.75rem',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'0.5rem'}}>
                  <div style={{display:'flex',gap:'1rem',fontSize:'0.82rem',flexWrap:'wrap'}}>
                    <span style={{color:'var(--text-secondary)'}}>{filteredAll.length} siswa</span>
                    <span style={{color:'#047857',fontWeight:600}}>Lunas: {filteredAll.filter(a=>{const dj_=a.detail_jadwal||{};return computeStatus(!!getLastPayment(a.siswa_id,dj_.nama_program,dj_.unit),getJatuhTempo(a))==='Lunas';}).length}</span>
                    <span style={{color:'#b91c1c',fontWeight:600}}>Terlambat: {filteredAll.filter(a=>{const dj_=a.detail_jadwal||{};return computeStatus(!!getLastPayment(a.siswa_id,dj_.nama_program,dj_.unit),getJatuhTempo(a))==='Terlambat';}).length}</span>
                    <span style={{color:'#92400e',fontWeight:600}}>Belum Bayar: {filteredAll.filter(a=>{const dj_=a.detail_jadwal||{};return computeStatus(!!getLastPayment(a.siswa_id,dj_.nama_program,dj_.unit),getJatuhTempo(a))==='Belum Bayar';}).length}</span>
                  </div>
                  <Pager cur={safePage} total={totalPages} onChange={setPage}/>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* ── TAB: DAFTAR TRANSAKSI ── */}
      {tab === 'transaksi' && (
        <>
          <div style={{display:'flex',gap:'0.65rem',marginBottom:'0.65rem',flexWrap:'wrap',alignItems:'center'}}>
            <div style={{position:'relative',flex:1,minWidth:180}}>
              <Search size={15} style={{position:'absolute',left:'0.75rem',top:'50%',transform:'translateY(-50%)',color:'var(--text-secondary)'}}/>
              <input style={{...inp,paddingLeft:'2.2rem'}} placeholder="Cari nama / program..." value={trSearch}
                onChange={e=>{setTrSearch(e.target.value);setTrPage(1);}}/>
            </div>
            <select style={sel} value={trUnit} onChange={e=>{setTrUnit(e.target.value);setTrPage(1);}}>
              <option value="">Semua Unit</option>
              {trAllUnits.map(u=><option key={u} value={u}>{u}</option>)}
            </select>
            <select style={sel} value={trProg} onChange={e=>{setTrProg(e.target.value);setTrPage(1);}}>
              <option value="">Semua Program</option>
              {trAllPrograms.map(p=><option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div style={{display:'flex',gap:'0.65rem',marginBottom:'1rem',flexWrap:'wrap',alignItems:'center'}}>
            <div style={{display:'flex',alignItems:'center',gap:'0.5rem',fontSize:'0.85rem'}}>
              <span style={{color:'var(--text-secondary)'}}>Dari:</span>
              <input type="date" style={{...sel,padding:'0.45rem 0.65rem'}} value={trDateFrom} onChange={e=>{setTrDateFrom(e.target.value);setTrPage(1);}}/>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:'0.5rem',fontSize:'0.85rem'}}>
              <span style={{color:'var(--text-secondary)'}}>Sampai:</span>
              <input type="date" style={{...sel,padding:'0.45rem 0.65rem'}} value={trDateTo} onChange={e=>{setTrDateTo(e.target.value);setTrPage(1);}}/>
            </div>
            {(trSearch||trUnit||trProg||trDateFrom||trDateTo)&&(
              <button onClick={()=>{setTrSearch('');setTrUnit('');setTrProg('');setTrDateFrom('');setTrDateTo('');setTrPage(1);}}
                style={{background:'none',border:'1px solid var(--glass-border)',borderRadius:'0.4rem',padding:'0.4rem 0.75rem',cursor:'pointer',fontSize:'0.82rem',color:'var(--text-secondary)'}}>
                Reset
              </button>
            )}
          </div>

          <div className="glass-card" style={{padding:'1.5rem'}}>
            {loading ? <p style={{color:'var(--text-secondary)'}}>Memuat...</p>
              : filteredTr.length === 0 ? <p style={{color:'var(--text-secondary)'}}>Tidak ada transaksi.</p>
              : (
              <>
                <div style={{overflowX:'auto'}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.85rem'}}>
                    <thead>
                      <tr style={{borderBottom:'2px solid var(--glass-border)',background:'rgba(79,70,229,0.04)'}}>
                        {[{l:'NO',a:'center',w:44},{l:'TGL BAYAR',a:'left'},{l:'JATUH TEMPO',a:'left'},
                          {l:'NAMA SISWA',a:'left'},{l:'PROGRAM',a:'left'},{l:'UNIT',a:'left'},
                          {l:'NOMINAL SPP',a:'right'},{l:'DISKON',a:'right'},{l:'YG DIBAYAR',a:'right'},
                          {l:'METODE',a:'left'},{l:'STATUS',a:'center'},{l:'DICATAT OLEH',a:'left'},
                          {l:'CATATAN',a:'left'},{l:'',a:'center'}].map(h=>(
                          <th key={h.l} style={{textAlign:h.a,width:h.w,padding:'0.65rem 0.75rem',fontWeight:700,fontSize:'0.72rem',color:'var(--text-secondary)',whiteSpace:'nowrap',letterSpacing:'0.06em'}}>{h.l}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTrPage.map((p,idx)=>{
                        const gross      = (p.nominal||0) + (p.diskon||0);
                        const verified   = p.status === 'Terverifikasi';
                        return (
                          <tr key={p.id} style={{borderBottom:'1px solid var(--glass-border)'}}
                            onMouseOver={e=>e.currentTarget.style.background='rgba(79,70,229,0.03)'}
                            onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                            <td style={{padding:'0.75rem',textAlign:'center',color:'var(--text-secondary)',fontSize:'0.8rem'}}>{(trSafePage-1)*PER_PAGE+idx+1}</td>
                            <td style={{padding:'0.75rem',whiteSpace:'nowrap',fontWeight:600}}>{fmt(p.tanggal_bayar||p.created_at?.split('T')[0])}</td>
                            <td style={{padding:'0.75rem',whiteSpace:'nowrap',fontSize:'0.82rem',color:'#b45309',fontWeight:600}}>{fmt(p.jatuh_tempo)}</td>
                            <td style={{padding:'0.75rem',fontWeight:500,whiteSpace:'nowrap'}}>{p.nama_siswa||'-'}</td>
                            <td style={{padding:'0.75rem',color:'var(--primary)',fontWeight:500}}>{p.nama_program||'-'}</td>
                            <td style={{padding:'0.75rem',color:'var(--text-secondary)'}}>{p.unit||'-'}</td>
                            <td style={{padding:'0.75rem',textAlign:'right'}}>{formatRupiah(gross)}</td>
                            <td style={{padding:'0.75rem',textAlign:'right',color:'#b45309'}}>{p.diskon>0?formatRupiah(p.diskon):'-'}</td>
                            <td style={{padding:'0.75rem',textAlign:'right',fontWeight:700,color:'#047857'}}>{formatRupiah(p.nominal||0)}</td>
                            <td style={{padding:'0.75rem'}}>
                              <span style={{background:'rgba(79,70,229,0.1)',color:'var(--primary)',padding:'0.15rem 0.5rem',borderRadius:'4px',fontSize:'0.78rem',fontWeight:600}}>{p.metode||'-'}</span>
                            </td>
                            <td style={{padding:'0.75rem',textAlign:'center'}}>{statusBadge(p.status||'Pending')}</td>
                            <td style={{padding:'0.75rem',fontSize:'0.82rem',fontWeight:500}}>{p.dicatat_oleh||'-'}</td>
                            <td style={{padding:'0.75rem',color:'var(--text-secondary)',fontSize:'0.82rem'}}>{p.keterangan||'-'}</td>
                            <td style={{padding:'0.75rem',textAlign:'center'}}>
                              {!verified && (
                                <button onClick={()=>handleDelete(p.id)}
                                  title="Hapus transaksi"
                                  style={{background:'none',border:'1px solid #fca5a5',borderRadius:'0.35rem',padding:'0.3rem 0.5rem',cursor:'pointer',color:'#b91c1c',display:'inline-flex',alignItems:'center'}}>
                                  <Trash2 size={14}/>
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'0.5rem'}}>
                  <p style={{fontSize:'0.78rem',color:'var(--text-secondary)',margin:0}}>
                    {filteredTr.length} transaksi &nbsp;|&nbsp; Total: <strong style={{color:'#047857'}}>{formatRupiah(filteredTr.reduce((s,p)=>s+(p.nominal||0),0))}</strong>
                  </p>
                  <Pager cur={trSafePage} total={trTotalPages} onChange={setTrPage}/>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* ── MODAL BAYAR ── */}
      {modal && (() => {
        const { aktivasi } = modal;
        const dj         = aktivasi.detail_jadwal || {};
        const nominal    = getNominal(aktivasi);
        const diskon     = Number(modalForm.diskon) || 0;
        const yg_dibayar = Math.max(nominal - diskon, 0);
        const dj_modal   = aktivasi.detail_jadwal || {};
        const last       = getLastPayment(aktivasi.siswa_id, dj_modal.nama_program, dj_modal.unit);
        const lastDate   = last?.tanggal_bayar || last?.created_at?.split('T')[0];
        const jt         = getJatuhTempo(aktivasi);

        return (
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:'1rem'}}>
            <div className="glass-card" style={{width:'100%',maxWidth:460,padding:'1.5rem',maxHeight:'90vh',overflowY:'auto'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
                <h3 style={{margin:0,fontWeight:700}}>Bayar SPP</h3>
                <button onClick={()=>setModal(null)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-secondary)'}}><X size={18}/></button>
              </div>

              {/* Info siswa */}
              <div style={{background:'rgba(79,70,229,0.06)',border:'1px solid rgba(79,70,229,0.15)',borderRadius:'0.5rem',padding:'0.85rem 1rem',marginBottom:'1.25rem'}}>
                <div style={{fontWeight:700,fontSize:'1rem'}}>{aktivasi.nama_siswa}</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.25rem 1rem',fontSize:'0.82rem',color:'var(--text-secondary)',marginTop:'0.35rem'}}>
                  <span><b style={{color:'var(--text-primary)'}}>Program:</b> {dj.nama_program||'-'}</span>
                  <span><b style={{color:'var(--text-primary)'}}>Unit:</b> {dj.unit||'-'}</span>
                  <span><b style={{color:'var(--text-primary)'}}>Mulai Les:</b> {fmt(aktivasi.tgl_mulai)}</span>
                  <span><b style={{color:'var(--text-primary)'}}>Jatuh Tempo:</b> {fmt(jt)}</span>
                </div>
                <div style={{marginTop:'0.6rem',paddingTop:'0.5rem',borderTop:'1px solid rgba(79,70,229,0.15)',fontWeight:700,fontSize:'0.95rem'}}>
                  Nominal SPP: {formatRupiah(nominal)}
                </div>
              </div>

              {/* Dicatat oleh */}
              <div style={{display:'flex',alignItems:'center',gap:'0.5rem',padding:'0.45rem 0.75rem',background:'rgba(0,0,0,0.03)',borderRadius:'0.4rem',fontSize:'0.85rem',marginBottom:'0.9rem'}}>
                <span style={{color:'var(--text-secondary)',fontSize:'0.78rem',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em'}}>Dicatat oleh:</span>
                <span style={{fontWeight:700,color:'var(--primary)'}}>{user?.nama || user?.email || '-'}</span>
              </div>

              <form onSubmit={handleSubmit} style={{display:'flex',flexDirection:'column',gap:'0.9rem'}}>
                <div>
                  {lb('Tanggal Bayar', true)}
                  <input type="date" style={inp} value={modalForm.tanggal_bayar}
                    onChange={e=>setModalForm(f=>({...f,tanggal_bayar:e.target.value}))} required/>
                </div>
                <div>
                  {lb('Metode Pembayaran', true)}
                  <select style={inp} value={modalForm.metode}
                    onChange={e=>setModalForm(f=>({...f,metode:e.target.value}))} required>
                    {METODE.map(m=><option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  {lb('Diskon (Rp)')}
                  <input type="number" style={inp} value={modalForm.diskon}
                    onChange={e=>setModalForm(f=>({...f,diskon:e.target.value}))}
                    min="0" max={nominal} placeholder="0"/>
                </div>
                <div>
                  {lb('Catatan')}
                  <input style={inp} value={modalForm.catatan}
                    onChange={e=>setModalForm(f=>({...f,catatan:e.target.value}))}
                    placeholder="Opsional"/>
                </div>

                {/* Ringkasan */}
                <div style={{background:'rgba(16,185,129,0.08)',border:'1px solid rgba(16,185,129,0.2)',borderRadius:'0.5rem',padding:'0.7rem 1rem',fontSize:'0.85rem'}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:'0.25rem'}}>
                    <span style={{color:'var(--text-secondary)'}}>Nominal SPP</span>
                    <span style={{fontWeight:600}}>{formatRupiah(nominal)}</span>
                  </div>
                  {diskon>0&&(
                    <div style={{display:'flex',justifyContent:'space-between',color:'#b45309',marginBottom:'0.25rem'}}>
                      <span>Diskon</span>
                      <span style={{fontWeight:600}}>– {formatRupiah(diskon)}</span>
                    </div>
                  )}
                  <div style={{display:'flex',justifyContent:'space-between',paddingTop:'0.35rem',borderTop:'1px solid rgba(16,185,129,0.25)',fontWeight:700}}>
                    <span>Yang Dibayar</span>
                    <span style={{color:'#047857'}}>{formatRupiah(yg_dibayar)}</span>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',marginTop:'0.3rem',fontSize:'0.78rem',color:'var(--text-secondary)'}}>
                    <span>Periode dibayar</span>
                    <span style={{fontWeight:600}}>{fmt(jt)}</span>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',marginTop:'0.2rem',fontSize:'0.78rem',color:'var(--text-secondary)'}}>
                    <span>Jatuh tempo berikutnya</span>
                    <span style={{fontWeight:600,color:'#047857'}}>{fmt(addOneMonth(jt))}</span>
                  </div>
                </div>

                <div style={{display:'flex',gap:'0.75rem'}}>
                  <button type="submit" className="btn btn-primary" style={{flex:1}}>Simpan Pembayaran</button>
                  <button type="button" className="btn" onClick={()=>setModal(null)} style={{background:'var(--surface-color)'}}>Batal</button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
