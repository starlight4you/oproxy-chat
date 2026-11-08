import {
  app,
  BrowserWindow,
  Menu,
  dialog,
  nativeImage,
  screen,
  session,
  shell,
  systemPreferences,
} from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXTRACT_CONVERSATION_SCRIPT,
  buildDocumentHtml,
  buildMarkdown,
  sanitizeFilename,
  writeDocx,
  writePdf,
} from "./export.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APP_NAME = "Oproxy Chat";
const APP_URL = new URL(process.env.OPROXY_CHAT_URL || "https://chat.oproxy.world");
const APP_ORIGIN = APP_URL.origin;
const APP_HOST = APP_URL.hostname;
const ROOT_DOMAIN = "oproxy.world";
const USER_AGENT = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;

const ALLOWED_PERMISSIONS = new Set([
  "notifications",
  "media",
  "clipboard-read",
  "clipboard-sanitized-write",
  "fullscreen",
  "openExternal",
]);

app.setName(APP_NAME);
app.userAgentFallback = USER_AGENT;

let mainWindow = null;
let showingErrorPage = false;

function isAllowedHost(hostname) {
  const host = hostname.toLowerCase();
  if (host === APP_HOST) return true;
  if (host === ROOT_DOMAIN || host.endsWith(`.${ROOT_DOMAIN}`)) return true;
  if (
    (APP_HOST === "localhost" || APP_HOST === "127.0.0.1") &&
    (host === "localhost" || host === "127.0.0.1")
  ) {
    return true;
  }
  return false;
}

function isAllowedUrl(raw, { allowEphemeral = false } = {}) {
  if (!raw) return false;
  if (
    allowEphemeral &&
    (raw === "about:blank" ||
      raw.startsWith("blob:") ||
      raw.startsWith("data:"))
  ) {
    return true;
  }
  if (raw.startsWith("file://")) {
    if (raw.includes("/src/error.html")) return true;

    try {
      const filePath = fileURLToPath(raw);
      const tempDir = app.getPath("temp");
      if (
        filePath.startsWith(tempDir + path.sep) &&
        path.basename(filePath).startsWith("oproxy-export-") &&
        filePath.endsWith(".html")
      ) {
        return true;
      }
    } catch {
      // Ignore invalid file URLs.
    }
    return false;
  }
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    if (
      url.protocol === "http:" &&
      APP_URL.protocol !== "http:" &&
      url.hostname !== "localhost" &&
      url.hostname !== "127.0.0.1"
    ) {
      return false;
    }
    return isAllowedHost(url.hostname);
  } catch {
    return false;
  }
}

function openExternal(raw) {
  try {
    const url = new URL(raw);
    if (["https:", "http:", "mailto:", "tel:"].includes(url.protocol)) {
      shell.openExternal(raw).catch(() => {});
    }
  } catch {
    // Ignore malformed or unsupported URLs.
  }
}

function getWindow() {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
}

function getWindowStateFile() {
  return path.join(app.getPath("userData"), "window-state.json");
}

function loadWindowState() {
  try {
    return JSON.parse(fs.readFileSync(getWindowStateFile(), "utf8"));
  } catch {
    return {};
  }
}

function saveWindowState(win) {
  try {
    const bounds = win.getNormalBounds();
    const state = {
      ...bounds,
      maximized: win.isMaximized(),
      fullScreen: win.isFullScreen(),
    };
    fs.mkdirSync(path.dirname(getWindowStateFile()), { recursive: true });
    fs.writeFileSync(getWindowStateFile(), JSON.stringify(state));
  } catch (error) {
    console.error("Failed to save window state", error);
  }
}

function isBoundsVisible(bounds) {
  if (
    !Number.isFinite(bounds.x) ||
    !Number.isFinite(bounds.y) ||
    !Number.isFinite(bounds.width) ||
    !Number.isFinite(bounds.height)
  ) {
    return false;
  }

  return screen.getAllDisplays().some(({ workArea }) => {
    const overlapX = Math.max(
      0,
      Math.min(bounds.x + bounds.width, workArea.x + workArea.width) -
        Math.max(bounds.x, workArea.x),
    );
    const overlapY = Math.max(
      0,
      Math.min(bounds.y + bounds.height, workArea.y + workArea.height) -
        Math.max(bounds.y, workArea.y),
    );
    return overlapX >= 100 && overlapY >= 100;
  });
}

