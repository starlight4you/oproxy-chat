const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld(
  "oproxyDesktop",
  Object.freeze({
    showMessageDocumentMenu: (payload) =>
      ipcRenderer.invoke("show-message-document-menu", payload),
    runLocalCode: (payload) => ipcRenderer.invoke("run-local-code", payload),
    openDownloads: () => ipcRenderer.invoke("open-downloads"),
  }),
);
