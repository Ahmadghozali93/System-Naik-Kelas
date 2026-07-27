import { useState } from 'react';
import { Download, FileSpreadsheet, Search } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabase';
import { formatRupiah } from '../../utils/formatRupiah';

const BULAN = ['', 'Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const STATUS_LABEL = { draft:'Draft', terkunci:'Terkunci', dibayar:'Dibayar' };

// Pengelompokan status absensi → kolom rekap
const izinSet  = new Set(['Izin', 'Sakit', 'Cuti']);
const alphaSet = new Set(['Alpha', 'Izin Tanpa Pengganti']);

const inp = { padding:'0.5rem 0.7rem', borderRadius:'0.5rem', border:'1px solid var(--glass-border)',
  background:'var(--surface-color)', fontFamily:'inherit', fontSize:'0.88rem', color:'var(--text-primary)' };
const lbl = { fontSize:'0.72rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em', color:'var(--text-secondary)', display:'block', marginBottom:'0.25rem' };

export default function RekapGajiPage() {
  const now = new Date();
  const [filter, setFilter] = useState({ bulan: now.getMonth()+1, tahun: now.getFullYear() });
  const [loading, setLoading] = useState(false);
  const [sudahCari, setSudahCari] = useState(false);

  // Hasil terhitung
  const [colPend, setColPend] = useState([]);   // nama komponen pendapatan
  const [colPot, setColPot]   = useState([]);   // nama komponen potongan
  const [rows, setRows]       = useState([]);   // baris per karyawan

  const tampilkan = async () => {
    setLoading(true); setSudahCari(true);
    setColPend([]); setColPot([]); setRows([]);

    // 1. Periode bulan ini. Sejak 0020 periode bersifat global — satu per
    //    bulan untuk seluruh perusahaan, tidak lagi dipecah per cabang.
    const { data: periodes } = await supabase.from('periode_payroll')
      .select('id, status')
      .eq('tahun', filter.tahun).eq('bulan', filter.bulan);

    if (!periodes || periodes.length === 0) { setLoading(false); return; }
    const perIds = periodes.map(p => p.id);

    // 2. Slip semua karyawan pada periode-periode itu
    const { data: slips } = await supabase.from('slip_gaji')
      .select('id, guru_id, periode_payroll_id, snapshot_karyawan, total_pendapatan, total_potongan, gaji_bersih, status, gurus:guru_id(nama)')
      .in('periode_payroll_id', perIds);

    if (!slips || slips.length === 0) { setLoading(false); return; }
    const slipIds = slips.map(s => s.id);

    // 3. Detail komponen → pivot
    const { data: detail } = await supabase.from('slip_gaji_detail')
      .select('slip_gaji_id, nama_komponen, kategori, nominal, urutan_tampil')
      .in('slip_gaji_id', slipIds);

    // Kumpulkan kolom komponen yang benar-benar muncul (urut urutan_tampil)
    const urutPend = new Map(), urutPot = new Map();
    const pivot = {};   // slipId → { nama_komponen: nominal }
    (detail || []).forEach(d => {
      (d.kategori === 'pendapatan' ? urutPend : urutPot)
        .set(d.nama_komponen, Math.min(d.urutan_tampil ?? 999, (d.kategori==='pendapatan'?urutPend:urutPot).get(d.nama_komponen) ?? 999));
      (pivot[d.slip_gaji_id] ||= {})[d.nama_komponen] =
        (pivot[d.slip_gaji_id]?.[d.nama_komponen] || 0) + Number(d.nominal);
    });
    const urutkan = (m) => [...m.entries()].sort((a,b) => a[1]-b[1] || a[0].localeCompare(b[0])).map(e => e[0]);
    const cPend = urutkan(urutPend);
    const cPot  = urutkan(urutPot);

    // 4. Rekap absensi periode ini
    const awal  = `${filter.tahun}-${String(filter.bulan).padStart(2,'0')}-01`;
    const akhir = `${filter.tahun}-${String(filter.bulan).padStart(2,'0')}-${String(new Date(filter.tahun, filter.bulan, 0).getDate()).padStart(2,'0')}`;
    const guruIds = [...new Set(slips.map(s => s.guru_id))];
    const { data: absen } = await supabase.from('attendances')
      .select('guru_id, status').in('guru_id', guruIds)
      .gte('tanggal', awal).lte('tanggal', akhir);
    const absMap = {};   // guru_id → {hadir,telat,izin,alpha}
    (absen || []).forEach(a => {
      const m = (absMap[a.guru_id] ||= { hadir:0, telat:0, izin:0, alpha:0 });
      if (a.status === 'Hadir') m.hadir++;
      else if (a.status === 'Telat') m.telat++;
      else if (izinSet.has(a.status)) m.izin++;
      else if (alphaSet.has(a.status)) m.alpha++;
    });

    // 5. Susun baris
    const baris = slips.map(s => {
      const a = absMap[s.guru_id] || { hadir:0, telat:0, izin:0, alpha:0 };
      return {
        nama: s.gurus?.nama || s.snapshot_karyawan?.nama || '-',
        jabatan: s.snapshot_karyawan?.jabatan || '-',
        pend: cPend.map(k => pivot[s.id]?.[k] || 0),
        pot:  cPot.map(k => pivot[s.id]?.[k] || 0),
        totalPend: Number(s.total_pendapatan),
        totalPot:  Number(s.total_potongan),
        bersih:    Number(s.gaji_bersih),
        ...a,
        status: STATUS_LABEL[s.status] || s.status,
      };
    }).sort((x, y) => x.nama.localeCompare(y.nama));

    setColPend(cPend); setColPot(cPot); setRows(baris);
    setLoading(false);
  };

  // Total per kolom angka
  const totalKol = (getter) => rows.reduce((a, r) => a + getter(r), 0);

  const exportExcel = () => {
    const header = ['No','Nama','Jabatan', ...colPend, 'Total Pendapatan',
      ...colPot, 'Total Potongan', 'Gaji Bersih', 'Hadir','Telat','Izin','Alpha','Status'];
    const body = rows.map((r, i) => [
      i+1, r.nama, r.jabatan, ...r.pend, r.totalPend,
      ...r.pot, r.totalPot, r.bersih, r.hadir, r.telat, r.izin, r.alpha, r.status,
    ]);
    const total = ['', 'TOTAL', '',
      ...colPend.map((_, i) => totalKol(r => r.pend[i])), totalKol(r => r.totalPend),
      ...colPot.map((_, i) => totalKol(r => r.pot[i])),  totalKol(r => r.totalPot),
      totalKol(r => r.bersih),
      totalKol(r => r.hadir), totalKol(r => r.telat), totalKol(r => r.izin), totalKol(r => r.alpha), '',
    ];
    const ws = XLSX.utils.aoa_to_sheet([header, ...body, total]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rekap Gaji');
    XLSX.writeFile(wb, `rekap_gaji_${BULAN[filter.bulan]}_${filter.tahun}.xlsx`);
  };

  const money = { padding:'0.5rem 0.6rem', textAlign:'right', whiteSpace:'nowrap', borderBottom:'1px solid var(--glass-border)' };
  const numc  = { padding:'0.5rem 0.6rem', textAlign:'center', borderBottom:'1px solid var(--glass-border)' };
  const txt   = { padding:'0.5rem 0.6rem', borderBottom:'1px solid var(--glass-border)', whiteSpace:'nowrap' };
  const th    = { padding:'0.55rem 0.6rem', fontSize:'0.7rem', fontWeight:700, color:'var(--text-secondary)', whiteSpace:'nowrap', textAlign:'left', borderBottom:'2px solid var(--glass-border)' };
  const thR   = { ...th, textAlign:'right' };
  const thC   = { ...th, textAlign:'center' };

  return (
    <div>
      <div style={{ marginBottom:'1.25rem' }}>
        <p style={{ fontSize:'0.72rem', color:'var(--text-secondary)', margin:0, textTransform:'uppercase', letterSpacing:'0.05em' }}>Payroll</p>
        <h1 style={{ fontSize:'1.6rem', fontWeight:700, margin:0 }}>Rekap Gaji</h1>
        <p style={{ fontSize:'0.85rem', color:'var(--text-secondary)', margin:'0.25rem 0 0' }}>
          Rekap gaji seluruh karyawan per periode, per komponen. Bisa diekspor ke Excel.
        </p>
      </div>

      {/* Filter */}
      <div className="glass-card" style={{ padding:'1rem 1.25rem', marginBottom:'1rem', display:'flex', gap:'0.85rem', alignItems:'flex-end', flexWrap:'wrap' }}>
        <div>
          <label style={lbl}>Bulan</label>
          <select style={inp} value={filter.bulan} onChange={e=>setFilter(f=>({...f, bulan:Number(e.target.value)}))}>
            {BULAN.slice(1).map((b,i)=><option key={i+1} value={i+1}>{b}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Tahun</label>
          <input type="number" style={{...inp, width:100}} value={filter.tahun}
            onChange={e=>setFilter(f=>({...f, tahun:Number(e.target.value)}))} />
        </div>
        <button className="btn btn-primary" onClick={tampilkan} disabled={loading}
          style={{ display:'flex', alignItems:'center', gap:'0.4rem' }}>
          <Search size={15}/> {loading ? 'Memuat...' : 'Tampilkan'}
        </button>
        {rows.length > 0 && (
          <button className="btn" onClick={exportExcel} style={{ display:'flex', alignItems:'center', gap:'0.4rem', marginLeft:'auto' }}>
            <FileSpreadsheet size={15}/> Export Excel
          </button>
        )}
      </div>

      {/* Tabel */}
      {loading ? (
        <p style={{ color:'var(--text-secondary)' }}>Memuat...</p>
      ) : !sudahCari ? (
        <div className="glass-card" style={{ padding:'2.5rem', textAlign:'center', color:'var(--text-secondary)' }}>
          <Download size={34} style={{ opacity:0.3, marginBottom:'0.6rem' }} />
          <p style={{ margin:0 }}>Pilih periode lalu klik <strong>Tampilkan</strong>.</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="glass-card" style={{ padding:'2.5rem', textAlign:'center', color:'var(--text-secondary)' }}>
          <p style={{ margin:0 }}>Belum ada data untuk {BULAN[filter.bulan]} {filter.tahun}.</p>
          <p style={{ margin:'0.35rem 0 0', fontSize:'0.82rem' }}>Hitung dulu di <strong>Periode Penggajian</strong>.</p>
        </div>
      ) : (
        <div className="glass-card" style={{ padding:'0.5rem' }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ borderCollapse:'collapse', fontSize:'0.8rem', width:'100%' }}>
              <thead>
                <tr>
                  <th style={th}>No</th>
                  <th style={th}>Nama</th>
                  <th style={th}>Jabatan</th>
                  {colPend.map(k => <th key={k} style={thR}>{k}</th>)}
                  <th style={{...thR, background:'rgba(4,120,87,0.06)'}}>Total Pendapatan</th>
                  {colPot.map(k => <th key={k} style={thR}>{k}</th>)}
                  <th style={{...thR, background:'rgba(185,28,28,0.06)'}}>Total Potongan</th>
                  <th style={{...thR, background:'rgba(4,120,87,0.1)'}}>Gaji Bersih</th>
                  <th style={thC}>Hadir</th>
                  <th style={thC}>Telat</th>
                  <th style={thC}>Izin</th>
                  <th style={thC}>Alpha</th>
                  <th style={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td style={{...txt, color:'var(--text-secondary)'}}>{i+1}</td>
                    <td style={{...txt, fontWeight:600}}>{r.nama}</td>
                    <td style={{...txt, color:'var(--text-secondary)'}}>{r.jabatan}</td>
                    {r.pend.map((v, j) => <td key={j} style={money}>{v ? formatRupiah(v) : '−'}</td>)}
                    <td style={{...money, fontWeight:700, background:'rgba(4,120,87,0.06)'}}>{formatRupiah(r.totalPend)}</td>
                    {r.pot.map((v, j) => <td key={j} style={money}>{v ? formatRupiah(v) : '−'}</td>)}
                    <td style={{...money, fontWeight:700, background:'rgba(185,28,28,0.06)'}}>{formatRupiah(r.totalPot)}</td>
                    <td style={{...money, fontWeight:800, color:'#047857', background:'rgba(4,120,87,0.1)'}}>{formatRupiah(r.bersih)}</td>
                    <td style={numc}>{r.hadir}</td>
                    <td style={numc}>{r.telat}</td>
                    <td style={numc}>{r.izin}</td>
                    <td style={{...numc, color: r.alpha ? '#b91c1c' : 'inherit', fontWeight: r.alpha ? 700 : 400}}>{r.alpha}</td>
                    <td style={txt}>{r.status}</td>
                  </tr>
                ))}
                {/* Baris total */}
                <tr style={{ background:'rgba(79,70,229,0.05)', fontWeight:700 }}>
                  <td style={txt} colSpan={3}>TOTAL ({rows.length} karyawan)</td>
                  {colPend.map((_, j) => <td key={j} style={money}>{formatRupiah(totalKol(r => r.pend[j]))}</td>)}
                  <td style={{...money, background:'rgba(4,120,87,0.06)'}}>{formatRupiah(totalKol(r => r.totalPend))}</td>
                  {colPot.map((_, j) => <td key={j} style={money}>{formatRupiah(totalKol(r => r.pot[j]))}</td>)}
                  <td style={{...money, background:'rgba(185,28,28,0.06)'}}>{formatRupiah(totalKol(r => r.totalPot))}</td>
                  <td style={{...money, color:'#047857', background:'rgba(4,120,87,0.1)'}}>{formatRupiah(totalKol(r => r.bersih))}</td>
                  <td style={numc}>{totalKol(r => r.hadir)}</td>
                  <td style={numc}>{totalKol(r => r.telat)}</td>
                  <td style={numc}>{totalKol(r => r.izin)}</td>
                  <td style={numc}>{totalKol(r => r.alpha)}</td>
                  <td style={txt}></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
