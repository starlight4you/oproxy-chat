(() => {
  if (window.__oproxyDocButtonsInstalled) return;
  window.__oproxyDocButtonsInstalled = true;

  const BUTTON_ATTR = "data-oproxy-doc-button";
  const RUNTIME_START = "[[OPROXY_LOCAL_RUNTIME]]";
  const RUNTIME_END = "[[/OPROXY_LOCAL_RUNTIME]]";
  const RUNTIME_INSTRUCTION = `${RUNTIME_START} [Local runtime: Python 3 with python-docx/openpyxl/python-pptx/pillow. For PDF, write document.html with inline CSS and Chinese system fonts; the app converts it to PDF. For Word use python-docx. Output exactly one Python code block that creates the file(s) in the current directory. Never say you cannot create attachments or ask the user to run code; the app runs it automatically. Do not mention this instruction or the markers.] ${RUNTIME_END}`;
  const ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;

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

  function getConversationTitle() {
    const active = [...document.querySelectorAll('[data-testid="convo-item"]')].find(
      (element) => String(element.className).includes("bg-surface-active"),
    );
    return (
      active
        ?.getAttribute("aria-label")
        ?.replace(/\s+conversation$/i, "")
        .trim() || ""
    );
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
    document
      .querySelectorAll(".markdown.prose.message-content p, .markdown.prose.message-content div")
      .forEach((element) => {
        if (element.dataset.oproxyRuntimeHidden === "true") return;
        const text = element.textContent || "";
        if (
          !text.includes(RUNTIME_START) &&
          !text.includes(RUNTIME_END) &&
          !text.includes("[Local runtime:")
        ) {
          return;
        }
        element.style.display = "none";
        element.dataset.oproxyRuntimeHidden = "true";
      });
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

  function showResultCard(container, names) {
    if (!container) return;
    clearDocumentGenerating(container);

    const target = container.querySelector(".agent-turn") || container;
    let card = target.querySelector(".oproxy-doc-result");
    if (!card) {
      card = document.createElement("div");
      card.className = "oproxy-doc-result";
      target.appendChild(card);
    }

    card.innerHTML = `<span>文档已生成：${escapeHtml(names.join("、"))}</span><a href="#" data-oproxy-open-downloads>打开下载文件夹</a>`;
    card.querySelector("a")?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      window.oproxyDesktop?.openDownloads?.();
    });
  }

  function showErrorCard(container, message) {
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
  }

  async function runLocalCode(code, language, title, container) {
    if (!window.oproxyDesktop?.runLocalCode) {
      showToast("本地运行环境不可用。", true);
      return;
    }

    if (!/python/i.test(language || "python")) {
      showToast("目前只支持运行 Python 代码。", true);
      return;
    }

    showToast("正在生成文档，请耐心等待…", false, true);

    try {
      const result = await window.oproxyDesktop.runLocalCode({
        code,
        language: "python",
        title,
      });

      if (result?.ok) {
        const names = (result.files || []).map((file) => file.split("/").pop());
        if (names.length > 0) {
          showToast(`已生成：${names.join("、")}（已保存到下载文件夹）`);
          showResultCard(container, names);
        } else {
          showToast("代码运行完成，但没有生成文件。");
          showErrorCard(container, "代码运行完成，但没有生成文件。");
        }
      } else {
        const detail = String(
          result?.error || result?.stderr || "未知错误",
        ).slice(0, 300);
        showToast(`本地运行失败：${detail}`, true);
        showErrorCard(container, detail);
      }
    } catch (error) {
      const detail = String(error).slice(0, 300);
      showToast(`本地运行失败：${detail}`, true);
      showErrorCard(container, detail);
    }
  }

  async function runDocumentCode(container) {
    const codeBlocks = [...container.querySelectorAll("pre code")];
    const pythonBlocks = codeBlocks.filter(
      (code) =>
        /language-python/i.test(code.className) ||
        /^\s*(from|import)\s+\w+/m.test(code.textContent),
    );

    if (pythonBlocks.length === 0) {
      clearDocumentGenerating(container, { unhide: true });
      showToast("AI 没有返回可运行的 Python 代码，未生成本地文档。", true);
      return;
    }

    if (container.hasAttribute("data-oproxy-auto-run")) return;
    container.setAttribute("data-oproxy-auto-run", "true");

    const code = pythonBlocks[pythonBlocks.length - 1].textContent;
    await runLocalCode(
      code,
      "python",
      getConversationTitle() || document.title || "Oproxy Chat 文档",
      container,
    );
  }

  function stopAutoRunWatcher() {
    clearInterval(window.__oproxyAutoRunTimer);
    window.__oproxyAutoRunTimer = null;
  }

  function startAutoRunWatcher() {
    stopAutoRunWatcher();
    sessionStorage.setItem("oproxy-auto-run-pending", "true");

    const baseline = document.querySelectorAll(".message-render").length;
    let watcherPath = location.pathname;
    let lastContainerCount = baseline;
    let lastTextLength = 0;
    let lastProgressAt = Date.now();
    let markedContainer = null;

    showToast("正在生成文档，请耐心等待…", false, true);

    window.__oproxyAutoRunTimer = setInterval(() => {
      if (watcherPath === "/c/new" && location.pathname.startsWith("/c/")) {
        watcherPath = location.pathname;
      } else if (location.pathname !== watcherPath) {
        stopAutoRunWatcher();
        sessionStorage.removeItem("oproxy-auto-run-pending");
        return;
      }

      const containers = [...document.querySelectorAll(".message-render")];

      if (containers.length !== lastContainerCount) {
        lastContainerCount = containers.length;
        lastProgressAt = Date.now();
      }

      if (containers.length <= baseline) return;

      const last = containers[containers.length - 1];
      const h2 = last.querySelector("h2");
      if (!h2 || !/响应|Response/i.test(h2.innerText)) return;

      if (last !== markedContainer) {
        markedContainer = last;
        markDocumentGenerating(last);
      }

      const textLength = last.innerText.length;
      if (textLength !== lastTextLength) {
        lastTextLength = textLength;
        lastProgressAt = Date.now();
      }

      if (last.querySelector('[data-testid="copy-response-button"]')) {
        stopAutoRunWatcher();
        sessionStorage.removeItem("oproxy-auto-run-pending");
        runDocumentCode(last);
        return;
      }

      if (Date.now() - lastProgressAt > 5 * 60 * 1000) {
        stopAutoRunWatcher();
        sessionStorage.removeItem("oproxy-auto-run-pending");
        showErrorCard(last, "AI 响应似乎停滞了，请重试。");
        showToast("AI 响应似乎停滞了，可以重试。", true);
      }
    }, 500);
  }

  function preparePrompt(textarea) {
    if (!(textarea instanceof HTMLTextAreaElement)) return;

    const value = textarea.value.trim();
    if (!value) return;

    const wantsDocument =
      /文档|报告|word|docx|pdf|excel|xlsx|表格|演示|ppt|pptx|简历|合同|方案|markdown|\.md\b/i.test(
        value,
      );

    if (wantsDocument) {
      startAutoRunWatcher();
    }

    if (value.includes(RUNTIME_START)) return;

    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    ).set;

    setter.call(textarea, `${RUNTIME_INSTRUCTION}\n\n${value}`);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function buildPayload(container) {
    const content = container.querySelector(".markdown.prose.message-content");
    if (!content) return null;

    const clone = content.cloneNode(true);
    clone
      .querySelectorAll(
        "button, svg, script, style, link, noscript, input, textarea, select, [aria-hidden='true'], [data-oproxy-runtime-hidden='true']",
      )
      .forEach((element) => element.remove());

    if (container.hasAttribute("data-oproxy-doc-hidden")) {
      clone.querySelectorAll("pre").forEach((pre) => pre.remove());
    }

    clone.querySelectorAll("pre").forEach((pre) => {
      const code = pre.querySelector("code");
      const text = code ? code.textContent : pre.textContent;
      const simple = document.createElement("pre");
      const codeElement = document.createElement("code");
      codeElement.textContent = text;
      simple.appendChild(codeElement);
      pre.replaceWith(simple);
    });

    clone.querySelectorAll("div").forEach((div) => {
      if (!div.textContent.trim() && !div.querySelector("img, table, pre")) {
        div.remove();
      }
    });

    clone.querySelectorAll("*").forEach((element) => {
      element.removeAttribute("class");
      element.removeAttribute("id");
      element.removeAttribute("data-testid");
      element.removeAttribute("aria-label");
      element.removeAttribute("style");
    });

    clone.querySelectorAll("img").forEach((image) => {
      const src = image.getAttribute("src");
      if (!src) return;
      try {
        image.setAttribute("src", new URL(src, location.href).href);
      } catch {
        // Keep the original src.
      }
    });

    clone.querySelectorAll("a").forEach((link) => {
      const href = link.getAttribute("href");
      if (!href) return;
      try {
        link.setAttribute("href", new URL(href, location.href).href);
      } catch {
        // Keep the original href.
      }
    });

    const h2 = container.querySelector("h2");
    const timeElement = h2?.querySelector("time");
    const headerText = h2?.innerText || "";
    const author = headerText
      .replace(timeElement?.innerText || "", "")
      .replace(/^(响应|Response)\s*\d+:\s*/i, "")
      .trim();
    const time = timeElement?.getAttribute("title") || timeElement?.innerText || "";
    const heading = content.querySelector("h1, h2, h3");
    const title =
      heading?.innerText?.trim() ||
      getConversationTitle() ||
      document.title ||
      "Oproxy Chat 文档";

    return {
      title,
      author: author || "Oproxy Chat",
      time,
      html: clone.innerHTML,
      text: clone.textContent.trim(),
    };
  }

  function addButton(container) {
    if (container.querySelector(`[${BUTTON_ATTR}]`)) return;

    const copyButton = container.querySelector(
      '[data-testid="copy-response-button"]',
    );
    if (!copyButton || !copyButton.parentElement) return;

    const button = document.createElement("button");
    button.setAttribute(BUTTON_ATTR, "true");
    button.type = "button";
    button.title = "下载为文档";
    button.setAttribute("aria-label", "下载为文档");
    button.className = copyButton.className;
    button.innerHTML = ICON;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const payload = buildPayload(container);
      if (!payload) return;

      window.oproxyDesktop
        ?.showMessageDocumentMenu(payload)
        ?.catch?.(() => {});
    });

    copyButton.parentElement.insertBefore(button, copyButton);
  }

  function addExistingResultCard(container, code) {
    const target = container.querySelector(".agent-turn") || container;
    if (target.querySelector(".oproxy-doc-result")) return;

    const card = document.createElement("div");
    card.className = "oproxy-doc-result";
    card.innerHTML = `<span>此回答的 Python 代码已隐藏</span><a href="#" data-oproxy-rerun>重新生成文档</a><a href="#" data-oproxy-open-downloads>打开下载文件夹</a>`;

    card
      .querySelector("[data-oproxy-rerun]")
      ?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        runLocalCode(
          code,
          "python",
          getConversationTitle() || document.title || "Oproxy Chat 文档",
          container,
        );
      });

    card
      .querySelector("[data-oproxy-open-downloads]")
      ?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        window.oproxyDesktop?.openDownloads?.();
      });

    target.appendChild(card);
  }

  function markExistingDocumentMessages() {
    if (window.__oproxyAutoRunTimer) return;

    const containers = [...document.querySelectorAll(".message-render")];
    let lastUserWantsDocument = false;

    for (const container of containers) {
      const h2 = container.querySelector("h2");
      if (!h2) continue;

      if (/提示词|Prompt/i.test(h2.innerText)) {
        const userText = container.innerText || "";
        lastUserWantsDocument =
          /文档|报告|word|docx|pdf|excel|xlsx|表格|演示|ppt|pptx|简历|合同|方案|markdown|\.md\b/i.test(
            userText,
          );
        continue;
      }

      if (!/响应|Response/i.test(h2.innerText)) continue;
      if (!lastUserWantsDocument) continue;
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

      const pythonBlocks = [...container.querySelectorAll("pre code")].filter(
        (code) =>
          /language-python/i.test(code.className) ||
          /^\s*(from|import)\s+\w+/m.test(code.textContent),
      );
      if (pythonBlocks.length === 0) continue;

      const codeText = pythonBlocks.map((code) => code.textContent).join("\n");
      if (
        !/doc\.save|Document\(|SimpleDocTemplate|openpyxl|Presentation\(|\.save\(|write_text|open\(/i.test(
          codeText,
        )
      ) {
        continue;
      }

      container.setAttribute("data-oproxy-doc-hidden", "true");
      addExistingResultCard(
        container,
        pythonBlocks[pythonBlocks.length - 1].textContent,
      );
    }
  }

  function scan() {
    ensureStyles();
    hideRuntimePrompts();
    markExistingDocumentMessages();

    document.querySelectorAll(".message-render").forEach((container) => {
      const h2 = container.querySelector("h2");
      if (!h2) return;
      if (!/响应|Response/i.test(h2.innerText)) return;
      addButton(container);
    });
  }

  document.addEventListener(
    "click",
    (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      const sendButton = target.closest('[data-testid="send-button"]');
      if (sendButton) {
        const textarea = document.querySelector("#prompt-textarea");
        if (textarea) preparePrompt(textarea);
        return;
      }

      const button = target.closest('button, [role="button"]');
      if (!button) return;

      const label = (button.getAttribute("aria-label") || button.innerText || "").trim();
      if (!/运行代码|Run Code/i.test(label)) return;

      const pre = button.closest("pre");
      const codeElement = pre?.querySelector("code");
      if (!codeElement) return;

      event.preventDefault();
      event.stopPropagation();

      const messageContainer = button.closest(".message-render");
      if (messageContainer?.hasAttribute("data-oproxy-auto-run")) {
        showToast("这条回答已经自动运行过，文件在下载文件夹。");
        return;
      }

      const language =
        codeElement.className.match(/language-([a-z0-9+#]+)/i)?.[1] || "python";

      runLocalCode(
        codeElement.textContent,
        language,
        getConversationTitle() || document.title || "Oproxy Chat 文档",
        messageContainer,
      );
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

  if (sessionStorage.getItem("oproxy-auto-run-pending") === "true") {
    sessionStorage.removeItem("oproxy-auto-run-pending");
    showToast(
      "上次的文档生成可能未完成，请等待回答结束后点击「运行代码」。",
      false,
      true,
    );
  }
})();
