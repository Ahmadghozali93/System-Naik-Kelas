// Vercel serverless proxy — Odoo REST API (v17+) dengan Bearer token
// Tidak perlu session, tidak ada CORS

const ODOO_BASE = 'https://naik-kelas.odoo.com';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { odooPath, odooMethod = 'GET', odooBody, odooParams, apiKey } = req.body;

  if (!apiKey) return res.status(400).json({ error: 'apiKey wajib diisi' });
  if (!odooPath) return res.status(400).json({ error: 'odooPath wajib diisi' });

  try {
    // Build URL dengan query params
    let url = `${ODOO_BASE}${odooPath}`;
    if (odooParams && Object.keys(odooParams).length > 0) {
      const qs = Object.entries(odooParams)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(typeof v === 'object' ? JSON.stringify(v) : String(v))}`)
        .join('&');
      if (qs) url += `?${qs}`;
    }

    const fetchOptions = {
      method: odooMethod,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
    };

    if (odooBody && odooMethod !== 'GET') {
      fetchOptions.body = JSON.stringify(odooBody);
    }

    const odooResp = await fetch(url, fetchOptions);
    const text = await odooResp.text();

    let json;
    try { json = JSON.parse(text); }
    catch { return res.status(502).json({ error: `Odoo response tidak valid: ${text.slice(0, 200)}` }); }

    return res.status(200).json(json);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
