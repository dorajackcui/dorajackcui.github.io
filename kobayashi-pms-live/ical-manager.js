(function(){
  const SB_URL='https://cxaoomvagqpuatlfthlx.supabase.co';
  const SB_KEY='sb_publishable_ud3RGvS6BIe03XJzMZIOSQ_h_QrULbF';
  const SESSION_KEY='kobayashi_pms_session_v1';
  let loading=false,calendarLoading=false,calendarStart=tokyoToday();

  function session(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{return null}}
  function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function tokyoToday(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
  function addDays(s,n){const d=new Date(s+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
  function dayDiff(a,b){return Math.round((new Date(b+'T00:00:00Z')-new Date(a+'T00:00:00Z'))/86400000)}
  async function raw(path,{method='GET',body}={}){const s=session();if(!s?.access_token)throw new Error('请先登录');const h={apikey:SB_KEY,Authorization:`Bearer ${s.access_token}`};if(body!==undefined)h['Content-Type']='application/json';const r=await fetch(SB_URL+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)});const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{data=text}if(!r.ok)throw new Error(data?.message||data?.error_description||data?.error||`HTTP ${r.status}`);return data}
  async function org(){const u=await raw('/auth/v1/user');const m=await raw(`/rest/v1/memberships?select=organization_id,role&user_id=eq.${encodeURIComponent(u.id)}&limit=1`);return m?.[0]||null}
  function timeLabel(v){if(!v)return '尚未同步';try{return new Date(v).toLocaleString('zh-CN')}catch{return v}}
  function addStyles(){if(document.getElementById('icalStyles'))return;const s=document.createElement('style');s.id='icalStyles';s.textContent=`.ical-panel{margin-top:16px}.ical-form{display:grid;grid-template-columns:1.2fr 1fr 1.2fr 2.4fr auto;gap:10px;align-items:end}.ical-form label{display:grid;gap:6px;font-size:12px;font-weight:700}.ical-form input,.ical-form select{border:1px solid #dfe3eb;border-radius:10px;padding:10px;background:#fff;min-width:0}.ical-feed-row{display:grid;grid-template-columns:1.6fr 1.2fr 1fr auto;gap:12px;align-items:center;padding:13px 0;border-top:1px solid #eceef3}.ical-feed-row:first-of-type{border-top:0}.ical-feed-meta{display:flex;flex-direction:column;gap:3px}.ical-feed-meta small{color:#7b8495}.ical-safe{padding:10px 12px;border-radius:10px;background:#eefbf5;color:#166534;font-size:12px;margin:8px 0 14px;line-height:1.6}.ical-error{color:#b91c1c!important}.ical-actions{display:flex;gap:8px;flex-wrap:wrap}.ical-delete{color:#b91c1c!important}.ical-booking{background:linear-gradient(135deg,#d18b2f,#e6a84e)!important;outline:1px dashed rgba(255,255,255,.8);outline-offset:-4px;cursor:default!important}.ical-legend{font-size:12px;color:#8a5a18;margin-left:8px;padding:5px 9px;border-radius:999px;background:#fff6e8}@media(max-width:900px){.ical-form{grid-template-columns:1fr 1fr}.ical-form .wide{grid-column:1/-1}.ical-feed-row{grid-template-columns:1fr}.ical-actions{justify-content:flex-start}}`;document.head.appendChild(s)}

  async function syncFeed(feedId){const d=await raw('/functions/v1/sync-ical',{method:'POST',body:{feed_id:feedId}});if(d?.error)throw new Error(d.error);return d}

  async function renderSettings(){
    const title=document.querySelector('#pageTitle'),content=document.querySelector('#content');
    if(!title||!content||title.textContent.trim()!=='设置'||loading)return;
    if(document.getElementById('icalManagerPanel'))return;
    loading=true;addStyles();
    try{
      const mem=await org();if(!mem||mem.role!=='owner')return;
      const q=encodeURIComponent(mem.organization_id);
      const [props,feeds]=await Promise.all([
        raw(`/rest/v1/properties?select=id,name,active,units(id,name,active)&organization_id=eq.${q}&order=display_order.asc,name.asc`),
        raw(`/rest/v1/ical_feeds?select=id,unit_id,provider,display_name,active,last_success_at,last_error,created_at&organization_id=eq.${q}&order=created_at.desc`)
      ]);
      const units=[];for(const p of props||[]){if(!p.active)continue;for(const u of p.units||[]){if(u.active)units.push({id:u.id,label:`${p.name} · ${u.name}`})}}
      const unitMap=new Map(units.map(x=>[x.id,x.label]));
      const panel=document.createElement('section');panel.className='panel ical-panel';panel.id='icalManagerPanel';
      panel.innerHTML=`<div class="panel-head"><div><span class="eyebrow">ICAL · READ ONLY</span><h2>房态自动同步</h2></div></div><div class="ical-safe">✓ 当前只做单向读取：平台日历 → Kobayashi PMS。不会反向修改 Airbnb / Booking；平台日历里的 Blocked / Not available 也不会直接变成财务订单，因此不会误算收入或清扫费。</div>${units.length?`<form class="ical-form" id="icalForm"><label>房间<select id="icalUnit">${units.map(u=>`<option value="${u.id}">${esc(u.label)}</option>`).join('')}</select></label><label>来源<select id="icalProvider"><option>Airbnb</option><option>Booking.com</option><option>Agoda</option><option>Expedia</option><option>Other iCal</option></select></label><label>名称<input id="icalName" placeholder="例：Airbnb 大山1F"></label><label class="wide">iCal 地址<input id="icalUrl" type="url" placeholder="https://... .ics" required></label><button class="btn primary">＋ 添加并同步</button></form>`:'<div class="empty">请先新增房源和房间。</div>'}<div id="icalMsg"></div><div id="icalFeedList">${(feeds||[]).length?(feeds||[]).map(f=>`<div class="ical-feed-row"><div class="ical-feed-meta"><strong>${esc(f.display_name)}</strong><small>${esc(unitMap.get(f.unit_id)||'房间')} · ${esc(f.provider)} · ${f.active?'已启用':'已暂停'}</small></div><div class="ical-feed-meta"><span>最近成功同步</span><small>${esc(timeLabel(f.last_success_at))}</small></div><div class="ical-feed-meta"><span>${f.last_error?'<b class="ical-error">需检查</b>':'状态正常'}</span><small class="${f.last_error?'ical-error':''}">${esc(f.last_error||'')}</small></div><div class="ical-actions"><button class="btn small" data-ical-sync="${f.id}" ${f.active?'':'disabled'}>立即同步</button><button class="btn small" data-ical-toggle="${f.id}" data-active="${f.active}">${f.active?'暂停':'恢复'}</button><button class="btn small ical-delete" data-ical-delete="${f.id}" data-name="${esc(f.display_name)}">删除</button></div></div>`).join(''):'<div class="empty">还没有连接 iCal。添加后会立即做第一次同步。</div>'}</div>`;
      const integrationHead=[...content.querySelectorAll('.panel h2')].find(x=>x.textContent.includes('平台连接'))?.closest('.panel');if(integrationHead)content.insertBefore(panel,integrationHead);else content.appendChild(panel);
      const form=document.getElementById('icalForm');if(form)form.onsubmit=async e=>{e.preventDefault();const msg=document.getElementById('icalMsg');msg.innerHTML='<div class="message">正在保存并同步 iCal…</div>';try{const provider=document.getElementById('icalProvider').value,unitId=document.getElementById('icalUnit').value,name=document.getElementById('icalName').value.trim()||`${provider} · ${unitMap.get(unitId)}`,url=document.getElementById('icalUrl').value.trim().replace(/^webcal:\/\//i,'https://');const feedId=await raw('/rest/v1/rpc/create_ical_feed',{method:'POST',body:{p_organization_id:mem.organization_id,p_unit_id:unitId,p_provider:provider,p_display_name:name,p_feed_url:url}});const d=await syncFeed(feedId);alert(`iCal 已连接并同步。\n读取 ${d.items_seen||0} 项，房态更新 ${d.items_changed||0} 项。\n\n这些事件目前只影响房态，不影响收入和清扫费。`);location.reload()}catch(err){msg.innerHTML=`<div class="message error">${esc(err.message)}</div>`}};
      panel.querySelectorAll('[data-ical-sync]').forEach(b=>b.onclick=async()=>{b.disabled=true;const old=b.textContent;b.textContent='同步中…';try{const d=await syncFeed(b.dataset.icalSync);alert(`同步完成\n读取 ${d.items_seen||0} 项\n房态更新 ${d.items_changed||0} 项\n\n不会自动生成收入或清扫费。`);location.reload()}catch(err){alert(`同步失败：${err.message}`);b.disabled=false;b.textContent=old}});
      panel.querySelectorAll('[data-ical-toggle]').forEach(b=>b.onclick=async()=>{try{await raw('/rest/v1/rpc/set_ical_feed_active',{method:'POST',body:{p_feed_id:b.dataset.icalToggle,p_active:b.dataset.active!=='true'}});panel.remove();await renderSettings()}catch(err){alert(err.message)}});
      panel.querySelectorAll('[data-ical-delete]').forEach(b=>b.onclick=async()=>{if(!confirm(`删除「${b.dataset.name}」的 iCal 连接？\n缓存房态会一起删除，但手工订单和财务不会受影响。`))return;try{await raw('/rest/v1/rpc/delete_ical_feed',{method:'POST',body:{p_feed_id:b.dataset.icalDelete}});panel.remove();await renderSettings()}catch(err){alert(err.message)}});
    }catch(err){console.error(err)}finally{loading=false}
  }

  async function renderCalendarIcal(){
    const title=document.querySelector('#pageTitle');if(!title||title.textContent.trim()!=='房态日历'||calendarLoading)return;
    const rows=[...document.querySelectorAll('.calendar-row')];if(!rows.length)return;calendarLoading=true;addStyles();
    try{
      const mem=await org();if(!mem)return;const q=encodeURIComponent(mem.organization_id),end=addDays(calendarStart,13);
      const [props,events]=await Promise.all([
        raw(`/rest/v1/properties?select=id,name,active,display_order,units(id,name,active,display_order)&organization_id=eq.${q}&order=display_order.asc,name.asc`),
        raw(`/rest/v1/ical_events?select=id,unit_id,starts_on,ends_on,summary,external_status,ical_feeds(provider,display_name)&organization_id=eq.${q}&active=eq.true&starts_on=lte.${end}&ends_on=gt.${calendarStart}`)
      ]);
      const units=[];for(const p of props||[]){if(!p.active)continue;for(const u of (p.units||[]).filter(x=>x.active).sort((a,b)=>(a.display_order||0)-(b.display_order||0)||a.name.localeCompare(b.name)))units.push(u)}
      document.querySelectorAll('.ical-booking').forEach(x=>x.remove());
      rows.forEach((row,idx)=>{const unit=units[idx];if(!unit)return;const timeline=row.querySelector('.timeline');if(!timeline)return;const existingCols=new Set([...timeline.querySelectorAll('.booking:not(.ical-booking)')].map(x=>x.style.gridColumn));for(const e of (events||[]).filter(x=>x.unit_id===unit.id)){const clipped=e.starts_on<calendarStart?calendarStart:e.starts_on,col=dayDiff(calendarStart,clipped)+1,span=Math.max(1,Math.min(dayDiff(clipped,e.ends_on),15-col)),grid=`${col} / span ${span}`;if(existingCols.has(grid))continue;const feed=Array.isArray(e.ical_feeds)?e.ical_feeds[0]:e.ical_feeds,provider=feed?.provider||'iCal',label=e.summary||`${provider} 占用`;const el=document.createElement('div');el.className='booking ical-booking';el.style.gridColumn=grid;el.textContent=`${label} · ${provider}`;el.title=`${label} · ${provider} iCal（只读房态，不计财务）`;timeline.appendChild(el)}});
      const toolbar=document.querySelector('.toolbar');if(toolbar&&!toolbar.querySelector('.ical-legend')){const tag=document.createElement('span');tag.className='ical-legend';tag.textContent='橙色虚线＝iCal只读占用';toolbar.appendChild(tag)}
    }catch(err){console.error('iCal calendar render',err)}finally{calendarLoading=false}
  }

  document.addEventListener('click',e=>{const el=e.target.closest?.('#prevWeek,#nextWeek,#today');if(!el)return;const title=document.querySelector('#pageTitle');if(!title||title.textContent.trim()!=='房态日历')return;if(el.id==='prevWeek')calendarStart=addDays(calendarStart,-7);else if(el.id==='nextWeek')calendarStart=addDays(calendarStart,7);else calendarStart=tokyoToday();setTimeout(renderCalendarIcal,120)},true);
  const ob=new MutationObserver(()=>{clearTimeout(window.__icalPanelT);window.__icalPanelT=setTimeout(()=>{renderSettings();renderCalendarIcal()},120)});ob.observe(document.documentElement,{subtree:true,childList:true});window.addEventListener('load',()=>setTimeout(()=>{renderSettings();renderCalendarIcal()},700));setTimeout(()=>{renderSettings();renderCalendarIcal()},1000);
})();
