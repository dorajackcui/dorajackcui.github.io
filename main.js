const toggle = document.querySelector('#language-toggle');
let language = 'zh';
try { language = (localStorage.getItem('yizhi-language') ?? localStorage.getItem('yizhi-notion-language')) === 'en' ? 'en' : 'zh'; } catch { /* The page works without storage. */ }
function applyLanguage() {
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  document.querySelectorAll('[data-zh][data-en]').forEach(el => { el.textContent = el.dataset[language]; });
  document.querySelectorAll('[data-zh-label]').forEach(el => el.setAttribute('aria-label', el.getAttribute(`data-${language}-label`)));
  document.querySelectorAll('[data-zh-alt]').forEach(el => { el.alt = el.getAttribute(`data-${language}-alt`); });
  toggle.textContent = language === 'zh' ? 'EN' : '中';
  toggle.setAttribute('aria-label', language === 'zh' ? 'Switch to English' : '切换到中文');
  document.querySelector('.wordmark').setAttribute('aria-label', language === 'zh' ? 'YIZHI 首页' : 'YIZHI home');
  document.querySelector('.site-header nav').setAttribute('aria-label', language === 'zh' ? '主导航' : 'Main navigation');
}
toggle.addEventListener('click', () => {
  language = language === 'zh' ? 'en' : 'zh';
  applyLanguage();
  try { localStorage.setItem('yizhi-language', language); } catch { /* Saving a preference is optional. */ }
});
applyLanguage();

// Keep links to the retired portfolio's project anchor useful.
if (location.hash === '#work') {
  history.replaceState(null, '', '#projects');
  document.querySelector('#projects').scrollIntoView();
}

// Animate each row once; hiding offscreen rows is only a JavaScript enhancement.
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
if (!reducedMotion.matches && 'IntersectionObserver' in window && 'animate' in Element.prototype) {
  const animations = new Set();
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      entry.target.classList.remove('motion-pending');
      if (entry.target.contains(document.activeElement)) continue;
      const animation = entry.target.animate(
        [{ opacity: 0, transform: 'translateY(22px)' }, { opacity: 1, transform: 'translateY(0)' }],
        { duration: 800, easing: 'cubic-bezier(.2, .65, .3, 1)' }
      );
      animations.add(animation);
      animation.onfinish = animation.oncancel = () => animations.delete(animation);
    }
  }, { threshold: .12, rootMargin: '0px 0px -48px 0px' });
  document.querySelectorAll('.project, .article-entry').forEach(row => {
    if (row.getBoundingClientRect().top >= window.innerHeight) row.classList.add('motion-pending');
    observer.observe(row);
    row.addEventListener('focusin', () => {
      observer.unobserve(row);
      row.classList.remove('motion-pending');
      row.getAnimations().forEach(animation => animation.cancel());
    });
  });
  reducedMotion.addEventListener('change', () => {
    observer.disconnect();
    document.querySelectorAll('.motion-pending').forEach(row => row.classList.remove('motion-pending'));
    animations.forEach(animation => animation.cancel());
  }, { once: true });
}
