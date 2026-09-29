import { resizeImageData, generatePalette, PALETTES } from '../../dist/browser.js';
import { makeLabAlgorithms, luma } from '../../.build/experimental/lab.js';
self.onmessage = async ({ data }) => {
  try {
    const resize = data.source.width >= data.source.height ? { width: data.width } : { height: data.width };
    const original = await resizeImageData(data.source, { ...resize, resample: 'area' });
    const palette = data.palette === 'photo16' ? await generatePalette(original, { colors: 16 })
      : data.palette === 'dusk' ? [[37,33,59],[139,80,102],[221,167,123],[244,236,207]] : PALETTES[data.palette];
    const byLight = [...palette].sort((a,b)=>luma(a)-luma(b));
    const pair = [byLight[0],byLight[byLight.length-1]];
    const results = { original: { pixels: original, ms: 0 } };
    for (const [name, algorithm] of Object.entries(makeLabAlgorithms(data))) {
      const start = performance.now();
      const pixels = algorithm.apply(original, name === 'halftone' ? pair : palette, data.step);
      results[name] = { pixels, ms: performance.now()-start };
    }
    self.postMessage({ id:data.id, results, palette }, Object.values(results).map(result=>result.pixels.data.buffer));
  } catch (error) { self.postMessage({id:data.id,error:error.message}); }
};
