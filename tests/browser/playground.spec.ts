import { test, expect } from '@playwright/test';
import { ditherToImageData, loadImageData, PALETTES } from '../../dist/index.js';
import { readFile } from 'node:fs/promises';

async function ready(page) {
  await expect(page.locator('#download')).toBeEnabled();
  await expect(page.locator('#error')).toBeHidden();
}
async function setWidth(page, width) {
  await page.locator('#widthNumber').fill(String(width));
  await expect(page.locator('#resultCanvas')).toHaveJSProperty('width', width);
  await ready(page);
}

test('real worker rendering, changes and repeat resizing from the original', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/examples/classic-browser-demo.html');
  await ready(page);
  await setWidth(page, 96);
  const first = await page
    .locator('#resultCanvas')
    .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await setWidth(page, 160);
  await setWidth(page, 96);
  expect(
    await page.locator('#resultCanvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())
  ).toBe(first);
  await page.locator('#algorithm').selectOption('ordered');
  await ready(page);
  await expect(page.locator('#algorithmHelp')).toContainText('Bayer pattern');
  const ordered = await page
    .locator('#resultCanvas')
    .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  expect(ordered).not.toBe(first);
  await page.locator('#palette').selectOption('BW');
  await ready(page);
  await page.locator('#step').fill('3');
  await ready(page);
  await expect(page.locator('#stepValue')).toHaveText('3 × 3');
  expect(errors).toEqual([]);
});

test('responsive resize changes actual bitmap dimensions and mobile layout fits', async ({
  page,
}, testInfo) => {
  await page.goto('/examples/classic-browser-demo.html');
  await ready(page);
  const before = await page
    .locator('#resultCanvas')
    .evaluate((canvas: HTMLCanvasElement) => canvas.width);
  await page.setViewportSize({ width: 760, height: 1000 });
  await expect
    .poll(() => page.locator('#resultCanvas').evaluate((canvas: HTMLCanvasElement) => canvas.width))
    .not.toBe(before);
  await ready(page);
  const wellWidth = await page
    .locator('#resultWell')
    .evaluate((element) => Math.round(element.clientWidth));
  await expect(page.locator('#resultCanvas')).toHaveJSProperty('width', wellWidth);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.locator('#resultCanvas').evaluate((canvas: HTMLCanvasElement) => canvas.width))
    .toBe(await page.locator('#resultWell').evaluate((element) => Math.round(element.clientWidth)));
  await ready(page);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  for (const select of await page.locator('select:visible').all()) {
    // Firefox can report 43.99997 for a 44 CSS-pixel control.
    expect((await select.boundingBox())!.height).toBeGreaterThanOrEqual(44 - 0.001);
  }
  await page.screenshot({ path: testInfo.outputPath('playground-mobile.png'), fullPage: true });
});

test('file upload and Node/browser pixel parity for all algorithms after resizing', async ({
  page,
}) => {
  await page.goto('/examples/classic-browser-demo.html');
  await ready(page);
  await page.locator('#imageInput').setInputFiles('tests/fixtures/input/gradient-4x4.png');
  await expect(page.locator('#sourceName')).toHaveText('gradient-4x4.png');
  await ready(page);
  const input = await loadImageData('tests/fixtures/input/gradient-4x4.png');
  for (const algorithm of ['atkinson', 'floyd-steinberg', 'ordered', 'knoll', 'nearest']) {
    const expected = await ditherToImageData(input, {
      algorithm,
      palette: PALETTES.GAMEBOY,
      width: 7,
      step: 2,
    });
    const actual = await page.evaluate(async (algorithm) => {
      const { ditherToImageData, PALETTES } = await import('/dist/browser.js');
      const result = await ditherToImageData('/tests/fixtures/input/gradient-4x4.png', {
        algorithm,
        palette: PALETTES.GAMEBOY,
        width: 7,
        step: 2,
      });
      return { width: result.width, height: result.height, pixels: Array.from(result.data) };
    }, algorithm);
    expect(actual).toEqual({
      width: expected.width,
      height: expected.height,
      pixels: Array.from(expected.data),
    });
  }
});

