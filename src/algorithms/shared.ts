import type { ColorRGB } from '../types.js';
import { createImageDataCrossPlatform } from '../imageData.js';
import { findClosestColor } from '../palette/utils.js';
import { validatePalette, validatePixels, validatePositiveInteger } from '../validation.js';

export function prepare(data: ImageData, palette: readonly ColorRGB[], step: number): ImageData {
  validatePixels(data);
  validatePalette(palette);
  validatePositiveInteger(step, 'Step');
  return createImageDataCrossPlatform(new Uint8ClampedArray(data.data), data.width, data.height);
}

/** Blocks sample their top-left pixel; retain each destination pixel's original alpha. */
export function fillBlock(
  result: ImageData,
  x: number,
  y: number,
  step: number,
  color: ColorRGB
): void {
  for (let by = y; by < Math.min(y + step, result.height); by++) {
    for (let bx = x; bx < Math.min(x + step, result.width); bx++) {
      const i = (by * result.width + bx) * 4;
      result.data[i] = color[0];
      result.data[i + 1] = color[1];
      result.data[i + 2] = color[2];
    }
  }
}

/** Prefer the block origin, or its first visible pixel when the origin is transparent. */
export function sampleIndex(data: ImageData, x: number, y: number, step: number): number {
  for (let by = y; by < Math.min(y + step, data.height); by++) {
    for (let bx = x; bx < Math.min(x + step, data.width); bx++) {
      const index = (by * data.width + bx) * 4;
      if (data.data[index + 3] !== 0) return index;
    }
  }
  return -1;
}

export type Tap = readonly [dx: number, dy: number, weight: number];

/** Raster or serpentine diffusion, with unclamped floating-point error and O(width / step) scratch space. */
export function diffuse(
  data: ImageData,
  palette: readonly ColorRGB[],
  step: number,
  taps: readonly Tap[],
  serpentine = false
): ImageData {
  const result = prepare(data, palette, step);
  const columns = Math.ceil(data.width / step);
  const rows = Math.ceil(data.height / step);
  const rowCount = Math.max(...taps.map((tap) => tap[1])) + 1;
  const errors = Array.from({ length: rowCount }, () => new Float64Array(columns * 3));
  for (let y = 0; y < rows; y++) {
    const current = errors[y % rowCount]!;
    const direction = serpentine && y % 2 ? -1 : 1;
    for (let column = 0; column < columns; column++) {
      const x = direction === 1 ? column : columns - 1 - column;
      const i = sampleIndex(data, x * step, y * step, step);
      // Invisible source colors must not inject error into visible neighbours.
      if (i < 0) continue;
      const pixel: ColorRGB = [
        data.data[i]! + current[x * 3]!,
        data.data[i + 1]! + current[x * 3 + 1]!,
        data.data[i + 2]! + current[x * 3 + 2]!,
      ];
      const color = findClosestColor(pixel, palette);
      fillBlock(result, x * step, y * step, step, color);
      spreadError(data, errors, taps, pixel, color, x, y, step, columns, rows, rowCount, direction);
    }
    current.fill(0);
  }
  return result;
}

function spreadError(
  data: ImageData,
  errors: Float64Array[],
  taps: readonly Tap[],
  pixel: ColorRGB,
  color: ColorRGB,
  x: number,
  y: number,
  step: number,
  columns: number,
  rows: number,
  rowCount: number,
  direction: number
): void {
  for (const [dx, dy, weight] of taps) {
    const nx = x + dx * direction;
    const ny = y + dy;
    if (nx < 0 || nx >= columns || ny >= rows) continue;
    if (sampleIndex(data, nx * step, ny * step, step) < 0) continue;
    const row = errors[ny % rowCount]!;
    for (let c = 0; c < 3; c++) {
      row[nx * 3 + c] = row[nx * 3 + c]! + (pixel[c]! - color[c]!) * weight;
    }
  }
}
