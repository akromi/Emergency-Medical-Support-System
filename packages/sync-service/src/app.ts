// Fastify sync endpoint. The merge/resolution authority is @triage-link/core's
// deterministic resolver — the server stores ops and folds them; it does not
// implement its own (divergent) merge logic.
import Fastify, { type FastifyInstance } from 'fastify'
import { resolve, type Op } from '@triage-link/core'
import { OpStore } from './ops-store.js'

interface SyncBody {
  clientId?: string
  ops?: Op[]
}

export function buildApp({ store }: { store: OpStore }): FastifyInstance {
  const app = Fastify({ logger: false })

  app.get('/health', async () => ({ ok: true }))

  // Push a batch of ops and pull back the resolved state + full op set.
  app.post('/sync', async (req, reply) => {
    const body = (req.body ?? {}) as SyncBody
    const ops = Array.isArray(body.ops) ? body.ops : []

    // Idempotent ingest: only ids not already present are inserted.
    const inserted = new Set(await store.insertOps(ops))
    for (const op of ops) {
      if (inserted.has(op.id)) {
        await store.appendAudit({
          recordId: op.recordId,
          opId: op.id,
          eventType: 'op-ingested',
          detail: { clientId: op.clientId, kind: op.kind, path: op.path, itemId: op.itemId ?? null },
        })
      }
    }

    // Only re-resolve records that actually gained ops (keeps no-op syncs cheap
    // and the audit trail free of duplicate resolution events).
    const changed = [...new Set(ops.filter((o) => inserted.has(o.id)).map((o) => o.recordId))]
    for (const recordId of changed) {
      const all = await store.getOps(recordId)
      const { record, conflicts } = resolve(recordId, all)
      await store.upsertSnapshot(recordId, record)
      for (const c of conflicts) {
        const involved = [c.winningOpId, ...c.supersededOpIds]
        if (!involved.some((id) => inserted.has(id))) continue
        await store.appendAudit({ recordId, opId: c.winningOpId, eventType: 'conflict-resolved', detail: c })
      }
    }

    // Respond with current state for every record referenced in the request.
    const requested = [...new Set(ops.map((o) => o.recordId))]
    const records: Record<string, unknown> = {}
    let merged: Op[] = []
    for (const recordId of requested) {
      records[recordId] = await store.getSnapshot(recordId)
      merged = merged.concat(await store.getOps(recordId))
    }
    return reply.send({ records, ops: merged, ingested: inserted.size })
  })

  // Inspect a record: resolved snapshot, its full op-log, and the audit trail.
  app.get('/sync/:recordId', async (req) => {
    const { recordId } = req.params as { recordId: string }
    const [snapshot, ops, audit] = await Promise.all([
      store.getSnapshot(recordId),
      store.getOps(recordId),
      store.getAudit(recordId),
    ])
    return { snapshot, ops, audit }
  })

  return app
}
