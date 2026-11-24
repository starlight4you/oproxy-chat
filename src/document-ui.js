(() => {
  // Presentation only: no IPC, message submission or file generation here.
  if (window.__oproxyDocumentUI) { window.__oproxyDocumentUI.refresh(); return; }
  const style = document.createElement("style");
  style.id = "oproxy-document-ui";
  style.textContent = `
    :root { --oproxy-ink: #171717; --oproxy-muted: #858585; --oproxy-border: #e5e5e5; --oproxy-surface: #fff; --oproxy-bubble: #e9f3ff; --oproxy-bubble-text: #193859; }
    .dark { --oproxy-ink: #ececec; --oproxy-muted: #aaa; --oproxy-border: #424242; --oproxy-surface: #212121; --oproxy-bubble: #303b4b; --oproxy-bubble-text: #e5efff; }
    .message-render { width: 100%; max-width: 800px !important; gap: 0 !important; color: var(--oproxy-ink); }
    .message-render > :is(.agent-turn,.user-turn) { width: 100% !important; min-width: 0; }
    [data-oproxy-avatar] { display: none !important; }
    [data-testid="add-multi-convo-button"] { display: none !important; }
    [data-testid="nav-panel-prompts"], [data-testid="nav-panel-memories"],
    [data-testid="nav-panel-parameters"], [data-testid="nav-panel-mcp-builder"] { display: none !important; }
    [data-oproxy-configuring-tools] #tools-dropdown-menu { visibility: hidden !important; }
    [data-oproxy-hidden-local-mcp-chip] { display: none !important; }
    button[role="checkbox"][aria-label="运行代码"],button[role="checkbox"][aria-label="Run Code"], [data-oproxy-code-chip] { display: none !important; }
    [data-oproxy-hidden-tool-menu] { display: none !important; }
    button[role="checkbox"][aria-label="搜索"], button[role="checkbox"][aria-label="Search"] { display: none !important; }
    [data-oproxy-mode-option] { position: relative; }
    [data-oproxy-mode-option] .oproxy-mode-check { margin-left: auto; color: #2563eb; font-weight: 700; }
    [data-oproxy-response-actions] > button:not([data-testid="read-aloud-button"], [data-testid="copy-response-button"], [data-testid="regenerate-generation-button"], [title="Read aloud"], [title="朗读"], [title="Copy to clipboard"], [title="复制到剪贴板"], [title="Regenerate"], [title="重新生成"]) { display: none !important; }
    .message-render > :is(.agent-turn,.user-turn) > h2 { position: absolute !important; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    .message-render .markdown.prose.message-content { font-size: 16px; line-height: 1.85; color: var(--oproxy-ink); }
    .message-render .user-turn .text-message { align-items: flex-end; }
    .message-render .user-turn .markdown.prose.message-content { width: fit-content; max-width: min(100%,680px); padding: 12px 20px; border-radius: 25px; background: var(--oproxy-bubble); color: var(--oproxy-bubble-text); }
    .message-render .user-turn .markdown > p:last-child { margin-bottom: 0; }
    .message-render .user-turn [data-oproxy-user-controls] { justify-content: flex-end; margin-top: 6px; }
    [data-oproxy-message-wrapper] { padding-top: 16px !important; padding-bottom: 16px !important; }
    [data-oproxy-composer] { border-radius: 28px !important; border-color: var(--oproxy-border) !important; background: var(--oproxy-surface) !important; box-shadow: 0 3px 18px rgb(0 0 0 / 5%) !important; }
    [data-oproxy-composer-form] { max-width: 820px !important; }
    #prompt-textarea { font-size: 16px; }
    [data-testid="send-button"]:not(:disabled), [data-testid="stop-generation-button"], [data-testid="stop-button"] { background: #2866c9 !important; color: white !important; }
    [data-testid="send-button"] svg, [data-testid="stop-generation-button"] svg { color: white !important; }
    .tool-status-text { color: var(--oproxy-muted) !important; font-size: 14px !important; font-weight: 400 !important; }
    .oproxy-workflow { box-sizing: border-box; width: calc(100% - 32px); max-width: 800px; margin: 8px auto 12px; color: var(--oproxy-ink); font: inherit; }
    .oproxy-work-ack { margin: 0 0 18px; font-size: 16px; line-height: 1.85; }
    .oproxy-work-ack[hidden] { display: none; }
    .oproxy-work-status { display: flex; align-items: center; width: fit-content; gap: 9px; list-style: none; cursor: pointer; color: var(--oproxy-muted); font-size: 14px; padding: 5px 0; }
    .oproxy-work-status::-webkit-details-marker { display: none; }
    .oproxy-work-chevron { font-size: 22px; line-height: 16px; transition: transform .15s; }
    .oproxy-work-details[open] .oproxy-work-chevron { transform: rotate(90deg); }
    .oproxy-work-indicator { width: 14px; height: 14px; border: 1.5px solid var(--oproxy-border); border-top-color: var(--oproxy-muted); border-radius: 50%; animation: oproxy-work-spin 1s linear infinite; }
    .oproxy-workflow:is([data-stage="complete"],[data-stage="paused"],[data-stage="error"],[data-stage="clarification"]) .oproxy-work-indicator { animation: none; border: 0; width: 14px; height: 14px; }
    .oproxy-workflow[data-stage="complete"] .oproxy-work-indicator::before { content: '✓'; }
    .oproxy-workflow:is([data-stage="paused"],[data-stage="error"]) .oproxy-work-indicator::before { content: '·'; }
    .oproxy-work-history { margin: 10px 0 16px 7px; padding: 0 0 0 24px; border-left: 1px solid var(--oproxy-border); color: var(--oproxy-muted); font-size: 13px; line-height: 1.85; list-style: none; }
    .oproxy-work-history li { margin: 8px 0; }
    .oproxy-work-progress { margin: 12px 0 0; color: var(--oproxy-muted); font-size: 14px; line-height: 1.8; }
    .oproxy-work-progress[hidden] { display: none; }
    .oproxy-work-summary { margin: 20px 0 4px; color: var(--oproxy-ink); font-size: 16px; line-height: 1.85; }
    .oproxy-work-summary p { margin: 0 0 12px; }
    .oproxy-work-summary-title { font-weight: 600; }
    .oproxy-work-summary-list { margin: 0; padding-left: 24px; list-style: disc; }
    .oproxy-work-summary-list li { margin: 5px 0; }
    .oproxy-generating-banner { display: none !important; }
    @keyframes oproxy-work-spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .oproxy-work-indicator { animation: none; } }
    [data-oproxy-internal-turn], [data-oproxy-internal-wrapper],
    [data-oproxy-skill-envelope], [data-oproxy-document-envelope], [data-oproxy-empty-document-content], [data-oproxy-document-toolbar] { display: none !important; }
    .message-render pre:has(code.language-oproxy_skill) { display: none !important; }
    [data-oproxy-internal-prompt] .markdown :is(p,h1,h2,h3,h4,h5,h6):empty { display: none; }
    [data-oproxy-file-turn] > .agent-turn { min-width: 0; flex: 1; }
    [data-oproxy-file-turn] .oproxy-doc-result {
      --doc-bg: #ffffff; --doc-border: #e5e5e5; --doc-text: #171717; --doc-muted: #737373;
      --doc-accent: #2866c9; --doc-soft: #f3f7ff;
      display: block; box-sizing: border-box; width: 100%; min-width: 0; max-width: 100%;
      margin: 14px 0 4px; padding: 15px 18px; border: 1px solid var(--doc-border); border-radius: 18px;
      background: var(--doc-bg); color: var(--doc-text); font: inherit; font-size: 14px; line-height: 1.5;
      box-shadow: none; text-align: left;
    }
    .dark [data-oproxy-file-turn] .oproxy-doc-result {
      --doc-bg: #262626; --doc-border: #424242; --doc-text: #ececec; --doc-muted: #aaa;
      --doc-accent: #8cbaff; --doc-soft: #273348;
    }
    .oproxy-doc-result .oproxy-file-heading { display: flex; align-items: flex-start; gap: 13px; min-width: 0; }
    .oproxy-doc-result .oproxy-file-icon {
      display: flex; flex: 0 0 40px; width: 40px; height: 44px; align-items: center; justify-content: center;
      color: var(--doc-accent);
    }
    .oproxy-doc-result .oproxy-file-icon img { width: 36px; height: 36px; object-fit: contain; }
    .oproxy-doc-result .oproxy-file-icon svg { width: 28px; height: 32px; }
    .oproxy-doc-result .oproxy-file-info { flex: 1; min-width: 0; }
    .oproxy-doc-result .oproxy-file-status { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
    .oproxy-doc-result .oproxy-file-name { display: block; margin: 0; font-size: 15px; font-weight: 650; line-height: 1.5; overflow-wrap: anywhere; }
    .oproxy-doc-result .oproxy-file-meta { margin: 5px 0 0; color: var(--doc-muted); font-size: 12px; font-weight: 400; overflow-wrap: anywhere; }
    .oproxy-doc-result > small { display: block; margin-top: 12px; color: var(--doc-muted); font-size: 12px; font-weight: 400; }
    .oproxy-doc-result .oproxy-file-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 12px; }
    .oproxy-doc-result .oproxy-file-actions button,
    .oproxy-doc-result .oproxy-file-actions > a,
    .oproxy-doc-result .oproxy-file-more summary,
    .oproxy-doc-result .oproxy-file-more button,
    .oproxy-doc-result .oproxy-file-more a {
      display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box;
      min-height: 34px; padding: 6px 12px; border: 1px solid var(--doc-border); border-radius: 8px;
      background: transparent; color: var(--doc-text); font: inherit; font-size: 13px; font-weight: 500;
      text-decoration: none; white-space: normal; cursor: pointer; line-height: 1.5;
    }
    .oproxy-doc-result .oproxy-file-actions [data-oproxy-document-action="open"],
    .oproxy-doc-result .oproxy-file-actions [data-oproxy-rerun-doc] {
      border-color: var(--doc-border); background: var(--doc-soft); color: var(--doc-accent);
    }
    .oproxy-doc-result .oproxy-file-actions button:hover,
    .oproxy-doc-result .oproxy-file-actions a:hover,
    .oproxy-doc-result .oproxy-file-more summary:hover { filter: brightness(.94); }
    .oproxy-doc-result .oproxy-file-actions :is(button, a, summary):focus-visible { outline: 2px solid var(--doc-accent); outline-offset: 3px; }
    .oproxy-doc-result .oproxy-file-more { position: relative; margin: 0; }
    .oproxy-doc-result .oproxy-file-more summary { list-style: none; color: var(--doc-muted); }
    .oproxy-doc-result .oproxy-file-more summary::-webkit-details-marker { display: none; }
    .oproxy-doc-result .oproxy-file-more-menu {
      position: absolute; right: 0; top: calc(100% + 6px); z-index: 30; display: grid; gap: 4px;
      min-width: 180px; padding: 6px; border: 1px solid var(--doc-border); border-radius: 10px;
      background: var(--doc-bg); box-shadow: 0 8px 24px rgb(0 0 0 / 12%);
    }
    .oproxy-doc-result .oproxy-file-more:not([open]) .oproxy-file-more-menu { display: none; }
    .oproxy-doc-result .oproxy-file-more-menu :is(button,a) { width: 100%; border: 0; justify-content: flex-start; text-align: left; }
    [data-oproxy-file-turn] .oproxy-generating-banner { width: 100%; margin: 12px 0; padding: 12px 16px; font-size: 13px; }
    .oproxy-skill-status { display: none !important; }
    [data-oproxy-file-turn] .oproxy-doc-error { flex-wrap: wrap; align-items: center; overflow-wrap: anywhere; }
    @media (max-width: 520px) {
      [data-oproxy-file-turn] .oproxy-doc-result { padding: 14px; border-radius: 12px; }
      .oproxy-doc-result .oproxy-file-heading { gap: 10px; }
      .oproxy-doc-result .oproxy-file-icon { flex-basis: 36px; width: 36px; height: 44px; font-size: 9px; }
      .oproxy-doc-result .oproxy-file-actions { gap: 6px; }
      .oproxy-doc-result .oproxy-file-actions :is(button,a,summary) { padding: 6px 10px; }
    }
  `;
  document.head.appendChild(style);

  function setHidden(element, attribute, hidden) {
    if (!element) return;
    if (hidden && !element.hasAttribute(attribute)) element.setAttribute(attribute, "");
    if (!hidden && element.hasAttribute(attribute)) element.removeAttribute(attribute);
  }
  function contentWithoutProtocol(container) {
    const contents = [...container.querySelectorAll(".markdown.prose.message-content")];
    if (!contents.length) return null;
    const clone = document.createElement("div");
    contents.forEach(element => clone.appendChild(element.cloneNode(true)));
    clone.querySelectorAll("pre").forEach(pre => {
      const code = pre.querySelector("code");
      if (code && /(?:^|\s)language-oproxy(?:_skill|_document|-document)?(?:\s|$)/.test(code.className)) pre.remove();
    });
    clone.querySelectorAll("[data-oproxy-skill-envelope], [data-oproxy-document-envelope], button, .oproxy-doc-result, .oproxy-doc-error, .oproxy-skill-status").forEach(e => e.remove());
    return { text: clone.textContent.trim(), hasMedia: !!clone.querySelector("img, audio, video, iframe, table") };
  }
  function hideEmptyWrapper(container) {
    const wrapper = container.parentElement;
    if (wrapper && wrapper.children.length === 1 && wrapper.firstElementChild === container && !wrapper.id && wrapper !== document.body) {
      setHidden(wrapper, "data-oproxy-internal-wrapper", container.hasAttribute("data-oproxy-internal-turn"));
    }
  }
  function organizeCard(card, details = {}) {
    if (!card) return;
    if (card.querySelector(".oproxy-file-heading")) return;
    const original = card.querySelector("span")?.textContent || "";
    const parts = original.replace(/^文档已生成[：:]\s*/, "").split(/\s*·\s*/);
    const name = details.name || (original.startsWith("文档已生成") ? parts.shift() : "文档内容已就绪");
    const ready = details.ready ?? (!original.startsWith("文档已生成") && !details.name);
    const metadata = details.metadata || parts.join(" · ");
    const actions = [...card.querySelectorAll("button, a")];
    const hint = card.querySelector("small");
    card.replaceChildren();
    const heading = document.createElement("div"); heading.className = "oproxy-file-heading";
    const icon = document.createElement("span"); icon.className = "oproxy-file-icon"; icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = '<svg viewBox="0 0 24 28" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 1h9l7 7v17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2Z"/><path d="M14 1v7h7M7 13h10M7 18h10M7 23h6"/></svg>';
    if (details.documentId && window.oproxyDesktop?.getDocumentIcon) {
      window.oproxyDesktop.getDocumentIcon(details.documentId).then(result => {
        if (!icon.isConnected || !result?.ok || !/^data:image\/png;base64,/.test(result.dataUrl)) return;
        const image = document.createElement('img'); image.alt = ''; image.src = result.dataUrl; icon.replaceChildren(image);
      }).catch(() => {});
    }
    const info = document.createElement("div"); info.className = "oproxy-file-info";
    const status = document.createElement("span"); status.className = "oproxy-file-status"; status.textContent = ready ? "可生成文件" : "文档已生成";
    const filename = document.createElement("strong"); filename.className = "oproxy-file-name"; filename.textContent = name;
    const meta = document.createElement("p"); meta.className = "oproxy-file-meta"; meta.textContent = metadata || (ready ? "内容已准备好，点击生成保存到下载文件夹" : "已保存到下载文件夹");
    info.append(status, filename, meta); heading.append(icon, info);
    const row = document.createElement("div"); row.className = "oproxy-file-actions";
    const more = document.createElement("details"); more.className = "oproxy-file-more";
    const summary = document.createElement("summary"); summary.textContent = "更多"; summary.setAttribute("aria-label", "更多文档操作");
    const menu = document.createElement("div"); menu.className = "oproxy-file-more-menu";
    for (const action of actions) {
      const kind = action.dataset.oproxyDocumentAction;
      if (kind === "preview") action.textContent = "App 内预览";
      if (kind === "reveal") action.textContent = "在 Finder 中显示";
      if (kind === "open") { action.textContent = "打开文档"; action.title = '使用默认应用打开'; }
      if (kind === "preview" || !kind && !action.hasAttribute("data-oproxy-rerun-doc")) menu.appendChild(action);
      else row.appendChild(action);
    }
    const open = row.querySelector('[data-oproxy-document-action="open"]');
    if (open) row.prepend(open);
    if (menu.children.length) {
      more.append(summary, menu); row.appendChild(more);
      more.addEventListener("toggle", () => {
        if (!more.open) return;
        document.querySelectorAll(".oproxy-file-more[open]").forEach(other => { if (other !== more) other.open = false; });
        menu.style.transform = "";
        const bounds = menu.getBoundingClientRect();
        const shift = Math.max(12 - bounds.left, Math.min(0, innerWidth - 12 - bounds.right));
        if (shift) menu.style.transform = `translateX(${shift}px)`;
      });
      menu.addEventListener("click", event => { if (event.target.closest("button,a")) more.open = false; });
    }
    card.append(heading, row); if (hint) card.appendChild(hint);
    card.closest(".message-render")?.setAttribute("data-oproxy-file-turn", "");
  }
  function refresh() {
    const textarea = document.querySelector('#prompt-textarea');
    syncWorkflowModeMenu();
    // Hide both the selected server chip and the generic server picker.
    // MCP transport stays available; this only changes presentation.
    document.querySelectorAll('button[aria-haspopup="menu"]').forEach(button => {
      const label = button.textContent.replace(/\s+/g, ' ').trim();
      const isLocalMcp = /^(Oproxy Local MCP|MCP\s*服务器|MCP Servers)$/i.test(label);
      button.toggleAttribute('data-oproxy-hidden-local-mcp-chip', isLocalMcp);
    });
    // The picker menu is rendered in a portal, outside the composer.
    document.querySelectorAll('[role="menuitemcheckbox"][name="mcp-servers"]').forEach(item => {
      const isLocalMcp = /^Oproxy Local MCP(?:,|$)/i.test(item.getAttribute('aria-label') || '');
      item.toggleAttribute('data-oproxy-hidden-local-mcp-chip', isLocalMcp);
    });
    document.querySelectorAll('button[role="checkbox"][aria-label="运行代码"],button[role="checkbox"][aria-label="Run Code"]').forEach(button=>button.setAttribute('data-oproxy-code-chip',''));
    if (textarea) {
      textarea.placeholder = '发送消息给 Oproxy';
      textarea.closest('form')?.setAttribute('data-oproxy-composer-form', '');
      let box = textarea.parentElement;
      while (box && box !== textarea.closest('form')) {
        if (box.contains(document.querySelector('[data-testid="send-button"], [data-testid="stop-generation-button"]')) && /border/.test(box.className)) { box.setAttribute('data-oproxy-composer', ''); break; }
        box = box.parentElement;
      }
      const search=document.querySelector('button[role="checkbox"][aria-label="Search"] span:last-child, button[role="checkbox"][aria-label="搜索"] span:last-child');
      if(search&&/^(Search|搜索)$/.test(search.textContent))search.textContent='联网搜索';
    }
    const toolLabels = { 'Searching the web': '正在搜索网页', 'Searching the web again': '正在继续搜索', 'Searched the web': '已搜索网页', 'Processing results': '正在整理搜索资料', 'Reading results': '正在阅读资料' };
    document.querySelectorAll('.tool-status-text span').forEach(span => {
      if (span.children.length === 0 && toolLabels[span.textContent]) span.textContent = toolLabels[span.textContent];
    });
    document.querySelectorAll('#tools-dropdown-menu [role="menuitem"]').forEach(item => {
      const label = item.innerText.trim().split('\n')[0];
      if (/^(记忆|运行代码|Artifacts|MCP 服务器|Memory|Run Code|MCP Servers)$/.test(label) || /^(网络搜索|Web Search)$/.test(label)) item.setAttribute('data-oproxy-hidden-tool-menu', '');
    });
    const messages = [...document.querySelectorAll(".message-render")];
    for (const [index, container] of messages.entries()) {
      if(container.querySelector('.agent-turn'))container.querySelectorAll('.markdown.prose.message-content').forEach(element=>{
        if(/```oproxy(?:_document|-document)\s*\{/.test(element.textContent))element.setAttribute('data-oproxy-document-envelope','');
      });
      container.querySelectorAll('[data-testid="copy-response-button"], .agent-turn button[title="Copy to clipboard"], .agent-turn button[title="复制到剪贴板"]').forEach(button => button.parentElement?.setAttribute('data-oproxy-response-actions', ''));
      const turn = container.querySelector('.agent-turn, .user-turn');
      if (turn && container.firstElementChild !== turn) container.firstElementChild?.setAttribute('data-oproxy-avatar', '');
      const wrapper = container.parentElement;
      if (wrapper?.children.length === 1 && wrapper !== document.body) wrapper.setAttribute('data-oproxy-message-wrapper', '');
      if (container.querySelector('.user-turn')) {
        const copy = container.querySelector('button[title="Copy to clipboard"]');
        copy?.parentElement?.setAttribute('data-oproxy-user-controls', '');
      }
      const content = contentWithoutProtocol(container);
      let internalPrompt = container.hasAttribute("data-oproxy-internal-prompt");
      if (!internalPrompt && container.querySelector(".user-turn") && content && !content.text && !content.hasMedia) {
        const previous = messages[index - 1];
        if(previous?.querySelector("code.language-oproxy_skill")) { internalPrompt=true;container.setAttribute("data-oproxy-internal-prompt",""); }
      }
      const skill = !!container.querySelector("code.language-oproxy_skill, [data-oproxy-skill-envelope]");
      const error = !!container.querySelector(".oproxy-doc-error");
      // Never hide a real question/media or an actionable skill error.
      const hide = (skill || internalPrompt) && !!content && !content.text && !content.hasMedia && !error;
      setHidden(container, "data-oproxy-internal-turn", hide);
      hideEmptyWrapper(container);
      const card = container.querySelector(".oproxy-doc-result");
      if (card) organizeCard(card);
      const fileTurn = !!card || container.hasAttribute("data-oproxy-doc-generating");
      const protocolOnly = fileTurn && content && !content.text && !content.hasMedia;
      setHidden(container, "data-oproxy-file-turn", fileTurn);
      if (!protocolOnly) {
        container.querySelectorAll("[data-oproxy-empty-document-content], [data-oproxy-document-toolbar]").forEach(element => {
          element.removeAttribute("data-oproxy-empty-document-content");
          element.removeAttribute("data-oproxy-document-toolbar");
        });
      } else {
          container.querySelectorAll(".markdown.prose.message-content").forEach(element => {
            const block=element.closest(".text-message")||element;
            setHidden(block,"data-oproxy-empty-document-content",true);
            if(block.parentElement?.children.length===1 && block.parentElement!==container.querySelector(".agent-turn"))setHidden(block.parentElement,"data-oproxy-empty-document-content",true);
          });
          // Hide chat controls for protocol-only answers; file actions replace them.
          const toolbar = container.querySelector('[data-testid="copy-response-button"]')?.parentElement;
          if (toolbar && !toolbar.querySelector(".markdown")) setHidden(toolbar, "data-oproxy-document-toolbar", true);
      }
      if (skill) {
        const toolbar = container.querySelector('[data-testid="copy-response-button"]')?.parentElement;
        if (toolbar && !toolbar.querySelector('.markdown')) setHidden(toolbar, 'data-oproxy-document-toolbar', true);
      }
    }
  }
  function syncWorkflowModeMenu() {
    const menu = document.querySelector('#tools-dropdown-menu');
    const modes = window.__oproxyWorkflowModes;
    const order = window.__oproxyWorkflowModeOrder || [];
    if (!menu || !modes || !order.length) return;
    let selected = [];
    try { selected = JSON.parse(localStorage.getItem('oproxy-workflow-mode-v1') || '[]'); } catch {}
    for (const mode of order) {
      const definition = modes[mode];
      if (!definition || menu.querySelector(`[data-oproxy-mode-option="${mode}"]`)) continue;
      const item = document.createElement('div');
      item.setAttribute('role', 'menuitem'); item.setAttribute('tabindex', '-1');
      item.dataset.oproxyModeOption = mode;
      item.className = 'group px-3 py-3.5 text-sm text-text-primary outline-none focus:bg-surface-hover md:px-2.5 md:py-2 flex w-full cursor-pointer items-center gap-2 hover:bg-surface-hover';
      const icon = document.createElement('span'); icon.className = 'text-base'; icon.textContent = definition.icon;
      const label = document.createElement('span'); label.textContent = definition.label;
      const check = document.createElement('span'); check.className = 'oproxy-mode-check'; check.setAttribute('aria-hidden', 'true');
      item.append(icon, label, check);
      item.addEventListener('click', event => {
        event.preventDefault(); event.stopPropagation();
        let current = [];
        try { current = JSON.parse(localStorage.getItem('oproxy-workflow-mode-v1') || '[]'); } catch {}
        current = Array.isArray(current) ? current : [];
        current = current.includes(mode) ? current.filter(value => value !== mode) : [...current, mode];
        localStorage.setItem('oproxy-workflow-mode-v1', JSON.stringify(current));
        syncWorkflowModeMenu();
      });
      menu.appendChild(item);
    }
    for (const item of menu.querySelectorAll('[data-oproxy-mode-option]')) {
      const active = selected.includes(item.dataset.oproxyModeOption);
      if(item.getAttribute('aria-checked')!==String(active))item.setAttribute('aria-checked', String(active));
      const check = item.querySelector('.oproxy-mode-check'); if (check && check.textContent !== (active ? '✓' : '')) check.textContent = active ? '✓' : '';
    }
  }
  document.addEventListener("click", event => {
    document.querySelectorAll(".oproxy-file-more[open]").forEach(more => { if (!more.contains(event.target)) more.open = false; });
  });
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    document.querySelectorAll(".oproxy-file-more[open]").forEach(more => {
      if (more.contains(document.activeElement)) more.querySelector("summary")?.focus();
      more.open = false;
    });
  });
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true; setTimeout(() => { scheduled = false; refresh(); }, 80);
  });
  observer.observe(document.body, { childList: true, characterData: true, subtree: true });
  window.__oproxyDocumentUI = { organizeCard, refresh };
  refresh();
})();
