import { useState, useEffect, useMemo } from 'react';
import { Search, X, FileDown } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { formatRupiah } from '../utils/formatRupiah';

const BULAN = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'];
const fmt   = (d) => d ? new Date(d).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : '-';
const waLink = (nowa) => {
  if (!nowa) return null;
  const num = nowa.replace(/\D/g,'').replace(/^0/,'62');
  return `https://wa.me/${num}`;
};
const PER_PAGE = 20;

const useIsMobile = () => {
  const [mobile, setMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const h = () => setMobile(window.innerWidth < 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return mobile;
};

const addOneMonth = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().split('T')[0];
};

const computeStatus = (hasPayment, currentJT) => {
  if (!currentJT) return 'Belum Bayar';
  const now = new Date(); now.setHours(0,0,0,0);
  if (new Date(currentJT) < now) return 'Terlambat';
  if (hasPayment) return 'Lunas';
  return 'Belum Bayar';
};

const statusBadge = (s) => {
  const map = { Lunas:['#d1fae5','#047857'], Terlambat:['#fee2e2','#b91c1c'], 'Belum Bayar':['#fef3c7','#92400e'] };
  const [bg,color] = map[s]||['#f3f4f6','#374151'];
  return <span style={{background:bg,color,padding:'0.18rem 0.6rem',borderRadius:'999px',fontSize:'0.75rem',fontWeight:600,whiteSpace:'nowrap'}}>{s}</span>;
};

const TAB_LIST = ['Tunggakan','Belum Jatuh Tempo','Rekap Bulanan'];

const Pager = ({ cur, total, onChange, total_items, per_page }) => {
  if (total <= 1) return null;
  const from = (cur-1)*per_page + 1;
  const to   = Math.min(cur*per_page, total_items);
  return (
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:'0.85rem',flexWrap:'wrap',gap:'0.5rem'}}>
      <span style={{fontSize:'0.8rem',color:'var(--text-secondary)'}}>Menampilkan {from}–{to} dari {total_items}</span>
      <div style={{display:'flex',gap:'0.35rem',alignItems:'center'}}>
        <button onClick={()=>onChange(Math.max(1,cur-1))} disabled={cur<=1}
          style={{padding:'0.3rem 0.7rem',borderRadius:'0.4rem',border:'1px solid var(--glass-border)',background:'var(--surface-color)',cursor:cur<=1?'not-allowed':'pointer',opacity:cur<=1?0.4:1}}>‹</button>
        {Array.from({length:Math.min(total,5)},(_,i)=>{
          let n = cur <= 3 ? i+1 : cur >= total-2 ? total-4+i : cur-2+i;
          n = Math.max(1, Math.min(n, total));
          return (
            <button key={n} onClick={()=>onChange(n)}
              style={{padding:'0.3rem 0.6rem',borderRadius:'0.4rem',border:'1px solid var(--glass-border)',
                background:n===cur?'var(--primary)':'var(--surface-color)',
                color:n===cur?'#fff':'inherit',cursor:'pointer',fontWeight:n===cur?700:400,minWidth:32}}>
              {n}
            </button>
          );
        })}
        <button onClick={()=>onChange(Math.min(total,cur+1))} disabled={cur>=total}
          style={{padding:'0.3rem 0.7rem',borderRadius:'0.4rem',border:'1px solid var(--glass-border)',background:'var(--surface-color)',cursor:cur>=total?'not-allowed':'pointer',opacity:cur>=total?0.4:1}}>›</button>
      </div>
    </div>
  );
};

// Card untuk 1 siswa di tab Tunggakan & Belum JT
const SiswaCard = ({ a, idx, isTunggakan }) => {
  const dj = a.detail_jadwal||{};
  return (
    <div style={{border:'1px solid var(--glass-border)',borderRadius:'0.75rem',padding:'1rem',marginBottom:'0.65rem',background:'var(--surface-color)'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'0.5rem'}}>
        <div>
          <div style={{fontWeight:700,fontSize:'0.95rem'}}>{a.nama_siswa}</div>
          <div style={{fontSize:'0.78rem',color:'var(--primary)',marginTop:'0.1rem'}}>{dj.nama_program||'-'}</div>
          <div style={{fontSize:'0.75rem',color:'var(--text-secondary)'}}>{dj.unit||'-'}</div>
        </div>
        {statusBadge(a._status)}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.4rem 1rem',fontSize:'0.78rem',marginTop:'0.5rem'}}>
        <div><span style={{color:'var(--text-secondary)'}}>Mulai Les: </span>{fmt(a.tgl_mulai)}</div>
        <div><span style={{color:'var(--text-secondary)'}}>Jatuh Tempo: </span>
          <span style={{color:isTunggakan?'#b91c1c':'inherit',fontWeight:isTunggakan?700:400}}>{fmt(a._jt)}</span>
        </div>
        {!isTunggakan && a._last && (
          <div style={{gridColumn:'1/-1'}}>
            <span style={{color:'var(--text-secondary)'}}>Bayar Terakhir: </span>
            {fmt(a._last.tanggal_bayar||a._last.created_at?.split('T')[0])}
          </div>
        )}
        <div style={{gridColumn:'1/-1',marginTop:'0.25rem'}}>
          <span style={{color:'var(--text-secondary)'}}>Nominal SPP: </span>
          <span style={{fontWeight:700,color:isTunggakan?'#b91c1c':'var(--primary)'}}>
            {a._nominal>0?formatRupiah(a._nominal):'Belum diset'}
          </span>
        </div>
        {a.siswa?.nowa && (
          <div style={{gridColumn:'1/-1'}}>
            <span style={{color:'var(--text-secondary)'}}>No WA: </span>
            <a href={waLink(a.siswa.nowa)} target="_blank" rel="noreferrer"
              style={{color:'#25d366',fontWeight:600,textDecoration:'none'}}>{a.siswa.nowa}</a>
          </div>
        )}
      </div>
    </div>
  );
};

