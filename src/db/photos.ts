import { genLocalId } from '@triage-link/core'
import { db } from './database'

// Photo blob store. Wound photos are heavy; embedding them as base64 data URLs
// inside each casualty record bloats every record read, write, and op-log diff.
// Instead we keep the bytes as Blobs in a dedicated `photos` table and leave a
// light reference ("idb:<id>") in the record. Records stay small and many
// photos scale cleanly. The UI never sees refs: the repository dehydrates on
// save and rehydrates on load.

const PREFIX = 'idb:'
export const isPhotoRef = (s: string): boolean => s.startsWith(PREFIX)
export const isDataUrl = (s: string): boolean => s.startsWith('data:')

/** Split a data URL into its mime + raw bytes (no fetch/FileReader needed). */
function decodeDataUrl(dataUrl: string): { mime: string; bytes: Uint8Array } {
  const comma = dataUrl.indexOf(',')
  const head = dataUrl.slice(0, comma)
  const mime = head.match(/data:([^;]+)/)?.[1] ?? 'application/octet-stream'
  const bin = atob(dataUrl.slice(comma + 1))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return { mime, bytes }
}

function encodeDataUrl(mime: string, bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return `data:${mime};base64,${btoa(bin)}`
}

/** Store a data-URL photo as raw bytes; returns its "idb:<id>" reference. */
export async function putPhoto(dataUrl: string): Promise<string> {
  const id = genLocalId('ph-')
  const { mime, bytes } = decodeDataUrl(dataUrl)
  await db.photos.put({ id, mime, bytes })
  return PREFIX + id
}

/** Resolve a reference back to a data URL (null if the bytes are missing). */
export async function readPhoto(ref: string): Promise<string | null> {
  const row = await db.photos.get(ref.slice(PREFIX.length))
  return row ? encodeDataUrl(row.mime, row.bytes) : null
}

export async function deletePhoto(ref: string): Promise<void> {
  await db.photos.delete(ref.slice(PREFIX.length))
}
