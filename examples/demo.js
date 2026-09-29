import { algorithmDescriptions, setupAlgorithmControls, updateAlgorithmControls, selectedAlgorithmOptions, algorithmFlags, recipeImport } from './algorithm-controls.js';
import { PALETTES, loadImageData } from '../dist/browser.js';

const $ = (id) => document.getElementById(id);
const original = $('originalCanvas');
const output = $('resultCanvas');
const palettes = {
  ...PALETTES,
  STUDIO: [
    [37, 33, 59],
    [139, 80, 102],
    [221, 167, 123],
    [244, 236, 207],
  ],
};
const descriptions = {
  atkinson: 'Airy texture with a little extra contrast.',
  'floyd-steinberg': 'Fine, flowing texture with smooth tonal transitions.',
  ...algorithmDescriptions,
  knoll: 'Ordered texture with multi-color mixtures and adjustable strength.',
  nearest: 'Flat palette colors with hard transitions. No dithering.',
};
let source;
let loadId = 0;
let loading = false;
let revision = 0;
let busy = false;
let pending;
let timer;
let paletteLoadId = 0;
let paletteLoading = false;
let renderOptions;
let recipe = '';
let cliRecipe = '';
const worker = new Worker(new URL('./demo-worker.js', import.meta.url), { type: 'module' });

