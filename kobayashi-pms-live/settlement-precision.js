(() => {
  if (window.__kobayashiSettlementPrecision) return;
  window.__kobayashiSettlementPrecision = true;

  const SB_URL='https://cxaoomvagqpuatlfthlx.supabase.co';
  const SB_KEY='sb_publishable_ud3RGvS6BIe03XJzMZIOSQ_h_QrULbF';
  const SESSION_KEY='kobayashi_pms_session_v1';
  let cache=null,cacheAt=0,timer=null,applying=false;

  function session(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{return null}}
  function yen(n){return new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0)}
  function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function tokyoToday(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
  function monthBounds(){const t=tokyoToday(),[y,m]=t.split('-').map(Number),a=`${y}-${String(m).padStart(2,'0')}-01`,ny=m===12?y+1:y,nm=m===12?1:m+1,b=`${ny}-${String(nm).padStart(2,'0')}-01`;return {a,b,label:`${y}年${m}月`}}
  async function raw(path){const s=session();if(!s?.access_token)throw new Error('请先登录');const r=await fetch(SB_URL+path,{headers:{apikey:SB_KEY,Authorization:`Bearer ${s.access_token}`}});const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{data=text}if(!r.ok)throw new Error(data?.message||data?.error||`HTTP ${r.status}`);return data}
  async function context(){const u=await raw('/auth/v1/user');const ms=await raw(`/rest/v1/memberships?select=organization_id,role,can_view_financials&user_id=eq.${encodeURIComponent(u.id)}&limit=1`);return ms?.[0]||null}
  async function load(force=false){if(!force&&cache&&Date.now()-cacheAt<15000)return cache;const m=await context();if(!m)return null;const org=encodeURIComponent(m.organization_id);const {a,b}=monthBounds();const [all,current,clean,expenses,invoices]=await Promise.all([
    raw(`/rest/v1/reservation_finance_summary?select=organization_id,reservation_id,unit_id,channel,guest_name_snapshot,check_in,check_out,status,gross_amount_yen,platform_fee_yen,tax_withheld_yen,expected_payout_yen,actual_payout_yen,settlement_amount_yen,settlement_status,payout_variance_yen&organization_id=eq.${org}&order=check_in.desc&limit=500`),
    raw(`/rest/v1/reservation_finance_summary?select=reservation_id,status,gross_amount_yen,platform_fee_yen,expected_payout_yen,actual_payout_yen,settlement_amount_yen,settlement_status,payout_variance_yen&organization_id=eq.${org}&status=neq.cancelled&check_in=gte.${a}&check_in=lt.${b}`),
    raw(`/rest/v1/cleaning_cost_entries?select=expected_amount_yen,excluded&organization_id=eq.${org}&checkout_date=gte.${a}&checkout_date=lt.${b}`),
    raw(`/rest/v1/expense_transactions?select=amount_yen&organization_id=eq.${org}&occurred_on=gte.${a}&occurred_on=lt.${b}`),
    raw(`/rest/v1/vendor_invoices?select=total_amount_yen&organization_id=eq.${org}&invoice_month=eq.${a}`)
  ]);
  cache={m,all:all||[],current:current||[],clean:clean||[],expenses:expenses||[],invoices:invoices||[]};cacheAt=Date.now();return cache}

  function summary(c){
    const rows=c.current||[];
    const gross=rows.reduce((s,x)=>s+(x.gross_amount_yen||0),0);
    const fees=rows.reduce((s,x)=>s+(x.platform_fee_yen||0),0);
    const expected=rows.reduce((s,x)=>s+(x.expected_payout_yen||0),0);
    const actualRows=rows.filter(x=>x.settlement_status==='actual');
    const estimatedRows=rows.filter(x=>x.settlement_status==='estimated');
    const actual=actualRows.reduce((s,x)=>s+(x.actual_payout_yen||0),0);
    const pending=estimatedRows.reduce((s,x)=>s+(x.expected_payout_yen||0),0);
    const settlement=rows.reduce((s,x)=>s+(x.settlement_amount_yen||0),0);
    const variance=rows.reduce((s,x)=>s+(x.payout_variance_yen||0),0);
    const expectedClean=(c.clean||[]).filter(x=>!x.excluded).reduce((s,x)=>s+(x.expected_amount_yen||0),0);
    const actualClean=(c.invoices||[]).reduce((s,x)=>s+(x.total_amount_yen||0),0);
    const hasInvoice=(c.invoices||[]).length>0;
    const other=(c.expenses||[]).reduce((s,x)=>s+(x.amount_yen||0),0);
    const cleanCost=hasInvoice?actualClean:expectedClean;
    return {gross,fees,expected,actual,pending,settlement,variance,expectedClean,actualClean,hasInvoice,other,profit:settlement-cleanCost-other,actualCount:actualRows.length,estimatedCount:estimatedRows.length};
  }

  function settlementCell(x){
    if(!x||x.settlement_amount_yen==null)return '—';
    const status=x.settlement_status==='actual'?'<span class="settlement-badge actual">已到账</span>':'<span class="settlement-badge estimated">预计到账</span>';
    const gross=x.gross_amount_yen!=null?yen(x.gross_amount_yen):'—',fee=x.platform_fee_yen!=null?yen(x.platform_fee_yen):'—';
    const v=x.payout_variance_yen;
    const diff=v==null||v===0?'':`<small class="settlement-variance ${v>0?'plus':'minus'}">调整差额 ${v>0?'+':''}${yen(v)}</small>`;
    return `<div class="settlement-cell"><strong>${yen(x.settlement_amount_yen)}</strong>${status}<small>订单总额 ${gross} · 平台费 ${fee}</small>${diff}</div>`;
  }

  async function applyOrders(c){
    if(document.querySelector('#pageTitle')?.textContent.trim()!=='订单')return;
    const table=document.querySelector('#content table.table');if(!table)return;
    const ths=table.querySelectorAll('thead th');if(ths[5]&&ths[5].textContent!=='到账金额')ths[5].textContent='到账金额';
    const byId=new Map(c.all.map(x=>[x.reservation_id,x]));
    table.querySelectorAll('tbody tr').forEach(tr=>{const b=tr.querySelector('[data-edit]');if(!b)return;const td=tr.children[5];if(!td)return;const html=settlementCell(byId.get(b.dataset.edit));if(td.innerHTML!==html)td.innerHTML=html});
  }

  function metricCards(){return [...document.querySelectorAll('#content .metric')]}
  function setMetric(card,label,value,small){if(!card)return;const l=card.querySelector('label'),s=card.querySelector('strong'),sm=card.querySelector('small'),v=yen(value);if(l&&l.textContent!==label)l.textContent=label;if(s&&s.textContent!==v)s.textContent=v;if(sm&&small!=null&&sm.textContent!==small)sm.textContent=small}
  function ensureDashboardSalesGuard(){if(document.querySelector('#pageTitle')?.textContent.trim()!=='经营概览')return;if(document.querySelector('#salesFinancePanel'))return;const guard=document.createElement('i');guard.id='salesFinancePanel';guard.hidden=true;guard.setAttribute('aria-hidden','true');document.querySelector('#content')?.appendChild(guard)}

  async function applyDashboard(c){
    if(document.querySelector('#pageTitle')?.textContent.trim()!=='经营概览')return;
    ensureDashboardSalesGuard();
    const s=summary(c),cards=metricCards();if(cards.length<4)return;
    setMetric(cards[0],'平台结算额',s.settlement,`已到账 ${yen(s.actual)} · 待结算 ${yen(s.pending)}`);
    setMetric(cards[1],s.hasInvoice?'实际清扫账单':'预计清扫费',s.hasInvoice?s.actualClean:s.expectedClean,s.hasInvoice?'已录入本月账单':'按退房日自动计入');
    setMetric(cards[2],'其他支出',s.other,`平台手续费 ${yen(s.fees)} 已从结算额扣除`);
    setMetric(cards[3],s.hasInvoice?'当前净利润':'预计净利润',s.profit,'平台结算额 - 清扫 - 其他');
  }

  async function applyFinance(c){
    if(document.querySelector('#pageTitle')?.textContent.trim()!=='财务')return;
    const s=summary(c),cards=metricCards();if(cards.length>=4){
      setMetric(cards[0],'订单总额',s.gross,`${monthBounds().label} · 手续费扣除前`);
      setMetric(cards[1],'平台手续费',s.fees,'用于核对平台扣款');
      setMetric(cards[2],'平台结算额',s.settlement,`已到账 ${yen(s.actual)} · 待结算 ${yen(s.pending)}`);
      setMetric(cards[3],s.hasInvoice?'当前净利润':'预计净利润',s.profit,'结算额 - 清扫 - 其他支出');
    }
    const legacy=document.querySelector('#salesFinancePanel');if(legacy&&legacy.style.display!=='none')legacy.style.display='none';
    if(!document.querySelector('#settlementPrecisionPanel')){
      const content=document.querySelector('#content');const panel=document.createElement('section');panel.className='panel settlement-panel';panel.id='settlementPrecisionPanel';
      const varText=s.variance===0?'无差额':`${s.variance>0?'+':''}${yen(s.variance)}`;
      panel.innerHTML=`<div class="panel-head"><div><span class="eyebrow">SETTLEMENT</span><h2>平台结算明细</h2></div><span class="badge">净额口径</span></div><div class="settlement-grid"><div class="settlement-stat"><span>订单总额</span><strong>${yen(s.gross)}</strong></div><div class="settlement-stat"><span>平台手续费</span><strong>${yen(s.fees)}</strong></div><div class="settlement-stat"><span>理论净额</span><strong>${yen(s.expected)}</strong></div><div class="settlement-stat"><span>实际到账</span><strong>${yen(s.actual)}</strong></div><div class="settlement-stat"><span>到账调整差额</span><strong>${esc(varText)}</strong></div></div><div class="settlement-note">订单页现在优先显示“到账金额”。已经收到平台结算邮件时显示实际到账；还没结算时显示“订单总额 - 平台手续费”的预计到账。若实际到账与理论净额不一致，会单独显示调整差额，避免把追加收款、退款或其他调整误算成手续费。</div>`;
      content.appendChild(panel);
    }
  }

  function modalMatch(c){
    const modal=document.querySelector('#resModal');if(!modal)return null;
    const guest=modal.querySelector('#rGuest')?.value.trim(),ci=modal.querySelector('#rIn')?.value,co=modal.querySelector('#rOut')?.value,ch=modal.querySelector('#rChannel')?.value;
    const hits=c.all.filter(x=>x.check_in===ci&&x.check_out===co&&x.channel===ch&&(!guest||x.guest_name_snapshot===guest));return hits.length===1?hits[0]:null;
  }
  async function applyModal(c){
    const modal=document.querySelector('#resModal');if(!modal)return;
    let box=modal.querySelector('#settlementModalBox');if(!box){const actions=modal.querySelector('.form-actions');if(!actions)return;box=document.createElement('div');box.id='settlementModalBox';box.className='settlement-modal-box';actions.parentNode.insertBefore(box,actions)}
    const hit=modalMatch(c),gross=Number(String(modal.querySelector('#rGross')?.value||'').replace(/,/g,''))||0,fee=Number(String(modal.querySelector('#rFee')?.value||'').replace(/,/g,''))||0,expected=Math.max(0,gross-fee),actual=hit?.actual_payout_yen,status=actual!=null?'已到账':'预计到账',settle=actual!=null?actual:expected;
    const html=`<div class="settlement-modal-title">结算金额</div><div class="settlement-modal-grid"><div><span>订单总额</span><strong>${yen(gross)}</strong></div><div><span>平台手续费</span><strong>${yen(fee)}</strong></div><div><span>${status}</span><strong>${yen(settle)}</strong></div><div><span>调整差额</span><strong>${hit?.payout_variance_yen?`${hit.payout_variance_yen>0?'+':''}${yen(hit.payout_variance_yen)}`:'—'}</strong></div></div>`;
    if(box.innerHTML!==html)box.innerHTML=html;
    ['#rGross','#rFee','#rGuest','#rIn','#rOut','#rChannel'].forEach(sel=>{const el=modal.querySelector(sel);if(el&&!el.dataset.settlementBound){el.dataset.settlementBound='1';el.addEventListener('input',()=>applyModal(c));el.addEventListener('change',()=>applyModal(c))}})
  }

  async function apply(){if(applying)return;applying=true;try{const c=await load();if(!c)return;await applyOrders(c);await applyDashboard(c);await applyFinance(c);await applyModal(c)}catch(e){console.error('settlement precision',e)}finally{applying=false}}
  const ob=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(apply,120)});ob.observe(document.documentElement,{subtree:true,childList:true});window.addEventListener('load',()=>setTimeout(apply,900));setTimeout(apply,1200);
})();