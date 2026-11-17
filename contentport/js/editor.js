/* =========================================================
   OmniDraft · 文章编辑器（editor.js）
   两种编辑方式，同一份内容：
   - 富文本：contenteditable + 工具栏（标题/加粗/颜色/列表/表格/图片…）
   - Markdown：源码编辑，支持 预览 / 双栏对照
   左侧目录随标题自动生成；保存时统一落为 Markdown 正文
   ========================================================= */
window.CP = window.CP || {};

(function () {
  const ui = () => CP.ui;
  const S = () => CP.state;

  const CATS = ['技术干货', '职场成长', '生活方式', '学习方法', '产品设计', '商业财经', '行业观察', '效率工具', '个人成长', '评测', '科普'];

  /* ---------------- 富文本清洗（只保留安全标签/属性） ---------------- */
  const ALLOWED_TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'DIV', 'BR', 'SPAN', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'DEL', 'CODE', 'PRE', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'HR', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'A', 'IMG', 'FONT']);
  const ALLOWED_ATTR = new Set(['href', 'src', 'alt', 'title', 'colspan', 'rowspan', 'style', 'color']);

  function sanitizeHtml(html) {
    const box = document.createElement('div');
    box.innerHTML = String(html || '');
    [...box.querySelectorAll('script,style,iframe,object,embed,form,input,button,link,meta')].forEach(n => n.remove());
    [...box.querySelectorAll('*')].forEach(node => {
      if (!ALLOWED_TAGS.has(node.tagName)) {
        // 不认识的标签：保留内容、去掉外壳
        const frag = document.createDocumentFragment();
        while (node.firstChild) frag.appendChild(node.firstChild);
        node.replaceWith(frag);
        return;
      }
      [...node.attributes].forEach(attr => {
        const name = attr.name.toLowerCase();
        if (!ALLOWED_ATTR.has(name)) { node.removeAttribute(attr.name); return; }
        if ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(attr.value)) {
          node.removeAttribute(attr.name);
        }
      });
    });
    return box.innerHTML;
  }

  /* ---------------- 工具 ---------------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function countWords(text) {
    // 图片语法（含 base64 data URL）不计入字数，否则一张图会凭空多出几万字
    const stripped = String(text || '')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
    return stripped.replace(/\s/g, '').length;
  }

  function htmlToText(html) {
    const box = document.createElement('div');
    box.innerHTML = html;
    return box.textContent || '';
  }

  /* ---------------- 富文本 → Markdown ---------------- */
  function inlineMd(node) {
    let out = '';
    node.childNodes.forEach(child => {
      if (child.nodeType === 3) {
        out += child.nodeValue.replace(/\s+/g, ' ');
        return;
      }
      if (child.nodeType !== 1) return;
      const tag = child.tagName;
      const inner = inlineMd(child);
      switch (tag) {
        case 'STRONG': case 'B': out += inner.trim() ? '**' + inner.trim() + '**' : ''; break;
        case 'EM': case 'I': out += inner.trim() ? '*' + inner.trim() + '*' : ''; break;
        case 'DEL': case 'S': out += inner.trim() ? '~~' + inner.trim() + '~~' : ''; break;
        case 'CODE': out += '`' + (child.textContent || '') + '`'; break;
        case 'A': out += '[' + inner.trim() + '](' + (child.getAttribute('href') || '') + ')'; break;
        case 'IMG': out += '![' + (child.getAttribute('alt') || '') + '](' + (child.getAttribute('src') || '') + ')'; break;
        case 'BR': out += '\n'; break;
        default: out += inner;
      }
    });
    return out;
  }

  function htmlToMd(html) {
    const box = document.createElement('div');
    box.innerHTML = html;
    const blocks = [];

    const pushText = (t) => {
      const v = String(t || '').replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n').trim();
      if (v) blocks.push(v);
    };

    const walk = (parent) => {
      parent.childNodes.forEach(node => {
        if (node.nodeType === 3) {
          const t = node.nodeValue.replace(/\s+/g, ' ');
          if (t.trim()) blocks.push(t.trim());
          return;
        }
        if (node.nodeType !== 1) return;
        const tag = node.tagName;
        switch (tag) {
          case 'H1': blocks.push('# ' + inlineMd(node).trim()); break;
          case 'H2': blocks.push('## ' + inlineMd(node).trim()); break;
          case 'H3': blocks.push('### ' + inlineMd(node).trim()); break;
          case 'H4': blocks.push('#### ' + inlineMd(node).trim()); break;
          case 'H5': case 'H6': blocks.push('##### ' + inlineMd(node).trim()); break;
          case 'P': case 'DIV': {
            const inner = inlineMd(node).trim();
            if (inner) blocks.push(inner);
            break;
          }
          case 'UL': {
            const items = [...node.querySelectorAll(':scope > li')]
              .map(li => inlineMd(li).trim().replace(/\n+/g, ' '))
              .filter(Boolean);
            if (items.length) blocks.push(items.map(i => '- ' + i).join('\n'));
            break;
          }
          case 'OL': {
            const items = [...node.querySelectorAll(':scope > li')]
              .map(li => inlineMd(li).trim().replace(/\n+/g, ' '))
              .filter(Boolean);
            if (items.length) blocks.push(items.map((i, idx) => (idx + 1) + '. ' + i).join('\n'));
            break;
          }
          case 'BLOCKQUOTE': {
            const t = inlineMd(node).trim();
            if (t) blocks.push(t.split('\n').map(l => '> ' + l).join('\n'));
            break;
          }
          case 'PRE': {
            const code = node.querySelector('code');
            blocks.push('```\n' + ((code || node).textContent || '').replace(/\n+$/, '') + '\n```');
            break;
          }
          case 'HR': blocks.push('---'); break;
          case 'TABLE': {
            const rows = [...node.querySelectorAll('tr')].map(tr =>
              '| ' + [...tr.children].map(td => inlineMd(td).trim().replace(/\|/g, '\\|')).join(' | ') + ' |'
            );
            if (rows.length) {
              const cols = [...node.querySelectorAll('tr')[0].children].length;
              rows.splice(1, 0, '| ' + Array(cols).fill('---').join(' | ') + ' |');
              blocks.push(rows.join('\n'));
            }
            break;
          }
          case 'IMG': blocks.push('![' + (node.getAttribute('alt') || '') + '](' + (node.getAttribute('src') || '') + ')'); break;
          default:
            if (['SPAN', 'FONT', 'U', 'SUB', 'SUP'].includes(tag)) {
              const inner = inlineMd(node).trim();
              if (inner) blocks.push(inner);
            } else {
              walk(node);
            }
        }
      });
    };

    walk(box);
    return blocks.map(b => b.replace(/\n{3,}/g, '\n\n')).join('\n\n').trim();
  }

  /* ---------------- Markdown → 富文本 HTML ---------------- */
  function mdToHtml(md) {
    const lines = String(md || '').replace(/\r/g, '').split('\n');
    let html = '';
    let inCode = false;
    let codeBuf = [];
    let listType = null;

    const closeList = () => {
      if (listType) { html += '</' + listType + '>'; listType = null; }
    };
    const inline = (s) => esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />')
      .replace(/\[([^\]]*)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const t = line.trim();

      if (/^```/.test(t)) {
        if (inCode) { html += '<pre><code>' + esc(codeBuf.join('\n')) + '</code></pre>'; codeBuf = []; inCode = false; }
        else { closeList(); inCode = true; }
        continue;
      }
      if (inCode) { codeBuf.push(line); continue; }
      if (!t) { closeList(); continue; }

      /* 表格：连续 | 行合并为一张表 */
      if (/^\|.*\|$/.test(t)) {
        closeList();
        const rows = [];
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
          rows.push(lines[i].trim());
          i++;
        }
        i--;
        const cellsOf = (r) => r.split('|').slice(1, -1).map(c => c.trim());
        const isSep = rows.length > 1 && cellsOf(rows[1]).every(c => /^:?-{2,}:?$/.test(c));
        const head = rows[0];
        const body = isSep ? rows.slice(2) : rows;
        html += '<table><tbody>';
        html += '<tr>' + cellsOf(head).map(c => '<th>' + inline(c) + '</th>').join('') + '</tr>';
        body.forEach(r => {
          html += '<tr>' + cellsOf(r).map(c => '<td>' + inline(c) + '</td>').join('') + '</tr>';
        });
        html += '</tbody></table>';
        continue;
      }

      const h = t.match(/^(#{1,4})\s+(.+)$/);
      if (h) { closeList(); html += `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`; continue; }
      if (/^(-{3,}|\*{3,})$/.test(t)) { closeList(); html += '<hr />'; continue; }
      if (/^>\s?/.test(t)) { closeList(); html += '<blockquote>' + inline(t.replace(/^>\s?/, '')) + '</blockquote>'; continue; }

      const ul = t.match(/^[-*+]\s+(.+)$/);
      if (ul) {
        if (listType !== 'ul') { closeList(); html += '<ul>'; listType = 'ul'; }
        html += '<li>' + inline(ul[1]) + '</li>';
        continue;
      }
      const ol = t.match(/^\d+[.、)]\s+(.+)$/);
      if (ol) {
        if (listType !== 'ol') { closeList(); html += '<ol>'; listType = 'ol'; }
        html += '<li>' + inline(ol[1]) + '</li>';
        continue;
      }
      closeList();
      html += '<p>' + inline(t) + '</p>';
    }
    if (inCode && codeBuf.length) html += '<pre><code>' + esc(codeBuf.join('\n')) + '</code></pre>';
    closeList();
    return html;
  }

  /* ---------------- 目录 ---------------- */
  function headingsFromMd(md) {
    const out = [];
    String(md || '').split('\n').forEach((line, i) => {
      const m = line.match(/^(#{1,4})\s+(.+)$/);
      if (m) out.push({ level: m[1].length, text: m[2].trim(), line: i });
    });
    return out;
  }

  function headingsFromRich(root) {
    return [...root.querySelectorAll('h1,h2,h3,h4')].map(el => ({
      level: Number(el.tagName.slice(1)),
      text: el.textContent.trim(),
      el
    }));
  }

  /* ---------------- 本地图片：读取 + 压缩 ---------------- */
  const IMG_MAX_WIDTH = 1280;
  const IMG_MAX_BYTES = 900 * 1024; // 单图压缩目标（base64 前的字节量级）

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('读取图片失败'));
      reader.readAsDataURL(file);
    });
  }

  function loadImageEl(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('图片解析失败'));
      img.src = src;
    });
  }

  /* 超过宽度或体积时等比缩小并重新编码；GIF 且体积不大时保留原图 */
  async function compressImage(file, maxWidth = IMG_MAX_WIDTH, maxBytes = IMG_MAX_BYTES) {
    const raw = await fileToDataUrl(file);
    const isGif = /image\/gif/i.test(file.type);
    if (isGif && raw.length < maxBytes) return { dataUrl: raw, width: 0, compressed: false };

    const img = await loadImageEl(raw);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w) throw new Error('无法识别图片尺寸');

    const needResize = w > maxWidth;
    if (!needResize && raw.length <= maxBytes) return { dataUrl: raw, width: w, compressed: false };

    const scale = needResize ? maxWidth / w : 1;
    const cw = Math.max(1, Math.round(w * scale));
    const ch = Math.max(1, Math.round(h * scale));

    let quality = 0.85;
    let out = raw;
    for (let i = 0; i < 4; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, cw, ch);
      ctx.drawImage(img, 0, 0, cw, ch);
      out = canvas.toDataURL('image/jpeg', quality);
      if (out.length <= maxBytes) break;
      quality = Math.max(0.45, quality - 0.15);
    }
    if (out.length > maxBytes * 1.6) {
      throw new Error('图片过大，压缩后仍超过 1.5MB，请换一张更小的图');
    }
    return { dataUrl: out, width: cw, compressed: true };
  }

  /* ---------------- 编辑器主体 ---------------- */
  CP.editor = {
    open(articleId, opts = {}) {
      const isNew = !articleId;
      const article = isNew ? null : CP.actions.getArticle(articleId);
      if (!isNew && !article) { ui().toast('文章不存在', 'warn'); return; }

      let mode = article && article.editorMode === 'rich' ? 'rich' : 'md';
      let mdView = 'split'; // split | edit | preview
      let dirty = false;
      let bodyMd = article ? (article.body || '') : '';

      const root = document.createElement('div');
      root.className = 'editor-shell';
      root.innerHTML = `
        <div class="ed-topbar">
          <div class="ed-brand">${ui().icon('send', 16)} <span>OmniDraft</span></div>
          <div class="ed-modes">
            <button class="ed-mode" data-mode="rich">富文本</button>
            <button class="ed-mode" data-mode="md">Markdown</button>
          </div>
          <div class="ed-actions">
            <span class="ed-save-state" id="ed-save-state">未保存</span>
            <button class="btn btn-ghost btn-sm" id="ed-cancel">取消</button>
            <button class="btn btn-primary btn-sm" id="ed-save">${ui().icon('check', 14)} 保存文章</button>
          </div>
        </div>

        <div class="ed-toolbar" id="ed-toolbar"></div>

        <div class="ed-main">
          <aside class="ed-toc">
            <div class="ed-toc-head">
              <span>目录</span>
              <button class="ed-toc-toggle" id="ed-toc-toggle" title="折叠目录">«</button>
            </div>
            <div class="ed-toc-body" id="ed-toc-body">
              <div class="ed-toc-empty">为文内增加标题，这里将生成目录</div>
            </div>
          </aside>

          <section class="ed-paper">
            <div class="ed-draft-bar" id="ed-draft-bar" style="display:none">
              <span class="ed-draft-ic">${ui().icon('clock', 14)}</span>
              <span class="ed-draft-txt" id="ed-draft-txt">发现未保存的草稿</span>
              <button class="btn btn-soft btn-sm" id="ed-draft-restore">恢复草稿</button>
              <button class="btn btn-ghost btn-sm" id="ed-draft-discard">忽略并删除</button>
            </div>
            <input class="ed-title" id="ed-title" maxlength="100" placeholder="请输入文章标题（5～100个字）" />
            <div class="ed-title-hint" id="ed-title-hint"></div>

            <div class="ed-rich-wrap" id="ed-rich-wrap">
              <div class="ed-rich md-body" id="ed-rich" contenteditable="true" spellcheck="false"></div>
            </div>

            <div class="ed-md-wrap" id="ed-md-wrap">
              <div class="ed-md-panes" id="ed-md-panes">
                <textarea class="ed-md-src" id="ed-md-src" spellcheck="false" placeholder="## 小标题&#10;用 Markdown 写作…"></textarea>
                <div class="ed-md-preview md-body" id="ed-md-preview"></div>
              </div>
            </div>

            <div class="ed-meta">
              <label>分类
                <select id="ed-cat">${CATS.map(c => `<option ${article && article.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
              </label>
              <label>标签（逗号分隔）
                <input id="ed-tags" value="${esc(article ? (article.tags || []).join(', ') : '')}" placeholder="AI, 实战, 教程" />
              </label>
              <span class="ed-count" id="ed-count">0 字</span>
            </div>
          </section>
        </div>`;

      document.body.appendChild(root);
      document.body.classList.add('editing');

      const el = {
        title: root.querySelector('#ed-title'),
        rich: root.querySelector('#ed-rich'),
        mdSrc: root.querySelector('#ed-md-src'),
        mdPreview: root.querySelector('#ed-md-preview'),
        richWrap: root.querySelector('#ed-rich-wrap'),
        mdWrap: root.querySelector('#ed-md-wrap'),
        mdPanes: root.querySelector('#ed-md-panes'),
        toolbar: root.querySelector('#ed-toolbar'),
        tocBody: root.querySelector('#ed-toc-body'),
        count: root.querySelector('#ed-count'),
        titleHint: root.querySelector('#ed-title-hint'),
        saveState: root.querySelector('#ed-save-state'),
        cat: root.querySelector('#ed-cat'),
        tags: root.querySelector('#ed-tags'),
        draftBar: root.querySelector('#ed-draft-bar'),
        draftTxt: root.querySelector('#ed-draft-txt')
      };

      el.title.value = article ? article.title : '';
      bodyMd = article ? (article.body || '') : '';
      el.mdSrc.value = bodyMd;
      el.rich.innerHTML = mdToHtml(bodyMd);
      el.rich.setAttribute('data-synced', '1');

      /* ---------- 工具栏 ---------- */
      const TOOLS = [
        { k: 'undo', label: '撤销', icon: 'refresh' },
        { k: 'redo', label: '重做', icon: 'arrowRight' },
        { sep: true },
        { k: 'format', label: '格式', type: 'select' },
        { k: 'bold', label: '加粗', text: 'B', cls: 'ed-bold' },
        { k: 'italic', label: '斜体', text: 'I', cls: 'ed-italic' },
        { k: 'strike', label: '删除线', text: 'S', cls: 'ed-strike' },
        { k: 'color', label: '颜色', icon: 'pen' },
        { k: 'bg', label: '背景', icon: 'fileText' },
        { sep: true },
        { k: 'ul', label: '无序列表', icon: 'hash' },
        { k: 'ol', label: '有序列表', text: '1.' },
        { k: 'quote', label: '引用', text: '❝' },
        { k: 'code', label: '代码块', text: '</>' },
        { k: 'hr', label: '水平线', text: '—' },
        { sep: true },
        { k: 'table', label: '表格', icon: 'book' },
        { k: 'image', label: '图片', icon: 'upload' },
        { k: 'link', label: '链接', icon: 'link' },
        { sep: true },
        { k: 'toc', label: '目录', icon: 'bookOpen' }
      ];

      function renderToolbar() {
        if (mode === 'md') {
          el.toolbar.innerHTML = `
            <div class="ed-md-views">
              <button class="ed-view ${mdView === 'edit' ? 'on' : ''}" data-view="edit">编辑</button>
              <button class="ed-view ${mdView === 'split' ? 'on' : ''}" data-view="split">双栏</button>
              <button class="ed-view ${mdView === 'preview' ? 'on' : ''}" data-view="preview">预览</button>
            </div>
            <span class="ed-sep"></span>
            <div class="ed-tools">
              <button class="ed-tool" data-mdtool="bold" title="加粗"><span class="ed-bold">B</span></button>
              <button class="ed-tool" data-mdtool="ul" title="无序列表">≡</button>
              <button class="ed-tool" data-mdtool="quote" title="引用">❝</button>
              <button class="ed-tool" data-mdtool="code" title="代码块">&lt;/&gt;</button>
              <button class="ed-tool" data-mdtool="image" title="图片">${ui().icon('upload', 14)}</button>
              <button class="ed-tool" data-mdtool="link" title="链接">${ui().icon('link', 14)}</button>
            </div>
            <span class="ed-tool-hint">Markdown 语法：## 小标题 · **加粗** · - 列表 · > 引用 · \`\`\` 代码块</span>`;
          el.toolbar.querySelectorAll('[data-view]').forEach(b => {
            b.addEventListener('click', () => { mdView = b.dataset.view; applyMode(); });
          });
          bindMdTools();
          return;
        }
        el.toolbar.innerHTML = `
          <div class="ed-tools">
            ${TOOLS.map(t => {
              if (t.sep) return '<span class="ed-sep"></span>';
              if (t.type === 'select') {
                return `<select class="ed-format" id="ed-format">
                  <option value="p">正文</option>
                  <option value="h1">标题 1</option>
                  <option value="h2">标题 2</option>
                  <option value="h3">标题 3</option>
                  <option value="h4">标题 4</option>
                </select>`;
              }
              const content = t.text ? `<span class="${t.cls || ''}">${t.text}</span>` : ui().icon(t.icon, 14);
              return `<button class="ed-tool" data-tool="${t.k}" title="${t.label}">${content}</button>`;
            }).join('')}
          </div>`;
        bindRichTools();
      }

      function bindRichTools() {
        el.toolbar.querySelectorAll('[data-tool]').forEach(btn => {
          // 防止点击工具栏时丢失选区
          btn.addEventListener('mousedown', e => e.preventDefault());
          btn.addEventListener('click', () => runTool(btn.dataset.tool));
        });
        const fmt = el.toolbar.querySelector('#ed-format');
        if (fmt) fmt.addEventListener('change', () => {
          el.rich.focus();
          document.execCommand('formatBlock', false, fmt.value);
          onEdit();
        });
      }

      /* Markdown 工具栏：在光标处插入语法 */
      function mdSurround(prefix, suffix, placeholder) {
        const ta = el.mdSrc;
        const s = ta.selectionStart == null ? ta.value.length : ta.selectionStart;
        const e = ta.selectionEnd == null ? s : ta.selectionEnd;
        const sel = ta.value.slice(s, e) || placeholder || '文本';
        ta.value = ta.value.slice(0, s) + prefix + sel + suffix + ta.value.slice(e);
        const from = s + prefix.length;
        ta.focus();
        ta.setSelectionRange(from, from + sel.length);
        renderPreview();
        onEdit();
      }

      function mdLine(prefix) {
        const ta = el.mdSrc;
        const s = ta.selectionStart == null ? ta.value.length : ta.selectionStart;
        const lineStart = ta.value.lastIndexOf('\n', s - 1) + 1;
        ta.value = ta.value.slice(0, lineStart) + prefix + ta.value.slice(lineStart);
        ta.focus();
        const pos = s + prefix.length;
        ta.setSelectionRange(pos, pos);
        renderPreview();
        onEdit();
      }

      function mdInsertText(text) {
        const ta = el.mdSrc;
        const s = ta.selectionStart == null ? ta.value.length : ta.selectionStart;
        const e = ta.selectionEnd == null ? s : ta.selectionEnd;
        ta.value = ta.value.slice(0, s) + text + ta.value.slice(e);
        ta.focus();
        const pos = s + text.length;
        ta.setSelectionRange(pos, pos);
        renderPreview();
        onEdit();
      }

      function bindMdTools() {
        el.toolbar.querySelectorAll('[data-mdtool]').forEach(btn => {
          btn.addEventListener('mousedown', e => e.preventDefault());
          btn.addEventListener('click', () => {
            const k = btn.dataset.mdtool;
            switch (k) {
              case 'image': openImageDialog(); break;
              case 'link': {
                const url = window.prompt('链接地址（https://…）');
                if (url) mdSurround('[', `](${url})`, '链接文字');
                break;
              }
              case 'bold': mdSurround('**', '**'); break;
              case 'ul': mdLine('- '); break;
              case 'quote': mdLine('> '); break;
              case 'code': mdInsertText('\n```\n\n```\n'); break;
              default: break;
            }
          });
        });
      }

      function runTool(k) {
        el.rich.focus();
        const exec = (cmd, val) => { document.execCommand(cmd, false, val); onEdit(); };
        switch (k) {
          case 'undo': exec('undo'); break;
          case 'redo': exec('redo'); break;
          case 'bold': exec('bold'); break;
          case 'italic': exec('italic'); break;
          case 'strike': exec('strikeThrough'); break;
          case 'ul': exec('insertUnorderedList'); break;
          case 'ol': exec('insertOrderedList'); break;
          case 'quote': exec('formatBlock', 'blockquote'); break;
          case 'hr': exec('insertHorizontalRule'); break;
          case 'color': pickColor('#C0392B', c => exec('foreColor', c)); break;
          case 'bg': pickColor('#FFF3C4', c => exec('hiliteColor', c)); break;
          case 'code': exec('insertHTML', '<pre><code>// 代码</code></pre><p><br></p>'); break;
          case 'table': exec('insertHTML', '<table><tbody><tr><td>列 1</td><td>列 2</td><td>列 3</td></tr><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr></tbody></table><p><br></p>'); break;
          case 'image': openImageDialog(); break;
          case 'link': {
            const url = window.prompt('链接地址（https://…）');
            if (url) exec('createLink', url);
            break;
          }
          case 'toc': {
            const heads = el.rich.querySelectorAll('h1,h2,h3,h4');
            if (!heads.length) { ui().toast('先添加小标题，才能生成目录', 'info'); break; }
            const list = [...heads].map(h => `<p>${'　'.repeat(h.tagName[1] - 1)}${esc(h.textContent.trim())}</p>`).join('');
            exec('insertHTML', `<p><strong>目录</strong></p>${list}<p><br></p>`);
            break;
          }
          default: break;
        }
      }

      function pickColor(def, apply) {
        const colors = ['#C0392B', '#C27803', '#0F766E', '#0066FF', '#7C3AED', '#23262E'];
        const pop = document.createElement('div');
        pop.className = 'ed-color-pop';
        pop.innerHTML = colors.map(c => `<button data-c="${c}" style="background:${c}"></button>`).join('');
        const rect = el.toolbar.getBoundingClientRect();
        pop.style.left = Math.round(rect.left + 200) + 'px';
        pop.style.top = Math.round(rect.bottom + 6) + 'px';
        document.body.appendChild(pop);
        const close = () => { pop.remove(); document.removeEventListener('mousedown', outside); };
        const outside = (e) => { if (!pop.contains(e.target)) close(); };
        setTimeout(() => document.addEventListener('mousedown', outside), 0);
        pop.querySelectorAll('[data-c]').forEach(b => {
          b.addEventListener('click', () => { apply(b.dataset.c); close(); });
        });
        if (def) pop.dataset.def = def;
      }

      /* ---------- 内容同步 ---------- */
      function currentMd() {
        return mode === 'rich' ? htmlToMd(el.rich.innerHTML) : el.mdSrc.value;
      }

      function updateCount() {
        const md = currentMd();
        const n = countWords(md);
        el.count.textContent = n + ' 字';
        const tl = Array.from(el.title.value.trim()).length;
        el.titleHint.textContent = tl === 0 ? '建议 5～100 个字'
          : (tl < 5 ? `还输入 ${5 - tl} 个字` : `${tl} / 100`);
        el.titleHint.classList.toggle('warn', tl > 0 && tl < 5);
        renderToc(md);
      }

      function markDirty() {
        dirty = true;
        el.saveState.textContent = '未保存';
        el.saveState.classList.remove('saved-draft');
        el.saveState.classList.add('dirty');
        scheduleDraft();
      }

      /* ---------- 自动保存草稿 ---------- */
      let draftTimer = null;
      const draftKey = isNew ? 'new' : articleId;

      function draftPayload() {
        return {
          title: el.title.value,
          body: currentMd(),
          mode,
          category: el.cat.value,
          tags: el.tags.value,
          updatedAt: new Date().toISOString()
        };
      }

      function scheduleDraft() {
        if (draftTimer) clearTimeout(draftTimer);
        draftTimer = setTimeout(saveDraftNow, 1200);
      }

      function saveDraftNow() {
        const ok = CP.actions.saveDraft(draftKey, draftPayload());
        if (ok) {
          el.saveState.textContent = '草稿已自动保存 ' + new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
          el.saveState.classList.remove('dirty');
          el.saveState.classList.add('saved-draft');
        } else {
          el.saveState.textContent = '草稿保存失败（存储空间不足）';
          el.saveState.classList.remove('saved-draft');
          el.saveState.classList.add('dirty');
        }
        return ok;
      }

      let pendingDraft = null;
      function showDraftBar(draft) {
        pendingDraft = draft;
        const t = draft.updatedAt ? new Date(draft.updatedAt) : null;
        const when = t ? t.toLocaleString('zh-CN', { hour12: false }) : '刚才';
        el.draftTxt.textContent = `发现 ${when} 的未保存草稿（${draft.mode === 'rich' ? '富文本' : 'Markdown'}）`;
        el.draftBar.style.display = '';
      }

      function applyDraft(draft) {
        el.title.value = draft.title || '';
        if (draft.category) el.cat.value = draft.category;
        if (draft.tags != null) el.tags.value = draft.tags;
        el.mdSrc.value = draft.body || '';
        el.rich.innerHTML = mdToHtml(draft.body || '');
        el.rich.setAttribute('data-synced', '1');
        if (draft.mode && draft.mode !== mode) {
          mode = draft.mode;
          applyMode();
        } else {
          renderPreview();
          updateCount();
        }
        renderPreview();
        updateCount();
        dirty = true;
        el.saveState.textContent = '已恢复草稿（未保存）';
        el.saveState.classList.add('dirty');
      }

      root.querySelector('#ed-draft-restore').addEventListener('click', () => {
        if (!pendingDraft) return;
        applyDraft(pendingDraft);
        el.draftBar.style.display = 'none';
        pendingDraft = null;
        ui().toast('已恢复草稿，记得点击保存', 'ok');
      });
      root.querySelector('#ed-draft-discard').addEventListener('click', () => {
        CP.actions.removeDraft(draftKey);
        el.draftBar.style.display = 'none';
        pendingDraft = null;
        ui().toast('已丢弃该草稿', 'info');
      });

      /* ---------- 插入图片 ---------- */
      let savedRange = null;
      function captureRange() {
        if (mode !== 'rich') return;
        const sel = window.getSelection();
        if (sel && sel.rangeCount) savedRange = sel.getRangeAt(0).cloneRange();
      }
      function restoreRange() {
        if (!savedRange) return;
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(savedRange);
      }

      function insertImage(src, alt) {
        const text = alt || '图片';
        if (mode === 'rich') {
          el.rich.focus();
          restoreRange();
          document.execCommand('insertHTML', false, `<p><img src="${esc(src)}" alt="${esc(text)}" /></p><p><br></p>`);
          onEdit();
          return;
        }
        const ta = el.mdSrc;
        const start = ta.selectionStart == null ? ta.value.length : ta.selectionStart;
        const end = ta.selectionEnd == null ? start : ta.selectionEnd;
        const before = ta.value.slice(0, start);
        const after = ta.value.slice(end);
        const pad = before && !/\n$/.test(before) ? '\n\n' : '';
        const md = `![${text}](${src})`;
        ta.value = before + pad + md + '\n\n' + after;
        const pos = (before + pad + md).length;
        ta.focus();
        ta.setSelectionRange(pos, pos);
        renderPreview();
        onEdit();
      }

      function openImageDialog() {
        captureRange();
        const { close } = ui().openModal(`
          <div class="modal-head">
            <h3>插入图片</h3>
            <p>可上传本地图片（自动压缩）或填写图片链接。</p>
          </div>
          <div class="modal-body">
            <label class="label">上传本地图片</label>
            <input class="input" type="file" id="img-file" accept="image/*" />
            <div class="hint">JPG / PNG / WebP / GIF。宽度超过 1280 会自动等比缩小，单图压缩到约 900KB 内。</div>
            <div class="divider"></div>
            <label class="label">或填写图片链接</label>
            <input class="input" id="img-url" placeholder="https://…" />
            <label class="label" style="margin-top:10px">图片描述（可选）</label>
            <input class="input" id="img-alt" placeholder="用于无障碍与 Markdown alt" />
            <div class="hint" id="img-status"></div>
          </div>
          <div class="modal-foot">
            <button class="btn btn-ghost" data-mclose>取消</button>
            <button class="btn btn-primary" id="img-insert">插入图片</button>
          </div>`, { width: 520 });

        const modal = document.querySelector('.modal');
        const status = modal.querySelector('#img-status');
        modal.querySelector('[data-mclose]').addEventListener('click', close);
        const btn = modal.querySelector('#img-insert');

        btn.addEventListener('click', async () => {
          const file = modal.querySelector('#img-file').files[0];
          const url = modal.querySelector('#img-url').value.trim();
          const alt = modal.querySelector('#img-alt').value.trim();
          if (!file && !url) { ui().toast('请选择本地图片或填写链接', 'warn'); return; }

          if (!file) {
            if (!/^(https?:|data:image\/)/i.test(url)) { ui().toast('链接需以 http(s) 开头，或为 data:image', 'warn'); return; }
            insertImage(url, alt);
            close();
            return;
          }

          btn.disabled = true;
          btn.innerHTML = ui().icon('refresh', 15) + ' 处理中…';
          status.textContent = '正在压缩图片…';
          try {
            const out = await compressImage(file);
            insertImage(out.dataUrl, alt || file.name.replace(/\.[^.]+$/, ''));
            ui().toast(out.compressed ? '已压缩并插入图片' : '图片已插入', 'ok');
            close();
          } catch (e) {
            status.innerHTML = `<span style="color:var(--danger)">${esc(e.message || '图片处理失败')}</span>`;
            btn.disabled = false;
            btn.innerHTML = '插入图片';
          }
        });
      }

      /* 富文本被编辑：标记为未同步，避免切模式时覆盖用户改动 */
      function onEdit() {
        el.rich.removeAttribute('data-synced');
        updateCount();
        markDirty();
      }

      function renderToc(md) {
        let items;
        if (mode === 'rich') items = headingsFromRich(el.rich);
        else items = headingsFromMd(md);
        if (!items.length) {
          el.tocBody.innerHTML = '<div class="ed-toc-empty">为文内增加标题，这里将生成目录</div>';
          return;
        }
        el.tocBody.innerHTML = items.map((h, i) =>
          `<button class="ed-toc-item lv${h.level}" data-i="${i}">${esc(h.text || '未命名标题')}</button>`
        ).join('');
        el.tocBody.querySelectorAll('.ed-toc-item').forEach(btn => {
          btn.addEventListener('click', () => {
            const idx = Number(btn.dataset.i);
            if (mode === 'rich') {
              const target = el.rich.querySelectorAll('h1,h2,h3,h4')[idx];
              if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
              const line = items[idx].line;
              const value = el.mdSrc.value.split('\n');
              let pos = 0;
              for (let i = 0; i < line; i++) pos += value[i].length + 1;
              el.mdSrc.focus();
              el.mdSrc.setSelectionRange(pos, pos + value[line].length);
              const ratio = el.mdSrc.scrollHeight ? (pos / el.mdSrc.value.length) : 0;
              el.mdSrc.scrollTop = ratio * el.mdSrc.scrollHeight;
              if (mdView === 'split') renderPreview();
            }
          });
        });
      }

      function renderPreview() {
        el.mdPreview.innerHTML = mdToHtml(el.mdSrc.value || '');
      }

      /* ---------- 模式切换 ---------- */
      function applyMode() {
        root.querySelectorAll('.ed-mode').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
        if (mode === 'rich') {
          // md → rich
          if (el.rich.getAttribute('data-synced') !== '1') {
            el.rich.innerHTML = mdToHtml(el.mdSrc.value);
            el.rich.setAttribute('data-synced', '1');
          }
          el.richWrap.style.display = '';
          el.mdWrap.style.display = 'none';
        } else {
          // rich → md
          if (dirty || !el.mdSrc.value) {
            const md = htmlToMd(el.rich.innerHTML);
            if (md) el.mdSrc.value = md;
          }
          el.richWrap.style.display = 'none';
          el.mdWrap.style.display = '';
          el.mdPanes.className = 'ed-md-panes view-' + mdView;
          renderPreview();
        }
        renderToolbar();
        updateCount();
      }

      function switchMode(next) {
        if (next === mode) return;
        // 切换前把当前内容同步到另一种表示
        if (mode === 'md') {
          el.rich.innerHTML = mdToHtml(el.mdSrc.value);
          el.rich.setAttribute('data-synced', '1');
        } else if (!el.rich.hasAttribute('data-synced')) {
          el.mdSrc.value = htmlToMd(el.rich.innerHTML);
        }
        mode = next;
        applyMode();
      }

      /* ---------- 事件 ---------- */
      root.querySelectorAll('.ed-mode').forEach(b => {
        b.addEventListener('click', () => switchMode(b.dataset.mode));
      });

      el.title.addEventListener('input', () => { updateCount(); markDirty(); });
      el.mdSrc.addEventListener('input', () => {
        renderPreview();
        updateCount();
        markDirty();
      });
      el.rich.addEventListener('input', onEdit);
      document.addEventListener('keydown', escHandler);
      function escHandler(e) {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
        if (e.key === 'Escape') { close(); }
      }

      root.querySelector('#ed-toc-toggle').addEventListener('click', () => {
        root.querySelector('.ed-toc').classList.toggle('collapsed');
      });
      root.querySelector('#ed-cancel').addEventListener('click', close);
      root.querySelector('#ed-save').addEventListener('click', save);

      /* ---------- 保存 ---------- */
      function save() {
        const title = el.title.value.trim();
        const md = currentMd().trim();
        if (!title) { ui().toast('请填写文章标题', 'warn'); el.title.focus(); return; }
        if (Array.from(title).length < 5) { ui().toast('标题至少 5 个字，便于各平台检索', 'warn'); el.title.focus(); return; }
        if (!md) { ui().toast('正文不能为空', 'warn'); return; }

        const tags = el.tags.value.split(/[,，]/).map(s => s.trim()).filter(Boolean).slice(0, 5);
        const words = countWords(md);
        const patch = {
          title,
          category: el.cat.value,
          tags,
          body: md,
          html: sanitizeHtml(mode === 'rich' ? el.rich.innerHTML : mdToHtml(md)),
          editorMode: mode,
          wordCount: words,
          summary: htmlToText(mdToHtml(md)).slice(0, 60) + '……',
          readMin: Math.max(1, Math.round(words / 400))
        };

        if (isNew) {
          const created = CP.actions.addArticle({
            ...patch,
            status: '草稿',
            source: '本地编辑',
            createdAt: new Date().toISOString().slice(0, 10)
          });
          ui().toast('文章已创建', 'ok');
          done(created.id);
        } else {
          CP.actions.updateArticle(articleId, patch);
          ui().toast('文章已保存', 'ok');
          done(articleId);
        }
      }

      function done(id) {
        dirty = false;
        if (draftTimer) clearTimeout(draftTimer);
        CP.actions.removeDraft(draftKey);
        el.draftBar.style.display = 'none';
        el.saveState.textContent = '已保存';
        el.saveState.classList.remove('dirty', 'saved-draft');
        close(true);
        if (typeof opts.onSaved === 'function') opts.onSaved(id);
        else if (location.hash.includes('library') && CP.refreshPage) CP.refreshPage();
      }

      function close(force) {
        if (!force && dirty) {
          if (!window.confirm('还有未保存的修改，确定关闭吗？（草稿已自动保存，下次可恢复）')) return;
        }
        if (draftTimer) clearTimeout(draftTimer);
        document.removeEventListener('keydown', escHandler);
        root.remove();
        document.body.classList.remove('editing');
        if (typeof opts.onClose === 'function') opts.onClose();
      }

      /* 打开时若存在未保存草稿，给出恢复提示（不自动覆盖当前内容） */
      const existingDraft = CP.actions.getDraft(draftKey);
      const savedBody = article ? (article.body || '') : '';
      const savedTitle = article ? (article.title || '') : '';
      if (existingDraft && (existingDraft.body !== savedBody || existingDraft.title !== savedTitle)) {
        showDraftBar(existingDraft);
      }

      applyMode();
      updateCount();
      el.saveState.textContent = isNew ? '新文章未保存' : '已保存';
      el.saveState.classList.remove('dirty');
      dirty = false;
      setTimeout(() => el.title.focus(), 50);
    }
  };

  /* 供页面与测试复用的转换器 */
  CP.editor.mdToHtml = mdToHtml;
  CP.editor.htmlToMd = htmlToMd;
  CP.editor.sanitizeHtml = sanitizeHtml;
})();
