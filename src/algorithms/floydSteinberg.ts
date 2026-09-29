import type { DitherAlgorithm } from '../types.js';
import { diffusionOptions } from '../algorithmOptions.js';
import { diffuse } from './shared.js';

/** Floyd–Steinberg's four forward neighbours receive the full quantization error. */
export const floydSteinbergAlgorithm: DitherAlgorithm = {
  name: 'floyd-steinberg',
  validateOptions: diffusionOptions,
  apply: (data, palette, step, options) =>
    diffuse(
      data,
      palette,
      step,
      [
        [1, 0, 7 / 16],
        [-1, 1, 3 / 16],
        [0, 1, 5 / 16],
        [1, 1, 1 / 16],
      ],
      diffusionOptions(options)
    ),
};
