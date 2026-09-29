import type { AlgorithmOptions, DitherAlgorithm } from './types.js';

export function assertAlgorithmOptions(options: unknown): asserts options is AlgorithmOptions {
  if (
    options === null ||
    typeof options !== 'object' ||
    Array.isArray(options) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(options))
  )
    throw new Error('algorithmOptions must be a plain object');
}

export function validateAlgorithmOptions(
  algorithm: DitherAlgorithm,
  options?: AlgorithmOptions
): void {
  if (options === undefined) return;
  assertAlgorithmOptions(options);
  if (algorithm.validateOptions) algorithm.validateOptions(options);
  else if (Object.keys(options).length)
    throw new Error(`Algorithm ${algorithm.name} does not support algorithmOptions`);
}

/** Reject typos rather than silently accepting settings for another algorithm. */
export function optionKeys(options: AlgorithmOptions, allowed: readonly string[]): void {
  assertAlgorithmOptions(options);
  for (const key of Object.keys(options))
    if (!allowed.includes(key)) throw new Error(`Unsupported algorithm option: ${key}`);
}
export function integerOption(
  options: AlgorithmOptions,
  key: string,
  fallback: number,
  min: number,
  max: number
): number {
  const value = options[key] === undefined ? fallback : options[key];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max)
    throw new Error(`${key} must be an integer between ${min} and ${max}`);
  return value;
}
export function diffusionOptions(options: AlgorithmOptions = {}): boolean {
  optionKeys(options, ['serpentine']);
  const value = options.serpentine === undefined ? false : options.serpentine;
  if (typeof value !== 'boolean') throw new Error('serpentine must be a boolean');
  return value;
}
