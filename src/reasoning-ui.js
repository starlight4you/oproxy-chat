(() => {
  if (window.__oproxyReasoningUI) { window.__oproxyReasoningUI.refresh(); return; }
  const KEY = 'oproxy-reasoning-effort-v1';
  const levels = [['low', '低'], ['medium', '中'], ['high', '高'], ['xhigh', '极高'], ['max', '最高']];
  const defaultValue = 'xhigh';
  let host, trigger, popup, range, title, subtitle, status, desired = read(), applying, scheduled, disposed = false;
  let appliedModel = '', unsupported = false, observedModel = '', attempted = '';
  const setText = (element, text) => { if(element.textContent !== text) element.textContent = text; };
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const model = () => document.querySelector('[data-testid="model-selector-button"]')?.textContent.trim() || '';
  const context = () => model()+':'+location.pathname;
  const modelLabel = () => window.__oproxyModelDisplayName?.(model()) || model().replace(/^gpt-?/i, '').replace(/-sol$/i, ' Sol').replace(/-terra$/i, ' Terra');
  const label = value => levels.find(([key]) => key === value)?.[1] || '极高';
  function read() { try { const v = localStorage.getItem(KEY); return levels.some(([key]) => key === v) ? v : defaultValue; } catch { return defaultValue; } }
  // The visible parameter input is a read-only enum display (its onChange is a
  // no-op). Use the existing parameter component's own typed setOption binding.
  // Only this setting's props are inspected; no account hooks or credentials.
  function binding() {
    const elements = [
      document.querySelector('#reasoning_effort-dynamic-setting-input'),
      document.querySelector('#effort-dynamic-setting-input'),
    ].filter(Boolean);
    for (const element of elements) {
      let fiber = element[Object.keys(element).find(key => key.startsWith('__reactFiber$'))];
      let found = null;
      for (let i = 0; fiber && i < 26; i++, fiber = fiber.return) {
        const p = fiber.memoizedProps;
        if (p && (p.settingKey === 'reasoning_effort' || p.settingKey === 'effort') && typeof p.setOption === 'function' && Array.isArray(p.options) && p.conversation?.model === model()) {
          found = p; break;
        }
      }
      if (found) return found;
    }
    return null;
  }
  const style = document.createElement('style');
  style.id = 'oproxy-reasoning-style';
  style.textContent = `
    .oproxy-reasoning-control{display:inline-flex;align-items:center;flex:0 1 auto;min-width:0;margin-left:4px;border:0;padding:0;background:transparent;height:auto}
    .oproxy-reasoning-trigger{display:inline-flex;align-items:center;gap:7px;border:0;background:transparent;color:var(--oproxy-ink,#171717);padding:7px 9px;border-radius:18px;font:inherit;font-size:15px;line-height:22px;white-space:nowrap;cursor:pointer;min-height:36px}
    .oproxy-reasoning-trigger:hover,.oproxy-reasoning-trigger[aria-expanded=true]{background:rgb(128 128 128 / 8%)}
    .oproxy-reasoning-trigger .oproxy-reasoning-value{color:var(--oproxy-muted,#858585)}
    .oproxy-reasoning-trigger svg{width:14px;height:14px;color:#969696;margin-left:1px}
    .oproxy-reasoning-trigger:focus-visible,.oproxy-reasoning-reset:focus-visible,.oproxy-reasoning-model:focus-visible{outline:2px solid #339cff;outline-offset:3px}
    .oproxy-reasoning-popover{--reason-bg:#fff;--reason-text:#6f6f6f;--reason-border:#dfdfdf;--reason-track:#e8e8e8;position:fixed;box-sizing:border-box;z-index:1000;width:340px;padding:19px 18px 20px;border:1px solid var(--reason-border);border-radius:25px;background:var(--reason-bg);color:var(--reason-text);box-shadow:0 9px 30px rgb(0 0 0 / 10%);font:inherit;text-align:center}
    .dark .oproxy-reasoning-popover{--reason-bg:#292929;--reason-text:#b4b4b4;--reason-border:#494949;--reason-track:#494949;box-shadow:0 9px 30px rgb(0 0 0 / 25%)}
    .oproxy-reasoning-popover[hidden]{display:none!important}
    .oproxy-reasoning-title{font-size:23px;font-weight:600;line-height:31px;color:#329bff;margin:0 36px 1px}
    .oproxy-reasoning-model{display:inline-flex;align-items:center;justify-content:center;gap:5px;font:inherit;font-size:16px;line-height:24px;color:var(--reason-text);border:0;background:transparent;padding:0 5px;cursor:pointer}
    .oproxy-reasoning-model svg{width:11px;height:11px}
    .oproxy-reasoning-reset{position:absolute;right:15px;top:17px;display:flex;align-items:center;justify-content:center;width:30px;height:30px;padding:5px;border:0;background:transparent;border-radius:50%;color:#929292;cursor:pointer}
    .oproxy-reasoning-reset:hover{background:rgb(128 128 128 / 10%)}.oproxy-reasoning-reset svg{width:22px;height:22px}
    .oproxy-reasoning-track{position:relative;height:36px;margin:19px 0 0;border-radius:22px;background:var(--reason-track);box-shadow:inset 0 0 0 1px rgb(0 0 0 / 6%)}
    .oproxy-reasoning-fill{position:absolute;top:0;left:0;height:100%;width:calc(19px + (100% - 36px)*var(--reason-progress,.75));border-radius:22px 0 0 22px;background:#339cff}
    .oproxy-reasoning-ticks{position:absolute;inset:0 18px;display:flex;justify-content:space-between;align-items:center;pointer-events:none}
    .oproxy-reasoning-ticks i{width:5px;height:5px;background:#aaa;border-radius:50%}.oproxy-reasoning-ticks i[data-active]{background:#88c6ff}
    .oproxy-reasoning-range{position:absolute;inset:0;width:100%;height:36px;margin:0;appearance:none;-webkit-appearance:none;background:transparent;cursor:pointer;outline:none}
    .oproxy-reasoning-range::-webkit-slider-runnable-track{height:36px;background:transparent;border-radius:22px}
    .oproxy-reasoning-range::-webkit-slider-thumb{appearance:none;-webkit-appearance:none;box-sizing:border-box;width:36px;height:36px;border-radius:50%;border:1px solid #e2e2e2;background:#fff;box-shadow:0 1px 5px rgb(0 0 0 / 16%)}
    .oproxy-reasoning-range:focus-visible{outline:2px solid #329bff;outline-offset:4px;border-radius:22px}
    .oproxy-reasoning-status{font-size:12px;line-height:18px;margin:10px 0 -4px;color:var(--reason-text)}.oproxy-reasoning-status:empty{display:none}
    @media(max-width:520px){.oproxy-reasoning-trigger{font-size:13px;gap:5px;padding-inline:6px}.oproxy-reasoning-trigger .oproxy-reasoning-model-label{max-width:105px;overflow:hidden;text-overflow:ellipsis}}
  `;
  document.head.append(style);
  const svg = paths => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  function close(focus = false) { if (popup) popup.hidden = true; trigger?.setAttribute('aria-expanded', 'false'); if (focus) trigger?.focus(); }
  function position() {
    if (!popup || popup.hidden || !trigger) return;
    const bounds = trigger.getBoundingClientRect(), width = Math.min(340, innerWidth - 24);
    popup.style.width = `${width}px`;
    popup.style.left = `${Math.max(12, Math.min(bounds.right - width, innerWidth - width - 12))}px`;
    const height = popup.getBoundingClientRect().height;
    const above = bounds.top - height - 10;
    popup.style.top = `${above >= 12 ? above : Math.min(bounds.bottom + 10, Math.max(12, innerHeight - height - 12))}px`;
  }
  function update() {
    if (!trigger) return;
    setText(trigger.querySelector('.oproxy-reasoning-model-label'), modelLabel() || '模型');
    setText(trigger.querySelector('.oproxy-reasoning-value'), unsupported ? '不可用' : label(desired));
    trigger.setAttribute('aria-label', `思考强度：${unsupported ? '当前模型不支持' : label(desired)}`);
    if(range)range.disabled=unsupported;
    if (popup) {
      setText(title, label(desired)); setText(subtitle.querySelector('span'), modelLabel());
      const index = Math.max(0, levels.findIndex(([value]) => value === desired));
      range.value = index; range.setAttribute('aria-valuetext', label(desired));
      popup.style.setProperty('--reason-progress', index / (levels.length - 1));
      popup.querySelectorAll('.oproxy-reasoning-ticks i').forEach((dot, i) => dot.toggleAttribute('data-active', i <= index));
      position();
    }
  }
  function buildPopup() {
    popup = document.createElement('section'); popup.className = 'oproxy-reasoning-popover'; popup.id = 'oproxy-reasoning-popover';
    popup.setAttribute('role', 'dialog'); popup.setAttribute('aria-label', '选择思考强度'); popup.hidden = true;
    popup.innerHTML = `<button class="oproxy-reasoning-reset" type="button" aria-label="重置为极高" title="重置为极高">${svg('<path d="M3 10a9 9 0 1 1 2.6 8.4M3 4v6h6"/>')}</button><h3 class="oproxy-reasoning-title"></h3><button type="button" class="oproxy-reasoning-model" aria-label="选择模型"><span></span>${svg('<path d="m9 5 7 7-7 7"/>')}</button><div class="oproxy-reasoning-track"><div class="oproxy-reasoning-fill"></div><div class="oproxy-reasoning-ticks">${levels.map(() => '<i></i>').join('')}</div><input class="oproxy-reasoning-range" type="range" min="0" max="4" step="1" aria-label="思考强度"></div><p class="oproxy-reasoning-status" role="status"></p>`;
    title = popup.querySelector('h3'); subtitle = popup.querySelector('.oproxy-reasoning-model'); range = popup.querySelector('input'); status = popup.querySelector('[role="status"]');
    range.addEventListener('input', () => { desired = levels[Number(range.value)][0]; update(); });
    range.addEventListener('change', () => { apply(desired); });
    popup.querySelector('.oproxy-reasoning-reset').onclick = () => apply(defaultValue);
    subtitle.onclick = () => { close(); document.querySelector('[data-testid="model-selector-button"]')?.click(); };
    document.body.append(popup);
  }
  async function ensure() {
    if (applying) return applying;
    const targetModel = model(), targetContext = context(), value = desired;
    if (!targetModel) return false;
    let p = binding(), previousNav, opened = false;
    applying = (async () => {
      await Promise.resolve();
      try {
        if (!p) {
          const nav = document.querySelector('[data-testid="nav-panel-parameters"]');
          if (!nav) return false;
          previousNav = document.querySelector('[data-testid^="nav-panel-"][aria-pressed="true"]')?.dataset.testid;
          if (previousNav !== 'nav-panel-parameters') { nav.click(); opened = true; }
          for (let i = 0; i < 20 && !disposed; i++) { p = binding(); if (p) break; await pause(75); }
        }
        if(context()!==targetContext || desired!==value)return false;
        if(!p){unsupported=true;return false;}
        if (!p.options.includes(value)) { unsupported = true; return false; }
        unsupported = false;
        const settingKey = p.settingKey === 'effort' ? 'effort' : 'reasoning_effort';
        if (p.conversation[settingKey] !== value) p.setOption(settingKey)(value);
        for (let i = 0; i < 20 && !disposed; i++) {
          const current = binding();
          if (context() !== targetContext || desired !== value) return false;
          const key = current?.settingKey === 'effort' ? 'effort' : 'reasoning_effort';
          if (current?.conversation[key] === value) { appliedModel = targetContext; return true; }
          await pause(50);
        }
        return false;
      } finally {
        if (opened && document.querySelector('[data-testid="nav-panel-parameters"][aria-pressed="true"]')) {
          if (previousNav) document.querySelector(`[data-testid="${previousNav}"]`)?.click();
          else document.querySelector('[data-testid="nav-panel-parameters"]')?.click();
        }
        applying = null; update();
      }
    })();
    return applying;
  }
  async function apply(value) {
    if (!levels.some(([key]) => key === value)) return false;
    desired = value; appliedModel = ''; attempted = ''; unsupported = false; try { localStorage.setItem(KEY, value); } catch {}
    update(); if (status) status.textContent = '正在应用…';
    // A slider change can supersede an in-flight initial setting update.
    if (applying) await applying;
    const ok = await ensure();
    if (status) status.textContent = ok ? '' : unsupported ? '当前模型不支持此强度' : '暂时无法应用，请稍后重试';
    return ok;
  }
  function refresh() {
    const composer = document.querySelector('#prompt-textarea')?.closest('form');
    if (!composer) { close(); return; }
    const anchor = composer.querySelector('[data-testid="send-button"], [data-testid="stop-generation-button"], [data-testid="stop-button"]')?.parentElement;
    if (!anchor) return;
    if (!host || !host.isConnected) {
      host = document.createElement('div'); host.dataset.oproxyReasoningControl = ''; host.className = 'oproxy-reasoning-control';
      trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'oproxy-reasoning-trigger';
      trigger.setAttribute('aria-haspopup', 'dialog'); trigger.setAttribute('aria-expanded', 'false'); trigger.setAttribute('aria-controls', 'oproxy-reasoning-popover');
      trigger.innerHTML = `<span class="oproxy-reasoning-model-label"></span><span class="oproxy-reasoning-value"></span>${svg('<path d="m7 10 5 5 5-5"/>')}`;
      trigger.onclick = () => { if (!popup) buildPopup(); popup.hidden = !popup.hidden; trigger.setAttribute('aria-expanded', String(!popup.hidden)); update(); if (!popup.hidden) range.focus({ preventScroll: true }); };
      host.append(trigger); anchor.before(host);
    }
    if(observedModel!==context()){observedModel=context();unsupported=false;attempted='';}
    update();
    if(model()&&!applying&&appliedModel!==context()){if(status)setText(status,unsupported?'当前模型暂不支持此强度控件':'正在应用…');}
    if(range)range.disabled=unsupported;
    const signature = model()+':'+location.pathname+':'+desired;
    if (model() && appliedModel !== context() && attempted!==signature && !applying && !unsupported) { attempted=signature; ensure(); }
  }
  let replaying=false, sending=false;
  function beforeSend(e){
    if(replaying)return;
    const target=e.target instanceof Element?e.target:null;
    if(e.type==='click'?!target?.closest('[data-testid="send-button"]'):e.key!=='Enter'||e.shiftKey||e.isComposing||!target?.matches('#prompt-textarea'))return;
    const textarea=document.querySelector('#prompt-textarea'),draft=textarea?.value;
    if(!draft?.trim()||!document.querySelector('[data-testid=nav-panel-parameters]')||appliedModel===context()||unsupported)return;
    e.preventDefault();e.stopImmediatePropagation();if(sending)return;sending=true;
    const original=context();
    ensure().then(ok=>{if(!ok||context()!==original||textarea.value!==draft)return;const send=document.querySelector('[data-testid="send-button"]');if(send&&!send.disabled){replaying=true;try{send.click()}finally{replaying=false}}}).finally(()=>{sending=false});
  }
  document.addEventListener('click',beforeSend,true);document.addEventListener('keydown',beforeSend,true);
  const onClick = e => { if (!host?.contains(e.target) && !popup?.contains(e.target)) close(); };
  const onKey = e => { if (e.key === 'Escape' && popup && !popup.hidden) { e.preventDefault(); close(true); } };
  document.addEventListener('click', onClick); document.addEventListener('keydown', onKey);
  window.addEventListener('resize', position); document.addEventListener('scroll', position, true);
  const observer = new MutationObserver(() => { if (!scheduled) scheduled = setTimeout(() => { scheduled = null; refresh(); }, 80); });
  observer.observe(document.body, { childList: true, subtree: true });
  window.__oproxyReasoningUI = { refresh, apply, read: () => desired, ensure, state: () => ({ value: desired, applied: appliedModel === context(), unsupported }), dispose() { disposed = true; observer.disconnect(); clearTimeout(scheduled); host?.remove(); popup?.remove(); style.remove(); document.removeEventListener('click',beforeSend,true);document.removeEventListener('keydown',beforeSend,true);document.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey); window.removeEventListener('resize', position); document.removeEventListener('scroll', position, true); delete window.__oproxyReasoningUI; } };
  refresh();
})();
