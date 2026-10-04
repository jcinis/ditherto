import { themes } from './themes.js';

const header = document.querySelector('header.topbar');
const page = header.dataset.page;
header.innerHTML = `
  <a class="wordmark" href="./index.html" aria-label="dither·to home"><span class="mark" aria-hidden="true"></span>dither·to</a>
  <nav aria-label="Main navigation">
    <a href="./why.html"${page === 'why' ? ' aria-current="page"' : ''}>[ why ]</a>
    <a href="./playground.html"${page === 'playground' ? ' aria-current="page"' : ''}>[ playground ]</a>
    <a href="./algorithms.html"${page === 'algorithms' ? ' aria-current="page"' : ''}>[ algorithms ]</a>
  </nav>
  <div class="theme-picker" id="palette-picker" role="group" aria-label="Page and image palette">
    ${Object.entries(themes).map(([key, theme]) => `<button type="button" data-theme="${key}" aria-pressed="false" title="${theme.name} palette"><span style="--chip:${theme.accent}"></span>${theme.name}</button>`).join('')}
  </div>`;

// Keep anchor destinations visible when the header wraps on smaller screens.
const headerObserver = new ResizeObserver(() => {
  document.documentElement.style.setProperty('--header-height', `${header.offsetHeight}px`);
});
headerObserver.observe(header);
