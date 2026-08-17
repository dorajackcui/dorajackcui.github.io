(() => {
  if (window.__kobayashiSalesSync) return;
  window.__kobayashiSalesSync = true;

  const SB_URL='https://cxaoomvagqpuatlfthlx.supabase.co';
  const SB_KEY='sb_publishable_ud3RGvS6BIe03XJzMZIOSQ_h_QrULbF';
  const SESSION_KEY='kobayashi_pms_session_v1';
  let timer=null, running=false, lastSummaryKey='';

  function session(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{return null}}
  function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function yen(n){return new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0)}
  function tokyoToday(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
  function monthBounds(){const t=tokyoToday(),[y,m]=t.split('-').map(Number),a=`${y}-${String(m).padStart(2,'0')}-01`,ny=m===12?y+1:y,nm=m===12?1:m+1,b=`${ny}-${String(nm).padStart(2,'0')}-01`;return {a,b,label:`${y}年${m}月`}}
  async function raw(path,{method='GET',body,headers={}}={}){const s=session();if(!s?.access_token)throw new Error('请先登录');const h={apikey:SB_KEY,Authorization:`Bearer ${s.access_token}`,...headers};if(body!==undefined)h['Content-Type']='application/json';const r=await fetch(SB_URL+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)});const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{data=text}if(!r.ok)throw new Error(data?.message||data?.error_description||data?.error||`HTTP ${r.status}`);return data}

  async function context(){
    const u=await raw('/auth/v1/user');
    const ms=await raw(`/rest/v1/memberships?select=organization_id,role,can_view_financials&user_id=eq.${encodeURIComponent(u.id)}&limit=1`);
    const mem=ms?.[0]; if(!mem) throw new Error('还没有管理空间');
    const org=encodeURIComponent(mem.organization_id);
    const [props,maps]=await Promise.all([
      raw(`/rest/v1/properties?select=id,name,active,units(id,name,active)&organization_id=eq.${org}&order=display_order.asc,name.asc`),
      raw(`/rest/v1/provider_listing_mappings?select=id,provider,external_listing_key,unit_id,display_name&organization_id=eq.${org}&provider=eq.Airbnb`).catch(()=>[]),
    ]);
    const units=[];for(const p of props||[]){if(!p.active)continue;for(const x of p.units||[]){if(x.active)units.push({id:x.id,label:`${p.name} · ${x.name}`,property:p.name,name:x.name})}}
    return {user:u,mem,orgId:mem.organization_id,units,maps:maps||[]};
  }

  function parseCSV(text){
    text=String(text||'').replace(/^\uFEFF/,'');
    const rows=[];let row=[],cell='',q=false;
    for(let i=0;i<text.length;i++){
      const c=text[i];
      if(q){if(c==='"'&&text[i+1]==='"'){cell+='"';i++}else if(c==='"')q=false;else cell+=c}
      else if(c==='"')q=true;else if(c===','){row.push(cell);cell=''}else if(c==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell=''}else cell+=c;
    }
    if(cell.length||row.length){row.push(cell.replace(/\r$/,''));rows.push(row)}
    const headers=(rows.shift()||[]).map(x=>x.trim());
    return {headers,rows:rows.filter(r=>r.some(x=>String(x).trim()!==''))};
  }
  function norm(v){return String(v||'').toLowerCase().normalize('NFKC').replace(/[\s_\-\/()（）:：.]/g,'')}
  const aliases={
    code:['confirmationcode','reservationcode','予約コード','確認コード','予約番号','confirmation'],
    listing:['listing','listingname','リスティング','リスティング名','物件','宿泊施設','房源'],
    guest:['guest','guestname','ゲスト','ゲスト名','予約者','客人'],
    checkin:['startdate','checkin','checkindate','開始日','チェックイン','入住日'],
    checkout:['enddate','checkout','checkoutdate','終了日','チェックアウト','退房日'],
    gross:['grossearnings','grossamount','gross','総収入','総収益','収入総額','売上総額'],
    fee:['hostfee','hostservicefee','servicefee','ホストサービス料','サービス料','平台手续费'],
    payout:['amount','payout','earnings','netearnings','受取金','受取額','支払額','振込額'],
    cleaning:['cleaningfee','清掃料金','清掃費','清扫费'],
    currency:['currency','通貨','币种'],
    payoutdate:['date','payoutdate','支払日','振込日','取引日'],
    type:['type','transactiontype','種類','取引タイプ'],
  };
  function detect(headers,key){const nn=headers.map(norm);for(const a of aliases[key]||[]){const idx=nn.indexOf(norm(a));if(idx>=0)return idx}return -1}
  function money(v,{abs=false}={}){let s=String(v??'').trim();if(!s)return null;const neg=/^\(.*\)$/.test(s)||/^\s*-/.test(s);s=s.replace(/[^0-9.,-]/g,'').replace(/,/g,'');const n=Number(s);if(!Number.isFinite(n))return null;const x=Math.round(n);return abs?Math.abs(x):(neg?-Math.abs(x):x)}
  function date(v){let s=String(v??'').trim();if(!s)return null;s=s.replace(/[年月]/g,'-').replace(/日/g,'').replace(/[.]/g,'/');let m=s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);if(m)return `${m[1]}-${String(+m[2]).padStart(2,'0')}-${String(+m[3]).padStart(2,'0')}`;m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);if(m)return `${m[3]}-${String(+m[1]).padStart(2,'0')}-${String(+m[2]).padStart(2,'0')}`;return null}
  function val(row,map,k){const i=map[k];return i==null||i<0?'':(row[i]??'')}
  function sourceKey(rec){return rec.external_reservation_id?`reservation:${rec.external_reservation_id}`:`row:${[rec.external_listing_key,rec.check_in,rec.check_out,rec.guest_name,rec.gross_amount_yen,rec.payout_amount_yen].map(x=>String(x??'')).join('|')}`}

  function selectOptions(headers,idx,allowBlank=true){return `${allowBlank?'<option value="-1">（没有/不导入）</option>':''}${headers.map((h,i)=>`<option value="${i}" ${i===idx?'selected':''}>${esc(h||`第${i+1}列`)}</option>`).join('')}`}
  async function beginImport(file){
    const parsed=parseCSV(await file.text());if(!parsed.headers.length||!parsed.rows.length)return alert('CSV里没有可读取的数据。');
    const map={};Object.keys(aliases).forEach(k=>map[k]=detect(parsed.headers,k));
    document.querySelector('#salesImportModal')?.remove();
    document.body.insertAdjacentHTML('beforeend',`<div class="modal-bg" id="salesImportModal"><div class="modal"><div class="modal-head"><div><span class="eyebrow">AIRBNB EARNINGS CSV</span><h2>导入销售数据</h2></div><button class="btn" id="salesImportClose">关闭</button></div><div class="sales-sync-note"><strong>不会覆盖你手工填写的订单。</strong> 平台销售数据会作为独立来源保存；能对应到现有订单时自动关联，无法对应时也能进入销售统计。</div><h3 style="font-size:14px">① 确认CSV列</h3><div class="sales-column-grid">${[
      ['code','预约/Confirmation code'],['listing','房源名称'],['guest','客人'],['checkin','入住日'],['checkout','退房日'],['gross','销售总额/Gross earnings'],['fee','Airbnb服务费/Host fee'],['payout','实际受取/Amount'],['cleaning','客人支付的清扫费'],['payoutdate','到账/交易日期'],['currency','币种'],['type','交易类型']
    ].map(([k,l])=>`<label>${l}<select data-sales-col="${k}">${selectOptions(parsed.headers,map[k])}</select></label>`).join('')}</div><div class="sales-preview"><table><thead><tr>${parsed.headers.slice(0,8).map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${parsed.rows.slice(0,4).map(r=>`<tr>${r.slice(0,8).map(x=>`<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><div id="salesImportMsg" class="sales-import-status"></div><div class="form-actions" style="margin-top:14px"><button class="btn primary" id="salesImportNext">下一步：对应房间</button></div></div></div>`);
    const modal=document.querySelector('#salesImportModal');document.querySelector('#salesImportClose').onclick=()=>modal.remove();modal.onclick=e=>{if(e.target===modal)modal.remove()};
    document.querySelector('#salesImportNext').onclick=async()=>{
      const chosen={};document.querySelectorAll('[data-sales-col]').forEach(s=>chosen[s.dataset.salesCol]=Number(s.value));
      if(chosen.checkin<0)return showImportMsg('请指定“入住日”列。');
      if(chosen.listing<0)return showImportMsg('请指定“房源名称”列。这样才能和PMS房间对应。');
      if(chosen.gross<0&&chosen.payout<0)return showImportMsg('至少指定“销售总额”或“实际受取”其中一列。');
      try{await showListingMapping(parsed,chosen,file.name)}catch(e){showImportMsg(e.message)}
    };
  }
  function showImportMsg(s,ok=false){const m=document.querySelector('#salesImportMsg');if(m)m.innerHTML=`<div class="message ${ok?'':'error'}">${esc(s)}</div>`}

  async function showListingMapping(parsed,map,filename){
    showImportMsg('正在读取现有房源对应…',true);const ctx=await context();
    const listings=[...new Set(parsed.rows.map(r=>String(val(r,map,'listing')).trim()).filter(Boolean))];
    if(!listings.length)throw new Error('CSV里没有找到房源名称。');
    const existing=new Map(ctx.maps.map(x=>[x.external_listing_key,x.unit_id]));
    const autoUnit=(listing)=>{const n=norm(listing);const hits=ctx.units.filter(u=>n.includes(norm(u.name))&&(n.includes(norm(u.property))||ctx.units.length===1));return hits.length===1?hits[0].id:''};
    const box=document.querySelector('#salesImportModal .modal');
    const old=box.querySelector('[data-sales-stage2]');old?.remove();
    box.insertAdjacentHTML('beforeend',`<div data-sales-stage2><h3 style="font-size:14px">② 把Airbnb房源对应到PMS房间</h3><div class="sales-map-grid">${listings.map((l,i)=>{const selected=existing.get(l)||autoUnit(l);return `<div class="sales-map-row"><div><strong>${esc(l)}</strong><br><small class="muted">Airbnb</small></div><select data-listing-map="${i}"><option value="">（不导入这个房源）</option>${ctx.units.map(u=>`<option value="${u.id}" ${u.id===selected?'selected':''}>${esc(u.label)}</option>`).join('')}</select></div>`}).join('')}</div><div class="form-actions" style="margin-top:14px"><button class="btn primary" id="salesImportRun">导入 ${parsed.rows.length} 行</button></div></div>`);
    box.querySelector('#salesImportRun').onclick=async()=>{
      const lm=new Map();listings.forEach((l,i)=>lm.set(l,box.querySelector(`[data-listing-map="${i}"]`).value));
      if(![...lm.values()].some(Boolean))return showImportMsg('至少需要对应一个PMS房间。');
      try{await importRows(ctx,parsed,map,lm,filename);document.querySelector('#salesImportModal')?.remove();alert('Airbnb销售数据已导入。\n财务页和首页会使用同步后的销售额。');setTimeout(()=>location.reload(),100)}catch(e){showImportMsg(e.message)}
    };
  }

  async function importRows(ctx,parsed,map,listingMap,filename){
    showImportMsg('正在导入，请不要关闭页面…',true);
    for(const [listing,unitId] of listingMap){if(!unitId)continue;await raw('/rest/v1/provider_listing_mappings?on_conflict=organization_id,provider,external_listing_key',{method:'POST',body:{organization_id:ctx.orgId,provider:'Airbnb',external_listing_key:listing,display_name:listing,unit_id:unitId},headers:{Prefer:'resolution=merge-duplicates,return=minimal'}})}
    const prepared=[];
    for(const row of parsed.rows){
      const listing=String(val(row,map,'listing')).trim(),unitId=listingMap.get(listing);if(!unitId)continue;
      const checkIn=date(val(row,map,'checkin'));if(!checkIn)continue;
      const checkOut=date(val(row,map,'checkout'));
      let gross=money(val(row,map,'gross')),fee=money(val(row,map,'fee'),{abs:true}),payout=money(val(row,map,'payout'));
      const cleaning=money(val(row,map,'cleaning'),{abs:true});
      if(gross==null&&payout!=null&&fee!=null)gross=Math.max(0,payout+fee);
      if(gross==null&&payout==null)continue;
      const type=String(val(row,map,'type')).trim();
      const rec={organization_id:ctx.orgId,provider:'Airbnb',source_type:'csv',source_key:'',external_reservation_id:String(val(row,map,'code')).trim()||null,external_listing_key:listing,unit_id:unitId,guest_name:String(val(row,map,'guest')).trim()||null,check_in:checkIn,check_out:checkOut,gross_amount_yen:gross==null?null:Math.max(0,gross),platform_fee_yen:fee,payout_amount_yen:payout,cleaning_fee_yen:cleaning,currency_code:String(val(row,map,'currency')).trim()||'JPY',payout_date:date(val(row,map,'payoutdate')),transaction_type:type||null,raw_payload:{filename,row:Object.fromEntries(parsed.headers.map((h,i)=>[h,row[i]??'']))}};
      rec.source_key=sourceKey(rec);prepared.push(rec);
    }
    if(!prepared.length)throw new Error('没有找到可导入的销售记录。请检查CSV列对应。');
    const min=prepared.map(x=>x.check_in).sort()[0],max=prepared.map(x=>x.check_in).sort().at(-1);
    const reservations=await raw(`/rest/v1/reservations?select=id,unit_id,check_in,check_out,guest_name_snapshot&organization_id=eq.${encodeURIComponent(ctx.orgId)}&check_in=gte.${min}&check_in=lte.${max}&status=neq.cancelled&limit=2000`).catch(()=>[]);
    for(const rec of prepared){const hits=(reservations||[]).filter(r=>r.unit_id===rec.unit_id&&r.check_in===rec.check_in&&(!rec.check_out||r.check_out===rec.check_out));if(hits.length===1)rec.reservation_id=hits[0].id}
    const chunk=50;for(let i=0;i<prepared.length;i+=chunk){await raw('/rest/v1/external_financial_records?on_conflict=organization_id,provider,source_key',{method:'POST',body:prepared.slice(i,i+chunk),headers:{Prefer:'resolution=merge-duplicates,return=minimal'}})}
  }

  async function loadSummary(){
    const ctx=await context();if(!ctx.mem.can_view_financials&&ctx.mem.role!=='owner')return null;
    const {a,b,label}=monthBounds(),org=encodeURIComponent(ctx.orgId);
    const [ext,manual,clean,expenses,invoices]=await Promise.all([
      raw(`/rest/v1/external_financial_records?select=id,reservation_id,provider,gross_amount_yen,platform_fee_yen,payout_amount_yen,check_in&organization_id=eq.${org}&check_in=gte.${a}&check_in=lt.${b}`),
      raw(`/rest/v1/reservations?select=id,gross_amount_yen,platform_fee_yen,status&organization_id=eq.${org}&status=neq.cancelled&check_in=gte.${a}&check_in=lt.${b}`),
      raw(`/rest/v1/cleaning_cost_entries?select=expected_amount_yen,excluded&organization_id=eq.${org}&checkout_date=gte.${a}&checkout_date=lt.${b}`),
      raw(`/rest/v1/expense_transactions?select=amount_yen&organization_id=eq.${org}&occurred_on=gte.${a}&occurred_on=lt.${b}`),
      raw(`/rest/v1/vendor_invoices?select=total_amount_yen&organization_id=eq.${org}&invoice_month=eq.${a}`),
    ]);
    const linked=new Set((ext||[]).map(x=>x.reservation_id).filter(Boolean));
    const unmatched=(manual||[]).filter(x=>!linked.has(x.id));
    const extGross=(ext||[]).reduce((s,x)=>s+(x.gross_amount_yen??((x.payout_amount_yen!=null&&x.platform_fee_yen!=null)?Math.max(0,x.payout_amount_yen+x.platform_fee_yen):Math.max(0,x.payout_amount_yen||0))),0);
    const extFee=(ext||[]).reduce((s,x)=>s+Math.abs(x.platform_fee_yen||0),0),extPayout=(ext||[]).reduce((s,x)=>s+(x.payout_amount_yen||0),0);
    const manualGross=unmatched.reduce((s,x)=>s+(x.gross_amount_yen||0),0),manualFee=unmatched.reduce((s,x)=>s+(x.platform_fee_yen||0),0);
    const gross=extGross+manualGross,fees=extFee+manualFee,expectedClean=(clean||[]).filter(x=>!x.excluded).reduce((s,x)=>s+(x.expected_amount_yen||0),0),other=(expenses||[]).reduce((s,x)=>s+(x.amount_yen||0),0),actualClean=(invoices||[]).reduce((s,x)=>s+(x.total_amount_yen||0),0),hasInvoice=(invoices||[]).length>0,cleanCost=hasInvoice?actualClean:expectedClean,profit=gross-fees-cleanCost-other;
    return {ctx,label,ext:ext||[],gross,fees,extGross,extFee,extPayout,manualCount:unmatched.length,expectedClean,actualClean,hasInvoice,other,profit};
  }

  function replaceMetric(labelText,value,small){const cards=[...document.querySelectorAll('.metric')];const card=cards.find(c=>c.querySelector('label')?.textContent.includes(labelText));if(!card)return;const strong=card.querySelector('strong'),sm=card.querySelector('small');if(strong)strong.textContent=yen(value);if(sm&&small)sm.textContent=small}
  function applySummary(s){
    const title=document.querySelector('#pageTitle')?.textContent?.trim();if(!s||!title)return;
    if(title==='经营概览'||title==='财务'){
      replaceMetric('住宿收入',s.gross,s.ext.length?`平台同步 ${s.ext.length} 笔${s.manualCount?` + 手工 ${s.manualCount} 笔`:''}`:`手工订单 ${s.manualCount} 笔`);
      if(title==='财务')replaceMetric('平台手续费',s.fees,s.ext.length?'优先使用平台同步数据':'渠道成本');
      if(title==='经营概览')replaceMetric('平台费 + 其他成本',s.fees+s.other,`平台费 ${yen(s.fees)}`);
      const netLabel=[...document.querySelectorAll('.metric label')].find(x=>x.textContent.includes('净利润'));if(netLabel){const c=netLabel.closest('.metric');c.querySelector('strong').textContent=yen(s.profit);const sm=c.querySelector('small');if(sm)sm.textContent=`收入 - 平台费 - ${s.hasInvoice?'实际':'预计'}清扫 - 其他`}
    }
    if(title==='财务'&&!document.querySelector('#salesFinancePanel')){
      const content=document.querySelector('#content');const panel=document.createElement('section');panel.className='panel sales-sync-panel';panel.id='salesFinancePanel';panel.innerHTML=`<div class="panel-head"><div><span class="eyebrow">SALES SYNC</span><h2>平台销售同步</h2></div><span class="sales-source-badge">Airbnb CSV</span></div><div class="sales-sync-stats"><div class="sales-sync-stat"><span>已同步销售额</span><strong>${yen(s.extGross)}</strong></div><div class="sales-sync-stat"><span>平台服务费</span><strong>${yen(s.extFee)}</strong></div><div class="sales-sync-stat"><span>平台记录受取额</span><strong>${yen(s.extPayout)}</strong></div><div class="sales-sync-stat"><span>本月同步记录</span><strong>${s.ext.length} 笔</strong></div></div><p class="muted-link">当前 iCal 仍只负责房态；销售数据由独立财务来源导入，避免把“平台占用”误当成有收入的订单。</p>`;content.appendChild(panel)
    }
  }

  async function renderSettingsPanel(){
    if(document.querySelector('#pageTitle')?.textContent.trim()!=='设置'||document.querySelector('#salesSyncSettings'))return;
    const ctx=await context();if(ctx.mem.role!=='owner'&&!ctx.mem.can_view_financials)return;
    const panel=document.createElement('section');panel.className='panel sales-sync-panel';panel.id='salesSyncSettings';panel.innerHTML=`<div class="panel-head"><div><span class="eyebrow">SALES · FINANCE</span><h2>销售数据同步</h2></div><span class="sales-source-badge">STEP 1</span></div><div class="sales-sync-note"><strong>现在可用：Airbnb Earnings CSV 导入。</strong> 系统会保存房源对应关系，之后再次导入同一份/更新后的报表不会重复计算。官方API权限准备好后，会把这里切成自动同步。</div><div class="row"><div><strong>Airbnb 销售/收入报表</strong><br><small>支持 Airbnb Earnings → Get report 导出的 CSV；列名不同也可以手动对应。</small></div><div class="sales-sync-actions"><input type="file" id="airbnbSalesCsv" accept=".csv,text/csv"><button class="btn primary" id="airbnbSalesImport">读取CSV</button></div></div>`;
    const integration=[...document.querySelectorAll('#content .panel h2')].find(x=>x.textContent.includes('平台连接'))?.closest('.panel');if(integration)document.querySelector('#content').insertBefore(panel,integration);else document.querySelector('#content').appendChild(panel);
    panel.querySelector('#airbnbSalesImport').onclick=()=>{const f=panel.querySelector('#airbnbSalesCsv').files?.[0];if(!f)return alert('请先选择 Airbnb 导出的 CSV 文件。');beginImport(f).catch(e=>alert(e.message))};
  }

  async function tick(){
    if(running)return;const title=document.querySelector('#pageTitle')?.textContent?.trim();if(!['设置','财务','经营概览'].includes(title))return;running=true;
    try{if(title==='设置')await renderSettingsPanel();else{const s=await loadSummary();const key=title+'|'+s?.ext?.length+'|'+s?.gross+'|'+s?.profit;if(key!==lastSummaryKey||!document.querySelector('#salesFinancePanel')){lastSummaryKey=key;applySummary(s)}}}catch(e){console.warn('sales sync UI',e)}finally{running=false}
  }
  const observer=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(tick,120)});observer.observe(document.documentElement,{childList:true,subtree:true});window.addEventListener('load',()=>setTimeout(tick,600));setTimeout(tick,900);
})();