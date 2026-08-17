(() => {
  if (window.__kobayashiMonthBars) return;
  window.__kobayashiMonthBars = true;

  const SB_URL = 'https://cxaoomvagqpuatlfthlx.supabase.co';
  const SB_KEY = 'sb_publishable_ud3RGvS6BIe03XJzMZIOSQ_h_QrULbF';
  const SESSION_KEY = 'kobayashi_pms_session_v1';
  const PREF_KEY = 'kobayashi_pms_calendar_v2';
  let lastGrid = null;
  let lastPayload = null;
  let timer = null;
  let requestToken = 0;

  function session() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
    catch { return null; }
  }

  function prefs() {
    try { return { scope: 'all', ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') }; }
    catch { return { scope: 'all' }; }
  }

  function esc(v = '') {
    return String(v).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function addDays(s, n) {
    const d = new Date(`${s}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function dayDiff(a, b) {
    return Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);
  }

  async function raw(path) {
    const s = session();
    if (!s?.access_token) throw new Error('请先登录');
    const r = await fetch(SB_URL + path, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${s.access_token}` },
    });
    const text = await r.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!r.ok) throw new Error(data?.message || data?.error || `HTTP ${r.status}`);
    return data;
  }

  function monthFromUi() {
    const label = document.querySelector('.calv2-range-label')?.textContent || '';
    const m = label.match(/(\d{4})年\s*(\d{1,2})月/);
    if (!m) return null;
    return `${m[1]}-${String(Number(m[2])).padStart(2, '0')}-01`;
  }

  function gridStartForMonth(monthStart) {
    const first = new Date(`${monthStart}T00:00:00Z`);
    const mondayOffset = (first.getUTCDay() + 6) % 7;
    return addDays(monthStart, -mondayOffset);
  }

  function unitRecords(properties) {
    const out = [];
    for (const p of properties || []) {
      if (!p.active) continue;
      for (const u of (p.units || []).filter(x => x.active)) {
        out.push({ ...u, propertyId: p.id, propertyName: p.name });
      }
    }
    return out;
  }

  function scopedUnits(properties, scope) {
    const all = unitRecords(properties);
    if (scope.startsWith('property:')) {
      const id = scope.slice(9);
      return all.filter(u => u.propertyId === id);
    }
    if (scope.startsWith('unit:')) {
      const id = scope.slice(5);
      return all.filter(u => u.id === id);
    }
    return all;
  }

  function channelClass(channel = '') {
    const v = String(channel).toLowerCase();
    if (v.includes('airbnb')) return 'airbnb';
    if (v.includes('booking')) return 'bookingcom';
    if (v.includes('agoda')) return 'agoda';
    if (v.includes('expedia')) return 'expedia';
    if (v.includes('direct')) return 'direct';
    if (v.includes('ical') || v.includes('block')) return 'ical';
    return 'other';
  }

  async function loadPayload(monthStart) {
    const s = session();
    if (!s?.access_token) return null;
    const user = await raw('/auth/v1/user');
    const memberships = await raw(`/rest/v1/memberships?select=organization_id&user_id=eq.${encodeURIComponent(user.id)}&limit=1`);
    const orgId = memberships?.[0]?.organization_id;
    if (!orgId) return null;

    const gridStart = gridStartForMonth(monthStart);
    const gridEnd = addDays(gridStart, 42);
    const orgQ = encodeURIComponent(orgId);
    const [properties, reservations, icalEvents] = await Promise.all([
      raw(`/rest/v1/properties?select=id,name,active,display_order,units(id,name,active,display_order)&organization_id=eq.${orgQ}&order=display_order.asc,name.asc`),
      raw(`/rest/v1/reservations?select=id,unit_id,guest_name_snapshot,channel,check_in,check_out,status&organization_id=eq.${orgQ}&status=neq.cancelled&check_in=lt.${gridEnd}&check_out=gt.${gridStart}&order=check_in.asc&limit=2000`),
      raw(`/rest/v1/ical_events?select=id,unit_id,starts_on,ends_on,summary,external_status,ical_feeds(provider,display_name)&organization_id=eq.${orgQ}&active=eq.true&starts_on=lt.${gridEnd}&ends_on=gt.${gridStart}&order=starts_on.asc&limit=2000`).catch(() => []),
    ]);

    return { monthStart, gridStart, gridEnd, properties: properties || [], reservations: reservations || [], icalEvents: icalEvents || [] };
  }

  function labelForReservation(r, u, scope) {
    if (scope.startsWith('unit:')) return `${r.guest_name_snapshot} · ${r.channel}`;
    if (scope.startsWith('property:')) return `${u?.name || '房间'} · ${r.guest_name_snapshot}`;
    return `${u ? `${u.propertyName} · ${u.name}` : '房间'} · ${r.guest_name_snapshot}`;
  }

  function labelForIcal(e, u, scope) {
    const feed = Array.isArray(e.ical_feeds) ? e.ical_feeds[0] : e.ical_feeds;
    const provider = feed?.provider || 'iCal';
    const summary = e.summary && !/^reserved$/i.test(e.summary) ? e.summary : '平台占用';
    if (scope.startsWith('unit:')) return `${summary} · ${provider}`;
    if (scope.startsWith('property:')) return `${u?.name || '房间'} · ${summary}`;
    return `${u ? `${u.propertyName} · ${u.name}` : '房间'} · ${summary}`;
  }

  function makeEvents(payload, scope) {
    const units = scopedUnits(payload.properties, scope);
    const allowed = new Set(units.map(u => u.id));
    const unitMap = new Map(unitRecords(payload.properties).map(u => [u.id, u]));
    const rs = payload.reservations.filter(r => allowed.has(r.unit_id));
    const exactReservation = new Set(rs.map(r => `${r.unit_id}|${r.check_in}|${r.check_out}`));

    const events = rs.map(r => ({
      kind: 'reservation',
      id: r.id,
      unitId: r.unit_id,
      start: r.check_in,
      end: r.check_out,
      channel: r.channel,
      label: labelForReservation(r, unitMap.get(r.unit_id), scope),
      title: `${r.guest_name_snapshot} · ${r.channel} · ${r.check_in} → ${r.check_out}`,
    }));

    for (const e of payload.icalEvents) {
      if (!allowed.has(e.unit_id)) continue;
      if (exactReservation.has(`${e.unit_id}|${e.starts_on}|${e.ends_on}`)) continue;
      const feed = Array.isArray(e.ical_feeds) ? e.ical_feeds[0] : e.ical_feeds;
      const provider = feed?.provider || 'iCal';
      events.push({
        kind: 'ical',
        id: e.id,
        unitId: e.unit_id,
        start: e.starts_on,
        end: e.ends_on,
        channel: provider,
        label: labelForIcal(e, unitMap.get(e.unit_id), scope),
        title: `${labelForIcal(e, unitMap.get(e.unit_id), scope)} · ${e.starts_on} → ${e.ends_on}（只读房态，不计财务）`,
      });
    }
    return events;
  }

  function xAt(weekCells, pos) {
    if (pos <= 0) return weekCells[0].offsetLeft;
    if (pos >= 7) {
      const c = weekCells[6];
      return c.offsetLeft + c.offsetWidth;
    }
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const c = weekCells[idx];
    return c.offsetLeft + c.offsetWidth * frac;
  }

  function allocateLanes(segments) {
    const laneEnds = [];
    for (const seg of segments.sort((a, b) => a.startPos - b.startPos || b.endPos - a.endPos)) {
      let lane = laneEnds.findIndex(end => end <= seg.startPos + 0.001);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = seg.endPos;
      seg.lane = lane;
    }
    return laneEnds.length;
  }

  function enhanceMonth(grid, payload) {
    const scope = prefs().scope || 'all';
    const cells = [...grid.querySelectorAll('.calv2-month-cell')];
    if (cells.length !== 42) return;

    grid.querySelector('.calv3-month-layer')?.remove();
    grid.classList.add('calv3-enhanced');
    const events = makeEvents(payload, scope);
    const weeks = [];

    for (let w = 0; w < 6; w++) {
      const weekStart = addDays(payload.gridStart, w * 7);
      const weekEnd = addDays(weekStart, 7);
      const segments = events
        .filter(e => e.start < weekEnd && e.end > weekStart)
        .map(e => {
          const startsBefore = e.start < weekStart;
          const endsAfter = e.end > weekEnd;
          const startPos = startsBefore ? 0 : Math.max(0, Math.min(7, dayDiff(weekStart, e.start) + 0.5));
          const endPos = endsAfter ? 7 : Math.max(0, Math.min(7, dayDiff(weekStart, e.end) + 0.5));
          return { ...e, startPos, endPos, startsBefore, endsAfter };
        })
        .filter(s => s.endPos > s.startPos);
      const laneCount = allocateLanes(segments);
      weeks.push({ segments, laneCount, cells: cells.slice(w * 7, w * 7 + 7) });
      const minHeight = Math.max(150, 66 + laneCount * 25 + 14);
      weeks[w].cells.forEach(c => c.style.minHeight = `${minHeight}px`);
    }

    // Force layout after dynamic week heights.
    void grid.offsetHeight;
    const layer = document.createElement('div');
    layer.className = 'calv3-month-layer';
    grid.appendChild(layer);

    for (const week of weeks) {
      const baseTop = week.cells[0].offsetTop + 57;
      for (const seg of week.segments) {
        const left = xAt(week.cells, seg.startPos) + 2;
        const right = xAt(week.cells, seg.endPos) - 2;
        const el = document.createElement(seg.kind === 'reservation' ? 'button' : 'div');
        el.className = `calv3-month-bar ${channelClass(seg.channel)} ${seg.kind === 'ical' ? 'ical-readonly' : ''} ${seg.startsBefore ? 'continues-left' : ''} ${seg.endsAfter ? 'continues-right' : ''}`;
        el.style.left = `${left}px`;
        el.style.top = `${baseTop + seg.lane * 25}px`;
        el.style.width = `${Math.max(16, right - left)}px`;
        el.title = seg.title;
        el.innerHTML = `<span>${esc(seg.label)}</span>`;
        if (seg.kind === 'reservation') el.dataset.resId = seg.id;
        layer.appendChild(el);
      }
    }
  }

  async function run() {
    const grid = document.querySelector('.calv2-month-grid');
    if (!grid || document.querySelector('#pageTitle')?.textContent !== '房态日历') return;
    const monthStart = monthFromUi();
    if (!monthStart) return;
    const token = ++requestToken;
    try {
      const payload = await loadPayload(monthStart);
      if (token !== requestToken || !payload) return;
      const current = document.querySelector('.calv2-month-grid');
      if (!current) return;
      lastGrid = current;
      lastPayload = payload;
      enhanceMonth(current, payload);
    } catch (err) {
      console.error('month bars', err);
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const grid = document.querySelector('.calv2-month-grid');
      if (!grid) return;
      if (grid === lastGrid && grid.querySelector('.calv3-month-layer')) return;
      run();
    }, 120);
  }

  document.addEventListener('click', e => {
    const bar = e.target.closest?.('.calv3-month-bar[data-res-id]');
    if (!bar) return;
    const id = bar.dataset.resId;
    const originals = [...document.querySelectorAll(`[data-cal-res="${id}"]`)].filter(x => !x.classList.contains('calv3-month-bar'));
    if (originals[0]) originals[0].click();
    else document.querySelector('[data-page="reservations"]')?.click();
  });

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('load', () => setTimeout(run, 500));
  window.addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const grid = document.querySelector('.calv2-month-grid');
      if (grid && lastPayload) enhanceMonth(grid, lastPayload);
    }, 120);
  });
  schedule();
})();