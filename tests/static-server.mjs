// Test-only static mount: verify assets work at a GitHub Pages-style subdirectory.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
const root = resolve('dist')
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
}
createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname
  if (!pathname.startsWith('/wep-app/')) {
    res.writeHead(404).end()
    return
  }
  const relative = decodeURIComponent(pathname.slice('/wep-app/'.length)) || 'index.html'
  const file = resolve(root, relative)
  if (!file.startsWith(root + '/')) {
    res.writeHead(403).end()
    return
  }
  try {
    const contents = await readFile(file)
    res
      .writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' })
      .end(contents)
  } catch {
    res.writeHead(404).end()
  }
}).listen(4174, '127.0.0.1')
