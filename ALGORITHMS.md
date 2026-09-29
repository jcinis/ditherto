# Algorithm contracts

All algorithms are deterministic for the same decoded RGBA bytes, palette and options. They use
encoded sRGB Euclidean distance; nearest-color ties preserve input palette order. Results contain
palette colors, preserve each destination alpha, and do not mutate input. A logical block samples
its first visible pixel, with partially transparent samples contributing their RGB unchanged.
Fully invisible blocks retain their original bytes and cannot inject hidden RGB into neighbors.

## Settings and defaults

The README lists names, settings, exported option types and CLI flags. Existing defaults stay unchanged:
Atkinson, Floyd–Steinberg and diffusion additions scan left-to-right unless `serpentine: true` is set;
Ordered and Knoll use Bayer 4×4; Knoll uses strength 0.2 and 32 candidates. Matrices are anchored to the
image origin in logical pixels. Blue noise has a fixed periodic 64×64 mask and rejects `bayerSize`.

All new settings are accepted through `algorithmOptions` in the pixel APIs, browser helpers and
responsive DOM bindings. `data-algorithm-options` accepts the same JSON object. Switching algorithms
requires replacing or clearing that object, not reusing keys for a different algorithm.

```html
<img class="dither" src="photo.png" data-algorithm="stucki"
     data-algorithm-options='{"serpentine":true}'>
```

## Diffusion

Sierra Lite uses weights 2/4 to the right, 1/4 down-left and 1/4 down. Stucki distributes 42/42
across twelve taps in two following rows and two following columns. Atkinson retains its 6/8
error distribution. Errors are floating point and unclamped. Serpentine mirrors all horizontal
tap offsets on alternate logical rows. Scratch storage is proportional to logical image width.

## Riemersma

A clipped Hilbert traversal preserves the original square curve's visit order, but prunes entire
off-image tiles. Its work is proportional to visible logical pixels plus visited tree nodes, rather
than the area of the enclosing square. Recursion depth is logarithmic in the longest side.

The bounded error queue holds source-minus-output RGB errors. Weight decreases exponentially from
1 for the newest entry to 1/16 for the oldest; weights are not normalized. `history` defaults to 16,
accepts integers 2–64, and governs both texture and computation cost. Fully transparent blocks reset
the history. Skipped off-image points do not contribute errors or advance it.

Reference: [Riemersma's original description](https://www.compuphase.com/riemer.htm).

## Halftone

Halftone averages projected color coverage per cell and fills a central cluster in order of squared
distance from the center. Spatial ties are resolved in row-major order. This intentionally loses
within-cell detail; it is not CMYK simulation. `cellSize` is 2–16 logical pixels, default 8.
Rank order is cached by cell size; rendering uses bounded cell scratch space without per-cell sorting.

The two output colors are selected by encoded-sRGB luma (0.299 R + 0.587 G + 0.114 B). Equal-luma
colors use numeric RGB order as a stable tiebreaker. Palettes with more than two entries emit one
`console.warn` per apply call naming the extrema. Fewer than two distinct RGB values is an error.
Warnings are informational: output still succeeds. The CLI's warning uses stderr; JSON uses stdout.

Partially transparent logical samples have equal coverage weight to opaque samples, matching other
algorithms' RGB sampling convention. Fully transparent samples are excluded from cell averages and
dot placement. Each destination pixel retains its alpha. Partial edge cells average only visible
in-bounds samples but retain the full cell's dot center and rank order.

## Optional blue noise

`ditherto/blue-noise` exports `registerBlueNoise(registry)`, `orderedBlueNoiseAlgorithm`,
`knollBlueNoiseAlgorithm`, and `BlueNoiseKnollOptions`. Registration is explicit and idempotent for
built-in names. Pass the registry from the entry used to render; separate prebundled entries have
separate registries. Custom algorithms under these two names are replaced if explicitly registered.

The mask is generated locally by `node scripts/generate-blue-noise.mjs` using a fixed seed
(`0x6d2b79f5`) and toroidal void-and-cluster construction. Gaussian sigma 1.5, support radius 6,
initial occupancy 10%; rank-removal, rank-insertion and complementary minority phases produce all
4096 unique ranks. No external texture is redistributed.

Reference: [Ulichney, 1993](https://cv.ulichney.com/papers/1993-void-cluster.pdf).
The mask and algorithm code are bundled only in the optional entry (and the CLI). Importing it does
not mutate a registry. Playground workers load it on demand; the full comparison gallery loads it
because it renders both variants. The core gzip budget is 14 KiB after adding four algorithms;
the separate blue-noise entry has a 15 KiB budget. The DOM entry retains its 16 KiB budget.

## Validation and limits

```sh
npm run test:ci
npm run test:dom
npm run typecheck
npm run lint
npm run test:package
npm run test:browser
node scripts/benchmark-algorithms.mjs
```

Checks include independent diffusion and Riemersma references, alpha/edge handling, malformed options,
Bayer rank coverage, blue-noise low-frequency suppression, explicit registration, ESM/CJS/types,
CLI pixel parity and warning/JSON separation, and Chromium/Firefox/WebKit rendering and DOM recipes.
The benchmark records warmed median apply times in `.build/production-algorithm-benchmark.json`.

The library's existing limits apply: at most 8192 pixels per side and 16,777,216 pixels total.
Pixel processing is synchronous after decoding; interactive consumers should render large images in
workers. Knoll cost grows with image pixels × candidates × palette size; Riemersma cost grows with
history length and palette size. The timing panel and benchmarks do not promise real-time processing
at maximum size. Host decoders and color management can still differ before RGBA processing.
