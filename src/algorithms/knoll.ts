import { assertAlgorithmOptions } from '../algorithmOptions.js';
import type { AlgorithmOptions, ColorRGB, DitherAlgorithm, KnollOptions } from '../types.js';
import { nearestAlgorithm } from './nearest.js';
import { fillBlock, prepare, sampleIndex } from './shared.js';

import { bayerSize, bayerThreshold, type Threshold } from './bayer.js';

function settings(
  options: AlgorithmOptions = {},
  allowBayer = true
): Required<Pick<KnollOptions, 'strength' | 'candidates'>> {
  assertAlgorithmOptions(options);
  for (const key of Object.keys(options)) {
    if (key !== 'strength' && key !== 'candidates' && !(allowBayer && key === 'bayerSize'))
      throw new Error(`Unsupported Knoll option: ${key}`);
  }
  if (allowBayer) bayerSize(options);
  const { strength = 0.2, candidates = 32 } = options;
  if (typeof strength !== 'number' || !Number.isFinite(strength) || strength < 0 || strength > 1)
    throw new Error('Knoll strength must be between 0 and 1');
  if (
    typeof candidates !== 'number' ||
    !Number.isInteger(candidates) ||
    candidates < 1 ||
    candidates > 256
  )
    throw new Error('Knoll candidates must be an integer between 1 and 256');
  return { strength, candidates };
}

/**
 * Knoll ordered dithering. The factory is retained for source-level experiments.
 * Uses encoded sRGB Euclidean distance, a fixed luma order and a configurable Bayer CDF (default 4×4).
 * Candidate errors stay local to each pixel and are deliberately not clamped.
 * Reference: https://30fps.net/pages/revisiting-yliluoma-2/#knolls-algorithm
 */
export function createKnollAlgorithm(
  { name = 'knoll', ...defaults }: KnollOptions & { name?: string } = {},
  thresholdAt?: Threshold
): DitherAlgorithm {
  const base = { ...defaults, ...settings(defaults, !thresholdAt) };
  return {
    name,
    validateOptions(options) {
      settings(options, !thresholdAt);
    },
    apply(data, palette, step, options = {}) {
      assertAlgorithmOptions(options);
      const { strength, candidates } = settings({ ...base, ...options }, !thresholdAt);
      const thresholdFor = thresholdAt ?? bayerThreshold(bayerSize({ ...base, ...options }));
      if (strength === 0) return nearestAlgorithm.apply(data, palette, step);
      const output = prepare(data, palette, step);
      // Sort indices once, preserving caller palette order for nearest-color ties.
      const luma = palette.map(([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b);
      const order = palette.map((_, i) => i).sort((a, b) => luma[a]! - luma[b]! || a - b);
      const weights = new Uint16Array(palette.length);
      for (let y = 0; y < data.height; y += step) {
        for (let x = 0; x < data.width; x += step) {
          const i = sampleIndex(data, x, y, step);
          if (i < 0) continue;
          planWeights(
            [data.data[i]!, data.data[i + 1]!, data.data[i + 2]!],
            palette,
            weights,
            strength,
            candidates
          );
          const threshold = thresholdFor(x / step, y / step) * candidates;
          const selected = selectWeight(weights, order, threshold);
          fillBlock(output, x, y, step, palette[selected]!);
        }
      }
      return output;
    },
  };
}

function selectWeight(weights: Uint16Array, order: number[], threshold: number): number {
  let cumulative = 0;
  for (const index of order) {
    cumulative += weights[index]!;
    if (cumulative > threshold) return index;
  }
  return order[order.length - 1]!;
}

function nearestIndex(r: number, g: number, b: number, palette: readonly ColorRGB[]): number {
  let best = Number.POSITIVE_INFINITY;
  let selected = 0;
  for (let k = 0; k < palette.length; k++) {
    const color = palette[k]!;
    const distance = (r - color[0]) ** 2 + (g - color[1]) ** 2 + (b - color[2]) ** 2;
    if (distance < best) {
      best = distance;
      selected = k;
    }
  }
  return selected;
}

function planWeights(
  [r, g, b]: ColorRGB,
  palette: readonly ColorRGB[],
  weights: Uint16Array,
  strength: number,
  candidates: number
): void {
  let er = 0;
  let eg = 0;
  let eb = 0;
  weights.fill(0);
  for (let n = 0; n < candidates; n++) {
    const selected = nearestIndex(r + er * strength, g + eg * strength, b + eb * strength, palette);
    const color = palette[selected]!;
    // Exact source colors and zero strength need only one lookup.
    if (n === 0 && (strength === 0 || (r === color[0] && g === color[1] && b === color[2]))) {
      weights[selected] = candidates;
      return;
    }
    weights[selected] = weights[selected]! + 1;
    er += r - color[0];
    eg += g - color[1];
    eb += b - color[2];
  }
}

export const knollAlgorithm = createKnollAlgorithm();
