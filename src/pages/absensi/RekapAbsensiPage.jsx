import { useState, useEffect, useMemo } from 'react';
import { Download, BarChart2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/authStore';

const todayWIB  = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
const firstOfMonth = () => todayWIB().slice(0,8)+'01';
const fmtTgl    = (d)  => d ? new Date(d+'T12:00:00').toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : '-';
const fmtTime   = (ts) => ts ? new Date(ts).toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit'}) : '-';
const mntToStr  = (m)  => m != null ? `${Math.floor(m/60)}j${m%60>0?` ${m%60}m`:''}` : '-';

const inp = { padding:'0.55rem 0.75rem', borderRadius:'0.5rem', border:'1px solid var(--glass-border)', background:'var(--surface-color)', fontFamily:'inherit', fontSize:'0.88rem', width:'100%', boxSizing:'border-box' };

const STATUS_COLOR = { Hadir:'#047857', Telat:'#d97706', Izin:'#7c3aed', Sakit:'#b91c1c', Cuti:'#0891b2', Alpha:'#6b7280' };
const STATUS_LABEL = { Alpha:'Mangkir' };
const SBadge = ({s}) => <span style={{background:`${STATUS_COLOR[s]||'#6b7280'}1a`,color:STATUS_COLOR[s]||'#6b7280',padding:'0.15rem 0.55rem',borderRadius:999,fontSize:'0.75rem',fontWeight:700}}>{STATUS_LABEL[s]||s||'Mangkir'}</span>;
const SeragamBadge = ({v}) => {
  if (!v) return <span style={{color:'var(--text-secondary)',fontSize:'0.75rem'}}>—</span>;
  const ok = v==='Sesuai';
  return <span style={{background:ok?'#d1fae5':'#fee2e2',color:ok?'#047857':'#b91c1c',padding:'0.15rem 0.55rem',borderRadius:999,fontSize:'0.75rem',fontWeight:700}}>{v}</span>;
};

export default function RekapAbsensiPage() {
  const { user } = useAuth();
  const isAdmin  = ['Owner', 'Administrator', 'Supervisor'].includes(user?.role);

  const [records, setRecords]   = useState([]);
  const [units, setUnits]       = useState([]);
  const [gurus, setGurus]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [filterUnit, setFilterUnit]   = useState('');
  const [filterGuru, setFilterGuru]   = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [dateFrom, setDateFrom] = useState(firstOfMonth());
  const [dateTo, setDateTo]     = useState(todayWIB());

  useEffect(() => {
    supabase.from('units').select('*').eq('aktif',true).order('nama').then(r=>setUnits(r.data||[]));
    supabase.from('gurus').select('id,nama').eq('status','Aktif').order('nama').then(r=>setGurus(r.data||[]));
  }, []);

  const fetchRekap = async () => {
    setLoading(true);
    let q = supabase.from('attendances')
      .select('*, gurus!guru_id(nama), shift_schedules!shift_schedule_id(*, shifts(nama,jam_mulai,jam_selesai)), units!unit_id(nama)')
      .gte('tanggal', dateFrom).lte('tanggal', dateTo)
      .order('tanggal', { ascending: false });
    if (filterUnit) q = q.eq('unit_id', filterUnit);
    if (filterGuru) q = q.eq('guru_id', filterGuru);
    if (filterStatus) q = q.eq('status', filterStatus);
    const { data } = await q;
    setRecords(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchRekap(); }, [dateFrom, dateTo, filterUnit, filterGuru, filterStatus]);

  // Summary per karyawan
  const summary = useMemo(() => {
    const m = {};
    records.forEach(r => {
      const id = r.guru_id;
      if (!m[id]) m[id] = { nama: r.gurus?.nama||'-', Hadir:0, Telat:0, Izin:0, Sakit:0, Cuti:0, Alpha:0, totalMenit:0, seragamOk:0, seragamTidak:0 };
      const key = r.status || 'Alpha';
      if (m[id][key] !== undefined) m[id][key]++;
      if (r.durasi_menit) m[id].totalMenit += r.durasi_menit;
      if (r.seragam === 'Sesuai')       m[id].seragamOk++;
      if (r.seragam === 'Tidak Sesuai') m[id].seragamTidak++;
    });
    return Object.values(m).sort((a,b) => a.nama.localeCompare(b.nama));
  }, [records]);

  const exportCSV = () => {
    const header = ['Tanggal','Nama','Unit','Shift','Check-in','Check-out','Status','Durasi','Seragam','Catatan'];
    const rows = records.map(r => [
      r.tanggal,
      r.gurus?.nama||'-',
      r.units?.nama||'-',
      r.shift_schedules?.shifts?.nama||'-',
      r.check_in ? new Date(r.check_in).toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta'}) : '-',
      r.check_out ? new Date(r.check_out).toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta'}) : '-',
      STATUS_LABEL[r.status]||r.status||'Mangkir',
      r.durasi_menit != null ? mntToStr(r.durasi_menit) : '-',
      r.seragam||'-',
      `"${(r.catatan||'').replace(/"/g,'""')}"`,
    ]);
    const csv = [header, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `rekap_absensi_${dateFrom}_${dateTo}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div style={{ marginBottom:'1.5rem' }}>
        <p style={{ fontSize:'0.78rem', color:'var(--text-secondary)', margin:0, textTransform:'uppercase', letterSpacing:'0.05em' }}>Absensi</p>
        <h1 style={{ fontSize:'1.6rem', fontWeight:700, margin:0 }}>Rekap Absensi</h1>
      </div>

      {/* Filter bar */}
      <div className="glass-card" style={{ padding:'1rem 1.25rem', marginBottom:'1rem', display:'flex', flexWrap:'wrap', gap:'0.65rem', alignItems:'flex-end' }}>
        <div>
          <label style={{ fontSize:'0.78rem', fontWeight:600, display:'block', marginBottom:'0.25rem' }}>Dari</label>
          <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{ ...inp, width:140 }}/>
        </div>
        <div>
          <label style={{ fontSize:'0.78rem', fontWeight:600, display:'block', marginBottom:'0.25rem' }}>Sampai</label>
          <input type="date" value={dateTo} min={dateFrom} onChange={e=>setDateTo(e.target.value)} style={{ ...inp, width:140 }}/>
        </div>
        {isAdmin && (
          <div>
            <label style={{ fontSize:'0.78rem', fontWeight:600, display:'block', marginBottom:'0.25rem' }}>Unit</label>
            <select value={filterUnit} onChange={e=>setFilterUnit(e.target.value)} style={{ ...inp, width:'auto' }}>
              <option value="">Semua Unit</option>
              {units.map(u=><option key={u.id} value={u.id}>{u.nama}</option>)}
            </select>
          </div>
        )}
        {isAdmin && (
          <div>
            <label style={{ fontSize:'0.78rem', fontWeight:600, display:'block', marginBottom:'0.25rem' }}>Karyawan</label>
            <select value={filterGuru} onChange={e=>setFilterGuru(e.target.value)} style={{ ...inp, width:'auto' }}>
              <option value="">Semua Karyawan</option>
              {gurus.map(g=><option key={g.id} value={g.id}>{g.nama}</option>)}
            </select>
          </div>
        )}
        <div>
          <label style={{ fontSize:'0.78rem', fontWeight:600, display:'block', marginBottom:'0.25rem' }}>Status</label>
          <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{ ...inp, width:'auto' }}>
            <option value="">Semua Status</option>
            {[['Hadir','Hadir'],['Telat','Telat'],['Izin','Izin'],['Sakit','Sakit'],['Cuti','Cuti'],['Alpha','Mangkir']].map(([v,l])=><option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <button className="btn btn-primary" style={{ display:'flex', alignItems:'center', gap:'0.35rem' }} onClick={exportCSV}>
          <Download size={15}/> Export CSV
        </button>
      </div>

      {/* Summary cards */}
      {isAdmin && summary.length > 0 && (
        <div className="glass-card" style={{ padding:'1rem 1.25rem', marginBottom:'1rem' }}>
          <div style={{ fontWeight:700, fontSize:'0.85rem', marginBottom:'0.75rem', display:'flex', alignItems:'center', gap:'0.5rem' }}>
            <BarChart2 size={16}/> Ringkasan per Karyawan
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.82rem' }}>
              <thead>
                <tr style={{ borderBottom:'2px solid var(--glass-border)' }}>
                  {['Nama','Hadir','Telat','Izin','Sakit','Cuti','Mangkir','Total Jam','Seragam ✓','Seragam ✗'].map(h=>(
                    <th key={h} style={{ padding:'0.45rem 0.65rem', textAlign:h==='Nama'?'left':'center', fontWeight:700, fontSize:'0.72rem', color:'var(--text-secondary)', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summary.map((s,i) => (
                  <tr key={i} style={{ borderBottom:'1px solid var(--glass-border)' }}>
                    <td style={{ padding:'0.55rem 0.65rem', fontWeight:600 }}>{s.nama}</td>
                    {['Hadir','Telat','Izin','Sakit','Cuti','Alpha'].map(k => (
                      <td key={k} style={{ padding:'0.55rem 0.65rem', textAlign:'center', fontWeight: s[k]>0?700:400, color: s[k]>0?(STATUS_COLOR[k]||'inherit'):'var(--text-secondary)' }}>{s[k] || '-'}</td>
                    ))}
                    <td style={{ padding:'0.55rem 0.65rem', textAlign:'center', fontWeight:700, color:'var(--primary)' }}>{mntToStr(s.totalMenit)}</td>
                    <td style={{ padding:'0.55rem 0.65rem', textAlign:'center', fontWeight:s.seragamOk>0?700:400, color:s.seragamOk>0?'#047857':'var(--text-secondary)' }}>{s.seragamOk||'-'}</td>
                    <td style={{ padding:'0.55rem 0.65rem', textAlign:'center', fontWeight:s.seragamTidak>0?700:400, color:s.seragamTidak>0?'#b91c1c':'var(--text-secondary)' }}>{s.seragamTidak||'-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail table */}
      <div className="glass-card" style={{ padding:'1.5rem' }}>
        <div style={{ fontWeight:700, fontSize:'0.85rem', marginBottom:'0.75rem' }}>
          Detail Absensi {loading ? '— Memuat...' : `(${records.length} record)`}
        </div>
        {!loading && records.length === 0 ? (
          <div style={{ textAlign:'center', padding:'3rem', color:'var(--text-secondary)' }}>
            <BarChart2 size={40} style={{ opacity:0.3, marginBottom:'0.75rem' }} />
            <p>Tidak ada data untuk filter yang dipilih.</p>
          </div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.82rem' }}>
              <thead>
                <tr style={{ borderBottom:'2px solid var(--glass-border)', background:'rgba(79,70,229,0.04)' }}>
                  {['Tanggal','Nama','Unit','Shift','Check-in','Check-out','Durasi','Status','Seragam','Catatan'].map(h=>(
                    <th key={h} style={{ padding:'0.65rem 0.75rem', textAlign:'left', fontWeight:700, fontSize:'0.72rem', color:'var(--text-secondary)', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((r,i) => (
                  <tr key={r.id || i} style={{ borderBottom:'1px solid var(--glass-border)' }}
                    onMouseOver={e=>e.currentTarget.style.background='rgba(79,70,229,0.03)'}
                    onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                    <td style={{ padding:'0.7rem 0.75rem', whiteSpace:'nowrap' }}>{fmtTgl(r.tanggal)}</td>
                    <td style={{ padding:'0.7rem 0.75rem', fontWeight:600 }}>{r.gurus?.nama||'-'}</td>
                    <td style={{ padding:'0.7rem 0.75rem', fontSize:'0.8rem', color:'var(--text-secondary)' }}>{r.units?.nama||'-'}</td>
                    <td style={{ padding:'0.7rem 0.75rem', fontSize:'0.8rem' }}>{r.shift_schedules?.shifts?.nama||'-'}</td>
                    <td style={{ padding:'0.7rem 0.75rem', fontWeight:600, color:'var(--primary)' }}>{fmtTime(r.check_in)}</td>
                    <td style={{ padding:'0.7rem 0.75rem' }}>{fmtTime(r.check_out)}</td>
                    <td style={{ padding:'0.7rem 0.75rem', color:'var(--text-secondary)' }}>{mntToStr(r.durasi_menit)}</td>
                    <td style={{ padding:'0.7rem 0.75rem' }}><SBadge s={r.status}/></td>
                    <td style={{ padding:'0.7rem 0.75rem' }}><SeragamBadge v={r.seragam}/></td>
                    <td style={{ padding:'0.7rem 0.75rem', fontSize:'0.8rem', color:'var(--text-secondary)', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={r.catatan||''}>{r.catatan||'—'}</td>
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
