import { test, expect } from '@playwright/test';
import { ditherToImageData, generatePalette } from '../../dist/index.js';
import { encodePng } from '../../dist/node.js';

const ready = async (page) => {
  await expect(page.locator('#download')).toBeEnabled();
  await expect(page.locator('#error')).toBeHidden();
};
async function setup(page) {
  await page.goto('/examples/classic-browser-demo.html');
  await page.locator('#photoSample').selectOption('coffee');
  await expect(page.locator('#sourceName')).toContainText('coffee');
  await ready(page);
  await page.locator('#widthNumber').fill('96');
  await expect(page.locator('#resultCanvas')).toHaveJSProperty('width',96);
  await ready(page);
}
const pixels = page => page.locator('#resultCanvas').evaluate((c: HTMLCanvasElement) => Array.from(c.getContext('2d')!.getImageData(0,0,c.width,c.height).data));
const swatches = page => page.locator('#swatches span').evaluateAll(nodes => nodes.map(node => node.getAttribute('title')));

test('choose current-image palettes, change count and resize without changing source colors', async ({page}) => {
  await setup(page);
  await page.locator('#palette').selectOption('PHOTO');
  await page.locator('#paletteColors').fill('4');
  await ready(page);
  await expect(page.locator('#swatches span')).toHaveCount(4);
  const four = await pixels(page);
  const expected = await ditherToImageData('tests/fixtures/photos/coffee.png',{width:96,resample:'area',paletteImg:'tests/fixtures/photos/coffee.png',paletteColors:4});
  expect(four).toEqual(Array.from(expected.data));
  await page.locator('#paletteColors').fill('16');
  await ready(page);
  await expect(page.locator('#swatches span')).toHaveCount(16);
  expect(await pixels(page)).not.toEqual(four);
  const palette = await swatches(page);
  await page.locator('#widthNumber').fill('128');
  await expect(page.locator('#resultCanvas')).toHaveJSProperty('width',128);
  await ready(page);
  expect(await swatches(page)).toEqual(palette);
  await page.locator('#paletteColors').fill('4');
  await page.locator('#widthNumber').fill('96');
  await expect(page.locator('#resultCanvas')).toHaveJSProperty('width',96);
  await ready(page);
  expect(await pixels(page)).toEqual(four);
});

test('borrow colors from another photograph; tones and source replacement keep that palette', async ({page}, testInfo) => {
  await setup(page);
  await page.locator('#palette').selectOption('REFERENCE');
  await expect(page.locator('#error')).toContainText('reference photo');
  await page.locator('#paletteImageInput').setInputFiles('tests/fixtures/photos/astronaut.png');
  await ready(page);
  await expect(page.locator('#paletteSourceName')).toHaveText('astronaut.png');
  await expect(page.locator('#sourceName')).toContainText('coffee');
  const palette = await generatePalette('tests/fixtures/photos/astronaut.png',{colors:8});
  expect(await swatches(page)).toEqual(palette.map(c => `RGB ${c.join(', ')}`));
  await page.locator('details.tone-controls > summary').click();
  await page.locator('#exposure').fill('0.7');
  await page.locator('#contrast').fill('30');
  await ready(page);
  const expected = await ditherToImageData('tests/fixtures/photos/coffee.png',{width:96,resample:'area',palette,exposure:0.7,contrast:1.3});
  expect(await pixels(page)).toEqual(Array.from(expected.data));
  await expect(page.locator('#recipe')).toContainText('exposure: 0.7');
  await expect(page.locator('#recipe')).toContainText('contrast: 1.3');
  await expect(page.locator('#recipe')).toContainText(JSON.stringify(palette));
  await page.screenshot({path:testInfo.outputPath('reference-palette-tones.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const workspace = (await page.locator('.workspace').boundingBox())!;
  for (const element of await page.locator('.controls select, .controls input').all()) {
    if (!await element.isVisible()) continue;
    const bounds = (await element.boundingBox())!;
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(workspace.x + workspace.width);
  }
  await page.screenshot({path:testInfo.outputPath('reference-palette-mobile.png'),fullPage:true});
  await page.locator('#photoSample').selectOption('chelsea');
  await expect(page.locator('#sourceName')).toContainText('chelsea');
  await ready(page);
  expect(await swatches(page)).toEqual(palette.map(c => `RGB ${c.join(', ')}`));
});

test('invalid budgets and transparent references fail clearly, then recover', async ({page}) => {
  await setup(page);
  await page.locator('#palette').selectOption('PHOTO');
  for(const value of ['0','257','1.5']) {
    await page.locator('#paletteColors').fill(value);
    await expect(page.locator('#error')).toContainText('palette size');
    await expect(page.locator('#download')).toBeDisabled();
  }
  await page.locator('#paletteColors').fill('2');
  await ready(page);
  await expect(page.locator('#swatches span')).toHaveCount(2);
  await page.locator('#palette').selectOption('REFERENCE');
  const transparent = encodePng({width:1,height:1,data:new Uint8ClampedArray([255,0,0,0]),colorSpace:'srgb'});
  await page.locator('#paletteImageInput').setInputFiles({name:'transparent.png',mimeType:'image/png',buffer:Buffer.from(transparent)});
  await expect(page.locator('#error')).toContainText('no visible colors');
  await page.locator('#paletteImageInput').setInputFiles('tests/fixtures/palettes/bw-palette.png');
  await page.locator('#paletteColors').fill('8');
  await ready(page);
  await expect(page.locator('#swatches span')).toHaveCount(2);
  await expect(page.locator('#paletteInfo')).toContainText('2 colors selected (up to 8 requested)');
});

test('tone controls reset exactly and all algorithms match Node after adjustment', async ({page}) => {
  await setup(page);
  const initial = await pixels(page);
  await page.locator('details.tone-controls > summary').click();
  await page.locator('#exposure').fill('1');
  await page.locator('#contrast').fill('40');
  await ready(page);
  expect(await pixels(page)).not.toEqual(initial);
  await page.locator('#resetTones').click();
  await ready(page);
  expect(await pixels(page)).toEqual(initial);
  await page.locator('#palette').selectOption('PHOTO');
  await page.locator('#exposure').fill('-0.5');
  await page.locator('#contrast').fill('20');
  for(const algorithm of ['atkinson','floyd-steinberg','ordered']) {
    await page.locator('#algorithm').selectOption(algorithm);
    await ready(page);
    const expected = await ditherToImageData('tests/fixtures/photos/coffee.png', {algorithm,width:96,resample:'area',paletteImg:'tests/fixtures/photos/coffee.png',paletteColors:8,exposure:-0.5,contrast:1.2});
    expect(await pixels(page)).toEqual(Array.from(expected.data));
  }
});
