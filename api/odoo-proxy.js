// Vercel serverless proxy — Odoo XML-RPC

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
  if (Array.isArray(v)) return `<value><array><data>${v.map(toXml).join('')}</data></array></value>`;
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

// ─── XML-RPC parser (stack-based untuk handle nested <value>) ────────────────

function unesc(s) {
  return String(s)
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&apos;/g,"'");
}

// Cari posisi </value> yang cocok dengan <value> di fromPos (handle nesting)
function findValueClose(data, fromPos) {
  let depth = 1;
  let pos   = fromPos;
  while (pos < data.length && depth > 0) {
    const nextOpen  = data.indexOf('<value>', pos);
    const nextClose = data.indexOf('</value>', pos);
    if (nextClose === -1) return -1;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + 7;
    } else {
      depth--;
      if (depth === 0) return nextClose;
      pos = nextClose + 8;
    }
  }
  return -1;
}

function parseValue(inner) {
  inner = inner.trim();
  if (!inner) return null;

  // int
  if (inner.startsWith('<int>'))    return parseInt(inner.slice(5, inner.indexOf('</int>')), 10);
  if (inner.startsWith('<i4>'))     return parseInt(inner.slice(4, inner.indexOf('</i4>')),  10);
  // boolean
  if (inner.startsWith('<boolean>'))return inner.slice(9, inner.indexOf('</boolean>')).trim() === '1';
  // double
  if (inner.startsWith('<double>')) return parseFloat(inner.slice(8, inner.indexOf('</double>')));
  // string
  if (inner.startsWith('<string>')) return unesc(inner.slice(8, inner.lastIndexOf('</string>')));
  // nil
  if (inner === '<nil/>' || inner.startsWith('<nil/>')) return null;
  // array
  if (inner.startsWith('<array>')) {
    const dStart = inner.indexOf('<data>');
    const dEnd   = inner.lastIndexOf('</data>');
    if (dStart === -1 || dEnd === -1) return [];
    return parseValueList(inner.slice(dStart + 6, dEnd));
  }
  // struct
  if (inner.startsWith('<struct>')) {
    const sEnd = inner.lastIndexOf('</struct>');
    return parseStruct(inner.slice(8, sEnd === -1 ? undefined : sEnd));
  }
  // bare text
  if (!inner.startsWith('<')) return unesc(inner);
  return null;
}

// Parse rangkaian <value>…</value> dengan benar (stack-based)
function parseValueList(data) {
  const results = [];
  let pos = 0;
  while (pos < data.length) {
    const start = data.indexOf('<value>', pos);
    if (start === -1) break;
    const end = findValueClose(data, start + 7);
    if (end === -1) break;
    results.push(parseValue(data.slice(start + 7, end).trim()));
    pos = end + 8;
  }
  return results;
}

// Parse <member> di dalam struct
function parseStruct(data) {
  const result = {};
  let pos = 0;
  while (pos < data.length) {
    const mStart = data.indexOf('<member>', pos);
    if (mStart === -1) break;
    const mEnd = data.indexOf('</member>', mStart);
    if (mEnd === -1) break;
    const member = data.slice(mStart + 8, mEnd);

    const nameMatch = member.match(/<name>([\s\S]*?)<\/name>/);
    if (nameMatch) {
      const vStart = member.indexOf('<value>');
      if (vStart !== -1) {
        const vEnd = findValueClose(member, vStart + 7);
        if (vEnd !== -1) {
          result[unesc(nameMatch[1].trim())] = parseValue(member.slice(vStart + 7, vEnd).trim());
        }
      }
    }
    pos = mEnd + 9;
  }
  return result;
}

function parseXmlRpc(xml) {
  // Fault check
  if (xml.includes('<fault>')) {
    const fStart = xml.indexOf('<fault>') + 7;
    const fEnd   = xml.lastIndexOf('</fault>');
    const fData  = xml.slice(fStart, fEnd);
    const vStart = fData.indexOf('<value>');
    if (vStart !== -1) {
      const vEnd = findValueClose(fData, vStart + 7);
      if (vEnd !== -1) {
        const fault = parseValue(fData.slice(vStart + 7, vEnd).trim());
        throw new Error(fault?.faultString || 'XML-RPC fault');
      }
    }
    throw new Error('XML-RPC fault');
  }

  // Extract outer <value> dari <params><param>
  const paramTag = '<params>';
  const pIdx = xml.indexOf(paramTag);
  if (pIdx === -1) throw new Error('No <params> in XML-RPC response');
  const section = xml.slice(pIdx);

  const vIdx = section.indexOf('<value>');
  if (vIdx === -1) throw new Error('No <value> in XML-RPC response');

  const vEnd = findValueClose(section, vIdx + 7);
  if (vEnd === -1) throw new Error('Cannot find closing </value> in XML-RPC response');

  return parseValue(section.slice(vIdx + 7, vEnd).trim());
}

// ─── Odoo XML-RPC calls ──────────────────────────────────────────────────────

async function xmlPost(endpoint, body) {
  const resp = await fetch(`${ODOO_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
    body,
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`Odoo HTTP ${resp.status}: ${text.slice(0, 300)}`);
  return parseXmlRpc(text);
}

async function authenticate(login, password) {
  const uid = await xmlPost('/xmlrpc/2/common',
    xmlCall('authenticate', [ODOO_DB, login, password, {}])
  );
  if (!uid || uid === false) throw new Error('Autentikasi gagal. Cek email & API Key di Odoo.');
  return uid;
}

async function executeKw(uid, password, model, method, args, kwargs = {}) {
  return xmlPost('/xmlrpc/2/object',
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
  if (!apiKey) return res.status(400).json({ error: { message: 'apiKey wajib diisi' } });
  if (!email)  return res.status(400).json({ error: { message: 'email wajib diisi. Isi di Pengaturan Odoo.' } });

  try {
    const uid = await authenticate(email, apiKey);

    const ctx = companyId
      ? { allowed_company_ids: [companyId], default_company_id: companyId, ...(kwargs.context || {}) }
      : (kwargs.context || {});

    const result = await executeKw(uid, apiKey, model, method, args, { ...kwargs, context: ctx });
    return res.status(200).json({ result });
  } catch (err) {
    const msg = err.message || 'Unknown error';
    return res.status(200).json({ error: { message: msg, data: { message: msg } } });
  }
}
