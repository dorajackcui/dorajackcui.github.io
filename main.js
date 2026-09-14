const root=document.documentElement;
const hero=document.querySelector('.hero');
const work=document.querySelector('#work');
const about=document.querySelector('#about');
const projects=[...document.querySelectorAll('.project')];
const dock=document.querySelector('#project-dock');
const dockLinks=[...dock.querySelectorAll('a')];
const progressFill=document.querySelector('#dock-progress-fill');
const motionButton=document.querySelector('#motion-toggle');
const languageButton=document.querySelector('#language-toggle');
const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
const mobile=window.matchMedia('(max-width: 760px)');
let language='zh';
let paused=reducedMotion.matches;
let globe=null;
let globeFailed=false;
let animationFrame=0;
let elapsed=0;
let lastTime=0;
let rotation=-1.75;
let targetRotation=-1.75;
let globeVisible=true;
let positions={heroHeight:800,workTop:800,aboutTop:3200,projectCenters:[]};
try{const saved=localStorage.getItem('portfolio-language');if(saved==='en'||saved==='zh')language=saved;}catch{}

function updateMotionLabel(){
  const label=language==='zh'?(paused?'播放地球动画':'暂停地球动画'):(paused?'Play globe animation':'Pause globe animation');
  motionButton.setAttribute('aria-label',label);
  motionButton.title=label;
  motionButton.setAttribute('aria-pressed',String(paused));
  document.querySelector('#motion-icon').textContent=paused?'▷':'Ⅱ';
}
function setLanguage(next){
  language=next;
  root.lang=next==='zh'?'zh-CN':'en';
  document.querySelectorAll('[data-zh][data-en]').forEach(element=>element.textContent=element.dataset[next].replaceAll('\\n','\n'));
  document.querySelectorAll('[data-zh-label]').forEach(element=>element.setAttribute('aria-label',element.dataset[`${next}Label`]));
  languageButton.innerHTML=next==='zh'?'EN <span aria-hidden="true">↔</span>':'中文 <span aria-hidden="true">↔</span>';
  languageButton.setAttribute('aria-label',next==='zh'?'Switch to English':'切换到中文');
  document.title=next==='zh'?'Zhiyang Cui — 开发者 / 本地化工具':'Zhiyang Cui — Developer / Localization';
  document.querySelector('meta[name="description"]').content=next==='zh'?'Zhiyang Cui 的个人开发作品集。探索 momoCAT、QAtools 与 Tool Hub：让翻译、本地化与日常工作更顺手的工具。':'Zhiyang Cui builds tools for translation, localization, and everyday work. Explore momoCAT, QAtools, and Tool Hub.';
  updateMotionLabel();
  try{localStorage.setItem('portfolio-language',next);}catch{}
  measure();
}
languageButton.addEventListener('click',()=>setLanguage(language==='zh'?'en':'zh'));
motionButton.addEventListener('click',()=>{paused=!paused;root.dataset.motion=paused?'paused':'playing';updateMotionLabel();lastTime=0;requestFrame();});
reducedMotion.addEventListener('change',()=>{paused=reducedMotion.matches;updateMotionLabel();lastTime=0;requestFrame();});
document.querySelector('#year').textContent=new Date().getFullYear();

const clamp=(n,min=0,max=1)=>Math.min(max,Math.max(min,n));
const smooth=t=>t*t*(3-2*t);
function measure(){
  positions={heroHeight:hero.offsetHeight,workTop:work.offsetTop,aboutTop:about.offsetTop,projectCenters:projects.map(project=>project.getBoundingClientRect().top+window.scrollY+project.offsetHeight/2)};
  updateScroll();
}
function updateScroll(){
  const y=window.scrollY,height=window.innerHeight;
  const travel=smooth(clamp((y-positions.heroHeight*.14)/(positions.heroHeight*.69)));
  const opacity=1-clamp((y+height*.65-positions.aboutTop)/(height*.4));
  root.style.setProperty('--globe-x',`${73-46*travel}%`);
  root.style.setProperty('--globe-opacity',opacity.toFixed(3));
  targetRotation=-1.75+y/Math.max(height,600)*1.18;
  globeVisible=mobile.matches?y<positions.heroHeight:opacity>0;
  const inWork=y+height*.45>positions.workTop&&y+height*.55<positions.aboutTop;
  root.classList.toggle('in-work',inWork);
  dock.classList.toggle('is-visible',inWork);
  let active=0,distance=Infinity;
  positions.projectCenters.forEach((center,index)=>{const d=Math.abs(center-(y+height*.5));if(d<distance){distance=d;active=index;}});
  dockLinks.forEach((link,index)=>{if(index===active)link.setAttribute('aria-current','true');else link.removeAttribute('aria-current');});
  progressFill.style.transform=`scaleX(${clamp((y+height*.5-positions.workTop)/(positions.aboutTop-positions.workTop))})`;
  document.querySelector('.nav-work').classList.toggle('is-current',inWork);
  document.querySelector('header a[href="#about"]').classList.toggle('is-current',y+height*.6>=positions.aboutTop);
  requestFrame();
}
function requestFrame(){if(!animationFrame)animationFrame=requestAnimationFrame(frame);}
function frame(now){
  animationFrame=0;
  if(document.hidden)return;
  const dt=lastTime?Math.min((now-lastTime)/1000,.05):0;
  lastTime=now;
  if(!paused&&globeVisible)elapsed+=dt;
  const target=targetRotation+elapsed*.035;
  if(!paused)rotation+= (target-rotation)*(1-Math.exp(-dt*7));
  if(globe&&globeVisible)globe.render(rotation,elapsed);
  if(globe&&!globeFailed&&globeVisible&&!paused)requestFrame();
}
window.addEventListener('scroll',updateScroll,{passive:true});
window.addEventListener('resize',measure,{passive:true});
document.addEventListener('visibilitychange',()=>{lastTime=0;if(!document.hidden)requestFrame();});
new ResizeObserver(measure).observe(document.querySelector('main'));
document.fonts.ready.then(measure);
setLanguage(language);

// Content and controls remain usable if WebGL or its optional module fails.
try{
  const {createGlobe}=await import('./globe.js');
  globe=await createGlobe({canvas:document.querySelector('#globe-canvas'),viewport:document.querySelector('#globe-viewport'),onFailure(){globeFailed=true;motionButton.disabled=true;},onRestore(){globeFailed=false;motionButton.disabled=false;lastTime=0;requestFrame();}});
  globe.render(rotation,elapsed);
  root.classList.add('globe-ready');
  requestFrame();
}catch(error){
  globeFailed=true;
  motionButton.disabled=true;
  root.dataset.globe='fallback';
  console.warn('Decorative globe unavailable; using the static fallback.',error);
}
