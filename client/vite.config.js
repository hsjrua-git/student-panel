import react from '@vitejs/plugin-react'
import process from 'node:process'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// Config is async so we can pull in the bundle-size visualiser only when asked
// (ANALYZE=1). That keeps it out of normal builds — a normal `npm run build`
// never even imports the package, so the build still works if it isn't
// installed. Run `npm run analyze` to get an interactive size report.
export default defineConfig(async () => {
   const plugins = [react()]
   if (process.env.ANALYZE) {
      const { visualizer } = await import('rollup-plugin-visualizer')
      plugins.push(
         visualizer({
            filename: 'dist/stats.html',
            open: true,
            gzipSize: true,
            brotliSize: true,
         })
      )
   }

   return {
      plugins,
      server: {
         proxy: {
            '/api': 'http://localhost:3000',
         },
      },
      // Vitest configuration. Component tests need a DOM, so they run in
      // jsdom; the setup file wires up jest-dom matchers and auto-cleanup.
      // Pure helper tests (lib/*) don't touch the DOM but share the same
      // runner. Run with `npm test` (once) or `npm run test:watch`.
      test: {
         environment: 'jsdom',
         pool: 'vmThreads',
         globals: true,
         setupFiles: './src/test/setup.js',
         css: false,
         include: ['src/**/*.{test,spec}.{js,jsx}'],
      },
      build: {
         // recharts (plus the d3 modules it pulls in) is a large library. It
         // ends up in its own "charts" chunk that is only downloaded on demand,
         // along with the Dashboard/Student-detail pages that use it — so a
         // chart-only chunk crossing the default 500 kB line is expected.
         chunkSizeWarningLimit: 700,
         rollupOptions: {
            output: {
               // Pull the big, rarely-changing third-party code into named
               // chunks. These change far less often than our own app code, so
               // a returning visitor keeps them cached across deploys instead
               // of re-downloading them whenever we ship a change. Anything not
               // matched here is left to Rollup's default splitting, which
               // keeps code that is only reached through a lazy page in that
               // page's own on-demand chunk (e.g. papaparse stays with the
               // Import pages).
               manualChunks(id) {
                  if (!id.includes('node_modules')) return
                  if (
                     id.includes('recharts') ||
                     id.includes('victory-vendor') ||
                     id.includes('/d3-') ||
                     id.includes('/internmap/')
                  ) {
                     return 'charts'
                  }
                  if (id.includes('@tanstack')) {
                     return 'react-query'
                  }
                  if (
                     id.includes('/react/') ||
                     id.includes('/react-dom/') ||
                     id.includes('/react-router/') ||
                     id.includes('/react-is/') ||
                     id.includes('/scheduler/')
                  ) {
                     return 'react-vendor'
                  }
               },
            },
         },
      },
   }
})
