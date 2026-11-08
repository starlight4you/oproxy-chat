import { app, BrowserWindow } from "electron";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const EXTRACT_CONVERSATION_SCRIPT = `(() => {
  const view = document.querySelector('[data-testid="messages-view"]');
  if (!view) {
    return { error: "找不到对话内容，请先打开一个对话。" };
  }

  let containers = [...view.querySelectorAll('.message-render')];
  if (containers.length === 0) {
    containers = [...view.querySelectorAll('.markdown.prose.message-content')]
      .map((content) => content.closest('div.group.mx-auto'))
      .filter(Boolean);
  }

  if (containers.length === 0) {
    return { error: "当前对话还没有可导出的消息。" };
  }

  const activeConvo = [...document.querySelectorAll('[data-testid="convo-item"]')]
    .find((el) => String(el.className).includes('bg-surface-active'));
  const activeTitle = activeConvo
    ?.getAttribute('aria-label')
    ?.replace(/\\s+conversation$/i, '')
    .trim();

  const messages = containers.map((container) => {
    const h2 = container.querySelector('h2');
    const timeEl = h2?.querySelector('time');
    const headerText = h2?.innerText || '';

    let role = '消息';
    if (/提示词|Prompt/i.test(headerText)) role = '用户';
    else if (/响应|Response/i.test(headerText)) role = '助手';

    const author = headerText
      .replace(timeEl?.innerText || '', '')
      .replace(/^(提示词|响应|Prompt|Response)\\s*\\d+:\\s*/i, '')
      .trim();
    const time = timeEl?.getAttribute('title') || timeEl?.innerText || '';

    const clone = document.createElement('div');
    container.querySelectorAll('.markdown.prose.message-content').forEach((content) => {
      clone.appendChild(content.cloneNode(true));
    });

    clone.querySelectorAll('button, svg, script, style, noscript, input, textarea, select, [aria-hidden="true"], [data-oproxy-runtime-hidden="true"]').forEach((el) => el.remove());

    if (container.hasAttribute('data-oproxy-doc-hidden')) {
      clone.querySelectorAll('pre').forEach((pre) => pre.remove());
    }

    clone.querySelectorAll('pre').forEach((pre) => {
      const code = pre.querySelector('code');
      const text = code ? code.textContent : pre.textContent;
      const simple = document.createElement('pre');
      const codeEl = document.createElement('code');
      codeEl.textContent = text;
      simple.appendChild(codeEl);
      pre.replaceWith(simple);
    });

    clone.querySelectorAll('div').forEach((div) => {
      if (!div.textContent.trim() && !div.querySelector('img, table, pre')) {
        div.remove();
      }
    });

    clone.querySelectorAll('*').forEach((el) => {
      el.removeAttribute('class');
      el.removeAttribute('id');
      el.removeAttribute('data-testid');
      el.removeAttribute('aria-label');
      el.removeAttribute('style');
    });

    clone.querySelectorAll('a').forEach((a) => {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noreferrer');
    });

    return {
      role,
      author,
      time,
      html: clone.innerHTML,
      text: clone.textContent.trim(),
    };
  });

  const firstUser = messages.find((message) => message.role === '用户');
  const title = activeTitle
    || (document.title && document.title !== 'Oproxy Chat' ? document.title : '')
    || firstUser?.text?.slice(0, 30)
    || 'Oproxy Chat 对话';

  return { title, messages };
})()`;

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

