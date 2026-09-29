import type { DitherOptions, ColorRGB } from './types.js';
import { ditherToImageData } from './imageProcessor.js';

export { ditherImage, ditherToImageData } from './imageProcessor.js';
export { PALETTES } from './palette/utils.js';
export { generatePalette } from './palette/extract.js';
export { loadImageData, resizeImageData } from './imageIO.js';
export { algorithms } from './algorithmRegistry.js';
export type {
  AlgorithmOptions,
  KnollOptions,
  OrderedOptions,
  DiffusionOptions,
  HalftoneOptions,
  RiemersmaOptions,
  GeneratePaletteOptions,
  ResampleMethod,
  DitherOptions,
  ColorRGB,
  InputImageSource,
  DitherAlgorithm,
} from './types.js';

function parsePalette(value: string | undefined): ColorRGB[] | undefined {
  if (!value) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as ColorRGB[]) : undefined;
  } catch {
    return undefined;
  }
}

function parseTones(dataset: DOMStringMap, options: DitherOptions): void {
  for (const key of ['exposure', 'contrast'] as const) {
    if (dataset[key]?.trim()) options[key] = Number(dataset[key]);
  }
}

function parseAlgorithmConfig(dataset: DOMStringMap, options: DitherOptions): void {
  if (dataset.algorithmOptions !== undefined) {
    try {
      options.algorithmOptions = JSON.parse(dataset.algorithmOptions);
    } catch {
      throw new Error('data-algorithm-options must contain valid JSON');
    }
  }
}

export function parseDataAttributes(img: HTMLImageElement): DitherOptions {
  const options: DitherOptions = {};
  const { dataset } = img;
  parseTones(dataset, options);
  parseAlgorithmConfig(dataset, options);
  switch (dataset.resample) {
    case 'nearest':
    case 'area':
      options.resample = dataset.resample;
  }
  const algorithm = dataset.algorithm ?? dataset.alg;
  if (algorithm) options.algorithm = algorithm;
  for (const key of ['width', 'height', 'step', 'paletteColors'] as const) {
    const value = Number(dataset[key]);
    if (Number.isSafeInteger(value) && value > 0) options[key] = value;
  }
  if (dataset.quality !== undefined && dataset.quality.trim() !== '') {
    const value = Number(dataset.quality);
    if (Number.isFinite(value) && value >= 0 && value <= 1) options.quality = value;
  }
  const palette = parsePalette(dataset.palette);
  if (palette) options.palette = palette;
  if (dataset.paletteImg) options.paletteImg = dataset.paletteImg;
  return options;
}

/** Waits for decoding, preserves accessibility attributes and reports failures to the caller. */
export async function ditherImageElement(
  img: HTMLImageElement,
  customOptions?: DitherOptions
): Promise<HTMLCanvasElement> {
  const result = await ditherToImageData(img, { ...parseDataAttributes(img), ...customOptions });
  const canvas = document.createElement('canvas');
  canvas.width = result.width;
  canvas.height = result.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Failed to get 2d context from canvas');
  context.putImageData(result, 0, 0);
  canvas.className = img.className;
  canvas.id = img.id;
  canvas.title = img.title;
  canvas.style.cssText = img.style.cssText;
  canvas.style.imageRendering = 'pixelated';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', img.alt || 'Dithered image');
  img.parentNode?.replaceChild(canvas, img);
  return canvas;
}

/** Awaitable so callers can react to completion or errors. */
export async function autoDitherDOM(
  selector = 'img[data-algorithm]',
  options?: DitherOptions
): Promise<HTMLCanvasElement[]> {
  const images = document.querySelectorAll<HTMLImageElement>(selector);
  return Promise.all(Array.from(images, (img) => ditherImageElement(img, options)));
}
