(() => {
  const SB_URL = 'https://cxaoomvagqpuatlfthlx.supabase.co';
  const SB_KEY = 'sb_publishable_ud3RGvS6BIe03XJzMZIOSQ_h_QrULbF';
  const SESSION_KEY = 'kobayashi_pms_session_v1';
  const PREF_KEY = 'kobayashi_pms_calendar_v2';

  const prefs = (() => {
    try {
      return {
        view: 'timeline',
        period: '14',
        density: 'relaxed',
        scope: 'all',
        ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}'),
      };
    } catch {
      return { view: 'timeline', period: '14', density: 'relaxed', scope: 'all' };
    }
  })();

  let anchor = tokyoToday();
  let core = { orgId: null, properties: [], rules: [] };
  let reservations = [];
  let renderToken = 0;
  let observerTimer = null;
  let activeController = null;

  function tokyoToday() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
  }

  function esc(v = '') {
    return String(v).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function yen(n) {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency', currency: 'JPY', maximumFractionDigits: 0
    }).format(Number(n) || 0);
  }

  function addDays(s, n) {
    const d = new Date(`${s}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function dayDiff(a, b) {
    return Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);
  }

  function monthStart(ymd) {
    return `${ymd.slice(0, 7)}-01`;
  }

  function shiftMonth(ymd, delta) {
    const [y, m] = monthStart(ymd).split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    return d.toISOString().slice(0, 10);
  }

  function weekdayShort(d) {
    return ['日', '一', '二', '三', '四', '五', '六'][new Date(`${d}T00:00:00Z`).getUTCDay()];
  }

  function savePrefs() {
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
  }

  function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
    catch { return null; }
  }

  async function sb(path, { signal } = {}) {
    const session = getSession();
    if (!session?.access_token) throw new Error('请先登录。');
    const r = await fetch(SB_URL + path, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${session.access_token}` },
      signal,
    });
    const text = await r.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!r.ok) throw new Error(data?.message || data?.error || `HTTP ${r.status}`);
    return data;
  }

  async function loadCore(signal) {
    const user = await sb('/auth/v1/user', { signal });
    const memberships = await sb(`/rest/v1/memberships?select=organization_id&user_id=eq.${encodeURIComponent(user.id)}&limit=1`, { signal });
    const orgId = memberships?.[0]?.organization_id;
    if (!orgId) throw new Error('还没有管理空间。');
    const [properties, rules] = await Promise.all([
      sb(`/rest/v1/properties?select=id,name,active,display_order,units(id,name,active,display_order)&organization_id=eq.${encodeURIComponent(orgId)}&order=display_order.asc,name.asc`, { signal }),
      sb('/rest/v1/cleaning_cost_rules?select=id,unit_id,amount_yen,effective_from,effective_to&order=effective_from.desc', { signal }),
    ]);
    core = { orgId, properties: properties || [], rules: rules || [] };
  }

  function visibleRange() {
    if (prefs.view === 'month' || prefs.period === 'month') {
      const start = monthStart(anchor);
      return { start, endExclusive: shiftMonth(start, 1) };
    }
    const count = Number(prefs.period) || 14;
    return { start: anchor, endExclusive: addDays(anchor, count) };
  }

  async function loadReservations(start, endExclusive, signal) {
    const q = [
      'select=id,unit_id,guest_name_snapshot,channel,check_in,check_out,status,gross_amount_yen,platform_fee_yen,local_note',
      `organization_id=eq.${encodeURIComponent(core.orgId)}`,
      'status=neq.cancelled',
      `check_in=lt.${endExclusive}`,
      `check_out=gt.${start}`,
      'order=check_in.asc',
      'limit=1000',
    ].join('&');
    reservations = await sb(`/rest/v1/reservations?${q}`, { signal }) || [];
  }

  function currentRate(unitId, date) {
    return core.rules
      .filter(r => r.unit_id === unitId && r.effective_from <= date && (!r.effective_to || r.effective_to >= date))
      .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0]?.amount_yen ?? null;
  }

  function unitRecords() {
    const out = [];
    core.properties.filter(p => p.active).forEach(p => {
      (p.units || []).filter(u => u.active)
        .sort((a, b) => (a.display_order || 0) - (b.display_order || 0) || a.name.localeCompare(b.name))
        .forEach(u => out.push({ ...u, propertyId: p.id, propertyName: p.name }));
    });
    return out;
  }

  function scopeUnits() {
    const all = unitRecords();
    if (prefs.scope.startsWith('property:')) {
      const id = prefs.scope.slice(9);
      return all.filter(u => u.propertyId === id);
    }
    if (prefs.scope.startsWith('unit:')) {
      const id = prefs.scope.slice(5);
      return all.filter(u => u.id === id);
    }
    return all;
  }

  function scopeOptions() {
    let html = '<option value="all">全部房源</option>';
    core.properties.filter(p => p.active).forEach(p => {
      html += `<option value="property:${p.id}">🏠 ${esc(p.name)}</option>`;
      (p.units || []).filter(u => u.active)
        .sort((a, b) => (a.display_order || 0) - (b.display_order || 0) || a.name.localeCompare(b.name))
        .forEach(u => { html += `<option value="unit:${u.id}">　↳ ${esc(p.name)} · ${esc(u.name)}</option>`; });
    });
    return html;
  }

  function channelClass(channel = '') {
    const v = channel.toLowerCase();
    if (v.includes('airbnb')) return 'airbnb';
    if (v.includes('booking')) return 'bookingcom';
    if (v.includes('agoda')) return 'agoda';
    if (v.includes('expedia')) return 'expedia';
    if (v.includes('ical') || v.includes('block')) return 'ical';
    if (v.includes('direct')) return 'direct';
    return 'other';
  }

  function headerLabel() {
    if (prefs.view === 'month' || prefs.period === 'month') {
      const [y, m] = monthStart(anchor).split('-').map(Number);
      return `${y}年${m}月`;
    }
    const { start, endExclusive } = visibleRange();
    return `${start.slice(5).replace('-', '/')} – ${addDays(endExclusive, -1).slice(5).replace('-', '/')}`;
  }

  function renderControls() {
    return `
      <div class="calv2-controls card">
        <div class="calv2-control-row calv2-primary-row">
          <div class="calv2-segment" aria-label="日历视图">
            <button data-cal-view="timeline" class="${prefs.view === 'timeline' ? 'active' : ''}">房态横向</button>
            <button data-cal-view="month" class="${prefs.view === 'month' ? 'active' : ''}">月历</button>
          </div>
          <label class="calv2-select-label">范围
            <select id="calScope">${scopeOptions()}</select>
          </label>
          <div class="calv2-spacer"></div>
          <button class="btn primary" id="calNewReservation">＋ 新增订单</button>
        </div>
        <div class="calv2-control-row">
          <div class="calv2-nav">
            <button class="btn" id="calPrev">←</button>
            <button class="btn" id="calToday">今天</button>
            <button class="btn" id="calNext">→</button>
          </div>
          <strong class="calv2-range-label">${headerLabel()}</strong>
          <div class="calv2-spacer"></div>
          ${prefs.view === 'timeline' ? `
            <span class="calv2-mini-label">周期</span>
            <div class="calv2-segment compact">
              <button data-cal-period="7" class="${prefs.period === '7' ? 'active' : ''}">周</button>
              <button data-cal-period="14" class="${prefs.period === '14' ? 'active' : ''}">2周</button>
              <button data-cal-period="month" class="${prefs.period === 'month' ? 'active' : ''}">月</button>
            </div>
            <span class="calv2-mini-label">显示</span>
            <div class="calv2-segment compact">
              <button data-cal-density="compact" class="${prefs.density === 'compact' ? 'active' : ''}">紧凑</button>
              <button data-cal-density="standard" class="${prefs.density === 'standard' ? 'active' : ''}">标准</button>
              <button data-cal-density="relaxed" class="${prefs.density === 'relaxed' ? 'active' : ''}">宽松</button>
            </div>` : ''}
        </div>
      </div>`;
  }

  function renderTimeline() {
    const { start, endExclusive } = visibleRange();
    const dayCount = dayDiff(start, endExclusive);
    const days = Array.from({ length: dayCount }, (_, i) => addDays(start, i));
    const today = tokyoToday();
    const scoped = scopeUnits();
    const properties = core.properties.filter(p => p.active && scoped.some(u => u.propertyId === p.id));
    const dayWidth = prefs.density === 'compact' ? 58 : prefs.density === 'standard' ? 70 : 84;
    const roomWidth = prefs.density === 'compact' ? 150 : 174;

    let body = '';
    properties.forEach(p => {
      body += `<div class="calv2-property-row"><span>${esc(p.name)}</span></div>`;
      const units = scoped.filter(u => u.propertyId === p.id);
      units.forEach(u => {
        const rs = reservations.filter(r => r.unit_id === u.id && r.check_in < endExclusive && r.check_out > start);
        const rate = currentRate(u.id, start);
        const bookings = rs.map(r => {
          const clippedStart = r.check_in < start ? start : r.check_in;
          const clippedEnd = r.check_out > endExclusive ? endExclusive : r.check_out;
          const col = dayDiff(start, clippedStart) + 1;
          const span = Math.max(1, dayDiff(clippedStart, clippedEnd));
          return `<button class="calv2-booking ${channelClass(r.channel)}" data-cal-res="${r.id}" style="grid-column:${col}/span ${span}" title="${esc(r.guest_name_snapshot)} · ${esc(r.channel)} · ${r.check_in} → ${r.check_out}"><b>${esc(r.guest_name_snapshot)}</b><span>${esc(r.channel)}</span></button>`;
        }).join('');
        body += `
          <div class="calv2-timeline-row">
            <div class="calv2-room-cell"><strong>${esc(u.name)}</strong><small>${rate == null ? '清扫费未设置' : `清扫 ${yen(rate)}`}</small></div>
            <div class="calv2-timeline-grid" style="--cal-days:${dayCount};--cal-day-width:${dayWidth}px">
              <div class="calv2-day-bg">${days.map(d => `<i class="${d === today ? 'today' : ''}"></i>`).join('')}</div>
              ${bookings}
            </div>
          </div>`;
      });
    });

    if (!scoped.length) body = '<div class="empty">当前范围没有启用中的房间</div>';

    return `
      <div class="calv2-timeline-shell ${prefs.density}" style="--cal-room-width:${roomWidth}px;--cal-days:${dayCount};--cal-day-width:${dayWidth}px">
        <div class="calv2-timeline" style="min-width:calc(var(--cal-room-width) + var(--cal-days) * var(--cal-day-width))">
          <div class="calv2-timeline-head">
            <div class="calv2-room-head">房间</div>
            <div class="calv2-date-head">${days.map(d => `<div class="${d === today ? 'today' : ''}"><span>${weekdayShort(d)}</span><strong>${Number(d.slice(8))}</strong><small>${d.slice(5, 7)}月</small></div>`).join('')}</div>
          </div>
          ${body}
        </div>
      </div>`;
  }

  function monthGridDates() {
    const start = monthStart(anchor);
    const first = new Date(`${start}T00:00:00Z`);
    const jsDay = first.getUTCDay();
    const mondayOffset = (jsDay + 6) % 7;
    const gridStart = addDays(start, -mondayOffset);
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }

  function renderMonth() {
    const month = monthStart(anchor).slice(0, 7);
    const dates = monthGridDates();
    const scoped = scopeUnits();
    const unitById = new Map(unitRecords().map(u => [u.id, u]));
    const allowed = new Set(scoped.map(u => u.id));
    const today = tokyoToday();
    const scopeIsUnit = prefs.scope.startsWith('unit:');
    const scopeIsProperty = prefs.scope.startsWith('property:');

    const cells = dates.map(d => {
      const active = reservations.filter(r => allowed.has(r.unit_id) && r.check_in <= d && r.check_out > d);
      const arrivals = reservations.filter(r => allowed.has(r.unit_id) && r.check_in === d);
      const departures = reservations.filter(r => allowed.has(r.unit_id) && r.check_out === d);
      let content = '';

      if (scopeIsUnit) {
        content = active.slice(0, 3).map(r => `<button class="calv2-month-booking ${channelClass(r.channel)}" data-cal-res="${r.id}"><b>${esc(r.guest_name_snapshot)}</b><span>${r.check_in === d ? '入住' : r.check_out === addDays(d, 1) ? '明日退房' : esc(r.channel)}</span></button>`).join('');
      } else if (scopeIsProperty) {
        content = active.slice(0, 4).map(r => {
          const u = unitById.get(r.unit_id);
          return `<button class="calv2-month-booking ${channelClass(r.channel)}" data-cal-res="${r.id}"><b>${esc(u?.name || '房间')} · ${esc(r.guest_name_snapshot)}</b><span>${esc(r.channel)}</span></button>`;
        }).join('');
      } else {
        content = `<div class="calv2-day-stats">
          ${arrivals.length ? `<span class="arrive">入住 ${arrivals.length}</span>` : ''}
          ${departures.length ? `<span class="depart">退房 ${departures.length}</span>` : ''}
          ${active.length ? `<span class="stay">在住 ${active.length}</span>` : ''}
        </div>`;
        content += active.slice(0, 2).map(r => {
          const u = unitById.get(r.unit_id);
          return `<button class="calv2-month-line" data-cal-res="${r.id}">${esc(u ? `${u.propertyName} · ${u.name}` : '房间')} · ${esc(r.guest_name_snapshot)}</button>`;
        }).join('');
        if (active.length > 2) content += `<small class="calv2-more">+${active.length - 2} 间</small>`;
      }

      return `<div class="calv2-month-cell ${d.slice(0, 7) !== month ? 'outside' : ''} ${d === today ? 'today' : ''}">
        <div class="calv2-day-number"><strong>${Number(d.slice(8))}</strong>${d === today ? '<span>今天</span>' : ''}</div>
        <div class="calv2-day-content">${content}</div>
      </div>`;
    }).join('');

    return `<div class="calv2-month-shell">
      <div class="calv2-month-grid">
        ${['一', '二', '三', '四', '五', '六', '日'].map((x, i) => `<div class="calv2-weekday ${i >= 5 ? 'weekend' : ''}">周${x}</div>`).join('')}
        ${cells}
      </div>
    </div>`;
  }

  function renderLoading() {
    const content = document.querySelector('#content');
    if (!content) return;
    content.innerHTML = `<div class="calv2-root"><div class="calv2-loading card">正在读取房态…</div></div>`;
  }

  function renderError(err) {
    const content = document.querySelector('#content');
    if (!content) return;
    content.innerHTML = `<div class="calv2-root"><div class="message error">日历读取失败：${esc(err.message)}</div></div>`;
  }

  function render() {
    const content = document.querySelector('#content');
    if (!content || document.querySelector('#pageTitle')?.textContent !== '房态日历') return;
    content.innerHTML = `<div class="calv2-root">${renderControls()}${prefs.view === 'timeline' ? renderTimeline() : renderMonth()}</div>`;
    const scope = document.querySelector('#calScope');
    if (scope) scope.value = core.properties.some(p => `property:${p.id}` === prefs.scope) || unitRecords().some(u => `unit:${u.id}` === prefs.scope) || prefs.scope === 'all' ? prefs.scope : 'all';
    bindControls();
  }

  function bindControls() {
    document.querySelectorAll('[data-cal-view]').forEach(b => b.onclick = () => {
      prefs.view = b.dataset.calView;
      if (prefs.view === 'month') anchor = monthStart(anchor);
      savePrefs();
      refreshData();
    });
    document.querySelectorAll('[data-cal-period]').forEach(b => b.onclick = () => {
      prefs.period = b.dataset.calPeriod;
      if (prefs.period === 'month') anchor = monthStart(anchor);
      savePrefs();
      refreshData();
    });
    document.querySelectorAll('[data-cal-density]').forEach(b => b.onclick = () => {
      prefs.density = b.dataset.calDensity;
      savePrefs();
      render();
    });
    const scope = document.querySelector('#calScope');
    if (scope) scope.onchange = () => { prefs.scope = scope.value; savePrefs(); render(); };
    const prev = document.querySelector('#calPrev');
    const next = document.querySelector('#calNext');
    const today = document.querySelector('#calToday');
    if (prev) prev.onclick = () => move(-1);
    if (next) next.onclick = () => move(1);
    if (today) today.onclick = () => { anchor = prefs.view === 'month' || prefs.period === 'month' ? monthStart(tokyoToday()) : tokyoToday(); refreshData(); };
    const add = document.querySelector('#calNewReservation');
    if (add) add.onclick = openNewReservation;
    document.querySelectorAll('[data-cal-res]').forEach(b => b.onclick = () => openReservationDetail(b.dataset.calRes));
  }

  function move(direction) {
    if (prefs.view === 'month' || prefs.period === 'month') anchor = shiftMonth(anchor, direction);
    else anchor = addDays(anchor, direction * (Number(prefs.period) || 14));
    refreshData();
  }

  function openNewReservation() {
    const nav = document.querySelector('[data-page="reservations"]');
    if (!nav) return;
    nav.click();
    setTimeout(() => document.querySelector('#newReservation')?.click(), 50);
  }

  function openReservationDetail(id) {
    const r = reservations.find(x => x.id === id);
    if (!r) return;
    const u = unitRecords().find(x => x.id === r.unit_id);
    document.querySelector('#calv2Detail')?.remove();
    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal-bg" id="calv2Detail">
        <div class="modal calv2-detail-modal">
          <div class="modal-head"><div><span class="eyebrow">RESERVATION</span><h2>${esc(r.guest_name_snapshot)}</h2></div><button class="btn" id="calv2Close">关闭</button></div>
          <div class="calv2-detail-grid">
            <div><span>房间</span><strong>${esc(u ? `${u.propertyName} · ${u.name}` : '—')}</strong></div>
            <div><span>渠道</span><strong>${esc(r.channel)}</strong></div>
            <div><span>入住</span><strong>${r.check_in}</strong></div>
            <div><span>退房</span><strong>${r.check_out}</strong></div>
            <div><span>订单金额</span><strong>${r.gross_amount_yen == null ? '—' : yen(r.gross_amount_yen)}</strong></div>
            <div><span>平台费</span><strong>${r.platform_fee_yen == null ? '—' : yen(r.platform_fee_yen)}</strong></div>
          </div>
          ${r.local_note ? `<div class="calv2-note"><span>内部备注</span><p>${esc(r.local_note)}</p></div>` : ''}
          <div class="form-actions"><button class="btn primary" id="calv2GoOrder">去订单页修改</button></div>
        </div>
      </div>`);
    const modal = document.querySelector('#calv2Detail');
    document.querySelector('#calv2Close').onclick = () => modal.remove();
    modal.onclick = e => { if (e.target === modal) modal.remove(); };
    document.querySelector('#calv2GoOrder').onclick = () => {
      modal.remove();
      document.querySelector('[data-page="reservations"]')?.click();
    };
  }

  async function refreshData() {
    const token = ++renderToken;
    activeController?.abort();
    activeController = new AbortController();
    const signal = activeController.signal;
    renderLoading();
    try {
      if (!core.orgId) await loadCore(signal);
      const { start, endExclusive } = visibleRange();
      await loadReservations(start, endExclusive, signal);
      if (token !== renderToken) return;
      render();
    } catch (err) {
      if (err?.name === 'AbortError') return;
      if (token !== renderToken) return;
      renderError(err);
    }
  }

  function maybeUpgrade() {
    clearTimeout(observerTimer);
    observerTimer = setTimeout(() => {
      const title = document.querySelector('#pageTitle');
      const content = document.querySelector('#content');
      if (!title || !content || title.textContent !== '房态日历') return;
      if (content.querySelector('.calv2-root')) return;
      core = { orgId: null, properties: [], rules: [] };
      refreshData();
    }, 25);
  }

  const observer = new MutationObserver(maybeUpgrade);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('load', maybeUpgrade);
  maybeUpgrade();
})();
