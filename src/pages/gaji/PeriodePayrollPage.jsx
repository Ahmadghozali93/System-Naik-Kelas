import { useState, useEffect } from 'react';
import { Plus, X, Calculator, Lock, BadgeCheck, AlertTriangle, FileText, Printer, Eye, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/authStore';
import { formatRupiah } from '../../utils/formatRupiah';
import SlipGajiPrintable from '../../components/gaji/SlipGajiPrintable';
import { dariSlipTersimpan } from '../../utils/slipModel';

const BULAN = ['', 'Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const inp = { padding:'0.55rem 0.75rem', borderRadius:'0.5rem', border:'1px solid var(--glass-border)',
  background:'var(--surface-color)', fontFamily:'inherit', fontSize:'0.88rem', width:'100%', boxSizing:'border-box' };
const lbl = { fontSize:'0.8rem', fontWeight:600, display:'block', marginBottom:'0.3rem' };
const fmtTgl = (d) => d ? new Date(d+'T12:00:00').toLocaleDateString('id-ID',{day:'2-digit',month:'short'}) : '-';

const STATUS_CFG = {
  draft:    { label:'Draft',    bg:'#f3f4f6', color:'#374151' },
  terkunci: { label:'Terkunci', bg:'#fef3c7', color:'#92400e' },
  dibayar:  { label:'Dibayar',  bg:'#d1fae5', color:'#047857' },
};

export default function PeriodePayrollPage() {
  const { user } = useAuth();
  const [periode, setPeriode] = useState([]);
  const [loading, setLoading] = useState(true);

  const [aktif, setAktif]   = useState(null);   // periode yang dibuka
  const [slips, setSlips]   = useState([]);
  const [hitung, setHitung] = useState(false);

  const [buatModal, setBuatModal] = useState(false);
  const [buatForm, setBuatForm]   = useState({ tahun:new Date().getFullYear(), bulan:new Date().getMonth()+1 });

  const [slipAktif, setSlipAktif] = useState(null);   // slip yang dilihat rinciannya
  const [detail, setDetail]       = useState([]);
  const [rincianJurnal, setRincianJurnal] = useState(null);
  const [rincianNama, setRincianNama]     = useState('');   // nama komponen yang dibuka
  const [rincianFilter, setRincianFilter] = useState('semua');
  const [siswaNama, setSiswaNama]         = useState({});   // siswa_id → nama

  const [manualModal, setManualModal] = useState(false);
  const [manualForm, setManualForm]   = useState({ nama:'', kategori:'pendapatan', nominal:'', alasan:'' });

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    const pRes = await supabase.from('periode_payroll').select('*')
      .order('tahun',{ascending:false}).order('bulan',{ascending:false});
    setPeriode(pRes.data || []);
    setLoading(false);
  };

  const bukaPeriode = async (p) => {
    setAktif(p); setSlipAktif(null); setDetail([]);
    const { data } = await supabase.from('slip_gaji')
      .select('*, gurus:guru_id(nama, role)')
      .eq('periode_payroll_id', p.id)
      .order('gaji_bersih', { ascending:false });
    setSlips(data || []);
  };

  const buatPeriode = async (e) => {
    e.preventDefault();
    const { error } = await supabase.from('periode_payroll').insert({
      tahun: Number(buatForm.tahun), bulan: Number(buatForm.bulan), status:'draft',
    });
    if (error) {
      if (error.code === '23505') return alert('Periode untuk bulan itu sudah ada.');
      return alert('Gagal: ' + error.message);
    }
    setBuatModal(false); loadAll();
  };

  const hitungSemua = async () => {
    if (!aktif) return;
    if (!window.confirm(`Hitung ulang gaji semua karyawan untuk ${BULAN[aktif.bulan]} ${aktif.tahun}?\n\nSlip lama pada periode ini akan ditimpa.`)) return;
    setHitung(true);
    const { error } = await supabase.rpc('hitung_periode', { p_periode_id: aktif.id });
    setHitung(false);
    if (error) return alert('Perhitungan dihentikan:\n\n' + error.message);
    bukaPeriode(aktif);
  };

  const lihatSlip = async (s) => {
    setSlipAktif(s); setRincianJurnal(null);
    const { data } = await supabase.from('slip_gaji_detail')
      .select('*').eq('slip_gaji_id', s.id).order('urutan_tampil');
    setDetail(data || []);
  };

  // Rincian jurnal: mana yang dibayar, mana tidak & alasannya
  const lihatRincianJurnal = async (d) => {
    if (!slipAktif || !aktif) return;
    const { data: komp } = await supabase.from('komponen_gaji')
      .select('konfigurasi').eq('id', d.komponen_gaji_id).maybeSingle();
    const awal  = `${aktif.tahun}-${String(aktif.bulan).padStart(2,'0')}-01`;
    const akhir = new Date(aktif.tahun, aktif.bulan, 0).toISOString().slice(0,10);
    const { data, error } = await supabase.rpc('rincian_jurnal_fee', {
      p_guru_id: slipAktif.guru_id, p_awal: awal, p_akhir: akhir, p_cfg: komp?.konfigurasi || {},
    });
    if (error) return alert('Gagal ambil rincian: ' + error.message);
    setRincianJurnal(data || []);
    setRincianFilter('semua');
    setRincianNama(d.nama_komponen);

    // Jurnal hanya menyimpan siswa_id. Nama dicari terpisah supaya tabel dan
    // file ekspor terbaca manusia — id mentah tidak berguna saat rincian ini
    // dipakai menjelaskan potongan ke guru yang bersangkutan.
    const ids = [...new Set((data || []).map(r => r.siswa_id).filter(Boolean))];
    if (ids.length) {
      const { data: sw } = await supabase.from('siswa').select('id, nama').in('id', ids);
      setSiswaNama(Object.fromEntries((sw || []).map(s => [s.id, s.nama])));
    } else {
      setSiswaNama({});
    }
  };

  // ── Penyaringan & ekspor rincian jurnal ──
  // Duplikat dikenali dari alasan yang ditulis rincian_jurnal_fee: jurnal
  // dengan siswa + tanggal + program sama hanya dibayar sekali.
  const isDuplikat = (r) => (r.alasan || '').startsWith('Duplikat');
  const SARINGAN = {
    semua:        { label:'Semua',          uji: () => true },
    duplikat:     { label:'Duplikat',       uji: isDuplikat },
    tidak_dibayar:{ label:'Tidak dibayar',  uji: (r) => !r.dibayar },
    dibayar:      { label:'Dibayar',        uji: (r) => r.dibayar },
  };
  const rincianTampil = (rincianJurnal || []).filter(SARINGAN[rincianFilter].uji);
  const namaSiswa = (r) => siswaNama[r.siswa_id] || r.siswa_id || '-';

  const exportRincian = () => {
    const header = ['Tanggal','Program','ID Siswa','Nama Siswa','Dibayar','Tarif','Keterangan'];
    const body = rincianTampil.map(r => [
      r.tanggal, r.program || '', r.siswa_id || '', namaSiswa(r),
      r.dibayar ? 'Ya' : 'Tidak', r.dibayar ? Number(r.tarif) : 0, r.alasan || '',
    ]);
    const total = ['', '', '', `TOTAL (${rincianTampil.length} jurnal)`, '',
      rincianTampil.reduce((a, r) => a + (r.dibayar ? Number(r.tarif) : 0), 0), ''];
    const ws = XLSX.utils.aoa_to_sheet([header, ...body, total]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rincian Jurnal');
    const bersih = (s) => (s || '').replace(/[^a-zA-Z0-9]+/g, '_');
    XLSX.writeFile(wb, `rincian_jurnal_${bersih(slipAktif?.gurus?.nama)}_${BULAN[aktif.bulan]}_${aktif.tahun}`
      + (rincianFilter === 'semua' ? '' : `_${rincianFilter}`) + '.xlsx');
  };

  const tambahManual = async (e) => {
    e.preventDefault();
    if (!manualForm.alasan.trim()) return alert('Alasan wajib diisi untuk penyesuaian manual.');
    const { error } = await supabase.from('slip_gaji_detail').insert({
      slip_gaji_id: slipAktif.id, komponen_gaji_id: null,
      nama_komponen: manualForm.nama.trim(), kategori: manualForm.kategori,
      urutan_tampil: 999, nominal: Number(manualForm.nominal) || 0,
      keterangan_hitung: 'Penyesuaian manual', sumber: 'manual', alasan: manualForm.alasan.trim(),
    });
    if (error) return alert('Gagal: ' + error.message);

    // Hitung ulang total slip
    const { data: semua } = await supabase.from('slip_gaji_detail')
      .select('kategori, nominal').eq('slip_gaji_id', slipAktif.id);
    const pend = (semua||[]).filter(x=>x.kategori==='pendapatan').reduce((a,b)=>a+Number(b.nominal),0);
    const pot  = (semua||[]).filter(x=>x.kategori==='potongan').reduce((a,b)=>a+Number(b.nominal),0);
    await supabase.from('slip_gaji').update({
      total_pendapatan: pend, total_potongan: pot, gaji_bersih: pend - pot,
    }).eq('id', slipAktif.id);

    setManualModal(false);
    setManualForm({ nama:'', kategori:'pendapatan', nominal:'', alasan:'' });
    const segar = { ...slipAktif, total_pendapatan:pend, total_potongan:pot, gaji_bersih:pend-pot };
    setSlipAktif(segar); lihatSlip(segar); bukaPeriode(aktif);
  };

  const ubahStatusPeriode = async (status) => {
    const pesan = status === 'terkunci'
      ? 'KUNCI PERIODE INI?\n\nSetelah dikunci, semua angka gaji TIDAK BISA diubah lagi — tidak bisa dihitung ulang, tidak bisa ditambah penyesuaian. Pastikan sudah diperiksa.'
      : 'Tandai periode ini SUDAH DIBAYAR?\n\nSlip akan bisa dilihat oleh masing-masing karyawan.';
    if (!window.confirm(pesan)) return;

    const patch = { status };
    if (status === 'terkunci') {
      patch.tanggal_kunci = new Date().toISOString();
      patch.dikunci_oleh  = user?.id || null;
      // Salin identitas + tanda tangan penyetuju SEKARANG, supaya slip yang
      // sudah dicetak tidak ikut berubah kalau tanda tangannya diganti nanti.
      const { data: penyetuju } = await supabase.from('gurus')
        .select('nama, role, ttd_gambar').eq('id', user?.id || '').maybeSingle();
      patch.disetujui_nama    = penyetuju?.nama || user?.nama || null;
      patch.disetujui_jabatan = penyetuju?.role || user?.role || null;
      patch.disetujui_ttd     = penyetuju?.ttd_gambar || null;
    }
    if (status === 'dibayar')  { patch.tanggal_bayar = new Date().toISOString(); }

    const { error } = await supabase.from('periode_payroll').update(patch).eq('id', aktif.id);
    if (error) return alert('Gagal: ' + error.message);

    // Status slip mengikuti periode. Sejak 0026 propagasinya dikerjakan
    // trigger DB dalam satu transaksi — dulu perintah terpisah dari sini
    // bisa gagal diam-diam, periode tampak "Dibayar" tapi slip karyawan
    // tetap 'terkunci' dan tidak pernah muncul di "Slip Gaji Saya".
    const { count, error: eSlip } = await supabase.from('slip_gaji')
      .select('id', { count:'exact', head:true })
      .eq('periode_payroll_id', aktif.id).neq('status', status);
    if (eSlip || count) {
      alert('Periode sudah tersimpan, tetapi status slip karyawan belum ikut berubah'
        + (count ? ` (${count} slip tertinggal).` : '.')
        + '\n\nSlip belum akan muncul di halaman "Slip Gaji Saya". Hubungi admin sistem —'
        + ' migrasi 0026 kemungkinan belum dijalankan di database.');
    }
    const segar = { ...aktif, ...patch };
    setAktif(segar); loadAll(); bukaPeriode(segar);
  };

  const bisaUbah = aktif?.status === 'draft';

  return (
    <div>
      <div style={{ marginBottom:'1.25rem', display:'flex', justifyContent:'space-between', alignItems:'flex-end', flexWrap:'wrap', gap:'0.75rem' }}>
        <div>
          <p style={{ fontSize:'0.72rem', color:'var(--text-secondary)', margin:0, textTransform:'uppercase', letterSpacing:'0.05em' }}>Payroll</p>
          <h1 style={{ fontSize:'1.6rem', fontWeight:700, margin:0 }}>Periode Penggajian</h1>
        </div>
        <button className="btn btn-primary" onClick={()=>setBuatModal(true)} style={{ display:'flex', alignItems:'center', gap:'0.4rem' }}>
          <Plus size={16}/> Buat Periode
        </button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'280px 1fr', gap:'1rem', alignItems:'start' }}>
        {/* Daftar periode */}
        <div className="glass-card" style={{ padding:'1rem' }}>
          <div style={{ maxHeight:'70vh', overflowY:'auto', display:'flex', flexDirection:'column', gap:'0.3rem' }}>
            {loading ? <p style={{ color:'var(--text-secondary)', fontSize:'0.85rem' }}>Memuat...</p>
            : periode.length === 0 ? <p style={{ color:'var(--text-secondary)', fontSize:'0.85rem' }}>Belum ada periode.</p>
            : periode.map(p => {
              const c = STATUS_CFG[p.status];
              const dipilih = aktif?.id === p.id;
              return (
                <button key={p.id} onClick={()=>bukaPeriode(p)}
                  style={{ textAlign:'left', border:'none', cursor:'pointer', fontFamily:'inherit',
                    background: dipilih ? 'rgba(79,70,229,0.1)' : 'transparent',
                    borderRadius:'0.45rem', padding:'0.6rem 0.7rem',
                    borderLeft:`3px solid ${dipilih ? 'var(--primary)' : 'transparent'}` }}>
                  <div style={{ fontWeight:600, fontSize:'0.88rem' }}>{BULAN[p.bulan]} {p.tahun}</div>
                  <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', marginTop:'0.2rem' }}>
                    <span style={{ background:c.bg, color:c.color, padding:'0.05rem 0.4rem', borderRadius:999, fontSize:'0.68rem', fontWeight:700 }}>{c.label}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Isi periode */}
        <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
          {!aktif ? (
            <div className="glass-card" style={{ padding:'3rem', textAlign:'center', color:'var(--text-secondary)' }}>
              <FileText size={40} style={{ opacity:0.3, marginBottom:'0.75rem' }} />
              <p>Pilih periode di sebelah kiri.</p>
            </div>
          ) : (
            <>
              <div className="glass-card" style={{ padding:'1.25rem' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'0.75rem', marginBottom:'1rem' }}>
                  <div>
                    <h2 style={{ fontSize:'1.1rem', fontWeight:700, margin:0 }}>
                      {BULAN[aktif.bulan]} {aktif.tahun}
                    </h2>
                    <div style={{ fontSize:'0.8rem', color:'var(--text-secondary)', marginTop:'0.2rem' }}>
                      {slips.length} karyawan · Total {formatRupiah(slips.reduce((a,s)=>a+Number(s.gaji_bersih),0))}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap' }}>
                    {bisaUbah && (
                      <button className="btn btn-primary" onClick={hitungSemua} disabled={hitung}
                        style={{ display:'flex', alignItems:'center', gap:'0.35rem', fontSize:'0.82rem' }}>
                        <Calculator size={14}/> {hitung ? 'Menghitung...' : 'Hitung Semua'}
                      </button>
                    )}
                    {aktif.status === 'draft' && slips.length > 0 && (
                      <button className="btn" onClick={()=>ubahStatusPeriode('terkunci')}
                        style={{ display:'flex', alignItems:'center', gap:'0.35rem', fontSize:'0.82rem', background:'#fef3c7', color:'#92400e' }}>
                        <Lock size={14}/> Kunci Periode
                      </button>
                    )}
                    {aktif.status === 'terkunci' && (
                      <button className="btn" onClick={()=>ubahStatusPeriode('dibayar')}
                        style={{ display:'flex', alignItems:'center', gap:'0.35rem', fontSize:'0.82rem', background:'#d1fae5', color:'#047857' }}>
                        <BadgeCheck size={14}/> Tandai Sudah Dibayar
                      </button>
                    )}
                  </div>
                </div>

                {aktif.status !== 'draft' && (
                  <div style={{ background:'#fef3c7', border:'1px solid #fcd34d', borderRadius:'0.5rem', padding:'0.6rem 0.85rem', fontSize:'0.8rem', color:'#92400e', marginBottom:'0.85rem' }}>
                    Periode ini sudah <strong>{STATUS_CFG[aktif.status].label}</strong> — angka tidak bisa diubah lagi.
                  </div>
                )}

                {slips.length === 0 ? (
                  <p style={{ color:'var(--text-secondary)', fontSize:'0.88rem' }}>
                    Belum ada slip. Klik <strong>Hitung Semua</strong> untuk menghitung gaji seluruh karyawan aktif.
                  </p>
                ) : (
                  <div style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.85rem' }}>
                      <thead>
                        <tr style={{ borderBottom:'2px solid var(--glass-border)', background:'rgba(79,70,229,0.04)' }}>
                          {['Karyawan','Pendapatan','Potongan','Gaji Bersih','Catatan',''].map(h=>(
                            <th key={h} style={{ padding:'0.6rem 0.7rem', textAlign:'left', fontWeight:700, fontSize:'0.72rem', color:'var(--text-secondary)', whiteSpace:'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {slips.map(s => (
                          <tr key={s.id} style={{ borderBottom:'1px solid var(--glass-border)', cursor:'pointer',
                            background: slipAktif?.id===s.id ? 'rgba(79,70,229,0.04)' : 'transparent' }}
                            onClick={()=>lihatSlip(s)}>
                            <td style={{ padding:'0.65rem 0.7rem', fontWeight:600 }}>{s.gurus?.nama}</td>
                            <td style={{ padding:'0.65rem 0.7rem' }}>{formatRupiah(s.total_pendapatan)}</td>
                            <td style={{ padding:'0.65rem 0.7rem', color: Number(s.total_potongan)>0 ? '#b91c1c' : 'inherit' }}>
                              {formatRupiah(s.total_potongan)}
                            </td>
                            <td style={{ padding:'0.65rem 0.7rem', fontWeight:800, color:'#047857' }}>{formatRupiah(s.gaji_bersih)}</td>
                            <td style={{ padding:'0.65rem 0.7rem' }}>
                              {s.butuh_ditinjau && (
                                <span title="Ada hal yang perlu diperiksa" style={{ display:'inline-flex', alignItems:'center', gap:'0.2rem', background:'#fef3c7', color:'#92400e', padding:'0.1rem 0.45rem', borderRadius:999, fontSize:'0.7rem', fontWeight:700 }}>
                                  <AlertTriangle size={10}/> perlu ditinjau
                                </span>
                              )}
                            </td>
                            <td style={{ padding:'0.65rem 0.7rem' }}>
                              <Eye size={14} style={{ color:'var(--text-secondary)' }}/>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* ══ SLIP GAJI ══ */}
              {slipAktif && (
                <div className="glass-card" style={{ padding:'1.25rem' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:'0.75rem', marginBottom:'1rem' }}>
                    <div>
                      <h3 style={{ fontSize:'1.05rem', fontWeight:700, margin:0 }}>Slip Gaji — {slipAktif.gurus?.nama}</h3>
                      <div style={{ fontSize:'0.78rem', color:'var(--text-secondary)' }}>
                        {slipAktif.snapshot_karyawan?.jabatan} · {BULAN[aktif.bulan]} {aktif.tahun}
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:'0.5rem' }}>
                      {bisaUbah && (
                        <button className="btn" onClick={()=>setManualModal(true)} style={{ fontSize:'0.8rem' }}>+ Penyesuaian Manual</button>
                      )}
                      <button className="btn" onClick={()=>window.print()} style={{ display:'flex', alignItems:'center', gap:'0.3rem', fontSize:'0.8rem' }}>
                        <Printer size={14}/> Cetak
                      </button>
                    </div>
                  </div>

                  <SlipGajiPrintable model={dariSlipTersimpan(slipAktif, detail, {
                    bulan: aktif.bulan, tahun: aktif.tahun, internal: true,
                    persetujuan: aktif.disetujui_nama ? {
                      nama: aktif.disetujui_nama, jabatan: aktif.disetujui_jabatan,
                      ttd: aktif.disetujui_ttd, tanggal: aktif.tanggal_kunci,
                    } : null,
                  })} />

                  {/* Admin: buka rincian jurnal per komponen tatap muka */}
                  {detail.some(d => d.komponen_gaji_id && d.jumlah_unit != null) && (
                    <div className="no-print" style={{ marginTop:'0.75rem', display:'flex', flexWrap:'wrap', gap:'0.5rem' }}>
                      {detail.filter(d => d.komponen_gaji_id && d.jumlah_unit != null).map(d => (
                        <button key={d.id} onClick={()=>lihatRincianJurnal(d)}
                          style={{ background:'rgba(79,70,229,0.1)', border:'none', borderRadius:'0.4rem', padding:'0.35rem 0.7rem', cursor:'pointer', color:'var(--primary)', fontSize:'0.78rem', fontWeight:600, fontFamily:'inherit' }}>
                          Lihat rincian jurnal — {d.nama_komponen}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Rincian jurnal */}
                  {rincianJurnal && (
                    <div className="no-print" style={{ marginTop:'1rem', border:'1px solid var(--glass-border)', borderRadius:'0.5rem', padding:'0.85rem' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.6rem' }}>
                        <strong style={{ fontSize:'0.85rem' }}>
                          Rincian Jurnal Mengajar{rincianNama ? ` — ${rincianNama}` : ''}
                        </strong>
                        <button onClick={()=>setRincianJurnal(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-secondary)' }}><X size={16}/></button>
                      </div>

                      {/* Saringan + ekspor */}
                      <div style={{ display:'flex', gap:'0.4rem', flexWrap:'wrap', alignItems:'center', marginBottom:'0.6rem' }}>
                        {Object.entries(SARINGAN).map(([key, s]) => {
                          const n = rincianJurnal.filter(s.uji).length;
                          const dipilih = rincianFilter === key;
                          return (
                            <button key={key} onClick={()=>setRincianFilter(key)}
                              style={{ border:'1px solid ' + (dipilih ? 'var(--primary)' : 'var(--glass-border)'),
                                background: dipilih ? 'rgba(79,70,229,0.1)' : 'transparent',
                                color: dipilih ? 'var(--primary)' : 'var(--text-secondary)',
                                borderRadius:999, padding:'0.2rem 0.65rem', cursor:'pointer',
                                fontFamily:'inherit', fontSize:'0.75rem', fontWeight: dipilih ? 700 : 500 }}>
                              {s.label} ({n})
                            </button>
                          );
                        })}
                        <button className="btn" onClick={exportRincian} disabled={!rincianTampil.length}
                          style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:'0.3rem', fontSize:'0.75rem' }}>
                          <FileSpreadsheet size={13}/> Export Excel
                        </button>
                      </div>

                      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.78rem' }}>
                        <thead>
                          <tr style={{ borderBottom:'1px solid var(--glass-border)' }}>
                            {['Tanggal','Program','Siswa','Tarif','Keterangan'].map(h=>(
                              <th key={h} style={{ padding:'0.35rem 0.4rem', textAlign:'left', color:'var(--text-secondary)', fontWeight:700 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rincianTampil.length === 0 ? (
                            <tr><td colSpan={5} style={{ padding:'0.9rem 0.4rem', textAlign:'center', color:'var(--text-secondary)' }}>
                              Tidak ada jurnal pada saringan ini.
                            </td></tr>
                          ) : rincianTampil.map((r,i)=>(
                            <tr key={i} style={{ borderBottom:'1px solid var(--glass-border)', opacity: r.dibayar ? 1 : 0.65,
                              background: isDuplikat(r) ? 'rgba(185,28,28,0.05)' : 'transparent' }}>
                              <td style={{ padding:'0.35rem 0.4rem', whiteSpace:'nowrap' }}>{fmtTgl(r.tanggal)}</td>
                              <td style={{ padding:'0.35rem 0.4rem' }}>{r.program || '-'}</td>
                              <td style={{ padding:'0.35rem 0.4rem' }}>{namaSiswa(r)}</td>
                              <td style={{ padding:'0.35rem 0.4rem', whiteSpace:'nowrap' }}>
                                {r.dibayar ? formatRupiah(r.tarif) : <span style={{ color:'#b91c1c' }}>tidak dibayar</span>}
                              </td>
                              <td style={{ padding:'0.35rem 0.4rem', color:'#b45309' }}>{r.alasan || ''}</td>
                            </tr>
                          ))}
                        </tbody>
                        {rincianTampil.length > 0 && (
                          <tfoot>
                            <tr style={{ fontWeight:700 }}>
                              <td colSpan={3} style={{ padding:'0.45rem 0.4rem' }}>TOTAL ({rincianTampil.length} jurnal)</td>
                              <td style={{ padding:'0.45rem 0.4rem', whiteSpace:'nowrap', color:'#047857' }}>
                                {formatRupiah(rincianTampil.reduce((a,r)=>a + (r.dibayar ? Number(r.tarif) : 0), 0))}
                              </td>
                              <td/>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                      <p style={{ margin:'0.5rem 0 0', fontSize:'0.72rem', color:'var(--text-secondary)' }}>
                        Baris yang redup tidak dibayar, yang berlatar merah adalah duplikat. Alasannya tertulis di kolom paling kanan.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modal buat periode */}
      {buatModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth:420 }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.25rem' }}>
              <h2 style={{ fontWeight:700, fontSize:'1.05rem', margin:0 }}>Buat Periode</h2>
              <button onClick={()=>setBuatModal(false)} style={{ background:'none', border:'none', cursor:'pointer' }}><X size={20}/></button>
            </div>
            <form onSubmit={buatPeriode} style={{ display:'flex', flexDirection:'column', gap:'0.85rem' }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.65rem' }}>
                <div>
                  <label style={lbl}>Bulan *</label>
                  <select value={buatForm.bulan} onChange={e=>setBuatForm(f=>({...f,bulan:Number(e.target.value)}))} style={inp}>
                    {BULAN.slice(1).map((b,i)=><option key={i+1} value={i+1}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Tahun *</label>
                  <input type="number" value={buatForm.tahun} onChange={e=>setBuatForm(f=>({...f,tahun:Number(e.target.value)}))} style={inp} />
                </div>
              </div>
              <div style={{ display:'flex', gap:'0.65rem', justifyContent:'flex-end' }}>
                <button type="button" className="btn" onClick={()=>setBuatModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary">Buat</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal penyesuaian manual */}
      {manualModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth:440 }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
              <h2 style={{ fontWeight:700, fontSize:'1.05rem', margin:0 }}>Penyesuaian Manual</h2>
              <button onClick={()=>setManualModal(false)} style={{ background:'none', border:'none', cursor:'pointer' }}><X size={20}/></button>
            </div>
            <p style={{ fontSize:'0.8rem', color:'var(--text-secondary)', marginTop:0 }}>
              Untuk kejadian sekali jalan, mis. honor tambahan try out. Tidak perlu membuat komponen permanen.
            </p>
            <form onSubmit={tambahManual} style={{ display:'flex', flexDirection:'column', gap:'0.85rem' }}>
              <div>
                <label style={lbl}>Nama *</label>
                <input required value={manualForm.nama} onChange={e=>setManualForm(f=>({...f,nama:e.target.value}))}
                  style={inp} placeholder="Honor Try Out" />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.65rem' }}>
                <div>
                  <label style={lbl}>Jenis *</label>
                  <select value={manualForm.kategori} onChange={e=>setManualForm(f=>({...f,kategori:e.target.value}))} style={inp}>
                    <option value="pendapatan">Menambah gaji</option>
                    <option value="potongan">Mengurangi gaji</option>
                  </select>
                </div>
                <div>
                  <label style={lbl}>Nominal (Rp) *</label>
                  <input type="number" required min={0} step={1000} value={manualForm.nominal}
                    onChange={e=>setManualForm(f=>({...f,nominal:e.target.value}))} style={inp} />
                </div>
              </div>
              <div>
                <label style={lbl}>Alasan * (wajib)</label>
                <textarea required rows={2} value={manualForm.alasan}
                  onChange={e=>setManualForm(f=>({...f,alasan:e.target.value}))}
                  style={{...inp, resize:'vertical'}} placeholder="Jelaskan kenapa ada penyesuaian ini..." />
              </div>
              <div style={{ display:'flex', gap:'0.65rem', justifyContent:'flex-end' }}>
                <button type="button" className="btn" onClick={()=>setManualModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary">Tambahkan</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
