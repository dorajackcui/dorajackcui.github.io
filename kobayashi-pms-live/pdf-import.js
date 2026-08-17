const PDF_SB_URL='https://cxaoomvagqpuatlfthlx.supabase.co';
const PDF_SB_KEY='sb_publishable_ud3RGvS6BIe03XJzMZIOSQ_h_QrULbF';
const PDF_SESSION_KEY='kobayashi_pms_session_v1';
let pdfImportInjected=false;

function pdfSession(){try{return JSON.parse(localStorage.getItem(PDF_SESSION_KEY)||'null')}catch{return null}}
function pdfYen(n){return new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0)}
function pdfEsc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function pdfRaw(path,{method='GET',body,headers={}}={}){const s=pdfSession();if(!s?.access_token)throw new Error('请先登录');const h={apikey:PDF_SB_KEY,Authorization:`Bearer ${s.access_token}`,...headers};let payload=body;if(body!==undefined && !(body instanceof Blob) && !(body instanceof ArrayBuffer) && !(body instanceof Uint8Array)){h['Content-Type']='application/json';payload=JSON.stringify(body)}const r=await fetch(PDF_SB_URL+path,{method,headers:h,body:payload});const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{data=text}if(!r.ok)throw new Error(data?.message||data?.error_description||data?.error||`HTTP ${r.status}`);return {data,response:r}}
async function pdfOrg(){const s=pdfSession();if(!s)return null;const u=await pdfRaw('/auth/v1/user');const id=u.data?.id;if(!id)return null;const x=await pdfRaw(`/rest/v1/memberships?select=organization_id,role&user_id=eq.${encodeURIComponent(id)}&limit=1`);return x.data?.[0]||null}
function moneyCell(v){const m=String(v||'').match(/[0-9][0-9,]*/);return m?Number(m[0].replace(/,/g,'')):0}
function fwToAscii(s){return String(s||'').replace(/[０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0))}
function normName(s){return fwToAscii(s).toUpperCase().replace(/([0-9]+)階/g,'$1F').replace(/[\s　・･()（）\[\]【】\-ー_\.]/g,'')}
function inferMonth(filename){const m=String(filename||'').match(/(20\d{2})[\.\-_年](\d{1,2})/);if(!m)return null;return {year:Number(m[1]),month:Number(m[2])}}
function monthStart(year,month){return `${year}-${String(month).padStart(2,'0')}-01`}
function nextMonth(year,month){return month===12?`${year+1}-01-01`:`${year}-${String(month+1).padStart(2,'0')}-01`}

async function parseCleaningPdf(file){
  const pdfjs=await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs';
  const data=new Uint8Array(await file.arrayBuffer());
  const doc=await pdfjs.getDocument({data}).promise;
  const inferred=inferMonth(file.name);
  let year=inferred?.year,month=inferred?.month;
  if(!year||!month){const s=prompt('无法从文件名判断账单月份。请输入 YYYY-MM，例如 2026-05');const m=s?.match(/^(20\d{2})-(\d{1,2})$/);if(!m)throw new Error('无法判断账单月份');year=Number(m[1]);month=Number(m[2])}
  const items=[];let invoiceTotal=null,lastDay=null;
  for(let p=1;p<=doc.numPages;p++){
    const page=await doc.getPage(p);const viewport=page.getViewport({scale:1});const tc=await page.getTextContent();
    const groups=[];
    for(const it of tc.items){if(!('str' in it)||!String(it.str).trim())continue;const x=it.transform[4],y=it.transform[5];let g=groups.find(r=>Math.abs(r.y-y)<2.2);if(!g){g={y,items:[]};groups.push(g)}g.items.push({x,str:String(it.str).trim()})}
    groups.sort((a,b)=>b.y-a.y);
    const W=viewport.width;const bounds=[0,W*0.155,W*0.354,W*0.410,W*0.522,W*0.622,W*0.783,W*0.845,Infinity];
    for(const g of groups){const cells=Array(8).fill('');for(const it of g.items.sort((a,b)=>a.x-b.x)){let col=7;for(let i=0;i<8;i++){if(it.x>=bounds[i]&&it.x<bounds[i+1]){col=i;break}}cells[col]+=it.str}
      const joined=cells.join('|');
      if(joined.includes('総合計金額')){const nums=g.items.map(x=>moneyCell(x.str)).filter(Boolean);if(nums.length)invoiceTotal=Math.max(...nums);continue}
      if(joined.includes('小計')||joined.includes('日付')||joined.includes('基本清掃料金'))continue;
      const property=cells[1].trim();if(!property)continue;
      const dm=cells[0].match(/(\d{1,2})月(\d{1,2})日/);if(dm)lastDay=Number(dm[2]);
      if(!lastDay)continue;
      const vals=cells.slice(3).map(moneyCell);if(!vals.some(v=>v>0))continue;
      const [basic,laundry,supplies,garbage,transport]=vals;
      items.push({service_date:`${year}-${String(month).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`,raw_property_name:property,raw_unit_name:cells[2].trim(),basic_cleaning_yen:basic,laundry_yen:laundry,supplies_yen:supplies,garbage_yen:garbage,transport_yen:transport,actual_amount_yen:basic+laundry+supplies+garbage+transport,unit_id:null,match_status:'unmatched',parse_confidence:1})
    }
  }
  const parsedTotal=items.reduce((s,x)=>s+x.actual_amount_yen,0);if(invoiceTotal==null)invoiceTotal=parsedTotal;
  return {year,month,invoiceMonth:monthStart(year,month),nextMonth:nextMonth(year,month),items,invoiceTotal,parsedTotal};
}

