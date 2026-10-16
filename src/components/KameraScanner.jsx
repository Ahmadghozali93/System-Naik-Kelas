import { useEffect, useRef, useState, useId } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats as F } from 'html5-qrcode';

// Kamera pembaca barcode/QR. Pemindai memanggil hasil ~10x/detik selama
// barcode ada di depan kamera, jadi kode yang sama diabaikan selama
// `jeda` ms — cukup untuk multi-scan tanpa satu buku terhitung berkali-kali.
const FORMAT_BUKU = [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.QR_CODE];

export default function KameraScanner({ onScan, formats = FORMAT_BUKU, jeda = 2000, tinggi = 220 }) {
  const id = 'kamera-' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const [error, setError] = useState('');
  const onScanRef = useRef(onScan);
  useEffect(() => { onScanRef.current = onScan; });
  const terakhir = useRef({ kode: '', waktu: 0 });

  useEffect(() => {
    const scanner = new Html5Qrcode(id, { formatsToSupport: formats, useBarCodeDetectorIfSupported: true, verbose: false });
    const mulai = scanner.start(
      { facingMode: 'environment' },
      // Kotak lebar-pendek: barcode buku berbentuk memanjang.
      { fps: 10, qrbox: (w, h) => ({ width: Math.min(w * 0.85, 420), height: Math.min(h * 0.55, 200) }) },
      (teks) => {
        const kini = Date.now();
        if (teks === terakhir.current.kode && kini - terakhir.current.waktu < jeda) return;
        terakhir.current = { kode: teks, waktu: kini };
        onScanRef.current(teks);
      },
      () => {},
    ).catch(err => setError(String(err?.message || err)));

    return () => {
      // Tunggu start selesai dulu; stop() sebelum kamera menyala melempar galat.
      mulai.then(() => scanner.isScanning ? scanner.stop() : null)
        .then(() => scanner.clear())
        .catch(() => {});
    };
  }, [id, formats, jeda]);

  return (
    <>
      <div id={id} style={{width:'100%',borderRadius:'0.5rem',overflow:'hidden',background:'#000',minHeight:tinggi}}/>
      {error && (
        <p style={{color:'#b91c1c',fontSize:'0.82rem',marginTop:'0.5rem'}}>
          Kamera tidak bisa dibuka: {error}. Pastikan izin kamera diberikan dan halaman dibuka lewat HTTPS.
        </p>
      )}
    </>
  );
}