function createWindow() {
  const saved = loadWindowState();
  const bounds = isBoundsVisible(saved)
    ? {
        x: saved.x,
        y: saved.y,
        width: Math.max(900, saved.width),
        height: Math.max(600, saved.height),
      }
    : { width: 1280, height: 820 };

  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: APP_NAME,
    backgroundColor: "#ffffff",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: true,
      webviewTag: false,
      allowRunningInsecureContent: false,
      safeDialogs: true,
    },
  });

  mainWindow.loadURL(APP_ORIGIN);

  mainWindow.once("ready-to-show", () => {
    if (saved.maximized) mainWindow.maximize();
    if (saved.fullScreen) mainWindow.setFullScreen(true);
    mainWindow.show();
  });

  mainWindow.on("close", () => saveWindowState(mainWindow));
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame || errorCode === -3 || showingErrorPage) return;

      console.error(
        `Failed to load ${validatedURL}: ${errorCode} ${errorDescription}`,
      );

      const win = getWindow();
      if (!win) return;

      showingErrorPage = true;
      win
        .loadFile(path.join(__dirname, "error.html"), {
          query: { url: APP_ORIGIN },
        })
        .catch((error) => console.error("Failed to show error page", error))
        .finally(() => {
          showingErrorPage = false;
        });
    },
  );

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    if (details.reason === "clean-exit") return;

    const win = getWindow();
    if (!win) return;

    dialog
      .showMessageBox(win, {
        type: "error",
        title: APP_NAME,
        message: "页面崩溃了",
        detail: `原因：${details.reason}`,
        buttons: ["重新加载", "退出"],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0 && getWindow()) {
          getWindow().reload();
        } else {
          app.quit();
        }
      });
  });
}

function runInPage(script) {
  const win = getWindow();
  if (!win) return Promise.resolve(undefined);

  return win.webContents.executeJavaScript(script, true).catch((error) => {
    console.error("executeJavaScript failed", error);
    return undefined;
  });
}

function newChat() {
  const win = getWindow();
  if (!win) return;

  win.focus();
  runInPage(`(async () => {
    const findNewChat = () => document.querySelector('[aria-label="创建新对话"]');
    let button = findNewChat();

    if (!button) {
      const openSidebar = document.querySelector('[data-testid="open-sidebar-button"]');
      if (openSidebar) {
        openSidebar.click();
        await new Promise((resolve) => setTimeout(resolve, 350));
        button = findNewChat();
      }
    }

    if (button) {
      button.click();
      return true;
    }
    return false;
  })()`).then((clicked) => {
    if (!clicked && getWindow()) {
      getWindow().loadURL(`${APP_ORIGIN}/c/new`);
    }
  });
}

function toggleSidebar() {
  runInPage(`(() => {
    const button =
      document.querySelector('[data-testid="open-sidebar-button"]') ||
      document.querySelector('[data-testid="close-sidebar-button"]');
    if (button) {
      button.click();
      return true;
    }
    return false;
  })()`);
}

function openSettings() {
  const win = getWindow();
  if (!win) return;

  win.focus();
  runInPage(`(async () => {
    let button = document.querySelector('[data-testid="nav-user"]');
    if (!button) {
      const openSidebar = document.querySelector('[data-testid="open-sidebar-button"]');
      if (openSidebar) {
        openSidebar.click();
        await new Promise((resolve) => setTimeout(resolve, 350));
        button = document.querySelector('[data-testid="nav-user"]');
      }
    }
    if (button) {
      button.click();
      return true;
    }
    return false;
  })()`);
}

function goBack() {
  const win = getWindow();
  if (win && win.webContents.navigationHistory.canGoBack()) {
    win.webContents.navigationHistory.goBack();
  }
}

