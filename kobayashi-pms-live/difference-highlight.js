(function(){
  function num(text){
    if(!text || text.trim()==='—') return null;
    const m=text.replace(/,/g,'').match(/-?\d+/);
    return m?Number(m[0]):null;
  }
  function ensureStyle(){
    if(document.getElementById('diffHighlightStyles')) return;
    const s=document.createElement('style');
    s.id='diffHighlightStyles';
    s.textContent=`
      .diff-high{color:#b91c1c!important;background:#fff1f2!important;border-radius:8px;padding:3px 7px}
      .diff-low{color:#047857!important;background:#ecfdf5!important;border-radius:8px;padding:3px 7px}
      .diff-even{color:#047857!important}
      tr.diff-row-high td{background:#fff8f8}
      tr.diff-row-low td{background:#f6fffb}
    `;
    document.head.appendChild(s);
  }
  function mark(el,diff){
    if(!el) return;
    el.classList.remove('diff-high','diff-low','diff-even');
    el.classList.add(diff>0?'diff-high':diff<0?'diff-low':'diff-even');
  }
  function applyFinance(){
    document.querySelectorAll('.fm-breakdown .row').forEach(row=>{
      const label=row.querySelector('span')?.textContent?.trim();
      if(label==='基础清扫差额'){
        const strong=row.querySelector('strong');
        const value=num(strong?.textContent||'');
        if(value!==null) mark(strong,value);
      }
    });
  }
  function applyPdf(){
    const table=document.querySelector('.pdf-table');
    if(!table) return;
    const headers=[...table.querySelectorAll('thead th')].map(x=>x.textContent.trim());
    const basicIdx=headers.indexOf('基本清扫');
    const expectedIdx=headers.indexOf('系统预计');
    if(basicIdx<0||expectedIdx<0) return;
    table.querySelectorAll('tbody tr').forEach(row=>{
      row.classList.remove('diff-row-high','diff-row-low');
      const cells=[...row.querySelectorAll('td')];
      const actual=num(cells[basicIdx]?.textContent||'');
      const expected=num(cells[expectedIdx]?.textContent||'');
      if(actual===null||expected===null) return;
      const diff=actual-expected;
      mark(cells[basicIdx],diff);
      if(diff>0) row.classList.add('diff-row-high');
      if(diff<0) row.classList.add('diff-row-low');
    });
  }
  function run(){ensureStyle();applyFinance();applyPdf()}
  const ob=new MutationObserver(()=>{clearTimeout(window.__diffHL);window.__diffHL=setTimeout(run,80)});
  ob.observe(document.documentElement,{subtree:true,childList:true});
  window.addEventListener('load',run);
  setTimeout(run,700);
})();
