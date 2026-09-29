import { expect, it } from 'vitest';
import { algorithms } from '../algorithmRegistry.js';
import { ditherToImageData } from '../imageProcessor.js';
import { createSolidImageData } from './testUtils.js';
import { walkHilbert } from '../algorithms/riemersma.js';
import { hilbertPoint } from '../experimental/lab.js';

it('ships the new algorithms through the normal pipeline', async () => {
  for (const algorithm of ['sierra-lite', 'stucki', 'halftone', 'riemersma']) {
    expect(algorithms.get(algorithm)).toBeDefined();
    const output = await ditherToImageData(createSolidImageData([112, 112, 112], 17, 11), {
      algorithm,
    });
    expect(output.width).toBe(17);
    expect([...output.data].filter((_, i) => i % 4 === 0).every((v) => v === 0 || v === 255)).toBe(
      true
    );
  }
});
it.each([
  ['ordered', { bayerSize: 3 }],
  ['knoll', { bayerSize: 32 }],
  ['stucki', { serpentine: 'true' }],
  ['sierra-lite', { strength: 0.2 }],
  ['halftone', { cellSize: 1 }],
  ['riemersma', { history: 1 }],
  ['riemersma', { history: NaN }],
  ['halftone', { unknown: 2 }],
])('rejects invalid %s settings before decoding', async (algorithm, algorithmOptions) => {
  await expect(
    ditherToImageData('missing.png', {
      algorithm: algorithm as string,
      algorithmOptions: algorithmOptions as Record<string, unknown>,
    })
  ).rejects.toThrow(/must|Unsupported/);
});
it('prunes off-image Hilbert tiles without changing the traversal', () => {
  for (const [width, height] of [
    [1, 1],
    [7, 3],
    [3, 7],
    [13, 11],
    [16, 16],
    [1, 64],
    [64, 1],
  ]) {
    const actual: number[][] = [];
    walkHilbert(width!, height!, (x, y) => actual.push([x, y]));
    const size = 2 ** Math.ceil(Math.log2(Math.max(width!, height!)));
    const expected = Array.from({ length: size * size }, (_, d) => hilbertPoint(size, d)).filter(
      ([x, y]) => x < width! && y < height!
    );
    expect(actual).toEqual(expected);
  }
  let count = 0;
  const nodes = walkHilbert(65536, 1, () => {
    count++;
  });
  expect(count).toBe(65536);
  expect(nodes).toBeLessThan(65536 * 8);
});

it('Bayer sizes have correct coverage and retain zero-strength Knoll behavior', async () => {
  for (const size of [2, 4, 8, 16]) {
    const input = createSolidImageData([128, 128, 128], size, size);
    const ordered = await ditherToImageData(input, {
      algorithm: 'ordered',
      algorithmOptions: { bayerSize: size },
    });
    expect([...ordered.data].filter((v, i) => i % 4 === 0 && v === 255).length).toBe(
      Math.round((size * size * 128) / 255)
    );
    const zero = await ditherToImageData(input, {
      algorithm: 'knoll',
      algorithmOptions: { bayerSize: size, strength: 0 },
    });
    expect(zero.data).toEqual((await ditherToImageData(input, { algorithm: 'nearest' })).data);
  }
});