function showError(message) {
  $('error').textContent = message;
  $('error').hidden = false;
  $('status').textContent = 'Could not render this recipe.';
  $('download').disabled = true;
  $('copy').disabled = true;
  $('copyCli').disabled = true;
}
function readPalette() {
  if (['PHOTO', 'REFERENCE'].includes($('palette').value)) return undefined;
  if ($('palette').value !== 'CUSTOM') return palettes[$('palette').value];
  const values = $('customPalette')
    .value.split(/[\s,]+/)
    .filter(Boolean);
  if (
    !values.length ||
    values.length > 256 ||
    values.some((value) => !/^#[0-9a-f]{6}$/i.test(value))
  ) {
    throw new Error(
      'Enter 1–256 six-digit hex colors, separated by commas (for example #25213b, #f4eccf).'
    );
  }
  return values.map((value) =>
    [1, 3, 5].map((start) => Number.parseInt(value.slice(start, start + 2), 16))
  );
}
function options() {
  const width = Number($('widthNumber').value);
  if (!Number.isInteger(width) || width < 1 || width > 2048)
    throw new Error('Choose an output width between 1 and 2048 pixels.');
  return {
    algorithm: $('algorithm').value,
    ...selectedAlgorithmOptions(),
    palette: readPalette(),
    width,
    step: Number($('step').value),
    resample: $('resample').value,
    exposure: Number($('exposure').value),
    contrast: 1 + Number($('contrast').value) / 100,
  };
}
function updateRecipe(value) {
  const palette = $('palette').value;
  const paletteCode = palette in PALETTES ? `PALETTES.${palette}` : JSON.stringify(value.palette);
  const paletteNote = ['PHOTO', 'REFERENCE'].includes(palette) ? '// Extracted palette is embedded below so this recipe is self-contained.\n' : '';
  const algorithmCode = value.algorithmOptions ? `  algorithmOptions: ${JSON.stringify(value.algorithmOptions)},\n` : '';
  recipe = `${recipeImport(value.algorithm)}${paletteNote}const pixels = await ditherToImageData(originalImage, {\n  algorithm: '${value.algorithm}',\n${algorithmCode}  palette: ${paletteCode},\n  width: ${value.width},\n  resample: '${value.resample}',\n  step: ${value.step},\n  exposure: ${value.exposure},\n  contrast: ${value.contrast},\n});\n\ncanvas.width = pixels.width;\ncanvas.height = pixels.height;\ncanvas.getContext('2d').putImageData(pixels, 0, 0);`;
  $('recipe').textContent = recipe;
  const paletteArgument = palette in PALETTES ? palette : value.palette.map(rgb => '#' + rgb.map(channel => channel.toString(16).padStart(2,'0')).join('')).join(',');
  const flags = algorithmFlags(value.algorithmOptions);
  cliRecipe = `npx ditherto input.jpg -o output.png --algorithm ${value.algorithm}${flags} --palette '${paletteArgument}' --width ${value.width} --resample ${value.resample} --step ${value.step} --exposure ${value.exposure} --contrast ${value.contrast} --json`;
  $('cliRecipe').textContent = cliRecipe;
}
function dispatch() {
  if (busy || !pending) return;
  const message = pending;
  pending = undefined;
  busy = true;
  worker.postMessage(message);
}
function schedule() {
  revision++;
  clearTimeout(timer);
  pending = undefined;
  $('download').disabled = true;
  $('copy').disabled = true;
  $('copyCli').disabled = true;
  updateAlgorithmControls();
  $('knollStrengthValue').textContent = `${$('knollStrength').value}%`;
  $('photoPaletteControls').hidden = !['PHOTO', 'REFERENCE'].includes($('palette').value);
  $('paletteFileControls').hidden = $('palette').value !== 'REFERENCE';
  $('customLabel').hidden = $('palette').value !== 'CUSTOM';
  $('exposureValue').textContent = `${Number($('exposure').value)} EV`;
  $('contrastValue').textContent = `${Number($('contrast').value)}%`;
  if (loading || (paletteLoading && $('palette').value === 'REFERENCE')) return;
  $('status').textContent = 'Rendering from the original…';
  timer = setTimeout(() => {
    if (!source) return;
    try {
      const value = options();
      $('error').hidden = true;
      $('algorithmHelp').textContent = descriptions[value.algorithm];
      $('resampleHelp').textContent = value.resample === 'area' ? 'Average fine detail before dithering. Enlargement stays crisp.' : 'Keep individual source pixels. Fine photo textures may alias.';
      $('stepValue').textContent = `${value.step} × ${value.step}`;
      $('customLabel').hidden = $('palette').value !== 'CUSTOM';
      const paletteMode = $('palette').value;
      const paletteColors = Number($('paletteColors').value);
      if (['PHOTO', 'REFERENCE'].includes(paletteMode) && (!Number.isInteger(paletteColors) || paletteColors < 1 || paletteColors > 256)) throw new Error('Choose a palette size between 1 and 256 colors.');
      renderOptions = value;
      pending = { id: revision, options: value, paletteMode, paletteColors };
      dispatch();
    } catch (error) {
      showError(error.message);
    }
  }, 60);
}
worker.onmessage = ({ data: message }) => {
  busy = false;
  if (message.id === revision) {
    if (message.error) showError(message.error);
    else {
      const { result } = message;
      $('swatches').replaceChildren(...message.palette.map((color) => {
        const swatch = document.createElement('span');
        swatch.style.backgroundColor = `rgb(${color.join(',')})`;
        swatch.title = `RGB ${color.join(', ')}`;
        return swatch;
      }));
      $('paletteInfo').textContent = `${message.palette.length} colors selected (up to ${$('paletteColors').value} requested).`;
      updateRecipe({ ...renderOptions, palette: message.palette });
      output.width = result.width;
      output.height = result.height;
      output
        .getContext('2d')
        .putImageData(new ImageData(result.data, result.width, result.height), 0, 0);
      $('resultInfo').textContent = `${result.width} × ${result.height}`;
      $('status').textContent =
        `${result.width} × ${result.height} pixels · ${Math.round(message.elapsed)} ms`;
      $('download').disabled = false;
      $('copy').disabled = false;
      $('copyCli').disabled = false;
      output.dataset.revision = String(message.id);
    }
  }
  dispatch();
};
worker.onerror = (event) => {
  busy = false;
  pending = undefined;
  showError(
    event.message || 'The image worker could not start. Serve this page with npm run demo.'
  );
};

function responsiveWidth() {
  if (!$('responsive').checked) return false;
  const width = Math.max(1, Math.min(2048, Math.round($('resultWell').clientWidth)));
  if (Number($('widthNumber').value) === width) return false;
  $('widthNumber').value = String(width);
  $('width').value = String(width);
  return true;
}
function setSource(image, name) {
  loading = false;
  source = image;
  original.width = image.width;
  original.height = image.height;
  original
    .getContext('2d')
    .putImageData(
      new ImageData(new Uint8ClampedArray(image.data), image.width, image.height),
      0,
      0
    );
  $('sourceName').textContent = name;
  $('originalInfo').textContent = `${image.width} × ${image.height}`;
  worker.postMessage({ type: 'source', image });
  responsiveWidth();
  schedule();
}
async function loadFile(file) {
  if (!file) return;
  const id = ++loadId;
  loading = true;
  revision++;
  clearTimeout(timer);
  pending = undefined;
  $('download').disabled = true;
  $('copy').disabled = true;
  $('copyCli').disabled = true;
  $('status').textContent = 'Opening image…';
  try {
    const image = await loadImageData(file);
    if (id !== loadId) return;
    $('photoSample').value = '';
    $('photoCredit').textContent = '';
    setSource(image, file.name);
  } catch (error) {
    if (id === loadId) { loading = false; showError(`Could not open this image. ${error.message}`); }
  }
}
function sample() {
  loadId++;
  $('photoSample').value = 'landscape';
  $('photoCredit').textContent = '';
  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 640;
  const ctx = canvas.getContext('2d');
  const sky = ctx.createLinearGradient(0, 0, 0, 640);
  sky.addColorStop(0, '#777e9e');
  sky.addColorStop(0.55, '#e4ac95');
  sky.addColorStop(1, '#f3d4a5');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 960, 640);
  const sun = ctx.createRadialGradient(653, 211, 12, 653, 211, 130);
  sun.addColorStop(0, '#fff4c6');
  sun.addColorStop(0.65, '#f5cf9b');
  sun.addColorStop(1, '#f1b28e00');
  ctx.fillStyle = sun;
  ctx.fillRect(490, 40, 330, 340);
  ctx.fillStyle = '#fce4b3';
  ctx.beginPath();
  ctx.arc(653, 211, 69, 0, Math.PI * 2);
  ctx.fill();
  const dunes = [
    ['#aa8193', '#cf9e9c', 345, 45, 0.1],
    ['#926878', '#bb817c', 400, 65, 1.5],
    ['#794f67', '#a57375', 468, 75, 3.2],
    ['#3e354f', '#886071', 540, 75, 4.9],
  ];
  for (const [dark, light, base, amplitude, phase] of dunes) {
    const gradient = ctx.createLinearGradient(0, base - amplitude, 260, 640);
    gradient.addColorStop(0, light);
    gradient.addColorStop(1, dark);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(0, 640);
    for (let x = 0; x <= 960; x += 4)
      ctx.lineTo(x, base + Math.sin(x / 260 + phase) * amplitude + Math.cos(x / 133 + phase) * 12);
    ctx.lineTo(960, 640);
    ctx.closePath();
    ctx.fill();
  }
  setSource(ctx.getImageData(0, 0, 960, 640), 'Sample / dusk in the dunes');
}
const sampleCredits = {
  coffee: 'Rachel Michetti / CC0',
  chelsea: 'Stefan van der Walt / CC0',
  astronaut: 'NASA / public domain',
};
$('photoSample').addEventListener('change', async () => {
  const name = $('photoSample').value;
  const selected = $('photoSample').selectedOptions[0];
  if (name === 'landscape') { sample(); return; }
  const id = ++loadId;
  loading = true;
  revision++;
  pending = undefined;
  clearTimeout(timer);
  $('download').disabled = true;
  $('copy').disabled = true;
  $('copyCli').disabled = true;
  $('status').textContent = 'Opening photograph…';
  try {
    const response = await fetch(selected?.dataset.src ?? new URL(`../tests/fixtures/photos/${name}.png`, import.meta.url));
    if (!response.ok) throw new Error('Sample photograph could not be loaded');
    const image = await loadImageData(await response.blob());
    if (id !== loadId) return;
    const credit = selected?.dataset.credit ?? sampleCredits[name];
    $('photoCredit').textContent = credit;
    setSource(image, `${selected?.dataset.name ?? name} / ${credit}`);
  } catch (error) { if (id === loadId) { loading = false; showError(error.message); } }
});
$('imageInput').addEventListener('change', (event) => {
  void loadFile(event.target.files[0]);
});
$('sample').addEventListener('click', sample);
$('resetTones').addEventListener('click', () => {
  $('exposure').value = '0';
  $('contrast').value = '0';
  schedule();
});
$('paletteImageInput').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const id = ++paletteLoadId;
  paletteLoading = true;
  schedule();
  $('status').textContent = 'Opening palette photo…';
  try {
    const image = await loadImageData(file);
    if (id !== paletteLoadId) return;
    worker.postMessage({ type: 'palette-source', image });
    $('paletteSourceName').textContent = file.name;
    paletteLoading = false;
    schedule();
  } catch (error) {
    if (id === paletteLoadId) {
      paletteLoading = false;
      showError(`Could not open the palette image. ${error.message}`);
    }
  }
});
setupAlgorithmControls(schedule);
for (const id of ['algorithm', 'knollStrength', 'knollCandidates', 'palette', 'customPalette', 'step', 'resample', 'paletteColors', 'exposure', 'contrast'])
  $(id).addEventListener('input', schedule);
