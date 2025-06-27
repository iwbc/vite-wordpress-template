import { debounce } from 'throttle-debounce';

function setScrollbarWidthCSSProp() {
  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
  document.documentElement.style.setProperty('--scrollbar-width', (scrollbarWidth > 0 ? scrollbarWidth : 0) + 'px');
}

setScrollbarWidthCSSProp();
window.addEventListener('resize', debounce(100, setScrollbarWidthCSSProp));

document.documentElement.style.scrollBehavior = 'smooth';