test('latest recipe wins rapid changes; invalid palette recovers', async ({ page }) => {
  await page.goto('/examples/classic-browser-demo.html');
  await ready(page);
  await page.locator('#widthNumber').fill('1024');
  await page.locator('#widthNumber').fill('32');
  await page.locator('#widthNumber').fill('64');
  await expect(page.locator('#resultCanvas')).toHaveJSProperty('width', 64);
  await ready(page);
  await page.locator('#palette').selectOption('CUSTOM');
  await expect(page.locator('#customPalette')).toBeVisible();
  await page.locator('#customPalette').fill('bad hex');
  await expect(page.locator('#error')).toBeVisible();
  await expect(page.locator('#download')).toBeDisabled();
  await page.locator('#customPalette').fill('#000000, #ffffff');
  await ready(page);
});

test('download is a valid PNG and the recipe matches chosen settings', async ({ page }) => {
  await page.goto('/examples/classic-browser-demo.html');
  await ready(page);
  await setWidth(page, 120);
  await page.locator('.preview-area summary').filter({hasText: 'Use this recipe in your code'}).click();
  await expect(page.locator('#recipe')).toContainText('width: 120');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#download').click();
  const download = await downloadPromise;
  const path = await download.path();
  const data = await readFile(path!);
  expect(Array.from(data.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const image = await loadImageData(data);
  expect([image.width, image.height]).toEqual([120, 80]);
});

test('DOM helper waits for decoding and replaces images in a real browser', async ({ page }) => {
  await page.goto('/examples/classic-browser-demo.html');
  await ready(page);
  const result = await page.evaluate(async () => {
    const { autoDitherDOM } = await import('/dist/browser.js');
    const img = document.createElement('img');
    img.alt = 'Gradient';
    img.className = 'to-dither';
    img.dataset.width = '8';
    img.src = '/tests/fixtures/input/gradient-4x4.png';
    document.body.append(img);
    const [canvas] = await autoDitherDOM('.to-dither');
    return {
      width: canvas.width,
      height: canvas.height,
      label: canvas.getAttribute('aria-label'),
      replaced: !img.isConnected,
    };
  });
  expect(result).toEqual({ width: 8, height: 8, label: 'Gradient', replaced: true });
});

test('Knoll controls export replayable options and nearest matches zero strength', async ({ page }) => {
  await page.goto('/playground.html?algorithm=knoll');
  await ready(page);
  await setWidth(page, 96);
  await expect(page.locator('#knollControls')).toBeVisible();
  await expect(page.locator('#knollStrength')).toHaveValue('20');
  await expect(page.locator('#recipe')).toContainText('algorithmOptions: {"strength":0.2,"candidates":32}');
  await page.locator('#knollControls summary').click();
  await page.locator('#knollCandidates').fill('64');
  await page.locator('#knollStrength').fill('35');
  await ready(page);
  await expect(page.locator('#recipe')).toContainText('algorithmOptions: {"strength":0.35,"candidates":64}');
  await expect(page.locator('#cliRecipe')).toContainText('--strength 0.35 --candidates 64');
  const options = { algorithm: 'knoll', algorithmOptions: { strength: 0.35, candidates: 64 }, palette: PALETTES.RGB, width: 7 };
  const input = await loadImageData('tests/fixtures/input/gradient-4x4.png');
  const expected = await ditherToImageData(input, options);
  const actual = await page.evaluate(async (options) => {
    const { ditherToImageData } = await import('/dist/browser.js');
    return Array.from((await ditherToImageData('/tests/fixtures/input/gradient-4x4.png', options)).data);
  }, options);
  expect(actual).toEqual(Array.from(expected.data));
  await page.locator('#knollStrength').fill('0');
  await ready(page);
  const zero = await page.locator('#resultCanvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await page.locator('#algorithm').selectOption('nearest');
  await ready(page);
  await expect(page.locator('#knollControls')).toBeHidden();
  expect(await page.locator('#resultCanvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(zero);
  await expect(page.locator('#recipe')).not.toContainText('algorithmOptions');
  await expect(page.locator('#cliRecipe')).not.toContainText('--strength');
  await page.locator('#algorithm').selectOption('knoll');
  await ready(page);
  await expect(page.locator('#knollStrength')).toHaveValue('0');
  await page.locator('#knollCandidates').fill('0');
  await expect(page.locator('#error')).toBeVisible();
  await page.locator('#algorithm').selectOption('ordered');
  await ready(page);
});

test('desktop visual review', async ({ page }, testInfo) => {
  await page.goto('/examples/classic-browser-demo.html');
  await ready(page);
  await page.screenshot({ path: testInfo.outputPath('playground-desktop.png'), fullPage: true });
});
