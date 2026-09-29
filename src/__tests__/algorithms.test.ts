import { describe, expect, it } from 'vitest';
import { atkinsonAlgorithm } from '../algorithms/atkinson.js';
import { floydSteinbergAlgorithm } from '../algorithms/floydSteinberg.js';
import { knollAlgorithm } from '../algorithms/knoll.js';
import { nearestAlgorithm } from '../algorithms/nearest.js';
import { orderedAlgorithm } from '../algorithms/ordered.js';
import { createImageData, createSolidImageData } from './testUtils.js';
import { PALETTES } from '../palette/utils.js';
import type { ColorRGB } from '../types.js';

/** Deliberately simple full-frame scalar oracle; independent of the rolling-row engine. */
function reference(input: ImageData, palette: readonly ColorRGB[], atkinson: boolean): number[] {
  const values = Array.from({ length: input.width * input.height }, (_, i) =>
    Array.from(input.data.slice(i * 4, i * 4 + 3))
  );
  const output: number[] = [];
  const add = (x: number, y: number, error: number[], weight: number) => {
    if (x < 0 || x >= input.width || y >= input.height) return;
    const p = values[y * input.width + x]!;
    for (let c = 0; c < 3; c++) p[c] = p[c]! + error[c]! * weight;
  };
  for (let y = 0; y < input.height; y++) {
    for (let x = 0; x < input.width; x++) {
      const p = values[y * input.width + x]!;
      const nearest = palette.reduce((a, b) => {
        const distance = (v: ColorRGB) =>
          v.reduce((sum, channel, c) => sum + (channel - p[c]!) ** 2, 0);
        return distance(b) < distance(a) ? b : a;
      });
      output.push(...nearest, 255);
      const e = p.map((value, c) => value - nearest[c]!);
      if (atkinson) {
        add(x + 1, y, e, 0.125);
        add(x + 2, y, e, 0.125);
        add(x - 1, y + 1, e, 0.125);
        add(x, y + 1, e, 0.125);
        add(x + 1, y + 1, e, 0.125);
        add(x, y + 2, e, 0.125);
      } else {
        add(x + 1, y, e, 0.4375);
        add(x - 1, y + 1, e, 0.1875);
        add(x, y + 1, e, 0.3125);
        add(x + 1, y + 1, e, 0.0625);
      }
    }
  }
  return output;
}

