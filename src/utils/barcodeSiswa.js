// Kartu QR siswa — isi QR = id siswa (mis. SISWA-AB12CD),
// dibaca balik oleh halaman SPP > Scan Barcode.
import QRCode from 'qrcode';

const PAD    = 40;   // jarak isi ke bingkai
const BORDER = 6;    // tebal bingkai
const QR     = 420;  // sisi QR dalam piksel

export async function downloadBarcodeSiswa(siswa) {
  try {
    const qr = document.createElement('canvas');
    // margin 0 — ruang kosong di sekitar QR sudah diberi oleh PAD.
    await QRCode.toCanvas(qr, siswa.id, { width: QR, margin: 0, errorCorrectionLevel: 'M' });

    const fontId   = '600 28px Arial, sans-serif';
    const fontNama = '700 34px Arial, sans-serif';
    const nama = siswa.nama || '';

    const ukur = document.createElement('canvas').getContext('2d');
    ukur.font = fontNama;
    const lebarIsi = Math.max(QR, ukur.measureText(nama).width);

    const canvas = document.createElement('canvas');
    canvas.width  = Math.ceil(lebarIsi + PAD * 2);
    canvas.height = QR + PAD * 2 + 48 + 48;
    const ctx = canvas.getContext('2d');

    // Latar putih wajib — PNG transparan tidak terbaca scanner di layar gelap.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#111827';
    ctx.lineWidth = BORDER;
    ctx.beginPath();
    ctx.roundRect(BORDER / 2, BORDER / 2, canvas.width - BORDER, canvas.height - BORDER, 24);
    ctx.stroke();

    ctx.drawImage(qr, (canvas.width - QR) / 2, PAD);

    ctx.fillStyle = '#111827';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = fontId;
    ctx.fillText(siswa.id, canvas.width / 2, PAD + QR + 16);
    ctx.font = fontNama;
    ctx.fillText(nama, canvas.width / 2, PAD + QR + 16 + 44);

    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `qr-${siswa.id}-${nama.replace(/[^\w-]+/g, '_')}.png`;
    a.click();
  } catch (err) {
    alert('Gagal membuat QR: ' + (err?.message || err));
  }
}
