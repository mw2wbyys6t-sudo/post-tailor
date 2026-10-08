/* =========================================================
   ContentPort · 文章库（library.js）
   文章列表 / 搜索筛选 / 导入文章 / 文章详情抽屉
   ========================================================= */
window.CP = window.CP || {};

(function () {
  const ui = () => CP.ui;
  const S = () => CP.state;
  const M = () => CP.mock;

  const CATS = ['全部', '技术干货', '职场成长', '生活方式', '学习方法', '产品设计', '商业财经', '行业观察', '效率工具', '个人成长', '评测', '科普'];
  const STATUSES = ['全部', '已发布', '草稿'];

  let filter = { query: '', category: '全部', status: '全部' };

  CP.registerPage('library', (root) => {
    root.innerHTML = `
      <div class="page-head fade-up">
        <div>
          <h2>文章库</h2>
          <p>管理你的内容资产，选择一篇去分发。</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" data-act="import">${ui().icon('plus', 15)} 导入文章</button>
        </div>
      </div>
      <div class="toolbar fade-up">
        <div class="toolbar-search">
          ${ui().icon('search', 16)}
          <input class="input" id="lib-q" placeholder="搜索标题 / 摘要 / 分类…" value="${ui().esc(filter.query)}" />
        </div>
        <select class="select" id="lib-cat" style="width:auto">
          ${CATS.map(c => `<option ${c === filter.category ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
        <select class="select" id="lib-status" style="width:auto">
          ${STATUSES.map(s => `<option ${s === filter.status ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        <button class="btn btn-ghost" data-act="clear-filter">${ui().icon('x', 14)} 清空</button>
      </div>
      <div id="lib-list"></div>`;

    root.querySelector('[data-act="import"]').addEventListener('click', () => CP.importArticle());
    root.querySelector('[data-act="clear-filter"]').addEventListener('click', () => {
      filter = { query: '', category: '全部', status: '全部' };
      renderList(root);
      document.getElementById('lib-q').value = '';
      document.getElementById('lib-cat').value = '全部';
      document.getElementById('lib-status').value = '全部';
    });
    root.querySelector('#lib-q').addEventListener('input', (e) => {
      filter.query = e.target.value;
      debounce(() => renderList(root), 250);
    });
    root.querySelector('#lib-cat').addEventListener('change', (e) => {
      filter.category = e.target.value;
      renderList(root);
    });
    root.querySelector('#lib-status').addEventListener('change', (e) => {
      filter.status = e.target.value;
      renderList(root);
    });

    renderList(root);
  });

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
            <div class="card card-hover article-card" data-aid="${a.id}">
              <div class="ac-body">
                <div class="ac-meta" style="display:flex;gap:8px;margin-bottom:10px">
                  <span class="tag ${CP.tagClass(a.category)}">${a.category}</span>
                  <span class="tag tag-default">${a.source}</span>
                </div>
                <div class="ac-title">${ui().esc(a.title)}</div>
                <div class="ac-sum">${ui().esc(a.summary)}</div>
              </div>
              <div class="ac-foot">
                <span class="badge ${a.status === '已发布' ? 'badge-ok' : 'badge-warn'}">${a.status}</span>
                <span style="margin-left:auto;font-size:11.5px;color:var(--ink-3)">${a.wordCount} 字 · ${a.createdAt}</span>
                <button class="btn btn-primary btn-sm" data-aid="${a.id}" data-act="distribute">${ui().icon('send', 13)} 分发</button>
              </div>
            </div>`).join('')}
        </div>`;
      wrap.querySelectorAll('.article-card').forEach(card => {
        card.addEventListener('click', (e) => {
          if (e.target.closest('[data-act="distribute"]')) return;
          CP.openArticleDetail(card.dataset.aid);
        });
      });
      wrap.querySelectorAll('[data-act="distribute"]').forEach(btn => {
        btn.addEventListener('click', () => {
          CP.actions.setActiveArticle(btn.dataset.aid);
          location.hash = '#/distribute';
        });
      });
    });
  }

  let _t = null;
  function debounce(fn, ms) {
    clearTimeout(_t);
    _t = setTimeout(fn, ms);
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
          ${CATS.filter(c => c !== '全部').map(c => `<option>${c}</option>`).join('')}
        </select>
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
      const res = await CP.api.createArticle({ title, category: document.getElementById('imp-cat').value, body });
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
        <button class="btn btn-primary" id="d-detail-distribute">${ui().icon('send', 15)} 去分发</button>
      </div>`, { width: 720 });

    const modal = document.querySelector('.modal');
    modal.querySelector('[data-mclose]').addEventListener('click', () => modal.closest('.modal-wrap').querySelector('[data-close]').click());
    modal.querySelector('#d-detail-distribute').addEventListener('click', () => {
      CP.actions.setActiveArticle(aid);
      location.hash = '#/distribute';
      modal.closest('.modal-wrap').querySelector('[data-close]').click();
    });
  };

  function rootOf(key) {
    const content = document.getElementById('content');
    return content;
  }
})();
