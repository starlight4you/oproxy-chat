(() => {
  if (window.__oproxyProviderIcons) { window.__oproxyProviderIcons.refresh(); return; }
  const icons = window.__oproxyProviderIconAssets;
  const resolve = window.__oproxyProviderForModel;
  if (!icons || typeof resolve !== 'function') return;
  let scheduled;
  const style = document.createElement('style');
  style.id = 'oproxy-provider-icons-style';
  // Retain React's original nodes so model switches/reconciliation stay safe.
  // Only the fallback robot's artwork is hidden; dimensions and theme survive.
  style.textContent = `
    svg[data-oproxy-provider] > :not([data-oproxy-provider-art]){display:none!important}
    svg[data-oproxy-provider] > [data-oproxy-provider-art]{display:block;pointer-events:none}
  `;
  document.head.append(style);
  const templates = new Map();
  for (const [provider, markup] of Object.entries(icons)) {
    const asset = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
    if (asset.localName !== 'svg' || asset.querySelector('parsererror')) continue;
    // SVG titles contribute to textContent, which the model controls also read.
    asset.querySelectorAll('title, desc').forEach(element => element.remove());
    // All artwork is bundled SVG. No network requests, scripts, or remote fonts.
    asset.setAttribute('x', '0'); asset.setAttribute('y', '0');
    asset.setAttribute('width', '24'); asset.setAttribute('height', '24');
    asset.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    asset.setAttribute('stroke', 'none'); asset.setAttribute('fill', 'currentColor');
    asset.setAttribute('aria-hidden', 'true');
    asset.setAttribute('data-oproxy-provider-art', provider);
    asset.removeAttribute('style'); asset.removeAttribute('id');
    templates.set(provider, asset);
  }
  function currentFiber(fiber) {
    const alternate = fiber?.alternate;
    if (!alternate) return fiber;
    let a = fiber, b = alternate;
    // Bailouts can share child/return links across both trees. Merely following
    // .return to the current root can therefore still select stale model props.
    while (a.return) {
      const parentA = a.return, parentB = parentA.alternate;
      if (!parentB) {
        if (!parentA.return) break;
        a = b = parentA.return; continue;
      }
      if (parentA.child === parentB.child) {
        for (let child = parentA.child; child; child = child.sibling) {
          if (child === a) return fiber;
          if (child === b) return alternate;
        }
        return fiber;
      }
      if (a.return !== b.return) { a = parentA; b = parentB; continue; }
      let branch = 0;
      for (let child = parentA.child; child; child = child.sibling) {
        if (child === a) { branch = 1; break; }
        if (child === b) { branch = 2; break; }
      }
      if (!branch) for (let child = parentB.child; child; child = child.sibling) {
        if (child === a) { branch = 2; break; }
        if (child === b) { branch = 1; break; }
      }
      if (!branch) return fiber;
      a = branch === 1 ? parentA : parentB;
      b = branch === 1 ? parentB : parentA;
    }
    return a.stateNode?.current === a ? fiber : alternate;
  }
  function identity(element) {
    let model = '', endpoint = '';
    // Only inspect scoped model/endpoint props, never account hooks or tokens.
    let fiber = currentFiber(element[Object.keys(element).find(key => key.startsWith('__reactFiber$'))]);
    for (let i = 0; fiber && i < 16; i++, fiber = fiber.return) {
      const props = fiber.memoizedProps;
      if (!props || typeof props !== 'object') continue;
      const scopedModel = props.model || props.message?.model || props.conversation?.model;
      const scopedEndpoint = props.endpoint || props.message?.endpoint || props.conversation?.endpoint;
      if (!model && typeof scopedModel === 'string') model = scopedModel;
      if (!endpoint && typeof scopedEndpoint === 'string') endpoint = scopedEndpoint;
      if (model && endpoint) break;
    }
    const selector = element.closest('[data-testid="model-selector-button"]');
    if (selector) model = selector.textContent.trim();
    const option = element.closest('[role="option"]');
    // Endpoint options have their own identity, independent of the active chat.
    if (option) return resolve(option.dataset.oproxyVirtualEndpoint || option.textContent.trim(), endpoint);
    return resolve(model, endpoint || element.closest('[data-testid="convo-icon"]')?.title);
  }
  function refresh() {
    document.querySelectorAll('svg.lucide-bot').forEach(element => {
      const provider = identity(element), template = templates.get(provider);
      const artwork = element.querySelector(':scope > [data-oproxy-provider-art]');
      if (!template) {
        artwork?.remove(); element.removeAttribute('data-oproxy-provider'); return;
      }
      if (element.dataset.oproxyProvider === provider && artwork) return;
      artwork?.remove();
      element.append(document.importNode(template, true));
      element.dataset.oproxyProvider = provider;
    });
  }
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = setTimeout(() => { scheduled = undefined; refresh(); }, 60);
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title'] });
  window.__oproxyProviderIcons = {
    refresh,
    dispose() {
      observer.disconnect(); clearTimeout(scheduled); style.remove();
      document.querySelectorAll('[data-oproxy-provider]').forEach(element => {
        element.querySelector(':scope > [data-oproxy-provider-art]')?.remove();
        element.removeAttribute('data-oproxy-provider');
      });
      delete window.__oproxyProviderIcons;
    },
  };
  refresh();
})();
