(() => {
  const SB_URL = 'https://cxaoomvagqpuatlfthlx.supabase.co';
  const SB_KEY = 'sb_publishable_ud3RGvS6BIe03XJzMZIOSQ_h_QrULbF';
  const SESSION_KEY = 'kobayashi_pms_session_v1';
  const RETURN_KEY = 'kobayashi_pms_return_settings';

  function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
  }

  async function rpc(name, body) {
    const session = getSession();
    if (!session?.access_token) throw new Error('登录状态已失效，请重新登录。');
    const res = await fetch(`${SB_URL}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) throw new Error(data?.message || data?.error || `删除失败（${res.status}）`);
    return data;
  }

  function addDeleteButton(actions, kind, id, label, unitCount = 0) {
    const key = kind === 'property' ? 'safeDeleteProperty' : 'safeDeleteUnit';
    if (actions.querySelector(`[data-${key.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}]`)) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '删除';
    button.style.color = '#b42318';
    button.style.fontWeight = '650';
    button.dataset[key] = id;
    button.addEventListener('click', async () => {
      const propertyText = unitCount ? `\n该房源下的 ${unitCount} 个房间也会一起删除。` : '';
      const message = kind === 'property'
        ? `确定永久删除房源「${label}」吗？${propertyText}\n\n只有没有历史订单/财务记录的房源才能删除；有历史记录时系统会拒绝删除，请改用“停用”。`
        : `确定永久删除房间「${label}」吗？\n\n如果只是暂时不出租，请使用“停用”。已有历史订单/财务记录的房间不会被永久删除。`;
      if (!window.confirm(message)) return;
      button.disabled = true;
      button.textContent = '删除中…';
      try {
        await rpc(kind === 'property' ? 'delete_property_if_unused' : 'delete_unit_if_unused', kind === 'property' ? { p_property_id: id } : { p_unit_id: id });
        sessionStorage.setItem(RETURN_KEY, '1');
        location.reload();
      } catch (err) {
        alert(err?.message || '删除失败');
        button.disabled = false;
        button.textContent = '删除';
      }
    });
    actions.appendChild(button);
  }

  function decorate() {
    document.querySelectorAll('[data-prename]').forEach(renameButton => {
      const actions = renameButton.closest('.actions');
      const group = renameButton.closest('.setting-group');
      if (!actions || !group) return;
      const id = renameButton.dataset.prename;
      const label = group.querySelector('.row > span strong')?.textContent?.trim() || '房源';
      const unitCount = group.querySelectorAll('[data-urename]').length;
      addDeleteButton(actions, 'property', id, label, unitCount);
    });

    document.querySelectorAll('[data-urename]').forEach(renameButton => {
      const actions = renameButton.closest('.actions');
      const row = renameButton.closest('.row');
      if (!actions || !row) return;
      const id = renameButton.dataset.urename;
      const raw = row.querySelector('span')?.childNodes?.[0]?.textContent || row.querySelector('span')?.textContent || '房间';
      const label = raw.trim().replace(/（已停用）.*/, '') || '房间';
      addDeleteButton(actions, 'unit', id, label);
    });
  }

  const observer = new MutationObserver(decorate);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  decorate();

  if (sessionStorage.getItem(RETURN_KEY) === '1') {
    sessionStorage.removeItem(RETURN_KEY);
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      const settings = document.querySelector('[data-page="settings"]');
      if (settings) {
        settings.click();
        clearInterval(timer);
      } else if (attempts > 40) clearInterval(timer);
    }, 100);
  }
})();
