/* =========================================================
   ContentPort · Electron 主进程（main.js）
   - 创建桌面窗口并加载前端
   - ipcMain 代理 AI 请求（绕过浏览器 CORS，Key 不出本机）
   ========================================================= */
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');

const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    title: 'ContentPort · 内容港',
    backgroundColor: '#F5F2EB',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });

  win.loadFile(path.join(__dirname, '..', 'index.html'));

  // 外部链接用系统浏览器打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });

  return win;
}

/* ---------- AI 代理：渲染进程 → 主进程 → 大模型 API ---------- */
ipcMain.handle('ai:call', async (_event, { url, body, apiKey }) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!resp.ok) {
      let msg = 'AI 请求失败 (' + resp.status + ')';
      try {
        const e = await resp.json();
        msg += '：' + (e.error?.message || (e.error?.type || ''));
      } catch (_) { /* ignore */ }
      throw new Error(msg);
    }
    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
});

/* ---------- 发布代理：渲染进程 → 主进程 → 平台 API（预留） ---------- */
ipcMain.handle('platform:publish', async (_event, payload) => {
  // TODO: 按平台实现开放 API 调用（如 CSDN/知乎 文档接口）
  // payload = { platformId, apiKey, title, content, token }
  throw new Error('平台开放 API 尚未接入，请使用「复制稿」模式发布');
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
