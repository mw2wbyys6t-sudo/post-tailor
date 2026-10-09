/* =========================================================
   ContentPort · UI 层（ui.js）
   共享组件：Lucide 内联 SVG 图标 / Toast / Modal / 通用渲染
   ========================================================= */
window.CP = window.CP || {};

(function () {
  /* ---------- Lucide 图标（内联 SVG，离线可用，stroke 1.75） ---------- */
  const ICONS = {
    dashboard: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    book: '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
    radar: '<path d="M19.07 4.93A10 10 0 0 0 6.99 3.34"/><path d="M4 6h.01"/><path d="M2.29 9.62A10 10 0 1 0 21.31 8.35"/><path d="M16.24 7.76A6 6 0 1 0 8.23 16.67"/><path d="M12 18h.01"/><path d="M17.99 11.66A6 6 0 0 1 15.77 16.67"/><circle cx="12" cy="12" r="2"/><path d="m13.41 10.59 5.66-5.66"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    sparkles: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.287 1.288L3 12l5.8 1.9a2 2 0 0 1 1.288 1.287L12 21l1.9-5.8a2 2 0 0 1 1.287-1.288L21 12l-5.8-1.9a2 2 0 0 1-1.288-1.287Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>',
    pen: '<path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    checkCircle: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    trending: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    chart: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
    fileText: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3"/><path d="m16 16-1.9-1.9"/>',
    eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
    bot: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    hash: '<line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/>',
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
    bookOpen: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    activity: '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
    briefcase: '<rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
    heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
    lightbulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
    calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
    key: '<path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    creditCard: '<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>'
  };

  function icon(name, size = 18) {
    const paths = ICONS[name] || ICONS['sparkles'];
    return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  }

  /* ---------- Toast ---------- */
  function toast(msg, type = 'ok', duration = 2600) {
    const root = document.getElementById('toast-root');
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    const ic = type === 'ok' ? 'checkCircle' : type === 'warn' ? 'flame' : 'zap';
    el.innerHTML = `${icon(ic, 16)}<span>${msg}</span>`;
    root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    }, duration);
  }

  /* ---------- Modal ---------- */
  function openModal(html, { width = 560, onClose } = {}) {
    const root = document.getElementById('modal-root');
    root.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = `
      <div class="modal-mask" data-close></div>
      <div class="modal" style="max-width:${width}px">
        <button class="modal-x" data-close aria-label="关闭">${icon('x', 18)}</button>
        ${html}
      </div>`;
    root.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('show'));
    const close = () => {
      wrap.classList.remove('show');
      setTimeout(() => { wrap.remove(); if (onClose) onClose(); }, 220);
    };
    wrap.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
    return { close, rootEl: wrap };
  }

  /* ---------- 通用渲染 helpers ---------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtNum(n) {
    if (n >= 10000) return (n / 10000).toFixed(1) + 'w';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
  }

  /* ---------- 折线图（纯 SVG，无依赖） ----------
     points: number[]；labels: 首/中/末 时间标签
     color 可为 CSS 变量（通过 currentColor 应用） */
  function lineChart({ points, labels = [], width = 560, height = 180, color = 'var(--primary)', fill = true } = {}) {
    const pts = (points || []).map(Number);
    if (!pts.length) return '<div class="hint" style="padding:40px 0;text-align:center">暂无数据</div>';
    if (pts.length === 1) {
      return `<div style="display:flex;align-items:center;gap:10px;padding:30px 8px">
        <span style="width:10px;height:10px;border-radius:50%;background:currentColor;color:${esc(color)}"></span>
        <span style="font-size:20px;font-weight:700">${fmtNum(pts[0])}</span>
        <span class="hint" style="margin:0">首个数据点，继续回拉将生成趋势</span>
      </div>`;
    }
    const padL = 6, padR = 6, padT = 14, padB = 22;
    const min = Math.min(...pts), max = Math.max(...pts);
    const range = (max - min) || 1;
    const X = (i) => padL + i * (width - padL - padR) / (pts.length - 1);
    const Y = (v) => padT + (1 - (v - min) / range) * (height - padT - padB);
    const line = pts.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
    const area = `${line} L${X(pts.length - 1).toFixed(1)},${height - padB} L${X(0).toFixed(1)},${height - padB} Z`;
    const gridY = [0, 0.5, 1].map(t => Math.round(min + t * range)).filter((v, i, a) => a.indexOf(v) === i);
    const mid = Math.floor((pts.length - 1) / 2);
    const ticks = [0, mid, pts.length - 1].filter((v, i, a) => a.indexOf(v) === i);
    const tickLabels = ticks.map(i => (labels && labels[i]) || `#${i + 1}`);
    return `
      <svg viewBox="0 0 ${width} ${height}" style="color:${esc(color)};display:block;width:100%;height:auto" role="img" aria-label="数据趋势">
        ${gridY.map(v => `<line x1="${padL}" y1="${Y(v).toFixed(1)}" x2="${width - padR}" y2="${Y(v).toFixed(1)}" style="stroke:var(--border)" stroke-width="1"/>`).join('')}
        ${gridY.map(v => `<text x="${padL + 2}" y="${(Y(v) - 4).toFixed(1)}" font-size="9" style="fill:var(--ink-4)" text-anchor="start">${fmtNum(v)}</text>`).join('')}
        ${fill ? `<path d="${area}" fill="currentColor" opacity=".12"/>` : ''}
        <path d="${line}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
        ${pts.map((v, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="2.6" fill="#fff" stroke="currentColor" stroke-width="2"><title>${fmtNum(v)}</title></circle>`).join('')}
        ${ticks.map((i, k) => `<text x="${X(i).toFixed(1)}" y="${height - 6}" font-size="9.5" style="fill:var(--ink-4)" text-anchor="${k === 0 ? 'start' : k === ticks.length - 1 ? 'end' : 'middle'}">${esc(tickLabels[k])}</text>`).join('')}
      </svg>`;
  }

  /* ---------- 下载文件（Blob） ---------- */
  function downloadFile(filename, content, mime = 'text/plain') {
    const blob = new Blob([content], { type: mime + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /* markdown 渲染：## 标题 / > 引用 / - 列表 / 表格 / 普通段落 / 代码块 / 加粗 */
  function renderMd(md) {
    const bold = (s) => s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    const lines = String(md).split('\n');
    let html = '';
    let inTable = false;
    let inList = false;
    let inCode = false;
    let codeBuf = [];

    const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
    const closeTable = () => { if (inTable) { html += '</table>'; inTable = false; } };

    lines.forEach((raw) => {
      const line = raw.trim();

      if (line.startsWith('```')) {
        if (inCode) {
          html += `<pre class="md-code"><code>${esc(codeBuf.join('\n'))}</code></pre>`;
          codeBuf = [];
          inCode = false;
        } else {
          closeList(); closeTable();
          inCode = true;
        }
        return;
      }
      if (inCode) { codeBuf.push(raw); return; }

      if (line.startsWith('|') && line.endsWith('|')) {
        closeList();
        const cells = line.split('|').slice(1, -1).map(c => c.trim());
        const isHeader = cells.every(c => /^:?-{2,}:?$/.test(c));
        if (!inTable) {
          html += '<table class="md-table"><tbody>';
          inTable = true;
        }
        if (isHeader) return;
        html += '<tr>' + cells.map(c => `<td>${bold(esc(c))}</td>`).join('') + '</tr>';
        return;
      }
      if (inTable && !line.startsWith('|')) closeTable();

      if (line.startsWith('## ')) {
        closeList(); closeTable();
        html += `<h3 class="md-h">${esc(line.slice(3))}</h3>`;
        return;
      }
      if (line.startsWith('### ')) {
        closeList(); closeTable();
        html += `<h4 class="md-h md-h3">${esc(line.slice(4))}</h4>`;
        return;
      }
      if (line.startsWith('> ')) {
        closeList();
        html += `<blockquote class="md-quote">${bold(esc(line.slice(2)))}</blockquote>`;
        return;
      }
      if (line.startsWith('- ') || line.startsWith('* ')) {
        closeTable();
        if (!inList) { html += '<ul class="md-list">'; inList = true; }
        html += `<li>${bold(esc(line.slice(2)))}</li>`;
        return;
      }
      if (line.startsWith('1. ') || /^\d+\.\s/.test(line)) {
        closeTable();
        if (!inList) { html += '<ul class="md-list md-list-num">'; inList = true; }
        html += `<li>${bold(esc(line.replace(/^\d+\.\s/, '')))}</li>`;
        return;
      }
      if (!line) { closeList(); closeTable(); return; }

      closeList(); closeTable();
      html += `<p class="md-p">${bold(esc(line))}</p>`;
    });
    closeList(); closeTable();
    if (inCode) html += `<pre class="md-code"><code>${esc(codeBuf.join('\n'))}</code></pre>`;
    return html;
  }

  /* 骨架屏 */
  function skeleton(lines = 4) {
    let s = '';
    for (let i = 0; i < lines; i++) s += '<div class="skel"></div>';
    return `<div class="skeleton">${s}</div>`;
  }

  window.CP.ui = { icon, toast, openModal, esc, fmtNum, renderMd, skeleton, ICONS, lineChart, downloadFile };

  /* ---------- 页面注册表（供各页面脚本在加载时注册） ---------- */
  const PAGES = {};
  CP.registerPage = (key, fn) => { PAGES[key] = fn; };
  CP.getPage = (key) => PAGES[key];
})();
