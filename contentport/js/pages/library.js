/* =========================================================
   ContentPort · 文章库（library.js）
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
          <p>管理你的内容资产，选择一篇去分发。支持编辑、打标签与拖拽排序。</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" data-act="import">${ui().icon('plus', 15)} 导入文章</button>
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
        wrap.innerHTML = `<div class="card empty">
          <div class="empty-ic">${ui().icon('book', 26)}</div>
          <h4>没有匹配的文章</h4>
          <p>换个关键词，或导入一篇新文章。</p>
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

  /* ================= 编辑文章弹窗 ================= */
  function editArticleModal(aid) {
    const a = CP.actions.getArticle(aid);
    if (!a) return;
    ui().openModal(`
      <div class="modal-head">
        <h3>编辑文章</h3>
        <p>修改标题、分类、标签与正文，保存后同步更新字数与摘要。</p>
      </div>
      <div class="modal-body">
        <label class="label">标题</label>
        <input class="input" id="ed-title" value="${ui().esc(a.title)}" />
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">
          <div>
            <label class="label">分类</label>
            <select class="select" id="ed-cat" style="width:100%">
              ${CATS.map(c => `<option ${c === a.category ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="label">标签（逗号分隔）</label>
            <input class="input" id="ed-tags" value="${ui().esc((a.tags || []).join(', '))}" placeholder="如：AI, 实战, 教程" />
          </div>
        </div>
        <label class="label" style="margin-top:12px">正文（Markdown）</label>
        <textarea class="textarea" id="ed-body" rows="10">${ui().esc(a.body || '')}</textarea>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" data-mclose>取消</button>
        <button class="btn btn-primary" id="ed-save">${ui().icon('check', 15)} 保存</button>
      </div>`, { width: 700 });

    const modal = document.querySelector('.modal');
    modal.querySelector('[data-mclose]').addEventListener('click', () => modal.closest('.modal-wrap').querySelector('[data-close]').click());
    modal.querySelector('#ed-save').addEventListener('click', () => {
      const title = document.getElementById('ed-title').value.trim();
      const body = document.getElementById('ed-body').value.trim();
      if (!title || !body) { ui().toast('标题与正文不能为空', 'warn'); return; }
      const wordCount = body.replace(/\s/g, '').length;
      const tags = document.getElementById('ed-tags').value.split(/[,，]/).map(s => s.trim()).filter(Boolean).slice(0, 5);
      CP.actions.updateArticle(aid, {
        title,
        category: document.getElementById('ed-cat').value,
        tags,
        body,
        wordCount: Math.max(wordCount, 300),
        summary: body.slice(0, 60) + '……',
        readMin: Math.max(1, Math.round(wordCount / 400))
      });
      ui().toast('文章已保存', 'ok');
      modal.closest('.modal-wrap').querySelector('[data-close]').click();
      renderList(rootOf('library'));
    });
  }

  /* ================= 导入文章弹窗 ================= */
  CP.importArticle = function () {
    ui().openModal(`
      <div class="modal-head">
        <h3>导入文章</h3>
        <p>粘贴标题与 Markdown 正文，系统会自动识别字数与摘要。</p>
      </div>
      <div class="modal-body">
        <label class="label">标题</label>
        <input class="input" id="imp-title" placeholder="输入文章标题…" />
        <label class="label" style="margin-top:14px">分类</label>
        <select class="select" id="imp-cat">
          ${CATS.map(c => `<option>${c}</option>`).join('')}
        </select>
        <label class="label" style="margin-top:14px">标签（逗号分隔，可选）</label>
        <input class="input" id="imp-tags" placeholder="如：AI, 实战, 教程" />
        <label class="label" style="margin-top:14px">正文（Markdown）</label>
        <textarea class="textarea" id="imp-body" rows="8" placeholder="## 章节&#10;正文内容…"></textarea>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" data-mclose>取消</button>
        <button class="btn btn-primary" id="imp-save">${ui().icon('check', 15)} 导入</button>
      </div>`, { width: 620 });

    const modal = document.querySelector('.modal');
    modal.querySelector('[data-mclose]').addEventListener('click', () => modal.closest('.modal-wrap').querySelector('[data-close]').click());
    modal.querySelector('#imp-save').addEventListener('click', async () => {
      const title = document.getElementById('imp-title').value.trim();
      const body = document.getElementById('imp-body').value.trim();
      if (!title || !body) {
        ui().toast('请填写标题与正文', 'warn');
        return;
      }
      const btn = modal.querySelector('#imp-save');
      btn.disabled = true;
      btn.innerHTML = ui().icon('refresh', 15) + ' 导入中…';
      const tags = document.getElementById('imp-tags').value.split(/[,，]/).map(s => s.trim()).filter(Boolean).slice(0, 5);
      const res = await CP.api.createArticle({
        title,
        category: document.getElementById('imp-cat').value,
        body,
        tags
      });
      ui().toast('文章已导入', 'ok');
      modal.closest('.modal-wrap').querySelector('[data-close]').click();
      // 若当前在文章库页，刷新
      if (location.hash.includes('library')) renderList(rootOf('library'));
    });
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
  };

  function rootOf(key) {
    const content = document.getElementById('content');
    return content;
  }
})();
