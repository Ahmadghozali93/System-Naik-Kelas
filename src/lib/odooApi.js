// Odoo XML-RPC via Vercel proxy (/api/odoo-proxy)
// Tidak perlu session, bekerja di semua versi Odoo

export const UNIT_COMPANY = {
  'Sarirejo':    2,
  'Plantaran':   3,
  'Krajankulon': 4,
  'Magelung':    5,
};

// Konfigurasi Odoo — diset lewat configureOdoo() setelah load dari Supabase
let _odooUrl = 'https://naik-kelas.odoo.com';
let _odooDb  = 'naik-kelas';

export function configureOdoo({ odooUrl, odooDb }) {
  if (odooUrl) _odooUrl = odooUrl;
  if (odooDb)  _odooDb  = odooDb;
}

// ─── Low-level XML-RPC proxy call ───────────────────────────────────────────

async function rpc(model, method, args = [], kwargs = {}, apiKey, email, companyId) {
  const resp = await fetch('/api/odoo-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, method, args, kwargs, companyId, apiKey, email, odooUrl: _odooUrl, odooDb: _odooDb }),
  });

  // Proxy selalu menjawab JSON, bahkan saat gagal. Kalau yang datang bukan
  // JSON, berarti permintaannya tidak pernah sampai ke sana — dan resp.json()
  // akan melempar pesan bawaan peramban yang tidak menjelaskan apa pun
  // ("The string did not match the expected pattern" di Safari).
  const teks = await resp.text();
  let data;
  try {
    data = JSON.parse(teks);
  } catch {
    throw new Error(
      resp.status === 404
        ? 'Alamat /api/odoo-proxy tidak ditemukan. Fungsi di folder api/ hanya hidup di lingkungan yang menjalankannya — pastikan dev server dijalankan ulang setelah perubahan vite.config.js, atau uji di alamat produksi.'
        : `Proxy Odoo menjawab bukan JSON (status ${resp.status}): ${teks.slice(0, 150) || '(badan kosong)'}`
    );
  }

  if (data.error) {
    const msg = data.error?.data?.message || data.error?.message || JSON.stringify(data.error);
    throw new Error(ringkasGalatOdoo(msg));
  }
  return data.result;
}

// Odoo membalas kegagalan dengan seluruh traceback Python. Yang berguna bagi
// operator adalah baris terakhirnya — sisanya dibuang ke konsol supaya tetap
// bisa dibaca saat menelusuri.
function ringkasGalatOdoo(pesan) {
  const teks  = String(pesan).trim();
  const baris = teks.split('\n').map(b => b.trim()).filter(Boolean);
  if (baris.length <= 3) return teks;
  console.error('[Odoo] galat lengkap:\n' + teks);
  return `${baris[baris.length - 1]}\n\n(rincian lengkapnya ada di konsol peramban)`;
}

// ─── Test Connection ─────────────────────────────────────────────────────────

export async function testConnection(apiKey, email) {
  const result = await rpc('res.users', 'search_read',
    [[['active', '=', true]]],
    { fields: ['id', 'name'], limit: 1 },
    apiKey, email
  );
  if (!result || result.length === 0) throw new Error('Terhubung ke Odoo tapi tidak ada data user.');
  return result[0];
}

// ─── Partner (Customer) ──────────────────────────────────────────────────────

export async function searchPartners(apiKey, email, query) {
  return rpc('res.partner', 'search_read',
    [[['name', 'ilike', query], ['customer_rank', '>', 0]]],
    { fields: ['id', 'name'], limit: 10, order: 'name asc' },
    apiKey, email
  );
}

export async function getOrCreatePartner(apiKey, email, name) {
  const found = await rpc('res.partner', 'search_read',
    [[['name', '=', name]]],
    { fields: ['id', 'name'], limit: 1 },
    apiKey, email
  );
  if (found.length > 0) return found[0].id;

  const id = await rpc('res.partner', 'create',
    [{ name, customer_rank: 1 }],
    {},
    apiKey, email
  );
  return id;
}

// ─── Kontak siswa ────────────────────────────────────────────────────────────
// Dipakai halaman Siswa. Berbeda dari getOrCreatePartner() di atas yang
// mencocokkan nama SAMA PERSIS lalu langsung membuat kalau tidak ketemu —
// di sini pencariannya longgar dan hasilnya dikembalikan ke pemanggil supaya
// operator bisa memutuskan, sebab siswa yang pernah difakturkan sudah punya
// kontak dan tidak boleh dibuat dua kali.

const angkaSaja = (v) => String(v || '').replace(/\D/g, '');

// 08xx / 62xx / +62xx → +62xx
export function nomorInternasional(nowa) {
  const a = angkaSaja(nowa);
  if (!a) return '';
  if (a.startsWith('62')) return '+' + a;
  if (a.startsWith('0'))  return '+62' + a.slice(1);
  return '+' + a;
}

// Dua nomor dianggap sama bila sembilan angka terakhirnya sama — cukup untuk
// mengabaikan beda awalan 0/62/+62 tanpa menyamakan nomor yang benar-benar beda.
const nomorSama = (a, b) => {
  const x = angkaSaja(a), y = angkaSaja(b);
  return x.length >= 9 && y.length >= 9 && x.slice(-9) === y.slice(-9);
};

