const $ = id => document.getElementById(id);
const descriptions = {
  original:['Original','Shared area resize. All treatments start from these pixels.'],
  nearest:['Nearest','Hard palette mapping. Also the result of Knoll at 0% strength.'],
  atkinson:['Atkinson','The existing baseline; distributes ¾ of each pixel’s error.'],
  'floyd-steinberg':['Floyd–Steinberg','The existing baseline; compact four-neighbor diffusion.'],
  'sierra-lite':['Sierra Lite','Three-neighbor diffusion: a small, fast alternative.'],
  stucki:['Stucki','A wider twelve-neighbor spread for fine, even texture.'],
  'ordered-bayer':['Ordered · Bayer','Regular dispersed-dot structure, with a selectable matrix size.'],
  'ordered-blue':['Ordered · blue noise','The same palette mapping, with a less regular threshold texture.'],
  'knoll-bayer':['Knoll · Bayer','Local candidate mixing; 20% strength is our current default.'],
  'knoll-blue':['Knoll · blue noise','The same Knoll candidates, selected with a blue-noise threshold.'],
  halftone:['Halftone','Cell-averaged, clustered dots. Uses the darkest and lightest colors only.'],
  riemersma:['Riemersma','Follows a Hilbert curve with a decaying queue of recent errors.'],
};
for (const [id,[title,description]] of Object.entries(descriptions)) {
  const article=document.createElement('article');article.className='card';
  article.innerHTML=`<header><h2>${title}</h2><span class="time" id="${id}-time">—</span></header><button class="image" disabled aria-label="Inspect ${title}"><canvas id="${id}"></canvas></button><p>${description}</p>`;
  article.querySelector('button').onclick=()=>inspect(id);
  $('gallery').append(article);
}
const worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
let source, generation=0, loading=0, busy=false, pending, timer, downloadUrl;
const numeric=['width','step','bayerSize','candidates','cellSize','history'];
function dispatch(job){busy=true;worker.postMessage(job);}
function render(){
  if(!source) return;
  $('status').textContent='Rendering comparison…';
  const job={id:++generation,source,palette:$('palette').value,strength:Number($('strength').value)/100,serpentine:$('serpentine').checked};
  for(const id of numeric) job[id]=Number($(id).value);
  if(busy) pending=job;else dispatch(job);
}
function draw(canvas,pixels){canvas.width=pixels.width;canvas.height=pixels.height;canvas.getContext('2d').putImageData(new ImageData(pixels.data,pixels.width,pixels.height),0,0);}
function scaleCards(){for(const id of Object.keys(descriptions)){const canvas=$(id);const scale=$('zoom').value;canvas.style.width=scale==='fit'?'100%':`${canvas.width*Number(scale)}px`;canvas.style.height=scale==='fit'?'100%':`${canvas.height*Number(scale)}px`;}}
worker.onmessage=({data})=>{
  busy=false;if(pending){const job=pending;pending=undefined;dispatch(job);}
  if(data.id!==generation)return;
  if(data.error){$('status').textContent=`Render failed: ${data.error}`;return;}
  for(const [id,result] of Object.entries(data.results)){draw($(id),result.pixels);$(`${id}-time`).textContent=id==='original'?`${result.pixels.width} × ${result.pixels.height}`:`${result.ms.toFixed(1)} ms`;}
  document.querySelectorAll('.image').forEach(button=>{button.disabled=false;});
  scaleCards();
  $('swatches').replaceChildren(...data.palette.map(color=>{const el=document.createElement('span');el.style.background=`rgb(${color.join(',')})`;el.title=color.join(', ');return el;}));
  $('status').textContent=`Ready · 11 treatments · ${data.palette.length} colors · Knoll ${$('strength').value}% · ${$('serpentine').checked?'serpentine':'raster'} diffusion`;
};
worker.onerror=()=>{busy=false;pending=undefined;$('status').textContent='Worker failed. Run npm run build and serve the repository root, then reload.';};
function inspect(id){
  const sourceCanvas=$(id);if(!sourceCanvas.width)return;
  $('detailTitle').textContent=descriptions[id][0];
  const canvas=$('detailCanvas');canvas.width=sourceCanvas.width;canvas.height=sourceCanvas.height;canvas.getContext('2d').drawImage(sourceCanvas,0,0);canvas.style.width=`${canvas.width*2}px`;canvas.style.height=`${canvas.height*2}px`;
  if(downloadUrl) URL.revokeObjectURL(downloadUrl);
  $('download').removeAttribute('href');$('download').download=`ditherto-${id}.png`;
  canvas.toBlob(blob=>{if(blob){downloadUrl=URL.createObjectURL(blob);$('download').href=downloadUrl;}});
  $('detail').showModal();
}
$('close').onclick=()=>$('detail').close();
$('zoom').onchange=scaleCards;
function invalidate(){source=undefined;pending=undefined;++generation;$('status').textContent='Loading image…';}
async function load(blob,id){
  const bitmap=await createImageBitmap(blob);
  if(id!==loading){bitmap.close();return;}
  const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  source=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);render();
}
async function loadPhoto(){
  const id=++loading;invalidate();
  try{
    if($('photo').value==='gradient'){
      const canvas=document.createElement('canvas');canvas.width=640;canvas.height=400;const context=canvas.getContext('2d');
      const ramp=context.createLinearGradient(0,0,640,0);ramp.addColorStop(0,'black');ramp.addColorStop(1,'white');context.fillStyle=ramp;context.fillRect(0,0,640,200);
      for(let i=0;i<8;i++){context.fillStyle=`rgb(${Math.round((i+.5)*255/8)} ${Math.round((i+.5)*255/8)} ${Math.round((i+.5)*255/8)})`;context.fillRect(i*80,200,80,200);}
      source=context.getImageData(0,0,640,400);render();return;
    }
    const url=$('photo').value==='tarot'?'../../site/tarot/01-the-magician.webp':`../../tests/fixtures/photos/${$('photo').value}.png`;
    const response=await fetch(url);if(!response.ok)throw new Error(`HTTP ${response.status}`);await load(await response.blob(),id);
  }catch(error){if(id===loading)$('status').textContent=`Could not load image: ${error.message}`;}
}
$('photo').onchange=loadPhoto;
$('upload').onchange=async()=>{const file=$('upload').files[0];if(!file)return;const id=++loading;invalidate();try{await load(file,id);}catch(error){if(id===loading)$('status').textContent=`Could not load image: ${error.message}`;}};
for(const id of [...numeric,'palette','serpentine'])$(id).onchange=render;
$('strength').oninput=()=>{$('strengthValue').textContent=`${$('strength').value}%`;++generation;clearTimeout(timer);timer=setTimeout(render,100);};
await loadPhoto();
