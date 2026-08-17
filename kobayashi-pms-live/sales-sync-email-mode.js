(() => {
  if(window.__kobayashiSalesEmailMode)return;window.__kobayashiSalesEmailMode=true;
  let t=null;
  function apply(){
    const s=document.querySelector('#salesSyncSettings');
    if(s){
      const badge=s.querySelector('.sales-source-badge');if(badge)badge.textContent='CSV 备用';
      const note=s.querySelector('.sales-sync-note');if(note)note.innerHTML='<strong>主要来源：iCloud OTA 邮件自动同步。</strong> 新订单、金额和到账信息会自动进入系统；CSV 仅保留为对账或缺失数据补录工具，不需要每月上传。';
      const row=s.querySelector('.row');if(row){const strong=row.querySelector('strong'),small=row.querySelector('small');if(strong)strong.textContent='Airbnb CSV（备用补录）';if(small)small.textContent='只有邮件中缺少金额或需要历史对账时才使用。';}
    }
    const f=document.querySelector('#salesFinancePanel');
    if(f){const badge=f.querySelector('.sales-source-badge');if(badge)badge.textContent='OTA 自动同步';const p=f.querySelector('.muted-link');if(p)p.textContent='iCal 负责房态；OTA 邮件负责订单/金额/到账信息。CSV 仅作为备用补录，不会要求每月手工上传。';}
  }
  const ob=new MutationObserver(()=>{clearTimeout(t);t=setTimeout(apply,60)});ob.observe(document.documentElement,{childList:true,subtree:true});window.addEventListener('load',()=>setTimeout(apply,700));setTimeout(apply,900);
})();