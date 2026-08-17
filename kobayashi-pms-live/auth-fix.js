(() => {
  const LIVE_URL = 'https://dorajackcui.github.io/kobayashi-pms-live/';
  const SESSION_KEY = 'kobayashi_pms_session_v1';

  // If Supabase returns an implicit-flow session in the URL hash after
  // email confirmation, persist it before app.js boots.
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const accessToken = hash.get('access_token');
  const refreshToken = hash.get('refresh_token');
  if (accessToken && refreshToken) {
    const expiresIn = Number(hash.get('expires_in') || 3600);
    const expiresAt = Number(hash.get('expires_at') || Math.floor(Date.now() / 1000) + expiresIn);
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: hash.get('token_type') || 'bearer',
      expires_in: expiresIn,
      expires_at: expiresAt
    }));
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  // The current test app uses Supabase Auth's REST endpoint directly.
  // Ensure new signup confirmation emails return to the live test app.
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    try {
      const rawUrl = typeof input === 'string' ? input : input.url;
      if (rawUrl && rawUrl.includes('/auth/v1/signup')) {
        const url = new URL(rawUrl, window.location.href);
        if (!url.searchParams.has('redirect_to')) {
          url.searchParams.set('redirect_to', LIVE_URL);
        }
        input = typeof input === 'string' ? url.toString() : new Request(url.toString(), input);
      }
    } catch (_) {}
    return nativeFetch(input, init);
  };
})();
