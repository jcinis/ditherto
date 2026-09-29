import { adjustTones, validateTones } from './tone.js';
import { createImageDataCrossPlatform } from './imageData.js';
import type { InputImageSource, DitherOptions } from './types.js';
import { loadImageData, resizeImageData } from './imageIO.js';
import { algorithms } from './algorithmRegistry.js';
import { validateAlgorithmOptions } from './algorithmOptions.js';
import { generatePalette } from './palette/extract.js';
import { validateColorCount } from './palette/quantize.js';
import { PALETTES } from './palette/utils.js';
import { formatForEnvironment } from './outputFormat.js';
import { validatePalette, validatePixels, validatePositiveInteger } from './validation.js';

/** Preferred API: returns RGBA pixels, dimensions and alpha in every runtime. Never mutates input. */
export async function ditherToImageData(
  input: InputImageSource,
  options: DitherOptions = {}
): Promise<ImageData> {
  validateOptions(options);
  const name = options.algorithm ?? 'atkinson';
  const algorithm = algorithms.get(name);
  if (!algorithm)
    throw new Error(
      `Invalid algorithm: ${name}. Register custom algorithms before use; blue noise requires registerBlueNoise(algorithms) from ditherto/blue-noise.`
    );
  const image = await loadImageData(input);
  const palette =
    options.palette ??
    (options.paletteImg !== undefined
      ? await generatePalette(
          options.paletteImg,
          options.paletteColors === undefined ? {} : { colors: options.paletteColors }
        )
      : PALETTES.BW);
  validatePalette(palette);
  algorithm.validatePalette?.(palette);
  const resized = await resizeImageData(image, {
    ...(options.resample !== undefined ? { resample: options.resample } : {}),
    ...(options.width !== undefined ? { width: options.width } : {}),
    ...(options.height !== undefined ? { height: options.height } : {}),
  });
  const adjusted = adjustTones(resized, options.exposure, options.contrast);
  // Isolate the source even when a registered third-party algorithm mutates its input.
  const result = algorithm.apply(
    createImageDataCrossPlatform(
      new Uint8ClampedArray(adjusted.data),
      resized.width,
      resized.height
    ),
    palette,
    options.step ?? 1,
    ...(options.algorithmOptions === undefined ? [] : [options.algorithmOptions])
  );
  validatePixels(result);
  return createImageDataCrossPlatform(result.data, result.width, result.height);
}

/** Compatibility API: browser ImageData or Node raw RGB bytes (not an encoded file). */
export async function ditherImage(
  input: InputImageSource,
  options: DitherOptions = {}
): Promise<Uint8Array | ImageData> {
  return formatForEnvironment(await ditherToImageData(input, options));
}

function validateAlgorithmConfig(options: DitherOptions): void {
  if (options.algorithmOptions !== undefined) {
    const algorithm = algorithms.get(options.algorithm ?? 'atkinson');
    if (!algorithm) throw new Error(`Invalid algorithm: ${options.algorithm}`);
    validateAlgorithmOptions(algorithm, options.algorithmOptions);
  }
}

export function validateOptions(options: DitherOptions): void {
  validateAlgorithmConfig(options);
  validateTones(options);
  if (options.paletteColors !== undefined) {
    validateColorCount(options.paletteColors);
    if (options.paletteImg === undefined && options.palette === undefined)
      throw new Error('paletteColors requires paletteImg');
  }
  if (
    options.resample !== undefined &&
    options.resample !== 'nearest' &&
    options.resample !== 'area'
  ) {
    throw new Error('Resample must be nearest or area');
  }
  if (options.step !== undefined) validatePositiveInteger(options.step, 'Step');
  if (options.width !== undefined) validatePositiveInteger(options.width, 'Width');
  if (options.height !== undefined) validatePositiveInteger(options.height, 'Height');
  if (
    options.quality !== undefined &&
    (!Number.isFinite(options.quality) || options.quality < 0 || options.quality > 1)
  ) {
    throw new Error('Quality must be between 0 and 1');
  }
  if (options.palette !== undefined) {
    validatePalette(options.palette);
    algorithms.get(options.algorithm ?? 'atkinson')?.validatePalette?.(options.palette);
  }
}
