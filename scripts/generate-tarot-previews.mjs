// Preserve the PNG masters; compress only the full-color website source images.
import { createCanvas, ImageData } from '@napi-rs/canvas';
import { stat, writeFile } from 'node:fs/promises';
import { loadImageData, resizeImageData } from '../dist/index.js';
import { cards } from '../site/themes.js';

let originalBytes = 0;
let previewBytes = 0;
for (const card of cards) {
  const original = `site/tarot/${card.id}.png`;
  const source = await loadImageData(original);
  const pixels = await resizeImageData(source, { width: 768, resample: 'area' });
  const canvas = createCanvas(pixels.width, pixels.height);
  canvas.getContext('2d').putImageData(new ImageData(pixels.data, pixels.width, pixels.height), 0, 0);
  const bytes = await canvas.encode('webp', 90);
  await writeFile(`site/tarot/${card.id}.webp`, bytes);
  originalBytes += (await stat(original)).size;
  previewBytes += bytes.length;
  console.log(`${card.id}: ${pixels.width} × ${pixels.height}, ${Math.round(bytes.length / 1024)} KiB`);
}
console.log(`Total: ${originalBytes} → ${previewBytes} bytes (${(100 * (1 - previewBytes / originalBytes)).toFixed(1)}% smaller).`);
