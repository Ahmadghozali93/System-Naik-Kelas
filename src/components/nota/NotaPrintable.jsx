import { formatRupiah } from '../../utils/formatRupiah';
import { terbilangRupiah } from '../../utils/terbilang';

// Nota bayar (kwitansi). Memakai class .slip-print-area agar ikut aturan
// cetak yang sudah ada di index.css — hanya nota yang tercetak.
// `nota` = hasil RPC nota_publik().

const fmtTanggal = (d) => d
  ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
  : '-';

const fmtPeriode = (d) => d
  ? new Date(d).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
  : '-';

export default function NotaPrintable({ nota }) {
  if (!nota) return null;

  const lembaga = nota.lembaga || 'Naik Kelas';
  const diskon  = Number(nota.diskon) || 0;
  const dibayar = Number(nota.nominal) || 0;
  const bruto   = dibayar + diskon;

  return (
    <div className="slip-print-area" style={{
      background:'#fff', color:'#111827', border:'1px solid #e5e7eb', borderRadius:'0.6rem',
      padding:'1.5rem 1.75rem', maxWidth:560, margin:'0 auto', fontSize:'0.85rem',
    }}>
      {/* KOP */}
      <div style={{ display:'flex', alignItems:'center', gap:'0.9rem', borderBottom:'2px solid #111827', paddingBottom:'0.85rem' }}>
        {nota.logo
          ? <img src={nota.logo} alt="Logo" style={{ width:46, height:46, borderRadius:8, objectFit:'cover' }} />
          : <div style={{ width:46, height:46, borderRadius:8, background:'#eef2ff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, color:'#4f46e5' }}>{lembaga[0].toUpperCase()}</div>}
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:800, fontSize:'1.05rem' }}>{lembaga}</div>
          {nota.unit && <div style={{ fontSize:'0.8rem', color:'#6b7280' }}>Unit {nota.unit}</div>}
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontWeight:700, letterSpacing:'0.06em', fontSize:'0.82rem' }}>KWITANSI</div>
          <div style={{ fontSize:'0.78rem', color:'#6b7280', fontVariantNumeric:'tabular-nums' }}>{nota.nomor_nota || '-'}</div>
        </div>
      </div>

      {/* IDENTITAS */}
      <div style={{ padding:'0.9rem 0', borderBottom:'1px solid #e5e7eb' }}>
        <Baris label="Diterima dari" value={nota.nama_siswa} tebal />
        <Baris label="Program"       value={nota.nama_program} />
        <Baris label="Untuk periode" value={fmtPeriode(nota.periode)} />
        <Baris label="Tanggal bayar" value={fmtTanggal(nota.tanggal_bayar)} />
        <Baris label="Metode"        value={nota.metode} />
      </div>

      {/* RINCIAN */}
      <table style={{ width:'100%', borderCollapse:'collapse', marginTop:'0.85rem' }}>
        <tbody>
          <tr>
            <td style={{ padding:'0.4rem 0' }}>SPP</td>
            <td style={{ padding:'0.4rem 0', textAlign:'right', whiteSpace:'nowrap' }}>{formatRupiah(bruto)}</td>
          </tr>
          {diskon > 0 && (
            <tr>
              <td style={{ padding:'0.4rem 0', color:'#b45309' }}>Diskon</td>
              <td style={{ padding:'0.4rem 0', textAlign:'right', whiteSpace:'nowrap', color:'#b45309' }}>− {formatRupiah(diskon)}</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* TOTAL + CAP LUNAS */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:'1rem',
        marginTop:'0.5rem', padding:'0.75rem 0.9rem', background:'#ecfdf5', border:'1px solid #a7f3d0', borderRadius:'0.5rem' }}>
        <span style={{ fontWeight:800 }}>DIBAYAR</span>
        <span style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
          <span style={{ border:'2px solid #047857', color:'#047857', borderRadius:'0.35rem',
            padding:'0.1rem 0.5rem', fontWeight:800, fontSize:'0.75rem', letterSpacing:'0.08em', transform:'rotate(-4deg)' }}>
            LUNAS
          </span>
          <span style={{ fontWeight:800, fontSize:'1.25rem', color:'#047857' }}>{formatRupiah(dibayar)}</span>
        </span>
      </div>

      <div style={{ marginTop:'0.5rem', fontSize:'0.78rem', fontStyle:'italic', color:'#374151' }}>
        Terbilang: {terbilangRupiah(dibayar)}
      </div>

      {/* FOOTER */}
      <div style={{ marginTop:'1.5rem', paddingTop:'0.75rem', borderTop:'1px solid #e5e7eb', fontSize:'0.72rem', color:'#6b7280' }}>
        <div>Nota ini sah tanpa tanda tangan basah dan diterbitkan otomatis oleh sistem.</div>
        {nota.terbit_pada && <div>Diterbitkan {fmtTanggal(nota.terbit_pada)}.</div>}
      </div>
    </div>
  );
}

function Baris({ label, value, tebal }) {
  return (
    <div style={{ display:'flex', gap:'0.5rem', fontSize:'0.85rem', padding:'0.12rem 0' }}>
      <span style={{ color:'#6b7280', minWidth:110 }}>{label}</span>
      <span style={{ color:'#6b7280' }}>:</span>
      <span style={{ fontWeight: tebal ? 700 : 600 }}>{value || '-'}</span>
    </div>
  );
}
