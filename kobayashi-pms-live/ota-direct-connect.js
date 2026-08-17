(() => {
  if (window.__kobayashiOtaDirectHub) return;
  window.__kobayashiOtaDirectHub = true;

  const SB_URL='https://cxaoomvagqpuatlfthlx.supabase.co';
  const SB_KEY='sb_publishable_ud3RGvS6BIe03XJzMZIOSQ_h_QrULbF';
  const SESSION_KEY='kobayashi_pms_session_v1';
  let timer=null,loading=false;

  const providers=[
    {name:'Airbnb',need:'Airbnb API Program / Partner scopes',auth:'OAuth / partner credentials',caps:['订单','销售额','消息','房态','价格/库存'],note:'现有账号可继续使用；直连需要 Airbnb 对 Kobayashi PMS 开放相应 API Scope。'},
    {name:'Booking.com',need:'Connectivity Partner + Machine Account',auth:'Machine Account / Connectivity credentials',caps:['订单','销售额','消息','房态','价格/库存'],note:'通过 Booking.com Connectivity APIs 连接，不使用网页登录抓取。'},
    {name:'Agoda',need:'YCS API / Tech Partner access',auth:'OAuth 2.0 Client ID + Secret + IP whitelist',caps:['订单','房态','价格/库存','产品映射'],note:'Agoda 已逐步切换到 OAuth 2.0；连接后按 Property/Room/Rate Plan 映射。'},
    {name:'Expedia',need:'Expedia Group Connectivity Hub onboarding',auth:'Connectivity credentials',caps:['订单','销售额','房态','价格/库存'],note:'需要通过 Connectivity Hub 的合作方审核、测试与上线流程。'},
    {name:'Trip.com',need:'Trip.com Connectivity onboarding',auth:'Connectivity partner credentials',caps:['订单','消息','房态','价格/库存'],note:'Trip.com Connectivity 支持 Reservation、ARI、Content 与 Customer Communication。'},
  ];

  function session(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{return null}}
  function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  async function raw(path){const s=session();if(!s?.access_token)throw new Error('请先登录');const r=await fetch(SB_URL+path,{headers:{apikey:SB_KEY,Authorization:`Bearer ${s.access_token}`}});const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{data=text}if(!r.ok)throw new Error(data?.message||data?.error||`HTTP ${r.status}`);return data}
  async function context(){const u=await raw('/auth/v1/user');const ms=await raw(`/rest/v1/memberships?select=organization_id,role&user_id=eq.${encodeURIComponent(u.id)}&limit=1`);const m=ms?.[0];if(!m)return null;const accounts=await raw(`/rest/v1/integration_accounts?select=id,provider,display_name,status,connection_mode,auth_type,environment,capabilities,connection_metadata,last_success_at,last_error&organization_id=eq.${encodeURIComponent(m.organization_id)}&connection_mode=eq.direct_api&order=provider.asc`);return {membership:m,accounts:accounts||[]}}
  function statusLabel(a){if(!a)return ['未登记','muted'];if(a.status==='connected')return ['已直连','good'];if(a.status==='sandbox')return ['Sandbox 测试中','warn'];if(a.status==='error')return ['连接异常','bad'];return ['账号已有 · 待API凭证','wait']}
  function renderCard(p,accounts){const a=accounts.find(x=>x.provider===p.name);const [label,cls]=statusLabel(a);return `<article class="ota-direct-card"><div class="ota-direct-head"><div><h3>${esc(p.name)}</h3><span class="ota-direct-account">你已在该平台有民宿账号</span></div><span class="ota-direct-status ${cls}">${label}</span></div><div class="ota-direct-row"><span>直连需要</span><strong>${esc(p.need)}</strong></div><div class="ota-direct-row"><span>认证方式</span><strong>${esc(p.auth)}</strong></div><div class="ota-direct-capabilities">${p.caps.map(x=>`<span>${esc(x)}</span>`).join('')}</div><p>${esc(p.note)}</p>${a?.last_error?`<div class="ota-direct-error">${esc(a.last_error)}</div>`:''}</article>`}
  async function render(){const title=document.querySelector('#pageTitle'),content=document.querySelector('#content');if(!title||!content||title.textContent.trim()!=='设置'||loading)return;if(document.querySelector('#otaDirectHub'))return;loading=true;try{const ctx=await context();if(!ctx||ctx.membership.role!=='owner')return;const panel=document.createElement('section');panel.className='panel ota-direct-panel';panel.id='otaDirectHub';panel.innerHTML=`<div class="panel-head"><div><span class="eyebrow">DIRECT OTA · HOSTEX REPLACEMENT</span><h2>平台直连中心</h2></div><span class="badge orange">5个平台账号已确认</span></div><div class="ota-direct-intro"><strong>目标：</strong>让 Kobayashi PMS 自己接收订单、销售额、客人消息和房态，不依赖 Hostex。现有 iCal / CSV 会保留为备用通道，但直连 API 上线后以 API 数据为主。</div><div class="ota-direct-grid">${providers.map(p=>renderCard(p,ctx.accounts)).join('')}</div><div class="ota-direct-foot"><span>当前技术底座已准备：</span><b>账号连接记录</b><b>房源/房间映射</b><b>Webhook 去重</b><b>订单来源追踪</b><b>平台财务明细</b></div>`;const firstPanel=content.querySelector('.panel');if(firstPanel)content.insertBefore(panel,firstPanel);else content.appendChild(panel)}catch(e){console.error('OTA direct hub',e)}finally{loading=false}}
  const ob=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(render,80)});ob.observe(document.documentElement,{subtree:true,childList:true});window.addEventListener('load',()=>setTimeout(render,500));setTimeout(render,700);
})();
