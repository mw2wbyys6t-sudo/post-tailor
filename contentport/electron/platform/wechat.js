/* =========================================================
   ContentPort · 微信公众号发布通道（electron/platform/wechat.js）
   官方开放平台 API：
   1. stable_token      POST /cgi-bin/stable_token         AppID+Secret → token
   2. 上传封面图        POST /cgi-bin/media/uploadimg      获取封面图片 URL
   3. 新建草稿          POST /cgi-bin/draft/add            图文内容 → media_id
   4. 发布              POST /cgi-bin/freepublish/submit   草稿 → 发布
   注意：2025-07 起，未完成微信认证的账号无法使用发布接口（会返回错误码透传）。
   ========================================================= */
'use strict';

const zlib = require('zlib');
const BASE = 'https://api.weixin.qq.com';

/* ---------- 带超时的 JSON POST ---------- */
async function wxFetch(path, body, { timeout = 20000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const resp = await fetch(BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!resp.ok) throw new Error(`微信 API HTTP ${resp.status}`);
    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}

function wxErr(json) {
  if (json && json.errcode && json.errcode !== 0) {
    const msg = {
      '40013': 'AppID 无效', '40125': 'AppSecret 无效',
      '40164': 'IP 不在白名单，请到公众平台配置服务器 IP 白名单',
      '45009': '接口调用频率超限', '48001': '接口未授权（需认证公众号）',
      '53010': '发布接口需要认证公众号',
      '87014': '内容含有违规信息'
    }[String(json.errcode)] || json.errmsg;
    throw new Error(`微信错误 ${json.errcode}：${msg}`);
  }
}

let tokenCache = null; // { appid, token, expireAt }

/* ---------- 获取 access_token（稳定版，带缓存，按 AppID 区分） ---------- */
async function getAccessToken(appid, secret) {
  if (tokenCache && tokenCache.appid === appid && tokenCache.expireAt > Date.now() + 60000) return tokenCache.token;
  const json = await wxFetch('/cgi-bin/stable_token', {
    grant_type: 'client_credential',
    appid,
    secret,
    force_refresh: false
  });
  wxErr(json);
  if (!json.access_token) throw new Error('未能获取 access_token');
  tokenCache = {
    appid,
    token: json.access_token,
    expireAt: Date.now() + (json.expires_in || 7200) * 1000
  };
  return tokenCache.token;
}

/* ---------- 登录校验：stable_token 成功即凭据有效，再取账号信息 ---------- */
async function verifyLogin(appid, secret) {
  await getAccessToken(appid, secret);
  // 获取公众号基本信息（昵称/头像）
  const token = tokenCache.token;
  const json = await wxFetch(`/cgi-bin/account/getaccountbasicinfo?access_token=${token}`, {});
  wxErr(json);
  const nickname = json.nick_name || (json.account_name || '微信认证公众号');
  return {
    nickname,
    appid,
    method: 'wechat-api',
    head_img: json.head_img || ''
  };
}

/* ---------- multipart 上传（Node FormData + Blob） ---------- */
async function multipartPost(token, apiPath, buffer, filename, contentType, { timeout = 20000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const form = new FormData();
    form.append('media', new Blob([buffer], { type: contentType }), filename);
    const resp = await fetch(`${BASE}${apiPath}?access_token=${token}`, {
      method: 'POST',
      body: form,
      signal: controller.signal
    });
    if (!resp.ok) throw new Error(`微信上传 HTTP ${resp.status}`);
    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- 上传封面图（永久素材 thumb） → thumb_media_id ---------- */
async function uploadThumb(token, buffer, { filename = 'cover.png', contentType = 'image/png' } = {}) {
  const json = await multipartPost(token, '/cgi-bin/material/add_material&type=thumb', buffer, filename, contentType);
  wxErr(json);
  if (!json.media_id) throw new Error('封面图上传失败：未返回 media_id');
  return json.media_id;
}

/* ---------- 上传正文图片（上传后返回微信图床 URL） ---------- */
async function uploadImg(token, imageUrl) {
  // 下载远程图片 → 上传微信图床（正文中的外部图片必须换成本平台图床才能正常显示）
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const resp = await fetch(imageUrl, { signal: controller.signal });
    if (!resp.ok) throw new Error(`远程图片下载失败 HTTP ${resp.status}`);
    const buffer = Buffer.from(await resp.arrayBuffer());
    const type = (resp.headers.get('content-type') || 'image/jpeg').split(';')[0];
    const ext = ({ 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/jpeg': 'jpg' }[type] || 'jpg');
    const json = await multipartPost(token, '/cgi-bin/media/uploadimg', buffer, `img-${Date.now()}.${ext}`, type);
    wxErr(json);
    if (!json.url) throw new Error('微信未返回图片 URL');
    return json.url;
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- 正文 HTML 中的外部图片替换为微信图床 ---------- */
async function inlineImages(token, html) {
  const urls = [...String(html).matchAll(/<img[^>]*src="([^"]+)"/g)].map(m => m[1]);
  const seen = new Set();
  for (const u of urls) {
    if (seen.has(u)) continue;
    seen.add(u);
    // 已是微信 CDN 图片则跳过
    if (/^(https?:)?\/\/(mmbiz\.qpic\.cn|mmbiz\.weixin\.qq\.com|mp\.weixin\.qq\.com)/i.test(u)) continue;
    try {
      const newUrl = await uploadImg(token, u);
      html = html.split(u).join(newUrl);
    } catch (_) { /* 保持原图，发布不中断 */ }
  }
  return html;
}

/* ---------- 本地生成默认封面（无封面时兜底，纯 Node 无依赖 PNG） ---------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function makeCoverPng() {
  // 900×500 微信推荐封面比例（1.8:1），品牌绿纵向渐变
  const w = 900, h = 500;
  const c1 = [7, 193, 96];   // #07C160
  const c2 = [2, 84, 42];    // 深绿收尾
  const raw = [];
  for (let y = 0; y < h; y++) {
    raw.push(0); // filter: none
    const t = y / (h - 1);
    const r = Math.round(c1[0] + (c2[0] - c1[0]) * t);
    const g = Math.round(c1[1] + (c2[1] - c1[1]) * t);
    const b = Math.round(c1[2] + (c2[2] - c1[2]) * t);
    for (let x = 0; x < w; x++) raw.push(r, g, b);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(Buffer.from(raw), { level: 6 })),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------- 解析封面参数（URL / dataURI / Buffer） ---------- */
async function resolveCover(cover) {
  if (!cover) return null;
  if (Buffer.isBuffer(cover)) return { buffer: cover, contentType: 'image/png', filename: 'cover.png' };
  const str = String(cover);
  if (/^data:image\/([a-z+]+);base64,/i.test(str)) {
    const mime = str.match(/^data:image\/([a-z+]+);base64,/i)[1];
    return {
      buffer: Buffer.from(str.split(',')[1], 'base64'),
      contentType: 'image/' + mime,
      filename: 'cover.' + mime
    };
  }
  if (/^https?:\/\//i.test(str)) {
    const resp = await fetch(str, { signal: AbortSignal.timeout(20000) });
    if (!resp.ok) throw new Error(`封面图下载失败 HTTP ${resp.status}`);
    const type = (resp.headers.get('content-type') || 'image/jpeg').split(';')[0];
    const mime = type.replace('image/', '');
    return {
      buffer: Buffer.from(await resp.arrayBuffer()),
      contentType: type,
      filename: 'cover.' + mime
    };
  }
  throw new Error('无法识别的封面图格式');
}

/* ---------- markdown → HTML（微信草稿内容，支持 a 标签以外基础标签） ---------- */
function mdToHtml(md) {
  const lines = String(md).split('\n');
  let html = '';
  let inCode = false;
  let codeBuf = [];
  let inList = false;

  const esc = (s) => String(s)
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

/* ---------- 新建草稿并发布 ---------- */
async function publish({ appid, secret, title, author, digest, content, coverUrl = '' }) {
  const token = await getAccessToken(appid, secret);

  // 1) 上传封面：有封面走封面图；无封面本地生成默认封面兜底（微信草稿要求必有 thumb）
  let thumbMediaId = '';
  try {
    if (coverUrl) {
      const cover = await resolveCover(coverUrl);
      thumbMediaId = await uploadThumb(token, cover.buffer, { filename: cover.filename, contentType: cover.contentType });
    } else {
      thumbMediaId = await uploadThumb(token, makeCoverPng(), { filename: 'cover.png', contentType: 'image/png' });
    }
  } catch (e) {
    throw new Error(`封面图处理失败：${e.message}`);
  }

  // 2) 正文转 HTML 并把外部图片托管到微信图床
  let html = mdToHtml(content);
  html = await inlineImages(token, html);

  // 3) 新建草稿
  const draft = await wxFetch(`/cgi-bin/draft/add?access_token=${token}`, {
    articles: [{
      title,
      author: author || '',
      digest: digest || '',
      content: html,
      content_source_url: '',
      thumb_media_id: thumbMediaId,
      need_open_comment: 1,
      only_fans_can_comment: 0
    }]
  });
  wxErr(draft);
  const mediaId = draft.media_id;
  if (!mediaId) throw new Error('新建草稿失败：未返回 media_id');

  // 4) 发布
  const pub = await wxFetch(`/cgi-bin/freepublish/submit?access_token=${token}`, { media_id: mediaId });
  wxErr(pub);
  return {
    media_id: mediaId,
    publish_id: pub.publish_id || '',
    url: '',
    note: '已提交微信发布，审核通过后展示在公众号主页'
  };
}

module.exports = { verifyLogin, publish, mdToHtml, makeCoverPng };
