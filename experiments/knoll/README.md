# Knoll prototype

A comparison study of Knoll's multi-candidate ordered dither and ditherto's two-color ordered method. Knoll and nearest-color mapping are now built-in algorithms. The comparison page uses the browser bundle, with the chosen default of 20% strength and 32 candidates.

From the repository root:

```sh
npm run build
python3 -m http.server 4181 --bind 127.0.0.1
```

Open [the comparison page](http://127.0.0.1:4181/experiments/knoll/). It has three fixture photos, image upload, five palette choices, strength, candidate count and render width controls. Rendering runs in a worker. Uploads are locally resized to at most 1600 pixels on their longest side. The comparison uses `dist/browser.js` and can also be opened at `/experiments/knoll/index.html` on the normal demo server.

For reproducible Node timings and six comparison PNGs:

```sh
node scripts/benchmark-knoll.mjs
```

Outputs go to `.build/knoll-study/`, including environment details and median processing times in `benchmark.json`. Rebuilding clears them. Browser timings on the page are single algorithm runs and may include JIT warm-up; they exclude source preparation, transfer and display.

Use the built-in through the public API:

```js
import { ditherToImageData } from 'ditherto';
const output = await ditherToImageData(input, {
  algorithm: 'knoll',
  algorithmOptions: { strength: 0.2, candidates: 32 },
  palette,
});
```

`strength` is 0–1, and `candidates` is an integer from 1–256. Zero strength gives the same pixels as `algorithm: 'nearest'`. Candidate colors may repeat; their frequencies form weights sampled in ascending luma order using a centered 4×4 Bayer threshold. More candidates refine the weights but do not increase the pattern's 16 spatial slots. RGB distance and accumulated errors use encoded sRGB, and errors are not clamped. Nearest-color ties retain caller palette order.

The algorithm scans every palette color for each candidate: O(pixels × candidates × palette size), with O(palette size) scratch space. It preserves the step, alpha, exact-color and input-immutability contracts. The implementation follows the Knoll method described in [Väänänen's article](https://30fps.net/pages/revisiting-yliluoma-2/) and [matejlou's explanation](https://matejlou.blog/2023/12/06/ordered-dithering-for-arbitrary-or-irregular-palettes/).

The benchmark below records the original 25% prototype comparison; the selected shipping default is 20%.

Initial local results (Apple M3, Node 22.23.2, September 25, 2026), across Coffee, Chelsea and Astronaut at 320 pixels wide:

| Palette | Ordered median | Knoll 25%, 32 candidates median |
| --- | --- | --- |
| Dusk, 4 colors | 15.3–22.9 ms | 25.9–42.0 ms |
| Photo, 16 colors | 46.3–67.9 ms | 69.6–105.0 ms |

These are ranges across the three fixtures, not confidence intervals. Each value is a median of three runs after one warm-up. The portrait is 320×320; the other photos are 320×213. At 25% strength, doubling candidates to 64 approximately doubled Knoll's time. Browser runtime costs differ: a single local coffee/photo16 run was 17.9 ms for ordered and 83.6 ms for Knoll at 25%/32. Neither result is a mobile or large-palette benchmark.

Visual review suggests 25%/32 is a useful starting point for photo palettes: the coffee study has fewer isolated high-contrast dots than the current ordered method. Full strength produces stronger texture. This is an initial subjective comparison, not a universal quality improvement. Fixture credits are in `tests/fixtures/photos/README.md`.
