import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Static-asset PWA: builds to /dist and runs offline. Deploy anywhere.
export default defineConfig({
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
      workbox: { globPatterns: ['**/*.{js,css,html,svg,woff2}'] }
    })
  ]
})
