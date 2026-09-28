import './site-header.js';
import { observeDitherDOM } from './dist/dom.js';
import { themes, cards, paletteFor, applyTheme, selectedTheme } from './themes.js';

const $ = id => document.getElementById(id);
const algorithms = [
  {id:'atkinson', name:'Atkinson', kind:'ERROR DIFFUSION', description:'Airy dots and stronger contrast. Diffuses part of the error, letting highlights and shadows open up.'},
  {id:'floyd-steinberg', name:'Floyd–Steinberg', kind:'ERROR DIFFUSION', description:'Fine, irregular texture. Spreads the error into neighboring pixels to preserve more tonal detail.'},
  {id:'ordered', name:'Ordered / Bayer', kind:'ORDERED DITHERING', description:'A repeating 4 × 4 pattern. Geometric texture with a visibly regular rhythm.'},
  {id:'knoll', name:'Knoll', kind:'ORDERED DITHERING', description:'Builds a mixture of palette colors for each pixel, then arranges it on a 4 × 4 grid. Defaults: 20% strength, 32 candidates.'},
  {id:'nearest', name:'Nearest color', kind:'NO DITHERING', description:'Maps each pixel to its closest palette color. Flat areas and harder transitions: a baseline for the other textures.'},
];
const params = new URLSearchParams(location.search);
for (const card of cards) $('source').add(new Option(card.name, card.id));
$('source').value = cards.find(card => card.id === params.get('card'))?.id ?? cards[1].id;
for (const [key, theme] of Object.entries(themes)) $('colors').add(new Option(`${theme.name} / ${theme.colors.length} colors`, key));
$('colors').value = selectedTheme();
for (const [id, min, max, fallback] of [['exposure',-2,2,0.3],['contrast',0,2,1]]) {
  const value = Number(params.get(id) ?? fallback);
  if (Number.isFinite(value) && value >= min && value <= max) $(id).value = String(id === 'contrast' ? Math.round((value - 1) * 100) : value);
}
for (const [index, algorithm] of algorithms.entries()) {
  const article = document.createElement('article');
  article.innerHTML = `<div class="algorithm-heading"><h2>${algorithm.name}</h2><span>${String(index + 1).padStart(2,'0')}</span></div><div class="photo"><img class="dither" width="768" height="1365" data-algorithm="${algorithm.id}"></div><div class="caption"><span>${algorithm.kind}</span><output class="dimensions"></output></div><p class="algorithm-description">${algorithm.description}</p><a class="algorithm-link">Tune ${algorithm.name} ↗</a>`;
  $('gallery').append(article);
}
const articles = [...$('gallery').children];
let controller;
let worker;
let serial = 0;
let generation = 0;
let renders = 0;
let showingOriginals = false;
const pending = new Map();
const sourceCard = () => cards.find(card => card.id === $('source').value);
const options = () => ({palette:paletteFor($('colors').value), exposure:Number($('exposure').value), contrast:1 + Number($('contrast').value) / 100, resample:'area'});
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
  $('status').textContent = 'Rendering five textures…';
  controller = observeDitherDOM('img.dither', options(), {
    render, onError:report,
    onRender(canvas) {
      canvas.closest('article').querySelector('.dimensions').textContent = `${canvas.width} × ${canvas.height}`;
      $('status').textContent = `${sourceCard().name} · same palette & tone · ${++renders} renders`;
    },
  });
  const results = await controller.ready;
  if (current === generation && results.some(result => result.status === 'rejected')) $('status').textContent = 'Some images could not be processed. Their originals are preserved.';
}
function updateRecipe() {
  const settings = options();
  const card = sourceCard();
  $('exposureValue').textContent = `${settings.exposure > 0 ? '+' : ''}${settings.exposure} EV`;
  $('contrastValue').textContent = `${Number($('contrast').value) > 0 ? '+' : ''}${$('contrast').value}%`;
  const url = new URL(location.href);
  url.searchParams.delete('algorithm');
  for (const [key, value] of Object.entries({card:card.id, exposure:settings.exposure, contrast:settings.contrast})) url.searchParams.set(key,value);
  history.replaceState(history.state,'',url);
  articles.forEach((article,index) => {
    article.querySelector('a').href = `./playground.html?${new URLSearchParams({card:card.id, theme:$('colors').value, algorithm:algorithms[index].id, exposure:settings.exposure, contrast:settings.contrast})}`;
  });
  $('galleryRecipe').textContent = `import { observeDitherDOM } from 'ditherto/dom';\n\n// Give five images the same source, and use CSS to set their display size.\n// <img class="compare" src="${card.file}" data-algorithm="atkinson">\n// Repeat for: floyd-steinberg, ordered, knoll, nearest.\nconst comparison = observeDitherDOM('img.compare', {\n  palette: ${JSON.stringify(settings.palette)},\n  exposure: ${settings.exposure},\n  contrast: ${settings.contrast},\n  resample: 'area'\n});\n\nawait comparison.ready;\n// Each image rerenders from its source when its display size changes.\n// On unmount: comparison.destroy();`;
  $('copyGallery').textContent = 'Copy comparison recipe';
}
function updateSettings() {
  applyTheme($('colors').value);
  updateRecipe();
  for (const handle of controller?.images ?? []) void handle.update(options()).catch(report);
}
function changeSource() {
  dispose();
  const card = sourceCard();
  for (const article of articles) {
    const image = article.querySelector('img');
    image.src = `./tarot/${card.file}`;
    image.alt = `${card.name} — ${algorithms[articles.indexOf(article)].name}`;
    article.querySelector('.dimensions').textContent = showingOriginals ? 'Original' : 'Rendering…';
  }
  updateRecipe();
  if (!showingOriginals) void bind().catch(report);
}
$('source').addEventListener('change', changeSource);
$('colors').addEventListener('change', updateSettings);
for (const id of ['exposure','contrast']) $(id).addEventListener('input', updateSettings);
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
window.addEventListener('pagehide', dispose);
window.addEventListener('pageshow', event => { if (event.persisted && !showingOriginals) void bind().catch(report); });
applyTheme($('colors').value);
changeSource();
