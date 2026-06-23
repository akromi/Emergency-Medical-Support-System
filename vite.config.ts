import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Static-asset PWA: builds to /dist and runs offline. Deploy anywhere.
// On GitHub Pages the app is served under /<repo>/, so the deploy workflow
// sets GITHUB_PAGES=true to build with that base path. Everywhere else
// (local dev, npm run preview, Netlify drop) it stays at the root "/".
const base = process.env.GITHUB_PAGES === 'true' ? '/Emergency-Medical-Support-System/' : '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'TRIAGE-LINK — Casualty Care',
        short_name: 'TRIAGE-LINK',
        description: 'Offline-first casualty care & transport documentation',
        theme_color: '#0E1116',
        background_color: '#0E1116',
        display: 'standalone',
        orientation: 'any',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }
        ]
      },
      // Precache png too so the figure images are available offline.
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2,png}'],
        maximumFileSizeToCacheInBytes: 4_000_000,
      }
    })
  ]
})
