import { chromium } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const DIR = dirname(fileURLToPath(import.meta.url))
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage()
await page.goto(`file://${DIR}/triage-link-overview.html`, { waitUntil: 'networkidle' })
await page.pdf({
  path: `${DIR}/triage-link-overview.pdf`,
  width: '1280px',
  height: '720px',
  printBackground: true,
  pageRanges: '1-20',
})
await browser.close()
console.log('pdf written')
