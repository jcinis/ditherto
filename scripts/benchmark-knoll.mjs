// Run after npm run build. Outputs are disposable and stay under .build/.
import { createCanvas, ImageData } from '@napi-rs/canvas';
import { mkdir, writeFile } from 'node:fs/promises';
import { cpus } from 'node:os';
import { performance } from 'node:perf_hooks';
import { loadImageData, resizeImageData, generatePalette, algorithms } from '../.build/index.js';
import { createKnollAlgorithm } from '../.build/algorithms/knoll.js';

const folder = new URL('../.build/knoll-study/', import.meta.url);
await mkdir(folder, { recursive: true });
const variants = [
  ['Ordered', algorithms.get('ordered')],
  ['Knoll 25% / 32', createKnollAlgorithm({ strength: 0.25, candidates: 32 })],
  ['Knoll 100% / 32', createKnollAlgorithm({ strength: 1, candidates: 32 })],
  ['Knoll 25% / 64', createKnollAlgorithm({ strength: 0.25, candidates: 64 })],
];
const rows = [];
const metadata = {
  node: process.version, platform: `${process.platform}/${process.arch}`, cpu: cpus()[0]?.model,
  method: '320px wide, area resize, step 1; one warmup then median of three apply() runs. Excludes decode, resize, palette extraction and PNG encoding. Encoded sRGB.',
};
for (const photo of ['coffee', 'chelsea', 'astronaut']) {
  const input = await loadImageData(new URL(`../tests/fixtures/photos/${photo}.png`, import.meta.url).pathname);
  const source = await resizeImageData(input, { width: 320, resample: 'area' });
  const palettes = [
    ['dusk4', [[37, 33, 59], [139, 80, 102], [221, 167, 123], [244, 236, 207]]],
    ['photo16', await generatePalette(source, { colors: 16 })],
  ];
  for (const [paletteName, palette] of palettes) {
    const results = [['Original', source]];
    for (const [label, algorithm] of variants) {
      algorithm.apply(source, palette, 1);
      const times = [];
      let output;
      for (let run = 0; run < 3; run++) {
        const start = performance.now();
        output = algorithm.apply(source, palette, 1);
        times.push(performance.now() - start);
      }
      const medianMs = Number(times.sort((a, b) => a - b)[1].toFixed(2));
      rows.push({ photo, width: source.width, height: source.height, palette: paletteName, colors: palette.length, algorithm: label, medianMs });
      results.push([label, output]);
    }
    const sheet = createCanvas((source.width + 12) * results.length - 12, source.height + 48);
    const ctx = sheet.getContext('2d');
    ctx.fillStyle = '#17181c';
    ctx.fillRect(0, 0, sheet.width, sheet.height);
    for (const [i, [label, pixels]] of results.entries()) {
      ctx.putImageData(new ImageData(pixels.data, pixels.width, pixels.height), i * (source.width + 12), 0);
      ctx.fillStyle = '#eeeee8';
      ctx.font = '16px sans-serif';
      ctx.fillText(label, i * (source.width + 12), source.height + 30);
    }
    await writeFile(new URL(`${photo}-${paletteName}.png`, folder), sheet.toBuffer('image/png'));
  }
}
await writeFile(new URL('benchmark.json', folder), `${JSON.stringify({ metadata, rows }, null, 2)}\n`);
console.log(metadata);
console.table(rows);
console.log(`Comparison PNGs and benchmark.json: ${folder.pathname}`);
