import { useState, useEffect } from 'react';
import { Printer, FileText, Wallet } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/authStore';
import SlipGajiPrintable from '../../components/gaji/SlipGajiPrintable';
import { dariSlipTersimpan } from '../../utils/slipModel';

const BULAN = ['', 'Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

export default function SlipSayaPage() {
  const { user } = useAuth();
  const [slips, setSlips]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [aktif, setAktif]     = useState(null);   // { slip, detail, bulan, tahun }
  const [memuatSlip, setMemuatSlip] = useState(false);

  useEffect(() => { if (user?.id) load(); }, [user?.id]);

  const load = async () => {
    setLoading(true);
    // RLS: guru hanya bisa melihat slip miliknya yang sudah 'dibayar'
    const { data } = await supabase
      .from('slip_gaji')
      .select('*, periode_payroll:periode_payroll_id(tahun, bulan, tanggal_kunci, disetujui_nama, disetujui_jabatan, disetujui_ttd)')
      .eq('guru_id', user.id)
      .eq('status', 'dibayar');
    const urut = (data || []).sort((a, b) => {
      const pa = a.periode_payroll, pb = b.periode_payroll;
      return (pb?.tahun - pa?.tahun) || (pb?.bulan - pa?.bulan);
    });
    setSlips(urut);
    setLoading(false);
    if (urut.length) buka(urut[0]);
  };

  const buka = async (slip) => {
    setMemuatSlip(true);
    const { data: detail } = await supabase
      .from('slip_gaji_detail').select('*')
      .eq('slip_gaji_id', slip.id).order('urutan_tampil');
    const per = slip.periode_payroll;
    setAktif({
      slip, detail: detail || [],
      bulan: per?.bulan, tahun: per?.tahun,
      persetujuan: per?.disetujui_nama ? {
        nama: per.disetujui_nama, jabatan: per.disetujui_jabatan,
        ttd: per.disetujui_ttd, tanggal: per.tanggal_kunci,
      } : null,
    });
    setMemuatSlip(false);
  };

  const model = aktif
    ? dariSlipTersimpan(aktif.slip, aktif.detail,
        { bulan: aktif.bulan, tahun: aktif.tahun, internal: false,
          persetujuan: aktif.persetujuan })
    : null;

  return (
    <div>
      <div style={{ marginBottom:'1.25rem' }} className="no-print">
        <p style={{ fontSize:'0.72rem', color:'var(--text-secondary)', margin:0, textTransform:'uppercase', letterSpacing:'0.05em' }}>Payroll</p>
        <h1 style={{ fontSize:'1.6rem', fontWeight:700, margin:0 }}>Slip Gaji Saya</h1>
        <p style={{ fontSize:'0.85rem', color:'var(--text-secondary)', margin:'0.25rem 0 0' }}>
          Slip yang sudah dibayarkan. Klik salah satu periode, lalu cetak atau simpan sebagai PDF.
        </p>
      </div>

      {loading ? (
        <p style={{ color:'var(--text-secondary)' }}>Memuat...</p>
      ) : slips.length === 0 ? (
        <div className="glass-card" style={{ padding:'3rem', textAlign:'center', color:'var(--text-secondary)' }}>
          <Wallet size={40} style={{ opacity:0.3, marginBottom:'0.75rem' }} />
          <p style={{ margin:0 }}>Belum ada slip gaji yang tersedia.</p>
          <p style={{ margin:'0.35rem 0 0', fontSize:'0.8rem' }}>Slip muncul di sini setelah periode gajimu ditandai dibayar.</p>
        </div>
      ) : (
        <div style={{ display:'flex', gap:'1.25rem', alignItems:'flex-start', flexWrap:'wrap' }}>
          {/* Daftar periode */}
          <div className="glass-card no-print" style={{ padding:'0.75rem', width:230, flexShrink:0 }}>
            <div style={{ fontSize:'0.72rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em', color:'var(--text-secondary)', padding:'0.35rem 0.5rem' }}>Periode</div>
            <div style={{ display:'flex', flexDirection:'column', gap:'0.25rem' }}>
              {slips.map(s => {
                const per = s.periode_payroll;
                const dipilih = aktif?.slip?.id === s.id;
                return (
                  <button key={s.id} onClick={() => buka(s)}
                    style={{ textAlign:'left', border:'none', borderRadius:'0.5rem', padding:'0.55rem 0.65rem', cursor:'pointer',
                      background: dipilih ? 'rgba(79,70,229,0.1)' : 'transparent',
                      color: dipilih ? 'var(--primary)' : 'var(--text-primary)', fontFamily:'inherit',
                      display:'flex', alignItems:'center', gap:'0.5rem', fontWeight: dipilih ? 700 : 500 }}>
                    <FileText size={15} />
                    <span>{BULAN[per?.bulan]} {per?.tahun}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Slip */}
          <div style={{ flex:1, minWidth:300 }}>
            <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:'0.75rem' }} className="no-print">
              <button className="btn btn-primary" onClick={() => window.print()} disabled={!model || memuatSlip}
                style={{ display:'flex', alignItems:'center', gap:'0.4rem' }}>
                <Printer size={15} /> Cetak / Simpan PDF
              </button>
            </div>
            {memuatSlip ? <p style={{ color:'var(--text-secondary)' }}>Memuat slip...</p> : <SlipGajiPrintable model={model} />}
          </div>
        </div>
      )}
    </div>
  );
}
