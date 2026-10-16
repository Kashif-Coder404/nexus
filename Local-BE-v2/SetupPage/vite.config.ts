import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import fs from 'node:fs'
import path from 'node:path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    viteSingleFile(),
    {
      name: 'nexus-installed-detector',
      configureServer(server) {
        server.middlewares.use('/__api/check-installed', (_req, res) => {
          const localAppData = process.env.LOCALAPPDATA || ''
          const exePath = path.join(localAppData, 'Programs', 'Nexus', 'nexus.exe')
          const isInstalled = fs.existsSync(exePath)
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ isInstalled, installPath: exePath }))
        })
      },
    },
  ],
  build: {
    target: 'esnext',
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 100000000,
    cssCodeSplit: false,
  },
})
