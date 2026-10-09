/* =========================================================
   ContentPort · 预加载脚本（preload.js）
   通过 contextBridge 安全暴露 IPC 能力给渲染进程
   ========================================================= */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 渲染进程调用 AI（主进程代理，绕过 CORS）
  callAI: (payload) => ipcRenderer.invoke('ai:call', payload),
  // 平台自动发布（预留）
  publishTo: (payload) => ipcRenderer.invoke('platform:publish', payload),
  // 环境信息
  isElectron: true,
  platform: process.platform
});
