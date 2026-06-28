import { useState, useEffect, useMemo } from 'react';
import { Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatRupiah } from '../utils/formatRupiah';

const BULAN = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'];
const fmt   = (d) => d ? new Date(d).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : '-';
const PER_PAGE = 20;

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

const TAB_LIST = ['Tunggakan','Tagihan Belum Jatuh Tempo','Rekap Bulanan'];

const TAB_BTN = (active) => ({
  background:'none', border:'none', cursor:'pointer',
  padding:'0.65rem 1.1rem', fontWeight:active?700:500,
  fontSize:'0.88rem', fontFamily:'inherit',
  color:active?'var(--primary)':'var(--text-secondary)',
  borderBottom:active?'2px solid var(--primary)':'2px solid transparent',
  marginBottom:'-2px', transition:'all 0.15s', whiteSpace:'nowrap',
});

const TH = ({children, right}) => (
  <th style={{textAlign:right?'right':'left',padding:'0.65rem 0.75rem',fontWeight:700,fontSize:'0.72rem',color:'var(--text-secondary)',whiteSpace:'nowrap',letterSpacing:'0.06em'}}>{children}</th>
);
const TD = ({children, right, bold, color, nowrap}) => (
  <td style={{padding:'0.7rem 0.75rem',textAlign:right?'right':'left',fontWeight:bold?700:400,color:color||'inherit',whiteSpace:nowrap?'nowrap':'normal'}}>{children}</td>
);

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
        {Array.from({length:total},(_,i)=>i+1).map(n=>(
          <button key={n} onClick={()=>onChange(n)}
            style={{padding:'0.3rem 0.6rem',borderRadius:'0.4rem',border:'1px solid var(--glass-border)',
              background:n===cur?'var(--primary)':'var(--surface-color)',
              color:n===cur?'#fff':'inherit',cursor:'pointer',fontWeight:n===cur?700:400,minWidth:32}}>
            {n}
          </button>
        ))}
        <button onClick={()=>onChange(Math.min(total,cur+1))} disabled={cur>=total}
          style={{padding:'0.3rem 0.7rem',borderRadius:'0.4rem',border:'1px solid var(--glass-border)',background:'var(--surface-color)',cursor:cur>=total?'not-allowed':'pointer',opacity:cur>=total?0.4:1}}>›</button>
      </div>
    </div>
  );
};

