/**
 * CLI wrapper for ditherto
 *
 * Provides command-line interface for batch processing images
 */

import { parseArgs } from 'node:util';
import { writeFile, access, mkdir } from 'node:fs/promises';
import { dirname, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { encodePng } from './node.js';
import { ditherToImageData, validateOptions } from './imageProcessor.js';
import type { DitherOptions, ColorRGB } from './types.js';
import { algorithms } from './algorithmRegistry.js';
import { registerBlueNoise } from './blue-noise.js';
import { PALETTES } from './palette/utils.js';

export interface CliArgs {
  input: string;
  output: string | undefined;
  algorithm: DitherOptions['algorithm'];
  bayerSize?: number;
  serpentine?: boolean;
  cellSize?: number;
  history?: number;
  strength?: number;
  candidates?: number;
  resample?: DitherOptions['resample'];
  paletteImg: string | undefined;
  palette?: string;
  json?: boolean;
  paletteColors?: number;
  exposure?: number;
  contrast?: number;
  width: number | undefined;
  height: number | undefined;
  step: number | undefined;
  quality: number | undefined;
  help: boolean | undefined;
  version: boolean | undefined;
}

function parseNumber(value: string | undefined, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (value.trim() === '' || !Number.isFinite(Number(value)))
    throw new Error(`${label} must be a number`);
  return Number(value);
}

function parseAlgorithmFlags(result: CliArgs, values: Readonly<Record<string, unknown>>): void {
  if (typeof values.serpentine === 'boolean') result.serpentine = values.serpentine;
  const flags = {
    strength: 'strength',
    candidates: 'candidates',
    bayerSize: 'bayer-size',
    cellSize: 'cell-size',
    history: 'history',
  } as const;
  for (const key of Object.keys(flags) as (keyof typeof flags)[]) {
    const value = values[flags[key]];
    if (typeof value === 'string') result[key] = parseNumber(value, flags[key])!;
  }
}

export function parseCliArgs(args: string[]): CliArgs {
  const { values, positionals } = parseArgs({
    args,
    options: {
      output: { type: 'string', short: 'o' },
      algorithm: { type: 'string' },
      strength: { type: 'string' },
      candidates: { type: 'string' },
      'bayer-size': { type: 'string' },
      serpentine: { type: 'boolean' },
      'cell-size': { type: 'string' },
      history: { type: 'string' },
      paletteimg: { type: 'string' },
      palette: { type: 'string' },
      json: { type: 'boolean' },
      'palette-colors': { type: 'string' },
      resample: { type: 'string' },
      exposure: { type: 'string' },
      contrast: { type: 'string' },
      width: { type: 'string' },
      height: { type: 'string' },
      step: { type: 'string' },
      quality: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
    allowPositionals: true,
  });

  if (!positionals[0] && !values.help && !values.version) {
    throw new Error('Input file is required');
  }

  if (positionals.length > 1)
    throw new Error('Expected one input file; use a shell loop for batch processing');

  const result: CliArgs = {
    input: positionals[0] ?? '',
    output: values.output,
    algorithm: values.algorithm as CliArgs['algorithm'],
    paletteImg: values.paletteimg,
    width: parseNumber(values.width, 'Width'),
    height: parseNumber(values.height, 'Height'),
    step: parseNumber(values.step, 'Step'),
    quality: parseNumber(values.quality, 'Quality'),
    help: values.help,
    version: values.version,
  };

  parseAlgorithmFlags(result, values);
  if (values.exposure !== undefined) result.exposure = parseNumber(values.exposure, 'Exposure')!;
  if (values.palette !== undefined) result.palette = values.palette;
  if (values.json !== undefined) result.json = values.json;
  if (values.contrast !== undefined) result.contrast = parseNumber(values.contrast, 'Contrast')!;
  if (values['palette-colors'] !== undefined)
    result.paletteColors = parseNumber(values['palette-colors'], 'Palette color count')!;
  if (values.resample !== undefined) {
    if (values.resample !== 'nearest' && values.resample !== 'area')
      throw new Error('Resample must be nearest or area');
    result.resample = values.resample;
  }
  return result;
}

export function validateCliArgs(args: CliArgs): void {
  if (!args.input && !args.help && !args.version) {
    throw new Error('Input file is required');
  }

  if (args.algorithm === 'ordered-blue-noise' || args.algorithm === 'knoll-blue-noise')
    registerBlueNoise(algorithms);
  if (args.algorithm && !algorithms.get(args.algorithm))
    throw new Error(`Invalid algorithm: ${args.algorithm}`);

  if (
    args.palette !== undefined &&
    (args.paletteImg !== undefined || args.paletteColors !== undefined)
  )
    throw new Error('Use either --palette or --paletteimg/--palette-colors');
  validateOptions(buildDitherOptions(args));
}

export function showHelp(): void {
  console.log(`
ditherto - Pixelate your life by dithering images

Usage:
  ditherto input.png -o output.png [options]

Options:
  -o, --output <file>     Output file path
  --algorithm <name>      Dither algorithm (atkinson|floyd-steinberg|sierra-lite|stucki|ordered|knoll|nearest|halftone|riemersma|ordered-blue-noise|knoll-blue-noise)
  --bayer-size <n>        Ordered/Knoll Bayer size: 2, 4, 8, 16; default 4
  --serpentine            Alternate rows for diffusion algorithms
  --cell-size <n>         Halftone cell: 2–16; default 8; uses palette extremes
  --history <n>           Riemersma error history: 2–64; default 16
  --strength <factor>     Knoll only: 0–1, default 0.2 (20%)
  --candidates <n>        Knoll only: integer 1–256, default 32
  --paletteimg <file>     Swatch or photo for palette extraction
  --palette <name|hexes>  Built-in name or comma-separated #rrggbb colors
                         Names: ${Object.keys(PALETTES).join(', ')}
  --palette-colors <n>    Choose up to 1–256 colors from paletteimg
  --json                 Print one JSON result to stdout (errors use stderr)
  --width <number>        Target max width
  --height <number>       Target max height  
  --resample <method>     Resize filter (nearest|area), default nearest
  --exposure <stops>      Exposure in stops (-4 to 4), default 0
  --contrast <factor>     Contrast slope (0 to 2), default 1
  --step <number>         Pixel block size (>=1)
  --quality <number>      Reserved quality hint (PNG is lossless)
  -h, --help              Show this help
  -v, --version           Show version
`);
}

export function showVersion(): void {
  console.log('0.2.0');
}

/**
 * Validate input file exists
 */
async function validateInputFile(inputPath: string): Promise<void> {
  try {
    await access(inputPath);
  } catch {
    throw new Error(`Input file not found: ${inputPath}`);
  }
}

/**
 * Ensure output directory exists
 */
async function ensureOutputDirectory(outputPath: string): Promise<void> {
  const outputDir = dirname(outputPath);
  await mkdir(outputDir, { recursive: true });
}

function parseCliPalette(value: string): readonly ColorRGB[] {
  const name = value.toUpperCase();
  if (Object.hasOwn(PALETTES, name)) return PALETTES[name as keyof typeof PALETTES];
  const colors = value.split(',').map((color) => color.trim());
  if (colors.length > 256 || colors.some((color) => !/^#[0-9a-f]{6}$/i.test(color)))
    throw new Error('Palette must be a built-in name or 1–256 comma-separated #rrggbb colors');
  return colors.map(
    (color) =>
      [
        Number.parseInt(color.slice(1, 3), 16),
        Number.parseInt(color.slice(3, 5), 16),
        Number.parseInt(color.slice(5, 7), 16),
      ] as const
  );
}

function addAlgorithmOptions(args: CliArgs, options: DitherOptions): void {
  const config: Record<string, unknown> = {};
  for (const key of [
    'strength',
    'candidates',
    'bayerSize',
    'serpentine',
    'cellSize',
    'history',
  ] as const)
    if (args[key] !== undefined) config[key] = args[key];
  if (Object.keys(config).length) options.algorithmOptions = config;
}

/**
 * Convert CLI args to DitherOptions
 */
function buildDitherOptions(args: CliArgs): DitherOptions {
  const options: DitherOptions = {};

  if (args.algorithm) options.algorithm = args.algorithm;
  addAlgorithmOptions(args, options);
  if (args.palette !== undefined) options.palette = parseCliPalette(args.palette);
  if (args.resample !== undefined) options.resample = args.resample;
  if (args.paletteImg) options.paletteImg = args.paletteImg;
  if (args.paletteColors !== undefined) options.paletteColors = args.paletteColors;
  if (args.exposure !== undefined) options.exposure = args.exposure;
  if (args.contrast !== undefined) options.contrast = args.contrast;
  if (args.width !== undefined) options.width = args.width;
  if (args.height !== undefined) options.height = args.height;
  if (args.step !== undefined) options.step = args.step;
  if (args.quality !== undefined) options.quality = args.quality;

  return options;
}

/** Load once, retain dimensions/alpha, and only write extensions we actually encode. */
export async function processFiles(args: CliArgs): Promise<void> {
  validateCliArgs(args);
  const extension = extname(args.input);
  const output =
    args.output ??
    `${extension ? args.input.slice(0, -extension.length) : args.input}.dithered.png`;
  if (extname(output).toLowerCase() !== '.png')
    throw new Error('Output must use .png; other encoders are not yet supported');
  await validateInputFile(args.input);
  await ensureOutputDirectory(output);
  try {
    const result = await ditherToImageData(args.input, buildDitherOptions(args));
    await writeFile(output, encodePng(result));
    console.log(
      args.json
        ? JSON.stringify({ input: args.input, output, width: result.width, height: result.height })
        : `Processed: ${args.input} -> ${output}`
    );
  } catch (error) {
    throw new Error(
      `Failed to process ${args.input}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function main(): Promise<void> {
  try {
    const args = parseCliArgs(process.argv.slice(2));

    if (args.help) {
      showHelp();
      return;
    }

    if (args.version) {
      showVersion();
      return;
    }

    validateCliArgs(args);
    await processFiles(args);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  void main();
}
