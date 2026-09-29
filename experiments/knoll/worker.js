import { resizeImageData, generatePalette, PALETTES, algorithms } from '../../dist/browser.js';

self.onmessage = async ({ data }) => {
  try {
    const original = await resizeImageData(data.source, { width: data.width, resample: 'area' });
    const palette = data.palette === 'photo16'
      ? await generatePalette(original, { colors: 16 })
      : data.palette === 'dusk'
        ? [[37, 33, 59], [139, 80, 102], [221, 167, 123], [244, 236, 207]]
        : PALETTES[data.palette];
    const algorithmOptions = { strength: data.strength, candidates: data.candidates };
    // Time just apply() for both methods, excluding shared preparation and display.
    let start = performance.now();
    const ordered = algorithms.get('ordered').apply(original, palette, 1);
    const orderedMs = performance.now() - start;
    start = performance.now();
    const knoll = algorithms.get('knoll').apply(original, palette, 1, algorithmOptions);
    const knollMs = performance.now() - start;
    self.postMessage({
      id: data.id, original, ordered, knoll, palette, orderedMs, knollMs,
      strength: data.strength, candidates: data.candidates,
    }, [original.data.buffer, ordered.data.buffer, knoll.data.buffer]);
  } catch (error) { self.postMessage({ id: data.id, error: error.message }); }
};
