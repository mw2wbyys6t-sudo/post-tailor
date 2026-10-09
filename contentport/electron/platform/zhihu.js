/* =========================================================
   ContentPort · 知乎发布通道（electron/platform/zhihu.js）
   知乎无公开第三方发布 API，网页端「写文章」走内部接口：
     GET  /api/v4/me             校验登录态（Cookie）
     POST /api/v4/me/articles    发布文章（Cookie + _xsrf）
   本通道与知乎网页编辑器使用同一套接口，需用户在 Electron
   内扫码登录后捕获 Cookie 使用。
   ========================================================= */
'use strict';

const BASE = 'https://www.zhihu.com';

/* ---------- 从 Cookie 串中取值 ---------- */
function cookieValue(cookie, name) {
  const m = String(cookie).match(new RegExp('(?:^|;\\s*)' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : '';
}

/* ---------- markdown → HTML ---------- */
function mdToHtml(md) {
  const lines = String(md).split('\n');
  let html = '';
  let inCode = false;
  let codeBuf = [];
  let inList = false;

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const bold = (s) => s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };

  lines.forEach((raw) => {
    const line = raw.trim();
    if (line.startsWith('```')) {
      if (inCode) { html += `<pre><code>${esc(codeBuf.join('\n'))}</code></pre>`; codeBuf = []; inCode = false; }
      else { closeList(); inCode = true; }
      return;
    }
    if (inCode) { codeBuf.push(raw); return; }
    if (line.startsWith('## ')) { closeList(); html += `<h3>${bold(esc(line.slice(3)))}</h3>`; return; }
    if (line.startsWith('### ')) { closeList(); html += `<h4>${bold(esc(line.slice(4)))}</h4>`; return; }
    if (line.startsWith('> ')) { closeList(); html += `<blockquote>${bold(esc(line.slice(2)))}</blockquote>`; return; }
    const img = line.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
    if (img) { closeList(); html += `<p><img src="${esc(img[2])}" alt="${esc(img[1])}"/></p>`; return; }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${bold(esc(line.slice(2)))}</li>`;
      return;
    }
    if (!line) { closeList(); return; }
    closeList();
    html += `<p>${bold(esc(line))}</p>`;
  });
  closeList();
  if (inCode) html += `<pre><code>${esc(codeBuf.join('\n'))}</code></pre>`;
  return html;
}

/* ---------- 带 Cookie 的请求 ---------- */
async function jfetch(path, { method = 'GET', cookie = '', body } = {}) {
  const headers = { cookie, 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' };
  if (method === 'POST') {
    headers['content-type'] = 'application/json';
    headers['x-requested-with'] = 'fetch';
    headers['referer'] = BASE + '/creation/';
    headers['x-xsrftoken'] = cookieValue(cookie, '_xsrf');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const resp = await fetch(BASE + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    const data = await resp.json().catch(() => null);
    return { status: resp.status, data };
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- 登录校验 ---------- */
async function verifyLogin(cookie) {
  const { status, data } = await jfetch('/api/v4/me', { cookie });
  if (status !== 200 || !data || !data.name) {
    throw new Error('知乎登录态无效，请重新登录');
  }
  return {
    nickname: data.name,
    url_token: data.url_token || '',
    headline: data.headline || '',
    method: 'zhihu-cookie'
  };
}

/* ---------- 发布文章 ---------- */
async function publish({ cookie, title, content }) {
  const { status, data } = await jfetch('/api/v4/me/articles', {
    method: 'POST',
    cookie,
    body: { title, content: mdToHtml(content), topic_ids: [], delta_time: 0 }
  });
  if (status !== 200 || !data) {
    const msg = (data && data.error && data.error.message)
      || (data && data.message)
      || `知乎发布失败 HTTP ${status}`;
    throw new Error(msg);
  }
  const id = data.id || data.article_id;
  return { postid: String(id), url: `https://zhuanlan.zhihu.com/p/${id}` };
}

/* ---------- 数据回拉：文章互动数据 ---------- */
async function fetchStats({ cookie, postId }) {
  if (!postId) throw new Error('缺少文章 ID');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const resp = await fetch(
      `https://api.zhihu.com/articles/${postId}?include=voteup_count,comment_count,view_count`,
      {
        headers: {
          cookie,
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
        },
        signal: controller.signal
      }
    );
    if (!resp.ok) throw new Error(`知乎数据接口访问失败 HTTP ${resp.status}`);
    const data = await resp.json().catch(() => null);
    if (!data || !data.id) throw new Error('知乎返回数据异常');
    return {
      views: data.view_count || 0,
      likes: data.voteup_count || 0,
      comments: data.comment_count || 0,
      status: '',
      note: ''
    };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { verifyLogin, publish, mdToHtml, cookieValue, fetchStats };
