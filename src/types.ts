/**
 * Core TypeScript type definitions for ditherto
 */

/** RGB color tuple [red, green, blue] where each value is 0-255 */
export type ColorRGB = readonly [number, number, number];

/** Area averages when shrinking; enlargement uses nearest-neighbor. */
export type ResampleMethod = 'nearest' | 'area';

/** Input image sources supported by the library */
export type InputImageSource =
  | string // file path or URL
  | ArrayBuffer
  | Uint8Array
  | Blob
  | File
  | HTMLImageElement
  | ImageData;

/** Palette generation: exact swatches by default, representative colors when requested. */
export interface GeneratePaletteOptions {
  /** Photo color budget, 1–256; may return fewer for simple images or merged histogram bins. */
  colors?: number;
  /** Exact extraction guard, 1–4096. Cannot be combined with colors. */
  maxColors?: number;
}

/** Validated by the selected algorithm; custom algorithms may define their own keys. */
export type AlgorithmOptions = Readonly<Record<string, unknown>>;

/** Bayer matrix settings for Ordered and Knoll. */
export interface OrderedOptions extends AlgorithmOptions {
  /** Logical pixel matrix size; default 4. */
  bayerSize?: 2 | 4 | 8 | 16;
}
export interface DiffusionOptions extends AlgorithmOptions {
  /** Alternate scan direction on odd logical rows; default false. */
  serpentine?: boolean;
}
export interface HalftoneOptions extends AlgorithmOptions {
  /** Cluster cell size in logical pixels, 2–16; default 8. */
  cellSize?: number;
}
export interface RiemersmaOptions extends AlgorithmOptions {
  /** Recent errors to retain, 2–64; default 16. */
  history?: number;
}
/** Knoll's optional controls. Defaults: 20% strength, 32 candidate selections. */
export interface KnollOptions extends OrderedOptions {
  strength?: number;
  candidates?: number;
}

/** Configuration options for dithering operations */
export interface DitherOptions {
  /** Dither algorithm name */
  algorithm?:
    | 'atkinson'
    | 'floyd-steinberg'
    | 'ordered'
    | 'knoll'
    | 'nearest'
    | 'sierra-lite'
    | 'stucki'
    | 'halftone'
    | 'riemersma'
    | 'ordered-blue-noise'
    | 'knoll-blue-noise'
    | (string & {});
  /** Options for the selected algorithm. Unsupported keys and values are rejected. */
  algorithmOptions?: AlgorithmOptions;
  /** Explicit palette overrides everything else */
  palette?: readonly ColorRGB[];
  /** Swatch or reference photo for palette extraction */
  paletteImg?: InputImageSource;
  /** Quantize paletteImg to at most this many colors (1–256); omitted means exact extraction. */
  paletteColors?: number;
  /** Target max width; maintains aspect ratio */
  width?: number;
  /** Target max height; maintains aspect ratio */
  height?: number;
  /** Resizing filter; nearest preserves pixel art, area reduces photographic aliasing. */
  resample?: ResampleMethod;
  /** Pixel block size (>=1); >1 creates chunky pixels */
  step?: number;
  /** Exposure in stops (−4 to +4), applied in linear sRGB; default 0. */
  exposure?: number;
  /** Contrast slope around encoded sRGB 0.5 (0–2); default 1. */
  contrast?: number;
  /** Deprecated: validated for compatibility; pixel processing does not encode images */
  quality?: number;
}

/** Dithering algorithm interface for pluggable algorithms */
export interface DitherAlgorithm {
  readonly name: string;
  /** Opt into configuration and reject unsupported keys/values before image loading. */
  validateOptions?(options: AlgorithmOptions): void;
  /** Optional palette contract, checked before processing (and before decoding explicit palettes). */
  validatePalette?(palette: readonly ColorRGB[]): void;
  apply(
    data: ImageData,
    palette: readonly ColorRGB[],
    step: number,
    options?: AlgorithmOptions
  ): ImageData;
}
