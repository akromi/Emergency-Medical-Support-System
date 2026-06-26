import { useEffect, useState } from 'react'

// Re-render on a fixed cadence so live "time since injury" clocks stay current
// without each call site wiring its own timer. Returns the current epoch ms.
export function useNow(periodMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), periodMs)
    return () => window.clearInterval(id)
  }, [periodMs])
  return now
}
