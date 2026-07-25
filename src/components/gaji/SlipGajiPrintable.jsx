import { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatRupiah } from '../../utils/formatRupiah';

const BULAN = ['', 'Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

const fmtTanggalPanjang = (d) =>
  new Date(d).toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' });

// Baca identitas lembaga dari app_settings (sudah disimpan Sidebar ke localStorage)
function bacaAppSettings() {
  try {
    const a = JSON.parse(localStorage.getItem('app_settings') || '{}');
    return { lembaga: a.appName || 'Naik Kelas', logo: a.logoUrl || '' };
  } catch {
    return { lembaga: 'Naik Kelas', logo: '' };
  }
}

const sum = (arr) => (arr || []).reduce((a, r) => a + Number(r.nominal || 0), 0);

function Baris({ nama, nominal, keterangan, potongan }) {
  return (
    <tr>
      <td style={{ padding:'0.4rem 0', verticalAlign:'top' }}>
        <div style={{ fontWeight:500 }}>{nama}</div>
        {keterangan && <div style={{ fontSize:'0.72rem', color:'#6b7280' }}>{keterangan}</div>}
      </td>
      <td style={{ padding:'0.4rem 0', textAlign:'right', whiteSpace:'nowrap', verticalAlign:'top' }}>
        {potongan ? '− ' : ''}{formatRupiah(nominal)}
      </td>
    </tr>
  );
}

export default function SlipGajiPrintable({ model }) {
  // Mulai dari cache localStorage, lalu segarkan dari Supabase agar logo
  // & nama lembaga tetap muncul walau cache belum terisi.
  const [app, setApp] = useState(bacaAppSettings);
  useEffect(() => {
    supabase.from('app_settings').select('key, value').in('key', ['app_name', 'logo_url'])
      .then(({ data }) => {
        if (!data) return;
        const row = {};
        data.forEach(r => { row[r.key] = r.value; });
        if (row.app_name || row.logo_url) {
          setApp({ lembaga: row.app_name || 'Naik Kelas', logo: row.logo_url || '' });
        }
      });
  }, []);

  if (!model) return null;
  const { lembaga, logo } = app;
  const totalPend = sum(model.pendapatan);
  const totalPot  = sum(model.potongan);
  const periodeText = `${BULAN[model.periode?.bulan] || ''} ${model.periode?.tahun || ''}`.trim();

  return (
    <div className="slip-print-area" style={{
      background:'#fff', color:'#111827', border:'1px solid #e5e7eb', borderRadius:'0.6rem',
      padding:'1.5rem 1.75rem', maxWidth:640, margin:'0 auto', fontSize:'0.85rem',
    }}>
      {/* KOP */}
      <div style={{ display:'flex', alignItems:'center', gap:'0.9rem', borderBottom:'2px solid #111827', paddingBottom:'0.85rem' }}>
        {logo
          ? <img src={logo} alt="Logo" style={{ width:46, height:46, borderRadius:8, objectFit:'cover' }} />
          : <div style={{ width:46, height:46, borderRadius:8, background:'#eef2ff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, color:'#4f46e5' }}>{(lembaga[0] || 'N').toUpperCase()}</div>}
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:800, fontSize:'1.05rem', letterSpacing:'0.01em' }}>{lembaga}</div>
          {model.unit && <div style={{ fontSize:'0.8rem', color:'#6b7280' }}>{model.unit}</div>}
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontWeight:700, letterSpacing:'0.06em', fontSize:'0.82rem' }}>SLIP GAJI</div>
          <div style={{ fontSize:'0.8rem', color:'#6b7280' }}>{periodeText}</div>
          {model.mode === 'pratinjau' && (
            <span style={{ display:'inline-block', marginTop:'0.25rem', background:'#fef3c7', color:'#92400e', padding:'0.1rem 0.5rem', borderRadius:999, fontSize:'0.68rem', fontWeight:800 }}>
              PRATINJAU — belum disimpan
            </span>
          )}
        </div>
      </div>

      {/* IDENTITAS */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.15rem 1.5rem', padding:'0.85rem 0', borderBottom:'1px solid #e5e7eb' }}>
        <Info label="Nama"    value={model.karyawan?.nama} />
        <Info label="Jabatan" value={model.karyawan?.jabatan} />
        <Info label="Periode" value={periodeText} />
        <Info label="Status"  value={model.karyawan?.status} />
      </div>

      {/* PENDAPATAN */}
      <Seksi judul="Pendapatan" total={totalPend} labelTotal="Total Pendapatan">
        {model.pendapatan.length
          ? model.pendapatan.map((r, i) => <Baris key={i} {...r} />)
          : <BarisKosong teks="Tidak ada pendapatan." />}
      </Seksi>

      {/* POTONGAN (hanya bila ada) */}
      {model.potongan.length > 0 && (
        <Seksi judul="Potongan" total={totalPot} labelTotal="Total Potongan" potongan>
          {model.potongan.map((r, i) => <Baris key={i} potongan {...r} />)}
        </Seksi>
      )}

      {/* GAJI BERSIH */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
        marginTop:'0.85rem', padding:'0.75rem 0.9rem', background:'#ecfdf5', border:'1px solid #a7f3d0', borderRadius:'0.5rem' }}>
        <span style={{ fontWeight:800 }}>GAJI BERSIH</span>
        <span style={{ fontWeight:800, fontSize:'1.25rem', color:'#047857' }}>{formatRupiah(model.gaji_bersih)}</span>
      </div>

      {/* CATATAN INTERNAL (tidak untuk guru) */}
      {model.internal && (model.peringatan || []).length > 0 && (
        <div style={{ marginTop:'1rem', background:'#fef3c7', border:'1px solid #fcd34d', borderRadius:'0.5rem', padding:'0.7rem 0.85rem' }} className="no-print">
          <div style={{ display:'flex', alignItems:'center', gap:'0.35rem', fontWeight:700, fontSize:'0.8rem', color:'#92400e', marginBottom:'0.35rem' }}>
            <AlertTriangle size={14}/> Catatan internal (tidak tampil di slip guru)
          </div>
          <ul style={{ margin:0, paddingLeft:'1.1rem', fontSize:'0.78rem', color:'#92400e' }}>
            {model.peringatan.map((w, i) => <li key={i}>{w.komponen ? `${w.komponen}: ` : ''}{w.pesan}</li>)}
          </ul>
        </div>
      )}

      {/* FOOTER: tanggal cetak + tanda tangan penyetuju */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginTop:'1.75rem', gap:'1rem' }}>
        <div style={{ fontSize:'0.75rem', color:'#6b7280' }}>
          Dicetak pada {fmtTanggalPanjang(new Date())}
        </div>
        <TandaTangan persetujuan={model.persetujuan} />
      </div>
    </div>
  );
}

