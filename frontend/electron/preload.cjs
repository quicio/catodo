const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("catodo", {
  openLogin: (url) => ipcRenderer.invoke("open-login", url),
});
