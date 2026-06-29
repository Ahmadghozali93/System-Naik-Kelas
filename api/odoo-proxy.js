// Vercel serverless proxy ke Odoo JSON-RPC
// Autentikasi: HTTP Basic Auth (email:apiKey) — tidak perlu session

const ODOO_BASE = 'https://naik-kelas.odoo.com';
const ODOO_DB   = 'naik-kelas';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: { message: 'Method not allowed' } });

  const { model, method, args = [], kwargs = {}, companyId, apiKey, email } = req.body;
  if (!apiKey) return res.status(400).json({ error: { message: 'apiKey wajib diisi', data: { message: 'apiKey wajib diisi' } } });

  const context = companyId
    ? { allowed_company_ids: [companyId], default_company_id: companyId }
    : {};

  try {
    // Basic Auth: email:apiKey (Odoo 16+ mendukung ini di JSON-RPC)
    const basicCreds = email
      ? Buffer.from(`${email}:${apiKey}`).toString('base64')
      : null;

    const headers = { 'Content-Type': 'application/json' };
    if (basicCreds) headers['Authorization'] = `Basic ${basicCreds}`;

    const rpcResp = await fetch(`${ODOO_BASE}/web/dataset/call_kw`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0', method: 'call', id: Date.now(),
        params: {
          model, method, args,
          kwargs: { ...kwargs, context },
        },
      }),
    });

    const json = await rpcResp.json();

    // Jika Basic Auth gagal → coba via session
    if (json.error?.data?.name === 'odoo.exceptions.AccessDenied' ||
        json.error?.message?.includes('Session expired') ||
        json.error?.message?.includes('Access Denied')) {

      if (!email) {
        const msg = 'Autentikasi gagal. Isi email di Pengaturan Odoo.';
        return res.status(401).json({ error: { message: msg, data: { message: msg } } });
      }

      // Fallback: session auth
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
        const msg = authJson.error?.data?.message || authJson.error?.message
          || 'Autentikasi gagal. Pastikan API Key masih aktif dan tidak dihapus di Odoo.';
        return res.status(401).json({ error: { message: msg, data: { message: msg } } });
      }

      const rawCookie = authResp.headers.get('set-cookie') || '';
      const sessionMatch = rawCookie.match(/session_id=([^;]+)/);
      const sessionCookie = sessionMatch ? `session_id=${sessionMatch[1]}` : '';

      const rpcResp2 = await fetch(`${ODOO_BASE}/web/dataset/call_kw`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionCookie ? { Cookie: sessionCookie } : {}),
        },
        body: JSON.stringify({
          jsonrpc: '2.0', method: 'call', id: Date.now(),
          params: { model, method, args, kwargs: { ...kwargs, context } },
        }),
      });
      const json2 = await rpcResp2.json();
      return res.status(200).json(json2);
    }

    return res.status(200).json(json);

  } catch (err) {
    const msg = err.message || 'Unknown error';
    return res.status(500).json({ error: { message: msg, data: { message: msg } } });
  }
}
