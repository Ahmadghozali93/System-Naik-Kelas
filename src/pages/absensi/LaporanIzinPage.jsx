import { useState, useEffect } from 'react';
import { FileBarChart, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const BULAN = ['', 'Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const JENIS_LABEL = { tukar_shift:'Tukar Shift', ganti_hari:'Ganti Hari', tanpa_pengganti:'Tanpa Pengganti' };
const fmt = (d) => d ? new Date(d+'T12:00:00').toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : '-';
const inp = { padding:'0.5rem 0.7rem', borderRadius:'0.45rem', border:'1px solid var(--glass-border)',
  background:'var(--surface-color)', fontFamily:'inherit', fontSize:'0.85rem' };

export default function LaporanIzinPage() {
  const [rows, setRows]     = useState([]);
  const [gurus, setGurus]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [tahun, setTahun]   = useState(new Date().getFullYear());
  const [bulan, setBulan]   = useState(new Date().getMonth() + 1);
  const [cari, setCari]     = useState('');

  useEffect(() => { load(); }, [tahun, bulan]);

  const load = async () => {
    setLoading(true);
    const awal  = `${tahun}-${String(bulan).padStart(2,'0')}-01`;
    const akhir = new Date(tahun, bulan, 0).toISOString().slice(0,10);
    const [rRes, gRes] = await Promise.all([
      // Angka yang sama persis dengan yang dipakai KPI
      supabase.from('v_izin_shift').select('*')
        .eq('status','Approved').gte('tanggal', awal).lte('tanggal', akhir)
        .order('tanggal', { ascending:false }),
      supabase.from('gurus').select('id, nama').eq('status','Aktif').order('nama'),
    ]);
    setRows(rRes.data || []);
    setGurus(gRes.data || []);
    setLoading(false);
  };

  const nama = (id) => gurus.find(g => g.id === id)?.nama || id;

  // Ringkasan per guru
  const perGuru = Object.values(rows.reduce((acc, r) => {
    const k = r.guru_id;
    acc[k] = acc[k] || { guru_id:k, total:0, tukar_shift:0, ganti_hari:0, tanpa_pengganti:0 };
    acc[k].total++; acc[k][r.jenis]++;
    return acc;
  }, {})).sort((a,b) => b.total - a.total);

  const tampil = perGuru.filter(p => !cari || nama(p.guru_id).toLowerCase().includes(cari.toLowerCase()));

  return (
    <div>
      <div style={{ marginBottom:'1.25rem' }}>
        <p style={{ fontSize:'0.72rem', color:'var(--text-secondary)', margin:0, textTransform:'uppercase', letterSpacing:'0.05em' }}>Absensi</p>
        <h1 style={{ fontSize:'1.6rem', fontWeight:700, margin:0 }}>Laporan Izin per Shift</h1>
        <p style={{ fontSize:'0.85rem', color:'var(--text-secondary)', margin:'0.25rem 0 0' }}>
          Menghitung <strong>jumlah shift</strong> yang diizinkan, bukan jumlah formulir. Hanya yang sudah disetujui.
          Angka ini sama dengan yang dipakai indikator KPI "Izin dalam 1 Bulan".
        </p>
      </div>

      <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap', marginBottom:'1rem' }}>
        <select style={inp} value={bulan} onChange={e=>setBulan(Number(e.target.value))}>
          {BULAN.slice(1).map((b,i)=><option key={i+1} value={i+1}>{b}</option>)}
        </select>
        <input type="number" style={{...inp, width:100}} value={tahun} onChange={e=>setTahun(Number(e.target.value))}/>
        <div style={{ position:'relative', flex:1, minWidth:180, maxWidth:280 }}>
          <Search size={14} style={{ position:'absolute', left:'0.6rem', top:'50%', transform:'translateY(-50%)', color:'var(--text-secondary)' }}/>
          <input style={{...inp, width:'100%', paddingLeft:'2rem', boxSizing:'border-box'}}
            placeholder="Cari nama guru..." value={cari} onChange={e=>setCari(e.target.value)}/>
        </div>
      </div>

      {/* Ringkasan per guru */}
      <div className="glass-card" style={{ padding:'1.25rem', marginBottom:'1rem' }}>
        <h2 style={{ fontSize:'1rem', fontWeight:700, margin:'0 0 0.85rem' }}>
          Ringkasan — {BULAN[bulan]} {tahun}
        </h2>
        {loading ? <p style={{ color:'var(--text-secondary)' }}>Memuat...</p>
        : tampil.length === 0 ? (
          <div style={{ textAlign:'center', padding:'2.5rem', color:'var(--text-secondary)' }}>
            <FileBarChart size={38} style={{ opacity:0.3, marginBottom:'0.65rem' }}/>
            <p>Tidak ada izin yang disetujui pada periode ini.</p>
          </div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.85rem' }}>
              <thead>
                <tr style={{ borderBottom:'2px solid var(--glass-border)', background:'rgba(79,70,229,0.04)' }}>
                  {['Guru','Total Shift','Tukar Shift','Ganti Hari','Tanpa Pengganti'].map(h=>(
                    <th key={h} style={{ padding:'0.6rem 0.7rem', textAlign:'left', fontWeight:700, fontSize:'0.72rem', color:'var(--text-secondary)', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tampil.map(p=>(
                  <tr key={p.guru_id} style={{ borderBottom:'1px solid var(--glass-border)' }}>
                    <td style={{ padding:'0.6rem 0.7rem', fontWeight:600 }}>{nama(p.guru_id)}</td>
                    <td style={{ padding:'0.6rem 0.7rem', fontWeight:800 }}>{p.total}</td>
                    <td style={{ padding:'0.6rem 0.7rem' }}>{p.tukar_shift || '—'}</td>
                    <td style={{ padding:'0.6rem 0.7rem' }}>{p.ganti_hari || '—'}</td>
                    <td style={{ padding:'0.6rem 0.7rem', color: p.tanpa_pengganti ? '#b91c1c' : 'inherit', fontWeight: p.tanpa_pengganti ? 700 : 400 }}>
                      {p.tanpa_pengganti || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Rincian */}
      <div className="glass-card" style={{ padding:'1.25rem' }}>
        <h2 style={{ fontSize:'1rem', fontWeight:700, margin:'0 0 0.85rem' }}>Rincian</h2>
        {rows.length === 0 ? <p style={{ color:'var(--text-secondary)', fontSize:'0.88rem' }}>Belum ada data.</p> : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.84rem' }}>
              <thead>
                <tr style={{ borderBottom:'2px solid var(--glass-border)', background:'rgba(79,70,229,0.04)' }}>
                  {['Tanggal','Guru','Jenis','Pengganti / Tgl Ganti','Alasan'].map(h=>(
                    <th key={h} style={{ padding:'0.6rem 0.7rem', textAlign:'left', fontWeight:700, fontSize:'0.72rem', color:'var(--text-secondary)', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.filter(r=>!cari || nama(r.guru_id).toLowerCase().includes(cari.toLowerCase())).map(r=>(
                  <tr key={r.id} style={{ borderBottom:'1px solid var(--glass-border)' }}>
                    <td style={{ padding:'0.6rem 0.7rem', whiteSpace:'nowrap' }}>{fmt(r.tanggal)}</td>
                    <td style={{ padding:'0.6rem 0.7rem', fontWeight:600 }}>{nama(r.guru_id)}</td>
                    <td style={{ padding:'0.6rem 0.7rem' }}>
                      <span style={{
                        background: r.jenis==='tanpa_pengganti' ? '#fee2e2' : '#f3f4f6',
                        color:      r.jenis==='tanpa_pengganti' ? '#b91c1c' : '#374151',
                        padding:'0.12rem 0.5rem', borderRadius:999, fontSize:'0.73rem', fontWeight:700, whiteSpace:'nowrap',
                      }}>{JENIS_LABEL[r.jenis] || r.jenis}</span>
                    </td>
                    <td style={{ padding:'0.6rem 0.7rem', color:'var(--text-secondary)' }}>
                      {r.jenis==='tukar_shift' ? nama(r.guru_pengganti_id)
                        : r.jenis==='ganti_hari' ? fmt(r.tanggal_pengganti) : '—'}
                    </td>
                    <td style={{ padding:'0.6rem 0.7rem', color:'var(--text-secondary)', fontSize:'0.8rem', maxWidth:260 }}>{r.alasan || '—'}</td>
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
