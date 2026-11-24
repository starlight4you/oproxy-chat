(() => {
  if (window.__oproxyAccountUI) return;
  const style = document.createElement('style');
  style.textContent = `
    .oproxy-account-summary { padding: 10px 12px; border-bottom: 1px solid var(--border-light, #8883); font-size: 13px; }
    .oproxy-account-summary header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
    .oproxy-account-summary button { color: inherit; padding: 3px 6px; border-radius: 6px; font-size: 12px; }
    .oproxy-account-summary button:hover { background: #8882; }
    .oproxy-account-row { display: flex; justify-content: space-between; gap: 12px; margin: 5px 0; }
    .oproxy-account-row strong { font-variant-numeric: tabular-nums; }
    .oproxy-account-sub { border-top: 1px solid #8882; margin-top: 8px; padding-top: 8px; }
    .oproxy-account-sub small, .oproxy-account-status { display: block; font-size: 11px; opacity: .7; margin-top: 4px; }
    .oproxy-account-name { font-weight: 600; overflow-wrap: anywhere; }
    [data-oproxy-account-panel] { max-height: 280px; overflow-y: auto; }
    [data-oproxy-account-link] { text-decoration: none; color: inherit; }
  `;
  document.head.append(style);
  const money = value => '¥' + Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const number = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  let active, email = '', generation = 0, busy = false, lastRead = 0;
  async function openPage(destination) {
    try {
      const result = await window.oproxyDesktop.openAccountPage(destination);
      if (result?.ok) return;
    } catch {}
    const panel = active?.querySelector('[data-oproxy-account-panel]');
    if (panel) panel.append(node('p', '页面打开失败，请重试', 'oproxy-account-status'));
  }
  function node(tag, text, className) {
    const element = document.createElement(tag); element.textContent = text;
    if (className) element.className = className;
    return element;
  }
  function row(parent, label, value) {
    const line = node('div', '', 'oproxy-account-row');
    line.append(node('span', label), node('strong', value)); parent.append(line);
  }
  function render(panel, result) {
    panel.replaceChildren();
    if (!result.ok) {
      panel.append(node('p', result.error || '暂时无法读取账户信息', 'oproxy-account-status'));
      if (['login_required', 'account_mismatch'].includes(result.code)) {
        const login = node('button', '登录 Oproxy 查看额度'); login.type = 'button';
        login.addEventListener('click', () => openPage('login'));
        panel.append(login);
      }
      return;
    }
    row(panel, '账户余额', money(result.balance));
    panel.append(node('div', '订阅剩余额度', 'oproxy-account-status'));
    if (result.subscriptions === null) panel.append(node('p', '订阅额度读取失败，请刷新', 'oproxy-account-status'));
    else {
      const subscriptions = result.subscriptions.filter(sub => sub.status === 'active' && (!sub.expires_at || new Date(sub.expires_at).getTime() > Date.now()) && (!sub.starts_at || new Date(sub.starts_at).getTime() <= Date.now()));
      if (!subscriptions.length) panel.append(node('p', '暂无生效中的订阅', 'oproxy-account-status'));
      for (const sub of subscriptions) {
        const block = node('div', '', 'oproxy-account-sub');
        block.append(node('div', sub.group?.name || '订阅', 'oproxy-account-name'));
        let limits = 0;
        if (number(sub.credit_limit_usd)) {
          row(block, '总剩余', number(sub.credit_used_usd) ? money(Math.max(0, sub.credit_limit_usd - sub.credit_used_usd)) : '暂不可用'); limits++;
        }
        for (const [period, label] of [['daily', '今日剩余'], ['weekly', '本周剩余'], ['monthly', '本月剩余']]) {
          const limit = number(sub.credit_limit_usd) ? sub[period + '_credit_limit_usd'] : sub.group?.[period + '_limit_usd'];
          if (!number(limit) || Number(limit) <= 0) continue;
          const used = sub[period + '_usage_usd'];
          row(block, label, number(used) ? money(Math.max(0, Number(limit) - Number(used))) : '暂不可用'); limits++;
        }
        if (!limits) block.append(node('small', '未设置金额限额'));
        if (sub.expires_at) block.append(node('small', '到期：' + new Date(sub.expires_at).toLocaleDateString('zh-CN')));
        panel.append(block);
      }
    }
    panel.append(node('small', '更新于 ' + new Date(result.updatedAt).toLocaleTimeString('zh-CN'), 'oproxy-account-status'));
  }
  async function refresh() {
    if (!active?.isConnected || busy || document.hidden) return;
    const panel = active.querySelector('[data-oproxy-account-panel]');
    const id = generation; busy = true; lastRead = Date.now();
    panel.setAttribute('aria-busy', 'true');
    active.querySelector('button').disabled = true;
    try {
      const result = await window.oproxyDesktop.getAccountSummary(email);
      if (id === generation && active?.isConnected) render(panel, result);
    } catch {
      if (id === generation && active?.isConnected) render(panel, { ok: false, error: '读取失败，请稍后刷新' });
    } finally {
      if (id === generation) { busy = false; panel.removeAttribute('aria-busy'); if (active?.isConnected) active.querySelector('button').disabled = false; }
    }
  }
  function sync() {
    const trigger = document.querySelector('[data-testid="nav-user"][aria-expanded="true"]');
    const menu = trigger && document.getElementById(trigger.getAttribute('aria-controls'));
    if (!menu || menu.hidden || menu.getAttribute('aria-hidden') === 'true') {
      if (active) { active.closest('[role="menu"]')?.querySelectorAll('[data-oproxy-account-link]').forEach(link => link.remove()); active.remove(); active = null; generation++; busy = false; }
      return;
    }
    const nextEmail = menu.querySelector('[role="note"]')?.textContent.trim() || '';
    if (active?.parentElement === menu && nextEmail === email) return;
    active?.remove(); generation++; busy = false; email = nextEmail;
    menu.querySelectorAll('[data-oproxy-account-link]').forEach(link => link.remove());
    active = node('section', '', 'oproxy-account-summary');
    const header = node('header', ''); const refreshButton = node('button', '刷新'); refreshButton.type = 'button'; refreshButton.addEventListener('click', refresh);
    header.append(node('span', 'Oproxy 账户'), refreshButton);
    const panel = node('div', '正在读取余额与订阅额度…'); panel.dataset.oproxyAccountPanel = ''; panel.setAttribute('aria-live', 'polite');
    active.append(header, panel);
    const note = menu.querySelector('[role="note"]');
    if (note) note.after(active); else menu.prepend(active);
    let previous = active;
    for (const [destination, label] of [['purchase', '充值 / 订阅']]) {
      const link = node('a', label + ' ↗', 'select-item text-sm');
      link.dataset.oproxyAccountLink = destination; link.href = 'https://oproxy.world/purchase';
      link.setAttribute('role', 'menuitem');
      link.addEventListener('click', event => { event.preventDefault(); openPage(destination); });
      previous.after(link); previous = link;
    }
    refresh();
  }
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true; queueMicrotask(() => { scheduled = false; sync(); });
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['aria-expanded', 'aria-controls', 'aria-hidden', 'hidden'] });
  setInterval(() => { if (Date.now() - lastRead >= 15000) refresh(); }, 1000);
  window.addEventListener('focus', () => { if (Date.now() - lastRead > 1000) refresh(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  window.__oproxyAccountUI = { sync, refresh };
  sync();
})();
