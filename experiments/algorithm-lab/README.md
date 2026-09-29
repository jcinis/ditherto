# Local algorithm lab

Run `npm run build`, then serve the repository root:

```sh
python3 -m http.server 4181 --bind 127.0.0.1
```

Open http://127.0.0.1:4181/experiments/algorithm-lab/ (reuse an existing root server if running).
The lab imports a thin comparison adapter from `.build/experimental/` that delegates to production algorithms; rebuild after changing TypeScript.
The comparison page is excluded from the site build. The algorithms themselves are available in the package; blue noise uses an optional import.

The public [algorithm gallery](../../site/algorithms.html) now uses this lab's grouped controls, large comparison cards, and pixel inspection pattern. It renders from the production bundles and includes local uploads, settings-aware playground links, and replayable recipes. This local lab remains available for development comparisons and timings.

## Treatments and controls

The original plus eleven treatments share an area-resized source and palette:

- Existing Nearest, Atkinson and Floyd–Steinberg as baselines.
- Sierra Lite (three taps) and Stucki (twelve taps).
- Serpentine scanning on all four error-diffusion methods; off by default for baseline parity.
- Ordered and Knoll with selectable 2×2, 4×4, 8×8 or 16×16 Bayer matrices.
- Ordered and Knoll with a fixed, periodic 64×64 blue-noise rank mask.
- Knoll strength (default 20%) and candidate count (default 32), shared by its two panels.
- Two-color, cell-averaged circular clustered-dot halftone; selectable cell size in logical pixels.
- Riemersma: power-of-two Hilbert traversal clipped to the image, exponentially weighted error queue
  (8/16/32/64 entries), newest weight 1 and oldest 1/16. Fully transparent blocks reset history.

Halftone uses the darkest/lightest colors when the selected palette has more than two entries.
It intentionally trades spatial detail for round dots. This is a cell-averaged halftone prototype,
not a per-pixel clustered threshold screen or CMYK print simulation.

All algorithms use encoded sRGB distance and preserve source alpha. Pixel step groups image pixels
into logical blocks, so it also enlarges the masks and halftone cells. Inputs are bounded before worker
processing; the selected longest edge is at most 640px. Riemersma prunes off-image Hilbert tiles to keep narrow images efficient. Timings are single apply passes, not statistically robust benchmarks.

## Blue-noise reproducibility

`node scripts/generate-blue-noise.mjs` regenerates our own mask using a seeded toroidal void-and-cluster
construction: relax a 10% seed pattern, rank removal to empty, rank insertion to half-full, then rank
removal of the complementary minority. Gaussian sigma 1.5, radius 6, seed `0x6d2b79f5`.
The mask lives in the optional `ditherto/blue-noise` entry and does not increase the core bundle.
Tests check rank coverage, wrapping, and low-frequency suppression at five densities.

## Validation

```sh
npx vitest run src/__tests__/experimental.test.ts
npx playwright test --config experiments/algorithm-lab/playwright.config.mjs
```

Playwright exercises all panels, controls, photo palette extraction, portrait sizing, uploads, nearest/Knoll
zero equivalence, two-color halftone, PNG downloads and narrow layout in Chromium, Firefox and WebKit.
For this workspace's temporary browser installation, prefix the command with
`PLAYWRIGHT_BROWSERS_PATH=/tmp/ditherto-playwright`.

## References

- [Dithering Studio algorithm overview](https://ditheringstudio.com/en/Education/Algorithms)
- [Riemersma's description](https://www.compuphase.com/riemer.htm), especially source-minus-output error history.
- [Ulichney, The void-and-cluster method for dither array generation (1993)](https://cv.ulichney.com/papers/1993-void-cluster.pdf)
- [Knoll / Yliluoma comparison](https://30fps.net/pages/revisiting-yliluoma-2/)

See [production API contracts](../../ALGORITHMS.md). The lab intentionally extracts a two-color pair for its halftone panel; the public API also accepts larger palettes, selects their extrema, and warns.