async function loadUnitsAndExpected(orgId,parsed){
  const [ps,cs]=await Promise.all([
    pdfRaw(`/rest/v1/properties?select=id,name,active,units(id,name,active)&organization_id=eq.${encodeURIComponent(orgId)}&order=name.asc`),
    pdfRaw(`/rest/v1/cleaning_cost_entries?select=id,unit_id,checkout_date,expected_amount_yen,excluded&organization_id=eq.${encodeURIComponent(orgId)}&checkout_date=gte.${parsed.invoiceMonth}&checkout_date=lt.${parsed.nextMonth}`)
  ]);
  const properties=ps.data||[],expected=(cs.data||[]).filter(x=>!x.excluded);const units=[];
  for(const p of properties){for(const u of p.units||[])units.push({id:u.id,name:u.name,active:u.active,propertyId:p.id,propertyName:p.name,propertyActive:p.active})}
  for(const row of parsed.items){const rp=normName(row.raw_property_name),ru=normName(row.raw_unit_name);let prop=properties.find(p=>{const n=normName(p.name);return n&&rp&&(rp.includes(n)||n.includes(rp))});let candidates=prop?(prop.units||[]):[];
    let unit=null;if(ru)unit=candidates.find(u=>normName(u.name)===ru)||candidates.find(u=>normName(u.name).includes(ru)||ru.includes(normName(u.name)));else if(candidates.length===1)unit=candidates[0];
    if(unit){row.unit_id=unit.id;row.match_status='matched'}
    const exp=row.unit_id?expected.find(x=>x.unit_id===row.unit_id&&x.checkout_date===row.service_date):null;row.expected_entry_id=exp?.id||null;row.expected_amount_yen=exp?.expected_amount_yen??null;
  }
  return {properties,units,expected};
}

function injectPdfStyles(){if(document.querySelector('#pdfImportStyles'))return;const style=document.createElement('style');style.id='pdfImportStyles';style.textContent=`
.pdf-import-modal{width:min(1180px,96vw);max-height:92vh;overflow:auto}.pdf-drop{border:2px dashed #d6d9e2;border-radius:14px;padding:22px;text-align:center;background:#fafbfe}.pdf-drop input{display:block;margin:12px auto}.pdf-summary{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:14px 0}.pdf-kpi{border:1px solid #e5e7ef;border-radius:12px;padding:12px;background:#fff}.pdf-kpi small{display:block;color:#777}.pdf-kpi strong{display:block;font-size:18px;margin-top:4px}.pdf-table{width:100%;border-collapse:collapse;font-size:12px}.pdf-table th,.pdf-table td{padding:8px;border-bottom:1px solid #eceef3;text-align:left;white-space:nowrap}.pdf-table-wrap{overflow:auto;max-height:48vh;border:1px solid #e5e7ef;border-radius:12px}.pdf-warn{color:#b45309}.pdf-ok{color:#047857}.pdf-unmatched{background:#fff7ed}.pdf-map{max-width:220px}.pdf-import-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:14px}.pdf-upload-btn{margin-left:8px}@media(max-width:760px){.pdf-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.pdf-import-modal{width:96vw}.pdf-table{font-size:11px}}
`;document.head.appendChild(style)}

