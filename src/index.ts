/**
 * ditherto - Pixelate your life by dithering your images to fixed colour palette
 * 
 * Main library entry point providing the core API
 */

// Core types
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
  InputImageSource, 
  ColorRGB,
  DitherAlgorithm 
} from './types.js';

// Core functions  
export { ditherImage, ditherToImageData } from './imageProcessor.js';
export { generatePalette } from './palette/extract.js';

// Palettes
export { PALETTES } from './palette/utils.js';

// Image I/O utilities
export { 
  loadImageData, 
  calculateResizeDimensions, 
  resizeImageData, 
  validateImageDimensions 
} from './imageIO.js';
export type { ResizeOptions } from './imageIO.js';

// Algorithm registry
export { algorithms } from './algorithmRegistry.js';

// Import algorithms to ensure they get registered
import './algorithms/atkinson.js';
import './algorithms/floydSteinberg.js';
import './algorithms/ordered.js';

// Version info
export const version = '0.2.0';
