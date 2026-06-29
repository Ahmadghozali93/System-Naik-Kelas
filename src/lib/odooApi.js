// Odoo REST API (v17+/v19) via Vercel proxy
// Auth: Bearer API Key — tidak perlu session/email

export const UNIT_COMPANY = {
  'Sarirejo':    2,
  'Plantaran':   3,
  'Krajankulon': 4,
  'Magelung':    5,
};

// ─── Low-level REST helpers ──────────────────────────────────────────────────

async function odooGet(path, params, apiKey) {
  const resp = await fetch('/api/odoo-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ odooPath: path, odooMethod: 'GET', odooParams: params, apiKey }),
  });
  const data = await resp.json();
  if (data.error) throw new Error(typeof data.error === 'string' ? data.error : (data.error.message || JSON.stringify(data.error)));
  return data;
}

async function odooPost(path, body, apiKey) {
  const resp = await fetch('/api/odoo-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ odooPath: path, odooMethod: 'POST', odooBody: body, apiKey }),
  });
  const data = await resp.json();
  if (data.error) throw new Error(typeof data.error === 'string' ? data.error : (data.error.message || JSON.stringify(data.error)));
  return data;
}

// Normalise: Odoo REST bisa return array atau { records: [...] }
function toArray(data) {
  if (Array.isArray(data)) return data;
  if (data?.records) return data.records;
  return [];
}

// ─── Test Connection ─────────────────────────────────────────────────────────

export async function testConnection(apiKey) {
  const data = await odooGet('/api/res.users', { fields: ['id', 'name'], limit: 1 }, apiKey);
  const rows = toArray(data);
  if (rows.length === 0) throw new Error('Terhubung ke Odoo tapi tidak ada data user.');
  return rows[0];
}

// ─── Partner (Customer) ──────────────────────────────────────────────────────

export async function getOrCreatePartner(apiKey, _email, name) {
  const data = await odooGet('/api/res.partner', {
    domain: [['name', '=', name]],
    fields: ['id', 'name'],
    limit: 1,
  }, apiKey);
  const rows = toArray(data);
  if (rows.length > 0) return rows[0].id;

  const created = await odooPost('/api/res.partner', { name, customer_rank: 1 }, apiKey);
  return created.id;
}

// ─── Product ─────────────────────────────────────────────────────────────────

export async function findProduct(apiKey, _email, productName, companyId) {
  const data = await odooGet('/api/product.product', {
    domain: [['name', 'ilike', productName], '|', ['company_id', '=', companyId], ['company_id', '=', false]],
    fields: ['id', 'name'],
    limit: 1,
    context: { allowed_company_ids: [companyId] },
  }, apiKey);
  const rows = toArray(data);
  return rows[0] || null;
}

// ─── Invoice ─────────────────────────────────────────────────────────────────

export async function createInvoice(apiKey, _email, {
  companyId, partnerId, productId, namaProgram,
  nominal, diskon, tanggalBayar, namaSiswa,
}) {
  const lines = [
    {
      product_id: productId || false,
      name: namaProgram,
      quantity: 1,
      price_unit: (nominal || 0) + (diskon || 0),
    },
  ];
  if (diskon > 0) {
    lines.push({ name: 'Diskon', quantity: 1, price_unit: -(diskon) });
  }

  const inv = await odooPost('/api/account.move', {
    move_type: 'out_invoice',
    partner_id: partnerId,
    company_id: companyId,
    invoice_date: tanggalBayar || new Date().toISOString().split('T')[0],
    ref: `SPP - ${namaSiswa}`,
    invoice_line_ids: lines,
  }, apiKey);

  return {
    id: inv.id,
    name: inv.name || inv.display_name || `INV#${inv.id}`,
    status: inv.payment_state || 'not_paid',
  };
}

// ─── Refresh status invoice ──────────────────────────────────────────────────

export async function getInvoiceStatus(apiKey, _email, invoiceId, _companyId) {
  const data = await odooGet(`/api/account.move/${invoiceId}`, {
    fields: ['id', 'name', 'payment_state', 'state'],
  }, apiKey);
  // Single record GET returns object, not array
  return data;
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
