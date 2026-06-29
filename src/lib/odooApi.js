// Odoo JSON-RPC API integration
// Autentikasi: Bearer API Key (Odoo 17+)

const BASE = 'https://naik-kelas.odoo.com';
const DB   = 'naik-kelas';

export const UNIT_COMPANY = {
  'Sarirejo':    2,
  'Plantaran':   3,
  'Krajankulon': 4,
  'Magelung':    5,
};

// ─── Low-level RPC ──────────────────────────────────────────────────────────

async function rpc(model, method, args = [], kwargs = {}, apiKey, companyId) {
  const context = companyId
    ? { allowed_company_ids: [companyId], default_company_id: companyId }
    : {};

  const resp = await fetch(`${BASE}/web/dataset/call_kw`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    mode: 'cors',
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      id: Date.now(),
      params: {
        model,
        method,
        args,
        kwargs: { ...kwargs, context },
      },
    }),
  });

  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);

  const json = await resp.json();
  if (json.error) {
    const msg = json.error.data?.message || json.error.message || 'Odoo error';
    throw new Error(msg);
  }
  return json.result;
}

// ─── Auth & Connection ───────────────────────────────────────────────────────

export async function testConnection(apiKey) {
  const result = await rpc('res.users', 'search_read',
    [[['active', '=', true]]],
    { fields: ['id', 'name'], limit: 1 },
    apiKey
  );
  if (!result || result.length === 0) throw new Error('Koneksi berhasil tapi tidak ada data user.');
  return result[0];
}

// ─── Partner (Customer) ──────────────────────────────────────────────────────

export async function getOrCreatePartner(apiKey, name) {
  const found = await rpc('res.partner', 'search_read',
    [[['name', '=', name]]],
    { fields: ['id', 'name'], limit: 1 },
    apiKey
  );
  if (found.length > 0) return found[0].id;

  const [id] = await rpc('res.partner', 'create',
    [{ name, customer_rank: 1 }],
    {},
    apiKey
  );
  return id;
}

// ─── Product ─────────────────────────────────────────────────────────────────

export async function findProduct(apiKey, productName, companyId) {
  const found = await rpc('product.product', 'search_read',
    [[
      ['name', 'ilike', productName],
      '|',
      ['company_id', '=', companyId],
      ['company_id', '=', false],
    ]],
    { fields: ['id', 'name'], limit: 1 },
    apiKey,
    companyId
  );
  return found[0] || null;
}

// ─── Invoice ─────────────────────────────────────────────────────────────────

export async function createInvoice(apiKey, {
  companyId, partnerId, productId, namaProgram,
  nominal, diskon, tanggalBayar, namaSiswa,
}) {
  const lines = [
    [0, 0, {
      product_id: productId || false,
      name: namaProgram,
      quantity: 1,
      price_unit: (nominal || 0) + (diskon || 0), // nominal SPP sebelum diskon
    }],
  ];

  if (diskon > 0) {
    lines.push([0, 0, {
      name: 'Diskon',
      quantity: 1,
      price_unit: -(diskon),
    }]);
  }

  const invoiceData = {
    move_type: 'out_invoice',
    partner_id: partnerId,
    company_id: companyId,
    invoice_date: tanggalBayar || new Date().toISOString().split('T')[0],
    ref: `SPP - ${namaSiswa}`,
    invoice_line_ids: lines,
  };

  const [invoiceId] = await rpc('account.move', 'create',
    [invoiceData],
    {},
    apiKey,
    companyId
  );

  // Ambil nama dan status invoice
  const [inv] = await rpc('account.move', 'read',
    [[invoiceId]],
    { fields: ['id', 'name', 'payment_state'] },
    apiKey,
    companyId
  );

  return {
    id: invoiceId,
    name: inv.name,
    status: inv.payment_state, // 'not_paid' | 'in_payment' | 'paid'
  };
}

// ─── Cek status invoice yg sudah ada ─────────────────────────────────────────

export async function getInvoiceStatus(apiKey, invoiceId, companyId) {
  const [inv] = await rpc('account.move', 'read',
    [[invoiceId]],
    { fields: ['id', 'name', 'payment_state', 'state'] },
    apiKey,
    companyId
  );
  return inv;
}

// ─── Settings via Supabase ───────────────────────────────────────────────────

export async function loadOdooSettings(supabase) {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['odoo_api_key', 'odoo_email']);
    if (error || !data) return {};
    return Object.fromEntries(data.map(r => [r.key, r.value]));
  } catch {
    return {};
  }
}

export async function saveOdooSettings(supabase, { apiKey, email }) {
  const upserts = [
    { key: 'odoo_api_key', value: apiKey },
    { key: 'odoo_email',   value: email  },
  ];
  const { error } = await supabase.from('app_settings').upsert(upserts, { onConflict: 'key' });
  if (error) throw error;
}
