// Vercel serverless function — proxy ke Odoo JSON-RPC
// Menghindari CORS karena panggilan dilakukan dari server, bukan browser

const ODOO_BASE = 'https://naik-kelas.odoo.com';

export default async function handler(req, res) {
  // CORS headers agar browser bisa panggil /api/odoo-proxy
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { model, method, args = [], kwargs = {}, companyId, apiKey } = req.body;

  if (!apiKey) return res.status(400).json({ error: 'apiKey wajib diisi' });
  if (!model)  return res.status(400).json({ error: 'model wajib diisi' });

  const context = companyId
    ? { allowed_company_ids: [companyId], default_company_id: companyId }
    : {};

  try {
    const odooResp = await fetch(`${ODOO_BASE}/web/dataset/call_kw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
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

    const json = await odooResp.json();
    return res.status(200).json(json);
  } catch (err) {
    return res.status(500).json({
      error: { message: err.message, data: { message: err.message } }
    });
  }
}