function goForward() {
  const win = getWindow();
  if (win && win.webContents.navigationHistory.canGoForward()) {
    win.webContents.navigationHistory.goForward();
  }
}

async function signOut() {
  const win = getWindow();
  if (!win) return;

  const { response } = await dialog.showMessageBox(win, {
    type: "warning",
    title: APP_NAME,
    message: "退出登录？",
    detail: "这会清除本机的登录状态，下次需要重新通过 Oproxy 登录。",
    buttons: ["退出登录", "取消"],
    defaultId: 1,
    cancelId: 1,
  });

  if (response !== 0) return;

  try {
    await session.defaultSession.clearStorageData({
      storages: [
        "cookies",
        "localstorage",
        "indexdb",
        "serviceworkers",
        "cachestorage",
      ],
    });
    await session.defaultSession.clearCache();
    await session.defaultSession.clearAuthCache();
  } catch (error) {
    console.error("Failed to clear session", error);
  }

  if (getWindow()) getWindow().loadURL(APP_ORIGIN);
}

function showShortcuts() {
  const win = getWindow();
  const options = {
    type: "info",
    title: "键盘快捷键",
    message: "Oproxy Chat 快捷键",
    detail: [
      "⌘N  新建对话",
      "⌘⇧S  切换侧边栏",
      "⌘⇧E  导出当前对话为 Word",
      "⌘,  账户设置",
      "⌘[ / ⌘]  后退 / 前进",
      "⌘R  重新加载",
      "⌘⇧R  强制重新加载",
      "⌘⌥I  开发者工具",
      "⌘0 / ⌘+ / ⌘-  缩放",
      "⌃⌘F  切换全屏幕",
    ].join("\n"),
  };

  if (win) {
    dialog.showMessageBox(win, options);
  } else {
    dialog.showMessageBox(options);
  }
}

function uniqueDownloadPath(filename) {
  const directory = app.getPath("downloads");
  const safeName = path.basename(filename || "download");
  const extension = path.extname(safeName);
  const baseName = path.basename(safeName, extension);
  let candidate = path.join(directory, safeName);
  let index = 1;

  while (fs.existsSync(candidate)) {
    candidate = path.join(directory, `${baseName} (${index})${extension}`);
    index += 1;
  }

  return candidate;
}

async function getConversationData() {
  const win = getWindow();
  if (!win) return { error: "没有打开的窗口。" };

  try {
    return await win.webContents.executeJavaScript(
      EXTRACT_CONVERSATION_SCRIPT,
      true,
    );
  } catch (error) {
    return { error: `无法读取当前对话：${error.message}` };
  }
}

async function exportConversation(format, { lastAssistant = false } = {}) {
  const win = getWindow();
  if (!win) return;

  const data = await getConversationData();
  if (!data || data.error || !Array.isArray(data.messages)) {
    await dialog.showMessageBox(win, {
      type: "warning",
      title: APP_NAME,
      message: "无法导出",
      detail: data?.error || "无法读取当前对话。",
    });
    return;
  }

  const messages = lastAssistant
    ? data.messages.filter((message) => message.role === "助手").slice(-1)
    : data.messages;

  if (messages.length === 0) {
    await dialog.showMessageBox(win, {
      type: "warning",
      title: APP_NAME,
      message: "无法导出",
      detail: lastAssistant
        ? "当前对话还没有助手回答。"
        : "当前对话还没有可导出的消息。",
    });
    return;
  }

  const title = lastAssistant ? `${data.title} - 回答` : data.title;
  const safeTitle = sanitizeFilename(title);
  const extension = format === "pdf" ? "pdf" : format === "md" ? "md" : "docx";
  const filterNames = {
    docx: "Word 文档",
    pdf: "PDF 文档",
    md: "Markdown 文档",
  };

  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: lastAssistant ? "导出最后一条回答" : "导出当前对话",
    defaultPath: path.join(
      app.getPath("documents"),
      `${safeTitle}.${extension}`,
    ),
    filters: [{ name: filterNames[extension], extensions: [extension] }],
  });

  if (canceled || !filePath) return;

  const exportData = { title, messages };

  try {
    if (extension === "docx") {
      await writeDocx(buildDocumentHtml(exportData), filePath);
    } else if (extension === "pdf") {
      await writePdf(buildDocumentHtml(exportData), filePath);
    } else {
      await fs.promises.writeFile(
        filePath,
        buildMarkdown(exportData),
        "utf8",
      );
    }
    shell.showItemInFolder(filePath);
  } catch (error) {
    await dialog.showMessageBox(win, {
      type: "error",
      title: APP_NAME,
      message: "导出失败",
      detail: String(error?.message || error),
    });
  }
}

