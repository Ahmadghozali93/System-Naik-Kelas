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
  const data = await resp.json();
  if (data.error) {
    const msg = data.error?.data?.message || data.error?.message || JSON.stringify(data.error);
    throw new Error(msg);
  }
  return data.result;
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
