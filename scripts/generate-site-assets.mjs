// Real library output, not mockups. Rebuild after npm run build.
import { createCanvas, ImageData } from '@napi-rs/canvas';
import { mkdir, writeFile } from 'node:fs/promises';
import { loadImageData, ditherToImageData, PALETTES } from '../dist/index.js';
await mkdir('site/assets', {recursive:true});
const dusk = [[37,33,59],[139,80,102],[221,167,123],[244,236,207]];
function imageCanvas(image) {
  const canvas=createCanvas(image.width,image.height);
  canvas.getContext('2d').putImageData(new ImageData(image.data,image.width,image.height),0,0);
  return canvas;
}
async function strip(file, name, settings, labels, tileWidth=360) {
  const input=await loadImageData(`tests/fixtures/photos/${name}.png`);
  const height=Math.round(tileWidth*input.height/input.width);
  const canvas=createCanvas(settings.length*tileWidth+(settings.length-1)*16,height+48);
  const ctx=canvas.getContext('2d'); ctx.fillStyle='#f7f4ec';ctx.fillRect(0,0,canvas.width,canvas.height);
  for(let i=0;i<settings.length;i++) {
    const pixels=settings[i]===null?input:await ditherToImageData(input,{width:180,resample:'area',...settings[i]});
    ctx.imageSmoothingEnabled=settings[i]===null;
    ctx.drawImage(imageCanvas(pixels),i*(tileWidth+16),0,tileWidth,height);
    ctx.fillStyle='#292537';ctx.font='16px sans-serif';ctx.fillText(labels[i],i*(tileWidth+16),height+30);
  }
  await writeFile(`site/assets/${file}.png`,canvas.toBuffer('image/png'));
}
await strip('hero','coffee',[null,{palette:dusk,exposure:0.3,contrast:1.1}],['Original photograph','Atkinson · four colors'],600);
await strip('algorithms','astronaut',[null,{algorithm:'atkinson'},{algorithm:'floyd-steinberg'},{algorithm:'ordered'}],['Original','Atkinson','Floyd–Steinberg','Ordered / Bayer'],280);
await strip('palettes','chelsea',[{palette:PALETTES.MONO_BLUE},{palette:dusk},{palette:PALETTES.GAMEBOY}],['Blue ink + white','Dusk / four colors','Game Boy'],360);
console.log('Generated real photographic examples in site/assets.');

await import('./generate-tarot-previews.mjs');
await import('./generate-social-preview.mjs');

await import('./generate-why-assets.mjs');
