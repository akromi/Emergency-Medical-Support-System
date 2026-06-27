import { defineConfig, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Static-asset PWA: builds to /dist and runs offline. Deploy anywhere.
// On GitHub Pages the app is served under /<repo>/, so the deploy workflow
// sets GITHUB_PAGES=true to build with that base path. Everywhere else
// (local dev, npm run preview, Netlify drop) it stays at the root "/".
const base = process.env.GITHUB_PAGES === 'true' ? '/Emergency-Medical-Support-System/' : '/'

// Content-Security-Policy, injected as a <meta> on the PRODUCTION build only
// (a strict CSP would break Vite's dev HMR / eval). Delivered via meta so it
// applies on any static host, including GitHub Pages which can't set headers.
// `style-src 'unsafe-inline'` is required by React's inline `style={...}`
// attributes; `script-src 'self'` is strict (the build emits no inline scripts).
// `connect-src` gains the EHR backend origin when one is configured at build.
function buildCsp(): string {
  let connect = "'self'"
  const ehr = process.env.VITE_EHR_BASE_URL
  if (ehr) { try { connect += ' ' + new URL(ehr).origin } catch { /* relative/empty → same-origin */ } }
  return [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    // frame-ancestors can only be set via a response header (it is ignored in a
    // <meta> CSP) — see public/_headers + X-Frame-Options for clickjacking defence.
    "frame-src 'none'",
    "img-src 'self' data: blob:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self'",
    `connect-src ${connect}`,
    "font-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ].join('; ')
}

const cspMeta: PluginOption = {
  name: 'inject-csp-meta',
  apply: 'build',
  transformIndexHtml: () => [
    { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: buildCsp() }, injectTo: 'head-prepend' },
  ],
}

export default defineConfig({
  base,
  plugins: [
    cspMeta,
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
