import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { ditherToImageData, loadImageData } from '../../dist/index.js';
import { paletteFor } from '../../site/themes.js';

const hash = locator => locator.evaluate(async element => {
  const canvas = element instanceof HTMLCanvasElement ? element : document.createElement('canvas');
  if (element instanceof HTMLImageElement) {
    await element.decode();
    canvas.width = element.naturalWidth;
    canvas.height = element.naturalHeight;
    canvas.getContext('2d').drawImage(element,0,0);
  }
  const bytes = canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
});
async function checkLive(page, file='tests/fixtures/photos/coffee.png', theme='mono') {
  const width = await page.locator('#liveWell').evaluate(el => Math.round(el.clientWidth));
  const reference = await ditherToImageData(file,{width,resample:'area',algorithm:'atkinson',palette:paletteFor(theme),exposure:0.3});
  await expect.poll(() => hash(page.locator('canvas#whyLive'))).toBe(createHash('sha256').update(reference.data).digest('hex'));
}

test('Why compares the same dither at export size, rebuilds live pixels and keeps the PNG fixed', async ({page},testInfo) => {
  await page.setViewportSize({width:962,height:1000});
  await page.goto('/why.html?theme=mono&image=coffee');
  await expect(page.locator('canvas#whyLive')).toBeVisible();
  await checkLive(page);
  const fixed = await hash(page.locator('#whyExport'));
  expect(await hash(page.locator('canvas#whyLive'))).toBe(fixed);
  const src = await page.locator('#whyExport').getAttribute('src');
  for (const percent of ['67','43','100']) {
    await page.locator('#comparisonWidth').fill(percent);
    await checkLive(page);
    expect(await hash(page.locator('#whyExport'))).toBe(fixed);
    await expect(page.locator('#whyExport')).toHaveAttribute('src',src!);
    expect(await page.locator('#whyExport').evaluate(img => (img as HTMLImageElement).naturalWidth)).toBe(320);
  }
  await page.locator('#comparisonWidth').fill('67');
  await checkLive(page);
  const measure = await page.locator('#liveMeasure').textContent();
  await page.locator('#pixelatedExport').check();
  expect(await page.locator('#whyExport').evaluate(img => getComputedStyle(img).imageRendering)).toBe('pixelated');
  await expect(page.locator('#liveMeasure')).toHaveText(measure!);
  await page.locator('#resetWidth').click();
  await expect(page.locator('#comparisonWidth')).toHaveValue('100');
  await page.getByRole('button',{name:'Amber',exact:true}).click();
  await checkLive(page,'tests/fixtures/photos/coffee.png','amber');
  await expect(page.locator('#whyExport')).toHaveAttribute('src','./assets/why/coffee-amber.png');
  expect(await hash(page.locator('canvas#whyLive'))).toBe(await hash(page.locator('#whyExport')));
  await page.locator('#whySource').selectOption('astronaut');
  await checkLive(page,'tests/fixtures/photos/astronaut.png','amber');
  await expect(page.locator('#imageCredit')).toContainText('NASA');
  await page.setViewportSize({width:390,height:844});
  await checkLive(page,'tests/fixtures/photos/astronaut.png','amber');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const tops = await page.locator('.why-image').evaluateAll(elements => elements.map(el => el.getBoundingClientRect().top));
  expect(Math.max(...tops)-Math.min(...tops)).toBeLessThan(1);
  await page.screenshot({path:testInfo.outputPath('why-mobile.png'),fullPage:true});
});

test('Why shows browser smoothing adding colors to the fixed export at fractional scales', async ({browser,baseURL},testInfo) => {
  test.setTimeout(60_000);
  for (const deviceScaleFactor of [1,1.25,2]) {
    const context = await browser.newContext({viewport:{width:1280,height:1000},deviceScaleFactor});
    const page = await context.newPage();
    try {
      await page.goto(`${baseURL}/why.html?theme=mono&image=coffee&width=79`);
      await expect(page.locator('canvas#whyLive')).toBeVisible();
      await checkLive(page);
      await page.locator('#whyExport').evaluate((img:HTMLImageElement) => img.decode());
      for (const [selector,shouldBlend] of [['canvas#whyLive',false],['#whyExport',true]] as const) {
        const target = page.locator(selector);
        await target.scrollIntoViewIfNeeded();
        const box = (await target.boundingBox())!;
        const png = await page.screenshot({clip:{x:Math.ceil(box.x)+2,y:Math.ceil(box.y)+2,width:Math.floor(box.width)-4,height:Math.floor(box.height)-4}});
        const pixels = await loadImageData(png);
        let intermediate = 0;
        for(let i=0;i<pixels.data.length;i+=4) if(pixels.data[i]!==0&&pixels.data[i]!==255) intermediate++;
        if(shouldBlend) expect(intermediate).toBeGreaterThan(pixels.width*pixels.height*0.05);
        else expect(intermediate).toBe(0);
      }
      if(deviceScaleFactor===1) await page.screenshot({path:testInfo.outputPath('why-desktop.png'),fullPage:true});
    } finally { await context.close(); }
  }
});
