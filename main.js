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
