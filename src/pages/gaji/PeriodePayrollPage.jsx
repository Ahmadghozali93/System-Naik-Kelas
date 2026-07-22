import { useState, useEffect } from 'react';
import { Plus, X, Calculator, Lock, BadgeCheck, AlertTriangle, FileText, Printer, Eye } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/authStore';
import { formatRupiah } from '../../utils/formatRupiah';

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
  const [units, setUnits]     = useState([]);
  const [loading, setLoading] = useState(true);

  const [aktif, setAktif]   = useState(null);   // periode yang dibuka
  const [slips, setSlips]   = useState([]);
  const [hitung, setHitung] = useState(false);

  const [buatModal, setBuatModal] = useState(false);
  const [buatForm, setBuatForm]   = useState({ unit_id:'', tahun:new Date().getFullYear(), bulan:new Date().getMonth()+1 });

  const [slipAktif, setSlipAktif] = useState(null);   // slip yang dilihat rinciannya
  const [detail, setDetail]       = useState([]);
  const [rincianJurnal, setRincianJurnal] = useState(null);

  const [manualModal, setManualModal] = useState(false);
  const [manualForm, setManualForm]   = useState({ nama:'', kategori:'pendapatan', nominal:'', alasan:'' });

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    const [pRes, uRes] = await Promise.all([
      supabase.from('periode_payroll').select('*, units:unit_id(nama)')
        .order('tahun',{ascending:false}).order('bulan',{ascending:false}),
      supabase.from('units').select('id, nama').eq('aktif', true).order('nama'),
    ]);
    setPeriode(pRes.data || []);
    setUnits(uRes.data || []);
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
    if (!buatForm.unit_id) return alert('Pilih cabang.');
    const { error } = await supabase.from('periode_payroll').insert({
      unit_id: buatForm.unit_id, tahun: Number(buatForm.tahun), bulan: Number(buatForm.bulan), status:'draft',
    });
    if (error) {
      if (error.code === '23505') return alert('Periode untuk cabang & bulan itu sudah ada.');
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
    if (status === 'terkunci') { patch.tanggal_kunci = new Date().toISOString(); patch.dikunci_oleh = user?.id || null; }
    if (status === 'dibayar')  { patch.tanggal_bayar = new Date().toISOString(); }

    const { error } = await supabase.from('periode_payroll').update(patch).eq('id', aktif.id);
    if (error) return alert('Gagal: ' + error.message);

    // Status slip mengikuti periode
    await supabase.from('slip_gaji').update({ status }).eq('periode_payroll_id', aktif.id);
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
                    <span style={{ fontSize:'0.72rem', color:'var(--text-secondary)' }}>{p.units?.nama}</span>
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
                      {BULAN[aktif.bulan]} {aktif.tahun} — {aktif.units?.nama}
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
                    Belum ada slip. Klik <strong>Hitung Semua</strong> untuk menghitung gaji seluruh karyawan di cabang ini.
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

                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.85rem' }}>
                    <tbody>
                      {detail.map(d => (
                        <tr key={d.id} style={{ borderBottom:'1px solid var(--glass-border)' }}>
                          <td style={{ padding:'0.6rem 0' }}>
                            <div style={{ fontWeight:600 }}>
                              {d.nama_komponen}
                              {d.sumber === 'manual' && (
                                <span style={{ marginLeft:'0.4rem', background:'#ede9fe', color:'#7c3aed', padding:'0.05rem 0.4rem', borderRadius:999, fontSize:'0.68rem', fontWeight:700 }}>manual</span>
                              )}
                            </div>
                            {d.keterangan_hitung && (
                              <div style={{ fontSize:'0.75rem', color:'var(--text-secondary)' }}>{d.keterangan_hitung}</div>
                            )}
                            {d.alasan && (
                              <div style={{ fontSize:'0.75rem', color:'#7c3aed' }}>Alasan: {d.alasan}</div>
                            )}
                            {d.komponen_gaji_id && d.jumlah_unit != null && (
                              <button onClick={()=>lihatRincianJurnal(d)}
                                style={{ background:'none', border:'none', padding:'0.15rem 0', cursor:'pointer', color:'var(--primary)', fontSize:'0.75rem', fontWeight:600, fontFamily:'inherit', textDecoration:'underline' }}>
                                lihat rincian jurnal
                              </button>
                            )}
                          </td>
                          <td style={{ padding:'0.6rem 0', textAlign:'right', fontWeight:700, whiteSpace:'nowrap',
                            color: d.kategori==='potongan' ? '#b91c1c' : 'inherit' }}>
                            {d.kategori==='potongan' ? '− ' : ''}{formatRupiah(d.nominal)}
                          </td>
                        </tr>
                      ))}
                      <tr style={{ borderTop:'2px solid var(--glass-border)' }}>
                        <td style={{ padding:'0.7rem 0', fontWeight:800 }}>GAJI BERSIH</td>
                        <td style={{ padding:'0.7rem 0', textAlign:'right', fontWeight:800, fontSize:'1.15rem', color:'#047857' }}>
                          {formatRupiah(slipAktif.gaji_bersih)}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  {(slipAktif.peringatan || []).length > 0 && (
                    <div style={{ marginTop:'1rem', background:'#fef3c7', border:'1px solid #fcd34d', borderRadius:'0.5rem', padding:'0.7rem 0.85rem' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:'0.35rem', fontWeight:700, fontSize:'0.8rem', color:'#92400e', marginBottom:'0.35rem' }}>
                        <AlertTriangle size={14}/> Perlu diperiksa
                      </div>
                      <ul style={{ margin:0, paddingLeft:'1.1rem', fontSize:'0.78rem', color:'#92400e' }}>
                        {slipAktif.peringatan.map((w,i)=><li key={i}>{w.komponen ? `${w.komponen}: ` : ''}{w.pesan}</li>)}
                      </ul>
                    </div>
                  )}

                  {/* Rincian jurnal */}
                  {rincianJurnal && (
                    <div style={{ marginTop:'1rem', border:'1px solid var(--glass-border)', borderRadius:'0.5rem', padding:'0.85rem' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.6rem' }}>
                        <strong style={{ fontSize:'0.85rem' }}>Rincian Jurnal Mengajar</strong>
                        <button onClick={()=>setRincianJurnal(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-secondary)' }}><X size={16}/></button>
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
                          {rincianJurnal.map((r,i)=>(
                            <tr key={i} style={{ borderBottom:'1px solid var(--glass-border)', opacity: r.dibayar ? 1 : 0.65 }}>
                              <td style={{ padding:'0.35rem 0.4rem', whiteSpace:'nowrap' }}>{fmtTgl(r.tanggal)}</td>
                              <td style={{ padding:'0.35rem 0.4rem' }}>{r.program || '-'}</td>
                              <td style={{ padding:'0.35rem 0.4rem' }}>{r.siswa_id}</td>
                              <td style={{ padding:'0.35rem 0.4rem', whiteSpace:'nowrap' }}>
                                {r.dibayar ? formatRupiah(r.tarif) : <span style={{ color:'#b91c1c' }}>tidak dibayar</span>}
                              </td>
                              <td style={{ padding:'0.35rem 0.4rem', color:'#b45309' }}>{r.alasan || ''}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p style={{ margin:'0.5rem 0 0', fontSize:'0.72rem', color:'var(--text-secondary)' }}>
                        Baris yang redup tidak dibayar. Alasannya tertulis di kolom paling kanan.
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
              <div>
                <label style={lbl}>Cabang *</label>
                <select required value={buatForm.unit_id} onChange={e=>setBuatForm(f=>({...f,unit_id:e.target.value}))} style={inp}>
                  <option value="">— Pilih cabang —</option>
                  {units.map(u=><option key={u.id} value={u.id}>{u.nama}</option>)}
                </select>
              </div>
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
