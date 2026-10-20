"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("freeall", {
  summary: () => ipcRenderer.invoke("freeall:summary"),
  open: (path) => ipcRenderer.invoke("freeall:open", path),
  start: () => ipcRenderer.invoke("freeall:start"),
  stop: () => ipcRenderer.invoke("freeall:stop"),
});
