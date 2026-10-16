import { X } from 'lucide-react';
import { formatRupiah } from '../utils/formatRupiah';
import { addOneMonth } from '../utils/tagihan';
import { rentangPaket, METODE } from '../utils/pembayaranSpp';

// Popup "Bayar SPP" — satu tampilan untuk tiga tempat:
//   Tagihan Siswa  → langsung mencatat pembayaran
//   Scan Barcode   → guru mengisi, hasilnya masuk Log SPP (Menunggu)
//   Log SPP        → Learning Koordinator memeriksa lalu memvalidasi
//
// t    = satu baris dari buildTagihan (utils/tagihan.js)
// form = { tanggal_bayar, metode, catatan, diskon }
const fmt = (d) => d ? new Date(d).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : '-';

const lb = (text, req) => (
  <label className="form-label">
    {text}{req && <span className="wajib"> *</span>}
  </label>
);

export default function FormBayarSpp({
  t, form, setForm, onSubmit, onClose, dicatatOleh,
  labelDicatat = 'Dicatat oleh', labelSimpan = 'Simpan Pembayaran',
  menyimpan = false, sebelumForm = null, tombolTambahan = null,
}) {
  const isPaket    = t.siklus === 'sekali';
  const nominal    = t.nominal;
  const diskon     = Number(form.diskon) || 0;
  const yg_dibayar = Math.max(nominal - diskon, 0);
  const jt         = t.jatuh_tempo;

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:'1rem'}}>
      <div className="glass-card" style={{width:'100%',maxWidth:460,padding:'1.5rem',maxHeight:'90vh',overflowY:'auto'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
          <h3 style={{margin:0,fontWeight:700}}>{isPaket ? 'Bayar Paket' : 'Bayar SPP'}</h3>
          <button onClick={onClose} disabled={menyimpan} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-secondary)'}}><X size={18}/></button>
        </div>

        {/* Info siswa */}
        <div style={{background:'rgba(79,70,229,0.06)',border:'1px solid rgba(79,70,229,0.15)',borderRadius:'0.5rem',padding:'0.85rem 1rem',marginBottom:'1.25rem'}}>
          <div style={{fontWeight:700,fontSize:'1rem'}}>{t.nama_siswa}</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.25rem 1rem',fontSize:'0.82rem',color:'var(--text-secondary)',marginTop:'0.35rem'}}>
            <span><b style={{color:'var(--text-primary)'}}>Program:</b> {t.nama_program||'-'}</span>
            <span><b style={{color:'var(--text-primary)'}}>Unit:</b> {t.unit||'-'}</span>
            <span><b style={{color:'var(--text-primary)'}}>{isPaket ? 'Pertemuan:' : 'Mulai Les:'}</b> {isPaket ? rentangPaket(t) : fmt(t.tgl_mulai)}</span>
            <span><b style={{color:'var(--text-primary)'}}>Jatuh Tempo:</b> {fmt(jt)}</span>
          </div>
          <div style={{marginTop:'0.6rem',paddingTop:'0.5rem',borderTop:'1px solid rgba(79,70,229,0.15)',fontWeight:700,fontSize:'0.95rem'}}>
            {isPaket
              ? `Total paket (${t.jumlah_sesi} pertemuan): ${formatRupiah(nominal)}`
              : `Nominal SPP: ${formatRupiah(nominal)}`}
          </div>
        </div>

        {/* Dicatat oleh */}
        <div style={{display:'flex',alignItems:'center',gap:'0.5rem',padding:'0.45rem 0.75rem',background:'rgba(0,0,0,0.03)',borderRadius:'0.4rem',fontSize:'0.85rem',marginBottom:'0.9rem'}}>
          <span style={{color:'var(--text-secondary)',fontSize:'0.78rem',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em'}}>{labelDicatat}:</span>
          <span style={{fontWeight:700,color:'var(--primary)'}}>{dicatatOleh || '-'}</span>
        </div>

        {sebelumForm}

        <form onSubmit={onSubmit} style={{display:'flex',flexDirection:'column',gap:'0.9rem'}}>
          <div>
            {lb('Tanggal Bayar', true)}
            <input type="date" className="form-input" value={form.tanggal_bayar}
              onChange={e=>setForm(f=>({...f,tanggal_bayar:e.target.value}))} required/>
          </div>
          <div>
            {lb('Metode Pembayaran', true)}
            <select className="form-input" value={form.metode}
              onChange={e=>setForm(f=>({...f,metode:e.target.value}))} required>
              {METODE.map(m=><option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            {lb('Diskon (Rp)')}
            <input type="number" className="form-input" value={form.diskon}
              onChange={e=>setForm(f=>({...f,diskon:e.target.value}))}
              min="0" max={nominal} placeholder="0"/>
          </div>
          <div>
            {lb('Catatan')}
            <input className="form-input" value={form.catatan}
              onChange={e=>setForm(f=>({...f,catatan:e.target.value}))}
              placeholder="Opsional"/>
          </div>

          {/* Ringkasan */}
          <div style={{background:'rgba(16,185,129,0.08)',border:'1px solid rgba(16,185,129,0.2)',borderRadius:'0.5rem',padding:'0.7rem 1rem',fontSize:'0.85rem'}}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:'0.25rem'}}>
              <span style={{color:'var(--text-secondary)'}}>{isPaket ? `Total ${t.jumlah_sesi} pertemuan` : 'Nominal SPP'}</span>
              <span style={{fontWeight:600}}>{formatRupiah(nominal)}</span>
            </div>
            {diskon>0&&(
              <div style={{display:'flex',justifyContent:'space-between',color:'#b45309',marginBottom:'0.25rem'}}>
                <span>Diskon</span>
                <span style={{fontWeight:600}}>– {formatRupiah(diskon)}</span>
              </div>
            )}
            <div style={{display:'flex',justifyContent:'space-between',paddingTop:'0.35rem',borderTop:'1px solid rgba(16,185,129,0.25)',fontWeight:700}}>
              <span>Yang Dibayar</span>
              <span style={{color:'#047857'}}>{formatRupiah(yg_dibayar)}</span>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',marginTop:'0.3rem',fontSize:'0.78rem',color:'var(--text-secondary)'}}>
              <span>{isPaket ? 'Paket' : 'Periode dibayar'}</span>
              <span style={{fontWeight:600}}>{isPaket ? rentangPaket(t) : fmt(jt)}</span>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',marginTop:'0.2rem',fontSize:'0.78rem',color:'var(--text-secondary)'}}>
              {isPaket ? (
                <span style={{fontWeight:600,color:'#047857'}}>Pelunasan paket — tidak ada tagihan lanjutan.</span>
              ) : (
                <>
                  <span>Jatuh tempo berikutnya</span>
                  <span style={{fontWeight:600,color:'#047857'}}>{fmt(addOneMonth(jt))}</span>
                </>
              )}
            </div>
          </div>

          <div style={{display:'flex',gap:'0.75rem'}}>
            <button type="submit" className="btn btn-primary" style={{flex:1}} disabled={menyimpan}>
              {menyimpan ? 'Menyimpan...' : labelSimpan}
            </button>
            {tombolTambahan}
            <button type="button" className="btn" onClick={onClose} disabled={menyimpan} style={{background:'var(--surface-color)'}}>Batal</button>
          </div>
        </form>
      </div>
    </div>
  );
}
