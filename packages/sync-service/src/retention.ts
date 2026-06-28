// Per-tenant data retention (TTL) for the OBSERVATIONAL audit log.
//
// SCOPE — what is and isn't pruned, and why:
//  - The `audit` table is an append-only operational trail (op-ingested /
//    conflict-resolved / admin events). Pruning old entries by age is SAFE: it
//    never affects record state, sync, or conflict resolution. It is also the
//    fastest-growing table (≈ one row per ingested op), so age-bounding it is
//    the highest-value retention win.
//  - The `ops` table is the SOURCE OF TRUTH. The server re-folds a record's full
//    op history to resolve state, and order-independent conflict resolution
//    relies on per-field Lamport history that the snapshot does not retain.
//    Pruning ops therefore cannot be done safely without a causal-stability
//    mechanism (knowing no earlier-Lamport op can still arrive) — a larger
//    distributed-systems design, intentionally NOT attempted here.
import type { OpStore } from './ops-store.js'

export interface RetentionConfig {
  /** Prune audit entries older than this many ms. Undefined / ≤ 0 → no pruning
   *  (default-off: behaviour is unchanged when unset). */
  auditMaxAgeMs?: number
}

/** Prune a single tenant's audit log per the policy; returns the count pruned.
 *  `now` is injected so the cutoff is deterministic (and testable). */
export async function pruneTenantAudit(
  store: OpStore,
  tenantId: string,
  cfg: RetentionConfig,
  now: number,
): Promise<number> {
  if (!cfg.auditMaxAgeMs || cfg.auditMaxAgeMs <= 0) return 0
  return store.pruneAuditOlderThan(new Date(now - cfg.auditMaxAgeMs), tenantId)
}