async function openPdfImport(){injectPdfStyles();const mem=await pdfOrg();if(!mem||mem.role!=='owner')return alert('需要共同管理员权限');const orgId=mem.organization_id;
  document.body.insertAdjacentHTML('beforeend',`<div class="modal-bg" id="pdfImportModal"><div class="modal pdf-import-modal"><div class="modal-head"><div><span class="eyebrow">CLEANING INVOICE PDF</span><h2>上传清扫明细 PDF</h2></div><button class="btn" id="pdfClose">关闭</button></div><div class="pdf-drop"><strong>把清扫業者每月发来的原始 PDF 直接上传</strong><p class="muted">目前优先支持你提供的“清掃明細”表格格式。不会直接改账，解析后先让你确认。</p><input id="pdfFile" type="file" accept="application/pdf,.pdf"><div id="pdfStatus"></div></div><div id="pdfReview"></div></div></div>`);
  const modal=document.querySelector('#pdfImportModal');document.querySelector('#pdfClose').onclick=()=>modal.remove();modal.onclick=e=>{if(e.target===modal)modal.remove()};document.querySelector('#pdfFile').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;const st=document.querySelector('#pdfStatus');st.innerHTML='<div class="message">正在读取 PDF…</div>';try{const parsed=await parseCleaningPdf(file);if(!parsed.items.length)throw new Error('没有识别到清扫明细行。请确认 PDF 格式。');const lookup=await loadUnitsAndExpected(orgId,parsed);st.innerHTML='';renderPdfReview({file,parsed,lookup,orgId})}catch(err){st.innerHTML=`<div class="message error">${pdfEsc(err.message)}</div>`}}}

function renderPdfReview(ctx){const {file,parsed,lookup}=ctx;const matched=parsed.items.filter(x=>x.unit_id).length;const linked=parsed.items.filter(x=>x.expected_entry_id).length;const diffRows=parsed.items.filter(x=>x.expected_amount_yen!=null&&x.expected_amount_yen!==x.basic_cleaning_yen).length;const unmatched=parsed.items.length-matched;const unitOptions=lookup.units.map(u=>`<option value="${u.id}">${pdfEsc(u.propertyName)} · ${pdfEsc(u.name)}</option>`).join('');
  document.querySelector('#pdfReview').innerHTML=`<div class="pdf-summary"><div class="pdf-kpi"><small>账单月份</small><strong>${parsed.year}/${parsed.month}</strong></div><div class="pdf-kpi"><small>识别明细</small><strong>${parsed.items.length} 行</strong></div><div class="pdf-kpi"><small>PDF 总额</small><strong>${pdfYen(parsed.invoiceTotal)}</strong></div><div class="pdf-kpi"><small>明细合计</small><strong class="${parsed.invoiceTotal===parsed.parsedTotal?'pdf-ok':'pdf-warn'}">${pdfYen(parsed.parsedTotal)}</strong></div><div class="pdf-kpi"><small>需确认</small><strong class="${unmatched||diffRows?'pdf-warn':'pdf-ok'}">${unmatched+diffRows} 项</strong></div></div><div class="toolbar"><label>清扫業者名称 <input id="pdfVendor" value="清掃業者" style="margin-left:8px"></label><span class="muted">自动匹配房间 ${matched}/${parsed.items.length} · 对上退房记录 ${linked}/${parsed.items.length}</span></div><div class="pdf-table-wrap"><table class="pdf-table"><thead><tr><th>日期</th><th>PDF物件</th><th>号室</th><th>基本清扫</th><th>洗衣</th><th>备品</th><th>垃圾</th><th>交通</th><th>实际合计</th><th>系统预计</th><th>匹配</th></tr></thead><tbody>${parsed.items.map((r,i)=>{const warn=r.expected_amount_yen!=null&&r.expected_amount_yen!==r.basic_cleaning_yen;return `<tr class="${r.unit_id?'':'pdf-unmatched'}"><td>${r.service_date.slice(5)}</td><td>${pdfEsc(r.raw_property_name)}</td><td>${pdfEsc(r.raw_unit_name||'—')}</td><td class="${warn?'pdf-warn':''}">${pdfYen(r.basic_cleaning_yen)}</td><td>${pdfYen(r.laundry_yen)}</td><td>${pdfYen(r.supplies_yen)}</td><td>${pdfYen(r.garbage_yen)}</td><td>${pdfYen(r.transport_yen)}</td><td><strong>${pdfYen(r.actual_amount_yen)}</strong></td><td>${r.expected_amount_yen==null?'—':pdfYen(r.expected_amount_yen)}</td><td>${r.unit_id?`<span class="${r.expected_entry_id?'pdf-ok':'pdf-warn'}">${r.expected_entry_id?'✓ 退房匹配':'房间已匹配'}</span>`:`<select class="pdf-map" data-pdf-map="${i}"><option value="">请选择对应房间</option>${unitOptions}</select>`}</td></tr>`}).join('')}</tbody></table></div><div id="pdfImportMsg"></div><div class="pdf-import-actions"><button class="btn" id="pdfCancel">取消</button><button class="btn primary" id="pdfConfirm">确认导入并计入账单</button></div>`;
  document.querySelector('#pdfCancel').onclick=()=>document.querySelector('#pdfImportModal')?.remove();document.querySelectorAll('[data-pdf-map]').forEach(sel=>sel.onchange=()=>{const idx=Number(sel.dataset.pdfMap);parsed.items[idx].unit_id=sel.value||null;parsed.items[idx].match_status=sel.value?'manual':'unmatched'});document.querySelector('#pdfConfirm').onclick=()=>confirmPdfImport(ctx)}

