import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Guard against Node-only code leaking into the browser bundle.
//
// Regression test for the undici leak (PR #132): the mTLS transport imports
// `undici`, which references `process` / `node:*` builtins at module load. It
// was re-exported from the @triage-link/ehr-gateway barrel, which the PWA reaches
// via EhrTestConsole's `MockGateway` import — so undici ended up in the client
// bundle and the app crashed on first load with "process is not defined" (blank
// #root), failing every Playwright e2e at once.
//
// This walks the STATIC import graph from the PWA entry (src/main.tsx) across the
// app source and into the @triage-link workspace packages' source, and fails if
// any browser-reachable module imports a Node-only specifier. It's a fast, build-
// free invariant — catching the leak at its source rather than after a 11-minute
// e2e wipeout.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ENTRY = join(ROOT, 'src/main.tsx')

// Specifiers that must never be reachable from the browser entry.
const FORBIDDEN: RegExp[] = [/^node:/, /^undici$/, /^pg$/, /^fastify$/, /^@fastify\//]

// Workspace packages are walked from SOURCE (not their built dist) so the guard
// sees the real import graph regardless of how `main`/`exports` resolve.
const WORKSPACE_ROOTS: Record<string, string> = {
  '@triage-link/core': 'packages/core',
  '@triage-link/ehr-gateway': 'packages/ehr-gateway',
}

const EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts']

function isFile(p: string): boolean {
  return existsSync(p) && statSync(p).isFile()
}

// Resolve a relative or @triage-link import to an on-disk source file. Returns
// null for bare third-party modules — those are the leaves we test against
// FORBIDDEN and never recurse into.
function resolveToFile(spec: string, fromFile: string): string | null {
  let base: string
  if (spec.startsWith('.')) {
    base = resolve(dirname(fromFile), spec)
  } else if (spec.startsWith('@triage-link/')) {
    const m = spec.match(/^(@triage-link\/[^/]+)(?:\/(.+))?$/)
    const pkgRoot = m && WORKSPACE_ROOTS[m[1]]
    if (!m || !pkgRoot) return null
    base = m[2] ? join(ROOT, pkgRoot, m[2]) : join(ROOT, pkgRoot, 'src/index')
  } else {
    return null // bare external module
  }
  // Try as-is, with a `.js`->source swap (the codebase imports `./x.js` -> x.ts),
  // with each source extension, and as a directory index.
  const candidates = [
    base,
    ...EXTS.map((e) => base + e),
    ...EXTS.map((e) => base.replace(/\.[cm]?jsx?$/, e)),
    ...EXTS.map((e) => join(base, 'index' + e)),
  ]
  return candidates.find(isFile) ?? null
}

// Extract the imported module specifiers from a source file, skipping comments
// and type-only imports/exports (those are erased at build and never ship).
function importSpecifiers(src: string): string[] {
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
    .replace(/(^|[^:])\/\/.*$/gm, '$1') // line comments (keep `https://`)
  const specs: string[] = []
  const re =
    /(?:^|[\s;])(?:import|export)\s+([^'";]*?)\s+from\s*['"]([^'"]+)['"]|(?:^|[\s;])import\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(code))) {
    const clause = m[1] ?? ''
    if (/^\s*type\b/.test(clause)) continue // `import type ...` / `export type ...`
    const spec = m[2] ?? m[3] ?? m[4]
    if (spec) specs.push(spec)
  }
  return specs
}

describe('client bundle stays browser-safe', () => {
  it('the browser entry (src/main.tsx) never reaches a Node-only module', () => {
    expect(isFile(ENTRY), `entry not found: ${ENTRY}`).toBe(true)

    const visited = new Set<string>()
    const violations: string[] = []
    const stack = [ENTRY]

    while (stack.length) {
      const file = stack.pop()!
      if (visited.has(file)) continue
      visited.add(file)

      for (const spec of importSpecifiers(readFileSync(file, 'utf8'))) {
        if (FORBIDDEN.some((re) => re.test(spec))) {
          violations.push(`${spec}  ←  ${file.replace(ROOT + '/', '')}`)
          continue
        }
        const next = resolveToFile(spec, file)
        if (next) stack.push(next)
      }
    }

    expect(
      violations,
      `Node-only module(s) reachable from the browser entry — they will crash the ` +
        `PWA on load. Keep server-only code off the import path the client reaches:\n  ` +
        violations.join('\n  '),
    ).toEqual([])
  })
})
