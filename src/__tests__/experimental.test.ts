import { describe, expect, it, vi } from 'vitest';
import {
  bayerRanks,
  blueNoiseThreshold,
  makeLabAlgorithms,
  hilbertPoint,
} from '../experimental/lab.js';
import { createImageDataCrossPlatform } from '../imageData.js';
import { orderedAlgorithm } from '../algorithms/ordered.js';
import { knollAlgorithm } from '../algorithms/knoll.js';
import type { ColorRGB } from '../types.js';
const palette: readonly ColorRGB[] = [
  [0, 0, 0],
  [255, 255, 255],
];
const source = (w: number, h: number, gray = 112) =>
  createImageDataCrossPlatform(
    Uint8ClampedArray.from({ length: w * h * 4 }, (_, i) => (i % 4 === 3 ? 255 : gray)),
    w,
    h
  );
describe('local algorithm prototypes', () => {
  it('builds complete Bayer ranks and retains the existing 4×4 pattern', () => {
    for (const size of [2, 4, 8, 16])
      expect([...bayerRanks(size)].sort((a, b) => a - b)).toEqual(
        Array.from({ length: size * size }, (_, i) => i)
      );
    expect([...bayerRanks(4)]).toEqual([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]);
  });
  it('blue noise has all ranks once, wraps seamlessly and is deterministic', () => {
    const values = Array.from({ length: 4096 }, (_, i) =>
      blueNoiseThreshold(i % 64, Math.floor(i / 64))
    );
    expect(new Set(values).size).toBe(4096);
    expect(Math.min(...values)).toBe(0.5 / 4096);
    expect(Math.max(...values)).toBe(4095.5 / 4096);
    expect(blueNoiseThreshold(7, 13)).toBe(blueNoiseThreshold(71, 77));
  });
  it('Hilbert traversal covers square grids exactly once with adjacent steps', () => {
    for (const size of [1, 2, 4, 8, 16]) {
      const points = Array.from({ length: size * size }, (_, i) => hilbertPoint(size, i));
      expect(new Set(points.map((p) => p.join(','))).size).toBe(size * size);
      for (let i = 1; i < points.length; i++)
        expect(
          Math.abs(points[i]![0] - points[i - 1]![0]) + Math.abs(points[i]![1] - points[i - 1]![1])
        ).toBe(1);
    }
  });
  it('keeps default Bayer versions byte-identical to shipped algorithms', () => {
    const data = source(23, 19);
    const algorithms = makeLabAlgorithms();
    expect(algorithms['ordered-bayer']!.apply(data, palette, 1).data).toEqual(
      orderedAlgorithm.apply(data, palette, 1).data
    );
    expect(algorithms['knoll-bayer']!.apply(data, palette, 1).data).toEqual(
      knollAlgorithm.apply(data, palette, 1).data
    );
  });
  it('all prototypes preserve input and alpha, quantize odd-size blocks and retain solid endpoints', () => {
    for (const algorithm of Object.values(makeLabAlgorithms({ serpentine: true }))) {
      for (const gray of [0, 255])
        expect(algorithm.apply(source(7, 11, gray), palette, 2).data).toEqual(
          source(7, 11, gray).data
        );
      const data = source(7, 11);
      data.data[3] = 0;
      data.data[19] = 93;
      const before = data.data.slice();
      const result = algorithm.apply(data, palette, 2);
      expect(data.data).toEqual(before);
      for (let i = 0; i < before.length; i += 4) {
        expect(result.data[i + 3]).toBe(before[i + 3]);
        expect([0, 255]).toContain(result.data[i]);
      }
    }
  });
  it('halftone makes a clustered half-coverage cell and warns for multi-color palettes', () => {
    const algorithm = makeLabAlgorithms({ cellSize: 8 }).halftone!;
    const output = algorithm.apply(source(8, 8, 128), palette, 1);
    expect([...output.data].filter((v, i) => i % 4 === 0 && v === 0).length).toBe(32);
    expect(output.data[(3 * 8 + 3) * 4]).toBe(0);
    expect(output.data[0]).toBe(255);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(algorithm.apply(source(4, 4), [...palette, [128, 0, 0]], 1).data).toEqual(
        algorithm.apply(source(4, 4), palette, 1).data
      );
      expect(warn).toHaveBeenCalledOnce();
    } finally {
      warn.mockRestore();
    }
  });
});