// Card untuk rekap bulanan
const RekapCard = ({ r }) => (
  <div style={{border:'1px solid var(--glass-border)',borderRadius:'0.75rem',padding:'1rem',marginBottom:'0.65rem',background:'var(--surface-color)'}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'0.75rem'}}>
      <div style={{fontWeight:700,fontSize:'1rem'}}>{BULAN[r.bulan]} {r.tahun}</div>
      <span style={{background:'rgba(79,70,229,0.1)',color:'var(--primary)',padding:'0.15rem 0.6rem',borderRadius:'999px',fontWeight:700,fontSize:'0.8rem'}}>{r.jml} transaksi</span>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.5rem',fontSize:'0.82rem'}}>
      <div style={{background:'rgba(4,120,87,0.06)',borderRadius:'0.5rem',padding:'0.5rem 0.75rem'}}>
        <div style={{color:'var(--text-secondary)',fontSize:'0.72rem',marginBottom:'0.2rem'}}>TUNAI</div>
        <div style={{fontWeight:700,color:'#047857'}}>{r.tunai>0?formatRupiah(r.tunai):'-'}</div>
      </div>
      <div style={{background:'rgba(29,78,216,0.06)',borderRadius:'0.5rem',padding:'0.5rem 0.75rem'}}>
        <div style={{color:'var(--text-secondary)',fontSize:'0.72rem',marginBottom:'0.2rem'}}>BNI</div>
        <div style={{fontWeight:700,color:'#1d4ed8'}}>{r.bni>0?formatRupiah(r.bni):'-'}</div>
      </div>
      <div style={{background:'rgba(124,58,237,0.06)',borderRadius:'0.5rem',padding:'0.5rem 0.75rem'}}>
        <div style={{color:'var(--text-secondary)',fontSize:'0.72rem',marginBottom:'0.2rem'}}>XENDIT</div>
        <div style={{fontWeight:700,color:'#7c3aed'}}>{r.xendit>0?formatRupiah(r.xendit):'-'}</div>
      </div>
      <div style={{background:'rgba(180,83,9,0.06)',borderRadius:'0.5rem',padding:'0.5rem 0.75rem'}}>
        <div style={{color:'var(--text-secondary)',fontSize:'0.72rem',marginBottom:'0.2rem'}}>DISKON</div>
        <div style={{fontWeight:700,color:'#b45309'}}>{r.diskon>0?formatRupiah(r.diskon):'-'}</div>
      </div>
      <div style={{background:'rgba(4,120,87,0.1)',borderRadius:'0.5rem',padding:'0.5rem 0.75rem',gridColumn:'1/-1'}}>
        <div style={{color:'var(--text-secondary)',fontSize:'0.72rem',marginBottom:'0.2rem'}}>TOTAL</div>
        <div style={{fontWeight:800,color:'#047857'}}>{formatRupiah(r.total)}</div>
      </div>
    </div>
  </div>
);

