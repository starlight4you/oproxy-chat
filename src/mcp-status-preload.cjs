const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld(
  "mcpStatus",
  Object.freeze({
    get: () => ipcRenderer.invoke("mcp-status:get"),
    start: () => ipcRenderer.invoke("mcp-status:start"),
    stop: () => ipcRenderer.invoke("mcp-status:stop"),
    copy: (text) => ipcRenderer.invoke("mcp-status:copy", text),
    openChatSettings: () => ipcRenderer.invoke("mcp-status:open-chat-settings"),
    getLoginItem: () => ipcRenderer.invoke("mcp-status:get-login-item"),
    setLoginItem: (enabled) =>
      ipcRenderer.invoke("mcp-status:set-login-item", enabled),
    setPublicBaseUrl: (url) =>
      ipcRenderer.invoke("mcp-status:set-public-base-url", url),
  }),
);
