(() => {
  if (window.__kobayashiStorageKeyFix) return;
  window.__kobayashiStorageKeyFix = true;
  const originalFetch = window.fetch.bind(window);

  function safeObjectPath(path) {
    if (!path) return path;
    const parts = String(path).split('/');
    const last = parts.pop() || '';
    const decoded = (() => { try { return decodeURIComponent(last); } catch { return last; } })();
    const ts = (decoded.match(/^(\d{10,})-/) || [])[1] || Date.now().toString();
    parts.push(`${ts}-cleaning-invoice.pdf`);
    return parts.join('/');
  }

  function rewriteStorageUrl(url) {
    const marker = '/storage/v1/object/cleaning-invoices/';
    const s = String(url);
    const i = s.indexOf(marker);
    if (i < 0) return url;
    const prefix = s.slice(0, i + marker.length);
    const rawPath = s.slice(i + marker.length);
    const decodedPath = rawPath.split('/').map(x => { try { return decodeURIComponent(x); } catch { return x; } }).join('/');
    const safe = safeObjectPath(decodedPath);
    return prefix + safe.split('/').map(encodeURIComponent).join('/');
  }

  window.fetch = async function(input, init = {}) {
    let nextInput = input;
    let nextInit = init;
    const url = typeof input === 'string' ? input : input?.url;

    if (url && String(url).includes('/storage/v1/object/cleaning-invoices/')) {
      const rewritten = rewriteStorageUrl(url);
      if (typeof input === 'string') nextInput = rewritten;
      else nextInput = new Request(rewritten, input);
    }

    if (url && String(url).includes('/rest/v1/rpc/import_cleaning_invoice') && init?.body && typeof init.body === 'string') {
      try {
        const body = JSON.parse(init.body);
        if (body?.p_source_file_path) body.p_source_file_path = safeObjectPath(body.p_source_file_path);
        nextInit = { ...init, body: JSON.stringify(body) };
      } catch {}
    }

    return originalFetch(nextInput, nextInit);
  };

  // Safety: unmatched rows must never silently default to a real room.
  const observer = new MutationObserver(() => {
    document.querySelectorAll('select[data-pdf-map]').forEach((sel) => {
      if (!sel.dataset.initializedSafe) {
        sel.dataset.initializedSafe = '1';
        sel.value = '';
      }
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
