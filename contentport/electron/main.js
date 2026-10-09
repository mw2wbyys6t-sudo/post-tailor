/* =========================================================
   ContentPort · Electron 主进程（main.js）
   - 创建桌面窗口并加载前端
   - ipcMain 代理 AI 请求（绕过浏览器 CORS，Key 不出本机）
   ========================================================= */
const { app, BrowserWindow, ipcMain, shell, session, clipboard } = require('electron');
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

/* ---------- 平台发布通道（真实 API） ---------- */
const csdn = require('./platform/csdn');
const wechat = require('./platform/wechat');
const zhihu = require('./platform/zhihu');
const xhs = require('./platform/xhs');

/* ---------- 登录校验：渲染进程 → 主进程 → 平台接口 ---------- */
ipcMain.handle('platform:login', async (_event, payload) => {
  const { platformId, credential } = payload;
  switch (platformId) {
    case 'csdn':
      // credential = { username, password }
      return await csdn.verifyLogin(credential.username, credential.password);
    case 'wechat':
      // credential = { appid, secret }
      return await wechat.verifyLogin(credential.appid, credential.secret);
    case 'zhihu':
      // credential = { cookie }
      return await zhihu.verifyLogin(credential.cookie);
    case 'xhs':
      // credential = { cookie }
      return await xhs.verifyLogin(credential.cookie);
    default:
      throw new Error(`平台 ${platformId} 尚未接入真实登录`);
  }
});

/* ---------- 扫码登录：打开平台登录页，捕获 Cookie ---------- */
const OAUTH_CONF = {
  zhihu: {
    url: 'https://www.zhihu.com/signin',
    readyCookies: ['z_c0'],
    title: '登录知乎',
    successPath: /^\/$/
  },
  xhs: {
    url: 'https://creator.xiaohongshu.com/',
    readyCookies: ['web_session'],
    title: '登录小红书创作者平台',
    successPath: null
  }
};

async function openLoginWindow(platformId) {
  const conf = OAUTH_CONF[platformId];
  if (!conf) throw new Error(`平台 ${platformId} 不支持扫码登录`);

  const ses = session.fromPartition('persist:platform-' + platformId);
  const win = new BrowserWindow({
    width: 440,
    height: 680,
    title: conf.title,
    autoHideMenuBar: true,
    webPreferences: {
      session: ses,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });
  win.setMenuBarVisibility(false);
  await win.loadURL(conf.url);

  // 轮询 Cookie：出现关键登录态字段即视为登录完成
  const cookieStr = await new Promise((resolve) => {
    let tries = 0;
    const timer = setInterval(async () => {
      tries++;
      if (tries >= 300) { clearInterval(timer); resolve(null); return; } // 最多等 10 分钟
      try {
        const list = await ses.cookies.get({});
        const has = conf.readyCookies.every(name => list.some(c => c.name === name));
        if (has) {
          clearInterval(timer);
          resolve(list.map(c => `${c.name}=${c.value}`).join('; '));
        }
      } catch (_) { /* 忽略轮询错误 */ }
    }, 2000);
  });
  win.destroy();
  if (!cookieStr) throw new Error('登录超时，请重试');

  const verifier = platformId === 'zhihu' ? zhihu.verifyLogin : xhs.verifyLogin;
  const info = await verifier(cookieStr);
  return { cookie: cookieStr, ...info };
}

ipcMain.handle('platform:login-oauth', async (_event, { platformId }) => {
  return await openLoginWindow(platformId);
});

/* ---------- 小红书浏览器辅助发布 ---------- */
async function xhsPublish({ title, content }) {
  const ses = session.fromPartition('persist:platform-xhs');
  const win = new BrowserWindow({
    width: 1180,
    height: 860,
    title: '小红书 · 确认发布',
    autoHideMenuBar: true,
    webPreferences: { session: ses, contextIsolation: true, nodeIntegration: false, spellcheck: false }
  });
  win.setMenuBarVisibility(false);
  await win.loadURL('https://creator.xiaohongshu.com/publish/publish?source=official');
  await new Promise(r => setTimeout(r, 3500)); // 等待前端渲染

  // 正文放入剪贴板，方便一键粘贴
  clipboard.writeText(`【标题】${title}\n\n${content}`);

  // 尝试自动填入标题（React 受控输入需走原生 setter + input 事件）
  let titleFilled = false;
  try {
    titleFilled = await win.webContents.executeJavaScript(`
      (function () {
        var target = null;
        var inputs = document.querySelectorAll('input, textarea');
        for (var i = 0; i < inputs.length; i++) {
          var el = inputs[i];
          var ph = (el.getAttribute('placeholder') || '');
          var cls = (el.className || '') + ' ' + (el.id || '');
          if (/标题/.test(ph) || /title/i.test(cls) || /title/i.test(ph)) { target = el; break; }
        }
        if (!target) return false;
        var proto = target.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        var setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
        setter.call(target, ${JSON.stringify(title)});
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.focus();
        return true;
      })()
    `).catch(() => false);
  } catch (_) { /* 忽略填充失败 */ }

  return {
    status: 'opened',
    titleFilled,
    note: '已打开小红书发布页' + (titleFilled ? '，标题已自动填入' : '，请在页面粘贴标题') + '；正文已复制到剪贴板，请粘贴正文并确认发布'
  };
}

/* ---------- 发布：渲染进程 → 主进程 → 平台 API ---------- */
ipcMain.handle('platform:publish', async (_event, payload) => {
  const { platformId, credential, title, content, digest } = payload;
  switch (platformId) {
    case 'csdn': {
      const res = await csdn.publish({
        username: credential.username,
        password: credential.password,
        title,
        content
      });
      return { ...res, platformName: 'CSDN' };
    }
    case 'wechat': {
      const res = await wechat.publish({
        appid: credential.appid,
        secret: credential.secret,
        title,
        digest,
        content
      });
      return { ...res, platformName: '微信公众号' };
    }
    case 'zhihu': {
      const res = await zhihu.publish({ cookie: credential.cookie, title, content });
      return { ...res, platformName: '知乎' };
    }
    case 'xhs': {
      // 浏览器辅助发布：打开官方发布页，标题自动填入、正文入剪贴板
      const res = await xhsPublish({ title, content });
      return { ...res, platformName: '小红书' };
    }
    default:
      throw new Error(`平台 ${platformId} 尚未接入真实发布`);
  }
});

/* ---------- 数据回拉：渲染进程 → 主进程 → 平台统计接口 ---------- */
ipcMain.handle('platform:stats', async (_event, payload) => {
  const { platformId, credential, postId } = payload;
  switch (platformId) {
    case 'csdn':
      return await csdn.fetchStats({ username: credential.username, postId });
    case 'wechat':
      return await wechat.fetchStats({ appid: credential.appid, secret: credential.secret, publishId: postId });
    case 'zhihu':
      return await zhihu.fetchStats({ cookie: credential.cookie, postId });
    case 'xhs':
      throw new Error('小红书为浏览器辅助发布，暂不支持数据回拉');
    default:
      throw new Error(`平台 ${platformId} 未接入数据回拉`);
  }
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
