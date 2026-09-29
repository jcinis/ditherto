/** Local comparison adapter. All rendering delegates to production algorithms. */
import type { DitherAlgorithm } from '../types.js';
import { algorithms } from '../algorithmRegistry.js';
import {
  blueNoiseThreshold,
  orderedBlueNoiseAlgorithm,
  knollBlueNoiseAlgorithm,
} from '../blue-noise.js';
import { bayerThreshold } from '../algorithms/bayer.js';
export { blueNoiseThreshold };
export const luma = (c: readonly number[]): number => c[0]! * 0.299 + c[1]! * 0.587 + c[2]! * 0.114;
export interface LabSettings {
  bayerSize?: number;
  strength?: number;
  candidates?: number;
  serpentine?: boolean;
  cellSize?: number;
  history?: number;
}
export function bayerRanks(size: number): number[] {
  const threshold = bayerThreshold(size);
  return Array.from(
    { length: size * size },
    (_, i) => threshold(i % size, Math.floor(i / size)) * size * size - 0.5
  );
}
/** Standard Hilbert distance-to-coordinate mapping on a power-of-two square. */
export function hilbertPoint(size: number, distance: number): [number, number] {
  let x = 0,
    y = 0,
    t = distance;
  for (let scale = 1; scale < size; scale *= 2) {
    const rx = 1 & Math.floor(t / 2),
      ry = 1 & (t ^ rx);
    if (ry === 0) {
      if (rx === 1) {
        x = scale - 1 - x;
        y = scale - 1 - y;
      }
      [x, y] = [y, x];
    }
    x += scale * rx;
    y += scale * ry;
    t = Math.floor(t / 4);
  }
  return [x, y];
}

export function makeLabAlgorithms(settings: LabSettings = {}): Record<string, DitherAlgorithm> {
  const {
    bayerSize = 4,
    strength = 0.2,
    candidates = 32,
    serpentine = false,
    cellSize = 8,
    history = 16,
  } = settings;
  const wrap = (
    algorithm: DitherAlgorithm,
    options: Readonly<Record<string, unknown>> = {}
  ): DitherAlgorithm => ({
    name: algorithm.name,
    apply: (data, palette, step) => algorithm.apply(data, palette, step, options),
  });
  const core = (name: string, options: Readonly<Record<string, unknown>> = {}) =>
    wrap(algorithms.get(name)!, options);
  return {
    nearest: core('nearest'),
    atkinson: core('atkinson', { serpentine }),
    'floyd-steinberg': core('floyd-steinberg', { serpentine }),
    'sierra-lite': core('sierra-lite', { serpentine }),
    stucki: core('stucki', { serpentine }),
    'ordered-bayer': core('ordered', { bayerSize }),
    'ordered-blue': wrap(orderedBlueNoiseAlgorithm),
    'knoll-bayer': core('knoll', { bayerSize, strength, candidates }),
    'knoll-blue': wrap(knollBlueNoiseAlgorithm, { strength, candidates }),
    halftone: core('halftone', { cellSize }),
    riemersma: core('riemersma', { history }),
  };
}
