// Vercel serverless proxy — Odoo XML-RPC
// XML-RPC tersedia di semua versi Odoo, tidak perlu REST API

const ODOO_BASE = 'https://naik-kelas.odoo.com';
const ODOO_DB   = 'naik-kelas';

// ─── XML-RPC serializer ──────────────────────────────────────────────────────

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function toXml(v) {
  if (v === null || v === undefined) return '<value><boolean>0</boolean></value>';
  if (v === false) return '<value><boolean>0</boolean></value>';
  if (v === true)  return '<value><boolean>1</boolean></value>';
  if (typeof v === 'number') {
    return Number.isInteger(v)
      ? `<value><int>${v}</int></value>`
      : `<value><double>${v}</double></value>`;
  }
  if (typeof v === 'string') return `<value><string>${esc(v)}</string></value>`;
  if (Array.isArray(v)) {
    return `<value><array><data>${v.map(toXml).join('')}</data></array></value>`;
  }
  if (typeof v === 'object') {
    const members = Object.entries(v)
      .map(([k, u]) => `<member><name>${esc(k)}</name>${toXml(u)}</member>`)
      .join('');
    return `<value><struct>${members}</struct></value>`;
  }
  return '<value><boolean>0</boolean></value>';
}

function xmlCall(method, params) {
  return `<?xml version="1.0" encoding="UTF-8"?><methodCall><methodName>${method}</methodName><params>${params.map(p => `<param>${toXml(p)}</param>`).join('')}</params></methodCall>`;
}

// ─── XML-RPC parser ──────────────────────────────────────────────────────────

function unesc(s) {
  return s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&quot;/g,'"');
}

function parseXmlRpc(xml) {
  if (xml.includes('<fault>')) {
    const m = xml.match(/<name>faultString<\/name>\s*<value>(?:<string>)?(.*?)(?:<\/string>)?<\/value>/s);
    throw new Error(m ? unesc(m[1].trim()) : 'XML-RPC fault');
  }
  const m = xml.match(/<params>\s*<param>\s*<value>([\s\S]*?)<\/value>\s*<\/param>\s*<\/params>/);
  if (!m) throw new Error('Tidak bisa parse XML-RPC response');
  return parseValue(m[1].trim());
}

function parseValue(inner) {
  // int
  let m = inner.match(/^<int>([\s\S]*?)<\/int>$/) || inner.match(/^<i4>([\s\S]*?)<\/i4>$/);
  if (m) return parseInt(m[1], 10);
  // boolean
  m = inner.match(/^<boolean>([\s\S]*?)<\/boolean>$/);
  if (m) return m[1].trim() === '1';
  // double
  m = inner.match(/^<double>([\s\S]*?)<\/double>$/);
  if (m) return parseFloat(m[1]);
  // string
  m = inner.match(/^<string>([\s\S]*?)<\/string>$/);
  if (m) return unesc(m[1]);
  // bare text (Odoo sometimes omits <string> tag)
  if (!inner.startsWith('<')) return unesc(inner);
  // array
  m = inner.match(/^<array>\s*<data>([\s\S]*?)<\/data>\s*<\/array>$/);
  if (m) return parseArray(m[1]);
  // struct
  m = inner.match(/^<struct>([\s\S]*?)<\/struct>$/);
  if (m) return parseStruct(m[1]);
  // nil / false
  if (inner === '<nil/>' || inner === '') return null;
  return unesc(inner);
}

function parseArray(data) {
  const results = [];
  const re = /<value>([\s\S]*?)<\/value>/g;
  let m;
  while ((m = re.exec(data)) !== null) {
    results.push(parseValue(m[1].trim()));
  }
  return results;
}

function parseStruct(data) {
  const result = {};
  const re = /<member>\s*<name>([\s\S]*?)<\/name>\s*<value>([\s\S]*?)<\/value>\s*<\/member>/g;
  let m;
  while ((m = re.exec(data)) !== null) {
    result[unesc(m[1].trim())] = parseValue(m[2].trim());
  }
  return result;
}

// ─── Odoo XML-RPC calls ──────────────────────────────────────────────────────

async function xmlRpcPost(endpoint, body) {
  const resp = await fetch(`${ODOO_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
    body,
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`Odoo HTTP ${resp.status}: ${text.slice(0, 200)}`);
  return parseXmlRpc(text);
}

async function authenticate(login, password) {
  const uid = await xmlRpcPost('/xmlrpc/2/common',
    xmlCall('authenticate', [ODOO_DB, login, password, {}])
  );
  if (!uid || uid === false) throw new Error('Autentikasi gagal. Cek email & API Key di Odoo.');
  return uid;
}

async function executeKw(uid, password, model, method, args, kwargs = {}) {
  return xmlRpcPost('/xmlrpc/2/object',
    xmlCall('execute_kw', [ODOO_DB, uid, password, model, method, args, kwargs])
  );
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { model, method, args = [], kwargs = {}, companyId, apiKey, email } = req.body;
  if (!apiKey) return res.status(400).json({ error: 'apiKey wajib diisi' });
  if (!email)  return res.status(400).json({ error: 'email wajib diisi. Isi di Pengaturan Odoo.' });

  try {
    // 1. Authenticate → dapat uid
    const uid = await authenticate(email, apiKey);

    // 2. Tambahkan company context ke kwargs
    const ctx = companyId
      ? { allowed_company_ids: [companyId], default_company_id: companyId, ...(kwargs.context || {}) }
      : (kwargs.context || {});

    const finalKwargs = { ...kwargs, context: ctx };

    // 3. Execute model method
    const result = await executeKw(uid, apiKey, model, method, args, finalKwargs);

    return res.status(200).json({ result });
  } catch (err) {
    return res.status(200).json({
      error: { message: err.message, data: { message: err.message } }
    });
  }
}
