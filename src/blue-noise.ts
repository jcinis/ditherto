/** Optional blue-noise algorithms. Importing this entry never mutates a registry. */
import type { AlgorithmOptions, DitherAlgorithm } from './types.js';
import { createOrderedAlgorithm } from './algorithms/ordered.js';
import { createKnollAlgorithm } from './algorithms/knoll.js';
import { blueNoiseRanks } from './patterns/blueNoise64.js';

/** Knoll blue noise uses a fixed 64×64 mask, so it has no Bayer-size setting. */
export interface BlueNoiseKnollOptions extends AlgorithmOptions {
  strength?: number;
  candidates?: number;
}
export const blueNoiseThreshold = (x: number, y: number): number =>
  (blueNoiseRanks[(y % 64) * 64 + (x % 64)]! + 0.5) / 4096;
export const orderedBlueNoiseAlgorithm = createOrderedAlgorithm(
  'ordered-blue-noise',
  blueNoiseThreshold
);
export const knollBlueNoiseAlgorithm = createKnollAlgorithm(
  { name: 'knoll-blue-noise' },
  blueNoiseThreshold
);
/** Pass the registry from the same entry point used to render (browser, dom or main). */
export function registerBlueNoise(registry: { register(algorithm: DitherAlgorithm): void }): void {
  registry.register(orderedBlueNoiseAlgorithm);
  registry.register(knollBlueNoiseAlgorithm);
}
