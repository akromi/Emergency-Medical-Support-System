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
      // Only audit conflicts touched by THIS ingest — re-folding the full history
      // would otherwise re-log every pre-existing conflict on each sync.
      for (const c of conflicts) {
        const involvesNewOp = inserted.has(c.winningOpId) || c.supersededOpIds.some((id) => inserted.has(id))
        if (involvesNewOp) {
          await store.appendAudit({ recordId, opId: c.winningOpId, eventType: 'conflict-resolved', detail: c })
        }
      }
    }

    // Full-state response: return EVERY record the server knows about (not just
    // those in this upload), so a device receives cases created on other devices
    // — multi-device caseload sharing. (A production system would use a
    // per-client cursor / since-lamport to make this incremental.)
    const knownRecordIds = await store.allRecordIds()
    const records: Record<string, unknown> = {}
    let merged: Op[] = []
    for (const recordId of knownRecordIds) {
      const recOps = await store.getOps(recordId)
      let snapshot = await store.getSnapshot(recordId)
      // Defensive: if a record has ops but no stored snapshot (e.g. a pure
      // replay sync, or a snapshot that was never persisted), resolve it on
      // demand so the client never receives a null for a record it has ops for.
      if (snapshot == null && recOps.length > 0) {
        snapshot = resolve(recordId, recOps).record
        await store.upsertSnapshot(recordId, snapshot)
      }
      records[recordId] = snapshot
      merged = merged.concat(recOps)
    }
    return reply.send({ records, ops: merged, ingested: inserted.size })
  })

  // Inspect a record: resolved snapshot, its full op-log, and the audit trail.
  app.get('/sync/:recordId', async (req) => {
    const { recordId } = req.params as { recordId: string }
    const [stored, ops, audit] = await Promise.all([
      store.getSnapshot(recordId),
      store.getOps(recordId),
      store.getAudit(recordId),
    ])
    // Same contract as POST /sync: never return null for a record that has ops.
    let snapshot = stored
    if (snapshot == null && ops.length > 0) {
      snapshot = resolve(recordId, ops).record
      await store.upsertSnapshot(recordId, snapshot)
    }
    return { snapshot, ops, audit }
  })

  return app
}
