import { describe, expect, it } from 'vitest';
import { algorithms } from '../algorithmRegistry.js';
import { parseCliArgs, validateCliArgs } from '../cli.js';
import { ditherToImageData } from '../imageProcessor.js';
import { PALETTES } from '../palette/utils.js';
import type { DitherOptions } from '../types.js';
import { createSolidImageData } from './testUtils.js';

describe('algorithm-specific options', () => {
  const image = createSolidImageData([108, 127, 91], 7, 5);
  it('ships Knoll at 20% and 32 candidates', async () => {
    expect(algorithms.list()).toEqual(expect.arrayContaining(['knoll', 'nearest']));
    const defaults = await ditherToImageData(image, { algorithm: 'knoll' });
    const explicit = await ditherToImageData(image, {
      algorithm: 'knoll',
      algorithmOptions: { strength: 0.2, candidates: 32 },
    });
    expect(defaults.data).toEqual(explicit.data);
  });
  it.each([1, 2, 3])(
    'nearest equals zero-strength Knoll, including alpha and step %s',
    async (step) => {
      const input = { ...image, data: image.data.slice() };
      input.data[3] = 0;
      input.data[7] = 90;
      const common = { palette: PALETTES.RGB, step, exposure: 0.3, contrast: 1.1 };
      const nearest = await ditherToImageData(input, { ...common, algorithm: 'nearest' });
      const knoll = await ditherToImageData(input, {
        ...common,
        algorithm: 'knoll',
        algorithmOptions: { strength: 0 },
      });
      expect(nearest.data).toEqual(knoll.data);
    }
  );
  it.each([
    { strength: -1 },
    { strength: 2 },
    { strength: NaN },
    { strength: '0.2' },
    { candidates: 0 },
    { candidates: 1.5 },
    { candidates: 257 },
    { strenght: 0.2 },
    null,
    [],
    'bad',
    4,
  ])('rejects malformed Knoll options %j before image loading', async (algorithmOptions) => {
    await expect(
      ditherToImageData('missing.png', {
        algorithm: 'knoll',
        algorithmOptions,
      } as DitherOptions)
    ).rejects.toThrow(/Knoll|algorithmOptions|Unsupported/i);
  });
  it.each(['atkinson', 'ordered', 'floyd-steinberg', 'nearest'])(
    'rejects unsupported options for %s',
    async (algorithm) => {
      await expect(
        ditherToImageData(image, { algorithm, algorithmOptions: { strength: 0.2 } })
      ).rejects.toThrow(/support/i);
    }
  );
  it('passes configuration to opt-in custom algorithms and validates it', async () => {
    algorithms.register({
      name: 'config-test',
      validateOptions(options) {
        if (options.level !== 7) throw new Error('Expected level 7');
      },
      apply(data, _palette, _step, options) {
        expect(options).toEqual({ level: 7 });
        return data;
      },
    });
    expect(
      (await ditherToImageData(image, { algorithm: 'config-test', algorithmOptions: { level: 7 } }))
        .data
    ).toEqual(image.data);
    await expect(
      ditherToImageData(image, { algorithm: 'config-test', algorithmOptions: { level: 4 } })
    ).rejects.toThrow('Expected level 7');
  });
});

describe('Knoll CLI options', () => {
  it('accepts zero strength and candidate count for Knoll', () => {
    const args = parseCliArgs([
      'input.png',
      '--algorithm',
      'knoll',
      '--strength',
      '0',
      '--candidates',
      '64',
    ]);
    expect(args).toMatchObject({ algorithm: 'knoll', strength: 0, candidates: 64 });
    expect(() => validateCliArgs(args)).not.toThrow();
    expect(() =>
      validateCliArgs(parseCliArgs(['input.png', '--algorithm', 'nearest']))
    ).not.toThrow();
  });
  it.each([
    ['--strength', '0.2'],
    ['--algorithm', 'nearest', '--strength', '0'],
    ['--algorithm', 'knoll', '--strength', '2'],
    ['--algorithm', 'knoll', '--candidates', '1.5'],
    ['--algorithm', 'knoll', '--candidates', '257'],
    ['--algorithm', 'knoll', '--strength', 'NaN'],
  ])('rejects invalid or inapplicable flags %j', (...flags) => {
    expect(() => validateCliArgs(parseCliArgs(['input.png', ...flags]))).toThrow();
  });
});
