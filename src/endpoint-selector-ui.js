(() => {
  if (window.__oproxyEndpointSelectorUI) {
    window.__oproxyEndpointSelectorUI.refresh();
    return;
  }
  const labels = {
    'Oproxy OpenAI': 'ChatGPT',
    'Oproxy Anthropic': 'Claude',
    'Oproxy DeepSeek': 'DeepSeek',
    Oproxy: '其他模型',
    'Oproxy Images': '图像生成',
  };
  const catalog = {
    'Oproxy OpenAI': new Map([
      ['gpt-6-luna', '6 Luna'],
      ['gpt-6.1-sol', '6.1 Sol'],
      ['gpt-6-astra', '6 Astra'],
    ]),
    'Oproxy Anthropic': new Map([
      ['claude-sonnet-5-5', 'Sonnet 5.5'],
      ['claude-opus-5-5', 'Opus 5.5'],
      ['claude-fable-5-1', 'Fable 5.1'],
    ]),
    'Oproxy DeepSeek': new Map([
      ['deepseek-v4-flash', 'V4 Flash'],
      ['deepseek-v4-pro', 'V4 Pro'],
    ]),
    Oproxy: new Map([
      ['kimi-k3', 'Kimi K3'],
      ['glm-5.3', 'GLM 5.3'],
      ['gemini-4-argon', 'Gemini 4 Argon'],
      ['qwen3.8-max', 'Qwen3.8 Max'],
    ]),
  };
  const aliases = new Map([
    ['claude-sonnet-5.5', 'claude-sonnet-5-5'],
    ['claude-opus-5.5', 'claude-opus-5-5'],
  ]);
  const displayNames = new Map(Object.values(catalog).flatMap(map => [...map.entries()]));
  const style = document.createElement('style');
  style.id = 'oproxy-endpoint-selector-style';
  style.textContent = `
    [role="listbox"] > [role="option"] button[id$="-settings"],
    [role="listbox"] > [role="option"] button[aria-label^="设置 API 密钥"] {
      display: none !important;
    }
    [role="listbox"] > [role="option"][data-oproxy-endpoint-label] span.truncate.text-left {
      font-size: 0 !important;
    }
    [role="listbox"] > [role="option"][data-oproxy-endpoint-label] span.truncate.text-left::after {
      content: attr(data-oproxy-endpoint-display);
      display: inline-block;
      font-size: 0.875rem;
      line-height: inherit;
    }
    [role="dialog"] [role="option"][data-oproxy-model-display] span[data-oproxy-model-display] {
      font-size: 0 !important;
    }
    [role="dialog"] [role="option"][data-oproxy-model-display] span[data-oproxy-model-display]::after {
      content: attr(data-oproxy-model-display);
      display: inline-block;
      font-size: 0.875rem;
      line-height: inherit;
    }
    [data-testid="model-selector-button"] span[data-oproxy-model-display] {
      font-size: 0 !important;
    }
    [data-testid="model-selector-button"] span[data-oproxy-model-display]::after {
      content: attr(data-oproxy-model-display);
      display: inline-block;
      font-size: inherit;
      line-height: inherit;
    }
    [role="dialog"] [role="option"][data-oproxy-model-hidden] { display: none !important; }
  `;
  document.head.append(style);
  let scheduled, activeVirtualEndpoint = '', suppressEndpointReset = false;
  const virtualEndpoint = () => window.__oproxySelectedVirtualEndpoint || activeVirtualEndpoint;
  function endpointName(option) {
    const id = option.getAttribute('id') || '';
    const match = id.match(/^endpoint-(.*)-menu$/);
    if (match && Object.hasOwn(labels, match[1])) return match[1];
    const button = option.querySelector('button[aria-label^="设置 API 密钥"]');
    const aria = button?.getAttribute('aria-label') || '';
    const suffix = aria.replace(/^设置 API 密钥\s*/, '');
    return Object.hasOwn(labels, suffix) ? suffix : '';
  }
  function replaceLabel(option, endpoint) {
    const label = labels[endpoint];
    if (!label) return;
    option.dataset.oproxyEndpointLabel = label;
    option.querySelector('span.truncate.text-left')?.setAttribute('data-oproxy-endpoint-display', label);
  }
  function modelDialog() {
    return [...document.querySelectorAll('[role="dialog"]')].reverse().find(dialog => !dialog.hidden && dialog.offsetParent !== null && dialog.querySelector('input:not(#model-search)') && dialog.querySelector('[role="option"]:not([id^="endpoint-"])'));
  }
  function modelName(option) {
    return option.querySelector('span.truncate')?.textContent.trim() || option.innerText.trim().split('\n')[0];
  }
  function modelBase(name) {
    if (aliases.has(name)) return aliases.get(name);
    if (displayNames.has(name)) return name;
    return name.replace(/(?:-(?:thinking|reasoning|low|medium|high|xhigh|max|standard|fast|slow))+$/i, '');
  }
  function hasReasoningSuffix(name) {
    if (displayNames.has(name)) return false;
    return /(?:-(?:thinking|reasoning|low|medium|high|xhigh|max|standard|fast|slow))+$/i.test(name);
  }
  function modelDisplay(name) {
    const base = modelBase(name);
    return displayNames.get(base) || base;
  }
  function activeEndpoint() {
    if (virtualEndpoint()) return virtualEndpoint();
    const expanded = document.querySelector('[role="listbox"] > [role="option"][aria-expanded="true"]');
    const match = expanded?.id?.match(/^endpoint-(.*)-menu$/);
    return match?.[1] || '';
  }
  function filterModels() {
    const dialog = modelDialog();
    if (!dialog) return;
    const endpoint = activeEndpoint();
    const allowed = catalog[endpoint];
    if (!allowed) return;
    const seen = new Set();
    dialog.querySelectorAll('[role="option"]').forEach(option => {
      const name = modelName(option), base = modelBase(name), display = allowed.get(base);
      option.removeAttribute('data-oproxy-model-hidden');
      option.removeAttribute('data-oproxy-model-display');
      option.querySelector('span[data-oproxy-model-display]')?.removeAttribute('data-oproxy-model-display');
      if (!display || hasReasoningSuffix(name) || seen.has(base)) {
        option.setAttribute('data-oproxy-model-hidden', '');
        return;
      }
      seen.add(base);
      option.setAttribute('data-oproxy-model-display', display);
      option.querySelector('span.truncate')?.setAttribute('data-oproxy-model-display', display);
    });
  }
  function updateSelectedModelDisplay() {
    const button = document.querySelector('[data-testid="model-selector-button"]');
    const modelSpan = button?.querySelector('span.flex-grow.truncate.text-left');
    const raw = modelSpan?.textContent.trim();
    if (!modelSpan || !raw) return;
    modelSpan.setAttribute('data-oproxy-model-display', modelDisplay(raw));
  }
  window.__oproxyModelDisplayName = modelDisplay;
  function createDeepSeekRow() {
    const list = [...document.querySelectorAll('[role="listbox"]')].find(candidate => !candidate.hidden && candidate.offsetParent !== null && candidate.querySelector('#endpoint-Oproxy-menu'));
    const original = list?.querySelector('#endpoint-Oproxy-menu');
    if (!list || !original || list.querySelector('#endpoint-Oproxy-DeepSeek-menu')) return;
    const row = original.cloneNode(true);
    row.id = 'endpoint-Oproxy-DeepSeek-menu';
    row.removeAttribute('aria-controls');
    row.setAttribute('aria-expanded', 'false');
    row.setAttribute('data-oproxy-virtual-endpoint', 'Oproxy DeepSeek');
    row.setAttribute('data-oproxy-endpoint-label', 'DeepSeek');
    row.querySelector('span.truncate.text-left')?.setAttribute('data-oproxy-endpoint-display', 'DeepSeek');
    row.querySelectorAll('button').forEach(button => button.remove());
    row.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation();
      row.setAttribute('data-oproxy-deepseek-clicked', '');
      activeVirtualEndpoint = 'Oproxy DeepSeek';
      window.__oproxySelectedVirtualEndpoint = 'Oproxy DeepSeek';
      suppressEndpointReset = true;
      try { original.click(); } finally { suppressEndpointReset = false; }
      setTimeout(() => { activeVirtualEndpoint = 'Oproxy DeepSeek'; window.__oproxySelectedVirtualEndpoint = 'Oproxy DeepSeek'; filterModels(); }, 80);
    });
    original.before(row);
  }
  const handleEndpointClick = event => {
    const endpoint = event.target.closest?.('[role="listbox"] > [role="option"]');
    if (endpoint?.id === 'endpoint-Oproxy-DeepSeek-menu') {
      activeVirtualEndpoint = 'Oproxy DeepSeek';
      window.__oproxySelectedVirtualEndpoint = 'Oproxy DeepSeek';
      return;
    }
    if (endpoint && !suppressEndpointReset) {
      activeVirtualEndpoint = '';
      delete window.__oproxySelectedVirtualEndpoint;
    }
  };
  document.addEventListener('click', handleEndpointClick, true);
  function refresh() {
    document.querySelectorAll('[role="listbox"] > [role="option"]').forEach(option => {
      const endpoint = endpointName(option);
      if (endpoint) replaceLabel(option, endpoint);
    });
    createDeepSeekRow();
    filterModels();
    updateSelectedModelDisplay();
  }
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = setTimeout(() => { scheduled = undefined; refresh(); }, 40);
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  window.__oproxyEndpointSelectorUI = {
    refresh,
    state: () => ({ activeVirtualEndpoint: virtualEndpoint(), activeEndpoint: activeEndpoint(), visibleDialogs: [...document.querySelectorAll('[role="dialog"]')].filter(dialog => !dialog.hidden && dialog.offsetParent !== null).map(dialog => dialog.innerText.slice(0, 100)) }),
    dispose() {
      observer.disconnect();
      clearTimeout(scheduled);
      document.removeEventListener('click', handleEndpointClick, true);
      document.querySelectorAll('[data-oproxy-virtual-endpoint]').forEach(row => row.remove());
      delete window.__oproxySelectedVirtualEndpoint;
      style.remove();
      delete window.__oproxyEndpointSelectorUI;
    },
  };
  refresh();
})();
