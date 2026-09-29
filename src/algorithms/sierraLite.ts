import type { DitherAlgorithm } from '../types.js';
import { diffusionOptions } from '../algorithmOptions.js';
import { diffuse } from './shared.js';
const taps = [
  [1, 0, 1 / 2],
  [-1, 1, 1 / 4],
  [0, 1, 1 / 4],
] as const;
export const sierraLiteAlgorithm: DitherAlgorithm = {
  name: 'sierra-lite',
  validateOptions: diffusionOptions,
  apply: (data, palette, step, options) =>
    diffuse(data, palette, step, taps, diffusionOptions(options)),
};
