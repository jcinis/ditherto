import type { AlgorithmOptions, ColorRGB, DitherAlgorithm } from '../types.js';
import { integerOption, optionKeys } from '../algorithmOptions.js';
import { fillBlock, prepare, sampleIndex } from './shared.js';

function settings(options: AlgorithmOptions = {}): number {
  optionKeys(options, ['cellSize']);
  return integerOption(options, 'cellSize', 8, 2, 16);
}
const luma = (c: ColorRGB): number => c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114;
const key = (c: ColorRGB): number => c[0] * 65536 + c[1] * 256 + c[2];
function endpoints(palette: readonly ColorRGB[]): [ColorRGB, ColorRGB] {
  const sorted = [...palette].sort((a, b) => luma(a) - luma(b) || key(a) - key(b));
  return [sorted[0]!, sorted[sorted.length - 1]!];
}
function validatePair(palette: readonly ColorRGB[]): void {
  if (palette.length < 2 || palette.every((c) => c.every((v, i) => v === palette[0]![i])))
    throw new Error('Halftone requires at least two distinct palette colors.');
}
const rankCache = new Map<number, number[]>();
function dotOrder(size: number): number[] {
  const cached = rankCache.get(size);
  if (cached) return cached;
  const center = (size - 1) / 2;
  const distance = (i: number) => ((i % size) - center) ** 2 + (Math.floor(i / size) - center) ** 2;
  const order = Array.from({ length: size * size }, (_, i) => i).sort(
    (a, b) => distance(a) - distance(b) || a - b
  );
  rankCache.set(size, order);
  return order;
}
interface Cell {
  size: number;
  step: number;
  dark: ColorRGB;
  light: ColorRGB;
  direction: ColorRGB;
  length: number;
  order: number[];
  visible: Uint8Array;
}
function paintCell(data: ImageData, output: ImageData, cx: number, cy: number, cell: Cell): void {
  const { size, step, dark, light, direction, length, order, visible } = cell;
  visible.fill(0);
  let amount = 0;
  for (let dy = 0; dy < size; dy++)
    for (let dx = 0; dx < size; dx++) {
      const x = (cx + dx) * step,
        y = (cy + dy) * step;
      if (x >= data.width || y >= data.height) continue;
      const i = sampleIndex(data, x, y, step);
      if (i < 0) continue;
      const projection =
        (data.data[i]! - dark[0]) * direction[0] +
        (data.data[i + 1]! - dark[1]) * direction[1] +
        (data.data[i + 2]! - dark[2]) * direction[2];
      amount += 1 - Math.max(0, Math.min(1, projection / length));
      visible[dy * size + dx] = 1;
    }
  let remaining = Math.round(amount);
  for (const rank of order) {
    if (!visible[rank]) continue;
    fillBlock(
      output,
      (cx + (rank % size)) * step,
      (cy + Math.floor(rank / size)) * step,
      step,
      remaining-- > 0 ? dark : light
    );
  }
}
/** Two-color, cell-averaged clustered dots; ties are stable in row-major order.
 * Visible logical samples have equal weight. Each destination alpha is retained.
 */
export const halftoneAlgorithm: DitherAlgorithm = {
  name: 'halftone',
  validateOptions: settings,
  validatePalette: validatePair,
  apply(data, palette, step, options) {
    const size = settings(options),
      output = prepare(data, palette, step);
    validatePair(palette);
    const [dark, light] = endpoints(palette);
    if (palette.length > 2)
      console.warn(
        `Halftone uses only the darkest and lightest palette colors: [${dark.join(', ')}] and [${light.join(', ')}].`
      );
    const direction: ColorRGB = [light[0] - dark[0], light[1] - dark[1], light[2] - dark[2]];
    const cell: Cell = {
      size,
      step,
      dark,
      light,
      direction,
      length: direction.reduce((sum, c) => sum + c * c, 0),
      order: dotOrder(size),
      visible: new Uint8Array(size * size),
    };
    for (let y = 0; y < Math.ceil(data.height / step); y += size)
      for (let x = 0; x < Math.ceil(data.width / step); x += size)
        paintCell(data, output, x, y, cell);
    return output;
  },
};
