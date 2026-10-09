/* =========================================================
   ContentPort · CSDN 发布通道（electron/platform/csdn.js）
   CSDN 无官方公开 REST API，官方支持的协议为 MetaWeblog
   （XML-RPC）：https://write.blog.csdn.net/xmlrpc/index
   该通道与 Word / Open Live Writer 发布 CSDN 的方式相同。
   ========================================================= */
'use strict';

const ENDPOINT = 'https://write.blog.csdn.net/xmlrpc/index';

/* ---------- XML 转义 ---------- */
function xmlEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/* ---------- XML-RPC 值编码 ---------- */
function valueXml(v) {
  if (typeof v === 'number') {
    return Number.isInteger(v) ? `<value><int>${v}</int></value>` : `<value><double>${v}</double></value>`;
  }
  if (typeof v === 'boolean') return `<value><boolean>${v ? 1 : 0}</boolean></value>`;
  if (Array.isArray(v)) {
    return `<value><array><data>${v.map(x => valueXml(x)).join('')}</data></array></value>`;
  }
  if (v && typeof v === 'object') {
    return `<value><struct>${Object.keys(v).map(k => `<member><name>${xmlEscape(k)}</name>${valueXml(v[k])}</member>`).join('')}</struct></value>`;
  }
  return `<value><string>${xmlEscape(v)}</string></value>`;
}

/* ---------- XML-RPC 请求构造 ---------- */
function buildCall(methodName, params) {
  return `<?xml version="1.0"?>
<methodCall>
  <methodName>${methodName}</methodName>
  <params>
    ${params.map(p => `<param>${valueXml(p)}</param>`).join('\n    ')}
  </params>
</methodCall>`;
}

/* ---------- XML 解析（轻量，仅处理本通道返回结构） ---------- */
function parseValue(xml) {
  xml = String(xml).trim();
  // 取第一个 <value>...</value>
  const m = xml.match(/<value>(?:<([a-zA-Z]+)>)?([\s\S]*?)(?:<\/[a-zA-Z]+>)?<\/value>/);
  if (!m) return null;
  const type = m[1] || 'string';
  const body = m[2].trim();
  switch (type) {
    case 'int': case 'i4': return parseInt(body, 10);
    case 'double': return parseFloat(body);
    case 'boolean': return body === '1';
    case 'array':
      return parseArray(body);
    case 'struct':
      return parseStruct(body);
    case 'string':
    default:
      return decodeEntities(body);
  }
}

function parseArray(xml) {
  const inner = xml.match(/<data>([\s\S]*)<\/data>/)?.[1] || xml;
  const out = [];
  const re = /<value>[\s\S]*?<\/value>/g;
  let mm;
  while ((mm = re.exec(inner))) {
    out.push(parseValue(mm[0]));
  }
  return out;
}

function parseStruct(xml) {
  const out = {};
  const re = /<member>[\s\S]*?<\/member>/g;
  let mm;
  while ((mm = re.exec(xml))) {
    const block = mm[0];
    const name = block.match(/<name>([\s\S]*?)<\/name>/)?.[1] || '';
    const val = block.match(/<value>[\s\S]*?<\/value>/)?.[0] || '<value/>';
    out[name] = parseValue(val);
  }
  return out;
}