// Blok tanda tangan. Kalau periode sudah disetujui (dikunci), tampilkan nama,
// jabatan, dan gambar tanda tangan penyetuju; kalau belum, tetap ruang kosong
// untuk ditandatangani manual.
function TandaTangan({ persetujuan }) {
  const disetujui = !!persetujuan?.nama;
  return (
    <div style={{ textAlign:'center', fontSize:'0.8rem' }}>
      <div style={{ color:'#6b7280' }}>
        {disetujui ? 'Disetujui oleh,' : 'Mengetahui,'}
      </div>

      <div style={{ height:'3.25rem', display:'flex', alignItems:'center', justifyContent:'center' }}>
        {disetujui && persetujuan.ttd && (
          <img src={persetujuan.ttd} alt="Tanda tangan"
            style={{ maxHeight:'3.1rem', maxWidth:170, objectFit:'contain' }} />
        )}
      </div>

      <div style={{ borderTop:'1px solid #111827', paddingTop:'0.25rem', minWidth:170 }}>
        {disetujui ? (
          <>
            <div style={{ fontWeight:700 }}>{persetujuan.nama}</div>
            {persetujuan.jabatan && (
              <div style={{ fontSize:'0.72rem', color:'#6b7280' }}>{persetujuan.jabatan}</div>
            )}
            {persetujuan.tanggal && (
              <div style={{ fontSize:'0.68rem', color:'#9ca3af' }}>
                Disetujui {fmtTanggalPanjang(persetujuan.tanggal)}
              </div>
            )}
          </>
        ) : 'Pimpinan'}
      </div>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div style={{ display:'flex', gap:'0.5rem', fontSize:'0.82rem' }}>
      <span style={{ color:'#6b7280', minWidth:64 }}>{label}</span>
      <span style={{ color:'#6b7280' }}>:</span>
      <span style={{ fontWeight:600 }}>{value || '-'}</span>
    </div>
  );
}

function Seksi({ judul, total, labelTotal, potongan, children }) {
  return (
    <div style={{ marginTop:'0.85rem' }}>
      <div style={{ fontSize:'0.72rem', fontWeight:800, textTransform:'uppercase', letterSpacing:'0.06em', color:'#6b7280', marginBottom:'0.2rem' }}>{judul}</div>
      <table style={{ width:'100%', borderCollapse:'collapse' }}>
        <tbody>
          {children}
          <tr style={{ borderTop:'1px solid #e5e7eb' }}>
            <td style={{ padding:'0.45rem 0', fontWeight:700 }}>{labelTotal}</td>
            <td style={{ padding:'0.45rem 0', textAlign:'right', fontWeight:700, whiteSpace:'nowrap' }}>
              {potongan ? '− ' : ''}{formatRupiah(total)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function BarisKosong({ teks }) {
  return (
    <tr><td colSpan={2} style={{ padding:'0.4rem 0', color:'#9ca3af', fontStyle:'italic' }}>{teks}</td></tr>
  );
}
