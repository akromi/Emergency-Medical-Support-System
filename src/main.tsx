import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { RegionCalibrator } from './components/RegionCalibrator'
import { LangProvider } from './i18n'
import './styles.css'

const el = document.getElementById('root')
if (!el) throw new Error('root element missing')

// Hidden developer/maintenance tool, opened with ?calibrate=1 — outside the
// field workflow and the guided tour. It is "workshop only": it NEVER changes
// the live field chart. A calibration becomes the app default only when its
// exported numbers are committed to body-regions.data.ts, so the normal app
// always renders the shipped region map (no per-device override is applied).
const calibrating = new URLSearchParams(window.location.search).get('calibrate') === '1'

createRoot(el).render(
  <React.StrictMode>
    {calibrating ? (
      <RegionCalibrator />
    ) : (
      <LangProvider>
        <App />
      </LangProvider>
    )}
  </React.StrictMode>,
)
