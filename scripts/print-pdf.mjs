// Render a self-contained HTML doc to PDF via headless Chromium.
// Usage: node scripts/print-pdf.mjs <input.html> <output.pdf>
import { chromium } from 'playwright-core'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const [, , inPath, outPath] = process.argv
if (!inPath || !outPath) {
  console.error('usage: node scripts/print-pdf.mjs <input.html> <output.pdf>')
  process.exit(1)
}

// Override with CHROMIUM_PATH if your Playwright build differs.
const EXECUTABLE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

const browser = await chromium.launch({ executablePath: EXECUTABLE })
const page = await browser.newPage()
await page.goto(pathToFileURL(resolve(inPath)).href, { waitUntil: 'networkidle' })
await page.pdf({
  path: resolve(outPath),
  format: 'A4',
  printBackground: true,
  margin: { top: '14mm', bottom: '14mm', left: '12mm', right: '12mm' },
})
await browser.close()
console.log(`wrote ${outPath}`)
