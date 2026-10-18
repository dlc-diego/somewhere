import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { randomUUID } from 'node:crypto'

const appVersion = randomUUID()
const versionManifest = JSON.stringify({ version: appVersion })

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'app-version',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: versionManifest })
      },
      configureServer(server) {
        server.middlewares.use('/version.json', (_request, response) => {
          response.setHeader('Content-Type', 'application/json')
          response.setHeader('Cache-Control', 'no-store')
          response.end(versionManifest)
        })
      },
    },
  ],
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  base: './',
  build: { target: 'es2022' },
})
