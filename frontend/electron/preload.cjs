const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("catodo", {
  openLogin: (url) => ipcRenderer.invoke("open-login", url),
  mediaKey: (key) => ipcRenderer.send("media-key", key),
  insertText: (text) => ipcRenderer.send("insert-text", text),
});
