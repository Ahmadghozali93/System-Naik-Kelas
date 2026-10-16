import { useState, useEffect, useMemo } from 'react';
import { Plus, X, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/authStore';
import { formatRupiah } from '../../utils/formatRupiah';

// Setoran uang penjualan buku — pola yang sama dengan Setor SPP
// (RekonsiliasiPage): transaksi Divalidasi yang belum disetor dikumpulkan
// jadi satu setor_buku; transaksi_buku.setor_id menandai yang sudah masuk.
const genId = () => 'SB-' + Math.random().toString(36).substr(2,6).toUpperCase();
const fmt = (d) => d ? new Date(d).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : '-';
const uniq = (arr) => [...new Set(arr.filter(Boolean))].join(', ') || '-';
const hariIni = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

export default function SetorBukuPage() {
  const { user } = useAuth();
  const [setors, setSetors]       = useState([]);
  const [transaksis, setTransaksis] = useState([]);   // Divalidasi
  const [loading, setLoading]     = useState(true);
  const [muat, setMuat]           = useState(0);

  const [search, setSearch]       = useState('');
  const [dateFrom, setDateFrom]   = useState('');
  const [dateTo, setDateTo]       = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [formTanggal, setFormTanggal] = useState('');
  const [formCatatan, setFormCatatan] = useState('');
  const [modalUnit, setModalUnit] = useState('');
  const [selected, setSelected]   = useState(new Set());
  const [saving, setSaving]       = useState(false);

  useEffect(() => {
    let aktif = true;
    Promise.all([
      supabase.from('setor_buku').select('*').order('tanggal', { ascending: false }),
      supabase.from('transaksi_buku').select('*').eq('status', 'Divalidasi').order('tanggal_bayar', { ascending: false }),
    ]).then(([sRes, tRes]) => {
      if (!aktif) return;
      if (sRes.error || tRes.error) alert('Gagal memuat data: ' + (sRes.error || tRes.error).message);
      setSetors(sRes.data || []);
      setTransaksis(tRes.data || []);
      setLoading(false);
    });
    return () => { aktif = false; };
  }, [muat]);

  const pending = useMemo(() => transaksis.filter(t => !t.setor_id), [transaksis]);
  const pendingTampil = useMemo(() => modalUnit ? pending.filter(t => t.unit === modalUnit) : pending, [pending, modalUnit]);
  const allUnits = useMemo(() => [...new Set(pending.map(t => t.unit).filter(Boolean))].sort(), [pending]);

  const enriched = useMemo(() => setors.map(s => {
    const trx = transaksis.filter(t => t.setor_id === s.id);
    return { ...s, units: uniq(trx.map(t => t.unit)), metodes: uniq(trx.map(t => t.metode)), petugas: uniq(trx.map(t => t.dicatat_oleh)) };
  }), [setors, transaksis]);

  const filtered = useMemo(() => enriched.filter(s => {
    const q = search.toLowerCase();
    if (q && !s.units.toLowerCase().includes(q) && !s.petugas.toLowerCase().includes(q) && !s.created_by?.toLowerCase().includes(q) && !s.id.toLowerCase().includes(q)) return false;
    if (dateFrom && s.tanggal < dateFrom) return false;
    if (dateTo   && s.tanggal > dateTo)   return false;
    return true;
  }), [enriched, search, dateFrom, dateTo]);

  const totalSelected = [...selected].reduce((s, id) => s + (Number(transaksis.find(t => t.id === id)?.total) || 0), 0);
  const semuaTerpilih = pendingTampil.length > 0 && pendingTampil.every(t => selected.has(t.id));
  const toggle = (id) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSemua = () => setSelected(prev => {
    const n = new Set(prev);
    pendingTampil.forEach(t => semuaTerpilih ? n.delete(t.id) : n.add(t.id));
    return n;
  });

  const buka = () => {
    setFormTanggal(hariIni()); setFormCatatan(''); setModalUnit(''); setSelected(new Set());
    setModalOpen(true);
  };

  const simpan = async (e) => {
    e.preventDefault();
    if (selected.size === 0) { alert('Pilih minimal satu transaksi.'); return; }
    setSaving(true);
    const id = genId();
    const { error: sErr } = await supabase.from('setor_buku').insert([{
      id, tanggal: formTanggal, total: totalSelected, jumlah_transaksi: selected.size,
      catatan: formCatatan.trim() || null, created_by: user?.nama || user?.email || '-',
    }]);
    if (sErr) { setSaving(false); alert('Gagal menyimpan: ' + sErr.message); return; }
    // Hanya yang belum disetor — kalau ada yang keburu disetor orang lain, tidak tertimpa.
    const { error: tErr } = await supabase.from('transaksi_buku')
      .update({ setor_id: id }).in('id', [...selected]).is('setor_id', null);
    if (tErr) alert('Setoran tersimpan tapi gagal menandai transaksi: ' + tErr.message);
    setSaving(false);
    setModalOpen(false);
    setLoading(true);
    setMuat(n => n + 1);
  };

  const inp = { padding:'0.5rem 0.75rem', borderRadius:'0.5rem', border:'1px solid var(--glass-border)', background:'var(--surface-color)', fontFamily:'inherit', fontSize:'0.85rem', boxSizing:'border-box' };
  const th = { padding:'0.65rem 0.75rem', fontWeight:700, fontSize:'0.72rem', color:'var(--text-secondary)', whiteSpace:'nowrap', letterSpacing:'0.06em', textAlign:'left' };
  const td = { padding:'0.75rem', verticalAlign:'top' };

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.5rem',flexWrap:'wrap',gap:'0.75rem'}}>
        <div>
          <p style={{fontSize:'0.78rem',color:'var(--text-secondary)',margin:0,textTransform:'uppercase',letterSpacing:'0.05em'}}>Penjualan Buku</p>
          <h1 style={{fontSize:'1.6rem',fontWeight:700,margin:0}}>Setor Buku</h1>
        </div>
        <button onClick={buka} className="btn btn-primary" style={{display:'flex',alignItems:'center',gap:'0.4rem'}}>
          <Plus size={18}/> Input Setor Buku {pending.length > 0 && `(${pending.length} belum disetor)`}
        </button>
      </div>

      <div style={{display:'flex',gap:'0.65rem',marginBottom:'1rem',flexWrap:'wrap',alignItems:'center'}}>
        <div style={{position:'relative',flex:1,minWidth:180}}>
          <Search size={15} style={{position:'absolute',left:'0.75rem',top:'50%',transform:'translateY(-50%)',color:'var(--text-secondary)'}}/>
          <input style={{...inp,width:'100%',paddingLeft:'2.2rem'}} placeholder="Cari unit / petugas / ID..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <input type="date" style={inp} value={dateFrom} onChange={e=>setDateFrom(e.target.value)} title="Dari tanggal"/>
        <span style={{color:'var(--text-secondary)'}}>–</span>
        <input type="date" style={inp} value={dateTo} onChange={e=>setDateTo(e.target.value)} title="Sampai tanggal"/>
      </div>

      <div className="glass-card" style={{padding:'1.5rem'}}>
        {loading ? <p style={{color:'var(--text-secondary)'}}>Memuat...</p>
          : filtered.length === 0 ? <p style={{color:'var(--text-secondary)'}}>Belum ada setoran.</p>
          : (
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.85rem'}}>
              <thead>
                <tr style={{borderBottom:'2px solid var(--glass-border)',background:'rgba(79,70,229,0.04)'}}>
                  <th style={th}>TANGGAL</th><th style={th}>ID</th><th style={th}>UNIT</th><th style={th}>METODE</th>
                  <th style={th}>PETUGAS TRANSAKSI</th><th style={{...th,textAlign:'center'}}>TRANSAKSI</th>
                  <th style={{...th,textAlign:'right'}}>TOTAL</th><th style={th}>DISETOR OLEH</th><th style={th}>CATATAN</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.id} style={{borderBottom:'1px solid var(--glass-border)'}}>
                    <td style={{...td,whiteSpace:'nowrap'}}>{fmt(s.tanggal)}</td>
                    <td style={{...td,color:'var(--text-secondary)',whiteSpace:'nowrap'}}>{s.id}</td>
                    <td style={td}>{s.units}</td>
                    <td style={td}>{s.metodes}</td>
                    <td style={td}>{s.petugas}</td>
                    <td style={{...td,textAlign:'center'}}>{s.jumlah_transaksi}</td>
                    <td style={{...td,textAlign:'right',fontWeight:700,whiteSpace:'nowrap'}}>{formatRupiah(s.total || 0)}</td>
                    <td style={td}>{s.created_by || '-'}</td>
                    <td style={{...td,color:'var(--text-secondary)'}}>{s.catatan || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="modal-overlay modal-tengah" onClick={e=>{ if (e.target === e.currentTarget && !saving) setModalOpen(false); }}>
          <div className="modal-content" style={{maxWidth:680}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
              <h3 style={{margin:0,fontWeight:700}}>Input Setor Buku</h3>
              <button onClick={()=>setModalOpen(false)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-secondary)'}}><X size={18}/></button>
            </div>
            <form onSubmit={simpan} style={{display:'flex',flexDirection:'column',gap:'0.9rem'}}>
              <div style={{display:'flex',gap:'0.75rem',flexWrap:'wrap'}}>
                <div style={{flex:'1 1 160px'}}>
                  <label className="form-label">Tanggal Setor<span className="wajib"> *</span></label>
                  <input type="date" className="form-input" value={formTanggal} required onChange={e=>setFormTanggal(e.target.value)}/>
                </div>
                <div style={{flex:'1 1 160px'}}>
                  <label className="form-label">Unit</label>
                  <select className="form-input" value={modalUnit} onChange={e=>setModalUnit(e.target.value)}>
                    <option value="">Semua Unit</option>
                    {allUnits.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="form-label">Catatan</label>
                <input className="form-input" value={formCatatan} placeholder="Opsional" onChange={e=>setFormCatatan(e.target.value)}/>
              </div>

              <div style={{border:'1px solid var(--glass-border)',borderRadius:'0.5rem',maxHeight:320,overflowY:'auto'}}>
                {pendingTampil.length === 0 ? (
                  <p style={{padding:'1rem',color:'var(--text-secondary)',margin:0,fontSize:'0.875rem'}}>Tidak ada transaksi tervalidasi yang belum disetor.</p>
                ) : (
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.82rem'}}>
                    <thead>
                      <tr style={{background:'rgba(79,70,229,0.04)',position:'sticky',top:0}}>
                        <th style={{...th,width:36}}><input type="checkbox" checked={semuaTerpilih} onChange={toggleSemua}/></th>
                        <th style={th}>TGL BAYAR</th><th style={th}>SISWA</th><th style={th}>UNIT</th><th style={th}>METODE</th><th style={th}>GURU</th>
                        <th style={{...th,textAlign:'right'}}>TOTAL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingTampil.map(t => (
                        <tr key={t.id} onClick={()=>toggle(t.id)} style={{borderTop:'1px solid var(--glass-border)',cursor:'pointer',background:selected.has(t.id)?'rgba(79,70,229,0.05)':'transparent'}}>
                          <td style={{padding:'0.5rem 0.75rem'}}><input type="checkbox" checked={selected.has(t.id)} readOnly/></td>
                          <td style={{padding:'0.5rem 0.75rem',whiteSpace:'nowrap'}}>{fmt(t.tanggal_bayar)}</td>
                          <td style={{padding:'0.5rem 0.75rem',fontWeight:600}}>{t.nama_siswa}</td>
                          <td style={{padding:'0.5rem 0.75rem'}}>{t.unit || '-'}</td>
                          <td style={{padding:'0.5rem 0.75rem'}}>{t.metode}</td>
                          <td style={{padding:'0.5rem 0.75rem'}}>{t.dicatat_oleh || '-'}</td>
                          <td style={{padding:'0.5rem 0.75rem',textAlign:'right',fontWeight:700,whiteSpace:'nowrap'}}>{formatRupiah(t.total || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0.7rem 1rem',borderRadius:'0.5rem',background:'rgba(16,185,129,0.08)',border:'1px solid rgba(16,185,129,0.2)',fontSize:'0.875rem'}}>
                <span>{selected.size} transaksi dipilih</span>
                <b style={{color:'#047857'}}>{formatRupiah(totalSelected)}</b>
              </div>

              <div style={{display:'flex',gap:'0.75rem'}}>
                <button type="submit" className="btn btn-primary" style={{flex:1}} disabled={saving || selected.size === 0}>{saving ? 'Menyimpan...' : 'Simpan Setoran'}</button>
                <button type="button" className="btn" onClick={()=>setModalOpen(false)} style={{background:'var(--surface-color)'}}>Batal</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