async function confirmPdfImport({file,parsed,orgId}){const btn=document.querySelector('#pdfConfirm'),msg=document.querySelector('#pdfImportMsg');btn.disabled=true;msg.innerHTML='<div class="message">正在保存原始 PDF 和明细…</div>';try{const vendor=(document.querySelector('#pdfVendor').value||'清掃業者').trim();if(!vendor)throw new Error('请输入清扫業者名称');const safe=file.name.replace(/[^0-9A-Za-z._\-一-龯ぁ-んァ-ヶ]/g,'_');const objectPath=`${orgId}/${parsed.invoiceMonth}/${Date.now()}-${safe}`;const storageUrl=`/storage/v1/object/cleaning-invoices/${objectPath.split('/').map(encodeURIComponent).join('/')}`;await pdfRaw(storageUrl,{method:'POST',body:file,headers:{'Content-Type':'application/pdf','x-upsert':'true'}});const items=parsed.items.map(r=>({service_date:r.service_date,raw_property_name:r.raw_property_name,raw_unit_name:r.raw_unit_name,unit_id:r.unit_id,basic_cleaning_yen:r.basic_cleaning_yen,laundry_yen:r.laundry_yen,supplies_yen:r.supplies_yen,garbage_yen:r.garbage_yen,transport_yen:r.transport_yen,actual_amount_yen:r.actual_amount_yen,match_status:r.match_status,parse_confidence:r.parse_confidence}));const res=await pdfRaw('/rest/v1/rpc/import_cleaning_invoice',{method:'POST',body:{p_organization_id:orgId,p_vendor_name:vendor,p_invoice_month:parsed.invoiceMonth,p_source_file_name:file.name,p_source_file_path:objectPath,p_total_amount_yen:parsed.invoiceTotal,p_items:items}});const d=res.data;msg.innerHTML=`<div class="message">导入完成：${pdfYen(d?.parsed_total_yen)} · 匹配 ${d?.matched_count??0} 项 · 未匹配 ${d?.unmatched_count??0} 项</div>`;setTimeout(()=>location.reload(),1000)}catch(err){btn.disabled=false;msg.innerHTML=`<div class="message error">${pdfEsc(err.message)}</div>`}}

function injectPdfButton(){const title=document.querySelector('#pageTitle');if(!title||title.textContent.trim()!=='财务')return;const headings=[...document.querySelectorAll('.panel h2')];const h=headings.find(x=>x.textContent.includes('清扫業者账单'));if(!h)return;const panel=h.closest('.panel');const head=panel?.querySelector('.panel-head');if(!head||head.querySelector('#pdfUploadButton'))return;const button=document.createElement('button');button.id='pdfUploadButton';button.className='btn small pdf-upload-btn';button.textContent='↑ 上传 PDF';button.onclick=openPdfImport;const actions=head.querySelector('.panel-head-actions');if(actions)actions.appendChild(button);else head.appendChild(button)}

const obs=new MutationObserver(()=>{clearTimeout(window.__pmsPdfT);window.__pmsPdfT=setTimeout(injectPdfButton,80)});obs.observe(document.documentElement,{subtree:true,childList:true});window.addEventListener('load',injectPdfButton);setTimeout(injectPdfButton,800);
