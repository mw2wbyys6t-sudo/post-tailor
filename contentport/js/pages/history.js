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
      <div id="sched-panel" class="fade-up" style="margin-bottom:16px"></div>
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
          <button class="btn btn-ghost" data-act="pull-all">${ui().icon('gauge', 14)} 回拉全部数据</button>
        </div>
        <div id="h-body" style="overflow-x:auto"></div>
      </div>`;

    root.querySelector('[data-act="go-distribute"]').addEventListener('click', () => location.hash = '#/distribute');
    root.querySelector('[data-act="refresh"]').addEventListener('click', () => renderTable(root));
    root.querySelector('[data-act="pull-all"]').addEventListener('click', pullAll);
    root.querySelector('#h-q').addEventListener('input', () => renderTable(root));
    root.querySelector('#h-status').addEventListener('change', () => renderTable(root));

    renderScheduled(root);
    renderTable(root);
  });

  /* ---------- 定时发布队列面板 ---------- */
  function renderScheduled(root) {
    const panel = root.querySelector('#sched-panel');
    if (!panel) return;
    const tasks = S().scheduledPublishes.filter(t => t.status === 'pending' || t.status === 'publishing');
    if (!tasks.length) { panel.innerHTML = ''; return; }
    panel.innerHTML = `
      <div class="card">
        <div class="card-head" style="border-bottom:1px solid var(--border);padding:12px 20px">
          <h3 style="font-size:14px">${ui().icon('clock', 14)} 定时发布队列</h3>
          <span class="hint">到点自动发布到对应平台</span>
        </div>
        <div style="padding:4px 20px">
          ${tasks.map(t => {
            const p = M().PLATFORMS.find(x => x.id === t.platformId) || { name: '平台', color: '#888888' };
            return `
            <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px dashed var(--border)">
              <span class="dot" style="width:10px;height:10px;border-radius:50%;background:${p.color};flex:none"></span>
              <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${ui().esc(t.title)}</div>
                <div style="font-size:11.5px;color:var(--ink-3)">${p.name} · ${String(t.scheduledAt).replace('T', ' ')} · ${countdown(t.scheduledAt)}</div>
              </div>
              <span class="badge ${t.status === 'publishing' ? 'badge-warn' : 'badge-gray'}">${t.status === 'publishing' ? '发布中…' : '等待中'}</span>
              ${t.status === 'pending' ? `<button class="btn btn-ghost btn-sm" data-cancel="${t.id}">${ui().icon('x', 13)} 取消</button>` : ''}
            </div>`;
          }).join('')}
        </div>
      </div>`;
    panel.querySelectorAll('[data-cancel]').forEach(btn => {
      btn.addEventListener('click', () => {
        CP.actions.removeScheduled(btn.dataset.cancel);
        renderScheduled(root);
        ui().toast('已取消定时任务', 'info');
      });
    });
  }

  function countdown(iso) {
    const diff = new Date(iso).getTime() - Date.now();
    if (diff <= 0) return '即将执行';
    const m = Math.floor(diff / 60000);
    if (m < 60) return `${Math.max(1, m)} 分钟后`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} 小时 ${m % 60} 分后`;
    return `${Math.floor(h / 24)} 天后`;
  }

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
            <th>阅读</th><th>点赞</th><th>评论</th><th>发布时间</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${list.map(h => {
            const a = CP.actions.getArticle(h.articleId);
            const p = M().PLATFORMS.find(x => x.id === h.platformId) || { name: '未知', color: 'var(--ink-3)' };
            const stCls = h.status === '已发布' ? 'badge-ok' : h.status === '失败' ? 'badge-danger' : h.status === '草稿待发' ? 'badge-warn' : 'badge-gray';
            const canPull = !!(h.postId || h.publishId) && h.platformId !== 'xhs';
            const statusText = h.remoteStatus ? `${h.status} · ${h.remoteStatus}` : h.status;
            const href = h.link ? (h.link.startsWith('http') ? h.link : 'https://' + h.link) : '';
            return `
            <tr>
              <td class="t-title" title="${ui().esc(a ? a.title : '')}">${ui().esc(a ? a.title : '(已删除)')}</td>
              <td><span style="display:inline-flex;align-items:center;gap:7px;font-weight:600"><span class="dot" style="width:9px;height:9px;border-radius:50%;background:${p.color}"></span>${p.name}</span></td>
              <td>${h.accountNickname ? `<span style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600">${ui().icon('user', 12)} ${ui().esc(h.accountNickname)}</span>` : '<span style="font-size:11.5px;color:var(--ink-4)">复制稿</span>'}</td>
              <td><span class="badge ${stCls}">${statusText}</span></td>
              <td class="t-score" style="color:${h.score >= 90 ? 'var(--ok)' : h.score >= 80 ? 'var(--amber)' : 'var(--ink-3)'}">${h.score || '—'}</td>
              <td>${ui().fmtNum(h.views)}</td>
              <td>${ui().fmtNum(h.likes)}</td>
              <td>${ui().fmtNum(h.comments)}</td>
              <td style="font-size:12px;color:var(--ink-3)">${h.time}${h.lastSync ? `<div style="font-size:11px;color:var(--ink-4)">${h.lastSync} 更新</div>` : ''}</td>
              <td>
                <div style="display:flex;gap:6px;align-items:center;justify-content:flex-end">
                  ${(h.series && h.series.length > 1) ? `<button class="btn btn-ghost btn-sm" data-trend="${h.id}">${ui().icon('activity', 12)} 趋势</button>` : ''}
                  ${canPull ? `<button class="btn btn-ghost btn-sm" data-stats="${h.id}">${ui().icon('refresh', 12)} 回拉数据</button>` : ''}
                  ${h.copyContent ? `<button class="btn btn-ghost btn-sm" data-export="${h.id}">${ui().icon('download', 12)} 导出</button>` : ''}
                  ${h.link ? `<a class="btn btn-ghost btn-sm" href="${href}" target="_blank" rel="noopener">${ui().icon('link', 13)} 查看</a>` : ''}
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;

    body.querySelectorAll('[data-stats]').forEach(btn => {
      btn.addEventListener('click', () => pullStats(root, btn.dataset.stats, btn));
    });
    body.querySelectorAll('[data-trend]').forEach(btn => {
      btn.addEventListener('click', () => showTrend(btn.dataset.trend));
    });
    body.querySelectorAll('[data-export]').forEach(btn => {
      btn.addEventListener('click', () => exportCopy(btn.dataset.export));
    });
  }

  /* ---------- 趋势弹窗（纯 SVG 折线图） ---------- */
  function showTrend(id) {
    const h = S().history.find(x => x.id === id);
    if (!h || !h.series || h.series.length < 2) { ui().toast('趋势数据不足，请多次回拉后再查看', 'warn'); return; }
    const p = M().PLATFORMS.find(x => x.id === h.platformId) || { name: '平台', color: '#888888' };
    const s = h.series;
    const labels = s.map(x => x.t);
    ui().openModal(`
      <div class="modal-head">
        <h3>${p.name} · 数据趋势</h3>
        <p>最近 ${s.length} 次回拉的阅读 / 点赞 / 评论变化。</p>
      </div>
      <div class="modal-body">
        <div class="label">阅读量</div>
        ${ui().lineChart({ points: s.map(x => x.views), labels, color: p.color, height: 170 })}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:16px">
          <div class="card" style="padding:12px">
            <div class="label">点赞</div>
            ${ui().lineChart({ points: s.map(x => x.likes), labels, color: '#E8A33D', height: 120, fill: false })}
          </div>
          <div class="card" style="padding:12px">
            <div class="label">评论</div>
            ${ui().lineChart({ points: s.map(x => x.comments), labels, color: '#4D8DFF', height: 120, fill: false })}
          </div>
        </div>
        <div class="hint" style="margin-top:14px">最新：阅读 ${ui().fmtNum(h.views)} · 点赞 ${ui().fmtNum(h.likes)} · 评论 ${ui().fmtNum(h.comments)}（${h.lastSync ? h.lastSync + ' 更新' : '尚未回拉'}）</div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" data-mclose>关闭</button>
      </div>`, { width: 620 });
    const modal = document.querySelector('.modal');
    modal.querySelector('[data-mclose]').addEventListener('click', () => modal.closest('.modal-wrap').querySelector('[data-close]').click());
  }

  /* ---------- 复制稿导出为 Markdown 文件 ---------- */
  function exportCopy(id) {
    const h = S().history.find(x => x.id === id);
    if (!h || !h.copyContent) { ui().toast('该记录没有可导出的复制稿', 'warn'); return; }
    const a = CP.actions.getArticle(h.articleId);
    const title = h.copyContent.title || (a && a.title) || '未命名文章';
    const md = `# ${title}\n\n${h.copyContent.body || (a && a.body) || ''}\n`;
    const safeName = String(title).replace(/[\\/:*?"<>|\n]/g, '').slice(0, 30) || 'copy';
    ui().downloadFile(`ContentPort-${safeName}.md`, md, 'text/markdown');
    ui().toast('复制稿已导出为 Markdown 文件', 'ok');
  }

  /* ---------- 单条数据回拉 ---------- */
  async function doPull(h) {
    const res = await CP.api.fetchStats({ platformId: h.platformId, postId: h.postId || h.publishId });
    if (res.code !== 0) return { ok: false, msg: res.msg || '回拉失败' };
    const d = res.data;
    const patch = {
      views: Number(d.views) || 0,
      likes: Number(d.likes) || 0,
      comments: Number(d.comments) || 0,
      series: CP.api.snapshotSeries(h, d),
      lastSync: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    };
    if (d.status) patch.remoteStatus = d.status;
    CP.actions.updateHistory(h.id, patch);
    return { ok: true, status: d.status, msg: '' };
  }

  /* ---------- 批量回拉全部可回拉的记录 ---------- */
  async function pullAll() {
    const root = document.getElementById('content');
    const btn = root.querySelector('[data-act="pull-all"]');
    btn.disabled = true;
    const old = btn.innerHTML;
    btn.innerHTML = ui().icon('refresh', 14) + ' 回拉中…';
    const r = await CP.api.pullAllStats();
    btn.disabled = false;
    btn.innerHTML = old;
    renderTable(root);
    if (r.total === 0) { ui().toast('没有可回拉数据的记录', 'info'); return; }
    if (r.fail) {
      ui().toast(`回拉完成：${r.updated} 条成功，${r.fail} 条失败（${ui().esc(r.firstFail)}）`, 'warn');
    } else {
      ui().toast(`已回拉 ${r.updated} 条记录的数据`, 'ok');
    }
  }

  /* ---------- 自动回拉完成后，若正停留在本页则刷新表格 ---------- */
  window.addEventListener('cp:stats-updated', () => {
    if (document.body.dataset.page === 'history') {
      const content = document.getElementById('content');
      if (content && content.querySelector('#h-body')) renderTable(content);
    }
  });

  /* ---------- 定时任务状态变化后刷新队列面板 ---------- */
  window.addEventListener('cp:sched-updated', () => {
    if (document.body.dataset.page === 'history') {
      const content = document.getElementById('content');
      if (content && content.querySelector('#sched-panel')) renderScheduled(content);
    }
  });

  /* ---------- 回拉单条平台数据 ---------- */
  async function pullStats(root, id, btn) {
    const h = S().history.find(x => x.id === id);
    if (!h) return;
    const p = M().PLATFORMS.find(x => x.id === h.platformId) || { name: '平台' };
    btn.disabled = true;
    const old = btn.innerHTML;
    btn.innerHTML = ui().icon('refresh', 12) + ' 回拉中…';
    const r = await doPull(h);
    if (r.ok) {
      renderTable(root);
      ui().toast(`已回拉 ${p.name} 数据` + (r.status ? `：${r.status}` : ''), 'ok');
    } else {
      ui().toast(r.msg, 'warn');
      btn.disabled = false;
      btn.innerHTML = old;
    }
  }
})();
