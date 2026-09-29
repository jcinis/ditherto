import type { AlgorithmOptions, DitherAlgorithm } from '../types.js';
import { integerOption, optionKeys } from '../algorithmOptions.js';
import { findClosestColor } from '../palette/utils.js';
import { fillBlock, prepare, sampleIndex } from './shared.js';

/** Visit the clipped Hilbert curve in its original order, pruning whole off-image tiles.
 * Integer tile boundaries avoid seams. Work scales with visible pixels, even for 1×N.
 * Returns visited tree nodes for deterministic complexity tests (not part of the public API).
 */
export function walkHilbert(
  width: number,
  height: number,
  visit: (x: number, y: number) => void
): number {
  const size = 2 ** Math.ceil(Math.log2(Math.max(width, height)));
  let nodes = 0;
  function walk(
    x: number,
    y: number,
    xi: number,
    xj: number,
    yi: number,
    yj: number,
    n: number
  ): void {
    nodes++;
    const minX = x + Math.min(0, xi) + Math.min(0, yi),
      minY = y + Math.min(0, xj) + Math.min(0, yj);
    const maxX = x + Math.max(0, xi) + Math.max(0, yi),
      maxY = y + Math.max(0, xj) + Math.max(0, yj);
    if (minX >= width || minY >= height || maxX <= 0 || maxY <= 0) return;
    if (n === 1) {
      visit(Math.floor(x + (xi + yi) / 2), Math.floor(y + (xj + yj) / 2));
      return;
    }
    const a = xi / 2,
      b = xj / 2,
      c = yi / 2,
      d = yj / 2;
    walk(x, y, c, d, a, b, n / 2);
    walk(x + a, y + b, a, b, c, d, n / 2);
    walk(x + a + c, y + b + d, a, b, c, d, n / 2);
    walk(x + a + yi, y + b + yj, -c, -d, -a, -b, n / 2);
  }
  walk(0, 0, 0, size, size, 0, size);
  return nodes;
}
function settings(options: AlgorithmOptions = {}): number {
  optionKeys(options, ['history']);
  return integerOption(options, 'history', 16, 2, 64);
}
/** Riemersma: source-minus-output errors; newest weight 1, oldest 1/16.
 * https://www.compuphase.com/riemer.htm
 */
export const riemersmaAlgorithm: DitherAlgorithm = {
  name: 'riemersma',
  validateOptions: settings,
  apply(data, palette, step, options) {
    const history = settings(options),
      output = prepare(data, palette, step);
    const errors = new Float64Array(history * 3);
    const weights = Float64Array.from(
      { length: history },
      (_, age) => 16 ** (-age / (history - 1))
    );
    let head = 0;
    walkHilbert(Math.ceil(data.width / step), Math.ceil(data.height / step), (x, y) => {
      const i = sampleIndex(data, x * step, y * step, step);
      if (i < 0) {
        errors.fill(0);
        return;
      }
      let r = data.data[i]!,
        g = data.data[i + 1]!,
        b = data.data[i + 2]!;
      for (let age = 0; age < history; age++) {
        const index = ((head + history - 1 - age) % history) * 3,
          weight = weights[age]!;
        r += errors[index]! * weight;
        g += errors[index + 1]! * weight;
        b += errors[index + 2]! * weight;
      }
      const color = findClosestColor([r, g, b], palette);
      fillBlock(output, x * step, y * step, step, color);
      errors[head * 3] = data.data[i]! - color[0];
      errors[head * 3 + 1] = data.data[i + 1]! - color[1];
      errors[head * 3 + 2] = data.data[i + 2]! - color[2];
      head = (head + 1) % history;
    });
    return output;
  },
};
