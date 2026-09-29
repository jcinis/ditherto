import { expect, test } from '@playwright/test';
import { algorithms, ditherToImageData, loadImageData, PALETTES } from '../../src/index.js';
import { registerBlueNoise } from '../../src/blue-noise.js';
registerBlueNoise(algorithms);
const cases = [
  ['atkinson',{serpentine:true}], ['floyd-steinberg',{serpentine:true}],
  ['sierra-lite',{serpentine:true}], ['stucki',{serpentine:true}],
  ['ordered',{bayerSize:16}], ['knoll',{bayerSize:8,strength:.35,candidates:64}],
  ['halftone',{cellSize:6}], ['riemersma',{history:32}],
  ['ordered-blue-noise',{}], ['knoll-blue-noise',{strength:.2,candidates:32}],
] as const;
const ready = async(page:any) => {await expect(page.locator('#download')).toBeEnabled();await expect(page.locator('#status')).toContainText('pixels');};

test('all new options have Node/browser pixel parity and DOM support',async({page})=>{
 await page.goto('/examples/classic-browser-demo.html');await ready(page);
 const input=await loadImageData('tests/fixtures/input/gradient-4x4.png');
 for(const [algorithm,algorithmOptions] of cases) {
   const options={algorithm,algorithmOptions,palette:PALETTES.GAMEBOY,width:29,step:2};
   const expected=await ditherToImageData(input,options);
   const actual=await page.evaluate(async(options)=>{
     const core=await import('/dist/dom.js');
     const {registerBlueNoise}=await import('/dist/blue-noise.js');registerBlueNoise(core.algorithms);
     const img=document.createElement('img');img.src='/tests/fixtures/input/gradient-4x4.png';img.alt='test';
     img.dataset.algorithm=options.algorithm;img.dataset.algorithmOptions=JSON.stringify(options.algorithmOptions);
     img.dataset.width=String(options.width);img.dataset.step=String(options.step);img.dataset.palette=JSON.stringify(options.palette);
     document.body.append(img);
     const canvas=await core.ditherImageElement(img);
     const pixels=Array.from(canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data);canvas.remove();return pixels;
   },options);
   expect(actual,algorithm).toEqual([...expected.data]);
 }
});
test('playground exports each algorithm setting and loads blue noise only on demand',async({page})=>{
 const requests:string[]=[];page.on('request',r=>requests.push(r.url()));
 await page.goto('/playground.html?algorithm=stucki&theme=blue');await ready(page);
 expect(requests.some(url=>url.endsWith('/blue-noise.js'))).toBe(false);
 await expect(page.locator('#diffusionControls')).toBeVisible();
 await page.locator('#serpentine').check();await ready(page);await expect(page.locator('#cliRecipe')).toContainText('--serpentine');
 await page.locator('#algorithm').selectOption('ordered');await ready(page);
 await page.locator('#bayerSize').selectOption('16');await ready(page);
 await expect(page.locator('#recipe')).toContainText('"bayerSize":16');await expect(page.locator('#cliRecipe')).toContainText('--bayer-size 16');
 await page.locator('#algorithm').selectOption('riemersma');await ready(page);
 await page.locator('#riemersmaHistory').fill('32');await ready(page);await expect(page.locator('#cliRecipe')).toContainText('--history 32');
 await page.locator('#algorithm').selectOption('halftone');await ready(page);
 await page.locator('#halftoneCellSize').fill('6');await ready(page);await expect(page.locator('#cliRecipe')).toContainText('--cell-size 6');
 await page.locator('#palette').selectOption('GAMEBOY');await ready(page);
 await expect(page.locator('#algorithmHelp')).toContainText('darkest and lightest');
 await page.locator('#halftoneCellSize').fill('0');await expect(page.locator('#error')).toBeVisible();
 await page.locator('#algorithm').selectOption('knoll-blue-noise');await ready(page);
 await expect(page.locator('#recipe')).toContainText("from 'ditherto/blue-noise'");
 await expect(page.locator('#recipe')).toContainText('registerBlueNoise(algorithms)');
 await expect(page.locator('#bayerControls')).toBeHidden();await expect(page.locator('#knollControls')).toBeVisible();
 expect(requests.some(url=>url.endsWith('/blue-noise.js'))).toBe(true);
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
