const $ = (id) => document.getElementById(id);
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
let source;
let generation = 0;
let loading = 0;
let timer;
let busy = false;
let pending;

function dispatch(job) {
  busy = true;
  worker.postMessage(job);
}

function draw(id, pixels) {
  const canvas = $(id);
  canvas.width = pixels.width;
  canvas.height = pixels.height;
  canvas.getContext('2d').putImageData(new ImageData(pixels.data, pixels.width, pixels.height), 0, 0);
}

function render() {
  if (!source) return;
  $('status').textContent = 'Rendering comparison…';
  const job = {
    id: ++generation, source, width: Number($('width').value),
    palette: $('palette').value, strength: Number($('strength').value) / 100,
    candidates: Number($('candidates').value),
  };
  if (busy) pending = job;
  else dispatch(job);
}

worker.onmessage = ({ data }) => {
  busy = false;
  if (pending) {
    const job = pending;
    pending = undefined;
    dispatch(job);
  }
  if (data.id !== generation) return;
  if (data.error) { $('status').textContent = data.error; return; }
  draw('original', data.original);
  draw('ordered', data.ordered);
  draw('knoll', data.knoll);
  $('orderedTime').textContent = `${data.orderedMs.toFixed(1)} ms`;
  $('knollTime').textContent = `${data.knollMs.toFixed(1)} ms`;
  $('dimensions').textContent = `${data.original.width} × ${data.original.height}`;
  $('swatches').replaceChildren(...data.palette.map((color) => {
    const swatch = document.createElement('span');
    swatch.style.background = `rgb(${color.join(',')})`;
    swatch.title = color.join(', ');
    return swatch;
  }));
  $('status').textContent = `${data.palette.length} palette colors · ${data.candidates} candidates · ${Math.round(data.strength * 100)}% strength`;
};
worker.onerror = () => {
  busy = false;
  pending = undefined;
  $('status').textContent = 'Worker failed. Run npm run build, then reload this page.';
};

async function load(blob, id = ++loading) {
  if (id !== loading) return;
  source = undefined;
  pending = undefined;
  ++generation;
  $('status').textContent = 'Loading photograph…';
  try {
    const bitmap = await createImageBitmap(blob);
    if (id !== loading) { bitmap.close(); return; }
    const canvas = document.createElement('canvas');
    // Keep prototype uploads bounded before sending them to the worker.
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    source = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    render();
  } catch (error) {
    if (id === loading) $('status').textContent = `Could not load image: ${error.message}`;
  }
}

async function loadPhoto() {
  const id = ++loading;
  ++generation;
  source = undefined;
  pending = undefined;
  $('status').textContent = 'Loading photograph…';
  try {
    const response = await fetch(`../../tests/fixtures/photos/${$('photo').value}.png`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await load(await response.blob(), id);
  } catch (error) { if (id === loading) $('status').textContent = `Could not load photograph: ${error.message}`; }
}
$('photo').onchange = loadPhoto;
$('upload').onchange = () => { if ($('upload').files[0]) load($('upload').files[0]); };
for (const id of ['palette', 'candidates', 'width']) $(id).onchange = render;
$('strength').oninput = () => {
  $('strengthValue').textContent = `${$('strength').value}%`;
  ++generation;
  clearTimeout(timer);
  timer = setTimeout(render, 120);
};
await loadPhoto();
