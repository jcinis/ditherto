export const themes = {
  orchid: {name:'Orchid', colors:['#181622','#514562','#ac809c','#eee0d5'], accent:'#d9a9cc', muted:'#afa3b7'},
  amber: {name:'Amber', colors:['#181619','#705552','#bb946c','#efdbb2'], accent:'#efbd76', muted:'#b0a294'},
  moss: {name:'Moss', colors:['#151c1a','#40594c','#98a177','#e5dfb5'], accent:'#bdcc8e', muted:'#9dab9e'},
  gameboy: {name:'Game Boy', colors:['#0f380f','#306230','#8bac0f','#9bbc0f'], paper:'#9bbc0f', ink:'#0f380f', panel:'#8bac0f', line:'#306230', accent:'#0f380f', muted:'#0f380f', scheme:'light'},
  blue: {name:'Blue Mono', colors:['#0000ff','#ffffff'], paper:'#ffffff', ink:'#0000ff', panel:'#ffffff', line:'#0000ff', accent:'#0000ff', muted:'#0000ff', scheme:'light'},
  mono: {name:'Mono', colors:['#000000','#ffffff'], paper:'#ffffff', ink:'#000000', panel:'#ffffff', line:'#000000', accent:'#000000', muted:'#000000', scheme:'light'},
};
export const cards = [
  {id:'00-the-fool', name:'The Fool', number:'0', file:'00-the-fool.webp'},
  {id:'01-the-magician', name:'The Magician', number:'I', file:'01-the-magician.webp'},
  {id:'02-the-high-pristess', name:'The High Priestess', number:'II', file:'02-the-high-pristess.webp'},
  {id:'03-the-empress', name:'The Empress', number:'III', file:'03-the-empress.webp'},
  {id:'04-the-emperor', name:'The Emperor', number:'IV', file:'04-the-emperor.webp'},
];
export function paletteFor(name) {
  return themes[name].colors.map(hex=>[1,3,5].map(start=>parseInt(hex.slice(start,start+2),16)));
}
export function selectedTheme() {
  const requested = new URLSearchParams(location.search).get('theme');
  if (Object.hasOwn(themes, requested)) return requested;
  try {
    const saved = localStorage.getItem('ditherto-theme');
    if (Object.hasOwn(themes, saved)) return saved;
  } catch { /* Theme selection still works when storage is unavailable. */ }
  return 'orchid';
}
export function applyTheme(name) {
  const theme=themes[name];
  document.documentElement.dataset.theme=name;
  for(const button of document.querySelectorAll('.theme-picker button'))button.setAttribute('aria-pressed',String(button.dataset.theme===name));
  document.documentElement.style.colorScheme=theme.scheme??'dark';
  document.documentElement.style.accentColor=theme.accent;
  for(const [key,value] of Object.entries({paper:theme.paper??theme.colors[0],ink:theme.ink??theme.colors.at(-1),panel:theme.panel??'#201d21',line:theme.line??'#494044',accent:theme.accent,muted:theme.muted})) {
    document.documentElement.style.setProperty(`--${key}`,value);
  }
  try { localStorage.setItem('ditherto-theme',name); } catch { /* Storage is optional. */ }
  const url = new URL(location.href);
  url.searchParams.set('theme',name);
  history.replaceState(history.state,'',url);
}
