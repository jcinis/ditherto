import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { ditherToImageData, PALETTES, loadImageData, algorithms } from '../dist/index.js';
import { encodePng } from '../dist/node.js';
const require = createRequire(import.meta.url);
// npm can prune other platforms from a lockfile when node_modules already exists.
// Preserve these optional binaries so a successful local build also installs in CI.
const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
for (const name of ['rollup', 'esbuild']) {
  for (const [dependency, version] of Object.entries(lock.packages[`node_modules/${name}`].optionalDependencies)) {
    if (!dependency.startsWith('@')) continue;
    assert.equal(lock.packages[`node_modules/${dependency}`]?.version, version, `Missing or mismatched platform binary: ${dependency}`);
  }
}
const cjs = require('../dist/index.cjs');
const packageVersion = JSON.parse(await readFile('package.json', 'utf8')).version;
assert.equal(cjs.version, packageVersion);
assert.equal((await import('../dist/index.js')).version, packageVersion);
const blue = await import('../dist/blue-noise.js');
const blueCjs = require('../dist/blue-noise.cjs');
assert.equal(algorithms.get('ordered-blue-noise'), undefined, 'Optional import must not mutate the main registry');
blue.registerBlueNoise(algorithms);
blueCjs.registerBlueNoise(cjs.algorithms);

const input = await loadImageData('tests/fixtures/input/gradient-4x4.png');
const result = await ditherToImageData(input, { width: 8, palette: PALETTES.GAMEBOY });
assert.deepEqual((await cjs.ditherToImageData(input, { width: 8, palette: PALETTES.GAMEBOY })).data, result.data);
assert.equal(encodePng(result).readUInt32BE(0), 0x89504e47);
const browser = await readFile(new URL('../dist/browser.js', import.meta.url), 'utf8');
assert(!browser.includes('@napi-rs/canvas') && !browser.includes('node:'), 'Browser bundle must not reference Node modules');
const browserGzipBytes = gzipSync(browser).length;
// Four additional core algorithms add ~2.5 KiB; the 9.5 KiB mask remains optional.
const browserBudgetBytes = 14 * 1024;
assert(browserGzipBytes <= browserBudgetBytes, `Browser bundle is ${browserGzipBytes} gzip bytes, exceeding the ${browserBudgetBytes}-byte budget. Review optional entry points before raising the budget.`);
console.log(`Browser bundle: ${Buffer.byteLength(browser)} bytes raw, ${browserGzipBytes} gzip bytes (budget ${browserBudgetBytes}).`);
const dom = await readFile(new URL('../dist/dom.js', import.meta.url), 'utf8');
assert(!dom.includes('@napi-rs/canvas') && !dom.includes('node:'), 'DOM bundle must not reference Node modules');
assert.equal(typeof require('../dist/dom.cjs').observeDitherDOM, 'function');
assert.equal(typeof (await import('../dist/dom.js')).observeDitherDOM, 'function');
const domGzipBytes = gzipSync(dom).length;
assert(domGzipBytes <= 16 * 1024, 'Optional DOM bundle exceeded its 16 KiB gzip budget');
console.log(`Optional DOM bundle: ${Buffer.byteLength(dom)} bytes raw, ${domGzipBytes} gzip bytes (includes core).`);

assert(!browser.includes('blueNoiseRanks'), 'Core bundle must exclude the mask');
const blueSource = await readFile(new URL('../dist/blue-noise.js', import.meta.url), 'utf8');
assert(!blueSource.includes('node:') && !blueSource.includes('@napi-rs/canvas'));
assert(gzipSync(blueSource).length <= 15 * 1024, 'Optional blue-noise bundle exceeded 15 KiB gzip');
const domRuntime = await import('../dist/dom.js');
blue.registerBlueNoise(domRuntime.algorithms);
assert.deepEqual((await domRuntime.ditherToImageData(input, {algorithm:'ordered-blue-noise'})).data,
  (await ditherToImageData(input, {algorithm:'ordered-blue-noise'})).data);
