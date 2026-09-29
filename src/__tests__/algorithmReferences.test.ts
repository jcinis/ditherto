import { expect, it, vi } from 'vitest';
import { algorithms } from '../algorithmRegistry.js';
import { ditherToImageData } from '../imageProcessor.js';
import { createSolidImageData } from './testUtils.js';
import { PALETTES } from '../palette/utils.js';
import { hilbertPoint } from '../experimental/lab.js';
import {
  registerBlueNoise,
  knollBlueNoiseAlgorithm,
  orderedBlueNoiseAlgorithm,
} from '../blue-noise.js';
import type { AlgorithmOptions, ColorRGB } from '../types.js';
const palette: readonly ColorRGB[] = [
  [12, 31, 80],
  [173, 110, 65],
  [230, 247, 201],
];
const kernels: Record<string, number[][]> = {
  'sierra-lite': [
    [1, 0, 2 / 4],
    [-1, 1, 1 / 4],
    [0, 1, 1 / 4],
  ],
  stucki: [
    [1, 0, 8 / 42],
    [2, 0, 4 / 42],
    [-2, 1, 2 / 42],
    [-1, 1, 4 / 42],
    [0, 1, 8 / 42],
    [1, 1, 4 / 42],
    [2, 1, 2 / 42],
    [-2, 2, 1 / 42],
    [-1, 2, 2 / 42],
    [0, 2, 4 / 42],
    [1, 2, 2 / 42],
    [2, 2, 1 / 42],
  ],
};
function fixture(width = 17, height = 11): ImageData {
  const result = createSolidImageData([0, 0, 0], width, height);
  for (let i = 0; i < result.data.length; i++)
    result.data[i] = i % 4 === 3 ? (i % 17 === 0 ? 0 : (i % 251) + 1) : (i * 53 + 71) % 256;
  return result;
}
function nearest(pixel: readonly number[], colors = palette): ColorRGB {
  const distance = (c: ColorRGB) => c.reduce((s, v, i) => s + (v - pixel[i]!) ** 2, 0);
  return colors.reduce((a, b) => (distance(b) < distance(a) ? b : a));
}
// Separate full-frame logical grid oracle. No production sampling/filling/diffusion helpers.
function referenceDiffusion(
  input: ImageData,
  name: string,
  step: number,
  serpentine: boolean
): Uint8ClampedArray {
  const w = Math.ceil(input.width / step),
    h = Math.ceil(input.height / step),
    out = input.data.slice();
  const blocks = Array.from({ length: w * h }, (_, i) => {
    const indices: number[] = [];
    for (
      let y = Math.floor(i / w) * step;
      y < Math.min(input.height, (Math.floor(i / w) + 1) * step);
      y++
    )
      for (let x = (i % w) * step; x < Math.min(input.width, ((i % w) + 1) * step); x++)
        indices.push((y * input.width + x) * 4);
    const sample = indices.find((j) => input.data[j + 3] !== 0);
    return { indices, sample, errors: [0, 0, 0] };
  });
  for (let y = 0; y < h; y++)
    for (let n = 0; n < w; n++) {
      const direction = serpentine && y % 2 ? -1 : 1,
        x = direction === 1 ? n : w - 1 - n,
        block = blocks[y * w + x]!;
      if (block.sample === undefined) continue;
      const value = block.errors.map((e, c) => input.data[block.sample! + c]! + e),
        color = nearest(value);
      block.indices.forEach((i) =>
        color.forEach((v, c) => {
          out[i + c] = v;
        })
      );
      kernels[name]!.forEach(([dx, dy, weight]) => {
        const tx = x + dx! * direction,
          ty = y + dy!;
        if (tx < 0 || tx >= w || ty >= h) return;
        const target = blocks[ty * w + tx]!;
        if (target.sample === undefined) return;
        target.errors = target.errors.map((e, c) => e + (value[c]! - color[c]!) * weight!);
      });
    }
  return out;
}
for (const name of Object.keys(kernels))
  for (const serpentine of [false, true])
    for (const step of [1, 2, 3])
      it(`${name} matches an independent RGB/alpha reference, serpentine=${serpentine}, step=${step}`, () => {
        const input = fixture();
        const result = algorithms.get(name)!.apply(input, palette, step, { serpentine });
        expect(result.data).toEqual(referenceDiffusion(input, name, step, serpentine));
      });

