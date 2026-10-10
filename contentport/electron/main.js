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

/* ---------- 小红书浏览器全自动发布 ----------
   说明：小红书无第三方开放发布 API，内部接口需前端 x-s 签名（逆向极易失效）。
   本通道复用扫码登录的持久 session 打开官方发布页，由页面自身 JS 完成
   签名与提交 —— 自动填标题、正文，自动点击「发布」并轮询结果；
   若自动化环节失败（页面改版等），自动回退为辅助发布（用户手动确认）。
   -------------------------------------------------------- */
function waitMs(ms) { return new Promise(r => setTimeout(r, ms)); }

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* 正文 → 段落 HTML（用于写入 contenteditable 编辑器） */
function contentToHtml(content) {
  return String(content).split(/\n+/).map(p => {
    const t = p.trim();
    return t ? '<p>' + escHtml(t) + '</p>' : '';
  }).join('');
}

async function xhsPublish({ title, content }) {
  const ses = session.fromPartition('persist:platform-xhs');
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    title: '小红书 · 自动发布',
    autoHideMenuBar: true,
    webPreferences: { session: ses, contextIsolation: true, nodeIntegration: false, spellcheck: false }
  });
  win.setMenuBarVisibility(false);
  await win.loadURL('https://creator.xiaohongshu.com/publish/publish?source=official');
  await waitMs(5000); // 等待发布页前端渲染（首屏较慢）

  // 正文放入剪贴板，作为兜底粘贴源
  clipboard.writeText(`【标题】${title}\n\n${content}`);

  // 1) 自动填标题（React 受控输入需走原生 setter + input 事件）
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

  // 2) 自动填正文（Quill / contenteditable 富文本编辑器）
  const bodyHtml = contentToHtml(content);
  let bodyFilled = false;
  try {
    bodyFilled = await win.webContents.executeJavaScript(`(function () {
      var html = ${JSON.stringify(bodyHtml)};
      var editor = null;
      var cands = document.querySelectorAll('.ql-editor, [contenteditable="true"]');
      for (var i = 0; i < cands.length; i++) {
        var el = cands[i];
        var r = el.getBoundingClientRect();
        if (r.width > 300 && r.height > 60) { editor = el; break; }
      }
      if (!editor) return false;
      editor.focus();
      var sel = window.getSelection();
      var range = document.createRange();
      range.selectNodeContents(editor);
      sel.removeAllRanges();
      sel.addRange(range);
      var ok = false;
      try { ok = document.execCommand('insertHTML', false, html); } catch (e) { ok = false; }
      if (!ok) {
        editor.innerHTML = html;
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        ok = true;
      }
      editor.blur();
      return ok;
    })()`).catch(() => false);
  } catch (_) { /* 忽略填充失败 */ }

  // 标题或正文未自动填入 → 回退辅助发布，避免带空内容误点发布
  if (!titleFilled || !bodyFilled) {
    win.destroy();
    return {
      status: 'opened',
      titleFilled,
      bodyFilled,
      note: '发布页自动填充不完整（标题' + (titleFilled ? '已填' : '未填') + '、正文' + (bodyFilled ? '已填' : '未填') + '），正文已复制到剪贴板，请在页面粘贴并确认发布'
    };
  }

  // 3) 自动点击「发布」按钮
  await waitMs(1500);
  let publishClicked = false;
  try {
    publishClicked = await win.webContents.executeJavaScript(`
      (function () {
        var btns = Array.prototype.slice.call(document.querySelectorAll('button, [role="button"]'));
        var btn = btns.find(function (b) {
          var t = (b.textContent || '').replace(/\\s+/g, '');
          return t === '发布';
        });
        if (!btn) return false;
        btn.click();
        return true;
      })()
    `).catch(() => false);
  } catch (_) { /* 忽略 */ }

  // 4) 可能出现的「确认发布」弹窗
  if (publishClicked) {
    await waitMs(2500);
    try {
      await win.webContents.executeJavaScript(`
        (function () {
          var btns = Array.prototype.slice.call(document.querySelectorAll('button, [role="button"]'));
          var ok = btns.find(function (b) {
            var t = (b.textContent || '').replace(/\\s+/g, '');
            return t === '确认发布' || t === '确定发布';
          });
          if (ok) { ok.click(); return true; }
          return false;
        })()
      `).catch(() => false);
    } catch (_) { /* 忽略 */ }
  }

  // 5) 轮询发布结果（最多 60 秒）
  let lastError = '';
  for (let i = 0; i < 20; i++) {
    await waitMs(3000);
    let r = { done: false, hasError: false, url: '' };
    try {
      r = await win.webContents.executeJavaScript(`(function () {
        var txt = document.body.innerText || '';
        var url = location.href || '';
        var err = '';
        if (/发布失败|内容含有违禁|敏感内容|请勿重复/.test(txt)) err = txt.match(/(发布失败|内容含有违禁[^\\n。]*|敏感内容[^\\n。]*)/) ? txt.match(/(发布失败|内容含有违禁[^\\n。]*|敏感内容[^\\n。]*)/)[0] : '平台拒绝发布';
        var done = !!err ? false : (/发布成功/.test(txt) || /发布成功/.test(document.title || '') || !/publish/.test(url));
        return { done: done, hasError: !!err, url: url, err: err };
      })()`).catch(() => ({ done: false, hasError: false, url: '', err: '' }));
    } catch (_) { /* 忽略轮询错误 */ }
    if (r.hasError) {
      lastError = r.err || '平台拒绝发布';
      break;
    }
    if (r.done) {
      win.destroy();
      return { status: 'published', url: r.url || '', note: '已自动发布到小红书' };
    }
  }
  win.destroy();

  // 自动化未确认成功 → 回退辅助发布（不销毁页面内容，引导用户确认）
  const fallback = new BrowserWindow({
    width: 1180,
    height: 860,
    title: '小红书 · 发布页',
    autoHideMenuBar: true,
    webPreferences: { session: ses, contextIsolation: true, nodeIntegration: false, spellcheck: false }
  });
  fallback.setMenuBarVisibility(false);
  await fallback.loadURL('https://creator.xiaohongshu.com/publish/publish?source=official');
  clipboard.writeText(`【标题】${title}\n\n${content}`);

  return {
    status: 'opened',
    titleFilled: true,
    note: lastError
      ? ('自动发布被平台拦截：' + lastError + '。已重新打开发布页，正文在剪贴板，请检查后手动发布')
      : '已自动填入标题与正文并点击发布，但未确认到成功结果；已重新打开发布页，请查看状态并手动确认'
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
