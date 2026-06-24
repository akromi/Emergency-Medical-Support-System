import { useEffect, useRef, useState } from 'react'

// Full-screen photo viewer with prev/next (arrows, swipe, keyboard) and a
// counter. Opened from an injury's thumbnails at a given index.
export function PhotoLightbox({ photos, index, onClose }: {
  photos: string[]
  index: number
  onClose: () => void
}) {
  const [cur, setCur] = useState(index)
  const touchX = useRef<number | null>(null)
  const n = photos.length
  const go = (d: number) => setCur((c) => (c + d + n) % n)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') setCur((c) => (c - 1 + n) % n)
      else if (e.key === 'ArrowRight') setCur((c) => (c + 1) % n)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [n, onClose])

  const onTouchStart = (e: React.TouchEvent) => { touchX.current = e.touches[0].clientX }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current == null) return
    const dx = e.changedTouches[0].clientX - touchX.current
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1)
    touchX.current = null
  }

  return (
    <div className="lightbox" onClick={onClose}>
      <button className="lb-close" aria-label="Close" onClick={onClose}>×</button>
      <div className="lb-stage" onClick={(e) => e.stopPropagation()} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <img src={photos[cur]} alt={`Injury photo ${cur + 1} of ${n}`} />
        {n > 1 && (
          <>
            <button className="lb-nav prev" aria-label="Previous photo" onClick={() => go(-1)}>‹</button>
            <button className="lb-nav next" aria-label="Next photo" onClick={() => go(1)}>›</button>
            <div className="lb-count">{cur + 1} / {n}</div>
          </>
        )}
      </div>
    </div>
  )
}
