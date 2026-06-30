// A promise-based, MASKED replacement for window.prompt for secrets (PINs).
// window.prompt renders typed characters in clear text; this routes the entry
// through a styled dialog (SecretPrompt) whose field is type="password" — the
// same way a PIN is hidden when it is first set.
//
// Call askSecret() from anywhere (React or not); the host component renders the
// masked field and resolves the promise. The contract mirrors window.prompt:
// the resolved value is the entered string, or null if the user cancels.

export interface SecretRequest {
  /** Already-translated prompt text shown above the field. */
  message: string
  resolve: (value: string | null) => void
}

let current: SecretRequest | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function subscribeSecret(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const getSecretRequest = (): SecretRequest | null => current

/** Prompt for a secret behind a masked input. Resolves to the entered string,
 *  or null if cancelled (window.prompt-compatible). */
export function askSecret(message: string): Promise<string | null> {
  // Only one prompt at a time — supersede any stale request by cancelling it.
  if (current) { const prev = current; current = null; prev.resolve(null) }
  return new Promise<string | null>((resolve) => {
    current = { message, resolve: (value) => { current = null; emit(); resolve(value) } }
    emit()
  })
}
