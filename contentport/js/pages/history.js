/* =========================================================
   ContentPort · 发布记录（history.js）
   发布历史表格：状态筛选 / 搜索 / 互动数据
   ========================================================= */
window.CP = window.CP || {};

(function () {
  const ui = () => CP.ui;
  const S = () => CP.state;
  const M = () => CP.mock;

  const STATUSES = ['全部', '已发布', '复制稿已生成', '草稿待发', '失败'];

  CP.registerPage('history', (root) => {
    root.innerHTML = `
      <div class="page-head fade-up">
        <div>
          <h2>发布记录</h2>
          <p>追踪每篇文章在各平台的分发状态与表现。</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" data-act="go-distribute">${ui().icon('send', 15)} 去分发</button>
        </div>
      </div>
      <div class="card fade-up">
        <div class="toolbar" style="margin:0;padding:16px 20px;border-bottom:1px solid var(--border)">
          <div class="toolbar-search">
            ${ui().icon('search', 16)}
            <input class="input" id="h-q" placeholder="搜索文章标题…" />
          </div>
          <select class="select" id="h-status" style="width:auto">
            ${STATUSES.map(s => `<option>${s}</option>`).join('')}
          </select>
          <button class="btn btn-ghost" data-act="refresh">${ui().icon('refresh', 14)} 刷新</button>
        </div>
        <div id="h-body" style="overflow-x:auto"></div>
      </div>`;

    root.querySelector('[data-act="go-distribute"]').addEventListener('click', () => location.hash = '#/distribute');
    root.querySelector('[data-act="refresh"]').addEventListener('click', () => renderTable(root));
    root.querySelector('#h-q').addEventListener('input', () => renderTable(root));
    root.querySelector('#h-status').addEventListener('change', () => renderTable(root));

    renderTable(root);
  });

  function renderTable(root) {
    const q = root.querySelector('#h-q').value.toLowerCase();
    const status = root.querySelector('#h-status').value;
    const list = S().history.filter(h => {
      const a = CP.actions.getArticle(h.articleId);
      const title = a ? a.title : '';
      const okQ = !q || title.toLowerCase().includes(q);
      const okS = status === '全部' || h.status === status;
      return okQ && okS;
    });

    const body = root.querySelector('#h-body');
    if (!list.length) {
      body.innerHTML = `<div class="empty" style="padding:50px 20px">
        <div class="empty-ic">${ui().icon('clock', 26)}</div>
        <h4>暂无发布记录</h4>
        <p>去分发工作台发布第一篇文章吧。</p>
      </div>`;
      return;
    }

    body.innerHTML = `
      <table class="table">
        <thead>
          <tr>
            <th>文章</th><th>平台</th><th>发布账号</th><th>状态</th><th>适配度</th>
            <th>阅读</th><th>点赞</th><th>发布时间</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${list.map(h => {
            const a = CP.actions.getArticle(h.articleId);
            const p = M().PLATFORMS.find(x => x.id === h.platformId) || { name: '未知', color: 'var(--ink-3)' };
            const stCls = h.status === '已发布' ? 'badge-ok' : h.status === '失败' ? 'badge-danger' : h.status === '草稿待发' ? 'badge-warn' : 'badge-gray';
            return `
            <tr>
              <td class="t-title" title="${ui().esc(a ? a.title : '')}">${ui().esc(a ? a.title : '(已删除)')}</td>
              <td><span style="display:inline-flex;align-items:center;gap:7px;font-weight:600"><span class="dot" style="width:9px;height:9px;border-radius:50%;background:${p.color}"></span>${p.name}</span></td>
              <td>${h.accountNickname ? `<span style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600">${ui().icon('user', 12)} ${ui().esc(h.accountNickname)}</span>` : '<span style="font-size:11.5px;color:var(--ink-4)">复制稿</span>'}</td>
              <td><span class="badge ${stCls}">${h.status}</span></td>
              <td class="t-score" style="color:${h.score >= 90 ? 'var(--ok)' : h.score >= 80 ? 'var(--amber)' : 'var(--ink-3)'}">${h.score || '—'}</td>
              <td>${ui().fmtNum(h.views)}</td>
              <td>${ui().fmtNum(h.likes)}</td>
              <td style="font-size:12px;color:var(--ink-3)">${h.time}</td>
              <td>${h.link ? `<a class="btn btn-ghost btn-sm" href="https://${h.link}" target="_blank" rel="noopener">${ui().icon('link', 13)} 查看</a>` : '<span style="font-size:11.5px;color:var(--ink-4)">—</span>'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  }
})();
