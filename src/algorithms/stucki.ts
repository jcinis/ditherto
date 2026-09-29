import type { DitherAlgorithm } from '../types.js';
import { diffusionOptions } from '../algorithmOptions.js';
import { diffuse } from './shared.js';
const taps = [
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
] as const;
export const stuckiAlgorithm: DitherAlgorithm = {
  name: 'stucki',
  validateOptions: diffusionOptions,
  apply: (data, palette, step, options) =>
    diffuse(data, palette, step, taps, diffusionOptions(options)),
};
