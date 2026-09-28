// Social platforms require a static sharing image; site images still render live.
import { createCanvas, ImageData } from '@napi-rs/canvas';
import { mkdir, writeFile } from 'node:fs/promises';
import { ditherToImageData } from '../dist/index.js';
import { paletteFor, themes } from '../site/themes.js';

const canvas = createCanvas(1200, 630);
const ctx = canvas.getContext('2d');
const { colors, paper, ink } = themes.blue;
ctx.fillStyle = paper;
ctx.fillRect(0, 0, 1200, 630);
ctx.strokeStyle = ink;
ctx.strokeRect(24.5, 24.5, 1151, 581);
ctx.fillStyle = ink;
ctx.font = '16px monospace';
ctx.fillText('AN IMAGE LIBRARY WITH A POINT OF VIEW', 60, 99);
ctx.fillStyle = ink;
ctx.font = 'bold 66px monospace';
ctx.fillText('dither·to', 56, 226);
ctx.font = '36px monospace';
ctx.fillText('Less color.', 60, 303);
ctx.fillText('More vibes.', 60, 350);
ctx.fillStyle = ink;
ctx.font = '17px monospace';
ctx.fillText('BROWSER / NODE / CLI', 60, 438);
for (let i = 0; i < colors.length; i++) {
  ctx.fillStyle = colors[i];
  ctx.fillRect(60 + i * 40, 474, 30, 30);
  ctx.strokeStyle = ink;
  ctx.strokeRect(60.5 + i * 40, 474.5, 29, 29);
}
ctx.fillStyle = ink;
ctx.font = '15px monospace';
ctx.fillText('npm install ditherto', 60, 567);
for (const [i, file] of ['01-the-magician.png', '03-the-empress.png'].entries()) {
  const pixels = await ditherToImageData(`site/tarot/${file}`, {
    width: 252, palette: paletteFor('blue'), exposure: 0.3, resample: 'area',
  });
  // Copy at 1:1 so the dither itself never gets rescaled or interpolated.
  ctx.putImageData(new ImageData(pixels.data, pixels.width, pixels.height), 600 + i * 280, 90);
}
await mkdir('site/assets', { recursive: true });
await writeFile('site/assets/arcana-share.png', canvas.toBuffer('image/png'));
console.log('Generated 1200 × 630 tarot sharing card.');