export default function LaporanSppPage() {
  const [aktivasis, setAktivasis]     = useState([]);
  const [pembayarans, setPembayarans] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [tab, setTab]                 = useState('Tunggakan');

  const [page1, setPage1] = useState(1);
  const [page2, setPage2] = useState(1);
  const [page3, setPage3] = useState(1);

  // Filters
  const [search, setSearch]             = useState('');
  const [filterUnit, setFilterUnit]     = useState('');
  const [filterProg, setFilterProg]     = useState('');
  const [filterMetode, setFilterMetode] = useState('');
  const [dateFrom, setDateFrom]         = useState('');
  const [dateTo, setDateTo]             = useState('');

  const fetchAll = async () => {
    setLoading(true);
    const [aRes, pRes] = await Promise.all([
      supabase.from('aktivasi_siswa').select('*').eq('status','Aktif').order('nama_siswa'),
      supabase.from('pembayaran_spp').select('*').order('tanggal_bayar',{ascending:false}),
    ]);
    setAktivasis(aRes.data  || []);
    setPembayarans(pRes.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

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

  // Status counts
  const jmlLunas      = enriched.filter(a=>a._status==='Lunas').length;
  const jmlTerlambat  = enriched.filter(a=>a._status==='Terlambat').length;
  const jmlBelumBayar = enriched.filter(a=>a._status==='Belum Bayar').length;
  const totalTunggakan = enriched.filter(a=>a._status==='Terlambat').reduce((s,a)=>s+a._nominal,0);

  // Filtered aktivasi
  const filteredAktivasi = useMemo(() => enriched.filter(a => {
    const dj = a.detail_jadwal||{};
    const q  = search.toLowerCase();
    if (search     && !a.nama_siswa?.toLowerCase().includes(q)) return false;
    if (filterUnit && dj.unit         !== filterUnit) return false;
    if (filterProg && dj.nama_program !== filterProg) return false;
    return true;
  }), [enriched, search, filterUnit, filterProg]);

  // Filtered pembayaran (rekap bulanan)
  const filteredPembayaran = useMemo(() => pembayarans.filter(p => {
    const tgl = p.tanggal_bayar || p.created_at?.split('T')[0];
    const q   = search.toLowerCase();
    if (search       && !p.nama_siswa?.toLowerCase().includes(q)) return false;
    if (filterUnit   && p.unit         !== filterUnit)   return false;
    if (filterProg   && p.nama_program !== filterProg)   return false;
    if (filterMetode && p.metode       !== filterMetode) return false;
    if (dateFrom     && tgl < dateFrom) return false;
    if (dateTo       && tgl > dateTo)   return false;
    return true;
  }), [pembayarans, search, filterUnit, filterProg, filterMetode, dateFrom, dateTo]);

  // Rekap bulanan
  const rekapBulanan = useMemo(() => {
    const map = {};
    filteredPembayaran.forEach(p => {
      const tgl = p.tanggal_bayar || p.created_at?.split('T')[0];
      if (!tgl) return;
      const d   = new Date(tgl);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      if (!map[key]) map[key] = { key, tahun:d.getFullYear(), bulan:d.getMonth(), jml:0, tunai:0, transfer:0, diskon:0, total:0 };
      map[key].jml++;
      map[key].total   += p.nominal||0;
      map[key].diskon  += p.diskon||0;
      if (p.metode==='Tunai')         map[key].tunai    += p.nominal||0;
      if (p.metode==='Transfer Bank') map[key].transfer += p.nominal||0;
    });
    return Object.values(map).sort((a,b)=>b.key.localeCompare(a.key));
  }, [filteredPembayaran]);

  const sel = { padding:'0.5rem 0.75rem', borderRadius:'0.5rem', border:'1px solid var(--glass-border)', background:'var(--surface-color)', fontFamily:'inherit', fontSize:'0.85rem' };
  const hasFilter = search||filterUnit||filterProg||filterMetode||dateFrom||dateTo;
  const resetFilter = () => { setSearch(''); setFilterUnit(''); setFilterProg(''); setFilterMetode(''); setDateFrom(''); setDateTo(''); setPage1(1); setPage2(1); setPage3(1); };

  const tunggakan = filteredAktivasi.filter(a => a._status === 'Terlambat');
  const belumJT   = filteredAktivasi.filter(a => a._status === 'Lunas' || a._status === 'Belum Bayar');

  const tp1 = Math.max(1, Math.ceil(tunggakan.length / PER_PAGE));
  const tp2 = Math.max(1, Math.ceil(belumJT.length  / PER_PAGE));
  const tp3 = Math.max(1, Math.ceil(rekapBulanan.length / PER_PAGE));

  const s1 = Math.min(page1, tp1); const d1 = tunggakan.slice((s1-1)*PER_PAGE, s1*PER_PAGE);
  const s2 = Math.min(page2, tp2); const d2 = belumJT.slice((s2-1)*PER_PAGE, s2*PER_PAGE);
  const s3 = Math.min(page3, tp3); const d3 = rekapBulanan.slice((s3-1)*PER_PAGE, s3*PER_PAGE);

  return (
    <div>
      {/* Header */}
      <div style={{marginBottom:'1.5rem'}}>
        <p style={{fontSize:'0.78rem',color:'var(--text-secondary)',margin:0,textTransform:'uppercase',letterSpacing:'0.05em'}}>SPP</p>
        <h1 style={{fontSize:'1.6rem',fontWeight:700,margin:0}}>Laporan SPP</h1>
      </div>

      {/* STATUS CARD */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'1rem',marginBottom:'1.5rem'}}>
        {[
          ['Lunas',          '#d1fae5','#047857', jmlLunas,       null],
          ['Terlambat',      '#fee2e2','#b91c1c', jmlTerlambat,   null],
          ['Belum Bayar',    '#fef3c7','#92400e', jmlBelumBayar,  null],
          ['Total Tunggakan','rgba(185,28,28,0.07)','#b91c1c', null, totalTunggakan],
        ].map(([label,bg,color,n,nominal]) => (
          <div key={label} className="glass-card" style={{padding:'1.25rem 1.5rem',background:bg,border:`1px solid ${color}22`}}>
            <div style={{fontSize:'0.72rem',fontWeight:700,color,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:'0.5rem'}}>{label}</div>
            {nominal != null
              ? <div style={{fontSize:'1.45rem',fontWeight:800,color,lineHeight:1.1}}>{formatRupiah(nominal)}</div>
              : <div style={{fontSize:'2.2rem',fontWeight:800,color,lineHeight:1}}>{n}</div>
            }
            <div style={{fontSize:'0.75rem',color:'var(--text-secondary)',marginTop:'0.35rem'}}>
              {nominal != null
                ? `${jmlTerlambat} siswa terlambat`
                : `${enriched.length>0?((n/enriched.length)*100).toFixed(0):0}% dari ${enriched.length} siswa aktif`
              }
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:0,borderBottom:'2px solid var(--glass-border)',marginBottom:'1.25rem',overflowX:'auto'}}>
        {TAB_LIST.map(t => (
          <button key={t} onClick={()=>setTab(t)} style={TAB_BTN(tab===t)}>{t}</button>
        ))}
      </div>

      {/* Filters */}
      <div style={{display:'flex',gap:'0.65rem',marginBottom:'1rem',flexWrap:'wrap',alignItems:'center'}}>
        <div style={{position:'relative',flex:1,minWidth:180}}>
          <Search size={14} style={{position:'absolute',left:'0.75rem',top:'50%',transform:'translateY(-50%)',color:'var(--text-secondary)'}}/>
          <input style={{...sel,paddingLeft:'2.1rem',width:'100%',boxSizing:'border-box'}}
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
        {tab === 'Rekap Bulanan' && (
          <>
            <select style={sel} value={filterMetode} onChange={e=>{setFilterMetode(e.target.value);setPage3(1);}}>
              <option value="">Semua Metode</option>
              <option value="Tunai">Tunai</option>
              <option value="Transfer Bank">Transfer Bank</option>
            </select>
            <input type="date" style={sel} value={dateFrom} onChange={e=>{setDateFrom(e.target.value);setPage3(1);}}/>
            <span style={{color:'var(--text-secondary)',fontSize:'0.82rem'}}>s/d</span>
            <input type="date" style={sel} value={dateTo} onChange={e=>{setDateTo(e.target.value);setPage3(1);}}/>
          </>
        )}
        {hasFilter && (
          <button onClick={resetFilter} style={{background:'none',border:'1px solid var(--glass-border)',borderRadius:'0.4rem',padding:'0.45rem 0.85rem',cursor:'pointer',fontSize:'0.82rem',color:'var(--text-secondary)'}}>Reset</button>
        )}
      </div>

      {loading ? <p style={{color:'var(--text-secondary)'}}>Memuat...</p> : (
        <>
          {/* ── TAB 1: TUNGGAKAN ── */}
          {tab === 'Tunggakan' && (
            <div className="glass-card" style={{padding:'1.5rem'}}>
              {tunggakan.length === 0
                ? <p style={{color:'#047857',fontWeight:600}}>Tidak ada tunggakan.</p>
                : (
                <>
                  <div style={{overflowX:'auto'}}>
                    <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.84rem'}}>
                      <thead>
                        <tr style={{borderBottom:'2px solid var(--glass-border)',background:'rgba(79,70,229,0.04)'}}>
                          <TH>NO</TH><TH>NAMA SISWA</TH><TH>PROGRAM</TH><TH>UNIT</TH>
                          <TH>TGL MULAI LES</TH><TH>JATUH TEMPO</TH><TH right>NOMINAL SPP</TH><TH>STATUS</TH>
                        </tr>
                      </thead>
                      <tbody>
                        {d1.map((a,idx) => {
                          const dj = a.detail_jadwal||{};
                          return (
                            <tr key={a.id} style={{borderBottom:'1px solid var(--glass-border)'}}
                              onMouseOver={e=>e.currentTarget.style.background='rgba(185,28,28,0.03)'}
                              onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                              <TD color="var(--text-secondary)">{(s1-1)*PER_PAGE+idx+1}</TD>
                              <TD bold>{a.nama_siswa}</TD>
                              <TD color="var(--primary)">{dj.nama_program||'-'}</TD>
                              <TD color="var(--text-secondary)">{dj.unit||'-'}</TD>
                              <TD nowrap>{fmt(a.tgl_mulai)}</TD>
                              <TD nowrap bold color="#b91c1c">{fmt(a._jt)}</TD>
                              <TD right bold>{a._nominal>0?formatRupiah(a._nominal):<span style={{color:'#d97706',fontWeight:400,fontSize:'0.78rem'}}>Belum diset</span>}</TD>
                              <td style={{padding:'0.7rem 0.75rem'}}>{statusBadge(a._status)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{borderTop:'2px solid var(--glass-border)',background:'rgba(185,28,28,0.04)',fontWeight:700}}>
                          <td colSpan={6} style={{padding:'0.65rem 0.75rem',fontSize:'0.82rem'}}>TOTAL ({tunggakan.length} siswa)</td>
                          <td style={{padding:'0.65rem 0.75rem',textAlign:'right',color:'#b91c1c'}}>{formatRupiah(tunggakan.reduce((s,a)=>s+a._nominal,0))}</td>
                          <td/>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <Pager cur={s1} total={tp1} onChange={setPage1} total_items={tunggakan.length} per_page={PER_PAGE}/>
                </>
              )}
            </div>
          )}

          {/* ── TAB 2: TAGIHAN BELUM JATUH TEMPO ── */}
          {tab === 'Tagihan Belum Jatuh Tempo' && (
            <div className="glass-card" style={{padding:'1.5rem'}}>
              {belumJT.length === 0
                ? <p style={{color:'var(--text-secondary)'}}>Tidak ada data.</p>
                : (
                <>
                  <div style={{overflowX:'auto'}}>
                    <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.84rem'}}>
                      <thead>
                        <tr style={{borderBottom:'2px solid var(--glass-border)',background:'rgba(79,70,229,0.04)'}}>
                          <TH>NO</TH><TH>NAMA SISWA</TH><TH>PROGRAM</TH><TH>UNIT</TH>
                          <TH>TGL MULAI LES</TH><TH>JATUH TEMPO</TH><TH>TGL BAYAR TERAKHIR</TH>
                          <TH right>NOMINAL SPP</TH><TH>STATUS</TH>
                        </tr>
                      </thead>
                      <tbody>
                        {d2.map((a,idx) => {
                          const dj = a.detail_jadwal||{};
                          return (
                            <tr key={a.id} style={{borderBottom:'1px solid var(--glass-border)'}}
                              onMouseOver={e=>e.currentTarget.style.background='rgba(79,70,229,0.03)'}
                              onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                              <TD color="var(--text-secondary)">{(s2-1)*PER_PAGE+idx+1}</TD>
                              <TD bold>{a.nama_siswa}</TD>
                              <TD color="var(--primary)">{dj.nama_program||'-'}</TD>
                              <TD color="var(--text-secondary)">{dj.unit||'-'}</TD>
                              <TD nowrap>{fmt(a.tgl_mulai)}</TD>
                              <TD nowrap>{fmt(a._jt)}</TD>
                              <TD nowrap color="var(--text-secondary)">{a._last?fmt(a._last.tanggal_bayar||a._last.created_at?.split('T')[0]):'-'}</TD>
                              <TD right bold>{a._nominal>0?formatRupiah(a._nominal):<span style={{color:'#d97706',fontWeight:400,fontSize:'0.78rem'}}>Belum diset</span>}</TD>
                              <td style={{padding:'0.7rem 0.75rem'}}>{statusBadge(a._status)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{borderTop:'2px solid var(--glass-border)',background:'rgba(79,70,229,0.04)',fontWeight:700}}>
                          <td colSpan={7} style={{padding:'0.65rem 0.75rem',fontSize:'0.82rem'}}>
                            TOTAL ({belumJT.length} siswa) — Lunas: {belumJT.filter(a=>a._status==='Lunas').length} | Belum Bayar: {belumJT.filter(a=>a._status==='Belum Bayar').length}
                          </td>
                          <td style={{padding:'0.65rem 0.75rem',textAlign:'right',color:'var(--primary)'}}>{formatRupiah(belumJT.reduce((s,a)=>s+a._nominal,0))}</td>
                          <td/>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <Pager cur={s2} total={tp2} onChange={setPage2} total_items={belumJT.length} per_page={PER_PAGE}/>
                </>
              )}
            </div>
          )}

          {/* ── TAB 3: REKAP BULANAN ── */}
          {tab === 'Rekap Bulanan' && (
            <div className="glass-card" style={{padding:'1.5rem'}}>
              {rekapBulanan.length === 0
                ? <p style={{color:'var(--text-secondary)'}}>Belum ada data transaksi.</p>
                : (
                <>
                  <div style={{overflowX:'auto'}}>
                    <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.84rem'}}>
                      <thead>
                        <tr style={{borderBottom:'2px solid var(--glass-border)',background:'rgba(79,70,229,0.04)'}}>
                          <TH>BULAN</TH><TH right>JML TRANSAKSI</TH>
                          <TH right>TUNAI</TH><TH right>TRANSFER</TH>
                          <TH right>DISKON</TH><TH right>TOTAL DITERIMA</TH>
                        </tr>
                      </thead>
                      <tbody>
                        {d3.map(r=>(
                          <tr key={r.key} style={{borderBottom:'1px solid var(--glass-border)'}}
                            onMouseOver={e=>e.currentTarget.style.background='rgba(79,70,229,0.03)'}
                            onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                            <TD bold nowrap>{BULAN[r.bulan]} {r.tahun}</TD>
                            <td style={{padding:'0.7rem 0.75rem',textAlign:'right'}}>
                              <span style={{background:'rgba(79,70,229,0.1)',color:'var(--primary)',padding:'0.15rem 0.6rem',borderRadius:'999px',fontWeight:700,fontSize:'0.8rem'}}>{r.jml}</span>
                            </td>
                            <TD right color="#047857">{r.tunai>0?formatRupiah(r.tunai):'-'}</TD>
                            <TD right color="#1d4ed8">{r.transfer>0?formatRupiah(r.transfer):'-'}</TD>
                            <TD right color="#b45309">{r.diskon>0?formatRupiah(r.diskon):'-'}</TD>
                            <TD right bold color="#047857">{formatRupiah(r.total)}</TD>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{borderTop:'2px solid var(--glass-border)',background:'rgba(79,70,229,0.04)',fontWeight:700}}>
                          <td style={{padding:'0.65rem 0.75rem',fontSize:'0.82rem'}}>TOTAL ({rekapBulanan.reduce((s,r)=>s+r.jml,0)} transaksi)</td>
                          <td/>
                          <td style={{padding:'0.65rem 0.75rem',textAlign:'right',color:'#047857'}}>{formatRupiah(rekapBulanan.reduce((s,r)=>s+r.tunai,0))}</td>
                          <td style={{padding:'0.65rem 0.75rem',textAlign:'right',color:'#1d4ed8'}}>{formatRupiah(rekapBulanan.reduce((s,r)=>s+r.transfer,0))}</td>
                          <td style={{padding:'0.65rem 0.75rem',textAlign:'right',color:'#b45309'}}>{formatRupiah(rekapBulanan.reduce((s,r)=>s+r.diskon,0))}</td>
                          <td style={{padding:'0.65rem 0.75rem',textAlign:'right',color:'#047857'}}>{formatRupiah(rekapBulanan.reduce((s,r)=>s+r.total,0))}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <Pager cur={s3} total={tp3} onChange={setPage3} total_items={rekapBulanan.length} per_page={PER_PAGE}/>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
