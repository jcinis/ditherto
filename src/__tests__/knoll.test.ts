import { describe, expect, it } from 'vitest';
import { algorithms } from '../algorithmRegistry.js';
import { createKnollAlgorithm } from '../algorithms/knoll.js';
import { ditherToImageData } from '../imageProcessor.js';
import { PALETTES } from '../palette/utils.js';
import type { ColorRGB } from '../types.js';
import { createSolidImageData } from './testUtils.js';

const rgb: readonly ColorRGB[] = [
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
];
const colors = (image: ImageData) =>
  Array.from({ length: image.width * image.height }, (_, i) =>
    Array.from(image.data.slice(i * 4, i * 4 + 3))
  );

describe('experimental Knoll', () => {
  it('uses all three primaries to approximate gray within one Bayer cell of equal coverage', () => {
    const output = createKnollAlgorithm({ strength: 1, candidates: 48 }).apply(
      createSolidImageData([85, 85, 85], 4, 4),
      rgb,
      1
    );
    for (const color of rgb) {
      const count = colors(output).filter((p) => p.every((v, c) => v === color[c])).length;
      expect(count).toBeGreaterThanOrEqual(5);
      expect(count).toBeLessThanOrEqual(6);
    }
  });

  it('has half coverage for midpoint BW and a monotonic coverage ramp at full strength', () => {
    const algorithm = createKnollAlgorithm({ strength: 1, candidates: 32 });
    let previous = 0;
    for (let level = 0; level <= 16; level++) {
      const value = Math.round((level * 255) / 16);
      const output = algorithm.apply(
        createSolidImageData([value, value, value], 4, 4),
        PALETTES.BW,
        1
      );
      const white = colors(output).filter((p) => p[0] === 255).length;
      expect(white).toBe(level);
      expect(white).toBeGreaterThanOrEqual(previous);
      previous = white;
    }
  });

  it('strength zero is nearest-color quantization, including palette-order ties', () => {
    const output = createKnollAlgorithm({ strength: 0 }).apply(
      createSolidImageData([85, 85, 85], 4, 4),
      rgb,
      1
    );
    expect(colors(output).every((p) => p[0] === 255 && p[1] === 0 && p[2] === 0)).toBe(true);
  });

  it('preserves exact palette colors, duplicates and singleton palettes', () => {
    const input = createSolidImageData([255, 0, 0], 5, 3);
    for (const palette of [rgb, [rgb[0]!, rgb[0]!], [rgb[0]!]]) {
      expect(createKnollAlgorithm().apply(input, palette, 1).data).toEqual(input.data);
    }
  });

  it('preserves alpha and input, samples visible block pixels, and clips partial blocks', () => {
    const input = createSolidImageData([85, 85, 85], 5, 3);
    input.data[3] = 0;
    input.data[7] = 72;
    const before = input.data.slice();
    const algorithm = createKnollAlgorithm();
    const output = algorithm.apply(input, rgb, 2);
    expect(input.data).toEqual(before);
    expect(output.data).toEqual(algorithm.apply(input, rgb, 2).data);
    expect(output.data.filter((_, i) => i % 4 === 3)).toEqual(before.filter((_, i) => i % 4 === 3));
    for (const color of colors(output)) expect(rgb).toContainEqual(color);
    expect(colors(output)[0]).toEqual(colors(output)[1]);
    expect(colors(output)[0]).toEqual(colors(output)[5]);
    input.data.set([255, 255, 255], 0);
    expect(algorithm.apply(input, rgb, 2).data).toEqual(output.data);
  });

  it('keeps fully transparent blocks unchanged and does not diffuse between pixels', () => {
    const input = createSolidImageData([85, 85, 85], 4, 4);
    const algorithm = createKnollAlgorithm();
    const original = algorithm.apply(input, rgb, 1);
    input.data.set([42, 23, 17, 0], 0);
    const output = algorithm.apply(input, rgb, 1);
    expect(output.data.slice(0, 4)).toEqual(input.data.slice(0, 4));
    expect(output.data.slice(4)).toEqual(original.data.slice(4));
  });

  it('registers a named configuration through the existing pipeline', async () => {
    const algorithm = createKnollAlgorithm({ name: 'test-knoll' });
    algorithms.register(algorithm);
    const input = createSolidImageData([85, 85, 85], 4, 4);
    expect(
      (await ditherToImageData(input, { algorithm: algorithm.name, palette: rgb })).data
    ).toEqual(algorithm.apply(input, rgb, 1).data);
    expect(algorithms.list()).toContain('knoll');
  });

  it.each([-1, 1.1, NaN, Infinity])('rejects invalid strength %s', (strength) => {
    expect(() => createKnollAlgorithm({ strength })).toThrow(/strength/i);
  });
  it.each([0, -1, 1.5, 257, NaN, Infinity])('rejects invalid candidate count %s', (candidates) => {
    expect(() => createKnollAlgorithm({ candidates })).toThrow(/candidates/i);
  });
  it('uses the existing pixel, palette and step validation', () => {
    const input = createSolidImageData([0, 0, 0], 1, 1);
    const algorithm = createKnollAlgorithm();
    expect(() => algorithm.apply(input, [], 1)).toThrow();
    expect(() => algorithm.apply(input, PALETTES.BW, 0)).toThrow();
    expect(() =>
      algorithm.apply({ ...input, data: new Uint8ClampedArray(0) }, PALETTES.BW, 1)
    ).toThrow();
  });
});
