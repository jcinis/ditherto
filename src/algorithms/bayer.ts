import type { AlgorithmOptions } from '../types.js';
export type Threshold = (x: number, y: number) => number;
export function bayerSize(options: AlgorithmOptions): number {
  const size = options.bayerSize === undefined ? 4 : options.bayerSize;
  if (typeof size !== 'number' || ![2, 4, 8, 16].includes(size))
    throw new Error('bayerSize must be 2, 4, 8 or 16');
  return size;
}
const cache = new Map<number, Threshold>();
export function bayerThreshold(size: number): Threshold {
  const cached = cache.get(size);
  if (cached) return cached;
  bayerSize({ bayerSize: size });
  let ranks = [0];
  for (let n = 1; n < size; n *= 2) {
    const next = new Array<number>(n * n * 4);
    for (let y = 0; y < n * 2; y++)
      for (let x = 0; x < n * 2; x++)
        next[y * n * 2 + x] =
          4 * ranks[(y % n) * n + (x % n)]! +
          [0, 2, 3, 1][Math.floor(y / n) * 2 + Math.floor(x / n)]!;
    ranks = next;
  }
  const threshold: Threshold = (x, y) =>
    (ranks[(y % size) * size + (x % size)]! + 0.5) / (size * size);
  cache.set(size, threshold);
  return threshold;
}
