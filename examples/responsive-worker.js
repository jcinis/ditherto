import { ditherToImageData, algorithms } from '../dist/browser.js';
self.onmessage = async ({ data: { id, source, options } }) => {
  try {
    if (options.algorithm?.endsWith('-blue-noise') && !algorithms.get(options.algorithm)) {
      const { registerBlueNoise } = await import('../dist/blue-noise.js');
      registerBlueNoise(algorithms);
    }
    const result = await ditherToImageData(source, options);
    self.postMessage({ id, result }, [result.data.buffer]);
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
