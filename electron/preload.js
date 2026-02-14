const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("arcend", {
  play: () => ipcRenderer.send("play"),
  setRam: (value) => ipcRenderer.send("set-ram", value),
  getConfig: () => ipcRenderer.invoke("get-config")
});