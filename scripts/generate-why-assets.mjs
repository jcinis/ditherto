// Offline exports for a fair comparison with responsive client-side dithering.
import { mkdir, writeFile } from 'node:fs/promises';
import { ditherToImageData } from '../dist/index.js';
import { encodePng } from '../dist/node.js';
import { themes, paletteFor } from '../site/themes.js';
const sources = {
  magician: 'site/tarot/01-the-magician.webp',
  coffee: 'tests/fixtures/photos/coffee.png',
  astronaut: 'tests/fixtures/photos/astronaut.png',
};
await mkdir('site/assets/why', { recursive: true });
for (const [name, source] of Object.entries(sources)) {
  for (const theme of Object.keys(themes)) {
    const pixels = await ditherToImageData(source, {
      algorithm: 'atkinson', palette: paletteFor(theme), width: 320, resample: 'area', exposure: 0.3,
    });
    await writeFile(`site/assets/why/${name}-${theme}.png`, encodePng(pixels));
  }
}
console.log('Generated 18 fixed 320px PNG exports for the Why page.');
