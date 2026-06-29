// Vercel serverless proxy ke Odoo JSON-RPC
// Untuk Odoo SaaS: coba authenticate tanpa db dulu (db auto-detect dari hostname)

const ODOO_BASE = 'https://naik-kelas.odoo.com';
const ODOO_DB   = 'naik-kelas';

async function getSession(email, apiKey) {
  // Coba 1: tanpa db (Odoo SaaS auto-detect dari subdomain)
  for (const params of [
    { login: email, password: apiKey },
    { db: ODOO_DB, login: email, password: apiKey },
  ]) {
    const resp = await fetch(`${ODOO_BASE}/web/session/authenticate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', method: 'call', id: 1,
        params,
      }),
    });

    const json = await resp.json();

    if (json.result?.uid) {
      const rawCookie = resp.headers.get('set-cookie') || '';
      const match = rawCookie.match(/session_id=([^;]+)/);
      return { uid: json.result.uid, cookie: match ? `session_id=${match[1]}` : '' };
    }

    // Catat error tapi coba percobaan berikutnya
    const lastErr = json.error?.data?.message || json.error?.message
      || (json.result?.uid === false ? 'Email atau API Key salah' : null)
      || JSON.stringify(json).slice(0, 200);

    if (params.db) {
      // Sudah coba keduanya, lempar error
      throw new Error(`Autentikasi Odoo gagal: ${lastErr}`);
    }
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: { message: 'Method not allowed' } });

  const { model, method, args = [], kwargs = {}, companyId, apiKey, email } = req.body;
  if (!apiKey) return res.status(400).json({ error: { message: 'apiKey wajib diisi', data: { message: 'apiKey wajib diisi' } } });
  if (!email)  return res.status(400).json({ error: { message: 'email wajib diisi. Isi di panel Pengaturan Odoo.', data: { message: 'email wajib diisi. Isi di panel Pengaturan Odoo.' } } });

  try {
    const session = await getSession(email, apiKey);

    const context = companyId
      ? { allowed_company_ids: [companyId], default_company_id: companyId }
      : {};

    const rpcHeaders = { 'Content-Type': 'application/json' };
    if (session.cookie) rpcHeaders['Cookie'] = session.cookie;

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
    const msg = err.message || 'Unknown error';
    return res.status(400).json({
      error: { message: msg, data: { message: msg } },
    });
  }
}
