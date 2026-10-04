import './site-header.js';
import {themes,imageSources,applyTheme,selectedTheme} from './themes.js';
const params=new URLSearchParams(location.search);
const theme=selectedTheme();
const source=imageSources.find(source=>source.id===params.get('card'));
document.body.dataset.initialSample=source?.id??'01-the-magician';
const algorithm=params.get('algorithm');
if(['atkinson','floyd-steinberg','ordered','knoll','nearest'].includes(algorithm))document.getElementById('algorithm').value=algorithm;
const exposure=Number(params.get('exposure')??0.3);
if(Number.isFinite(exposure)&&exposure>=-4&&exposure<=4)document.getElementById('exposure').value=exposure;
const contrast=Number(params.get('contrast')??1);
if(Number.isFinite(contrast)&&contrast>=0&&contrast<=2)document.getElementById('contrast').value=String(Math.round((contrast-1)*100));
function chooseTheme(name){
  applyTheme(name);
  document.getElementById('palette').value='CUSTOM';
  document.getElementById('customPalette').value=themes[name].colors.join(', ');
  for(const button of document.querySelectorAll('.theme-picker button'))button.setAttribute('aria-pressed',String(button.dataset.theme===name));
}
chooseTheme(theme);
await import('./examples/demo.js');
for(const button of document.querySelectorAll('.theme-picker button'))button.addEventListener('click',()=>{
  chooseTheme(button.dataset.theme);
  document.getElementById('palette').dispatchEvent(new Event('input'));
});
