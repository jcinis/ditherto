import './site-header.js';
import { observeDitherDOM, algorithms } from './dist/dom.js';
import { cards, themes, paletteFor, applyTheme, selectedTheme } from './themes.js';
const $=id=>document.getElementById(id);
let theme=selectedTheme();
let controller;
let worker;
let serial=0;
let selection=0;
const pending=new Map();
let selectedCardId='02-the-high-pristess';
const selectedCard=()=>cards.find(card=>card.id===selectedCardId);

const installTabs=[...document.querySelectorAll('.install-tabs [role="tab"]')];
function selectPackageManager(tab){
  for(const other of installTabs){
    other.setAttribute('aria-selected',String(other===tab));
    other.tabIndex=other===tab?0:-1;
  }
  $('install-command').setAttribute('aria-labelledby',tab.id);
  $('install-command').querySelector('code').textContent=tab.dataset.command;
}
for(const [index,tab] of installTabs.entries()){
  tab.addEventListener('click',()=>selectPackageManager(tab));
  tab.addEventListener('keydown',event=>{
    const next={ArrowRight:(index+1)%installTabs.length,ArrowLeft:(index+installTabs.length-1)%installTabs.length,Home:0,End:installTabs.length-1}[event.key];
    if(next===undefined)return;
    event.preventDefault();
    selectPackageManager(installTabs[next]);
    installTabs[next].focus();
  });
}

for(const card of cards){
  const button=document.createElement('button');
  button.type='button';button.className='tarot-thumbnail';button.dataset.card=card.id;
  button.setAttribute('aria-label',`Preview ${card.name}`);
  button.setAttribute('aria-pressed',String(card.id===selectedCardId));
  button.innerHTML=`<span class="tarot-pixels"><img class="arcana-image" src="./tarot/${card.file}" width="768" height="1365" alt="" data-exposure="0.3"></span><span class="card-title">${card.name}</span>`;
  button.addEventListener('click',()=>selectCard(card.id));
  $('card-grid').append(button);
}
function refreshRecipe(){
  const palette=paletteFor(theme);
  const algorithm=$('algorithm').value;
  const exposure=Number($('tone').value);
  const step=Number($('step').value);
  $('step-value').textContent=`${step} × ${step}`;
  $('step').setAttribute('aria-valuetext',`${step} by ${step} pixels`);
  $('tone-value').textContent=`${exposure>0?'+':''}${exposure} EV`;
  $('palette-chips').replaceChildren(...themes[theme].colors.map(color=>{const el=document.createElement('span');el.style.background=color;el.title=color;return el;}));
  $('palette-name').textContent=`${themes[theme].name.toUpperCase()} / ${themes[theme].colors.length}`;
  const blueImport = algorithm.endsWith('-blue-noise') ? "import { registerBlueNoise } from 'ditherto/blue-noise';\nregisterBlueNoise(algorithms);\n" : '';
  $('live-code').textContent=`import { observeDitherDOM${blueImport ? ', algorithms' : ''} } from 'ditherto/dom';\n${blueImport}\nconst images = observeDitherDOM('img.dither', {\n  palette: ${JSON.stringify(palette)},\n  algorithm: '${algorithm}',\n  exposure: ${exposure},\n  step: ${step},\n  resample: 'area'\n});\n\n// On unmount: images.destroy();`;
  $('cli-demo').textContent=`npx ditherto photo.jpg -o photo.png \\\n  --palette '${themes[theme].colors.join(',')}' \\\n  --algorithm ${algorithm} \\\n  --exposure ${exposure} --step ${step}`;
  $('copy-code').textContent='Copy code';
  const params=new URLSearchParams({card:selectedCard().id,theme,algorithm,exposure,step});
  $('open-playground').href=`./playground.html?${params}`;
  for (const link of document.querySelectorAll('a[href^="./algorithms.html"]')) {
    link.href = `./algorithms.html?${new URLSearchParams({theme, card:selectedCard().id, exposure, step})}`;
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
  controller=observeDitherDOM('img.arcana-image',{palette:paletteFor(theme),algorithm:$('algorithm').value,step:Number($('step').value),resample:'area'}, {
    render,onError:report,onRender(canvas,image){
      canvas.setAttribute('aria-label',image.alt);
      if(image.id==='featured-card'){$('hero-dimensions').textContent=`${canvas.width} × ${canvas.height} / ${themes[theme].colors.length} COLORS`;$('render-state').textContent='LIVE / RESIZE TO RENDER';}
    },
  });
  // Preserve current controls when returning through the browser's page cache.
  for(const handle of controller.images)void handle.update({exposure:Number($('tone').value),step:Number($('step').value)}).catch(report);
}
let updateRevision = 0;
async function updateImages(){
  const revision = ++updateRevision;
  if ($('algorithm').value.endsWith('-blue-noise') && !algorithms.get($('algorithm').value)) {
    try { const { registerBlueNoise } = await import('./dist/blue-noise.js'); registerBlueNoise(algorithms); }
    catch (error) { if (revision === updateRevision) report(error); return; }
  }
  if (revision !== updateRevision) return;
  refreshRecipe();
  $('render-state').textContent='RENDERING';
  for(const handle of controller?.images??[])void handle.update({palette:paletteFor(theme),algorithm:$('algorithm').value,exposure:Number($('tone').value),step:Number($('step').value)}).catch(report);
}
for(const button of document.querySelectorAll('.theme-picker button'))button.addEventListener('click',()=>{
  theme=button.dataset.theme;applyTheme(theme);
  for(const other of document.querySelectorAll('.theme-picker button'))other.setAttribute('aria-pressed',String(other===button));
  updateImages();
});
$('algorithm').addEventListener('change',updateImages);
$('tone').addEventListener('input',updateImages);
$('step').addEventListener('input',updateImages);
async function selectCard(id){
  selectedCardId=id;
  for(const button of document.querySelectorAll('.tarot-thumbnail'))button.setAttribute('aria-pressed',String(button.dataset.card===id));
  const revision=++selection;
  const card=selectedCard();const handle=controller?.images.find(handle=>handle.image.id==='featured-card');if(!handle)return;
  handle.image.src=`./tarot/${card.file}`;handle.image.alt=`${card.name} tarot card`;
  $('original-overlay').src=handle.image.src;$('original-overlay').alt=`Original ${card.name} artwork`;
  $('card-name').textContent=card.name.toUpperCase();$('render-state').textContent='OPENING ORIGINAL';
  refreshRecipe();
  try{await handle.refresh();if(revision===selection)$('render-state').textContent='LIVE / RESIZE TO RENDER';}catch(error){report(error);}
}
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
