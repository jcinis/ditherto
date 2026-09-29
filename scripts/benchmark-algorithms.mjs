// Run after npm run build. Median of three warmed apply() passes; not decoding/resizing.
import { performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';
import { algorithms, PALETTES, loadImageData, resizeImageData } from '../dist/index.js';
import { registerBlueNoise } from '../dist/blue-noise.js';
registerBlueNoise(algorithms);
const rows=[];
function measure(name,source,palette,options={}) {
 const algorithm=algorithms.get(name);algorithm.apply(source,palette,1,options);
 const samples=[];
 for(let i=0;i<3;i++){const start=performance.now();algorithm.apply(source,palette,1,options);samples.push(performance.now()-start);}
 samples.sort((a,b)=>a-b);
 rows.push({algorithm:name,width:source.width,height:source.height,colors:palette.length,medianMs:Number(samples[1].toFixed(2))});
}
for(const [width,height] of [[64,64],[4096,1],[1,4096],[8192,1]]) {
 const data=new Uint8ClampedArray(width*height*4).fill(128);for(let i=3;i<data.length;i+=4)data[i]=255;
 measure('riemersma',{data,width,height,colorSpace:'srgb'},PALETTES.BW);
}
const photo=await loadImageData('tests/fixtures/photos/coffee.png');
for(const width of [320,640]) {
 const source=await resizeImageData(photo,{width,resample:'area'});
 for(const name of algorithms.list())measure(name,source,name==='halftone'?PALETTES.BW:PALETTES.GAMEBOY);
}
await writeFile('.build/production-algorithm-benchmark.json',JSON.stringify({node:process.version,rows},null,2)+'\n');
console.table(rows);
