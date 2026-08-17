(() => {
  if (window.__kobayashiMailMatchStatus) return;
  window.__kobayashiMailMatchStatus = true;
  const SB_URL='https://cxaoomvagqpuatlfthlx.supabase.co';
  const SB_KEY='sb_publishable_ud3RGvS6BIe03XJzMZIOSQ_h_QrULbF';
  const SESSION_KEY='kobayashi_pms_session_v1';
  let timer=null,loading=false;
  function session(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{return null}}
  function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  async function raw(path,{method='GET',body,headers={}}={}){const s=session();if(!s?.access_token)throw new Error('请先登录');const h={apikey:SB_KEY,Authorization:`Bearer ${s.access_token}`,...headers};if(body!==undefined)h['Content-Type']='application/json';const r=await fetch(SB_URL+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)});const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{data=text}if(!r.ok)throw new Error(data?.message||data?.error||`HTTP ${r.status}`);return data}
  async function context(){
    const u=await raw('/auth/v1/user');
    const ms=await raw(`/rest/v1/memberships?select=organization_id,role&user_id=eq.${encodeURIComponent(u.id)}&limit=1`);const m=ms?.[0];if(!m)return null;
    const org=encodeURIComponent(m.organization_id);
    const [messages,props,maps]=await Promise.all([
      raw(`/rest/v1/ota_email_messages?select=provider,external_listing_id,listing_label,match_status,reservation_id,sent_at&organization_id=eq.${org}&order=sent_at.desc&limit=1000`),
      raw(`/rest/v1/properties?select=id,name,active,units(id,name,active)&organization_id=eq.${org}&order=display_order.asc,name.asc`),
      raw(`/rest/v1/provider_listing_mappings?select=id,provider,external_listing_key,display_name,unit_id&organization_id=eq.${org}`),
    ]);
    const units=[];for(const p of props||[]){if(!p.active)continue;for(const x of p.units||[]){if(x.active)units.push({id:x.id,label:`${p.name} · ${x.name}`})}}
    return {m,messages:messages||[],units,maps:maps||[]};
  }
  function stats(msgs){return {total:msgs.length,matched:msgs.filter(x=>x.match_status==='matched').length,pending:msgs.filter(x=>x.match_status==='unmatched').length,mapping:msgs.filter(x=>x.match_status==='needs_mapping').length}}
  function pendingListings(ctx){
    const map=new Map();
    for(const x of ctx.messages){if(x.match_status!=='needs_mapping'||!x.external_listing_id)continue;const k=`${x.provider}|${x.external_listing_id}`;if(!map.has(k))map.set(k,{provider:x.provider,id:x.external_listing_id,label:x.listing_label||'',count:0});map.get(k).count++}
    return [...map.values()].filter(x=>!ctx.maps.some(m=>m.provider===x.provider&&m.external_listing_key===x.id));
  }
  function unitOptions(ctx,selected=''){return `<option value="">先不对应</option>${ctx.units.map(u=>`<option value="${u.id}" ${u.id===selected?'selected':''}>${esc(u.label)}</option>`).join('')}`}
  async function render(){
    const title=document.querySelector('#pageTitle'),content=document.querySelector('#content');if(!title||!content||title.textContent.trim()!=='设置'||loading)return;if(document.querySelector('#mailMatchStatus'))return;loading=true;
    try{
      const ctx=await context();if(!ctx)return;const s=stats(ctx.messages),pending=pendingListings(ctx);
      const panel=document.createElement('section');panel.className='panel match-status-panel';panel.id='mailMatchStatus';
      panel.innerHTML=`<div class="panel-head"><div><span class="eyebrow">AUTO MATCH · OTA MAIL + ICAL</span><h2>订单自动匹配</h2></div><span class="match-live-dot">● 自动运行中</span></div>
        <div class="match-metrics"><div><span>已读取</span><b>${s.total}</b></div><div class="ok"><span>已匹配</span><b>${s.matched}</b></div><div class="wait"><span>待更多信息</span><b>${s.pending}</b></div><div class="map"><span>待对应房间</span><b>${s.mapping}</b></div></div>
        <p class="match-help">系统会把平台邮件里的预约号、客人、金额、日期与 iCal 房态合并。只有证据足够时才自动生成订单；不会用不确定的数据覆盖你手工填写的金额。</p>
        ${pending.length?`<div class="match-pending"><h3>需要你确认的外部房源</h3><p>第一次只需对应一次。若某个平台 ID 下面其实包含多个房型，请先不要选择。</p>${pending.map((x,i)=>`<div class="match-map-row"><div><strong>${esc(x.provider)} · ${esc(x.label||x.id)}</strong><small>平台 ID ${esc(x.id)} · ${x.count} 封邮件等待对应</small></div><select data-match-unit="${i}">${unitOptions(ctx)}</select><button class="btn small" data-match-save="${i}">保存对应</button></div>`).join('')}<small class="match-tip">找不到对应房间时，请先在“房源与房间”里新增，再回来对应。</small></div>`:`<div class="match-all-good">目前没有新的平台房源需要手工对应。</div>`}`;
      const mail=content.querySelector('#mailSyncHub');if(mail)mail.insertAdjacentElement('afterend',panel);else content.prepend(panel);
      panel.querySelectorAll('[data-match-save]').forEach(b=>b.onclick=async()=>{const i=Number(b.dataset.matchSave),x=pending[i],sel=panel.querySelector(`[data-match-unit="${i}"]`),unitId=sel?.value;if(!unitId)return alert('请先选择对应房间。');if(!confirm(`将 ${x.provider} 的「${x.label||x.id}」对应到所选 PMS 房间？`))return;b.disabled=true;try{await raw('/rest/v1/provider_listing_mappings?on_conflict=organization_id,provider,external_listing_key',{method:'POST',body:{organization_id:ctx.m.organization_id,provider:x.provider,external_listing_key:x.id,display_name:x.label||x.id,unit_id:unitId},headers:{Prefer:'resolution=merge-duplicates,return=minimal'}});alert('对应已保存。后台会在下一轮自动重新匹配订单。');panel.remove();setTimeout(render,80)}catch(e){alert(e.message);b.disabled=false}})
    }catch(e){console.error('mail match status',e)}finally{loading=false}
  }
  const ob=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(render,100)});ob.observe(document.documentElement,{subtree:true,childList:true});window.addEventListener('load',()=>setTimeout(render,800));setTimeout(render,1000);
})();