console.log(`Optional blue-noise bundle: ${gzipSync(blueSource).length} gzip bytes.`);
const consumer = `import { ditherToImageData, generatePalette, PALETTES, type KnollOptions } from 'ditherto';
import { encodePng } from 'ditherto/node';
import { observeDitherDOM, type DitherDOMController } from 'ditherto/dom';
function mount() {
  const controller: DitherDOMController = observeDitherDOM('img', {resample:'area'});
  void controller.images[0]?.update({exposure:undefined});
  controller.destroy();
}
void mount;
import { ditherToImageData as browserDither, algorithms, type OrderedOptions, type DiffusionOptions, type HalftoneOptions, type RiemersmaOptions } from 'ditherto/browser';
import { registerBlueNoise, type BlueNoiseKnollOptions } from 'ditherto/blue-noise';
registerBlueNoise(algorithms);
async function check(image: ImageData) {
  const result = await ditherToImageData(image, { palette: PALETTES.GAMEBOY, resample: 'area' });
  encodePng(result);
  const algorithmOptions: KnollOptions = { strength: 0.2, candidates: 32 };
  await browserDither(image, { algorithm: 'knoll', algorithmOptions });
  await ditherToImageData(image, { algorithm: 'nearest' });
  const ordered: OrderedOptions = {bayerSize:16};
  const diffusion: DiffusionOptions = {serpentine:true};
  const halftone: HalftoneOptions = {cellSize:6};
  const riemersma: RiemersmaOptions = {history:32};
  const blue: BlueNoiseKnollOptions = {strength:.2,candidates:64};
  for (const [algorithm,algorithmOptions] of Object.entries({ordered,stucki:diffusion,halftone,riemersma,'knoll-blue-noise':blue}))
    await browserDither(image,{algorithm,algorithmOptions});
  const palette = await generatePalette(image, { colors: 8 });
  await browserDither(image, { paletteImg: image, paletteColors: 8, exposure: 0.5, contrast: 1.2 });
  await ditherToImageData(image, { palette });
  return browserDither(image, { palette: PALETTES.BW, resample: 'area' });
}
void check;
`;
for (const extension of ['mts', 'cts']) {
  const path = `.build/consumer.${extension}`;
  await writeFile(path, consumer);
  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit', '--strict', '--exactOptionalPropertyTypes', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--target', 'ES2022', '--skipLibCheck', path], { stdio: 'pipe' });
}
const temp = await mkdtemp(join(tmpdir(), 'ditherto-package-'));
try {
  const cli = resolve('dist/cli.js');
  assert.match(execFileSync(process.execPath, [cli, '--help'], { encoding: 'utf8' }), /Usage:/);
  assert.equal(execFileSync(process.execPath, [cli, '--version'], { encoding: 'utf8' }).trim(), packageVersion);
  const link = join(temp, 'ditherto');
  await symlink(cli, link);
  assert.match(execFileSync(process.execPath, [link, '--help'], { encoding: 'utf8' }), /Usage:/);
  const output = join(temp, 'resized.png');
  execFileSync(process.execPath, [cli, 'tests/fixtures/input/gradient-4x4.png', '-o', output, '--width', '7']);
  const decoded = await loadImageData(output);
  assert.deepEqual([decoded.width, decoded.height], [7, 7]);
  const photoOutput = join(temp, 'photo.png');
  execFileSync(process.execPath, [cli, 'tests/fixtures/photos/coffee.jpg', '-o', photoOutput, '--width', '37', '--resample', 'area', '--paletteimg', 'tests/fixtures/photos/astronaut.png', '--palette-colors', '8', '--exposure', '0.5', '--contrast', '1.2']);
  const expectedPhoto = await ditherToImageData('tests/fixtures/photos/coffee.jpg', { width: 37, resample: 'area', paletteImg: 'tests/fixtures/photos/astronaut.png', paletteColors: 8, exposure: 0.5, contrast: 1.2 });
  assert.deepEqual((await loadImageData(photoOutput)).data, expectedPhoto.data);
  for (const palette of ['MONO_BLUE', '#25213b,#f4eccf']) {
    const output = join(temp, 'cli-palette.png');
    const record = JSON.parse(execFileSync(process.execPath, [cli, 'tests/fixtures/photos/coffee.png', '-o', output, '--palette', palette, '--width', '43', '--resample', 'area', '--json'], {encoding:'utf8'}));
    assert.deepEqual(record, {input:'tests/fixtures/photos/coffee.png',output,width:43,height:29});
    const colors = palette === 'MONO_BLUE' ? PALETTES.MONO_BLUE : [[37,33,59],[244,236,207]];
    const expected = await ditherToImageData('tests/fixtures/photos/coffee.png',{palette:colors,width:43,resample:'area'});
    assert.deepEqual((await loadImageData(output)).data, expected.data);
  }
  for (const algorithm of ['knoll', 'nearest']) {
    const output = join(temp, `${algorithm}.png`);
    const flags = algorithm === 'knoll' ? ['--strength', '0.35', '--candidates', '64'] : [];
    const options = { algorithm, palette: PALETTES.GAMEBOY, width: 37,
      ...(algorithm === 'knoll' ? { algorithmOptions: { strength: 0.35, candidates: 64 } } : {}) };
    execFileSync(process.execPath, [cli, 'tests/fixtures/photos/coffee.png', '-o', output, '--algorithm', algorithm, '--palette', 'GAMEBOY', '--width', '37', ...flags]);
    const expected = await ditherToImageData('tests/fixtures/photos/coffee.png', options);
    assert.deepEqual((await loadImageData(output)).data, expected.data);
    assert.deepEqual((await cjs.ditherToImageData('tests/fixtures/photos/coffee.png', options)).data, expected.data);
  }

  const cases = [
    ['atkinson',{serpentine:true},['--serpentine']],
    ['floyd-steinberg',{serpentine:true},['--serpentine']],
    ['sierra-lite',{serpentine:true},['--serpentine']],
    ['stucki',{serpentine:true},['--serpentine']],
    ['ordered',{bayerSize:16},['--bayer-size','16']],
    ['knoll',{bayerSize:8,strength:.4,candidates:16},['--bayer-size','8','--strength','.4','--candidates','16']],
    ['halftone',{cellSize:6},['--cell-size','6']],
    ['riemersma',{history:32},['--history','32']],
    ['ordered-blue-noise',{},[]],
    ['knoll-blue-noise',{strength:.35,candidates:64},['--strength','.35','--candidates','64']],
  ];
  for (const [algorithm, algorithmOptions, flags] of cases) {
    const output=join(temp,`production-${algorithm}.png`);
    const run=spawnSync(process.execPath,[cli,'tests/fixtures/photos/coffee.png','-o',output,'--algorithm',algorithm,'--palette','GAMEBOY','--width','37','--step','2','--json',...flags],{encoding:'utf8'});
    assert.equal(run.status,0,run.stderr);
    assert.equal(JSON.parse(run.stdout).width,37);
    if(algorithm==='halftone') assert.match(run.stderr,/darkest and lightest/);
    const options={algorithm,algorithmOptions,palette:PALETTES.GAMEBOY,width:37,step:2};
    const expected=await ditherToImageData('tests/fixtures/photos/coffee.png',options);
    assert.deepEqual((await loadImageData(output)).data,expected.data);
    assert.deepEqual((await cjs.ditherToImageData('tests/fixtures/photos/coffee.png',options)).data,expected.data);
  }
  for(const flags of [['--algorithm','ordered-blue-noise','--bayer-size','4'],['--algorithm','halftone','--cell-size','0'],['--algorithm','riemersma','--history','1'],['--algorithm','nearest','--serpentine'],['--algorithm','ordered','--bayer-size','3']]) {
    const run=spawnSync(process.execPath,[cli,'missing.png',...flags],{encoding:'utf8'});
    assert.equal(run.status,1);assert.doesNotMatch(run.stderr,/Input file not found/);
  }
  for (const args of [['--strength', '0.2'], ['--algorithm', 'knoll', '--strength', '2'], ['--algorithm', 'nearest', '--candidates', '32'], ['--palette','unknown'], ['--palette','BW','--paletteimg','x.png'], ['--palette-colors','0'], ['--palette-colors','257'], ['--palette-colors','8'], ['--exposure','NaN'], ['--exposure','5'], ['--contrast','-1'], ['--resample', 'invalid'], ['--width', '2px'], ['--width', '1.5'], ['--quality', 'NaN'], ['-o', join(temp, 'wrong.jpg')]]) {
    assert.equal(spawnSync(process.execPath, [cli, 'tests/fixtures/input/gradient-4x4.png', ...args]).status, 1);
  }
} finally { await rm(temp, { recursive: true, force: true }); }
console.log('Package smoke checks passed: ESM/CJS runtime and declaration parity, browser isolation, PNG encoder, CLI help/version/symlink/resizing/validation.');
