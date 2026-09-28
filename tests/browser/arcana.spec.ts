import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { ditherToImageData, loadImageData } from '../../dist/index.js';
import { cards, themes, paletteFor } from '../../site/themes.js';

const hash = canvas => canvas.evaluate(async c => {
  const bytes = c.getContext('2d').getImageData(0,0,c.width,c.height).data;
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
});
async function matchesOriginal(canvas, file, options) {
  const width = await canvas.evaluate(c=>c.parentElement.clientWidth);
  const pixels = await ditherToImageData(`site/tarot/${file}`,{width,resample:'area',...options});
  await expect.poll(()=>hash(canvas)).toBe(createHash('sha256').update(pixels.data).digest('hex'));
}

test('Arcana rerenders original cards and preserves composited palette colors at multiple densities', async ({browser,baseURL},testInfo) => {
  test.setTimeout(90_000);
  for(const deviceScaleFactor of [1,1.25,2]) {
    const context=await browser.newContext({deviceScaleFactor,viewport:{width:1280,height:1000}});
    const page=await context.newPage();
    try {
      await page.goto(`${baseURL}/`);
      await expect(page.locator('h1')).toHaveText('dither·to');
      await expect(page.locator('canvas.arcana-image')).toHaveCount(6);
      for(const width of [1280,393,850,1280]) {
        await page.setViewportSize({width,height:1000});
        const canvas=page.locator('.hero-card canvas');
        await matchesOriginal(canvas,'01-the-magician.webp',{palette:paletteFor('orchid'),exposure:0.3});
        await canvas.scrollIntoViewIfNeeded();
        const box=(await canvas.boundingBox())!;
        const displayed=await loadImageData(await page.screenshot({clip:{x:Math.ceil(box.x)+2,y:Math.ceil(box.y)+2,width:Math.floor(box.width)-4,height:Math.floor(box.height)-4}}));
        const allowed=new Set(paletteFor('orchid').map(rgb=>rgb.join(',')));
        let outside=0;
        for(let i=0;i<displayed.data.length;i+=4)if(!allowed.has(Array.from(displayed.data.subarray(i,i+3)).join(',')))outside++;
        expect(outside,`viewport ${width}, density ${deviceScaleFactor}`).toBe(0);
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      }
      if(deviceScaleFactor===1) {
        for(const card of cards) {
          await page.locator('#card-select').selectOption(card.id);
          await matchesOriginal(page.locator('.hero-card canvas'),card.file,{palette:paletteFor('orchid'),exposure:0.3});
        }
        await page.screenshot({path:testInfo.outputPath('arcana-home.png'),fullPage:true});
      }
    } finally { await context.close(); }
  }
});

test('Arcana themes and settings carry to both playgrounds; recipes start expanded', async ({page}) => {
  await page.goto('/index.html');
  await expect(page.locator('canvas.arcana-image')).toHaveCount(6);
  for(const theme of Object.keys(themes)) {
    await page.getByRole('button',{name:themes[theme].name,exact:true}).click();
    await matchesOriginal(page.locator('.hero-card canvas'),'01-the-magician.webp',{palette:paletteFor(theme),exposure:0.3});
  }
  await page.getByRole('button',{name:'Moss',exact:true}).click();
  await page.locator('#texture').selectOption('ordered');
  await page.locator('#tone').fill('0.8');
  await page.locator('#card-select').selectOption('00-the-fool');
  await matchesOriginal(page.locator('.hero-card canvas'),'00-the-fool.webp',{palette:paletteFor('moss'),algorithm:'ordered',exposure:0.8});
  await page.locator('#open-playground').click();
  await expect(page.locator('#download')).toBeEnabled();
  await expect(page.locator('#sourceName')).toContainText('The Fool');
  await expect(page.locator('#recipe')).toBeVisible();
  await expect(page.locator('#cliRecipe')).toBeVisible();
  await matchesOriginal(page.locator('#resultCanvas'),'00-the-fool.webp',{palette:paletteFor('moss'),algorithm:'ordered',exposure:0.8});
  await page.getByRole('button',{name:'Orchid',exact:true}).click();
  await matchesOriginal(page.locator('#resultCanvas'),'00-the-fool.webp',{palette:paletteFor('orchid'),algorithm:'ordered',exposure:0.8});
  await page.setViewportSize({width:390,height:844});
  await matchesOriginal(page.locator('#resultCanvas'),'00-the-fool.webp',{palette:paletteFor('orchid'),algorithm:'ordered',exposure:0.8});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.goto('/index.html');
  await page.getByRole('button',{name:'Orchid',exact:true}).click();
  await page.getByRole('link',{name:'Compare the algorithms'}).click();
  await expect(page.locator('#colors')).toHaveValue('orchid');
  await expect(page.locator('.gallery canvas')).toHaveCount(5);
});

test('Algorithm gallery compares each renderer and keeps settings through resize, source changes and restore', async ({page}, testInfo) => {
  test.setTimeout(90_000);
  await page.goto('/responsive.html?theme=orchid');
  await expect(page).toHaveURL(/\/algorithms.html\?/);
  await expect(page.locator('.gallery canvas')).toHaveCount(5);
  await expect(page.locator('#galleryRecipe')).toBeVisible();
  const algorithms=['atkinson','floyd-steinberg','ordered','knoll','nearest'];
  const check = async (file='01-the-magician.webp', exposure=0.3, contrast=1, theme='orchid') => {
    for (const [index,algorithm] of algorithms.entries()) {
      await matchesOriginal(page.locator('.gallery canvas').nth(index),file,{palette:paletteFor(theme),algorithm,exposure,contrast});
    }
  };
  await check();
  await page.locator('#exposure').fill('0.8');
  await page.locator('#contrast').fill('20');
  await check('01-the-magician.webp',0.8,1.2);
  await expect(page.locator('#galleryRecipe')).toContainText('contrast: 1.2');
  for (const width of ['55','100']) { await page.locator('#galleryWidth').fill(width); await check('01-the-magician.webp',0.8,1.2); }
  await page.locator('#source').selectOption('00-the-fool');
  await check('00-the-fool.webp',0.8,1.2);
  await page.locator('#toggle').click();
  await expect(page.locator('.gallery img')).toHaveCount(5);
  await page.locator('#source').selectOption('03-the-empress');
  await page.getByRole('button',{name:'Mono',exact:true}).click();
  await page.locator('#toggle').click();
  await expect(page.locator('.gallery canvas')).toHaveCount(5);
  await check('03-the-empress.webp',0.8,1.2,'mono');
  await page.screenshot({path:testInfo.outputPath('algorithm-gallery.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await check('03-the-empress.webp',0.8,1.2,'mono');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('link',{name:'Tune Knoll',exact:false}).click();
  await expect(page.locator('#download')).toBeEnabled();
  await expect(page.locator('#algorithm')).toHaveValue('knoll');
  await expect(page.locator('#contrast')).toHaveValue('20');
  await matchesOriginal(page.locator('#resultCanvas'),'03-the-empress.webp',{palette:paletteFor('mono'),algorithm:'knoll',exposure:0.8,contrast:1.2});
  await page.goto('/examples/responsive-demo.html?theme=orchid');
  await expect(page).toHaveURL(/\/algorithms.html\?/);
  await expect(page.locator('#colors')).toHaveValue('orchid');
  await page.goto('/experiments/playground.html?card=00-the-fool');
  await expect(page).toHaveURL(/\/playground.html\?card=00-the-fool/);
  await expect(page.locator('#download')).toBeEnabled();
  await expect(page.locator('#sourceName')).toContainText('The Fool');
});
