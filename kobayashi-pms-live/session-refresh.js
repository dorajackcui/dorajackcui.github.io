(() => {
  if (window.__kobayashiSessionRefresh) return;
  window.__kobayashiSessionRefresh = true;

  const SB_URL = 'https://cxaoomvagqpuatlfthlx.supabase.co';
  const SB_KEY = 'sb_publishable_ud3RGvS6BIe03XJzMZIOSQ_h_QrULbF';
  const SESSION_KEY = 'kobayashi_pms_session_v1';
  const previousFetch = window.fetch.bind(window);
  let refreshPromise = null;

  function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
    catch { return null; }
  }

  function saveSession(next, previous) {
    if (!next?.access_token) return false;
    const merged = { ...previous, ...next };
    if (!merged.refresh_token && previous?.refresh_token) merged.refresh_token = previous.refresh_token;
    localStorage.setItem(SESSION_KEY, JSON.stringify(merged));
    window.dispatchEvent(new CustomEvent('kobayashi-session-refreshed'));
    return true;
  }

  async function refreshSession() {
    const current = getSession();
    if (!current?.refresh_token) return false;
    if (refreshPromise) return refreshPromise;

    refreshPromise = (async () => {
      try {
        const r = await previousFetch(`${SB_URL}/auth/v1/token?grant_type=refresh_token`, {
          method: 'POST',
          headers: { apikey: SB_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: current.refresh_token })
        });
        if (!r.ok) return false;
        const data = await r.json();
        return saveSession(data, current);
      } catch (_) {
        return false;
      } finally {
        refreshPromise = null;
      }
    })();
    return refreshPromise;
  }

  function isSupabaseRequest(input) {
    try {
      const raw = typeof input === 'string' ? input : input?.url;
      return !!raw && raw.startsWith(SB_URL);
    } catch { return false; }
  }

  function withFreshAuth(init = {}) {
    const s = getSession();
    if (!s?.access_token) return init;
    const headers = new Headers(init.headers || {});
    if (headers.has('Authorization')) headers.set('Authorization', `Bearer ${s.access_token}`);
    return { ...init, headers };
  }

  window.fetch = async (input, init = {}) => {
    let response = await previousFetch(input, init);
    if (!isSupabaseRequest(input) || ![401, 403].includes(response.status)) return response;

    const url = typeof input === 'string' ? input : input?.url || '';
    if (url.includes('/auth/v1/token')) return response;

    const refreshed = await refreshSession();
    if (!refreshed) return response;

    const retryInit = withFreshAuth(init);
    return previousFetch(input, retryInit);
  };
})();