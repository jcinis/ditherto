/**
 * Registry for dithering algorithms
 *
 * Provides pluggable algorithm system with built-in algorithms
 */

import type { DitherAlgorithm } from './types.js';

class AlgorithmRegistry {
  private algorithms = new Map<string, DitherAlgorithm>();

  /**
   * Register a new dithering algorithm
   */
  register(algorithm: DitherAlgorithm): void {
    this.algorithms.set(algorithm.name, algorithm);
  }

  /**
   * Get algorithm by name
   */
  get(name: string): DitherAlgorithm | undefined {
    return this.algorithms.get(name);
  }

  /**
   * List all registered algorithm names
   */
  list(): string[] {
    return Array.from(this.algorithms.keys());
  }

  /**
   * Clear all registered algorithms (primarily for testing)
   */
  clear(): void {
    this.algorithms.clear();
  }
}

/** Global algorithm registry instance */
export const algorithms = new AlgorithmRegistry();

// Register built-in algorithms
import { atkinsonAlgorithm } from './algorithms/atkinson.js';
import { floydSteinbergAlgorithm } from './algorithms/floydSteinberg.js';
import { orderedAlgorithm } from './algorithms/ordered.js';
import { knollAlgorithm } from './algorithms/knoll.js';
import { nearestAlgorithm } from './algorithms/nearest.js';

algorithms.register(atkinsonAlgorithm);
algorithms.register(floydSteinbergAlgorithm);
algorithms.register(orderedAlgorithm);
algorithms.register(knollAlgorithm);
algorithms.register(nearestAlgorithm);

import { sierraLiteAlgorithm } from './algorithms/sierraLite.js';
import { stuckiAlgorithm } from './algorithms/stucki.js';
import { halftoneAlgorithm } from './algorithms/halftone.js';
import { riemersmaAlgorithm } from './algorithms/riemersma.js';
algorithms.register(sierraLiteAlgorithm);
algorithms.register(stuckiAlgorithm);
algorithms.register(halftoneAlgorithm);
algorithms.register(riemersmaAlgorithm);
