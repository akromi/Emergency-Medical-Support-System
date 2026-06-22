// Append-only operation model for offline-first sync.
// An Op is an immutable, idempotent record of a single field/item mutation.
// Records are never mutated in place across the wire; state is the deterministic
// fold of all ops for a record (see resolve()).

export type OpKind = 'scalar' | 'item-put' | 'item-remove'

/** Collections on CasualtyRecord that are merged item-by-item. */
export type CollectionName = 'injuries' | 'vitals' | 'treatments'

export interface Op {
  /** Globally-unique id — also the idempotency key for ingest. */
  id: string
  recordId: string
  /** Device/client that authored the op. */
  clientId: string
  /** Logical (Lamport) clock — the ordering authority, not wall-clock. */
  lamport: number
  /** Wall-clock at authoring; informational/tiebreak metadata only. */
  ts: number
  kind: OpKind
  /**
   * For `scalar`: a dotted path (`tombstone.name`, `incident.triage`, `handover`).
   * For item ops: the collection name (`injuries` | `vitals` | `treatments`).
   */
  path: string
  /** Item id for `item-put` / `item-remove`. */
  itemId?: string
  /** Scalar value, or the full item object for `item-put`. */
  value?: unknown
}

/** A deterministic resolution of two or more ops competing for one target. */
export interface ConflictReport {
  recordId: string
  /** `path` for a scalar, or `collection#itemId` for an item. */
  target: string
  winningOpId: string
  supersededOpIds: string[]
}

export interface ResolveResult {
  record: import('../domain/types.js').CasualtyRecord
  conflicts: ConflictReport[]
}
