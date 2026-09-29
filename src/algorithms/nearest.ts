import { findClosestColor } from '../palette/utils.js';
import type { DitherAlgorithm } from '../types.js';
import { fillBlock, prepare, sampleIndex } from './shared.js';

/** Nearest-color palette mapping with no dithering or inter-pixel error. */
export const nearestAlgorithm: DitherAlgorithm = {
  name: 'nearest',
  apply(data, palette, step) {
    const result = prepare(data, palette, step);
    for (let y = 0; y < data.height; y += step) {
      for (let x = 0; x < data.width; x += step) {
        const i = sampleIndex(data, x, y, step);
        if (i < 0) continue;
        const color = findClosestColor(
          [data.data[i]!, data.data[i + 1]!, data.data[i + 2]!],
          palette
        );
        fillBlock(result, x, y, step, color);
      }
    }
    return result;
  },
};
