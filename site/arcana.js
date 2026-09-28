import './site-header.js';
import { observeDitherDOM } from './dist/dom.js';
import { cards, themes, paletteFor, applyTheme, selectedTheme } from './themes.js';
const $=id=>document.getElementById(id);
let theme=selectedTheme();
let controller;
let worker;
let serial=0;
let selection=0;
const pending=new Map();
const selectedCard=()=>cards.find(card=>card.id===$('card-select').value);

for(const card of cards){
  const link=document.createElement('a');
  link.className='tarot-link';link.dataset.card=card.id;
  link.innerHTML=`<figure><div class="tarot-frame"><div class="tarot-pixels"><img class="arcana-image" src="./tarot/${card.file}" width="768" height="1365" alt="${card.name} tarot card" data-exposure="0.3"></div></div><figcaption><span class="card-number">${card.number.padStart(2,'0')} / MAJOR ARCANA</span><span class="card-title">${card.name} ↗</span></figcaption></figure>`;
  $('card-grid').append(link);
}
function refreshRecipe(){
  const palette=paletteFor(theme);
  const algorithm=$('texture').value;
  const exposure=Number($('tone').value);
  $('tone-value').textContent=`${exposure>0?'+':''}${exposure} EV`;
  $('palette-chips').replaceChildren(...themes[theme].colors.map(color=>{const el=document.createElement('span');el.style.background=color;el.title=color;return el;}));
  $('palette-name').textContent=`${themes[theme].name.toUpperCase()} / ${themes[theme].colors.length}`;
  $('live-code').textContent=`import { observeDitherDOM } from 'ditherto/dom';\n\nconst images = observeDitherDOM('img.dither', {\n  palette: ${JSON.stringify(palette)},\n  algorithm: '${algorithm}',\n  exposure: ${exposure},\n  resample: 'area'\n});\n\n// Fine-tune a single image.\nawait images.images[0].update({ contrast: 1.1 });\n\n// On unmount: images.destroy();`;
  $('cli-demo').textContent=`$ node dist/cli.js \\\n  site/tarot/${selectedCard().file} \\\n  --palette '${themes[theme].colors.join(',')}' \\\n  --algorithm ${algorithm} --exposure ${exposure} --json`;
  $('copy-code').textContent='Copy recipe';
  for(const link of document.querySelectorAll('.tarot-link, #open-playground')){
    const params=new URLSearchParams({card:link.dataset.card??selectedCard().id,theme,algorithm,exposure});
    link.href=`./playground.html?${params}`;
  }
  for (const link of document.querySelectorAll('a[href^="./algorithms.html"]')) {
    link.href = `./algorithms.html?${new URLSearchParams({theme, card:selectedCard().id, exposure})}`;
  }
}
function report(error){if(error.name!=='AbortError'){$('render-state').textContent='RENDER ERROR';$('hero-dimensions').textContent=error.message;}}
function render(source,options){return new Promise((resolve,reject)=>{
  if(!worker){reject(new Error('Worker unavailable'));return;}
  const id=++serial;pending.set(id,{resolve,reject});
  try{worker.postMessage({id,source,options},[source.data.buffer]);}catch(error){pending.delete(id);reject(error);}
});}
function dispose(){controller?.destroy();controller=null;worker?.terminate();worker=null;for(const job of pending.values())job.reject(new DOMException('Disposed','AbortError'));pending.clear();}
function bind(){
  worker=new Worker(new URL('./examples/responsive-worker.js',import.meta.url),{type:'module'});
  worker.onmessage=({data})=>{const job=pending.get(data.id);if(!job)return;pending.delete(data.id);if(data.error)job.reject(new Error(data.error));else job.resolve(data.result);};
  worker.onerror=event=>{report(new Error(event.message));dispose();};
  controller=observeDitherDOM('img.arcana-image',{palette:paletteFor(theme),algorithm:$('texture').value,resample:'area'}, {
    render,onError:report,onRender(canvas,image){
      canvas.setAttribute('aria-label',image.alt);
      if(image.id==='featured-card'){$('hero-dimensions').textContent=`${canvas.width} × ${canvas.height} / ${themes[theme].colors.length} COLORS`;$('render-state').textContent='LIVE / RESIZE TO RENDER';}
    },
  });
  // Preserve current controls when returning through the browser's page cache.
  for(const handle of controller.images)void handle.update({exposure:Number($('tone').value)}).catch(report);
}
function updateImages(){
  refreshRecipe();
  $('render-state').textContent='RENDERING';
  for(const handle of controller?.images??[])void handle.update({palette:paletteFor(theme),algorithm:$('texture').value,exposure:Number($('tone').value)}).catch(report);
}
for(const button of document.querySelectorAll('.theme-picker button'))button.addEventListener('click',()=>{
  theme=button.dataset.theme;applyTheme(theme);
  for(const other of document.querySelectorAll('.theme-picker button'))other.setAttribute('aria-pressed',String(other===button));
  updateImages();
});
$('texture').addEventListener('change',updateImages);
$('tone').addEventListener('input',updateImages);
$('card-select').addEventListener('change',async()=>{
  const revision=++selection;
  const card=selectedCard();const handle=controller?.images[0];if(!handle)return;
  handle.image.src=`./tarot/${card.file}`;handle.image.alt=`${card.name} tarot card`;
  $('original-overlay').src=handle.image.src;$('original-overlay').alt=`Original ${card.name} artwork`;
  $('card-name').textContent=card.name.toUpperCase();$('render-state').textContent='OPENING ORIGINAL';
  refreshRecipe();
  try{await handle.refresh();if(revision===selection)$('render-state').textContent='LIVE / RESIZE TO RENDER';}catch(error){report(error);}
});
$('show-original').addEventListener('click',()=>{
  const show=$('show-original').getAttribute('aria-pressed')!=='true';
  $('original-overlay').hidden=!show;$('show-original').setAttribute('aria-pressed',String(show));$('show-original').textContent=show?'Show dithered':'Show original';
});
$('copy-code').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('live-code').textContent);$('copy-code').textContent='Copied';}catch{$('copy-code').textContent='Select code to copy';}});
window.addEventListener('pagehide',dispose);
window.addEventListener('pageshow',event=>{if(event.persisted)bind();});
applyTheme(theme);
for(const button of document.querySelectorAll('.theme-picker button'))button.setAttribute('aria-pressed',String(button.dataset.theme===theme));
refreshRecipe();bind();
