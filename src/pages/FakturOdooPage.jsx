import { useState, useEffect, useMemo } from 'react';
import { Search, FileSpreadsheet, Download } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatRupiah } from '../utils/formatRupiah';

const PER_PAGE = 50;
const fmt = (d) => d ? new Date(d).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : '-';

export default function FakturOdooPage() {
  const [transaksis, setTransaksis]       = useState([]);
  const [rekonsiliasis, setRekonsiliasis] = useState([]);
  const [loading, setLoading]             = useState(true);
  const [page, setPage]                   = useState(1);

  // Filter
  const [search, setSearch]       = useState('');
  const [filterUnit, setFilterUnit]   = useState('');
  const [filterProg, setFilterProg]   = useState('');
  const [filterMetode, setFilterMetode] = useState('');
  const [filterRek, setFilterRek]   = useState('');
  const [dateFrom, setDateFrom]     = useState('');
  const [dateTo, setDateTo]         = useState('');

  const fetchAll = async () => {
    setLoading(true);
    const [pRes, rRes] = await Promise.all([
      supabase
        .from('pembayaran_spp')
        .select('*')
        .eq('status', 'Terverifikasi')
        .order('tanggal_bayar', { ascending: false }),
      supabase
        .from('rekonsiliasi_spp')
        .select('*')
        .order('tanggal', { ascending: false }),
    ]);
    setTransaksis(pRes.data || []);
    setRekonsiliasis(rRes.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const allUnits    = useMemo(() => [...new Set(transaksis.map(p=>p.unit).filter(Boolean))].sort(), [transaksis]);
  const allPrograms = useMemo(() => [...new Set(transaksis.map(p=>p.nama_program).filter(Boolean))].sort(), [transaksis]);

  const filtered = useMemo(() => transaksis.filter(p => {
    const q   = search.toLowerCase();
    const tgl = p.tanggal_bayar || p.created_at?.split('T')[0];
    if (search      && !p.nama_siswa?.toLowerCase().includes(q) && !p.nama_program?.toLowerCase().includes(q)) return false;
    if (filterUnit  && p.unit         !== filterUnit)  return false;
    if (filterProg  && p.nama_program !== filterProg)  return false;
    if (filterMetode && p.metode      !== filterMetode) return false;
    if (filterRek   && p.rekonsiliasi_id !== filterRek) return false;
    if (dateFrom    && tgl < dateFrom) return false;
    if (dateTo      && tgl > dateTo)   return false;
    return true;
  }), [transaksis, search, filterUnit, filterProg, filterMetode, filterRek, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage   = Math.min(page, totalPages);
  const pageData   = filtered.slice((safePage-1)*PER_PAGE, safePage*PER_PAGE);

  const totalNominal = filtered.reduce((s,p) => s + (p.nominal||0), 0);
  const totalDiskon  = filtered.reduce((s,p) => s + (p.diskon||0),  0);

  const inp = { padding:'0.5rem 0.75rem', borderRadius:'0.5rem', border:'1px solid var(--glass-border)', background:'var(--surface-color)', fontFamily:'inherit', fontSize:'0.85rem' };

  const resetFilter = () => { setSearch(''); setFilterUnit(''); setFilterProg(''); setFilterMetode(''); setFilterRek(''); setDateFrom(''); setDateTo(''); setPage(1); };
  const hasFilter = search || filterUnit || filterProg || filterMetode || filterRek || dateFrom || dateTo;

  const exportCSV = () => {
    if (filtered.length === 0) { alert('Tidak ada data untuk diekspor.'); return; }

    const fmtCSV = (d) => d ? new Date(d).toLocaleDateString('id-ID') : '';
    const esc    = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

    const headers = [
      'No','Tgl Bayar','Jatuh Tempo','ID Setor','Nama Siswa',
      'Program','Unit','Nominal SPP','Diskon','Yang Dibayar','Metode','Dicatat Oleh','Catatan'
    ];

    const rows = filtered.map((p, i) => {
      const rek   = rekonsiliasis.find(r => r.id === p.rekonsiliasi_id);
      const gross = (p.nominal||0) + (p.diskon||0);
      return [
        i+1,
        fmtCSV(p.tanggal_bayar || p.created_at?.split('T')[0]),
        fmtCSV(p.jatuh_tempo),
        rek ? fmtCSV(rek.tanggal) : '',
        p.nama_siswa   || '',
        p.nama_program || '',
        p.unit         || '',
        gross,
        p.diskon  || 0,
        p.nominal || 0,
        p.metode  || '',
        p.dicatat_oleh || '',
        p.keterangan   || '',
      ].map(esc).join(',');
    });

    const csv  = '﻿' + [headers.map(esc).join(','), ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const tgl  = new Date().toISOString().split('T')[0];
    a.href     = url;
    a.download = `faktur-odoo-${tgl}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.5rem',flexWrap:'wrap',gap:'0.75rem'}}>
        <div>
          <p style={{fontSize:'0.78rem',color:'var(--text-secondary)',margin:0,textTransform:'uppercase',letterSpacing:'0.05em'}}>SPP</p>
          <h1 style={{fontSize:'1.6rem',fontWeight:700,margin:0,display:'flex',alignItems:'center',gap:'0.6rem'}}>
            <FileSpreadsheet size={26} style={{color:'var(--primary)'}}/>
            Faktur Odoo
          </h1>
        </div>
        <div style={{display:'flex',gap:'0.75rem',alignItems:'center',flexWrap:'wrap'}}>
          <div style={{background:'rgba(79,70,229,0.07)',border:'1px solid rgba(79,70,229,0.2)',borderRadius:'0.5rem',padding:'0.5rem 1rem',fontSize:'0.85rem'}}>
            <span style={{color:'var(--text-secondary)'}}>Total tersaring: </span>
            <strong style={{color:'#047857'}}>{formatRupiah(totalNominal)}</strong>
          </div>
        </div>
      </div>

      {/* Filter baris 1 */}
      <div style={{display:'flex',gap:'0.65rem',marginBottom:'0.65rem',flexWrap:'wrap',alignItems:'center'}}>
        <div style={{position:'relative',flex:1,minWidth:180}}>
          <Search size={15} style={{position:'absolute',left:'0.75rem',top:'50%',transform:'translateY(-50%)',color:'var(--text-secondary)'}}/>
          <input style={{...inp,paddingLeft:'2.2rem',width:'100%',boxSizing:'border-box'}}
            placeholder="Cari nama siswa / program..."
            value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/>
        </div>
        <select style={inp} value={filterUnit} onChange={e=>{setFilterUnit(e.target.value);setPage(1);}}>
          <option value="">Semua Unit</option>
          {allUnits.map(u=><option key={u} value={u}>{u}</option>)}
        </select>
        <select style={inp} value={filterProg} onChange={e=>{setFilterProg(e.target.value);setPage(1);}}>
          <option value="">Semua Program</option>
          {allPrograms.map(p=><option key={p} value={p}>{p}</option>)}
        </select>
        <select style={inp} value={filterMetode} onChange={e=>{setFilterMetode(e.target.value);setPage(1);}}>
          <option value="">Semua Metode</option>
          <option value="Tunai">Tunai</option>
          <option value="Transfer Bank">Transfer Bank</option>
        </select>
      </div>

      {/* Filter baris 2 */}
      <div style={{display:'flex',gap:'0.65rem',marginBottom:'1rem',flexWrap:'wrap',alignItems:'center'}}>
        <select style={inp} value={filterRek} onChange={e=>{setFilterRek(e.target.value);setPage(1);}}>
          <option value="">Semua Rekonsiliasi</option>
          {rekonsiliasis.map(r=>(
            <option key={r.id} value={r.id}>{fmt(r.tanggal)} — {r.id}</option>
          ))}
        </select>
        <div style={{display:'flex',alignItems:'center',gap:'0.5rem',fontSize:'0.85rem'}}>
          <span style={{color:'var(--text-secondary)',fontSize:'0.82rem'}}>Dari:</span>
          <input type="date" style={inp} value={dateFrom} onChange={e=>{setDateFrom(e.target.value);setPage(1);}}/>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:'0.5rem',fontSize:'0.85rem'}}>
          <span style={{color:'var(--text-secondary)',fontSize:'0.82rem'}}>Sampai:</span>
          <input type="date" style={inp} value={dateTo} onChange={e=>{setDateTo(e.target.value);setPage(1);}}/>
        </div>
        {hasFilter && (
          <button onClick={resetFilter}
            style={{background:'none',border:'1px solid var(--glass-border)',borderRadius:'0.4rem',padding:'0.45rem 0.85rem',cursor:'pointer',fontSize:'0.82rem',color:'var(--text-secondary)'}}>
            Reset Filter
          </button>
        )}
      </div>

      {/* Tabel */}
      <div className="glass-card" style={{padding:'1.5rem'}}>
        {loading ? <p style={{color:'var(--text-secondary)'}}>Memuat...</p>
          : filtered.length === 0 ? (
            <div style={{textAlign:'center',padding:'2.5rem',color:'var(--text-secondary)'}}>
              <FileSpreadsheet size={40} style={{opacity:0.25,marginBottom:'0.75rem'}}/>
              <p style={{margin:0}}>Belum ada transaksi terverifikasi{hasFilter ? ' yang cocok dengan filter.' : '.'}</p>
            </div>
          ) : (
          <>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.84rem'}}>
                <thead>
                  <tr style={{borderBottom:'2px solid var(--glass-border)',background:'rgba(79,70,229,0.04)'}}>
                    {[
                      {l:'NO',     a:'center', w:44},
                      {l:'TGL BAYAR',   a:'left'},
                      {l:'JATUH TEMPO', a:'left'},
                      {l:'REKONSILIASI',a:'left'},
                      {l:'NAMA SISWA',  a:'left'},
                      {l:'PROGRAM',     a:'left'},
                      {l:'UNIT',        a:'left'},
                      {l:'NOMINAL SPP', a:'right'},
                      {l:'DISKON',      a:'right'},
                      {l:'YG DIBAYAR',  a:'right'},
                      {l:'METODE',      a:'left'},
                      {l:'DICATAT OLEH',a:'left'},
                      {l:'CATATAN',     a:'left'},
                      {l:'',            a:'center'},
                    ].map(h=>(
                      <th key={h.l} style={{textAlign:h.a,width:h.w,padding:'0.65rem 0.75rem',fontWeight:700,fontSize:'0.72rem',color:'var(--text-secondary)',whiteSpace:'nowrap',letterSpacing:'0.06em'}}>{h.l}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageData.map((p,idx)=>{
                    const gross = (p.nominal||0) + (p.diskon||0);
                    const rek   = rekonsiliasis.find(r => r.id === p.rekonsiliasi_id);
                    return (
                      <tr key={p.id} style={{borderBottom:'1px solid var(--glass-border)'}}
                        onMouseOver={e=>e.currentTarget.style.background='rgba(79,70,229,0.03)'}
                        onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                        <td style={{padding:'0.75rem',textAlign:'center',color:'var(--text-secondary)',fontSize:'0.8rem'}}>{(safePage-1)*PER_PAGE+idx+1}</td>
                        <td style={{padding:'0.75rem',whiteSpace:'nowrap',fontWeight:600}}>{fmt(p.tanggal_bayar||p.created_at?.split('T')[0])}</td>
                        <td style={{padding:'0.75rem',whiteSpace:'nowrap',fontSize:'0.82rem',color:'#b45309',fontWeight:600}}>{fmt(p.jatuh_tempo)}</td>
                        <td style={{padding:'0.75rem',whiteSpace:'nowrap',fontSize:'0.78rem'}}>
                          {rek ? (
                            <span style={{display:'flex',flexDirection:'column',gap:'0.1rem'}}>
                              <span style={{fontWeight:600,color:'#1d4ed8'}}>{fmt(rek.tanggal)}</span>
                              <span style={{color:'var(--text-secondary)',fontSize:'0.72rem'}}>{p.rekonsiliasi_id}</span>
                            </span>
                          ) : <span style={{color:'var(--text-secondary)'}}>-</span>}
                        </td>
                        <td style={{padding:'0.75rem',fontWeight:500,whiteSpace:'nowrap'}}>{p.nama_siswa||'-'}</td>
                        <td style={{padding:'0.75rem',color:'var(--primary)',fontWeight:500}}>{p.nama_program||'-'}</td>
                        <td style={{padding:'0.75rem',color:'var(--text-secondary)'}}>{p.unit||'-'}</td>
                        <td style={{padding:'0.75rem',textAlign:'right'}}>{formatRupiah(gross)}</td>
                        <td style={{padding:'0.75rem',textAlign:'right',color:'#b45309'}}>{p.diskon>0?formatRupiah(p.diskon):'-'}</td>
                        <td style={{padding:'0.75rem',textAlign:'right',fontWeight:700,color:'#047857'}}>{formatRupiah(p.nominal||0)}</td>
                        <td style={{padding:'0.75rem'}}>
                          <span style={{
                            background: p.metode==='Tunai' ? 'rgba(5,150,105,0.1)' : 'rgba(59,130,246,0.1)',
                            color:      p.metode==='Tunai' ? '#047857' : '#1d4ed8',
                            padding:'0.15rem 0.55rem', borderRadius:'4px', fontSize:'0.78rem', fontWeight:600
                          }}>{p.metode||'-'}</span>
                        </td>
                        <td style={{padding:'0.75rem',fontSize:'0.82rem',fontWeight:500}}>{p.dicatat_oleh||'-'}</td>
                        <td style={{padding:'0.75rem',color:'var(--text-secondary)',fontSize:'0.82rem'}}>{p.keterangan||'-'}</td>
                        <td style={{padding:'0.75rem',textAlign:'center'}}>
                          <button
                            title="Buat Faktur Odoo"
                            style={{background:'#0f766e',color:'#fff',border:'none',borderRadius:'0.4rem',padding:'0.3rem 0.7rem',cursor:'pointer',fontSize:'0.78rem',fontWeight:600,whiteSpace:'nowrap'}}>
                            Buat Faktur
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{borderTop:'2px solid var(--glass-border)',background:'rgba(79,70,229,0.04)',fontWeight:700}}>
                    <td colSpan={7} style={{padding:'0.75rem',fontSize:'0.82rem'}}>
                      TOTAL ({filtered.length} transaksi)
                    </td>
                    <td style={{padding:'0.75rem',textAlign:'right'}}>{formatRupiah(totalNominal+totalDiskon)}</td>
                    <td style={{padding:'0.75rem',textAlign:'right',color:'#b45309'}}>{totalDiskon>0?formatRupiah(totalDiskon):'-'}</td>
                    <td style={{padding:'0.75rem',textAlign:'right',color:'#047857'}}>{formatRupiah(totalNominal)}</td>
                    <td colSpan={3}/>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Pager + info */}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:'0.85rem',flexWrap:'wrap',gap:'0.5rem'}}>
              <div style={{display:'flex',gap:'1.25rem',fontSize:'0.82rem',flexWrap:'wrap'}}>
                <span style={{color:'var(--text-secondary)'}}>{filtered.length} transaksi terverifikasi</span>
                <span style={{color:'#047857',fontWeight:600}}>
                  Tunai: {formatRupiah(filtered.filter(p=>p.metode==='Tunai').reduce((s,p)=>s+(p.nominal||0),0))}
                </span>
                <span style={{color:'#1d4ed8',fontWeight:600}}>
                  Transfer: {formatRupiah(filtered.filter(p=>p.metode==='Transfer Bank').reduce((s,p)=>s+(p.nominal||0),0))}
                </span>
              </div>
              {totalPages > 1 && (
                <div style={{display:'flex',gap:'0.35rem',alignItems:'center'}}>
                  <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={safePage<=1}
                    style={{padding:'0.3rem 0.65rem',borderRadius:'0.4rem',border:'1px solid var(--glass-border)',background:'var(--surface-color)',cursor:safePage<=1?'not-allowed':'pointer',opacity:safePage<=1?0.4:1}}>‹</button>
                  <span style={{fontSize:'0.82rem',color:'var(--text-secondary)'}}>Hal {safePage} / {totalPages}</span>
                  <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={safePage>=totalPages}
                    style={{padding:'0.3rem 0.65rem',borderRadius:'0.4rem',border:'1px solid var(--glass-border)',background:'var(--surface-color)',cursor:safePage>=totalPages?'not-allowed':'pointer',opacity:safePage>=totalPages?0.4:1}}>›</button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
