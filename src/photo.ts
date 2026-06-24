// Photo capture — WEB-FIRST, but Capacitor-ready.
//
// The whole app (data model, editor UI, chart badge, printable summary) is
// platform-agnostic; the ONLY thing that changes for a native Android/iOS build
// is the body of capturePhoto(). On web we use a file input with `capture`
// (opens the camera on phones, file picker on desktop). For Capacitor, swap to:
//
//   import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
//   export async function capturePhoto() {
//     const p = await Camera.getPhoto({ resultType: CameraResultType.DataUrl,
//       source: CameraSource.Camera, quality: 60, width: MAX_DIM, correctOrientation: true })
//     return p.dataUrl ?? null
//   }
//
// Either way the result is a downscaled JPEG data URL, so photos stay small and
// flow through the existing record (IndexedDB save, sync, print) unchanged.

const MAX_DIM = 1280
const QUALITY = 0.6

/** Capture/select a photo and return a downscaled JPEG data URL (or null if cancelled). */
export async function capturePhoto(): Promise<string | null> {
  const file = await pickImage()
  return file ? downscale(file) : null
}

function pickImage(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.setAttribute('capture', 'environment') // prefer the rear camera on mobile
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.click()
  })
}

function downscale(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height))
      const w = Math.max(1, Math.round(img.width * scale))
      const h = Math.max(1, Math.round(img.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('no 2d context')); return }
      ctx.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', QUALITY))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load failed')) }
    img.src = url
  })
}
