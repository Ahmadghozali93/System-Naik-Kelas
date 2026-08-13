import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Fungsi di folder api/ dijalankan Vercel di produksi, tapi dev server Vite
// tidak mengenalnya: POST /api/odoo-proxy menjawab 404 berbadan kosong, dan
// response.json() atas badan kosong melahirkan galat yang tidak menjelaskan
// apa pun ("The string did not match the expected pattern" di Safari).
// Plugin ini memasang fungsi tersebut saat pengembangan supaya perilakunya
// sama dengan di produksi.
function apiDevServer() {
  return {
    name: 'api-dev-server',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next()

        // Hanya nama berkas sederhana — jalur dari URL tidak boleh menjelajah folder.
        const nama = req.url.split('?')[0].slice('/api/'.length)
        if (!/^[a-z0-9-]+$/i.test(nama)) return next()

        try {
          const mod = await server.ssrLoadModule(`/api/${nama}.js`)
          req.body = await bacaBody(req)
          pasangPembantuRes(res)
          await mod.default(req, res)
        } catch (e) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: { message: e.message } }))
        }
      })
    },
  }
}

const bacaBody = (req) => new Promise((resolve, reject) => {
  if (req.method !== 'POST' && req.method !== 'PUT') return resolve({})
  let data = ''
  req.on('data', (c) => { data += c })
  req.on('end', () => {
    try { resolve(data ? JSON.parse(data) : {}) } catch (e) { reject(e) }
  })
  req.on('error', reject)
})

// Handler ditulis untuk Vercel, yang menyediakan res.status() dan res.json().
// Node biasa tidak punya keduanya.
function pasangPembantuRes(res) {
  res.status = (kode) => { res.statusCode = kode; return res }
  res.json = (obj) => {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(obj))
    return res
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), apiDevServer()],
})
