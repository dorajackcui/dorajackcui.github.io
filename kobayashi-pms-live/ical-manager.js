(function(){
  const SB_URL='https://cxaoomvagqpuatlfthlx.supabase.co';
  const SB_KEY='sb_publishable_ud3RGvS6BIe03XJzMZIOSQ_h_QrULbF';
  const SESSION_KEY='kobayashi_pms_session_v1';
  let loading=false;

  function session(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{return null}}
  function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  async function raw(path,{method='GET',body}={}){const s=session();if(!s?.access_token)throw new Error('请先登录');const h={apikey:SB_KEY,Authorization:`Bearer ${s.access_token}`};if(body!==undefined)h['Content-Type']='application/json';const r=await fetch(SB_URL+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)});const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{data=text}if(!r.ok)throw new Error(data?.message||data?.error_description||data?.error||`HTTP ${r.status}`);return data}
  async function org(){const u=await raw('/auth/v1/user');const m=await raw(`/rest/v1/memberships?select=organization_id,role&user_id=eq.${encodeURIComponent(u.id)}&limit=1`);return m?.[0]||null}
  function timeLabel(v){if(!v)return '尚未同步';try{return new Date(v).toLocaleString('zh-CN')}catch{return v}}
  function addStyles(){if(document.getElementById('icalStyles'))return;const s=document.createElement('style');s.id='icalStyles';s.textContent=`.ical-panel{margin-top:16px}.ical-form{display:grid;grid-template-columns:1.2fr 1fr 1.2fr 2.4fr auto;gap:10px;align-items:end}.ical-form label{display:grid;gap:6px;font-size:12px;font-weight:700}.ical-form input,.ical-form select{border:1px solid #dfe3eb;border-radius:10px;padding:10px;background:#fff;min-width:0}.ical-feed-row{display:grid;grid-template-columns:1.6fr 1.2fr 1fr auto;gap:12px;align-items:center;padding:13px 0;border-top:1px solid #eceef3}.ical-feed-row:first-of-type{border-top:0}.ical-feed-meta{display:flex;flex-direction:column;gap:3px}.ical-feed-meta small{color:#7b8495}.ical-safe{padding:10px 12px;border-radius:10px;background:#eefbf5;color:#166534;font-size:12px;margin:8px 0 14px}.ical-error{color:#b91c1c!important}.ical-actions{display:flex;gap:8px;flex-wrap:wrap}@media(max-width:900px){.ical-form{grid-template-columns:1fr 1fr}.ical-form .wide{grid-column:1/-1}.ical-feed-row{grid-template-columns:1fr}.ical-actions{justify-content:flex-start}}`;document.head.appendChild(s)}

  async function render(){
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
      panel.innerHTML=`<div class="panel-head"><div><span class="eyebrow">ICAL · READ ONLY</span><h2>房态自动同步</h2></div></div><div class="ical-safe">✓ 当前只做单向读取：平台日历 → Kobayashi PMS。不会反向修改 Airbnb / Booking 等平台，也不会向外写入房态。</div>${units.length?`<form class="ical-form" id="icalForm"><label>房间<select id="icalUnit">${units.map(u=>`<option value="${u.id}">${esc(u.label)}</option>`).join('')}</select></label><label>来源<select id="icalProvider"><option>Airbnb</option><option>Booking.com</option><option>Agoda</option><option>Expedia</option><option>Other</option></select></label><label>名称<input id="icalName" placeholder="例：Airbnb 大山1F"></label><label class="wide">iCal 地址<input id="icalUrl" type="url" placeholder="https://... .ics" required></label><button class="btn primary">＋ 添加</button></form>`:'<div class="empty">请先新增房源和房间。</div>'}<div id="icalMsg"></div><div id="icalFeedList">${(feeds||[]).length?(feeds||[]).map(f=>`<div class="ical-feed-row"><div class="ical-feed-meta"><strong>${esc(f.display_name)}</strong><small>${esc(unitMap.get(f.unit_id)||'房间')} · ${esc(f.provider)} · ${f.active?'已启用':'已停用'}</small></div><div class="ical-feed-meta"><span>最近成功同步</span><small>${esc(timeLabel(f.last_success_at))}</small></div><div class="ical-feed-meta"><span>${f.last_error?'<b class="ical-error">需检查</b>':'状态正常'}</span><small class="${f.last_error?'ical-error':''}">${esc(f.last_error||'')}</small></div><div class="ical-actions"><button class="btn small" data-ical-sync="${f.id}" ${f.active?'':'disabled'}>立即同步</button><button class="btn small" data-ical-toggle="${f.id}" data-active="${f.active}">${f.active?'停用':'恢复'}</button></div></div>`).join(''):'<div class="empty">还没有连接 iCal。添加后可先手动点“立即同步”测试。</div>'}</div>`;
      content.appendChild(panel);
      const form=document.getElementById('icalForm');if(form)form.onsubmit=async e=>{e.preventDefault();const msg=document.getElementById('icalMsg');msg.innerHTML='<div class="message">正在保存 iCal 连接…</div>';try{const provider=document.getElementById('icalProvider').value,unitId=document.getElementById('icalUnit').value,name=document.getElementById('icalName').value.trim()||`${provider} · ${unitMap.get(unitId)}`,url=document.getElementById('icalUrl').value.trim().replace(/^webcal:\/\//i,'https://');await raw('/rest/v1/rpc/create_ical_feed',{method:'POST',body:{p_organization_id:mem.organization_id,p_unit_id:unitId,p_provider:provider,p_display_name:name,p_feed_url:url}});panel.remove();await render()}catch(err){msg.innerHTML=`<div class="message error">${esc(err.message)}</div>`}};
      panel.querySelectorAll('[data-ical-sync]').forEach(b=>b.onclick=async()=>{b.disabled=true;const old=b.textContent;b.textContent='同步中…';try{const d=await raw('/functions/v1/sync-ical',{method:'POST',body:{feed_id:b.dataset.icalSync}});alert(`同步完成\n读取 ${d.items_seen} 项\n新增/更新/取消 ${d.items_changed} 项${d.conflicts?.length?`\n需确认冲突 ${d.conflicts.length} 项`:''}\n\n为刷新房态，页面将重新加载。`);location.reload()}catch(err){alert(`同步失败：${err.message}`);b.disabled=false;b.textContent=old}});
      panel.querySelectorAll('[data-ical-toggle]').forEach(b=>b.onclick=async()=>{try{await raw('/rest/v1/rpc/set_ical_feed_active',{method:'POST',body:{p_feed_id:b.dataset.icalToggle,p_active:b.dataset.active!=='true'}});panel.remove();await render()}catch(err){alert(err.message)}});
    }catch(err){console.error(err)}finally{loading=false}
  }
  const ob=new MutationObserver(()=>{clearTimeout(window.__icalPanelT);window.__icalPanelT=setTimeout(render,120)});ob.observe(document.documentElement,{subtree:true,childList:true});window.addEventListener('load',()=>setTimeout(render,700));setTimeout(render,1000);
})();
