import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { BASE_PATH } from './src/app/config.ts'
import { strings } from './src/strings.ts'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves the app at https://fredygil.github.io/comprehensive-exams/
  base: BASE_PATH,
  plugins: [
    react(),
    VitePWA({
      // A new deploy replaces the old service worker on the next launch.
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // Precache the whole app shell so it opens offline.
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: strings.app.name,
        short_name: strings.app.shortName,
        description: strings.app.description,
        lang: 'es',
        display: 'standalone',
        orientation: 'any',
        background_color: '#fdf8ec',
        theme_color: '#1f5f8b',
        // Generated from public/icon.svg by `npm run generate-pwa-assets`.
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
})
