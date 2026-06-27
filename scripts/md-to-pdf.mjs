// Render a Markdown doc (including ```mermaid``` diagrams) to PDF via headless
// Chromium. marked + mermaid are loaded from a temp prefix passed in RENDERER_DIR
// so they don't become repo dependencies.
// Usage: RENDERER_DIR=<prefix> node scripts/md-to-pdf.mjs <input.md> <output.pdf> "<title>"
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { chromium } from 'playwright-core'

const [, , inPath, outPath, title = 'TRIAGE-LINK'] = process.argv
const RENDERER = process.env.RENDERER_DIR
if (!inPath || !outPath || !RENDERER) {
  console.error('usage: RENDERER_DIR=<prefix> node scripts/md-to-pdf.mjs <in.md> <out.pdf> "<title>"')
  process.exit(1)
}
const EXECUTABLE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const mermaidSrc = pathToFileURL(resolve(RENDERER, 'node_modules/mermaid/dist/mermaid.min.js')).href

// marked → HTML (Node side). UMD build exposes a `marked` global on the module.
const { marked } = await import(pathToFileURL(resolve(RENDERER, 'node_modules/marked/lib/marked.esm.js')).href)
const md = readFileSync(inPath, 'utf8')
let body = marked.parse(md, { gfm: true })

// Hand mermaid its raw source: convert the escaped <pre><code class="language-mermaid">
// blocks marked emits into <pre class="mermaid"> with entities un-escaped.
body = body.replace(/<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g, (_m, code) => {
  const raw = code.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
  return `<pre class="mermaid">${raw}</pre>`
})

const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8">
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root{--ink:#14181d;--dim:#46505b;--line:#d9dee4;--soft:#eef1f4;--accent:#1F9D5B;--mono:'IBM Plex Mono',monospace}
  *{box-sizing:border-box}
  body{font-family:'IBM Plex Sans',system-ui,sans-serif;color:var(--ink);max-width:920px;margin:0 auto;padding:40px 52px;font-size:13.5px;line-height:1.55}
  h1{font-size:25px;margin:0 0 4px;letter-spacing:-.2px}
  h2{font-size:19px;margin:30px 0 10px;padding-bottom:6px;border-bottom:2px solid var(--ink)}
  h3{font-size:15px;margin:22px 0 7px;color:var(--ink)}
  h4{font-size:13.5px;margin:18px 0 6px;color:var(--dim)}
  p{margin:9px 0}
  code{font-family:var(--mono);background:var(--soft);border:1px solid var(--line);border-radius:5px;padding:1px 5px;font-size:11.5px}
  pre{background:var(--soft);border:1px solid var(--line);border-radius:8px;padding:12px 14px;overflow:auto;font-size:11.5px;line-height:1.45}
  pre code{background:none;border:0;padding:0}
  pre.mermaid{background:none;border:0;text-align:center;padding:6px 0}
  table{border-collapse:collapse;width:100%;margin:12px 0;font-size:12px}
  th,td{border:1px solid var(--line);padding:6px 9px;text-align:left;vertical-align:top}
  th{background:var(--soft);font-weight:600}
  blockquote{margin:12px 0;padding:6px 14px;border-left:3px solid var(--accent);color:var(--dim);background:var(--soft)}
  a{color:var(--accent);text-decoration:none}
  hr{border:0;border-top:1px solid var(--line);margin:24px 0}
  ul,ol{padding-left:22px}
  li{margin:3px 0}
  h2,h3,table,pre{break-inside:avoid}
</style></head>
<body>${body}
<script src="${mermaidSrc}"></script>
<script>
  mermaid.initialize({ startOnLoad:false, theme:'neutral', securityLevel:'loose', flowchart:{useMaxWidth:true}, fontFamily:"'IBM Plex Sans',sans-serif" });
  window.__mmDone = mermaid.run({ querySelector:'pre.mermaid' }).then(()=>{ window.__mermaidReady = true }).catch(e=>{ window.__mermaidErr = String(e); window.__mermaidReady = true });
</script></body></html>`

const tmpHtml = resolve(outPath.replace(/\.pdf$/, '.gen.html'))
writeFileSync(tmpHtml, html)

const browser = await chromium.launch({ executablePath: EXECUTABLE })
const page = await browser.newPage()
await page.goto(pathToFileURL(tmpHtml).href, { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__mermaidReady === true, { timeout: 30_000 })
const err = await page.evaluate(() => window.__mermaidErr)
if (err) console.warn('mermaid warning:', err)
await page.pdf({
  path: resolve(outPath),
  format: 'A4',
  printBackground: true,
  margin: { top: '14mm', bottom: '14mm', left: '12mm', right: '12mm' },
})
await browser.close()
console.log(`wrote ${outPath}`)
