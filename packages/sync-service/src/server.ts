// Production entrypoint: wire the app to a real PostgreSQL pool.
// Run with a TypeScript ESM loader (e.g. `tsx src/server.ts`) or compile first.
import { Pool } from 'pg'
import { buildApp } from './app.js'
import { OpStore, migrate } from './ops-store.js'

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  await migrate(pool)
  const app = buildApp({ store: new OpStore(pool) })
  const port = Number(process.env.PORT ?? 8080)
  await app.listen({ port, host: '0.0.0.0' })
  // eslint-disable-next-line no-console
  console.log(`sync-service listening on :${port}`)
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exit(1)
})