it('blue-noise masks suppress low spatial frequencies at several densities', () => {
  for (const density of [0.1, 0.25, 0.5, 0.75, 0.9]) {
    const power = (kx: number, ky: number) => {
      let re = 0,
        im = 0;
      for (let y = 0; y < 64; y++)
        for (let x = 0; x < 64; x++) {
          const v = (blueNoiseThreshold(x, y) < density ? 1 : 0) - density;
          const angle = (2 * Math.PI * (kx * x + ky * y)) / 64;
          re += v * Math.cos(angle);
          im += v * Math.sin(angle);
        }
      return re * re + im * im;
    };
    let low = 0,
      high = 0;
    for (let kx = 1; kx <= 4; kx++)
      for (let ky = 1; ky <= 4; ky++) {
        low += power(kx, ky);
        high += power(kx + 20, ky + 16);
      }
    expect(low / high).toBeLessThan(0.1);
  }
});

it('serpentine diffusion matches an independent full-image error buffer', () => {
  const taps: [number, number, number][] = [
    [1, 0, 7 / 16],
    [-1, 1, 3 / 16],
    [0, 1, 5 / 16],
    [1, 1, 1 / 16],
  ];
  const data = source(13, 9);
  for (let i = 0; i < data.data.length; i += 4) data.data.fill((i * 19 + 83) % 256, i, i + 3);
  const errors = new Float64Array(13 * 9),
    expected: number[] = [];
  for (let y = 0; y < 9; y++)
    for (let n = 0; n < 13; n++) {
      const x = y % 2 ? 12 - n : n,
        index = y * 13 + x;
      const value = data.data[index * 4]! + errors[index]!;
      expected[index] = value > 127.5 ? 255 : 0;
      taps.forEach(([dx, dy, weight]) => {
        const tx = x + dx * (y % 2 ? -1 : 1),
          ty = y + dy;
        if (tx >= 0 && tx < 13 && ty < 9)
          errors[ty * 13 + tx]! += (value - expected[index]!) * weight;
      });
    }
  const result = makeLabAlgorithms({ serpentine: true })['floyd-steinberg']!.apply(
    data,
    palette,
    1
  );
  expect([...result.data].filter((_, i) => i % 4 === 0)).toEqual(expected);
  expect(result.data).not.toEqual(
    makeLabAlgorithms()['floyd-steinberg']!.apply(data, palette, 1).data
  );
});

it('Riemersma uses original quantization errors with exponential history weights', () => {
  // Known 4×4 Hilbert traversal; independently shift the oldest errors out.
  const path = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
    [0, 2],
    [0, 3],
    [1, 3],
    [1, 2],
    [2, 2],
    [2, 3],
    [3, 3],
    [3, 2],
    [3, 1],
    [2, 1],
    [2, 0],
    [3, 0],
  ];
  const data = source(4, 4, 100),
    queue = [0, 0, 0, 0],
    expected = new Array<number>(16);
  for (const [x, y] of path) {
    const adjusted = 100 + queue.reduce((sum, e, i) => sum + e * 16 ** ((i - 3) / 3), 0);
    const color = adjusted > 127.5 ? 255 : 0;
    expected[y! * 4 + x!] = color;
    queue.shift();
    queue.push(100 - color);
  }
  expect(
    [...makeLabAlgorithms({ history: 4 }).riemersma!.apply(data, palette, 1).data].filter(
      (_, i) => i % 4 === 0
    )
  ).toEqual(expected);
});