it('Riemersma matches a clipped square/shift-queue oracle for rectangular RGB and transparency', () => {
  for (const [w, h] of [
    [13, 7],
    [1, 31],
    [31, 1],
  ])
    [2, 16, 64].forEach((history) => {
      const input = fixture(w, h),
        expected = input.data.slice(),
        queue: number[][] = [];
      const size = 2 ** Math.ceil(Math.log2(Math.max(w!, h!)));
      const path = Array.from({ length: size * size }, (_, d) => hilbertPoint(size, d)).filter(
        ([x, y]) => x < w! && y < h!
      );
      for (const [x, y] of path) {
        const i = (y * w! + x) * 4;
        if (!input.data[i + 3]) {
          queue.length = 0;
          continue;
        }
        const corrected = [0, 1, 2].map((c) =>
          queue.reduceRight(
            (sum, e, j) => sum + e[c]! * 16 ** (-(queue.length - 1 - j) / (history - 1)),
            input.data[i + c]!
          )
        );
        const color = nearest(corrected);
        color.forEach((v, c) => {
          expected[i + c] = v;
        });
        queue.push(color.map((v, c) => input.data[i + c]! - v));
        if (queue.length > history) queue.shift();
      }
      expect(algorithms.get('riemersma')!.apply(input, palette, 1, { history }).data).toEqual(
        expected
      );
    });
});
it('halftone selects extrema, warns once per render and preserves alpha and input', async () => {
  const input = fixture(),
    before = input.data.slice(),
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const result = await ditherToImageData(input, {
      algorithm: 'halftone',
      palette: [palette[1]!, palette[2]!, palette[0]!],
      algorithmOptions: { cellSize: 6 },
      step: 2,
    });
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('darkest and lightest'));
    const pair = await ditherToImageData(input, {
      algorithm: 'halftone',
      palette: [palette[0]!, palette[2]!],
      algorithmOptions: { cellSize: 6 },
      step: 2,
    });
    expect(result.data).toEqual(pair.data);
    expect(input.data).toEqual(before);
    expect(result.data.filter((_, i) => i % 4 === 3)).toEqual(before.filter((_, i) => i % 4 === 3));
  } finally {
    warn.mockRestore();
  }
  for (const colors of [[palette[0]!], [palette[0]!, palette[0]!]])
    await expect(
      ditherToImageData('missing.png', { algorithm: 'halftone', palette: colors })
    ).rejects.toThrow('two distinct');
});
it('halftone flat cells maintain expected coverage, including partial cells and invisible samples', () => {
  for (const size of [2, 3, 8, 16])
    for (const gray of [0, 32, 128, 224, 255]) {
      const data = createSolidImageData([gray, gray, gray], size - 1, size);
      data.data[3] = 0;
      const out = algorithms.get('halftone')!.apply(data, PALETTES.BW, 1, { cellSize: size });
      const black = [...out.data].filter(
        (v, i) => i % 4 === 0 && out.data[i + 3] !== 0 && v === 0
      ).length;
      expect(black).toBe(Math.round(((size - 1) * size - 1) * (1 - gray / 255)));
      expect(out.data.slice(0, 4)).toEqual(data.data.slice(0, 4));
    }
});
it('blue noise is opt-in, validates settings and zero-strength Knoll matches nearest', async () => {
  expect(algorithms.get('ordered-blue-noise')).toBeUndefined();
  registerBlueNoise(algorithms);
  const input = fixture();
  expect(
    (
      await ditherToImageData(input, {
        algorithm: 'knoll-blue-noise',
        algorithmOptions: { strength: 0 },
        palette,
      })
    ).data
  ).toEqual((await ditherToImageData(input, { algorithm: 'nearest', palette })).data);
  for (const algorithm of [orderedBlueNoiseAlgorithm, knollBlueNoiseAlgorithm]) {
    expect(() => algorithm.apply(input, palette, 1, { bayerSize: 4 })).toThrow('Unsupported');
    expect(() => algorithm.apply(input, palette, 1, null as unknown as AlgorithmOptions)).toThrow(
      'plain object'
    );
  }
});
