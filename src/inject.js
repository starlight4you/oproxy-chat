(() => {
  if (window.__oproxyDocButtonsInstalled) return;
  window.__oproxyDocButtonsInstalled = true;

  const BUTTON_ATTR = "data-oproxy-doc-button";
  const RUNTIME_TOGGLE_ATTR = "data-oproxy-runtime-toggle";
  const ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
  const TERMINAL_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>`;
  const RUNTIME_INSTRUCTION =
    "[Local runtime: Python 3 with python-docx/openpyxl/python-pptx/pillow. For PDF, write document.html with inline CSS and Chinese system fonts; the app converts it to PDF. For Word use python-docx. Output exactly one Python code block that creates the file(s) in the current directory. Never say you cannot create attachments or ask the user to run code; the app runs it automatically.]";

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

  function showToast(message, isError = false) {
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
    window.__oproxyToastTimer = setTimeout(() => {
      toast.style.opacity = "0";
    }, 8000);
  }

  async function runLocalCode(code, language, title) {
    if (!window.oproxyDesktop?.runLocalCode) {
      showToast("本地运行环境不可用。", true);
      return;
    }

    if (!/python/i.test(language || "python")) {
      showToast("目前只支持运行 Python 代码。", true);
      return;
    }

    showToast("正在本地运行代码生成文档…");

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
        } else {
          showToast("代码运行完成，但没有生成文件。");
        }
      } else {
        const detail = String(
          result?.error || result?.stderr || "未知错误",
        ).slice(0, 300);
        showToast(`本地运行失败：${detail}`, true);
      }
    } catch (error) {
      showToast(`本地运行失败：${String(error).slice(0, 300)}`, true);
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
    );
  }

  function startAutoRunWatcher() {
    clearInterval(window.__oproxyAutoRunTimer);
    const baseline = document.querySelectorAll(".message-render").length;
    const startedAt = Date.now();

    window.__oproxyAutoRunTimer = setInterval(() => {
      if (Date.now() - startedAt > 5 * 60 * 1000) {
        clearInterval(window.__oproxyAutoRunTimer);
        return;
      }

      const containers = [...document.querySelectorAll(".message-render")];
      if (containers.length <= baseline) return;

      const last = containers[containers.length - 1];
      const h2 = last.querySelector("h2");
      if (!h2 || !/响应|Response/i.test(h2.innerText)) return;
      if (!last.querySelector('[data-testid="copy-response-button"]')) return;

      clearInterval(window.__oproxyAutoRunTimer);
      runDocumentCode(last);
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

    if (!wantsDocument && !window.__oproxyLocalRuntimeEnabled) return;

    startAutoRunWatcher();

    if (value.includes("[Local runtime:")) return;

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
        "button, svg, script, style, link, noscript, input, textarea, select, [aria-hidden='true']",
      )
      .forEach((element) => element.remove());

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

  function updateRuntimeToggle(button) {
    const enabled = !!window.__oproxyLocalRuntimeEnabled;
    button.style.background = enabled ? "rgba(0,150,136,0.16)" : "";
    button.style.color = enabled ? "#00796b" : "";
    button.setAttribute("aria-pressed", enabled ? "true" : "false");
  }

  function addRuntimeToggle() {
    if (document.querySelector(`[${RUNTIME_TOGGLE_ATTR}]`)) return;

    const mcpButton = [...document.querySelectorAll("button")].find(
      (button) => button.innerText.trim() === "MCP 服务器",
    );
    const toolsButton = document.querySelector('[aria-label="Tools Options"]');
    const anchor = mcpButton || toolsButton;
    if (!anchor || !anchor.parentElement) return;

    const button = document.createElement("button");
    button.setAttribute(RUNTIME_TOGGLE_ATTR, "true");
    button.type = "button";
    button.title = "本地运行环境：开启后 AI 可直接生成并下载文档";
    button.className = anchor.className;
    button.innerHTML = `${TERMINAL_ICON}<span>本地运行</span>`;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      window.__oproxyLocalRuntimeEnabled = !window.__oproxyLocalRuntimeEnabled;
      updateRuntimeToggle(button);
      showToast(
        window.__oproxyLocalRuntimeEnabled
          ? "本地运行环境已开启"
          : "本地运行环境已关闭",
      );
    });

    anchor.parentElement.insertBefore(button, anchor);
    updateRuntimeToggle(button);
  }

  function scan() {
    document.querySelectorAll(".message-render").forEach((container) => {
      const h2 = container.querySelector("h2");
      if (!h2) return;
      if (!/响应|Response/i.test(h2.innerText)) return;
      addButton(container);
    });

    addRuntimeToggle();
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
    }, 250);
  });

  observer.observe(document.body, { childList: true, subtree: true });
  scan();
})();
