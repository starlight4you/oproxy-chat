(() => {
  if (window.__oproxyDocButtonsInstalled) return;
  window.__oproxyDocButtonsInstalled = true;

  const RUNTIME_START = "[[OPROXY_LOCAL_RUNTIME]]";
  const RUNTIME_END = "[[/OPROXY_LOCAL_RUNTIME]]";
  const RUNTIME_INSTRUCTION = window.__oproxyDocumentInstruction;
  const WORKFLOW_MODE_KEY = "oproxy-workflow-mode-v1";
  function readWorkflowModes() {
    try { const value = JSON.parse(localStorage.getItem(WORKFLOW_MODE_KEY) || "[]"); return Array.isArray(value) ? value.filter(mode => window.__oproxyWorkflowModes?.[mode]) : []; } catch { return []; }
  }
  function saveWorkflowModes(modes) { try { localStorage.setItem(WORKFLOW_MODE_KEY, JSON.stringify([...new Set(modes)])); } catch {} }
  function workflowModePrompt() { return readWorkflowModes().map(mode => window.__oproxyWorkflowModes[mode].prompt).join("\n\n"); }
  function workflowModeState() { return readWorkflowModes().map(mode => window.__oproxyWorkflowModes[mode].label); }
  let modeFallbackInFlight=false;
  function submitModeFallback(){
    if(modeFallbackInFlight)return false;
    const textarea=document.querySelector('#prompt-textarea'),send=document.querySelector('[data-testid="send-button"]');
    if(!textarea||!send||textarea.value.trim())return false;
    const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;
    const instruction=`${RUNTIME_START}\n数据分析模式的远程代码工具返回未获授权。不要再次调用远程代码、bash或脚本工具。请改用应用内已提供的确定性公式/工作簿计算能力，或在回答中展示可复核的分组加总步骤；明确说明没有执行远程脚本。只使用当前对话和已上传数据，不编造结果。\n${RUNTIME_END}`;
    modeFallbackInFlight=true;setter.call(textarea,`${instruction}\n\n请继续完成刚才的数据核对任务。`);textarea.dispatchEvent(new Event('input',{bubbles:true}));
    setTimeout(()=>{if(!send.disabled)send.click();modeFallbackInFlight=false},150);return true;
  }

  function ensureStyles() {
    if (document.getElementById("oproxy-runtime-styles")) return;

    const style = document.createElement("style");
    style.id = "oproxy-runtime-styles";
    style.textContent = `
      [data-oproxy-doc-hidden] pre { display: none !important; }

      .oproxy-generating-banner {
        display: flex;
        align-items: center;
        gap: 10px;
        margin: 10px 0;
        padding: 10px 14px;
        border-radius: 8px;
        background: linear-gradient(90deg, rgba(0,150,136,0.08), rgba(0,150,136,0.2), rgba(0,150,136,0.08));
        background-size: 200% 100%;
        animation: oproxy-banner-shimmer 2s linear infinite;
      }

      .oproxy-generating-text {
        font-size: 14px;
        font-weight: 700;
        background: linear-gradient(90deg, #00796b 0%, #4dd0e1 50%, #00796b 100%);
        background-size: 200% 100%;
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
        animation: oproxy-text-shimmer 2s linear infinite;
      }

      .oproxy-spinner {
        width: 14px;
        height: 14px;
        border: 2px solid rgba(0,150,136,0.25);
        border-top-color: #00796b;
        border-radius: 50%;
        animation: oproxy-spin 0.8s linear infinite;
      }

      .oproxy-doc-result,
      .oproxy-doc-error {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 10px 0;
        padding: 10px 14px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        line-height: 1.5;
      }

      .oproxy-doc-result {
        background: rgba(0,150,136,0.12);
        color: #00796b;
      }

      .oproxy-doc-error {
        background: rgba(185,28,28,0.1);
        color: #b91c1c;
      }

      .oproxy-doc-result a {
        color: #00796b;
        text-decoration: underline;
        cursor: pointer;
      }

      @keyframes oproxy-banner-shimmer {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }

      @keyframes oproxy-text-shimmer {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }

      @keyframes oproxy-spin {
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }

  function showToast(message, isError = false, persistent = false) {
    let toast = document.getElementById("oproxy-local-toast");

    if (!toast) {
      toast = document.createElement("div");
      toast.id = "oproxy-local-toast";
      Object.assign(toast.style, {
        position: "fixed",
        right: "20px",
        bottom: "100px",
        zIndex: "999999",
        maxWidth: "420px",
        padding: "12px 16px",
        borderRadius: "10px",
        background: "#111827",
        color: "#ffffff",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', sans-serif",
        fontSize: "13px",
        lineHeight: "1.5",
        boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
        transition: "opacity 0.2s ease",
        opacity: "1",
        pointerEvents: "none",
      });
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.background = isError ? "#b91c1c" : "#111827";
    toast.style.opacity = "1";
    clearTimeout(window.__oproxyToastTimer);
    if (!persistent) {
      window.__oproxyToastTimer = setTimeout(() => {
        toast.style.opacity = "0";
      }, 8000);
    }
  }

  function hideRuntimePrompts() {
    for (const content of document.querySelectorAll(".markdown.prose.message-content")) {
      if (!content.textContent.includes(RUNTIME_START)) continue;
      if(content.textContent.includes('文档尚未生成：'))content.closest('.message-render')?.setAttribute('data-oproxy-repair-prompt','');
      content.closest(".message-render")?.setAttribute("data-oproxy-internal-prompt", "");
      const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
      const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
      let hiding = false;
      for (const node of nodes) {
        const value = node.textContent;
        const start = value.indexOf(RUNTIME_START), end = value.indexOf(RUNTIME_END);
        if (start >= 0) hiding = true;
        if (!hiding) continue;
        if (end >= 0) { node.textContent = value.slice(end + RUNTIME_END.length); hiding = false; }
        else node.textContent = start >= 0 ? value.slice(0, start) : "";
      }
    }
  }

  function markDocumentGenerating(container) {
    if (!container) return;
    ensureStyles();

    container.setAttribute("data-oproxy-doc-hidden", "true");
    container.setAttribute("data-oproxy-doc-generating", "true");

    const h2 = container.querySelector("h2");
    if (!h2) return;
    if (container.querySelector(".oproxy-generating-banner")) return;

    const banner = document.createElement("div");
    banner.className = "oproxy-generating-banner";
    banner.innerHTML = `<span class="oproxy-spinner"></span><span class="oproxy-generating-text">正在生成......</span>`;
    h2.insertAdjacentElement("afterend", banner);
  }

  function clearDocumentGenerating(container, { unhide = false } = {}) {
    if (!container) return;
    container.querySelector(".oproxy-generating-banner")?.remove();
    container.removeAttribute("data-oproxy-doc-generating");
    if (unhide) container.removeAttribute("data-oproxy-doc-hidden");
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => {
      const replacements = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };
      return replacements[character];
    });
  }

  function documentRequest(container,spec) {
    return {spec,requestId:`${location.pathname}:${container.id||"answer"}:${JSON.stringify(spec)}`};
  }
  function showResultCard(container, result, spec = extractDocumentSpec(container)) {
    if (!container) return;
    clearDocumentGenerating(container);
    container.querySelector(".oproxy-doc-error")?.remove();
    for (const status of document.querySelectorAll(".oproxy-skill-status")) status.textContent = "文档技能已读取";
    const target=container.querySelector(".agent-turn")||container;
    let card=target.querySelector(".oproxy-doc-result");
    if(!card){card=document.createElement("div");card.className="oproxy-doc-result";target.appendChild(card);}
    const name=result.filename||String(result.filePath||"").split("/").pop()||"文档";
    const size=result.bytes?` · ${(result.bytes/1024).toFixed(1)} KB`:"";
    const calculation=result.calculation?.formulas?` · 已重算 ${result.calculation.formulas} 个公式`:"";
    const pages=result.presentation?.slides?` · ${result.presentation.slides} 页幻灯片`:"";
    card.innerHTML=`<span>文档已生成：${escapeHtml(name)}${size}${calculation}${pages}</span>`;
    for(const [action,label]of [["preview","App 内预览"],["open","用外部应用打开"],["reveal","在 Finder 中显示"]]){
      if(!result.documentId||!window.oproxyDesktop?.documentAction||action==="preview"&&!result.previewPath)continue;
      const button=document.createElement("button");button.type="button";button.textContent=label;button.dataset.oproxyDocumentAction=action;
      button.onclick=async(event)=>{event.preventDefault();event.stopPropagation();const response=await window.oproxyDesktop.documentAction({documentId:result.documentId,action});if(!response?.ok)showToast(response?.error||"无法打开文档",true);};
      card.appendChild(button);
    }
    if(result.previewError){const hint=document.createElement("small");hint.textContent="内置预览暂不可用，可打开原文件查看";card.appendChild(hint);}
    const downloads=document.createElement("a");downloads.href="#";downloads.textContent="打开下载文件夹";
    downloads.onclick=event=>{event.preventDefault();event.stopPropagation();window.oproxyDesktop?.openDownloads?.();};card.appendChild(downloads);
    window.__oproxyDocumentUI?.organizeCard(card, { name, documentId: result.documentId, metadata: `${size}${calculation}${pages}`.replace(/^ · /, "") });
    window.__oproxyDocumentWorkflow?.delivery(container, spec, result);
  }

  function showErrorCard(container, message, { repairable=false, type }={}) {
    if (!container) return;
    clearDocumentGenerating(container);

    const target = container.querySelector(".agent-turn") || container;
    let card = target.querySelector(".oproxy-doc-error");
    if (!card) {
      card = document.createElement("div");
      card.className = "oproxy-doc-error";
      target.appendChild(card);
    }

    card.textContent = `文档生成失败：${message}`;
    const retry = document.createElement("button");
    retry.textContent = "重试生成";
    retry.onclick = () => {
      const spec = extractDocumentSpec(container), skill = extractSkillRequest(container);
      if (spec) runDocumentSpec(container, spec);
      else if (skill) continueWithSkill(container, skill);
      else { const textarea = document.querySelector("#prompt-textarea"); if (textarea && !textarea.value.trim()) {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value").set.call(textarea,"请按刚才的文档技能返回完整文档文件。");
        textarea.dispatchEvent(new Event("input",{bubbles:true})); textarea.focus();
      } }
    };
    card.appendChild(retry);
    window.__oproxyDocumentWorkflow?.stage("error", message);
    if(repairable && /^(docx|pdf|xlsx|pptx)$/.test(type)){
      const repair=document.createElement("button");repair.type="button";repair.textContent="让模型修正";
      repair.dataset.oproxyRepair="true";
      repair.onclick=()=>requestDocumentRepair(container,type,message,true);
      card.appendChild(repair);
    }
  }

  function messageSource(element) {
    // Read only this rendered text component's source, never React hooks,
    // account state or network credentials. DOM is the fallback if it changes.
    const key=Object.keys(element).find(k=>k.startsWith('__reactFiber$'));
    let fiber=key&&element[key];
    for(let i=0;fiber&&i<4;i++,fiber=fiber.return){
      const props=fiber.memoizedProps;
      if(typeof props?.text==='string' && props.isCreatedByUser!==true)return props.text;
    }
    const clone=element.cloneNode(true);
    clone.querySelectorAll('a[href]').forEach(a=>{a.replaceWith(document.createTextNode('['+a.textContent+']('+a.href+')'));});
    clone.querySelectorAll('strong,em').forEach(e=>{const delimiter=e.tagName==='STRONG'?'**':'*';e.replaceWith(document.createTextNode(delimiter+e.textContent+delimiter));});
    return clone.textContent;
  }
  function extractDocumentSpec(container) {
    if(!container)return null;
    const parse=window.__oproxyParseDocumentEnvelope;
    if(!parse)return null;
    for(const code of container.querySelectorAll('pre code')){
      if(!/(?:^|\s)language-oproxy(?:_document|-document)?(?:\s|$)/i.test(code.className))continue;
      const spec=parse(code.textContent,true);if(spec)return spec;
    }
    for(const element of container.querySelectorAll('.markdown.prose.message-content')){
      const spec=parse(messageSource(element));
      if(spec){element.setAttribute('data-oproxy-document-envelope','');return spec;}
    }
    return null;
  }
  function hasDocumentEnvelope(container) {
    return [...container.querySelectorAll('pre code')].some(code=>/(?:^|\s)language-oproxy(?:_document|-document)?(?:\s|$)/i.test(code.className)) || [...container.querySelectorAll('.markdown.prose.message-content')].some(e=>/```oproxy(?:_document|-document)\s*\{/.test(messageSource(e)));
  }
  function inferDocumentType(container) {
    const match=(container.textContent||'').match(/"type"\s*:\s*"(docx|pdf|xlsx|pptx)"/);
    return match?.[1]||activeJob?.type;
  }

  async function runDocumentSpec(container, spec) {
    if (!container || !spec) return;
    if (!window.oproxyDesktop?.generateDocument) {
      showToast("本地文档生成器不可用。", true);
      return;
    }
    if (container.hasAttribute("data-oproxy-auto-run")) return;
    container.setAttribute("data-oproxy-auto-run", "true");
    const jobId=activeJob?.id;

    container.querySelector(".oproxy-doc-result")?.remove();
    container.querySelector(".oproxy-doc-error")?.remove();
    markDocumentGenerating(container);
    window.__oproxyDocumentWorkflow?.stage("rendering", "正文已完成，正在排版、校验并保存文件。");

    try {
      const result = await window.oproxyDesktop.generateDocument(documentRequest(container,spec));
      if (result?.ok) {
        if(activeJob?.id===jobId)stopAutoRunWatcher();
        finishJob(jobId);
        const name =
          String(result.filePath || "").split("/").pop() ||
          String(spec.filename || "文档");
        document.getElementById("oproxy-local-toast")?.remove();
        showResultCard(container, result, spec);
      } else {
        const detail = String(result?.error || "未知错误").slice(0, 300);
        if(result?.repairable && activeJob?.id===jobId && await requestDocumentRepair(container,spec.type,detail))return;
        showToast(`文档生成失败：${detail}`, true);
        showErrorCard(container,detail,{repairable:result?.repairable,type:spec.type});
      }
    } catch (error) {
      const detail = String(error).slice(0, 300);
      showToast(`文档生成失败：${detail}`, true);
      showErrorCard(container, detail);
    } finally {
      container.removeAttribute("data-oproxy-auto-run");
    }
  }

  function addDocumentSpecCard(container, spec) {
    const target = container.querySelector(".agent-turn") || container;
    if (target.querySelector(".oproxy-doc-result")) return;

    const card = document.createElement("div");
    card.className = "oproxy-doc-result";
    card.innerHTML = `<span>文档内容已就绪</span><a href="#" data-oproxy-rerun-doc>生成文档</a><a href="#" data-oproxy-open-downloads>打开下载文件夹</a>`;

    card
      .querySelector("[data-oproxy-rerun-doc]")
      ?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        container.removeAttribute("data-oproxy-auto-run");
        runDocumentSpec(container, spec);
      });

    card
      .querySelector("[data-oproxy-open-downloads]")
      ?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        window.oproxyDesktop?.openDownloads?.();
      });

    target.appendChild(card);
    window.__oproxyDocumentUI?.organizeCard(card, { name: spec.filename || spec.title || "文档内容已就绪", type: spec.type, ready: true });
    if(window.oproxyDesktop?.lookupDocument){
      const currentPath=location.pathname;
      window.oproxyDesktop.lookupDocument(documentRequest(container,spec)).then(result=>{
        if(result?.document&&container.isConnected&&location.pathname===currentPath&&!container.hasAttribute("data-oproxy-auto-run"))showResultCard(container,result.document,spec);
      }).catch(()=>{});
    }
  }

  function extractSkillRequest(container) {
    if(!container)return null;
    for(const code of container.querySelectorAll('pre code')){
      if(!/(?:^|\s)language-oproxy_skill(?:\s|$)/.test(code.className))continue;
      try{const value=JSON.parse(code.textContent);if(/^(docx|pdf|xlsx|pptx)$/.test(value.type))return value.type;}catch{}
    }
    for(const element of container.querySelectorAll('.markdown.prose.message-content')){
      const type=window.__oproxyParseSkillEnvelope?.(messageSource(element));
      if(type){element.setAttribute('data-oproxy-skill-envelope','');return type;}
    }
    return null;
  }
  async function sendDocumentContinuation(container,instruction,{type,repairs=0,repair=false}={}) {
    const currentPath=location.pathname,currentJobId=activeJob?.id;
    const textarea=document.querySelector("#prompt-textarea"),send=document.querySelector('[data-testid="send-button"]');
    if(!textarea||!send||textarea.value.trim())throw new Error("输入框有未发送内容，请先保留或发送草稿，再点击重试。");
    if(!container.isConnected||container!==[...document.querySelectorAll(".message-render")].at(-1))throw new Error("请返回这条文档回答所在的对话后重试。");
    const modePrompt = workflowModePrompt();
    if (modePrompt) instruction = instruction.replace(RUNTIME_END, `\n${modePrompt}\n${RUNTIME_END}`);
    const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value").set;
    setter.call(textarea,instruction);textarea.dispatchEvent(new Event("input",{bubbles:true}));
    await new Promise(resolve=>setTimeout(resolve,100));
    const ready=document.querySelector('[data-testid="send-button"]');
    if(location.pathname!==currentPath||!container.isConnected||textarea.value!==instruction||activeJob?.id!==currentJobId){
      if(textarea.value===instruction){setter.call(textarea,"");textarea.dispatchEvent(new Event("input",{bubbles:true}));}
      return false;
    }
    if(!ready||ready.disabled){
      // Remove only our unchanged instruction, preserving anything the user typed.
      if(textarea.value===instruction){setter.call(textarea,"");textarea.dispatchEvent(new Event("input",{bubbles:true}));}
      throw new Error("当前无法继续生成，请稍后重试。");
    }
    window.__oproxyDocumentContinuation={type,repairs,skillRound:1};
    clearDocumentGenerating(container);
    container.querySelector(".oproxy-doc-error")?.remove();
    container.querySelector(".oproxy-skill-status")?.remove();
    const card=document.createElement("div");card.className="oproxy-skill-status";
    card.textContent=repair?"已将文档校验问题交给模型修正…":`已读取${({docx:" Word",pdf:" PDF",xlsx:" Excel",pptx:" PowerPoint"})[type]}文档技能，正在生成…`;
    (container.querySelector(".agent-turn")||container).appendChild(card);
    window.__oproxyDocumentUI?.refresh();ready.click();return true;
  }
  async function continueWithSkill(container,type) {
    if(container.hasAttribute("data-oproxy-skill-reading"))return;
    container.setAttribute("data-oproxy-skill-reading","true");
    window.__oproxyDocumentWorkflow?.stage("skill", "正在读取文档技能与排版要求。");
    const currentPath=location.pathname,currentJobId=activeJob?.id;
    try {
      const result=await window.oproxyDesktop?.readDocumentSkill(type);
      if(!result?.ok)throw new Error(result?.error||"文档技能读取失败");
      if(location.pathname!==currentPath||!container.isConnected||activeJob?.id!==currentJobId)return;
      await sendDocumentContinuation(container,result.instruction,{type,repairs:activeJob?.repairs||0});
    }catch(error){clearDocumentGenerating(container,{unhide:true});showErrorCard(container,String(error.message||error));}
    finally{container.removeAttribute("data-oproxy-skill-reading");}
  }
  async function requestDocumentRepair(container,type,diagnostic,manual=false) {
    const job=activeJob;
    if(!window.oproxyDesktop?.repairDocument||!/^(docx|pdf|xlsx|pptx)$/.test(type)||container.hasAttribute("data-oproxy-repairing"))return false;
    if(!manual&&(!job||!pathMatches(job)||(job.repairs||0)>=1))return false;
    if(container!==[...document.querySelectorAll(".message-render")].at(-1))return false;
    const currentPath=location.pathname;
    container.setAttribute("data-oproxy-repairing","true");
    window.__oproxyDocumentWorkflow?.stage("repairing", "校验发现需要调整的内容，正在修正。");
    try{
      const result=await window.oproxyDesktop.repairDocument({type,diagnostic:String(diagnostic).slice(0,1800)});
      if(!result?.ok)throw new Error(result?.error||"无法读取文档修正指令");
      if(location.pathname!==currentPath||(!manual&&activeJob?.id!==job?.id))return false;
      const repairs=(job?.repairs||0)+1;
      // Persist before submitting so reload cannot reset the automatic limit.
      if(job){job.repairs=repairs;saveJob(job);}
      return await sendDocumentContinuation(container,result.instruction,{type,repairs,repair:true});
    }catch(error){showErrorCard(container,String(error.message||error),{repairable:true,type});return true;}
    finally{container.removeAttribute("data-oproxy-repairing");}
  }

  const JOB_KEY = "oproxy-document-job-v1";
  let activeJob = null;
  function readJob() {
    try {
      const job = JSON.parse(localStorage.getItem(JOB_KEY));
      if (!job || !Number.isFinite(job.startedAt) || Date.now()-job.startedAt >= 24*60*60*1000) return null;
      job.allowNewBinding=false;
      return job;
    }
    catch { return null; }
  }
  function saveJob(job) {
    activeJob = job;
    try { if (job) localStorage.setItem(JOB_KEY,JSON.stringify(job)); else localStorage.removeItem(JOB_KEY); } catch {}
  }
  function finishJob(expectedId) {
    if (expectedId && activeJob?.id !== expectedId) return;
    saveJob(null); sessionStorage.removeItem("oproxy-auto-run-pending");
  }
  function stopAutoRunWatcher() {
    clearInterval(window.__oproxyAutoRunTimer);
    window.__oproxyAutoRunTimer = null;
  }
  function pathMatches(job) {
    return job.path === location.pathname || job.allowNewBinding && job.path === "/c/new" && location.pathname.startsWith("/c/") && location.pathname !== "/c/new";
  }
  function startAutoRunWatcher(skillRound = 0, restored = null, context = {}) {
    stopAutoRunWatcher();
    const job = restored || { path: location.pathname, baseline: context.baseline ?? document.querySelectorAll(".message-render").length-(context.regenerating?1:0),
      priorIds: [...document.querySelectorAll(".message-render")].slice(0,context.regenerating?-1:undefined).map(c=>c.id).filter(Boolean), skillRound, startedAt:Date.now(), allowNewBinding:true, id:crypto.randomUUID(), type:context.type, repairs:context.repairs||0, previousText:context.previousText, awaitingChange:!!context.regenerating,
      workflowId:context.workflowId, workflowBaseline:context.workflowBaseline, workflowStartedAt:context.workflowStartedAt };
    if (restored && !pathMatches(job)) return;
    job.paused=false;
    saveJob(job);
    let lastSignature = "", lastProgressAt = Date.now();
    window.__oproxyDocumentWorkflow?.begin(job, { continuation: skillRound > 0 });
    window.__oproxyAutoRunTimer = setInterval(() => {
      if (!pathMatches(job)) {
        stopAutoRunWatcher();
        document.querySelectorAll("[data-oproxy-doc-generating]").forEach(c=>clearDocumentGenerating(c,{unhide:true}));
        document.getElementById("oproxy-local-toast")?.remove();
        return;
      }
      if (job.path !== location.pathname) { job.path=location.pathname; job.allowNewBinding=false; saveJob(job); }
      const containers = [...document.querySelectorAll(".message-render")];
      const last = containers.at(-1);
      window.__oproxyDocumentWorkflow?.update(job, last);
      const signature = `${containers.length}:${last?.textContent.length || 0}`;
      if (signature !== lastSignature) { lastSignature=signature;lastProgressAt=Date.now(); }
      if (containers.length <= job.baseline || !last || job.priorIds?.includes(last.id) || !/响应|Response/i.test(last.querySelector("h2")?.innerText || "")) {
        if (Date.now()-lastProgressAt > 60000 && !document.querySelector('[data-testid="stop-button"], [data-testid="stop-generation-button"]')) {
          stopAutoRunWatcher(); job.paused=true; saveJob(job);
          window.__oproxyDocumentWorkflow?.stage("paused", "尚未收到回答，可检查网络后重试。");
          showToast("尚未收到文档回答，请检查网络并重新发送。",true);
        }
        return;
      }
      if(job.awaitingChange){
        if(last.textContent===job.previousText&&last.querySelector('[data-testid="copy-response-button"]'))return;
        job.awaitingChange=false;delete job.previousText;saveJob(job);
      }
      const requestFailure=last.querySelector('[role="alert"]');
      if(requestFailure){stopAutoRunWatcher();finishJob();clearDocumentGenerating(last,{unhide:true});window.__oproxyDocumentWorkflow?.stage('error','服务请求失败，文档尚未生成。可点击重新生成重试。');return;}
      markDocumentGenerating(last);
      if (last.querySelector('[data-testid="copy-response-button"]')) {
        stopAutoRunWatcher();
        const failure=last.querySelector('[role="alert"]');
        if(failure){finishJob();clearDocumentGenerating(last,{unhide:true});window.__oproxyDocumentWorkflow?.stage('error','服务请求失败，文档尚未生成。可点击重新生成重试。');return;}
        const skill = extractSkillRequest(last);
        if (skill) {
          if (job.skillRound >= 1) { finishJob(); clearDocumentGenerating(last,{unhide:true}); showErrorCard(last,"模型重复请求技能，请重新生成。"); }
          else continueWithSkill(last, skill);
          return;
        }
        const spec = extractDocumentSpec(last);
        if (spec) { runDocumentSpec(last,spec); return; }
        const type=inferDocumentType(last);
        if(hasDocumentEnvelope(last) && /^(docx|pdf|xlsx|pptx)$/.test(type)){
          requestDocumentRepair(last,type,"文档协议的JSON无效或缺少type/title，必须返回合法JSON且保留完整内容。")
            .then(sent=>{if(!sent){finishJob(job.id);clearDocumentGenerating(last,{unhide:true});showErrorCard(last,"文档格式仍不正确，请重试修正。",{repairable:true,type});}});
          return;
        }
        finishJob();
        clearDocumentGenerating(last,{unhide:true});
        window.__oproxyDocumentWorkflow?.cancel("clarification");
        // Clarifying questions and explanations are valid chat responses. Keep
        // them visible; only an explicit malformed document envelope is a failure.
        document.getElementById("oproxy-local-toast")?.remove();
        return;
      }
      if (Date.now()-lastProgressAt > 15*60*1000) {
        stopAutoRunWatcher(); job.paused=true; saveJob(job);
        clearDocumentGenerating(last,{unhide:true});
        showErrorCard(last,"AI 响应似乎停滞了，请检查网络后重试。");
        showToast("AI 响应似乎停滞了，请检查网络后重试。",true);
      }
    },500);
  }

  function preparePrompt(textarea) {
    if (!(textarea instanceof HTMLTextAreaElement)) return;

    const value = textarea.value.trim();
    if (!value) return;

    const continuation=window.__oproxyDocumentContinuation;
    window.__oproxyDocumentContinuation=null;
    let previousType=null;
    const previousAnswer=[...document.querySelectorAll(".message-render")].reverse()
      .find(container=>/响应|Response/i.test(container.querySelector("h2")?.innerText||""));
    if(previousAnswer)previousType=extractDocumentSpec(previousAnswer)?.type || extractSkillRequest(previousAnswer);
    const intent=window.__oproxyDocumentIntent?.(value,previousType)||{create:/文档|word|docx|pdf|excel|xlsx|ppt/i.test(value),type:null};
    const wantsDocument=continuation||intent.create;
    const activeWorkflowModes = readWorkflowModes();
    if(wantsDocument){
      const previousJob=activeJob;
      const context=continuation ? {...continuation,workflowId:previousJob?.workflowId||previousJob?.id,workflowBaseline:previousJob?.workflowBaseline??previousJob?.baseline,workflowStartedAt:previousJob?.workflowStartedAt||previousJob?.startedAt} : {type:intent.type};
      startAutoRunWatcher(continuation?.skillRound||0,null,context);
    }
    const modePrompt = workflowModePrompt();
    if((!wantsDocument&&!modePrompt)||value.includes(RUNTIME_START))return;
    const instruction=intent.type
      ? RUNTIME_INSTRUCTION.replace(RUNTIME_END,`本轮用户在修改或创建 ${intent.type} 文件，请依据完整对话和最新要求交付新的完整文件，保留未要求删除的有效内容。\n${RUNTIME_END}`)
      : RUNTIME_INSTRUCTION;
    const searchEnabled=document.querySelector('button[role="checkbox"][aria-label="Search"][aria-checked="true"], button[role="checkbox"][aria-label="搜索"][aria-checked="true"]');
    const searchInstruction=searchEnabled ? "\n网页搜索已启用；需要核对外部事实时请实际调用搜索工具。" : "\n若本轮没有可用搜索工具，按已知资料完成并说明资料范围，不要声称已经搜索网页。";

    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    ).set;

    if (!wantsDocument && activeWorkflowModes.length) {
      window.__oproxyDocumentWorkflow?.beginModeOnly({ baseline: document.querySelectorAll('.message-render').length, modes: activeWorkflowModes });
    }

    const modeInstruction = modePrompt ? `\n\n${modePrompt}` : "";
    const hiddenInstruction = wantsDocument
      ? instruction.replace(RUNTIME_END, searchInstruction + modeInstruction + "\n" + RUNTIME_END)
      : `${RUNTIME_START}${modeInstruction}${RUNTIME_END}`;
    setter.call(textarea, `${hiddenInstruction}\n\n${value}`);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // Enable the server's real search capability on the first document request.
  // An existing unchecked Search chip is an explicit user choice and is kept.
  let preparingSearch = false, replayingSend = false;
  function deferForSearch(textarea, event) {
    if (replayingSend || !textarea?.value.trim() || textarea.value.includes(RUNTIME_START)) return false;
    const prior=[...document.querySelectorAll('.message-render')].reverse().find(c=>/Response|响应/i.test(c.querySelector('h2')?.textContent||''));
    const type=extractDocumentSpec(prior)?.type||extractSkillRequest(prior);
    if(!window.__oproxyDocumentIntent?.(textarea.value,type).create)return false;
    if(document.querySelector('button[role="checkbox"][aria-label="Search"], button[role="checkbox"][aria-label="搜索"]'))return false;
    const tools=document.querySelector('#tools-dropdown-button');
    if(!tools)return false;
    event.preventDefault();event.stopImmediatePropagation();
    if(preparingSearch)return true;
    preparingSearch=true;
    const draft=textarea.value,path=location.pathname,model=document.querySelector('[data-testid="model-selector-button"]')?.textContent;
    (async()=>{
      try{
        tools.click();
        const end=Date.now()+1500;
        let item;
        while(Date.now()<end){
          item=[...document.querySelectorAll('[role="menuitem"]')].find(e=>/^(Web Search|网页搜索|网络搜索)$/.test(e.innerText.trim()));
          if(item)break;
          await new Promise(resolve=>setTimeout(resolve,50));
        }
        if(item){item.click();await new Promise(resolve=>setTimeout(resolve,400));}
        document.querySelector('#tools-dropdown-menu > button')?.click();
        // Menu configuration must not submit a changed draft or another model.
        if(location.pathname!==path||textarea.value!==draft||document.querySelector('[data-testid="model-selector-button"]')?.textContent!==model)return;
        const send=document.querySelector('[data-testid="send-button"]');
        if(send&&!send.disabled){replayingSend=true;send.click();replayingSend=false;}
      }finally{preparingSearch=false;replayingSend=false;}
    })();
    return true;
  }

  function markExistingDocumentMessages() {
    if (window.__oproxyAutoRunTimer) return;

    const containers = [...document.querySelectorAll(".message-render")];
    for (const [index,container] of containers.entries()) {
      const next=containers[index+1];
      if(next?.hasAttribute('data-oproxy-repair-prompt')){
        container.querySelector('.oproxy-doc-result')?.remove();
        container.querySelectorAll('.markdown.prose.message-content').forEach(e=>{if(hasDocumentEnvelope(container))e.setAttribute('data-oproxy-document-envelope','')});
        continue;
      }
      const h2 = container.querySelector("h2");
      if (!h2 || !/响应|Response/i.test(h2.innerText)) continue;
      if (
        container.hasAttribute("data-oproxy-doc-hidden") ||
        container.hasAttribute("data-oproxy-auto-run")
      ) {
        continue;
      }
      if (
        container === containers[containers.length - 1] &&
        !container.querySelector('[data-testid="copy-response-button"]')
      ) {
        continue;
      }

      if (!container.querySelector('[data-testid="copy-response-button"]')) continue;
      const spec = extractDocumentSpec(container);
      if (spec) {
        container.setAttribute("data-oproxy-doc-hidden", "true");
        addDocumentSpecCard(container, spec);

        continue;
      }


    }
  }

  function scan() {
    ensureStyles();
    hideRuntimePrompts();
    const pending = activeJob || readJob();
    if (!window.__oproxyAutoRunTimer && pending && !pending.paused && pathMatches(pending)) {
      if (!document.querySelector("[data-oproxy-auto-run], [data-oproxy-skill-reading], [data-oproxy-repairing], .oproxy-doc-error")) startAutoRunWatcher(pending.skillRound,pending);
    }
    recoverInterruptedSkill();
    recoverInterruptedDocument();
    markExistingDocumentMessages();
    window.__oproxyDocumentUI?.refresh();
    window.__oproxyDocumentWorkflow?.refreshModes?.(workflowModeState());

  }

  function recoverInterruptedSkill() {
    if (window.__oproxyAutoRunTimer || activeJob) return;
    const messages = [...document.querySelectorAll('.message-render')];
    const last = messages.at(-1);
    if (!last || last.hasAttribute('data-oproxy-skill-recovered') || last.querySelector('.oproxy-doc-result, .oproxy-doc-error')) return;
    const skill = extractSkillRequest(last);
    if (!skill || !last.querySelector('[data-testid="copy-response-button"]')) return;
    const priorUser = messages.slice(0, -1).reverse().find(container => container.querySelector('.user-turn') && container.querySelector('.markdown.prose.message-content')?.textContent.trim());
    const prompt = priorUser?.querySelector('.markdown.prose.message-content')?.textContent?.trim() || '';
    const intent = window.__oproxyDocumentIntent?.(prompt, skill);
    if (!priorUser || !intent?.create) return;
    last.setAttribute('data-oproxy-skill-recovered', '');
    startAutoRunWatcher(0, null, { type: skill, baseline: Math.max(0, messages.length - 1), recovering: true });
    continueWithSkill(last, skill).catch(error => { console.error('[oproxy-skill-recovery]', error); });
  }

  function recoverInterruptedDocument() {
    if (window.__oproxyAutoRunTimer || activeJob) return;
    const messages = [...document.querySelectorAll('.message-render')];
    const last = messages.at(-1);
    if (!last || last.hasAttribute('data-oproxy-document-recovered') || last.querySelector('.oproxy-doc-result, .oproxy-doc-error')) return;
    const spec = extractDocumentSpec(last);
    if (!spec || !last.querySelector('[data-testid="copy-response-button"]')) return;
    const priorUser = messages.slice(0, -1).reverse().find(container => container.querySelector('.user-turn') && container.querySelector('.markdown.prose.message-content')?.textContent.trim());
    const prompt = priorUser?.querySelector('.markdown.prose.message-content')?.textContent?.trim() || '';
    if (!priorUser || !window.__oproxyDocumentIntent?.(prompt, spec.type)?.create) return;
    last.setAttribute('data-oproxy-document-recovered', '');
    startAutoRunWatcher(1, null, { type: spec.type, baseline: Math.max(0, messages.length - 1), recovering: true });
    runDocumentSpec(last, spec).catch(error => console.error('[oproxy-document-recovery]', error));
  }

  document.addEventListener(
    "click",
    (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      const regenerate=target.closest('[data-testid="regenerate-generation-button"]');
      if(regenerate){
        const container=regenerate.closest(".message-render");
        const containers=[...document.querySelectorAll(".message-render")];
        if(container!==containers.at(-1))return;
        let type=null;
        for(const prior of containers.slice().reverse()){
          type=extractDocumentSpec(prior)?.type||extractSkillRequest(prior);if(type)break;
        }
        if(type)startAutoRunWatcher(0,null,{type,regenerating:true,previousText:container.textContent});
        return;
      }
      if(target.closest('[data-testid="stop-button"], [data-testid="stop-generation-button"]')){
        stopAutoRunWatcher();if(activeJob){activeJob.paused=true;saveJob(activeJob);}
        document.querySelectorAll('[data-oproxy-doc-generating]').forEach(c=>clearDocumentGenerating(c,{unhide:true}));
        window.__oproxyDocumentWorkflow?.cancel();return;
      }
      const sendButton = target.closest('[data-testid="send-button"]');
      if (sendButton) {
        const textarea = document.querySelector("#prompt-textarea");
        if(deferForSearch(textarea,event))return;
        if (textarea) preparePrompt(textarea);
        return;
      }


    },
    true,
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;

      const target = event.target instanceof Element ? event.target : null;
      const textarea = target?.closest("#prompt-textarea");
      if (!textarea) return;

      if(deferForSearch(textarea,event))return;

      preparePrompt(textarea);
    },
    true,
  );

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    window.setTimeout(() => {
      scheduled = false;
      scan();
    }, 100);
  });

  observer.observe(document.body, { childList: true, subtree: true });
  scan();

  window.addEventListener("popstate", () => scan());
  window.addEventListener("online", () => {
    const job=activeJob || readJob(); if (job?.paused) { job.paused=false;saveJob(job); }
    scan();
  });
  window.__oproxyRecoverInterruptedSkill = recoverInterruptedSkill;
  window.__oproxySubmitModeFallback = submitModeFallback;
  window.__oproxyWorkflowModesState = { read: readWorkflowModes, save: saveWorkflowModes, labels: workflowModeState };
})();
