import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

// During the PNG/JPG -> WEBP asset migration, source files may still import a
// raster path whose original has already been deleted in favor of a .webp
// sibling. This resolver transparently falls back to that .webp so imports keep
// working without having to edit every import statement in lockstep with the
// asset conversion. It is a no-op when the original file still exists.
function rasterWebpFallback(): Plugin {
  return {
    name: 'raster-webp-fallback',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer) return null

      const [cleanSource, query] = source.split('?')
      if (!/\.(png|jpe?g)$/i.test(cleanSource)) return null
      if (!cleanSource.startsWith('.')) return null

      const importerDir = path.dirname(importer.split('?')[0])
      const abs = path.resolve(importerDir, cleanSource)
      if (fs.existsSync(abs)) return null // original exists, leave untouched

      const webp = abs.replace(/\.(png|jpe?g)$/i, '.webp')
      if (!fs.existsSync(webp)) return null

      return query ? `${webp}?${query}` : webp
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [rasterWebpFallback(), react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
      '/legal': 'http://localhost:8787',
    },
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['zustand'],
  },
})
