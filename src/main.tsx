import React from 'react'
import { createRoot } from 'react-dom/client'
import { applyRegionData, type BodyRegionData } from '@triage-link/core'
import { App } from './App'
import { RegionCalibrator } from './components/RegionCalibrator'
import { LangProvider } from './i18n'
import './styles.css'

const el = document.getElementById('root')
if (!el) throw new Error('root element missing')

// Apply a locally-saved region calibration (from the ?calibrate=1 tool) to the
// live chart. This is a per-device override; the committed default ships in
// body-regions.data.ts. Safe no-op when nothing is saved.
try {
  const raw = localStorage.getItem('tl.regions.override')
  if (raw) applyRegionData(JSON.parse(raw) as BodyRegionData)
} catch { /* ignore malformed override */ }

// Hidden developer/maintenance tool — opened with ?calibrate=1, outside the
// field workflow (and therefore outside the guided tour).
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
