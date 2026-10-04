import './site-header.js';
import { observeDitherDOM, algorithms as registry } from './dist/dom.js';
import { themes, imageSources, paletteFor, applyTheme, selectedTheme } from './themes.js';

import { registerBlueNoise } from './dist/blue-noise.js';
registerBlueNoise(registry);

const $ = id => document.getElementById(id);
const algorithms = [
  {id:'atkinson', name:'Atkinson', kind:'ERROR DIFFUSION', description:'Airy dots and stronger contrast. Diffuses part of the error, letting highlights and shadows open up.'},
  {id:'floyd-steinberg', name:'Floyd–Steinberg', kind:'ERROR DIFFUSION', description:'Fine, irregular texture. Spreads the error into neighboring pixels to preserve more tonal detail.'},
  {id:'ordered', name:'Ordered / Bayer', kind:'ORDERED DITHERING', description:'A repeating Bayer pattern. Choose its matrix size above for a finer or broader geometric rhythm.'},
  {id:'knoll', name:'Knoll', kind:'ORDERED DITHERING', description:'Builds a mixture of palette colors for each pixel, then arranges it on the selected Bayer grid. Defaults: 20% strength, 32 candidates.'},
  {id:'sierra-lite', name:'Sierra Lite', kind:'ERROR DIFFUSION', description:'Three-neighbor error diffusion. A compact, fast texture with directional character.'},
  {id:'stucki', name:'Stucki', kind:'ERROR DIFFUSION', description:'A wider twelve-neighbor spread for fine, even texture.'},
  {id:'halftone', name:'Halftone', kind:'CLUSTERED DOTS', description:'Cell-averaged dots. Uses the darkest and lightest colors from the shared palette.'},
  {id:'riemersma', name:'Riemersma', kind:'HILBERT DIFFUSION', description:'Follows a Hilbert curve, retaining a decaying history of recent pixel errors.'},
  {id:'ordered-blue-noise', name:'Ordered / blue noise', kind:'ORDERED DITHERING', description:'A fixed 64 × 64 blue-noise mask for less regular texture.'},
  {id:'knoll-blue-noise', name:'Knoll / blue noise', kind:'ORDERED DITHERING', description:'Knoll color mixtures selected through a blue-noise mask. Defaults to 20% strength.'},
  {id:'nearest', name:'Nearest color', kind:'NO DITHERING', description:'Maps each pixel to its closest palette color. Flat areas and harder transitions: a baseline for the other textures.'},
];
const params = new URLSearchParams(location.search);
for (const source of imageSources) $('source').add(new Option(source.name, source.id));
$('source').value = imageSources.find(source => source.id === params.get('card'))?.id ?? 'astronaut';
for (const [key, theme] of Object.entries(themes)) $('colors').add(new Option(`${theme.name} / ${theme.colors.length} colors`, key));
$('colors').value = selectedTheme();
for (const id of ['bayerSize','candidates','cellSize','history','step']) {
  if ([...$(id).options].some(option => option.value === params.get(id))) $(id).value = params.get(id);
}
if (params.has('strength') && Number.isFinite(Number(params.get('strength'))) && Number(params.get('strength')) >= 0 && Number(params.get('strength')) <= 100) $('strength').value = params.get('strength');
$('serpentine').checked = params.get('serpentine') === 'true';
for (const [id, min, max, fallback] of [['exposure',-2,2,0.3],['contrast',0,2,1]]) {
  const value = Number(params.get(id) ?? fallback);
  if (Number.isFinite(value) && value >= min && value <= max) $(id).value = String(id === 'contrast' ? Math.round((value - 1) * 100) : value);
}
for (const [index, algorithm] of algorithms.entries()) {
  const article = document.createElement('article');
  article.innerHTML = `<div class="algorithm-heading"><h2>${algorithm.name}</h2><span>${String(index + 1).padStart(2,'0')}</span></div><button type="button" class="photo" aria-label="Inspect ${algorithm.name}"><img class="dither" width="768" height="1365" data-algorithm="${algorithm.id}"></button><div class="caption"><span>${algorithm.kind}</span><output class="dimensions"></output></div><p class="algorithm-description">${algorithm.description}</p><a class="algorithm-link">Tune ${algorithm.name} ↗</a>`;
  article.querySelector('.photo').addEventListener('click', () => inspect(article, algorithm));
  $('gallery').append(article);
}
const articles = [...$('gallery').children];
let controller;
let worker;
let serial = 0;
let generation = 0;
let renders = 0;
let showingOriginals = false;
let uploadUrl;
let uploadName;
let detailUrl;
let detailRevision = 0;
const pending = new Map();
const selectedSource = () => imageSources.find(source => source.id === $('source').value);
const sourceName = () => uploadName ?? selectedSource().name;
const familySettings = () => Object.fromEntries(['bayerSize','candidates','cellSize','history','strength','step'].map(id => [id, Number($(id).value)]).concat([['serpentine', $('serpentine').checked]]));
function algorithmOptions(name) {
  const values = familySettings();
  if (['atkinson','floyd-steinberg','sierra-lite','stucki'].includes(name)) return {serpentine:values.serpentine};
  if (name === 'halftone') return {cellSize:values.cellSize};
  if (name === 'riemersma') return {history:values.history};
  const result = {};
  if (['ordered','knoll'].includes(name)) result.bayerSize = values.bayerSize;
  if (['knoll','knoll-blue-noise'].includes(name)) Object.assign(result, {strength:values.strength / 100, candidates:values.candidates});
  return result;
}
const options = () => ({palette:paletteFor($('colors').value), exposure:Number($('exposure').value), contrast:1 + Number($('contrast').value) / 100, resample:'area', step:Number($('step').value)});
function report(error) {
  if (error.name !== 'AbortError') $('status').textContent = error.message;
}
function dispose() {
  generation++;
  controller?.destroy();
  controller = null;
  worker?.terminate();
  worker = null;
  for (const job of pending.values()) job.reject(new DOMException('Renderer disposed', 'AbortError'));
  pending.clear();
}
function render(source, options) {
  return new Promise((resolve, reject) => {
    if (!worker) { reject(new Error('Worker unavailable')); return; }
    const id = ++serial;
    pending.set(id, {resolve, reject});
    try { worker.postMessage({id, source, options}, [source.data.buffer]); }
    catch (error) { pending.delete(id); reject(error); }
  });
}
async function bind() {
  const current = ++generation;
  renders = 0;
  worker = new Worker(new URL('./examples/responsive-worker.js', import.meta.url), {type:'module'});
  worker.onmessage = ({data}) => {
    const job = pending.get(data.id);
    if (!job) return;
    pending.delete(data.id);
    if (data.error) job.reject(new Error(data.error)); else job.resolve(data.result);
  };
  worker.onerror = event => {
    const error = new Error(`Worker failed: ${event.message}`);
    for (const job of pending.values()) job.reject(error);
    pending.clear();
    worker?.terminate();
    worker = null;
    report(error);
  };
  $('status').textContent = 'Rendering eleven textures…';
  for (const [index, article] of articles.entries()) article.querySelector('img').dataset.algorithmOptions = JSON.stringify(algorithmOptions(algorithms[index].id));
  controller = observeDitherDOM('img.dither', options(), {
    render, onError:report,
    onRender(canvas) {
      canvas.style.height = '100%';
      canvas.closest('article').querySelector('.dimensions').textContent = `${canvas.width} × ${canvas.height}`;
      $('status').textContent = `${sourceName()} · same palette & tone · ${++renders} renders`;
    },
  });
  const results = await controller.ready;
  if (current === generation && results.some(result => result.status === 'rejected')) $('status').textContent = 'Some images could not be processed. Their originals are preserved.';
}
function updateRecipe() {
  const settings = options();
  const source = selectedSource();
  $('strengthValue').textContent = `${$('strength').value}%`;
  $('halftoneNote').textContent = settings.palette.length > 2 ? 'Halftone uses the darkest and lightest colors; the other palette colors are ignored.' : 'Halftone uses both palette colors.';
  $('swatches').replaceChildren(...settings.palette.map(color => { const chip = document.createElement('span'); chip.style.background = `rgb(${color.join(',')})`; chip.title = `RGB ${color.join(', ')}`; return chip; }));
  $('exposureValue').textContent = `${settings.exposure > 0 ? '+' : ''}${settings.exposure} EV`;
  $('contrastValue').textContent = `${Number($('contrast').value) > 0 ? '+' : ''}${$('contrast').value}%`;
  const url = new URL(location.href);
  url.searchParams.delete('algorithm');
  for (const [key, value] of Object.entries({card:source.id, exposure:settings.exposure, contrast:settings.contrast, ...familySettings()})) url.searchParams.set(key,value);
  history.replaceState(history.state,'',url);
  articles.forEach((article,index) => {
    article.querySelector('a').href = `./playground.html?${new URLSearchParams({card:source.id, theme:$('colors').value, algorithm:algorithms[index].id, exposure:settings.exposure, contrast:settings.contrast, ...familySettings()})}`;
    article.querySelector('a').hidden = Boolean(uploadUrl);
  });
  const examples = algorithms.map(algorithm => `// <img class="compare" src="${uploadUrl ? 'your-image.png' : source.src}" data-algorithm="${algorithm.id}" data-algorithm-options='${JSON.stringify(algorithmOptions(algorithm.id))}'>`).join('\n');
  $('galleryRecipe').textContent = `import { observeDitherDOM, algorithms } from 'ditherto/dom';\nimport { registerBlueNoise } from 'ditherto/blue-noise';\nregisterBlueNoise(algorithms);\n\n// Give the images a shared source. CSS controls their display size.\n${examples}\nconst comparison = observeDitherDOM('img.compare', {\n  palette: ${JSON.stringify(settings.palette)},\n  exposure: ${settings.exposure},\n  contrast: ${settings.contrast},\n  step: ${settings.step},\n  resample: 'area'\n});\n\nawait comparison.ready;\n// On unmount: comparison.destroy();`;
  $('copyGallery').textContent = 'Copy comparison recipe';
}
function updateSettings() {
  applyTheme($('colors').value);
  updateRecipe();
  for (const handle of controller?.images ?? []) void handle.update({...options(), algorithmOptions:algorithmOptions(handle.image.dataset.algorithm)}).catch(report);
}
function changeSource() {
  dispose();
  const source = selectedSource();
  for (const article of articles) {
    const image = article.querySelector('img');
    image.src = uploadUrl ?? source.src;
    image.width = source.width;
    image.height = source.height;
    image.alt = `${sourceName()} — ${algorithms[articles.indexOf(article)].name}`;
    article.querySelector('.dimensions').textContent = showingOriginals ? 'Original' : 'Rendering…';
  }
  updateRecipe();
  if (!showingOriginals) void bind().catch(report);
}
$('source').addEventListener('change', () => {
  if (uploadUrl) URL.revokeObjectURL(uploadUrl);
  uploadUrl = undefined;
  uploadName = undefined;
  $('upload').value = '';
  $('sourceNote').textContent = 'Images stay in your browser. All cards start from the same original.';
  changeSource();
});
$('upload').addEventListener('change', () => {
  const file = $('upload').files[0];
  if (!file) return;
  if (uploadUrl) URL.revokeObjectURL(uploadUrl);
  uploadUrl = URL.createObjectURL(file);
  uploadName = file.name;
  $('sourceNote').textContent = `${file.name} · local to this page. To tune a single result, upload this image in the playground.`;
  changeSource();
});
$('colors').addEventListener('change', updateSettings);
for (const id of ['exposure','contrast','bayerSize','candidates','cellSize','history','step','strength','serpentine']) $(id).addEventListener('input', updateSettings);
for (const button of document.querySelectorAll('.theme-picker button')) button.addEventListener('click', () => {
  $('colors').value = button.dataset.theme;
  updateSettings();
});
$('galleryWidth').addEventListener('input', event => {
  $('gallery').style.width = `${event.target.value}%`;
  $('widthLabel').textContent = `${event.target.value}%`;
});
$('toggle').addEventListener('click', () => {
  showingOriginals = !showingOriginals;
  $('toggle').setAttribute('aria-pressed', String(showingOriginals));
  $('toggle').textContent = showingOriginals ? 'Show algorithms' : 'Show originals';
  if (showingOriginals) {
    dispose();
    $('status').textContent = 'Original image. Your comparison settings are kept.';
    for (const article of articles) article.querySelector('.dimensions').textContent = 'Original';
  } else void bind().catch(report);
});
$('copyGallery').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('galleryRecipe').textContent); $('copyGallery').textContent = 'Copied'; }
  catch { $('copyGallery').textContent = 'Select the recipe above to copy'; }
});
function scaleDetail() {
  const canvas = $('detailCanvas');
  canvas.style.width = `${canvas.width * Number($('detailScale').value)}px`;
  canvas.style.height = `${canvas.height * Number($('detailScale').value)}px`;
}
function inspect(article, algorithm) {
  const source = article.querySelector('canvas') ?? article.querySelector('img');
  if (source instanceof HTMLImageElement && (!source.complete || !source.naturalWidth)) return;
  const revision = ++detailRevision;
  const canvas = $('detailCanvas');
  canvas.width = source instanceof HTMLCanvasElement ? source.width : source.naturalWidth;
  canvas.height = source instanceof HTMLCanvasElement ? source.height : source.naturalHeight;
  canvas.getContext('2d').drawImage(source, 0, 0);
  $('detailTitle').textContent = `${showingOriginals ? 'Original' : algorithm.name} · ${canvas.width} × ${canvas.height}`;
  scaleDetail();
  if (detailUrl) URL.revokeObjectURL(detailUrl);
  $('downloadDetail').removeAttribute('href');
  $('downloadDetail').textContent = 'Preparing PNG…';
  canvas.toBlob(blob => {
    if (!blob || revision !== detailRevision) return;
    detailUrl = URL.createObjectURL(blob);
    $('downloadDetail').href = detailUrl;
    $('downloadDetail').download = `ditherto-${showingOriginals ? 'original' : algorithm.id}.png`;
    $('downloadDetail').textContent = 'Download PNG';
  });
  $('detail').showModal();
}
$('closeDetail').addEventListener('click', () => $('detail').close());
$('detailScale').addEventListener('change', scaleDetail);
$('detail').addEventListener('close', () => { ++detailRevision; if (detailUrl) URL.revokeObjectURL(detailUrl); detailUrl = undefined; });
window.addEventListener('pagehide', dispose);
window.addEventListener('pageshow', event => { if (event.persisted && !showingOriginals) void bind().catch(report); });
applyTheme($('colors').value);
changeSource();