export default function LaporanSppPage() {
  const isMobile = useIsMobile();
  const [aktivasis, setAktivasis]     = useState([]);
  const [pembayarans, setPembayarans] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [tab, setTab]                 = useState('Tunggakan');

  const [page1, setPage1] = useState(1);
  const [page2, setPage2] = useState(1);
  const [page3, setPage3] = useState(1);

  const [search, setSearch]             = useState('');
  const [filterUnit, setFilterUnit]     = useState('');
  const [filterProg, setFilterProg]     = useState('');
  const [jtFilter, setJtFilter]         = useState(''); // '', 'hari-ini', '1-7', '>7'
  // Filter rekap bulanan — terpisah dari filter Tunggakan/Belum JT
  const [rekapUnit, setRekapUnit]       = useState('');
  const [rekapMetode, setRekapMetode]   = useState('');
  const [rekapDateFrom, setRekapDateFrom] = useState('');
  const [rekapDateTo, setRekapDateTo]   = useState('');

  const fetchAll = async () => {
    setLoading(true);
    const [aRes, pRes] = await Promise.all([
      supabase.from('aktivasi_siswa').select('*, siswa!siswa_id(nowa)').eq('status','Aktif').order('nama_siswa'),
      supabase.from('pembayaran_spp').select('*').order('tanggal_bayar',{ascending:false}),
    ]);
    setAktivasis(aRes.data  || []);
    setPembayarans(pRes.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);
  useEffect(() => { if (tab === 'Rekap Bulanan') fetchAll(); }, [tab]);

  const getLastPayment = (siswaId) =>
    pembayarans
      .filter(p => p.siswa_id === siswaId)
      .sort((a,b) => new Date(b.tanggal_bayar||b.created_at) - new Date(a.tanggal_bayar||a.created_at))[0];

  const getJatuhTempo = (aktivasi) => {
    const last = getLastPayment(aktivasi.siswa_id);
    if (last?.jatuh_tempo) {
      const next = addOneMonth(last.jatuh_tempo);
      if (next && aktivasi.tgl_mulai && next < aktivasi.tgl_mulai) return aktivasi.tgl_mulai;
      return next;
    }
    return aktivasi.tgl_mulai;
  };

  const allUnits = useMemo(() => [...new Set(aktivasis.map(a=>a.detail_jadwal?.unit).filter(Boolean))].sort(), [aktivasis]);
  const allProgs = useMemo(() => [...new Set(aktivasis.map(a=>a.detail_jadwal?.nama_program).filter(Boolean))].sort(), [aktivasis]);

  const enriched = useMemo(() => aktivasis.map(a => {
    const last   = getLastPayment(a.siswa_id);
    const jt     = getJatuhTempo(a);
    const status = computeStatus(!!last, jt);
    return { ...a, _last:last, _jt:jt, _status:status, _nominal:Number(a.spp)||0 };
  }), [aktivasis, pembayarans]);

  const jmlLunas      = enriched.filter(a=>a._status==='Lunas').length;
  const jmlTerlambat  = enriched.filter(a=>a._status==='Terlambat').length;
  const jmlBelumBayar = enriched.filter(a=>a._status==='Belum Bayar').length;
  const totalTunggakan = enriched.filter(a=>a._status==='Terlambat').reduce((s,a)=>s+a._nominal,0);

  const filteredAktivasi = useMemo(() => enriched.filter(a => {
    const dj = a.detail_jadwal||{};
    const q  = search.toLowerCase();
    if (search     && !a.nama_siswa?.toLowerCase().includes(q)) return false;
    if (filterUnit && dj.unit         !== filterUnit) return false;
    if (filterProg && dj.nama_program !== filterProg) return false;
    if (jtFilter) {
      if (!a._jt) return false;
      const today = new Date(); today.setHours(0,0,0,0);
      const jt = new Date(a._jt); jt.setHours(0,0,0,0);
      const selisihHari = Math.round((today - jt) / 86400000); // >0 = sudah lewat
      if (jtFilter === 'hari-ini' && selisihHari !== 0)              return false;
      if (jtFilter === '1-7'      && !(selisihHari >= 1 && selisihHari <= 7)) return false;
      if (jtFilter === '>7'       && !(selisihHari > 7))            return false;
    }
    return true;
  }), [enriched, search, filterUnit, filterProg, jtFilter]);

  const filteredPembayaran = useMemo(() => pembayarans.filter(p => {
    const tgl = p.tanggal_bayar || p.created_at?.split('T')[0];
    if (rekapUnit     && p.unit   !== rekapUnit)    return false;
    if (rekapMetode   && p.metode !== rekapMetode)  return false;
    if (rekapDateFrom && tgl < rekapDateFrom) return false;
    if (rekapDateTo   && tgl > rekapDateTo)   return false;
    return true;
  }), [pembayarans, rekapUnit, rekapMetode, rekapDateFrom, rekapDateTo]);

  const rekapBulanan = useMemo(() => {
    const map = {};
    filteredPembayaran.forEach(p => {
      const tgl = p.tanggal_bayar || p.created_at?.split('T')[0];
      if (!tgl) return;
      const d   = new Date(tgl);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      if (!map[key]) map[key] = { key, tahun:d.getFullYear(), bulan:d.getMonth(), jml:0, tunai:0, bni:0, xendit:0, diskon:0, total:0 };
      map[key].jml++;
      map[key].total  += p.nominal||0;
      map[key].diskon += p.diskon||0;
      if (p.metode==='Tunai')  map[key].tunai  += p.nominal||0;
      if (p.metode==='BNI')    map[key].bni    += p.nominal||0;
      if (p.metode==='Xendit') map[key].xendit += p.nominal||0;
    });
    return Object.values(map).sort((a,b)=>b.key.localeCompare(a.key));
  }, [filteredPembayaran]);

  const sel = { padding:'0.5rem 0.75rem', borderRadius:'0.5rem', border:'1px solid var(--glass-border)', background:'var(--surface-color)', fontFamily:'inherit', fontSize:'0.85rem', width:'100%', boxSizing:'border-box' };
  const hasFilter = search||filterUnit||filterProg||jtFilter;
  const resetFilter = () => { setSearch(''); setFilterUnit(''); setFilterProg(''); setJtFilter(''); setPage1(1); setPage2(1); };
  const hasRekapFilter = rekapUnit||rekapMetode||rekapDateFrom||rekapDateTo;
  const resetRekapFilter = () => { setRekapUnit(''); setRekapMetode(''); setRekapDateFrom(''); setRekapDateTo(''); setPage3(1); };

  const exportTunggakan = () => {
    const rows = tunggakan.map((a, i) => {
      const dj = a.detail_jadwal || {};
      return {
        'NO': i + 1,
        'NAMA SISWA': a.nama_siswa || '-',
        'PROGRAM': dj.nama_program || '-',
        'UNIT': dj.unit || '-',
        'TGL MULAI': a.tgl_mulai ? new Date(a.tgl_mulai).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-',
        'JATUH TEMPO': a._jt ? new Date(a._jt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-',
        'NOMINAL SPP': a._nominal || 0,
        'STATUS': a._status,
        'NO WA': a.siswa?.nowa || '-',
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 5 }, { wch: 28 }, { wch: 20 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tunggakan');
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
    XLSX.writeFile(wb, `Tunggakan_SPP_${stamp}.xlsx`);
  };

  const tunggakan = filteredAktivasi.filter(a => a._status === 'Terlambat');
  const belumJT   = filteredAktivasi.filter(a => a._status === 'Lunas' || a._status === 'Belum Bayar');

  const tp1 = Math.max(1, Math.ceil(tunggakan.length / PER_PAGE));
  const tp2 = Math.max(1, Math.ceil(belumJT.length  / PER_PAGE));
  const tp3 = Math.max(1, Math.ceil(rekapBulanan.length / PER_PAGE));

  const s1 = Math.min(page1, tp1); const d1 = tunggakan.slice((s1-1)*PER_PAGE, s1*PER_PAGE);
  const s2 = Math.min(page2, tp2); const d2 = belumJT.slice((s2-1)*PER_PAGE, s2*PER_PAGE);
  const s3 = Math.min(page3, tp3); const d3 = rekapBulanan.slice((s3-1)*PER_PAGE, s3*PER_PAGE);

  return (
    <div style={{paddingBottom:'2rem'}}>
      {/* Header */}
      <div style={{marginBottom:'1.25rem'}}>
        <p style={{fontSize:'0.72rem',color:'var(--text-secondary)',margin:0,textTransform:'uppercase',letterSpacing:'0.05em'}}>SPP</p>
        <h1 style={{fontSize:isMobile?'1.35rem':'1.6rem',fontWeight:700,margin:0}}>Laporan SPP</h1>
      </div>

      {/* STATUS CARDS — 2 kolom di mobile, 4 di desktop */}
      <div style={{display:'grid',gridTemplateColumns:isMobile?'repeat(2,1fr)':'repeat(4,1fr)',gap:'0.75rem',marginBottom:'1.25rem'}}>
        {[
          ['Lunas',          '#d1fae5','#047857', jmlLunas,       null],
          ['Terlambat',      '#fee2e2','#b91c1c', jmlTerlambat,   null],
          ['Belum Bayar',    '#fef3c7','#92400e', jmlBelumBayar,  null],
          ['Total Tunggakan','rgba(185,28,28,0.07)','#b91c1c', null, totalTunggakan],
        ].map(([label,bg,color,n,nominal]) => (
          <div key={label} className="glass-card" style={{padding:'1rem',background:bg,border:`1px solid ${color}22`}}>
            <div style={{fontSize:'0.68rem',fontWeight:700,color,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:'0.4rem'}}>{label}</div>
            {nominal != null
              ? <div style={{fontSize:isMobile?'1.05rem':'1.35rem',fontWeight:800,color,lineHeight:1.1}}>{formatRupiah(nominal)}</div>
              : <div style={{fontSize:isMobile?'1.75rem':'2.2rem',fontWeight:800,color,lineHeight:1}}>{n}</div>
            }
            <div style={{fontSize:'0.7rem',color:'var(--text-secondary)',marginTop:'0.3rem'}}>
              {nominal != null
                ? `${jmlTerlambat} siswa terlambat`
                : `${enriched.length>0?((n/enriched.length)*100).toFixed(0):0}% dari ${enriched.length}`
              }
            </div>
          </div>
        ))}
      </div>

      {/* TABS */}
      <div style={{display:'flex',borderBottom:'2px solid var(--glass-border)',marginBottom:'1rem',overflowX:'auto'}}>
        {TAB_LIST.map(t => (
          <button key={t} onClick={()=>setTab(t)} style={{
            background:'none',border:'none',cursor:'pointer',
            padding:'0.6rem 1rem',fontWeight:tab===t?700:500,
            fontSize:'0.85rem',fontFamily:'inherit',whiteSpace:'nowrap',
            color:tab===t?'var(--primary)':'var(--text-secondary)',
            borderBottom:tab===t?'2px solid var(--primary)':'2px solid transparent',
            marginBottom:'-2px',transition:'all 0.15s',
          }}>{t}</button>
        ))}
      </div>

      {/* FILTERS — hanya untuk Tunggakan & Belum Jatuh Tempo */}
      {tab !== 'Rekap Bulanan' && (
        <div style={{display:'flex',flexDirection:'column',gap:'0.5rem',marginBottom:'1rem'}}>
          {/* Baris 1: search + unit + program */}
          <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'repeat(auto-fill,minmax(180px,1fr))',gap:'0.5rem',alignItems:'center'}}>
            <div style={{position:'relative'}}>
              <Search size={14} style={{position:'absolute',left:'0.75rem',top:'50%',transform:'translateY(-50%)',color:'var(--text-secondary)',pointerEvents:'none'}}/>
              <input style={{...sel,paddingLeft:'2.1rem'}}
                placeholder="Cari nama siswa..."
                value={search} onChange={e=>{setSearch(e.target.value);setPage1(1);setPage2(1);}}/>
            </div>
            <select style={sel} value={filterUnit} onChange={e=>{setFilterUnit(e.target.value);setPage1(1);setPage2(1);}}>
              <option value="">Semua Unit</option>
              {allUnits.map(u=><option key={u} value={u}>{u}</option>)}
            </select>
            <select style={sel} value={filterProg} onChange={e=>{setFilterProg(e.target.value);setPage1(1);setPage2(1);}}>
              <option value="">Semua Program</option>
              {allProgs.map(p=><option key={p} value={p}>{p}</option>)}
            </select>
            <select style={sel} value={jtFilter} onChange={e=>{setJtFilter(e.target.value);setPage1(1);setPage2(1);}}>
              <option value="">Semua Jatuh Tempo</option>
              <option value="hari-ini">Jatuh tempo hari ini</option>
              <option value="1-7">Terlambat 1–7 hari</option>
              <option value=">7">Terlambat lebih dari 7 hari</option>
            </select>
          </div>

          {/* Baris 2: reset + info hasil */}
          {hasFilter && (
            <div style={{display:'flex',flexWrap:'wrap',gap:'0.5rem',alignItems:'center'}}>
              {jtFilter && (
                <span style={{fontSize:'0.78rem',color:'var(--text-secondary)',display:'flex',alignItems:'center',gap:'0.4rem'}}>
                  <span style={{background:'rgba(79,70,229,0.08)',color:'var(--primary)',padding:'0.15rem 0.6rem',borderRadius:999,fontWeight:600}}>
                    {filteredAktivasi.length} siswa
                  </span>
                  {jtFilter==='hari-ini' ? 'jatuh tempo hari ini'
                    : jtFilter==='1-7'   ? 'terlambat 1–7 hari'
                    : 'terlambat lebih dari 7 hari'}
                </span>
              )}
              <button onClick={resetFilter}
                style={{display:'flex',alignItems:'center',gap:'0.35rem',background:'none',border:'1px solid var(--glass-border)',borderRadius:'0.5rem',padding:'0.4rem 0.7rem',cursor:'pointer',fontSize:'0.82rem',color:'var(--text-secondary)',marginLeft:'auto'}}>
                <X size={13}/> Reset Semua
              </button>
            </div>
          )}
        </div>
      )}

      {loading ? <p style={{color:'var(--text-secondary)'}}>Memuat...</p> : (<>

        {/* ── TAB 1: TUNGGAKAN ── */}
        {tab === 'Tunggakan' && (
          <div className="glass-card" style={{padding:isMobile?'0.75rem':'1.5rem'}}>
            {tunggakan.length === 0
              ? <p style={{color:'#047857',fontWeight:600}}>Tidak ada tunggakan.</p>
              : (<>
                <div style={{display:'flex',justifyContent:'flex-end',marginBottom:'0.75rem'}}>
                  <button onClick={exportTunggakan}
                    style={{display:'flex',alignItems:'center',gap:'0.4rem',background:'#047857',color:'#fff',border:'none',borderRadius:'0.5rem',padding:'0.5rem 1rem',cursor:'pointer',fontWeight:600,fontSize:'0.82rem',fontFamily:'inherit'}}>
                    <FileDown size={15}/> Export Excel
                  </button>
                </div>
                {isMobile
                  ? d1.map((a,i) => <SiswaCard key={a.id} a={a} idx={i} isTunggakan />)
                  : (
                    <div style={{overflowX:'auto'}}>
                      <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.84rem'}}>
                        <thead>
                          <tr style={{borderBottom:'2px solid var(--glass-border)',background:'rgba(79,70,229,0.04)'}}>
                            {['NO','NAMA SISWA','NO WA','PROGRAM','UNIT','TGL MULAI','JATUH TEMPO','NOMINAL SPP','STATUS'].map(h=>(
                              <th key={h} style={{padding:'0.65rem 0.75rem',fontWeight:700,fontSize:'0.72rem',color:'var(--text-secondary)',whiteSpace:'nowrap',textAlign:h==='NOMINAL SPP'?'right':'left'}}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {d1.map((a,idx) => {
                            const dj = a.detail_jadwal||{};
                            return (
                              <tr key={a.id} style={{borderBottom:'1px solid var(--glass-border)'}}
                                onMouseOver={e=>e.currentTarget.style.background='rgba(185,28,28,0.03)'}
                                onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                                <td style={{padding:'0.7rem 0.75rem',color:'var(--text-secondary)'}}>{(s1-1)*PER_PAGE+idx+1}</td>
                                <td style={{padding:'0.7rem 0.75rem',fontWeight:700}}>{a.nama_siswa}</td>
                                <td style={{padding:'0.7rem 0.75rem',whiteSpace:'nowrap'}}>
                                  {a.siswa?.nowa
                                    ? <a href={waLink(a.siswa.nowa)} target="_blank" rel="noreferrer" style={{color:'#25d366',fontWeight:600,textDecoration:'none'}}>{a.siswa.nowa}</a>
                                    : <span style={{color:'var(--text-secondary)'}}>-</span>}
                                </td>
                                <td style={{padding:'0.7rem 0.75rem',color:'var(--primary)'}}>{dj.nama_program||'-'}</td>
                                <td style={{padding:'0.7rem 0.75rem',color:'var(--text-secondary)'}}>{dj.unit||'-'}</td>
                                <td style={{padding:'0.7rem 0.75rem',whiteSpace:'nowrap'}}>{fmt(a.tgl_mulai)}</td>
                                <td style={{padding:'0.7rem 0.75rem',whiteSpace:'nowrap',fontWeight:700,color:'#b91c1c'}}>{fmt(a._jt)}</td>
                                <td style={{padding:'0.7rem 0.75rem',textAlign:'right',fontWeight:700}}>{a._nominal>0?formatRupiah(a._nominal):<span style={{color:'#d97706',fontWeight:400,fontSize:'0.78rem'}}>Belum diset</span>}</td>
                                <td style={{padding:'0.7rem 0.75rem'}}>{statusBadge(a._status)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr style={{borderTop:'2px solid var(--glass-border)',background:'rgba(185,28,28,0.04)',fontWeight:700}}>
                            <td colSpan={7} style={{padding:'0.65rem 0.75rem',fontSize:'0.82rem'}}>TOTAL ({tunggakan.length} siswa)</td>
                            <td style={{padding:'0.65rem 0.75rem',textAlign:'right',color:'#b91c1c'}}>{formatRupiah(tunggakan.reduce((s,a)=>s+a._nominal,0))}</td>
                            <td/>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )
                }
                {isMobile && (
                  <div style={{background:'rgba(185,28,28,0.04)',borderRadius:'0.5rem',padding:'0.75rem',marginTop:'0.5rem',display:'flex',justifyContent:'space-between',fontWeight:700,fontSize:'0.85rem'}}>
                    <span>Total ({tunggakan.length} siswa)</span>
                    <span style={{color:'#b91c1c'}}>{formatRupiah(tunggakan.reduce((s,a)=>s+a._nominal,0))}</span>
                  </div>
                )}
                <Pager cur={s1} total={tp1} onChange={setPage1} total_items={tunggakan.length} per_page={PER_PAGE}/>
              </>)
            }
          </div>
        )}

        {/* ── TAB 2: BELUM JATUH TEMPO ── */}
        {tab === 'Belum Jatuh Tempo' && (
          <div className="glass-card" style={{padding:isMobile?'0.75rem':'1.5rem'}}>
            {belumJT.length === 0
              ? <p style={{color:'var(--text-secondary)'}}>Tidak ada data.</p>
              : (<>
                {isMobile
                  ? d2.map((a,i) => <SiswaCard key={a.id} a={a} idx={i} isTunggakan={false} />)
                  : (
                    <div style={{overflowX:'auto'}}>
                      <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.84rem'}}>
                        <thead>
                          <tr style={{borderBottom:'2px solid var(--glass-border)',background:'rgba(79,70,229,0.04)'}}>
                            {['NO','NAMA SISWA','NO WA','PROGRAM','UNIT','TGL MULAI','JATUH TEMPO','BAYAR TERAKHIR','NOMINAL SPP','STATUS'].map(h=>(
                              <th key={h} style={{padding:'0.65rem 0.75rem',fontWeight:700,fontSize:'0.72rem',color:'var(--text-secondary)',whiteSpace:'nowrap',textAlign:h==='NOMINAL SPP'?'right':'left'}}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {d2.map((a,idx) => {
                            const dj = a.detail_jadwal||{};
                            return (
                              <tr key={a.id} style={{borderBottom:'1px solid var(--glass-border)'}}
                                onMouseOver={e=>e.currentTarget.style.background='rgba(79,70,229,0.03)'}
                                onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                                <td style={{padding:'0.7rem 0.75rem',color:'var(--text-secondary)'}}>{(s2-1)*PER_PAGE+idx+1}</td>
                                <td style={{padding:'0.7rem 0.75rem',fontWeight:700}}>{a.nama_siswa}</td>
                                <td style={{padding:'0.7rem 0.75rem',whiteSpace:'nowrap'}}>
                                  {a.siswa?.nowa
                                    ? <a href={waLink(a.siswa.nowa)} target="_blank" rel="noreferrer" style={{color:'#25d366',fontWeight:600,textDecoration:'none'}}>{a.siswa.nowa}</a>
                                    : <span style={{color:'var(--text-secondary)'}}>-</span>}
                                </td>
                                <td style={{padding:'0.7rem 0.75rem',color:'var(--primary)'}}>{dj.nama_program||'-'}</td>
                                <td style={{padding:'0.7rem 0.75rem',color:'var(--text-secondary)'}}>{dj.unit||'-'}</td>
                                <td style={{padding:'0.7rem 0.75rem',whiteSpace:'nowrap'}}>{fmt(a.tgl_mulai)}</td>
                                <td style={{padding:'0.7rem 0.75rem',whiteSpace:'nowrap'}}>{fmt(a._jt)}</td>
                                <td style={{padding:'0.7rem 0.75rem',whiteSpace:'nowrap',color:'var(--text-secondary)'}}>{a._last?fmt(a._last.tanggal_bayar||a._last.created_at?.split('T')[0]):'-'}</td>
                                <td style={{padding:'0.7rem 0.75rem',textAlign:'right',fontWeight:700}}>{a._nominal>0?formatRupiah(a._nominal):<span style={{color:'#d97706',fontWeight:400,fontSize:'0.78rem'}}>Belum diset</span>}</td>
                                <td style={{padding:'0.7rem 0.75rem'}}>{statusBadge(a._status)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr style={{borderTop:'2px solid var(--glass-border)',background:'rgba(79,70,229,0.04)',fontWeight:700}}>
                            <td colSpan={8} style={{padding:'0.65rem 0.75rem',fontSize:'0.82rem'}}>
                              TOTAL ({belumJT.length}) — Lunas: {belumJT.filter(a=>a._status==='Lunas').length} | Belum Bayar: {belumJT.filter(a=>a._status==='Belum Bayar').length}
                            </td>
                            <td style={{padding:'0.65rem 0.75rem',textAlign:'right',color:'var(--primary)'}}>{formatRupiah(belumJT.reduce((s,a)=>s+a._nominal,0))}</td>
                            <td/>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )
                }
                {isMobile && (
                  <div style={{background:'rgba(79,70,229,0.04)',borderRadius:'0.5rem',padding:'0.75rem',marginTop:'0.5rem',fontSize:'0.82rem',fontWeight:700}}>
                    <div style={{display:'flex',justifyContent:'space-between'}}>
                      <span>Lunas: {belumJT.filter(a=>a._status==='Lunas').length} | Belum Bayar: {belumJT.filter(a=>a._status==='Belum Bayar').length}</span>
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',marginTop:'0.25rem'}}>
                      <span>Total ({belumJT.length} siswa)</span>
                      <span style={{color:'var(--primary)'}}>{formatRupiah(belumJT.reduce((s,a)=>s+a._nominal,0))}</span>
                    </div>
                  </div>
                )}
                <Pager cur={s2} total={tp2} onChange={setPage2} total_items={belumJT.length} per_page={PER_PAGE}/>
              </>)
            }
          </div>
        )}

        {/* ── TAB 3: REKAP BULANAN ── */}
        {tab === 'Rekap Bulanan' && (<>
          {/* Filter khusus Rekap Bulanan */}
          <div style={{display:'flex',flexWrap:'wrap',gap:'0.5rem',marginBottom:'1rem',alignItems:'center'}}>
            <select style={{...sel,width:'auto'}} value={rekapUnit} onChange={e=>{setRekapUnit(e.target.value);setPage3(1);}}>
              <option value="">Semua Unit</option>
              {allUnits.map(u=><option key={u} value={u}>{u}</option>)}
            </select>
            <select style={{...sel,width:'auto'}} value={rekapMetode} onChange={e=>{setRekapMetode(e.target.value);setPage3(1);}}>
              <option value="">Semua Metode</option>
              <option value="Tunai">Tunai</option>
              <option value="BNI">BNI</option>
              <option value="Xendit">Xendit</option>
            </select>
            <input type="date" style={{...sel,width:'auto'}} value={rekapDateFrom} onChange={e=>{setRekapDateFrom(e.target.value);setPage3(1);}}/>
            <input type="date" style={{...sel,width:'auto'}} value={rekapDateTo} onChange={e=>{setRekapDateTo(e.target.value);setPage3(1);}}/>
            {hasRekapFilter && (
              <button onClick={resetRekapFilter} style={{display:'flex',alignItems:'center',gap:'0.35rem',background:'none',border:'1px solid var(--glass-border)',borderRadius:'0.5rem',padding:'0.5rem 0.75rem',cursor:'pointer',fontSize:'0.82rem',color:'var(--text-secondary)'}}>
                <X size={14}/> Reset
              </button>
            )}
          </div>
          <div className="glass-card" style={{padding:isMobile?'0.75rem':'1.5rem'}}>
            {loading ? <p style={{color:'var(--text-secondary)'}}>Memuat...</p>
            : rekapBulanan.length === 0
              ? <p style={{color:'var(--text-secondary)'}}>Belum ada data transaksi.</p>
              : (<>
                {isMobile
                  ? d3.map(r => <RekapCard key={r.key} r={r} />)
                  : (
                    <div style={{overflowX:'auto'}}>
                      <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.84rem'}}>
                        <thead>
                          <tr style={{borderBottom:'2px solid var(--glass-border)',background:'rgba(79,70,229,0.04)'}}>
                            {['BULAN','JML TRANSAKSI','TUNAI','BNI','XENDIT','DISKON','TOTAL DITERIMA'].map((h,i)=>(
                              <th key={h} style={{padding:'0.65rem 0.75rem',fontWeight:700,fontSize:'0.72rem',color:'var(--text-secondary)',whiteSpace:'nowrap',textAlign:i>0?'right':'left'}}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {d3.map(r=>(
                            <tr key={r.key} style={{borderBottom:'1px solid var(--glass-border)'}}
                              onMouseOver={e=>e.currentTarget.style.background='rgba(79,70,229,0.03)'}
                              onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                              <td style={{padding:'0.7rem 0.75rem',fontWeight:700,whiteSpace:'nowrap'}}>{BULAN[r.bulan]} {r.tahun}</td>
                              <td style={{padding:'0.7rem 0.75rem',textAlign:'right'}}>
                                <span style={{background:'rgba(79,70,229,0.1)',color:'var(--primary)',padding:'0.15rem 0.6rem',borderRadius:'999px',fontWeight:700,fontSize:'0.8rem'}}>{r.jml}</span>
                              </td>
                              <td style={{padding:'0.7rem 0.75rem',textAlign:'right',color:'#047857'}}>{r.tunai>0?formatRupiah(r.tunai):'-'}</td>
                              <td style={{padding:'0.7rem 0.75rem',textAlign:'right',color:'#1d4ed8'}}>{r.bni>0?formatRupiah(r.bni):'-'}</td>
                              <td style={{padding:'0.7rem 0.75rem',textAlign:'right',color:'#7c3aed'}}>{r.xendit>0?formatRupiah(r.xendit):'-'}</td>
                              <td style={{padding:'0.7rem 0.75rem',textAlign:'right',color:'#b45309'}}>{r.diskon>0?formatRupiah(r.diskon):'-'}</td>
                              <td style={{padding:'0.7rem 0.75rem',textAlign:'right',fontWeight:700,color:'#047857'}}>{formatRupiah(r.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr style={{borderTop:'2px solid var(--glass-border)',background:'rgba(79,70,229,0.04)',fontWeight:700}}>
                            <td style={{padding:'0.65rem 0.75rem',fontSize:'0.82rem'}}>TOTAL ({rekapBulanan.reduce((s,r)=>s+r.jml,0)} transaksi)</td>
                            <td/>
                            <td style={{padding:'0.65rem 0.75rem',textAlign:'right',color:'#047857'}}>{formatRupiah(rekapBulanan.reduce((s,r)=>s+r.tunai,0))}</td>
                            <td style={{padding:'0.65rem 0.75rem',textAlign:'right',color:'#1d4ed8'}}>{formatRupiah(rekapBulanan.reduce((s,r)=>s+r.bni,0))}</td>
                            <td style={{padding:'0.65rem 0.75rem',textAlign:'right',color:'#7c3aed'}}>{formatRupiah(rekapBulanan.reduce((s,r)=>s+r.xendit,0))}</td>
                            <td style={{padding:'0.65rem 0.75rem',textAlign:'right',color:'#b45309'}}>{formatRupiah(rekapBulanan.reduce((s,r)=>s+r.diskon,0))}</td>
                            <td style={{padding:'0.65rem 0.75rem',textAlign:'right',color:'#047857'}}>{formatRupiah(rekapBulanan.reduce((s,r)=>s+r.total,0))}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )
                }
                {isMobile && (
                  <div style={{background:'rgba(79,70,229,0.04)',borderRadius:'0.5rem',padding:'0.75rem',marginTop:'0.5rem',fontSize:'0.82rem',fontWeight:700}}>
                    <div style={{display:'flex',justifyContent:'space-between'}}>
                      <span>Total {rekapBulanan.reduce((s,r)=>s+r.jml,0)} transaksi</span>
                      <span style={{color:'#047857'}}>{formatRupiah(rekapBulanan.reduce((s,r)=>s+r.total,0))}</span>
                    </div>
                  </div>
                )}
                <Pager cur={s3} total={tp3} onChange={setPage3} total_items={rekapBulanan.length} per_page={PER_PAGE}/>
              </>)
            }
          </div>
        </>)}
      </>)}
    </div>
  );
}