for (const algorithm of [atkinsonAlgorithm, floydSteinbergAlgorithm, orderedAlgorithm, knollAlgorithm, nearestAlgorithm]) {
  describe(algorithm.name, () => {
    it('is deterministic, uses only palette colors and does not mutate input', () => {
      const image = createImageData(
        Array.from({ length: 17 }, (_, y) =>
          Array.from(
            { length: 19 },
            (_, x): ColorRGB => [
              (x * 41 + y * 79) % 256,
              (x * 97 + y * 7) % 256,
              (x * 17 + y * 31) % 256,
            ]
          )
        )
      );
      const before = image.data.slice();
      const first = algorithm.apply(image, PALETTES.GAMEBOY, 1);
      expect(algorithm.apply(image, PALETTES.GAMEBOY, 1).data).toEqual(first.data);
      expect(image.data).toEqual(before);
      for (let i = 0; i < first.data.length; i += 4)
        expect(PALETTES.GAMEBOY).toContainEqual(Array.from(first.data.slice(i, i + 3)));
      if (algorithm === atkinsonAlgorithm || algorithm === floydSteinbergAlgorithm)
        expect(Array.from(first.data)).toEqual(
          reference(image, PALETTES.GAMEBOY, algorithm === atkinsonAlgorithm)
        );
    });

    it('preserves alpha, including partially transparent pixels', () => {
      const image = createSolidImageData([100, 100, 100], 3, 1);
      image.data[3] = 0;
      image.data[7] = 72;
      const result = algorithm.apply(image, PALETTES.BW, 1);
      expect([result.data[3], result.data[7], result.data[11]]).toEqual([0, 72, 255]);
    });

    it('does not let hidden RGB colors affect visible neighbors', () => {
      const a = createSolidImageData([100, 100, 100], 3, 2);
      a.data[3] = 0;
      const b = { ...a, data: a.data.slice() };
      b.data[0] = 255;
      b.data[1] = 0;
      b.data[2] = 200;
      expect(algorithm.apply(a, PALETTES.BW, 1).data.slice(4)).toEqual(
        algorithm.apply(b, PALETTES.BW, 1).data.slice(4)
      );
    });

    it('clips partial blocks at odd edges and samples at block origins', () => {
      const input = createImageData(
        Array.from(
          { length: 3 },
          () =>
            [
              [0, 0, 0],
              [255, 255, 255],
              [255, 255, 255],
              [0, 0, 0],
              [0, 0, 0],
            ] as ColorRGB[]
        )
      );
      const result = algorithm.apply(input, PALETTES.BW, 2);
      for (let y = 0; y < 3; y++)
        expect(
          Array.from(result.data.filter((_, i) => i % 4 === 0).slice(y * 5, y * 5 + 5))
        ).toEqual([0, 0, 255, 255, 0]);
    });

    it.each([NaN, Infinity, 0, -1, 1.5])('rejects invalid step %s', (step) => {
      expect(() =>
        algorithm.apply(createSolidImageData([0, 0, 0], 1, 1), PALETTES.BW, step)
      ).toThrow();
    });
  });
}

describe('known algorithm results', () => {
  it('Floyd–Steinberg uses 7/16 horizontally; Atkinson uses 1/8', () => {
    const image = createSolidImageData([100, 100, 100], 4, 1);
    const red = (data: ImageData) => Array.from(data.data.filter((_, i) => i % 4 === 0));
    expect(red(floydSteinbergAlgorithm.apply(image, PALETTES.BW, 1))).toEqual([0, 255, 0, 0]);
    expect(red(atkinsonAlgorithm.apply(image, PALETTES.BW, 1))).toEqual([0, 0, 0, 255]);
  });

  it('Bayer 50% gray gives a fixed 4×4 checkerboard with exactly 8 white pixels', () => {
    const result = orderedAlgorithm.apply(
      createSolidImageData([128, 128, 128], 4, 4),
      PALETTES.BW,
      1
    );
    expect(Array.from(result.data.filter((_, i) => i % 4 === 0))).toEqual([
      255, 0, 255, 0, 0, 255, 0, 255, 255, 0, 255, 0, 0, 255, 0, 255,
    ]);
  });

  it.each([0, 1, 4, 8, 12, 15, 16])(
    'Bayer coverage follows its threshold ranks (%i/16)',
    (count) => {
      const value = Math.round((count * 255) / 16);
      const result = orderedAlgorithm.apply(
        createSolidImageData([value, value, value], 4, 4),
        PALETTES.BW,
        1
      );
      expect(result.data.filter((v, i) => i % 4 === 0 && v === 255)).toHaveLength(count);
    }
  );

  it('ordered grayscale uses adjacent palette levels and preserves exact colors', () => {
    const palette: ColorRGB[] = [
      [0, 0, 0],
      [100, 100, 100],
      [200, 200, 200],
    ];
    const result = orderedAlgorithm.apply(createSolidImageData([150, 150, 150], 4, 4), palette, 1);
    const red = result.data.filter((_, i) => i % 4 === 0);
    expect(red.filter((v) => v === 100)).toHaveLength(8);
    expect(red.filter((v) => v === 200)).toHaveLength(8);
    expect(
      orderedAlgorithm.apply(createSolidImageData([100, 100, 100], 4, 4), palette, 1).data
    ).toEqual(createSolidImageData([100, 100, 100], 4, 4).data);
  });
});
