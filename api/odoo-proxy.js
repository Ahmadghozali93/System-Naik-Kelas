// Vercel serverless proxy ke Odoo JSON-RPC
// Flow: authenticate dulu (email+apiKey) → dapat session cookie → pakai untuk API call

const ODOO_BASE = 'https://naik-kelas.odoo.com';
const ODOO_DB   = 'naik-kelas';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const { model, method, args = [], kwargs = {}, companyId, apiKey, email } = req.body;
  if (!apiKey) return res.status(400).json({ error: { message: 'apiKey wajib diisi', data: { message: 'apiKey wajib diisi' } } });
  if (!email)  return res.status(400).json({ error: { message: 'email wajib diisi', data: { message: 'email wajib diisi' } } });

  try {
    // ── 1. Authenticate → dapat session cookie ──────────────────────────────
    const authResp = await fetch(`${ODOO_BASE}/web/session/authenticate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', method: 'call', id: 1,
        params: { db: ODOO_DB, login: email, password: apiKey },
      }),
    });

    const authJson = await authResp.json();

    if (!authJson.result?.uid) {
      const msg = authJson.error?.data?.message || authJson.error?.message || 'Autentikasi Odoo gagal. Cek email & API Key.';
      return res.status(401).json({ error: { message: msg, data: { message: msg } } });
    }

    // Ekstrak session_id dari Set-Cookie header
    const rawCookie = authResp.headers.get('set-cookie') || '';
    const sessionMatch = rawCookie.match(/session_id=([^;]+)/);
    const sessionCookie = sessionMatch ? `session_id=${sessionMatch[1]}` : '';

    // ── 2. Panggil model/method dengan session ──────────────────────────────
    const context = companyId
      ? { allowed_company_ids: [companyId], default_company_id: companyId }
      : {};

    const rpcHeaders = { 'Content-Type': 'application/json' };
    if (sessionCookie) rpcHeaders['Cookie'] = sessionCookie;

    const rpcResp = await fetch(`${ODOO_BASE}/web/dataset/call_kw`, {
      method: 'POST',
      headers: rpcHeaders,
      body: JSON.stringify({
        jsonrpc: '2.0', method: 'call', id: Date.now(),
        params: {
          model, method, args,
          kwargs: { ...kwargs, context },
        },
      }),
    });

    const json = await rpcResp.json();
    return res.status(200).json(json);

  } catch (err) {
    return res.status(500).json({
      error: { message: err.message, data: { message: err.message } },
    });
  }
}