const keteranganKontak = (siswa) => {
  const baris = [];
  if (siswa.nama_ortu) baris.push(`Orang tua/wali: ${siswa.nama_ortu}`);
  if (siswa.unit)      baris.push(`Unit: ${siswa.unit}`);
  return baris.join('\n');
};

// Kandidat kontak yang mungkin sudah mewakili siswa ini.
// cocokTelepon = nomornya juga sama, jadi hampir pasti orang yang sama.
export async function cariKontakSiswa(apiKey, email, { nama, nowa }) {
  if (!nama) return [];
  const rows = await rpc('res.partner', 'search_read',
    [[['name', 'ilike', nama]]],
    // Odoo 19 menghapus field 'mobile' dari res.partner dan meleburnya ke
    // 'phone'. Memintanya membuat search_read gagal dengan KeyError, jadi
    // hanya 'phone' yang dipakai — field itu ada di semua versi.
    { fields: ['id', 'name', 'phone', 'street'], limit: 10, order: 'id asc' },
    apiKey, email
  );
  return rows.map(r => ({
    ...r,
    cocokTelepon: nomorSama(nowa, r.phone),
  }));
}

// Kontak sengaja dibuat tanpa company_id supaya menjadi milik bersama:
// siswa yang pindah cabang tetap bisa ditagih dari cabang mana pun.
export async function buatKontakSiswa(apiKey, email, siswa) {
  const id = await rpc('res.partner', 'create',
    [{
      name:          siswa.nama,
      customer_rank: 1,
      phone:         nomorInternasional(siswa.nowa) || false,
      street:        siswa.alamat || false,
      comment:       keteranganKontak(siswa) || false,
    }],
    {},
    apiKey, email
  );
  return { id, name: siswa.nama };
}

// ─── Product ─────────────────────────────────────────────────────────────────

export async function findProduct(apiKey, email, productName, companyId) {
  const found = await rpc('product.product', 'search_read',
    [[
      ['name', 'ilike', productName],
      '|',
      ['company_id', '=', companyId],
      ['company_id', '=', false],
    ]],
    { fields: ['id', 'name'], limit: 1 },
    apiKey, email, companyId
  );
  return found[0] || null;
}

// ─── Invoice ─────────────────────────────────────────────────────────────────

export async function createInvoice(apiKey, email, {
  companyId, partnerId, productId, namaProgram,
  nominal, diskon, tanggalBayar, namaSiswa,
  metodeBayar, tanggalJatuhTempo,
}) {
  const lines = [
    [0, 0, {
      product_id: productId || false,
      name: namaProgram,
      quantity: 1,
      price_unit: (nominal || 0) + (diskon || 0),
    }],
  ];
  if (diskon > 0) {
    lines.push([0, 0, { name: 'Diskon', quantity: 1, price_unit: -(diskon) }]);
  }

  const today = new Date().toISOString().split('T')[0];
  const invoicePayload = {
    move_type: 'out_invoice',
    partner_id: partnerId,
    company_id: companyId,
    invoice_date:     tanggalBayar || today,
    invoice_date_due: tanggalJatuhTempo || tanggalBayar || today,
    ref: `SPP - ${namaSiswa}`,
    invoice_line_ids: lines,
  };
  const catatanParts = [];
  if (metodeBayar) catatanParts.push(`Metode Pembayaran: ${metodeBayar}`);
  if (tanggalJatuhTempo) {
    const tglFmt = new Date(tanggalJatuhTempo + 'T00:00:00')
      .toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
    catatanParts.push(`Jatuh Tempo: ${tglFmt}`);
  }
  if (catatanParts.length > 0) invoicePayload.narration = catatanParts.join('  |  ');

  const invoiceId = await rpc('account.move', 'create',
    [invoicePayload],
    {},
    apiKey, email, companyId
  );

  const [inv] = await rpc('account.move', 'read',
    [[invoiceId]],
    { fields: ['id', 'name', 'payment_state'] },
    apiKey, email, companyId
  );

  return { id: invoiceId, name: inv.name, status: inv.payment_state };
}

// ─── Refresh status invoice ──────────────────────────────────────────────────

export async function getInvoiceStatus(apiKey, email, invoiceId, companyId) {
  const [inv] = await rpc('account.move', 'read',
    [[invoiceId]],
    { fields: ['id', 'name', 'payment_state', 'state'] },
    apiKey, email, companyId
  );
  return inv;
}

// ─── Settings via Supabase ───────────────────────────────────────────────────

export async function loadOdooSettings(supabase) {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['odoo_api_key', 'odoo_email', 'odoo_url', 'odoo_db']);
    if (error || !data) return {};
    return Object.fromEntries(data.map(r => [r.key, r.value]));
  } catch {
    return {};
  }
}

export async function saveOdooSettings(supabase, { apiKey, email, odooUrl, odooDb }) {
  const upserts = [
    { key: 'odoo_api_key', value: apiKey  },
    { key: 'odoo_email',   value: email   },
    { key: 'odoo_url',     value: odooUrl },
    { key: 'odoo_db',      value: odooDb  },
  ];
  const { error } = await supabase.from('app_settings').upsert(upserts, { onConflict: 'key' });
  if (error) throw error;
}
