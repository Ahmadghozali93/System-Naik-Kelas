// Vercel serverless proxy — Odoo REST API dengan Bearer token

const ODOO_BASE = 'https://naik-kelas.odoo.com';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { odooPath, odooMethod = 'GET', odooBody, odooParams, apiKey } = req.body;

  if (!apiKey)   return res.status(400).json({ error: 'apiKey wajib diisi' });
  if (!odooPath) return res.status(400).json({ error: 'odooPath wajib diisi' });

  try {
    // Build query string — fields sebagai string, domain/context sebagai JSON
    let url = `${ODOO_BASE}${odooPath}`;
    if (odooParams && Object.keys(odooParams).length > 0) {
      const parts = [];
      for (const [k, v] of Object.entries(odooParams)) {
        if (v === undefined || v === null) continue;
        // fields: array → "id,name"  |  lainnya: JSON atau string
        let strVal;
        if (k === 'fields' && Array.isArray(v)) {
          strVal = v.join(',');
        } else if (typeof v === 'object') {
          strVal = JSON.stringify(v);
        } else {
          strVal = String(v);
        }
        parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(strVal)}`);
      }
      if (parts.length) url += `?${parts.join('&')}`;
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
    const odooStatus = odooResp.status;
    const text = await odooResp.text();

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      // Odoo mengembalikan HTML (misal halaman login) — auth gagal
      return res.status(200).json({
        error: `Odoo HTTP ${odooStatus} — kemungkinan API Key tidak valid atau endpoint salah. Response: ${text.slice(0, 300)}`
      });
    }

    // Sisipkan status Odoo agar error message lebih jelas
    if (!odooResp.ok && !json.error) {
      json.error = `Odoo HTTP ${odooStatus}`;
    }

    return res.status(200).json(json);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
