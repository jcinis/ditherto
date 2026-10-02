import './site-header.js';
import { observeDitherDOM } from './dist/dom.js';
import { applyTheme, selectedTheme, paletteFor } from './themes.js';

const $ = id => document.getElementById(id);
const sources = {
  magician: {url:'./tarot/01-the-magician.webp', width:768, height:1365, name:'The Magician', credit:'Tarot artwork from the dither·to collection.'},
  coffee: {url:'./tests/fixtures/photos/coffee.png', width:600, height:400, name:'Coffee', credit:'Coffee photograph: Rachel Michetti / CC0.'},
  astronaut: {url:'./tests/fixtures/photos/astronaut.png', width:512, height:512, name:'NASA portrait', credit:'Eileen Collins portrait: NASA / public domain.'},
};
const params = new URLSearchParams(location.search);
if (Object.hasOwn(sources, params.get('image'))) $('whySource').value = params.get('image');
const requestedWidth = Number(params.get('width'));
if (params.has('width') && Number.isInteger(requestedWidth) && requestedWidth >= 35 && requestedWidth <= 100) $('comparisonWidth').value = String(requestedWidth);
let theme = selectedTheme();
let controller;
let worker;
let serial = 0;
let renders = 0;
let ready = false;
const pending = new Map();
const currentSource = () => sources[$('whySource').value];
const options = () => ({algorithm:'atkinson', palette:paletteFor(theme), exposure:0.3, resample:'area'});
function report(error) {
  if (error.name !== 'AbortError') { ready = false; $('whyStatus').textContent = `Could not render the comparison: ${error.message}`; }
}
function updateMeasurements() {
  const shown = $('exportWell').clientWidth;
  $('originalMeasure').textContent = `${currentSource().width} px source → ${$('originalWell').clientWidth} px shown`;
  $('exportMeasure').textContent = `320 px export → ${shown} px shown (${Math.round(shown / 320 * 100)}%)`;
  if (ready) $('whyStatus').textContent = `Live image rebuilt ${renders === 1 ? 'once' : `${renders} times`} · fixed export unchanged by resizing.`;
}
function updateURL() {
  const url = new URL(location.href);
  url.searchParams.set('image', $('whySource').value);
  url.searchParams.set('width', $('comparisonWidth').value);
  history.replaceState(history.state, '', url);
  $('whyPlayground').href = `./playground.html?${new URLSearchParams({theme, algorithm:'atkinson', exposure:0.3})}`;
}
function updateWidth() {
  $('triptych').style.width = `${$('comparisonWidth').value}%`;
  $('widthValue').textContent = `${$('comparisonWidth').value}%`;
  updateURL();
}
function updateExport() {
  ready = false;
  $('whyStatus').textContent = 'Preparing the comparison…';
  $('whyExport').src = `./assets/why/${$('whySource').value}-${theme}.png`;
  $('whyExport').alt = `${currentSource().name}, pre-dithered at 320 pixels and scaled by the browser`;
}
function dispose() {
  ready = false;
  controller?.destroy();
  controller = undefined;
  worker?.terminate();
  worker = undefined;
  for (const job of pending.values()) job.reject(new DOMException('Renderer disposed', 'AbortError'));
  pending.clear();
}
function render(source, settings) {
  return new Promise((resolve, reject) => {
    if (!worker) { reject(new Error('Worker unavailable')); return; }
    const id = ++serial;
    pending.set(id, {resolve, reject});
    try { worker.postMessage({id, source, options:settings}, [source.data.buffer]); }
    catch (error) { pending.delete(id); reject(error); }
  });
}
function bind() {
  worker = new Worker(new URL('./examples/responsive-worker.js', import.meta.url), {type:'module'});
  worker.onmessage = ({data}) => {
    const job = pending.get(data.id);
    if (!job) return;
    pending.delete(data.id);
    if (data.error) job.reject(new Error(data.error)); else job.resolve(data.result);
  };
  worker.onerror = event => {
    const error = new Error(event.message || 'Image worker failed');
    dispose();
    report(error);
  };
  controller = observeDitherDOM('#whyLive', options(), {
    render, onError:report,
    onRender(canvas) {
      ready = true;
      renders++;
      $('liveMeasure').textContent = `${canvas.width} px render → ${$('liveWell').clientWidth} px shown`;
      updateMeasurements();
    },
  });
}
function changeSource() {
  dispose();
  renders = 0;
  const source = currentSource();
  for (const id of ['whyOriginal','whyLive']) {
    const image = $(id);
    image.src = source.url;
    image.width = source.width;
    image.height = source.height;
    image.alt = `${source.name}${id === 'whyLive' ? ', dithered at the current display width' : ', original image'}`;
  }
  $('whyExport').height = Math.round(320 * source.height / source.width);
  $('imageCredit').textContent = source.credit;
  $('liveMeasure').textContent = 'Preparing pixels…';
  updateExport();
  updateURL();
  updateMeasurements();
  bind();
}
$('whySource').addEventListener('change', changeSource);
$('comparisonWidth').addEventListener('input', updateWidth);
$('resetWidth').addEventListener('click', () => { $('comparisonWidth').value = '100'; updateWidth(); });
$('pixelatedExport').addEventListener('change', () => $('whyExport').classList.toggle('pixelated', $('pixelatedExport').checked));
$('whyExport').addEventListener('error', () => report(new Error('The fixed PNG could not be loaded.')));
for (const button of document.querySelectorAll('.theme-picker button')) button.addEventListener('click', () => {
  theme = button.dataset.theme;
  applyTheme(theme);
  updateExport();
  updateURL();
  for (const handle of controller?.images ?? []) void handle.update(options()).catch(report);
});
const resizeObserver = new ResizeObserver(updateMeasurements);
resizeObserver.observe($('triptych'));
window.addEventListener('pagehide', () => { resizeObserver.disconnect(); dispose(); });
window.addEventListener('pageshow', event => { if (event.persisted) { resizeObserver.observe($('triptych')); bind(); } });
applyTheme(theme);
updateWidth();
changeSource();
