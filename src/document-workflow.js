(() => {
  if (window.__oproxyDocumentWorkflow) return;
  const flows = new Map();
  let current = null;
  const labels = { waiting: '正在思考', mode: '正在执行工作模式核验', skill: '正在准备文档', thinking: '正在思考', searching: '正在搜索网页', reading: '正在整理搜索资料', writing: '正在编写文档', rendering: '正在排版并生成文件', repairing: '正在修正文档', paused: '生成已暂停', clarification: '等待补充信息', error: '需要处理', complete: '已完成' };
  const format = type => ({ docx: 'Word 文档', pdf: 'PDF 文档', xlsx: 'Excel 工作簿', pptx: 'PowerPoint 演示文稿' })[type] || '文档';
  const make = (tag, className, text) => { const element = document.createElement(tag); element.className = className; if (text) element.textContent = text; return element; };
  function activeModes() { return window.__oproxyWorkflowModesState?.read?.() || []; }
  function visibleProse(container) {
    const clone = document.createElement('div');
    container.querySelectorAll('.markdown.prose.message-content').forEach(e => clone.append(e.cloneNode(true)));
    clone.querySelectorAll('pre,button,script,style,[data-oproxy-internal-prompt]').forEach(e => e.remove());
    return clone.textContent.trim();
  }
  function ensure(flow) {
    if (flow.path !== location.pathname && !(flow.path === '/c/new' && location.pathname.startsWith('/c/'))) { flow.host?.remove(); return; }
    const messages = [...document.querySelectorAll('.message-render')];
    const first = messages.find((e, i) => i >= flow.baseline && !e.querySelector('.user-turn') && /Response|响应/i.test(e.querySelector('h2')?.textContent || ''));
    const lastUser = messages.slice(flow.baseline).find(e => e.querySelector('.user-turn'));
    const anchor = first || lastUser;
    if (!anchor) return;
    if (!flow.host) {
      const host = make('section', 'oproxy-workflow'); host.dataset.oproxyWorkflow = flow.id;
      const acknowledgement = make('p', 'oproxy-work-ack', flow.modeOnly ? '我会先查阅资料并核对依据，再整理回答。' : `我会先梳理内容和必要资料，再整理成${format(flow.type)}，完成后附上工作总结。`);
      const details = make('details', 'oproxy-work-details');
      const summary = make('summary', 'oproxy-work-status');
      summary.append(make('span', 'oproxy-work-indicator'), make('span', 'oproxy-work-label'), make('span', 'oproxy-work-chevron', '›'));
      summary.setAttribute('aria-live', 'polite');
      const history = make('ol', 'oproxy-work-history');
      const progress = make('p', 'oproxy-work-progress'); progress.setAttribute('aria-live', 'polite');
      details.append(summary, history); host.append(acknowledgement, details, progress);
      flow.host = host;
    }
    flow.modes = flow.modes || activeModes();
    const target = flow.finalId ? document.getElementById(flow.finalId) : first;
    const wrapper = (target || anchor).parentElement;
    const placement = wrapper?.children.length === 1 ? wrapper : (target || anchor);
    if (target || first) {
      if (placement.previousElementSibling !== flow.host) placement.before(flow.host);
    } else if (placement.nextElementSibling !== flow.host) placement.after(flow.host);
    const prose = messages.slice(flow.baseline).some(e => !e.querySelector('.user-turn') && visibleProse(e));
    flow.host.querySelector('.oproxy-work-ack').hidden = prose || flow.stage === 'complete';
    render(flow);
  }
  function render(flow) {
    if (!flow.host) return;
    flow.host.dataset.stage = flow.stage;
    const seconds = Math.max(0, Math.floor(((flow.finishedAt || Date.now()) - flow.startedAt) / 1000));
    const elapsed = seconds >= 60 ? `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒` : `${seconds} 秒`;
    const text = flow.stage === 'complete' ? `回答已完成 · 用时 ${elapsed}` : labels[flow.stage] || labels.thinking;
    const label = flow.host.querySelector('.oproxy-work-label');
    if (label.textContent !== text) label.textContent = text;
    const list = flow.host.querySelector('.oproxy-work-history');
    while (list.children.length < flow.events.length) {
      const event = flow.events[list.children.length];
      const li = make('li', '', event.text); list.append(li);
    }
    const progress = flow.host.querySelector('.oproxy-work-progress');
    progress.hidden = flow.stage === 'complete' || !flow.progress;
    if (progress.textContent !== (flow.progress || '')) progress.textContent = flow.progress || '';
  }
  function stage(value, note, flow = current) {
    if (!flow || flow.path !== location.pathname && !(flow.path === '/c/new' && location.pathname.startsWith('/c/'))) return;
    if (flow.stage === 'complete' && value !== 'complete') return;
    flow.stage = value;
    const text = note || labels[value];
    if (text && flow.events.at(-1)?.text !== text) flow.events.push({ stage: value, text });
    ensure(flow);
  }
  function begin(job, { continuation = false } = {}) {
    for (const flow of flows.values()) {
      if (flow.stage !== 'complete' && flow.host) flow.host.remove();
    }
    const id = job.workflowId || job.id;
    let flow = flows.get(id);
    if (!flow) { flow = { id, path: job.path, baseline: job.workflowBaseline ?? job.baseline, type: job.type, startedAt: job.workflowStartedAt || job.startedAt, stage: 'waiting', events: [] }; flows.set(id, flow); }
    current = flow;
    if (!continuation) {
      stage('waiting', '已收到请求，正在组织内容与交付结构。');
      for (const mode of flow.modes || []) {
        const definition = window.__oproxyWorkflowModes?.[mode];
        if (definition) stage('mode', definition.start);
      }
    }
    else ensure(flow);
  }
  function beginModeOnly({ path = location.pathname, baseline = document.querySelectorAll('.message-render').length, id = crypto.randomUUID(), modes = [], startedAt = Date.now() } = {}) {
    const flow = { id, path, baseline, type: null, startedAt, stage: 'waiting', events: [], modes, modeOnly: true };
    flows.set(id, flow); current = flow;
    stage('waiting', '已收到请求，正在按已启用的工作模式处理。', flow);
    for (const mode of modes) {
      const definition = window.__oproxyWorkflowModes?.[mode];
      if (definition) stage('mode', definition.start, flow);
    }
    ensure(flow);
    return flow;
  }
  function update(job, container) {
    const flow = current;
    if (!flow || flow.id !== (job.workflowId || job.id)) return;
    flow.path = location.pathname;
    ensure(flow);
    if (!container) return;
    // These status elements are emitted by the real Oproxy web-search tool.
    const tool = [...container.querySelectorAll('.tool-status-text, [data-tool-name="web_search"], [data-testid="web-search-status"]')]
      .find(e => /searching (the )?web|searched (the )?web|搜索网页|搜索网络|网页搜索|processing results|reading results|整理搜索资料|正在处理结果|正在读取|已搜索/i.test(`${e.textContent} ${e.getAttribute('aria-label') || ''}`));
    const documentCode = container.querySelector('code.language-oproxy_document');
    const modes = flow.modes || activeModes();
    const hasMode = mode => modes.includes(mode);
    if (hasMode('data') && container.querySelector('[data-tool-name=run_code], [data-testid=code-interpreter-status]')) {
      const definition = window.__oproxyWorkflowModes?.data;
      if (definition) stage('mode', definition.progress);
    }
    if (hasMode('paper') && tool) {
      const definition = window.__oproxyWorkflowModes?.paper;
      if (definition) stage('mode', definition.progress);
    }
    if (hasMode('law') && tool) {
      const definition = window.__oproxyWorkflowModes?.law;
      if (definition) stage('mode', definition.progress);
    }
    if (documentCode) {
      const text = documentCode.textContent;
      const titles = flow.type === 'docx' || flow.type === 'pdf'
        ? [...text.matchAll(/(?:\\n|\n)#{1,3}\s+([^\\\n"]{2,90})/g)].map(m => m[1])
        : [...text.matchAll(/"(?:title|name)"\s*:\s*"([^"\\]{2,90})"/g)].map(m => m[1]);
      if (titles.length) flow.progress = `正在整理「${titles.at(-1)}」的内容。`;
      else flow.progress = '正在撰写内容，并整理成可交付的文档。';
      stage('writing', '正在编写正文并组织文档内容。');
    } else if (tool) {
      const text = tool.getAttribute('aria-label') || tool.textContent;
      if (/searching|正在搜索/i.test(text)) stage('searching', '已调用网页搜索，正在查找参考资料。');
      else if (/searched|已搜索|reading|processing|整理|处理结果|读取/i.test(text)) stage('reading', '网页搜索已返回，正在整理可引用的资料。');
    } else if (flow.stage === 'waiting' || flow.stage === 'skill') stage('thinking', '正在整理内容结构。');
  }
  function updateModeOnly(flow, container) {
    if (!flow?.modeOnly || !container || flow.stage === 'complete' || flow.stage === 'error') return;
    const failure=container.querySelector('[role="alert"], .oproxy-doc-error');
    if(failure){
      const message=failure.textContent||'';
      const needsLocalDataFallback=flow.modes?.includes('data')&&!flow.fallbackSubmitted&&/not authorized|unauthorized|verify access|未获授权|Code API|代码执行/i.test(message);
      if(needsLocalDataFallback&&window.__oproxySubmitModeFallback){flow.fallbackSubmitted=true;stage('mode','远程代码未获授权，改用应用内确定性计算复核。',flow);window.__oproxySubmitModeFallback(message);return;}
      flow.finishedAt=Date.now();stage('error','请求失败，尚未完成核验。可使用重新生成重试。',flow);return;
    }
    const toolText=[...container.querySelectorAll('.tool-status-text')].map(e=>e.getAttribute('aria-label')||e.textContent).join(' ');
    if((flow.modes||[]).includes('data') && /Running|Executing|运行|执行|Python|Code interpreter/i.test(toolText)){
      stage('mode',window.__oproxyWorkflowModes.data.progress,flow);
    }else if(/searching|正在搜索/i.test(toolText)){
      stage('searching','正在搜索并核对来源。',flow);
    }else if(/searched|已搜索|reading|读取|处理结果/i.test(toolText)){
      stage('reading','已收到搜索资料，正在整理来源与限制。',flow);
    }
    if (container.querySelector('[data-testid="copy-response-button"]') && flow.stage !== 'complete') {
      flow.finishedAt = Date.now(); stage('complete', '回答已完成，请结合来源与计算依据核对结论。', flow);
      flow.finalId = container.id;
      flow.host?.querySelector('.oproxy-work-details')?.removeAttribute('open');
    }
  }
  function cancel(reason = 'paused') { if (current && current.stage !== 'complete') stage(reason); }
  function delivery(container, spec, result) {
    if (!container || !spec) return;
    const target = container.querySelector('.agent-turn') || container;
    const old = target.querySelector('.oproxy-work-summary'); if (old) old.remove();
    const block = make('section', 'oproxy-work-summary'); block.setAttribute('aria-label', '工作总结');
    const lead = make('p', 'oproxy-delivery-lead', `已整理成${format(spec.type)}，文件已保存，可直接预览。`);
    const heading = make('p', 'oproxy-work-summary-title', '本次完成');
    const list = make('ul', 'oproxy-work-summary-list');
    let lines = typeof spec.summary === 'string' ? spec.summary.split(/\n/).map(s => s.replace(/^\s*(?:[-*•]|\d+[.、])\s*/, '').trim()).filter(Boolean).slice(0, 6) : [];
    if (!lines.length) {
      if (spec.sheets?.length) lines = [`整理了 ${spec.sheets.length} 个工作表：${spec.sheets.map(s => s.name || '数据').join('、')}。`];
      else if (spec.slides?.length) lines = spec.slides.slice(0, 5).map(s => s.title);
      else lines = [...(spec.content || '').matchAll(/^#{1,3}\s+(.+)$/gm)].map(m => m[1]).filter(s => s !== spec.title).slice(0, 6);
      if (!lines.length) lines = [`完成《${spec.title}》的内容整理与文件排版。`];
    }
    if (result.calculation?.formulas) lines.push(`已重新计算 ${result.calculation.formulas} 个公式。`);
    if (result.presentation?.slides) lines.push(`已生成 ${result.presentation.slides} 页幻灯片，包含自动续页。`);
    for (const line of lines) list.append(make('li', '', line));
    block.append(lead, heading, list);
    const card = target.querySelector('.oproxy-doc-result');
    if (card) card.after(block); else target.append(block);
    const flow = current;
    const index = [...document.querySelectorAll('.message-render')].indexOf(container);
    if (flow && index >= flow.baseline && flow.stage !== 'complete' && (flow.path === location.pathname || flow.path === '/c/new')) {
      flow.finalId = container.id; flow.path = location.pathname; flow.finishedAt = Date.now();
      stage('complete', '文档已生成并保存到下载文件夹。');
      flow.host?.querySelector('details')?.removeAttribute('open');
    }
    window.__oproxyDocumentUI?.refresh();
  }
  let queued = false;
  new MutationObserver(() => {
    if (queued) return; queued = true;
    setTimeout(() => {
      queued = false;
      for (const flow of flows.values()) {
        if (!(flow.path === location.pathname || flow.path === '/c/new')) continue;
        ensure(flow);
        if (flow.modeOnly) {
          const messages = [...document.querySelectorAll('.message-render')];
          const answer = messages.slice(flow.baseline).filter(e => !e.querySelector('.user-turn') && /Response|响应/i.test(e.querySelector('h2')?.textContent || '')).at(-1);
          if (answer) updateModeOnly(flow, answer);
        }
      }
    }, 100);
  }).observe(document.body, { childList: true, characterData: true, subtree: true });
  document.addEventListener('click', event => {
    if (event.target.closest('[data-testid="stop-button"], [data-testid="stop-generation-button"]')) cancel('paused');
  }, true);
  function refreshModes(labels = activeModes().map(mode => window.__oproxyWorkflowModes?.[mode]?.label).filter(Boolean)) {
    if (!current?.host || !labels.length) return;
    current.host.dataset.modes = labels.join('、');
  }
  window.__oproxyDocumentWorkflow = { begin, beginModeOnly, update, updateModeOnly, stage, cancel, delivery, refreshModes };
})();
