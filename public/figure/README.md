# Figure images (drop-in)

Place the licensed body figures here and the app uses them automatically:

- `anterior.png`  — front view
- `posterior.png` — back view

(Names must match exactly. `.png` is wired up; for `.svg`/`.jpg`, update
`FIGURE_IMAGE` in `src/components/figure.ts`.)

If these files are absent, the app falls back to the built-in procedural mesh.

## What works best
- One **front** image and one **back** image.
- Body fills the frame **head to toe**, **centered**, same scale/pose in both.
- Transparent or flat dark background (the panel behind is `#1B222C`).
- The hidden tap-lookup expects a head-to-toe standing figure; after you add the
  images, the figure is aligned to it via the `align` transform in
  `src/components/figure.ts` (Claude tunes this once the real image is in).
