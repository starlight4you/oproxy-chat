const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld(
  "oproxyDesktop",
  Object.freeze({
    getAccountSummary: (email) => ipcRenderer.invoke("account-summary", email),
    openAccountPage: (destination) => ipcRenderer.invoke("open-account-page", destination),
    showMessageDocumentMenu: (payload) =>
      ipcRenderer.invoke("show-message-document-menu", payload),
    readDocumentSkill: (type) => ipcRenderer.invoke("read-document-skill", type),
    repairDocument: (payload) => ipcRenderer.invoke("repair-document",payload),
    generateDocument: (payload) =>
      ipcRenderer.invoke("generate-document", payload),
    lookupDocument: (request) => ipcRenderer.invoke("lookup-document", request),
    documentAction: (payload) => ipcRenderer.invoke("document-action", payload),
    getDocumentIcon: (documentId) => ipcRenderer.invoke("document-icon", documentId),
    openDownloads: () => ipcRenderer.invoke("open-downloads"),
  }),
);
