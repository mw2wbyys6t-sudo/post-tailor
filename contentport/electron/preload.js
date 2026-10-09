/* =========================================================
   ContentPort · 预加载脚本（preload.js）
   通过 contextBridge 安全暴露 IPC 能力给渲染进程
   ========================================================= */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 渲染进程调用 AI（主进程代理，绕过 CORS）
  callAI: (payload) => ipcRenderer.invoke('ai:call', payload),
  // 平台登录校验（真实 API）
  loginTo: (payload) => ipcRenderer.invoke('platform:login', payload),
  // 扫码登录（打开平台登录页，捕获 Cookie）
  loginOAuth: (payload) => ipcRenderer.invoke('platform:login-oauth', payload),
  // 平台自动发布（真实 API）
  publishTo: (payload) => ipcRenderer.invoke('platform:publish', payload),
  // 平台数据回拉（阅读/点赞/评论）
  fetchStats: (payload) => ipcRenderer.invoke('platform:stats', payload),
  // 环境信息
  isElectron: true,
  platform: process.platform
});