function decodeEntities(s) {
  return String(s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/* ---------- 解析响应：methodResponse / fault ---------- */
function parseResponse(text) {
  if (text.includes('<fault>')) {
    const fault = parseStruct(text.match(/<fault>([\s\S]*?)<\/fault>/)?.[1] || '');
    const err = new Error(`CSDN MetaWeblog 错误 (${fault.faultCode || -1})：${fault.faultString || '未知错误'}`);
    err.code = fault.faultCode;
    throw err;
  }
  const params = text.match(/<params>([\s\S]*?)<\/params>/)?.[1] || '';
  const val = params.match(/<value>[\s\S]*?<\/value>/)?.[0];
  return val ? parseValue(val) : null;
}

/* ---------- 发起调用 ---------- */
async function call(methodName, params, { timeout = 20000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const resp = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
      body: buildCall(methodName, params),
      signal: controller.signal
    });
    if (!resp.ok) throw new Error(`CSDN MetaWeblog HTTP ${resp.status}`);
    const text = await resp.text();
    return parseResponse(text);
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- 登录校验：blogger.getUsersBlogs ---------- */
async function verifyLogin(username, password) {
  const blogs = await call('blogger.getUsersBlogs', ['', username, password]);
  const blog = Array.isArray(blogs) ? blogs[0] : blogs;
  return {
    nickname: (blog && (blog.blogName || blog.blogid)) || username,
    blogid: blog ? String(blog.blogid || blog.url || '') : '',
    url: blog ? (blog.url || '') : '',
    username,
    method: 'metaweblog'
  };
}

/* ---------- markdown → HTML（主进程侧最小转换） ---------- */
function mdToHtml(md) {
  const lines = String(md).split('\n');
  let html = '';
  let inCode = false;
  let codeBuf = [];
  let inList = false;

  const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
  const bold = (s) => s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  lines.forEach((raw) => {
    const line = raw.trim();
    if (line.startsWith('```')) {
      if (inCode) {
        html += `<pre><code>${xmlEscape(codeBuf.join('\n'))}</code></pre>`;
        codeBuf = [];
        inCode = false;
      } else {
        closeList();
        inCode = true;
      }
      return;
    }
    if (inCode) { codeBuf.push(raw); return; }
    if (line.startsWith('## ')) { closeList(); html += `<h3>${bold(xmlEscape(line.slice(3)))}</h3>`; return; }
    if (line.startsWith('### ')) { closeList(); html += `<h4>${bold(xmlEscape(line.slice(4)))}</h4>`; return; }
    if (line.startsWith('> ')) { closeList(); html += `<blockquote>${bold(xmlEscape(line.slice(2)))}</blockquote>`; return; }
    const img = line.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
    if (img) { closeList(); html += `<p><img src="${xmlEscape(img[2])}" alt="${xmlEscape(img[1])}"/></p>`; return; }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${bold(xmlEscape(line.slice(2)))}</li>`;
      return;
    }
    if (!line) { closeList(); return; }
    closeList();
    html += `<p>${bold(xmlEscape(line))}</p>`;
  });
  closeList();
  if (inCode) html += `<pre><code>${xmlEscape(codeBuf.join('\n'))}</code></pre>`;
  return html;
}

/* ---------- 发布：metaWeblog.newPost ---------- */
async function publish({ username, password, title, content, categories = ['原创'] }) {
  const post = {
    title,
    description: mdToHtml(content),
    categories
  };
  const postid = await call('metaWeblog.newPost', ['', username, password, post, true]);
  const articleUrl = `https://blog.csdn.net/${username}/article/details/${postid}`;
  return { postid: String(postid), url: articleUrl };
}

/* ---------- 数据回拉：读取文章页 HTML 中的阅读/点赞/评论数 ---------- */
async function fetchStats({ username, postId }) {
  if (!postId) throw new Error('缺少文章 ID');
  const resp = await fetch(
    `https://blog.csdn.net/${encodeURIComponent(username || '')}/article/details/${postId}`,
    {
      headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' }
    }
  );
  if (!resp.ok) throw new Error(`CSDN 文章页访问失败 HTTP ${resp.status}`);
  const html = await resp.text();

  const grab = (patterns) => {
    for (const re of patterns) {
      const m = html.match(re);
      if (m && m[1]) {
        const n = parseInt(String(m[1]).replace(/,/g, ''), 10);
        if (!isNaN(n)) return n;
      }
    }
    return 0;
  };

  return {
    views: grab([/"viewCount":\s*"?(\d+)/, /"readCount":\s*"?(\d+)/, /阅读[：:]\s*(\d+)/]),
    likes: grab([/"likeCount":\s*"?(\d+)/, /"diggCount":\s*"?(\d+)/, /"upCount":\s*"?(\d+)/]),
    comments: grab([/"commentCount":\s*"?(\d+)/, /评论[：:]\s*(\d+)/]),
    note: ''
  };
}

module.exports = { verifyLogin, publish, mdToHtml, fetchStats };
