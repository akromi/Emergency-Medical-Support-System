import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { LangProvider } from './i18n'
import './styles.css'

const el = document.getElementById('root')
if (!el) throw new Error('root element missing')

// The region calibrator is no longer a bare ?calibrate=1 URL — it lives inside
// the gated Admin area (Operators ▸ Admin), reachable only by a signed-in admin.
createRoot(el).render(
  <React.StrictMode>
    <LangProvider>
      <App />
    </LangProvider>
  </React.StrictMode>,
)