for (const id of ['width', 'widthNumber'])
  $(id).addEventListener('input', () => {
    $('responsive').checked = false;
    $(id === 'width' ? 'widthNumber' : 'width').value = $(id).value;
    schedule();
  });
$('responsive').addEventListener('change', () => {
  responsiveWidth();
  schedule();
});
new ResizeObserver(() => {
  if (responsiveWidth()) schedule();
}).observe($('resultWell'));
for (const name of ['dragenter', 'dragover'])
  $('dropzone').addEventListener(name, (event) => {
    event.preventDefault();
    $('dropzone').classList.add('dragging');
  });
for (const name of ['dragleave', 'drop'])
  $('dropzone').addEventListener(name, (event) => {
    event.preventDefault();
    $('dropzone').classList.remove('dragging');
  });
$('dropzone').addEventListener('drop', (event) => {
  void loadFile(event.dataTransfer.files[0]);
});
$('download').addEventListener('click', () => {
  const id = revision;
  output.toBlob((blob) => {
    if (!blob || id !== revision) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ditherto-${$('algorithm').value}-${output.width}x${output.height}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
});
$('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(recipe);
    $('copy').textContent = 'Copied';
  } catch {
    $('copy').textContent = 'Select the recipe above to copy';
  }
});
$('copyCli').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(cliRecipe); $('copyCli').textContent = 'Copied'; }
  catch { $('copyCli').textContent = 'Select the command above to copy'; }
});
if (document.body.dataset.initialSample) {
  $('photoSample').value = document.body.dataset.initialSample;
  $('photoSample').dispatchEvent(new Event('change'));
} else sample();
