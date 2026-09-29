import { ditherToImageData, generatePalette, algorithms } from '../dist/browser.js';
let source;
let reference;
// Cache only the most recent palette for each source; resizing/tone changes reuse it.
const cache = new Map();
let jobs=Promise.resolve();
self.onmessage = ({ data: message }) => { jobs=jobs.then(()=>processMessage(message)); };
async function processMessage(message) {
  if (message.type === 'source') {
    source = message.image;
    cache.delete('PHOTO');
    return;
  }
  if (message.type === 'palette-source') {
    reference = message.image;
    cache.delete('REFERENCE');
    return;
  }
  const { id, options, paletteMode, paletteColors } = message;
  try {
    if (options.algorithm?.endsWith('-blue-noise') && !algorithms.get(options.algorithm)) {
      const { registerBlueNoise } = await import('../dist/blue-noise.js');
      registerBlueNoise(algorithms);
    }
    if (!source) throw new Error('Choose an image first');
    const image = source;
    const start = performance.now();
    let palette = options.palette;
    if (paletteMode === 'PHOTO' || paletteMode === 'REFERENCE') {
      const paletteImage = paletteMode === 'PHOTO' ? source : reference;
      if (!paletteImage) throw new Error('Choose a reference photo for the palette.');
      let entry = cache.get(paletteMode);
      if (!entry || entry.colors !== paletteColors || entry.image !== paletteImage) {
        entry = { colors: paletteColors, image: paletteImage, palette: await generatePalette(paletteImage, { colors: paletteColors }) };
        cache.set(paletteMode, entry);
      }
      palette = entry.palette;
    }
    const result = await ditherToImageData(image, { ...options, palette });
    self.postMessage({ id, result, palette, elapsed: performance.now() - start }, [result.data.buffer]);
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
}
