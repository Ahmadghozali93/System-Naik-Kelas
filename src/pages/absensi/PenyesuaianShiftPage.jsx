import { useState, useEffect } from 'react';
import { X, Wrench, CheckCircle2, XCircle, Clock, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/authStore';

const fmt = (d) => d ? new Date(d+'T12:00:00').toLocaleDateString('id-ID',{weekday:'long',day:'2-digit',month:'short',year:'numeric'}) : '-';
const jam = (t) => t ? String(t).slice(0,5) : '';
const todayWIB = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });

const STATUS = {
  Menunggu: { bg:'#fef3c7', color:'#92400e' },
  Selesai:  { bg:'#d1fae5', color:'#047857' },
  Ditolak:  { bg:'#fee2e2', color:'#b91c1c' },
};

export default function PenyesuaianShiftPage() {
  const { user } = useAuth();
  const isAdmin = ['Owner','Administrator','Supervisor'].includes(user?.role);

  const [rows, setRows]       = useState([]);
  const [shifts, setShifts]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('Menunggu');

  const [modal, setModal]     = useState(null);   // permintaan yang ditangani
  const [pilihShift, setPilihShift] = useState([]);
  const [tolakModal, setTolakModal] = useState(null);
  const [alasanTolak, setAlasanTolak] = useState('');
  const [proses, setProses]   = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const [pRes, sRes] = await Promise.all([
      supabase.from('penyesuaian_shift')
        .select('*, gurus:guru_id(nama), penangan:ditangani_oleh(nama), shift_schedules:shift_schedule_id(shifts(nama, jam_mulai, jam_selesai, unit_id))')
        .order('tanggal', { ascending:true }),
      supabase.from('shifts').select('*').eq('aktif', true).order('unit_id').order('jam_mulai'),
    ]);
    setRows(pRes.data || []);
    setShifts(sRes.data || []);
    setLoading(false);
  };

  const bukaTangani = (r) => { setModal(r); setPilihShift([]); };

  const togglePilih = (id) =>
    setPilihShift(p => p.includes(id) ? p.filter(x=>x!==id) : [...p, id]);

  const terapkan = async () => {
    if (pilihShift.length === 0) return alert('Pilih minimal satu shift pengganti.');
    setProses(true);
    const { data, error } = await supabase.rpc('terapkan_penyesuaian_shift',
      { p_id: modal.id, p_shift_ids: pilihShift });
    setProses(false);
    if (error) return alert('Gagal: ' + error.message);
    alert('✅ ' + data);
    setModal(null); load();
  };

  const tolak = async () => {
    if (!alasanTolak.trim()) return alert('Isi alasan penolakan.');
    const { error } = await supabase.from('penyesuaian_shift')
      .update({ status:'Ditolak', catatan_spv: alasanTolak.trim(), ditangani_oleh: user?.id })
      .eq('id', tolakModal.id);
    if (error) return alert('Gagal: ' + error.message);
    setTolakModal(null); setAlasanTolak(''); load();
  };

  const tampil = rows.filter(r => !filterStatus || r.status === filterStatus);
  // Shift dari unit yang sama dengan shift asal (kalau diketahui)
  const unitAsal = modal?.shift_schedules?.shifts?.unit_id || modal?.unit_id;
  const shiftUntukModal = shifts.filter(s => !unitAsal || s.unit_id === unitAsal);

  if (!isAdmin) {
    return <div style={{ padding:'2rem', textAlign:'center', color:'var(--text-secondary)' }}>
      Halaman ini hanya untuk SPV/Admin.
    </div>;
  }

  return (
    <div>
      <div style={{ marginBottom:'1.25rem' }}>
        <p style={{ fontSize:'0.72rem', color:'var(--text-secondary)', margin:0, textTransform:'uppercase', letterSpacing:'0.05em' }}>Absensi</p>
        <h1 style={{ fontSize:'1.6rem', fontWeight:700, margin:0 }}>Penyesuaian Shift</h1>
        <p style={{ fontSize:'0.85rem', color:'var(--text-secondary)', margin:'0.25rem 0 0' }}>
          Permintaan guru untuk menata ulang jadwal shift pada tanggal tertentu. Master shift tidak diubah — hanya jadwal di tanggal itu.
        </p>
      </div>

      <div style={{ display:'flex', gap:'0.5rem', marginBottom:'1rem', flexWrap:'wrap' }}>
        {['Menunggu','Selesai','Ditolak',''].map(s => (
          <button key={s||'semua'} onClick={()=>setFilterStatus(s)}
            style={{ padding:'0.4rem 0.85rem', borderRadius:'0.45rem', cursor:'pointer', fontFamily:'inherit', fontSize:'0.82rem', fontWeight:600,
              border:`1px solid ${filterStatus===s ? 'var(--primary)' : 'var(--glass-border)'}`,
              background: filterStatus===s ? 'var(--primary)' : 'var(--surface-color)',
              color: filterStatus===s ? '#fff' : 'var(--text-secondary)' }}>
            {s || 'Semua'}{s==='Menunggu' && rows.filter(r=>r.status==='Menunggu').length>0 ? ` (${rows.filter(r=>r.status==='Menunggu').length})` : ''}
          </button>
        ))}
      </div>

      <div className="glass-card" style={{ padding:'1.5rem' }}>
        {loading ? <p style={{ color:'var(--text-secondary)' }}>Memuat...</p>
        : tampil.length === 0 ? (
          <div style={{ textAlign:'center', padding:'3rem', color:'var(--text-secondary)' }}>
            <Wrench size={40} style={{ opacity:0.3, marginBottom:'0.75rem' }} />
            <p>Tidak ada permintaan.</p>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:'0.65rem' }}>
            {tampil.map(r => {
              const c = STATUS[r.status];
              const sh = r.shift_schedules?.shifts;
              const lewat = r.status==='Menunggu' && r.tanggal < todayWIB();
              return (
                <div key={r.id} style={{ border:`1px solid ${lewat ? '#fca5a5' : 'var(--glass-border)'}`, borderRadius:'0.6rem', padding:'1rem', background: lewat ? 'rgba(185,28,28,0.03)' : 'var(--surface-color)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:'0.75rem', flexWrap:'wrap' }}>
                    <div style={{ flex:1, minWidth:200 }}>
                      <div style={{ fontWeight:700 }}>{r.gurus?.nama}</div>
                      <div style={{ fontSize:'0.82rem', color:'var(--text-secondary)', marginTop:'0.1rem' }}>
                        {fmt(r.tanggal)}
                      </div>
                      <div style={{ fontSize:'0.82rem', marginTop:'0.35rem' }}>
                        Shift asal: <strong>{sh ? `${sh.nama} (${jam(sh.jam_mulai)}–${jam(sh.jam_selesai)})` : '—'}</strong>
                      </div>
                      <div style={{ fontSize:'0.82rem', marginTop:'0.25rem', background:'#f9fafb', border:'1px solid var(--glass-border)', borderRadius:'0.4rem', padding:'0.5rem 0.65rem' }}>
                        “{r.keterangan}”
                      </div>
                      {lewat && (
                        <div style={{ marginTop:'0.4rem', display:'inline-flex', alignItems:'center', gap:'0.25rem', color:'#b91c1c', fontSize:'0.75rem', fontWeight:700 }}>
                          <AlertTriangle size={12}/> Tanggal sudah lewat — segera tangani
                        </div>
                      )}
                      {r.catatan_spv && (
                        <div style={{ fontSize:'0.76rem', color:'var(--text-secondary)', marginTop:'0.35rem' }}>Catatan SPV: {r.catatan_spv}</div>
                      )}
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:'0.5rem' }}>
                      <span style={{ background:c.bg, color:c.color, padding:'0.15rem 0.6rem', borderRadius:999, fontSize:'0.75rem', fontWeight:700 }}>{r.status}</span>
                      {r.status==='Menunggu' && (
                        <div style={{ display:'flex', gap:'0.4rem' }}>
                          <button onClick={()=>bukaTangani(r)} className="btn btn-primary" style={{ fontSize:'0.8rem', padding:'0.35rem 0.7rem', display:'flex', alignItems:'center', gap:'0.3rem' }}>
                            <Wrench size={13}/> Atur Ulang
                          </button>
                          <button onClick={()=>setTolakModal(r)} style={{ background:'#fee2e2', border:'none', borderRadius:'0.4rem', padding:'0.35rem 0.6rem', cursor:'pointer', color:'#b91c1c', display:'flex', alignItems:'center', gap:'0.3rem', fontSize:'0.8rem', fontWeight:600, fontFamily:'inherit' }}>
                            <XCircle size={13}/> Tolak
                          </button>
                        </div>
                      )}
                      {r.penangan?.nama && <span style={{ fontSize:'0.72rem', color:'var(--text-secondary)' }}>oleh {r.penangan.nama}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal atur ulang */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth:520, maxHeight:'88vh', overflowY:'auto' }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
              <h2 style={{ fontWeight:700, fontSize:'1.05rem', margin:0 }}>Atur Ulang Shift</h2>
              <button onClick={()=>setModal(null)} style={{ background:'none', border:'none', cursor:'pointer' }}><X size={20}/></button>
            </div>

            <div style={{ background:'#f9fafb', border:'1px solid var(--glass-border)', borderRadius:'0.5rem', padding:'0.75rem 0.85rem', marginBottom:'1rem', fontSize:'0.83rem' }}>
              <div><strong>{modal.gurus?.nama}</strong> · {fmt(modal.tanggal)}</div>
              <div style={{ marginTop:'0.3rem', color:'var(--text-secondary)' }}>Permintaan: “{modal.keterangan}”</div>
            </div>

            <label style={{ fontSize:'0.82rem', fontWeight:600, display:'block', marginBottom:'0.5rem' }}>
              Pilih shift pengganti untuk tanggal ini
            </label>
            {shiftUntukModal.length === 0 ? (
              <p style={{ fontSize:'0.8rem', color:'#b45309' }}>
                Belum ada shift yang cocok di master. Buat dulu shift yang diinginkan di menu <strong>Master Shift</strong>, lalu kembali ke sini.
              </p>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:'0.4rem' }}>
                {shiftUntukModal.map(s => {
                  const dipilih = pilihShift.includes(s.id);
                  return (
                    <label key={s.id} style={{ display:'flex', alignItems:'center', gap:'0.5rem', cursor:'pointer',
                      border:`1px solid ${dipilih ? 'var(--primary)' : 'var(--glass-border)'}`,
                      background: dipilih ? 'rgba(79,70,229,0.06)' : 'var(--surface-color)',
                      borderRadius:'0.45rem', padding:'0.5rem 0.7rem' }}>
                      <input type="checkbox" checked={dipilih} onChange={()=>togglePilih(s.id)} style={{ accentColor:'var(--primary)' }} />
                      <span style={{ fontWeight:600, fontSize:'0.86rem' }}>{s.nama}</span>
                      <span style={{ fontSize:'0.78rem', color:'var(--text-secondary)' }}>{jam(s.jam_mulai)}–{jam(s.jam_selesai)}</span>
                    </label>
                  );
                })}
              </div>
            )}

            <p style={{ margin:'0.75rem 0 0', fontSize:'0.75rem', color:'var(--text-secondary)' }}>
              Boleh pilih lebih dari satu (mis. pecah jadi Pagi + Siang). Shift asal di tanggal ini akan diganti dengan yang dipilih. Ditolak kalau sudah ada absensinya.
            </p>

            <div style={{ display:'flex', gap:'0.65rem', justifyContent:'flex-end', marginTop:'1.25rem' }}>
              <button className="btn" onClick={()=>setModal(null)}>Batal</button>
              <button className="btn btn-primary" onClick={terapkan} disabled={proses || pilihShift.length===0}>
                {proses ? 'Menerapkan...' : 'Terapkan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal tolak */}
      {tolakModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth:400 }} onClick={e=>e.stopPropagation()}>
            <h2 style={{ fontWeight:700, fontSize:'1.05rem', margin:'0 0 0.85rem' }}>Tolak Permintaan</h2>
            <textarea rows={3} value={alasanTolak} onChange={e=>setAlasanTolak(e.target.value)}
              placeholder="Alasan penolakan..." style={{ width:'100%', padding:'0.55rem 0.75rem', borderRadius:'0.5rem', border:'1px solid var(--glass-border)', background:'var(--surface-color)', fontFamily:'inherit', fontSize:'0.88rem', boxSizing:'border-box', resize:'vertical' }} />
            <div style={{ display:'flex', gap:'0.65rem', justifyContent:'flex-end', marginTop:'0.85rem' }}>
              <button className="btn" onClick={()=>{ setTolakModal(null); setAlasanTolak(''); }}>Batal</button>
              <button className="btn" style={{ background:'#b91c1c', color:'#fff' }} onClick={tolak}>Tolak</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
