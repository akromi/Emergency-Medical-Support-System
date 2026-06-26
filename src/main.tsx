import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { LangProvider } from './i18n'
import './styles.css'

const el = document.getElementById('root')
if (!el) throw new Error('root element missing')

createRoot(el).render(
  <React.StrictMode>
    <LangProvider>
      <App />
    </LangProvider>
  </React.StrictMode>,
)
