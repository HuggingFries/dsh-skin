// 皮肤 (◕‿◕) — 宿主半身（永久版 v3）
// 提供：/dsh-skin/ 图片路由、/dsh-skin-thumb/ 缩略图路由、/dsh-skin-api/* JSON API
// 依赖：webServer、fs（用 ctx.inject 等待服务就绪，避免启动时序问题）
import { join } from 'node:path'
import sharp from 'sharp'

function readBody(req) {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk) => { data += chunk })
    req.on('end', () => resolve(data))
    req.on('error', () => resolve(''))
  })
}

function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
}

export function apply(ctx) {
  ctx.inject(['webServer', 'fs'], (ready) => {
    const webServer = ready.webServer
    const fs = ready.fs
    const sp = ctx.get('sandboxPolicy')
    const wsRoot = sp && sp.workspaceRoot ? sp.workspaceRoot : process.cwd()
    const statePath = `${wsRoot}\\.dsh-skin-state.json`
    const thumbDir = join(wsRoot, '.dsh-skin-thumbs')
    let currentDir = 'E:\\images\\焦茶'

    // ── 缩略图引擎：sharp 原生库 + 磁盘缓存 + 并发队列 ──
    const thumbInflight = new Map()
    const thumbQueue = []
    let thumbActive = 0
    const THUMB_MAX_CONCURRENT = 2
    const THUMB_W = 160

    const generateThumb = (name) => new Promise((resolve, reject) => {
      const srcPath = currentDir + '\\' + name
      const dstPath = join(thumbDir, name + '.jpg')
      sharp(srcPath, { failOn: 'none' })
        .resize({ width: THUMB_W, withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toFile(dstPath)
        .then(() => resolve(dstPath))
        .catch(reject)
    })

    const runThumbQueue = () => {
      while (thumbActive < THUMB_MAX_CONCURRENT && thumbQueue.length) {
        const job = thumbQueue.shift()
        thumbActive++
        generateThumb(job.name).then(
          () => { thumbActive--; job.resolve(); runThumbQueue() },
          (e) => { thumbActive--; job.reject(e); runThumbQueue() },
        )
      }
    }
    const ensureThumb = (name) => {
      let p = thumbInflight.get(name)
      if (p) return p
      p = new Promise((resolve, reject) => {
        thumbQueue.push({ name, resolve, reject })
        runThumbQueue()
      })
      thumbInflight.set(name, p)
      p.catch(() => { thumbInflight.delete(name) })
      return p
    }

    const validName = (raw, prefix) => {
      const pathname = raw.split('?')[0]
      let name
      try {
        name = decodeURIComponent(pathname.slice(prefix.length))
      } catch (_) {
        name = ''
      }
      if (!name || name.length > 255 || name.includes('/') || name.includes('\\') || name.includes('..') || /[\x00-\x1f]/.test(name) || name.startsWith('.')) return null
      return name
    }

    const listImages = async () => {
      try {
        const target = await fs.resolve(currentDir)
        const entries = await fs.listDir(target)
        const images = []
        for (const e of entries) {
          const name = typeof e === 'string' ? e : e.name
          if (typeof name !== 'string') continue
          if (!/\.(jpe?g|png|webp|gif|bmp)$/i.test(name)) continue
          const dim = /_(\d+)x(\d+)\./.exec(name)
          images.push({ name, width: dim ? Number(dim[1]) : null, height: dim ? Number(dim[2]) : null })
        }
        images.sort((a, b) => a.name.localeCompare(b.name))
        return { dir: currentDir, images }
      } catch (err) {
        return { dir: currentDir, images: [], error: String((err && err.message) || err) }
      }
    }

    // GET /dsh-skin-api/list
    ctx.effect(() => webServer.register({
      kind: 'exact',
      path: '/dsh-skin-api/list',
      handler: async (req, res) => json(res, 200, await listImages()),
    }))

    // POST /dsh-skin-api/set-dir  { path }
    ctx.effect(() => webServer.register({
      kind: 'exact',
      path: '/dsh-skin-api/set-dir',
      handler: async (req, res) => {
        try {
          const raw = await readBody(req)
          const args = JSON.parse(raw || '{}')
          const path = args && typeof args.path === 'string' ? args.path.trim() : ''
          if (!path) { json(res, 400, { ok: false, error: '空路径' }); return }
          const target = await fs.resolve(path)
          await fs.listDir(target)
          currentDir = path
          json(res, 200, { ok: true, dir: path })
        } catch (err) {
          json(res, 400, { ok: false, error: '无法读取该目录：' + String((err && err.message) || err) })
        }
      },
    }))

    // POST /dsh-skin-api/save  { state }
    ctx.effect(() => webServer.register({
      kind: 'exact',
      path: '/dsh-skin-api/save',
      handler: async (req, res) => {
        try {
          const raw = await readBody(req)
          const body = JSON.parse(raw || '{}')
          const target = await fs.resolve(statePath)
          await fs.writeText(target, JSON.stringify((body && body.state) || {}, null, 2))
          json(res, 200, { ok: true })
        } catch (err) {
          json(res, 500, { ok: false, error: String((err && err.message) || err) })
        }
      },
    }))

    // GET /dsh-skin-api/load
    ctx.effect(() => webServer.register({
      kind: 'exact',
      path: '/dsh-skin-api/load',
      handler: async (req, res) => {
        try {
          const target = await fs.resolve(statePath)
          const text = await fs.readText(target)
          json(res, 200, { ok: true, state: JSON.parse(text) })
        } catch (err) {
          json(res, 200, { ok: true, state: null })
        }
      },
    }))

    // GET /dsh-skin-thumb/<name> — 缩略图（PowerShell 生成，磁盘缓存）
    ctx.effect(() => webServer.register({
      kind: 'prefix',
      path: '/dsh-skin-thumb',
      handler: async (req, res) => {
        try {
          const name = validName(req.url ?? '/', '/dsh-skin-thumb/')
          if (name === null) {
            res.writeHead(404, { 'Content-Type': 'text/plain' })
            res.end('bad name')
            return
          }
          const dstPath = join(thumbDir, name + '.jpg')
          let bytes = null
          try {
            const t = await fs.resolve(dstPath)
            bytes = await fs.readBytes(t, undefined, 8 * 1024 * 1024)
          } catch (_) { /* not cached */ }
          if (!bytes) {
            await ensureThumb(name)
            const t = await fs.resolve(dstPath)
            bytes = await fs.readBytes(t, undefined, 8 * 1024 * 1024)
          }
          res.writeHead(200, {
            'Content-Type': 'image/jpeg',
            'Cache-Control': 'public, max-age=86400',
            'Content-Length': String(bytes.length),
          })
          res.end(bytes)
        } catch (error) {
          try {
            res.writeHead(404, { 'Content-Type': 'text/plain' })
            res.end('thumb unavailable')
          } catch (_) { /* ignore */ }
        }
      },
    }))

    // GET /dsh-skin/<name> — 图片
    ctx.effect(() => webServer.register({
      kind: 'prefix',
      path: '/dsh-skin',
      handler: async (req, res) => {
        try {
          const name = validName(req.url ?? '/', '/dsh-skin/')
          if (name === null) {
            res.writeHead(404, { 'Content-Type': 'text/plain' })
            res.end('bad name')
            return
          }
          const target = await fs.resolve(currentDir + '\\' + name)
          const bytes = await fs.readBytes(target, undefined, 128 * 1024 * 1024)
          const ext = name.split('.').pop().toLowerCase()
          const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : ext === 'bmp' ? 'image/bmp' : 'image/jpeg'
          res.writeHead(200, {
            'Content-Type': mime,
            'Cache-Control': 'public, max-age=3600',
            'Content-Length': String(bytes.length),
          })
          res.end(bytes)
        } catch (error) {
          try {
            res.writeHead(404, { 'Content-Type': 'text/plain' })
            res.end('not found')
          } catch (_) { /* ignore */ }
        }
      },
    }))
  })
}
