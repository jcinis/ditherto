/** Shared controls and recipe serialization for the standalone and site playgrounds. */
const $ = id => document.getElementById(id);
export const algorithmDescriptions = {
  'sierra-lite':'A compact three-neighbor diffusion texture.',
  stucki:'A wider diffusion spread for fine, even texture.',
  ordered:'A repeating Bayer pattern with a selectable matrix size.',
  'ordered-blue-noise':'A fixed blue-noise pattern with less regular structure.',
  'knoll-blue-noise':'Knoll color mixtures selected with a blue-noise pattern.',
  halftone:'Clustered dots. Larger palettes use their darkest and lightest colors; other colors are ignored.',
  riemersma:'Diffusion along a Hilbert curve, with a short history of recent errors.',
};
const names={'sierra-lite':'Sierra Lite',stucki:'Stucki',halftone:'Halftone',riemersma:'Riemersma','ordered-blue-noise':'Ordered / blue noise','knoll-blue-noise':'Knoll / blue noise'};
export function setupAlgorithmControls(schedule) {
  for(const [value,label] of Object.entries(names)) if(!$('algorithm').querySelector(`option[value="${value}"]`)) $('algorithm').add(new Option(label,value));
  $('algorithm').querySelector('option[value="ordered"]').textContent='Ordered / Bayer';
  const controls=document.createElement('div');
  controls.innerHTML=`
    <section class="tone-controls" id="bayerControls" hidden aria-label="Bayer settings"><label for="bayerSize">Bayer matrix</label><select id="bayerSize"><option value="2">2 × 2</option><option value="4" selected>4 × 4</option><option value="8">8 × 8</option><option value="16">16 × 16</option></select></section>
    <section class="tone-controls" id="diffusionControls" hidden aria-label="Diffusion settings"><label class="check"><input type="checkbox" id="serpentine">Serpentine scanning</label><p>Alternate direction on each pixel row.</p></section>
    <section class="tone-controls" id="halftoneControls" hidden aria-label="Halftone settings"><label for="halftoneCellSize">Dot cell size</label><input id="halftoneCellSize" type="number" min="2" max="16" step="1" value="8"><p>2–16 logical pixels per cell. Uses the darkest and lightest palette colors.</p></section>
    <section class="tone-controls" id="riemersmaControls" hidden aria-label="Riemersma settings"><label for="riemersmaHistory">Error history</label><input id="riemersmaHistory" type="number" min="2" max="64" step="1" value="16"><p>Retain 2–64 recent pixel errors.</p></section>`;
  $('knollControls').after(controls);
  for(const id of ['bayerSize','serpentine','halftoneCellSize','riemersmaHistory']) $(id).addEventListener('input',schedule);
  const params = new URLSearchParams(location.search);
  const selections = {bayerSize:'bayerSize', candidates:'knollCandidates', step:'step'};
  for (const [query, id] of Object.entries(selections)) {
    const value = params.get(query);
    if (value === null) continue;
    const element = $(id);
    if (element.tagName === 'SELECT' ? [...element.options].some(option => option.value === value) : Number.isInteger(Number(value)) && Number(value) >= Number(element.min) && Number(value) <= Number(element.max)) element.value = value;
  }
  for (const [query, id, min, max] of [['strength','knollStrength',0,100],['cellSize','halftoneCellSize',2,16],['history','riemersmaHistory',2,64]]) {
    const value = params.get(query);
    if (value !== null && Number.isInteger(Number(value)) && Number(value) >= min && Number(value) <= max) $(id).value = value;
  }
  $('serpentine').checked = params.get('serpentine') === 'true';
  const requested=params.get('algorithm');
  if([...$('algorithm').options].some(option=>option.value===requested)) $('algorithm').value=requested;
}
const isDiffusion = name => ['atkinson','floyd-steinberg','sierra-lite','stucki'].includes(name);
export function updateAlgorithmControls() {
  const name=$('algorithm').value;
  $('knollControls').hidden=!['knoll','knoll-blue-noise'].includes(name);
  $('bayerControls').hidden=!['ordered','knoll'].includes(name);
  $('diffusionControls').hidden=!isDiffusion(name);
  $('halftoneControls').hidden=name!=='halftone';
  $('riemersmaControls').hidden=name!=='riemersma';
}
export function selectedAlgorithmOptions() {
  const name=$('algorithm').value, result={};
  if(['knoll','knoll-blue-noise'].includes(name)) Object.assign(result,{strength:Number($('knollStrength').value)/100,candidates:Number($('knollCandidates').value)});
  // Omit default settings to keep existing recipes concise and backwards compatible.
  if(['ordered','knoll'].includes(name)&&Number($('bayerSize').value)!==4) result.bayerSize=Number($('bayerSize').value);
  if(isDiffusion(name)&&$('serpentine').checked) result.serpentine=true;
  if(name==='halftone') result.cellSize=Number($('halftoneCellSize').value);
  if(name==='riemersma') result.history=Number($('riemersmaHistory').value);
  return Object.keys(result).length?{algorithmOptions:result}:{};
}
export function algorithmFlags(options={}) {
  const flags={strength:'strength',candidates:'candidates',bayerSize:'bayer-size',cellSize:'cell-size',history:'history'};
  return Object.entries(options).map(([key,value])=>key==='serpentine'?(value?' --serpentine':''):` --${flags[key]} ${value}`).join('');
}
export function recipeImport(name) {
  const blue=name.endsWith('-blue-noise');
  return `import { ditherToImageData, PALETTES${blue?', algorithms':''} } from 'ditherto/browser';\n${blue?"import { registerBlueNoise } from 'ditherto/blue-noise';\nregisterBlueNoise(algorithms);\n":''}\n`;
}
