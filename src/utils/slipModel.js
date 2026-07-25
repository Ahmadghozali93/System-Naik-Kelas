// Adapter data slip → model seragam untuk <SlipGajiPrintable>.
// Dipisah dari komponen agar file komponen hanya meng-export komponen
// (syarat React Fast Refresh).

// ── Dari slip tersimpan (slip_gaji + slip_gaji_detail) ──
export function dariSlipTersimpan(slip, detailRows, opts = {}) {
  const snap = slip.snapshot_karyawan || {};
  const map = (kat) => (detailRows || [])
    .filter(d => d.kategori === kat)
    .map(d => ({ nama: d.nama_komponen, nominal: Number(d.nominal), keterangan: d.keterangan_hitung }));
  const [thn, bln] = (snap.periode || '').split('-');
  return {
    karyawan: {
      nama: slip.gurus?.nama || snap.nama || '-',
      jabatan: snap.jabatan || slip.gurus?.role || '-',
      status: slip.status === 'dibayar' ? 'LUNAS' : (slip.status || '').toUpperCase(),
    },
    periode: { bulan: opts.bulan ?? Number(bln), tahun: opts.tahun ?? Number(thn) },
    unit: opts.unitNama || '',
    pendapatan: map('pendapatan'),
    potongan: map('potongan'),
    gaji_bersih: Number(slip.gaji_bersih),
    peringatan: slip.peringatan || [],
    internal: !!opts.internal,      // tampilkan catatan internal? (admin ya, guru tidak)
    // { nama, jabatan, ttd, tanggal } — snapshot penyetuju saat periode dikunci
    persetujuan: opts.persetujuan || null,
    mode: 'final',
  };
}

// ── Dari hasil simulasi_slip_gaji (JSONB, untuk Uji Coba) ──
export function dariSimulasi(hasil, opts = {}) {
  const map = (kat) => (hasil.rincian || [])
    .filter(r => r.kategori === kat)
    .map(r => ({ nama: r.komponen, nominal: Number(r.nominal), keterangan: r.keterangan }));
  return {
    karyawan: { nama: opts.nama || '-', jabatan: opts.jabatan || '-', status: 'PRATINJAU' },
    periode: { bulan: opts.bulan, tahun: opts.tahun },
    unit: opts.unitNama || '',
    pendapatan: map('pendapatan'),
    potongan: map('potongan'),
    gaji_bersih: Number(hasil.gaji_bersih),
    peringatan: hasil.peringatan || [],
    internal: true,
    mode: 'pratinjau',
  };
}
