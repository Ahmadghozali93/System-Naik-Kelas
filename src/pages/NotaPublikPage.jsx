import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Printer, FileX } from 'lucide-react';
import { supabase } from '../lib/supabase';
import NotaPrintable from '../components/nota/NotaPrintable';

// Halaman publik: dibuka orang tua tanpa login lewat /nota/<token>.
// Datanya diambil dari fungsi nota_publik() — tabel pembayaran_spp
// sendiri tetap tertutup untuk pengunjung anonim.

export default function NotaPublikPage() {
  const { token } = useParams();
  const [nota, setNota]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let aktif = true;
    supabase.rpc('nota_publik', { p_token: token })
      .then(({ data, error }) => {
        if (!aktif) return;
        setNota(error ? null : data);
        setLoading(false);
      });
    return () => { aktif = false; };
  }, [token]);

  return (
    <div style={{ minHeight:'100vh', background:'#f3f4f6', padding:'2rem 1rem' }}>
      {loading ? (
        <p style={{ textAlign:'center', color:'#6b7280' }}>Memuat nota...</p>
      ) : !nota ? (
        <div style={{ maxWidth:420, margin:'3rem auto', textAlign:'center', color:'#6b7280' }}>
          <FileX size={44} style={{ opacity:0.35 }} />
          <h1 style={{ fontSize:'1.1rem', color:'#111827', margin:'0.75rem 0 0.35rem' }}>Nota tidak ditemukan</h1>
          <p style={{ fontSize:'0.85rem', margin:0 }}>
            Link mungkin salah ketik, sudah tidak berlaku, atau pembayarannya belum selesai diverifikasi.
            Silakan hubungi admin cabang Anda.
          </p>
        </div>
      ) : (
        <>
          <NotaPrintable nota={nota} />
          <div className="no-print" style={{ maxWidth:560, margin:'1rem auto 0', textAlign:'center' }}>
            <button onClick={() => window.print()}
              style={{ display:'inline-flex', alignItems:'center', gap:'0.4rem', border:'none',
                background:'#4f46e5', color:'#fff', borderRadius:'0.5rem', padding:'0.6rem 1.1rem',
                fontFamily:'inherit', fontSize:'0.88rem', fontWeight:600, cursor:'pointer' }}>
              <Printer size={16} /> Cetak / Simpan PDF
            </button>
          </div>
        </>
      )}
    </div>
  );
}
