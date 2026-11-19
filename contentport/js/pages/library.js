/* =========================================================
   OmniDraft · 文章库（library.js）
   文章列表 / 搜索筛选 / 导入文章 / 文章详情抽屉
   ========================================================= */
window.CP = window.CP || {};

(function () {
  const ui = () => CP.ui;
  const S = () => CP.state;
  const M = () => CP.mock;

  const CATS = ['技术干货', '职场成长', '生活方式', '学习方法', '产品设计', '商业财经', '行业观察', '效率工具', '个人成长', '评测', '科普'];
  const STATUSES = ['全部', '已发布', '草稿'];

  let filter = { query: '', categories: [], status: '全部', tag: '全部' };

  /* 汇总文章库中所有标签（去重排序） */
  function allTags() {
    const set = new Set();
    S().articles.forEach(a => (a.tags || []).forEach(t => set.add(t)));
    return [...set].sort();
  }

  CP.registerPage('library', (root) => {
    root.innerHTML = `
      <div class="page-head fade-up">
        <div>
          <h2>文章库</h2>
          <p>管理你的内容资产，选择一篇去分发。内置 Markdown / 富文本双模式编辑器，支持实时预览、目录与拖拽排序。</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" data-act="import">${ui().icon('plus', 15)} 新建 / 导入文章</button>
        </div>
      </div>
      <div class="toolbar fade-up" style="flex-wrap:wrap;gap:10px">
        <div class="toolbar-search">
          ${ui().icon('search', 16)}
          <input class="input" id="lib-q" placeholder="搜索标题 / 摘要 / 分类 / 标签…" value="${ui().esc(filter.query)}" />
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center" id="lib-cats">
          <span class="chip ${!filter.categories.length ? 'on' : ''}" data-cat="all">全部</span>
          ${CATS.map(c => `<span class="chip ${filter.categories.includes(c) ? 'on' : ''}" data-cat="${c}">${c}</span>`).join('')}
        </div>
        <select class="select" id="lib-tag" style="width:auto">
          <option>全部标签</option>
          ${allTags().map(t => `<option ${filter.tag === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
        <select class="select" id="lib-status" style="width:auto">
          ${STATUSES.map(s => `<option ${s === filter.status ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        <button class="btn btn-ghost" data-act="clear-filter">${ui().icon('x', 14)} 清空</button>
      </div>
      <div class="hint fade-up" style="margin:8px 2px 12px">拖拽卡片可调整文章排序（保存在本机）。</div>
      <div id="lib-list"></div>`;

    root.querySelector('[data-act="import"]').addEventListener('click', () => CP.importArticle());
    root.querySelector('[data-act="clear-filter"]').addEventListener('click', () => {
      filter = { query: '', categories: [], status: '全部', tag: '全部' };
      renderList(root);
      document.getElementById('lib-q').value = '';
      document.getElementById('lib-status').value = '全部';
      document.getElementById('lib-tag').value = '全部标签';
      document.querySelectorAll('#lib-cats .chip').forEach(ch => {
        ch.classList.toggle('on', ch.dataset.cat === 'all');
      });
    });
    root.querySelector('#lib-q').addEventListener('input', (e) => {
      filter.query = e.target.value;
      debounce(() => renderList(root), 250);
    });
    root.querySelectorAll('#lib-cats .chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const c = chip.dataset.cat;
        if (c === 'all') {
          filter.categories = [];
        } else {
          const i = filter.categories.indexOf(c);
          if (i >= 0) filter.categories.splice(i, 1);
          else filter.categories.push(c);
        }
        root.querySelectorAll('#lib-cats .chip').forEach(ch => {
          const isAll = ch.dataset.cat === 'all';
          ch.classList.toggle('on', isAll ? !filter.categories.length : filter.categories.includes(ch.dataset.cat));
        });
        renderList(root);
      });
    });
    root.querySelector('#lib-tag').addEventListener('change', (e) => {
      filter.tag = e.target.value;
      renderList(root);
    });
    root.querySelector('#lib-status').addEventListener('change', (e) => {
      filter.status = e.target.value;
      renderList(root);
    });

    renderList(root);
  });

  let _dragId = null;

  function renderList(root) {
    const wrap = root.querySelector('#lib-list');
    wrap.innerHTML = `<div class="article-grid">${ui().skeleton(6)}</div>`;
    CP.api.fetchArticles(filter).then(res => {
      const list = res.data;
      if (!list.length) {
        const hasAny = S().articles.length > 0;
        wrap.innerHTML = `<div class="card empty">
          <div class="empty-ic">${ui().icon('book', 26)}</div>
          <h4>${hasAny ? '没有匹配的文章' : '还没有文章'}</h4>
          <p>${hasAny ? '换个关键词，或新建一篇新文章。' : '点击右上角「新建 / 导入文章」，写下你的第一篇内容。'}</p>
        </div>`;
        return;
      }
      wrap.innerHTML = `
        <div class="article-grid stagger">
          ${list.map(a => `
            <div class="card card-hover article-card" data-aid="${a.id}" draggable="true" title="拖拽排序 / 点击查看详情">
              <div class="ac-body">
                <div class="ac-meta" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
                  <span class="tag ${CP.tagClass(a.category)}">${a.category}</span>
                  <span class="tag tag-default">${a.source}</span>
                  ${(a.tags || []).map(t => `<span class="tag tag-tag">#${ui().esc(t)}</span>`).join('')}
                </div>
                <div class="ac-title">${ui().esc(a.title)}</div>
                <div class="ac-sum">${ui().esc(a.summary)}</div>
              </div>
              <div class="ac-foot">
                <span class="badge ${a.status === '已发布' ? 'badge-ok' : 'badge-warn'}">${a.status}</span>
                <span style="margin-left:auto;font-size:11.5px;color:var(--ink-3)">${a.wordCount} 字 · ${a.createdAt}</span>
                <button class="btn btn-ghost btn-sm" data-aid="${a.id}" data-act="delete" title="删除文章">${ui().icon('trash', 13)}</button>
                <button class="btn btn-ghost btn-sm" data-aid="${a.id}" data-act="edit">${ui().icon('pen', 13)} 编辑</button>
                <button class="btn btn-primary btn-sm" data-aid="${a.id}" data-act="distribute">${ui().icon('send', 13)} 分发</button>
              </div>
            </div>`).join('')}
        </div>`;
      const cards = [...wrap.querySelectorAll('.article-card')];
      cards.forEach(card => {
        card.addEventListener('click', (e) => {
          if (e.target.closest('[data-act="distribute"]') || e.target.closest('[data-act="edit"]')) return;
          CP.openArticleDetail(card.dataset.aid);
        });
      });
      wrap.querySelectorAll('[data-act="distribute"]').forEach(btn => {
        btn.addEventListener('click', () => {
          CP.actions.setActiveArticle(btn.dataset.aid);
          location.hash = '#/distribute';
        });
      });
      wrap.querySelectorAll('[data-act="edit"]').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); editArticleModal(btn.dataset.aid); });
      });
      wrap.querySelectorAll('[data-act="delete"]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const a = CP.actions.getArticle(btn.dataset.aid);
          if (!a) return;
          const ok = await ui().confirm({
            title: '删除文章',
            message: `确定删除「${ui().esc(a.title)}」？<br><br>这篇文章的改写稿、草稿和待发布任务会一并删除；已生成的发布记录会保留，并标记为「已删除」。此操作无法撤销。`,
            confirmText: '删除',
            danger: true
          });
          if (!ok) return;
          CP.actions.deleteArticle(a.id);
          ui().toast('文章已删除', 'ok');
          renderList(root);
        });
      });
      /* 拖拽排序 */
      cards.forEach(card => {
        card.addEventListener('dragstart', (e) => {
          _dragId = card.dataset.aid;
          card.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
        });
        card.addEventListener('dragend', () => card.classList.remove('dragging'));
        card.addEventListener('dragover', (e) => { e.preventDefault(); });
        card.addEventListener('drop', (e) => {
          e.preventDefault();
          if (!_dragId || _dragId === card.dataset.aid) return;
          const ids = [...wrap.querySelectorAll('.article-card')].map(c => c.dataset.aid);
          const from = ids.indexOf(_dragId);
          const to = ids.indexOf(card.dataset.aid);
          if (from < 0 || to < 0) return;
          ids.splice(from, 1);
          ids.splice(to, 0, _dragId);
          CP.actions.reorderArticles(ids);
          _dragId = null;
          renderList(root);
        });
      });
    });
  }

  let _t = null;
  function debounce(fn, ms) {
    clearTimeout(_t);
    _t = setTimeout(fn, ms);
  }

  /* ================= 编辑 / 新建文章 ================= */
  function editArticleModal(aid) {
    CP.editor.open(aid, { onSaved: () => { if (location.hash.includes('library')) CP.refreshPage(); } });
  }

  CP.importArticle = function () {
    CP.editor.open(null, { onSaved: () => { if (location.hash.includes('library')) CP.refreshPage(); } });
  };

  /* ================= 文章详情抽屉 ================= */
  CP.openArticleDetail = function (aid) {
    const a = CP.actions.getArticle(aid);
    if (!a) return;
    const platforms = M().PLATFORMS;
    const pubHistory = S().history.filter(h => h.articleId === aid);
    ui().openModal(`
      <div class="modal-head" style="display:flex;align-items:center;gap:12px;padding-right:60px">
        <div>
          <h3>${ui().esc(a.title)}</h3>
          <p>${a.category} · ${a.wordCount} 字 · ${a.readMin} 分钟 · ${a.createdAt} · 来源 ${a.source}</p>
        </div>
      </div>
      <div class="modal-body">
        <div class="article-src" style="padding:0">
          <div class="md-body" style="max-height:340px">${ui().renderMd(a.body)}</div>
        </div>
        <div class="divider"></div>
        <div class="label" style="display:flex;align-items:center;gap:8px">${ui().icon('globe', 15)} 已分发平台</div>
        ${pubHistory.length ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
          ${pubHistory.map(h => {
            const p = platforms.find(x => x.id === h.platformId);
            return `<span class="chip on" style="background:${p.color};border-color:${p.color};cursor:default">${p.name} · ${h.status}</span>`;
          }).join('')}
        </div>` : '<div class="hint" style="margin-top:6px">尚未分发到任何平台</div>'}
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" data-mclose>关闭</button>
        <button class="btn btn-ghost" id="d-detail-export">${ui().icon('download', 15)} 导出 Markdown</button>
        <button class="btn btn-danger" id="d-detail-delete">${ui().icon('trash', 15)} 删除</button>
        <button class="btn btn-ghost" id="d-detail-edit">${ui().icon('pen', 15)} 编辑</button>
        <button class="btn btn-primary" id="d-detail-distribute">${ui().icon('send', 15)} 去分发</button>
      </div>`, { width: 720 });

    const modal = document.querySelector('.modal');
    modal.querySelector('[data-mclose]').addEventListener('click', () => modal.closest('.modal-wrap').querySelector('[data-close]').click());
    modal.querySelector('#d-detail-distribute').addEventListener('click', () => {
      CP.actions.setActiveArticle(aid);
      location.hash = '#/distribute';
      modal.closest('.modal-wrap').querySelector('[data-close]').click();
    });
    modal.querySelector('#d-detail-edit').addEventListener('click', () => {
      modal.closest('.modal-wrap').querySelector('[data-close]').click();
      editArticleModal(aid);
    });
    modal.querySelector('#d-detail-export').addEventListener('click', () => {
      const safe = String(a.title || '文章').replace(/[\\/:*?"<>|\n]/g, '').slice(0, 30) || 'article';
      ui().downloadFile(`OmniDraft-${safe}.md`, `# ${a.title}\n\n${a.body}\n`, 'text/markdown');
      ui().toast('已下载 Markdown 原文', 'ok');
    });
    modal.querySelector('#d-detail-delete').addEventListener('click', () => {
      if (!window.confirm(`确定删除「${a.title}」？\n\n改写稿、草稿和待发布任务会一并删除；已生成的发布记录会保留。此操作无法撤销。`)) return;
      CP.actions.deleteArticle(aid);
      modal.closest('.modal-wrap').querySelector('[data-close]').click();
      ui().toast('文章已删除', 'ok');
      if (location.hash.includes('library')) CP.refreshPage();
    });
  };

  function rootOf(key) {
    const content = document.getElementById('content');
    return content;
  }
})();