function buildMenu() {
  const isMac = process.platform === "darwin";

  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about", label: `关于 ${app.name}` },
              { type: "separator" },
              {
                label: "账户设置…",
                accelerator: "Cmd+,",
                click: openSettings,
              },
              { type: "separator" },
              { role: "services", label: "服务" },
              { type: "separator" },
              { role: "hide", label: `隐藏 ${app.name}` },
              { role: "hideOthers", label: "隐藏其他" },
              { role: "unhide", label: "全部显示" },
              { type: "separator" },
              { role: "quit", label: `退出 ${app.name}` },
            ],
          },
        ]
      : []),
    {
      label: "文件",
      submenu: [
        {
          label: "新建对话",
          accelerator: "CmdOrCtrl+N",
          click: newChat,
        },
        {
          label: "在浏览器中打开",
          click: () => shell.openExternal(APP_ORIGIN),
        },
        { type: "separator" },
        {
          label: "导出",
          submenu: [
            {
              label: "当前对话为 Word (.docx)…",
              accelerator: "CmdOrCtrl+Shift+E",
              click: () => exportConversation("docx"),
            },
            {
              label: "当前对话为 PDF…",
              click: () => exportConversation("pdf"),
            },
            {
              label: "当前对话为 Markdown…",
              click: () => exportConversation("md"),
            },
            { type: "separator" },
            {
              label: "最后一条回答为 Word (.docx)…",
              click: () => exportConversation("docx", { lastAssistant: true }),
            },
            {
              label: "最后一条回答为 PDF…",
              click: () => exportConversation("pdf", { lastAssistant: true }),
            },
          ],
        },
        {
          label: "打开下载文件夹",
          click: () => shell.openPath(app.getPath("downloads")),
        },
        { type: "separator" },
        { label: "退出登录…", click: signOut },
        { type: "separator" },
        isMac
          ? { role: "close", label: "关闭窗口" }
          : { role: "quit", label: "退出" },
      ],
    },
    {
      label: "编辑",
      submenu: [
        { role: "undo", label: "撤销" },
        { role: "redo", label: "重做" },
        { type: "separator" },
        { role: "cut", label: "剪切" },
        { role: "copy", label: "复制" },
        { role: "paste", label: "粘贴" },
        ...(isMac
          ? [{ role: "pasteAndMatchStyle", label: "粘贴并匹配样式" }]
          : []),
        { role: "delete", label: "删除" },
        { role: "selectAll", label: "全选" },
        ...(isMac
          ? [
              { type: "separator" },
              {
                label: "语音",
                submenu: [
                  { role: "startSpeaking", label: "开始朗读" },
                  { role: "stopSpeaking", label: "停止朗读" },
                ],
              },
            ]
          : []),
      ],
    },
    {
      label: "视图",
      submenu: [
        { label: "后退", accelerator: "CmdOrCtrl+[", click: goBack },
        { label: "前进", accelerator: "CmdOrCtrl+]", click: goForward },
        { type: "separator" },
        {
          label: "切换侧边栏",
          accelerator: "CmdOrCtrl+Shift+S",
          click: toggleSidebar,
        },
        { type: "separator" },
        { role: "reload", label: "重新加载" },
        { role: "forceReload", label: "强制重新加载" },
        { role: "toggleDevTools", label: "开发者工具" },
        { type: "separator" },
        { role: "resetZoom", label: "实际大小" },
        { role: "zoomIn", label: "放大" },
        { role: "zoomOut", label: "缩小" },
        { type: "separator" },
        { role: "togglefullscreen", label: "切换全屏幕" },
      ],
    },
    {
      label: "窗口",
      submenu: [
        { role: "minimize", label: "最小化" },
        { role: "zoom", label: "缩放" },
        ...(isMac
          ? [
              { type: "separator" },
              { role: "front", label: "前置全部窗口" },
            ]
          : [{ role: "close", label: "关闭" }]),
      ],
    },
    {
      role: "help",
      label: "帮助",
      submenu: [
        {
          label: "Oproxy 官网",
          click: () => shell.openExternal("https://oproxy.world"),
        },
        { label: "键盘快捷键", click: showShortcuts },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}

function configureSession() {
  const defaultSession = session.defaultSession;

  defaultSession.setUserAgent(USER_AGENT);

  defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback, details) => {
      const requestingUrl = details?.requestingUrl || webContents.getURL();
      if (!isAllowedUrl(requestingUrl)) {
        callback(false);
        return;
      }

      if (permission === "media" && process.platform === "darwin") {
        const mediaTypes = details?.mediaTypes || [];
        const requests = [];
        if (mediaTypes.includes("audio")) {
          requests.push(systemPreferences.askForMediaAccess("microphone"));
        }
        if (mediaTypes.includes("video")) {
          requests.push(systemPreferences.askForMediaAccess("camera"));
        }
        if (requests.length > 0) {
          Promise.all(requests)
            .then((results) => callback(results.every(Boolean)))
            .catch(() => callback(false));
          return;
        }
      }

      callback(ALLOWED_PERMISSIONS.has(permission));
    },
  );

  defaultSession.setPermissionCheckHandler(
    (webContents, permission, requestingOrigin) => {
      const url = requestingOrigin || webContents.getURL();
      return isAllowedUrl(url) && ALLOWED_PERMISSIONS.has(permission);
    },
  );

  defaultSession.on("will-download", (_event, item) => {
    const filename = path.basename(item.getFilename() || "download");
    const savePath = uniqueDownloadPath(filename);

    item.setSavePath(savePath);
    item.once("done", (_event, state) => {
      if (state === "completed") {
        shell.showItemInFolder(savePath);
      } else if (state === "interrupted") {
        dialog.showErrorBox("下载失败", `无法下载 ${filename}`);
      }
    });
  });
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const win = getWindow();
    if (!win) {
      createWindow();
      return;
    }
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });

  app.on("web-contents-created", (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      if (isAllowedUrl(url, { allowEphemeral: true })) {
        return {
          action: "allow",
          overrideBrowserWindowOptions: {
            width: 640,
            height: 820,
            show: true,
            autoHideMenuBar: true,
            backgroundColor: "#ffffff",
            ...(getWindow() ? { parent: getWindow() } : {}),
            webPreferences: {
              contextIsolation: true,
              nodeIntegration: false,
              sandbox: true,
              webSecurity: true,
              spellcheck: true,
              webviewTag: false,
              allowRunningInsecureContent: false,
              safeDialogs: true,
            },
          },
        };
      }

      openExternal(url);
      return { action: "deny" };
    });

    contents.on("will-navigate", (event, url) => {
      if (!isAllowedUrl(url)) {
        event.preventDefault();
        openExternal(url);
      }
    });

    contents.on("will-redirect", (event, url) => {
      if (!isAllowedUrl(url)) {
        event.preventDefault();
        openExternal(url);
      }
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.whenReady().then(() => {
    configureSession();

    app.setAboutPanelOptions({
      applicationName: APP_NAME,
      applicationVersion: app.getVersion(),
      version: app.getVersion(),
      copyright: "© 2026 Oproxy",
      credits: "Oproxy Chat desktop",
    });

    if (process.platform === "darwin" && !app.isPackaged) {
      const iconPath = path.join(__dirname, "../build/icon.png");
      if (fs.existsSync(iconPath)) {
        app.dock.setIcon(nativeImage.createFromPath(iconPath));
      }
    }

    Menu.setApplicationMenu(buildMenu());
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception", error);
});

process.on("unhandledRejection", (error) => {
  console.error("Unhandled rejection", error);
});