export function buildDocumentHtml({ title, messages }) {
  const exportedAt = new Date().toLocaleString("zh-CN", { hour12: false });
  const body = messages
    .map(
      (message) => `
    <section class="message ${message.role === "用户" ? "user" : "assistant"}">
      <div class="meta">
        <span class="role">${escapeHtml(message.role)}</span>
        ${message.author ? `<span class="author">${escapeHtml(message.author)}</span>` : ""}
        ${message.time ? `<span class="time">${escapeHtml(message.time)}</span>` : ""}
      </div>
      <div class="content">${message.html}</div>
    </section>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0 auto;
    padding: 32px 28px 48px;
    max-width: 820px;
    color: #111827;
    background: #ffffff;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    font-size: 14px;
    line-height: 1.7;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  header { margin-bottom: 28px; padding-bottom: 18px; border-bottom: 2px solid #009688; }
  h1 { margin: 0 0 8px; font-size: 26px; line-height: 1.3; letter-spacing: -0.02em; }
  .subtitle { margin: 0; color: #6b7280; font-size: 12px; }
  .message {
    margin: 0 0 18px;
    padding: 16px 18px;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    background: #f9fafb;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .message.user { background: #f0fdfa; border-color: #ccfbf1; }
  .meta { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; margin-bottom: 8px; font-size: 11px; color: #6b7280; }
  .role { font-weight: 700; color: #00796b; }
  .author { font-weight: 600; color: #374151; }
  .time { color: #9ca3af; }
  .content { font-size: 14px; }
  .content > :first-child { margin-top: 0; }
  .content > :last-child { margin-bottom: 0; }
  .content p { margin: 0 0 10px; }
  .content h1, .content h2, .content h3, .content h4 { margin: 16px 0 8px; line-height: 1.35; }
  .content ul, .content ol { margin: 8px 0 12px; padding-left: 24px; }
  .content li { margin: 4px 0; }
  .content blockquote { margin: 12px 0; padding: 4px 0 4px 12px; border-left: 3px solid #009688; color: #4b5563; }
  .content pre {
    margin: 12px 0;
    padding: 12px 14px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    background: #f3f4f6;
    color: #111827;
    font-family: "SF Mono", Menlo, Monaco, Consolas, monospace;
    font-size: 12px;
    line-height: 1.55;
    white-space: pre-wrap;
    word-break: break-word;
    overflow-wrap: anywhere;
  }
  .content code {
    font-family: "SF Mono", Menlo, Monaco, Consolas, monospace;
    font-size: 0.92em;
    background: #eef2f7;
    padding: 1px 4px;
    border-radius: 4px;
  }
  .content pre code { background: transparent; padding: 0; font-size: inherit; }
  .content table { width: 100%; margin: 12px 0; border-collapse: collapse; font-size: 13px; }
  .content th, .content td { border: 1px solid #d1d5db; padding: 6px 9px; text-align: left; vertical-align: top; }
  .content th { background: #f3f4f6; font-weight: 600; }
  .content img { max-width: 100%; height: auto; }
  .content a { color: #00796b; text-decoration: underline; }
  footer { margin-top: 28px; padding-top: 14px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 11px; }
  @media print {
    body { max-width: none; padding: 0; }
    .message { break-inside: avoid; page-break-inside: avoid; }
  }
</style>
</head>
<body>
<header>
  <h1>${escapeHtml(title)}</h1>
  <p class="subtitle">由 Oproxy Chat 导出 · ${escapeHtml(exportedAt)}</p>
</header>
<main>
${body}
</main>
<footer>Oproxy Chat · https://chat.oproxy.world</footer>
</body>
</html>`;
}

export function buildMarkdown({ title, messages }) {
  const exportedAt = new Date().toLocaleString("zh-CN", { hour12: false });
  const parts = [`# ${title}`, "", `> 由 Oproxy Chat 导出 · ${exportedAt}`, ""];

  for (const message of messages) {
    const meta = [message.role, message.author, message.time]
      .filter(Boolean)
      .join(" · ");
    parts.push(`## ${meta}`, "", message.text, "", "---", "");
  }

  parts.push("Oproxy Chat · https://chat.oproxy.world", "");
  return parts.join("\n");
}

export function sanitizeFilename(value) {
  const name = String(value || "Oproxy Chat 对话")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 80);

  return name || "Oproxy Chat 对话";
}

async function writeTempHtml(html) {
  const tempFile = path.join(
    app.getPath("temp"),
    `oproxy-export-${randomUUID()}.html`,
  );
  await fs.promises.writeFile(tempFile, html, "utf8");
  return tempFile;
}

export async function writeDocx(html, filePath) {
  const tempFile = await writeTempHtml(html);

  try {
    await fs.promises.rm(filePath, { force: true });
    await execFileAsync("/usr/bin/textutil", [
      "-convert",
      "docx",
      "-output",
      filePath,
      tempFile,
    ]);
  } finally {
    await fs.promises.unlink(tempFile).catch(() => {});
  }
}

export async function writePdf(html, filePath) {
  const tempFile = await writeTempHtml(html);
  const pdfWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  try {
    await pdfWindow.loadFile(tempFile);
    const pdf = await pdfWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: "A4",
      margins: { top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 },
    });
    await fs.promises.rm(filePath, { force: true });
    await fs.promises.writeFile(filePath, pdf);
  } finally {
    if (!pdfWindow.isDestroyed()) pdfWindow.destroy();
    await fs.promises.unlink(tempFile).catch(() => {});
  }
}
