/* =========================================================
   ContentPort · 分发工作台（distribute.js）
   选文章 → 选平台 → 受众自适应改写 → 对照预览 → 发布/复制
   ========================================================= */
window.CP = window.CP || {};

(function () {
  const ui = () => CP.ui;
  const S = () => CP.state;
  const M = () => CP.mock;

  let loading = false;
  let activePid = null;

  CP.registerPage('distribute', (root) => {
    const article = S().articles.find(a => a.id === S().ui.activeArticleId) || S().articles[0];
    if (!article) {
      root.innerHTML = `<div class="empty"><div class="empty-ic">${ui().icon('book', 26)}</div><h4>文章库为空</h4><p>请先导入文章再分发。</p></div>`;
      return;
    }
    if (!S().ui.activeArticleId) CP.actions.setActiveArticle(article.id);

    const sel = S().ui.selectedPlatforms;
    activePid = activePid && sel.includes(activePid) ? activePid : sel[0];

    root.innerHTML = `
      <div class="page-head fade-up">
        <div>
          <h2>分发工作台</h2>
          <p>同一篇文章，为每个平台生成「原生感」版本。</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-ghost" data-act="pick-article">${ui().icon('book', 15)} 切换文章</button>
          <button class="btn btn-primary" id="d-run" ${loading ? 'disabled' : ''}>${ui().icon('sparkles', 15)} ${loading ? '改写中…' : '智能改写'}</button>
        </div>
      </div>

      <div class="card fade-up" style="margin-bottom:16px">
        <div class="dist-toolbar">
          <span class="dt-lbl">目标平台</span>
          <div class="plat-select-group">
            ${M().PLATFORMS.map(p => `
              <span class="chip ${sel.includes(p.id) ? 'on' : ''}" data-pid="${p.id}">
                <span class="dot" style="background:${p.color}"></span>${p.name}
              </span>`).join('')}
          </div>
          <span class="hint" style="margin-left:auto">已选 ${sel.length} 个平台</span>
        </div>
      </div>

      <div class="split" style="align-items:stretch">
        <!-- 原文 -->
        <div class="card" style="display:flex;flex-direction:column">
          <div class="compare-head">
            <span class="badge badge-gray">原文</span>
            <div style="min-width:0">
              <div class="ar-title" style="font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${ui().esc(article.title)}</div>
            </div>
          </div>
          <div class="article-src" style="flex:1;display:flex;flex-direction:column">
            <div class="as-meta">
              <span>${ui().icon('fileText', 13)} ${article.category}</span>
              <span>${ui().icon('pen', 13)} ${article.wordCount} 字</span>
              <span>${ui().icon('clock', 13)} ${article.readMin} 分钟</span>
              <span class="badge ${article.status === '已发布' ? 'badge-ok' : 'badge-warn'}">${article.status}</span>
            </div>
            <div class="md-body">${ui().renderMd(article.body)}</div>
          </div>
        </div>

        <!-- 改写区 -->
        <div class="card" style="display:flex;flex-direction:column">
          <div id="d-right"></div>
        </div>
      </div>`;

    /* 事件 */
    root.querySelector('[data-act="pick-article"]').addEventListener('click', pickArticleModal);
    root.querySelector('#d-run').addEventListener('click', runRewrite);
    root.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        if (loading) return;
        CP.actions.togglePlatform(chip.dataset.pid);
        const on = S().ui.selectedPlatforms.includes(chip.dataset.pid);
        chip.classList.toggle('on', on);
        if (on) activePid = chip.dataset.pid;
        renderRight(root, 'idle');
      });
    });

    renderRight(root, loading ? 'loading' : 'idle');
  });

  /* ---------- 右侧：改写结果 / 空态 / loading ---------- */
  function renderRight(root, mode) {
    const right = root.querySelector('#d-right');
    const results = S().ui.rewriteResults;
    const sel = S().ui.selectedPlatforms;

    if (mode === 'loading') {
      right.innerHTML = `
        <div class="rewrite-loading">
          <div class="rl-spin"></div>
          <div class="rl-t">正在为 ${sel.length} 个平台生成改写稿…</div>
          <div class="rl-d">依据受众画像调整标题 / 开头 / 结构 / 语气</div>
        </div>`;
      return;
    }

    if (!sel.length) {
      right.innerHTML = `<div class="empty"><div class="empty-ic">${ui().icon('target', 26)}</div><h4>请选择目标平台</h4><p>至少选择一个平台，开始自适应改写。</p></div>`;
      return;
    }

    if (Object.keys(results).length === 0) {
      right.innerHTML = `<div class="empty" style="padding:90px 20px">
        <div class="empty-ic">${ui().icon('sparkles', 26)}</div>
        <h4>等待智能改写</h4>
        <p>点击「智能改写」，系统将基于平台受众画像，为每个平台生成独立的标题、结构与语气版本。</p>
      </div>`;
      return;
    }

    const tabOrder = sel.filter(pid => results[pid]);
    if (activePid && !tabOrder.includes(activePid)) activePid = tabOrder[0] || null;
    const pid = activePid || tabOrder[0];
    const r = results[pid];
    const p = M().PLATFORMS.find(x => x.id === pid);

    right.innerHTML = `
      <div class="compare-head">
        <div class="compare-tabs" id="d-tabs">
          ${tabOrder.map(id => {
            const pp = M().PLATFORMS.find(x => x.id === id);
            return `<div class="compare-tab ${id === pid ? 'active' : ''}" data-pid="${id}">
              <span class="plat-dot" style="background:${pp.color}"></span>${pp.name}
              <span class="badge" style="background:${results[id].score >= 90 ? 'var(--ok-soft)' : 'var(--amber-soft)'};color:${results[id].score >= 90 ? 'var(--ok)' : 'var(--amber)'};padding:1px 7px">${results[id].score}</span>
            </div>`;
          }).join('')}
        </div>
      </div>

      <div style="display:flex;gap:16px;align-items:center;padding:14px 20px;border-bottom:1px solid var(--border)">
        <div class="score-ring" style="color:${p.color}">
          <svg width="72" height="72">
            <circle cx="36" cy="36" r="31" fill="none" stroke="var(--surface-3)" stroke-width="7"/>
            <circle cx="36" cy="36" r="31" fill="none" stroke="${p.color}" stroke-width="7"
              stroke-linecap="round" stroke-dasharray="${r.score / 100 * 195} 195"/>
          </svg>
          <div class="sr-num">${r.score}</div>
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:15px;font-weight:700;font-family:var(--font-display);line-height:1.5">${ui().esc(r.title)}</div>
          <div style="font-size:12px;color:var(--ink-3);margin-top:5px;display:flex;gap:8px;flex-wrap:wrap">
            <span>${ui().icon('target', 12)} 适配「${r.fitted}」</span>
            <span>${ui().icon('hash', 12)} ${r.keywords.map(k => '#' + k).join(' ')}</span>
            ${r.aiGenerated ? `<span class="badge" style="background:var(--primary-soft);color:var(--primary)">${ui().icon('bot', 11)} AI 生成</span>` : `<span class="badge badge-gray">${ui().icon('gauge', 11)} 规则引擎</span>`}
          </div>
        </div>
      </div>

      <div class="rewrite-body">${ui().renderMd(r.body)}</div>

      <div style="border-top:1px solid var(--border);padding:14px 20px">
        <div class="label" style="display:flex;align-items:center;gap:7px">${ui().icon('sparkles', 14)} 改写调整清单</div>
        <div class="changes-list" style="margin-top:10px">
          ${r.changes.map(c => `
            <div class="change-item">
              <div class="ci-dim">${c.dim}</div>
              <div class="ci-from">${ui().esc(c.from)}</div>
              <div class="ci-to">→ ${ui().esc(c.to)}</div>
              <div class="ci-reason">${ui().icon('lightbulb', 13)} ${c.reason}</div>
            </div>`).join('')}
        </div>
      </div>

      <div class="rewrite-toolbar">
        <button class="btn btn-primary" data-act="publish" data-pid="${pid}">${ui().icon('send', 15)} 一键发布</button>
        <button class="btn btn-ghost" data-act="copy" data-pid="${pid}">${ui().icon('copy', 15)} 复制改写稿</button>
        <button class="btn btn-ghost" data-act="ai-deep" data-pid="${pid}">${ui().icon('bot', 15)} AI 深度改写</button>
        <span style="margin-left:auto;font-size:11.5px;color:var(--ink-3)">${ui().icon('checkCircle', 13)} ${r.changes.length} 处针对性调整</span>
      </div>`;

    right.querySelectorAll('#d-tabs .compare-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        activePid = tab.dataset.pid;
        renderRight(root, 'idle');
      });
    });
    right.querySelector('[data-act="publish"]').addEventListener('click', (e) => doPublish(root, e.target.closest('[data-act="publish"]').dataset.pid));
    right.querySelector('[data-act="copy"]').addEventListener('click', (e) => copyRewrite(e.target.closest('[data-act="copy"]').dataset.pid));
    right.querySelector('[data-act="ai-deep"]').addEventListener('click', (e) => aiDeep(root, e.target.closest('[data-act="ai-deep"]').dataset.pid));
  }

  /* ---------- 智能改写 ---------- */
  async function runRewrite() {
    const root = document.getElementById('content');
    const sel = S().ui.selectedPlatforms;
    if (!sel.length) { ui().toast('请先选择目标平台', 'warn'); return; }
    const articleId = S().ui.activeArticleId;
    if (!articleId) { ui().toast('请先选择文章', 'warn'); return; }

    const aiReady = !!(S().settings.ai.apiKey && S().settings.ai.baseUrl);
    loading = true;
    CP.actions.clearRewrite();
    const btn = root.querySelector('#d-run');
    btn.disabled = true;
    btn.innerHTML = ui().icon('refresh', 15) + (aiReady ? ' AI 改写中…' : ' 改写中…');
    renderRight(root, 'loading');

    const res = await CP.api.rewriteArticle(articleId, sel);
    loading = false;
    btn.disabled = false;
    btn.innerHTML = ui().icon('sparkles', 15) + (aiReady ? ' 智能改写（AI）' : ' 智能改写');

    if (res.code !== 0) { ui().toast(res.msg || '改写失败', 'warn'); renderRight(root, 'idle'); return; }
    const results = res.data;
    Object.keys(results).forEach(pid => CP.actions.setRewriteResult(pid, results[pid]));
    activePid = sel[0];
    renderRight(root, 'idle');

    if (aiReady) {
      const failCount = Object.keys(res.errors || {}).length;
      if (failCount > 0) {
        ui().toast(`AI 改写完成，${failCount} 个平台回退规则引擎（${ui().esc(Object.values(res.errors)[0])}）`, 'warn');
      } else {
        ui().toast(`AI 已为 ${sel.length} 个平台生成原生改写稿`, 'ok');
      }
    } else {
      ui().toast(`已为 ${sel.length} 个平台生成改写稿（规则引擎）`, 'ok');
    }
  }

  /* ---------- 发布 ---------- */
  function accountOf(pid) {
    const accounts = S().settings.accounts || {};
    return accounts[pid] && accounts[pid].linked ? accounts[pid] : null;
  }

  async function doPublish(root, pid) {
    const articleId = S().ui.activeArticleId;
    const r = S().ui.rewriteResults[pid];
    if (!r) return;
    const p = M().PLATFORMS.find(x => x.id === pid);
    const acc = accountOf(pid);

    ui().openModal(`
      <div class="modal-head">
        <h3>发布到 ${p.name}</h3>
        <p>「${ui().esc(r.title)}」将发布到 ${p.name}，适配度评分 ${r.score}。</p>
      </div>
      <div class="modal-body">
        <div class="fact" style="margin-bottom:10px">
          <div class="f-l">发布账号</div>
          <div class="f-v" style="font-weight:600;display:flex;align-items:center;gap:8px">
            ${acc
              ? `<span style="display:inline-flex;align-items:center;gap:7px">${ui().icon('checkCircle', 14)} ${ui().esc(acc.nickname)}（${p.name}）</span>`
              : `<span style="color:var(--amber)">${ui().icon('alert', 14)} 尚未登录 ${p.name} 账号</span>`}
          </div>
        </div>
        <div class="fact" style="margin-bottom:10px">
          <div class="f-l">发布模式</div>
          <div class="f-v" style="font-weight:600">${acc ? '自动发布（以你的账号直接发布）' : '复制稿模式（生成排版后手动粘贴到平台编辑器）'}</div>
        </div>
        <div class="hint">${acc
          ? `系统将以 ${ui().esc(acc.nickname)} 的身份调用 ${p.name} 发布接口。`
          : '未绑定账号时推荐使用复制稿模式，最稳定；也可以先到「账号中心」登录该平台账号后自动发布。'}</div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" data-mclose>取消</button>
        ${acc
          ? `<button class="btn btn-primary" id="pub-confirm">${ui().icon('send', 15)} 确认发布</button>`
          : `<button class="btn btn-primary" id="pub-go-acc">${ui().icon('user', 15)} 去登录账号</button>
             <button class="btn btn-ghost" id="pub-confirm-copy">${ui().icon('copy', 15)} 生成复制稿</button>`}
      </div>`, { width: 520 });

    const modal = document.querySelector('.modal');
    modal.querySelector('[data-mclose]').addEventListener('click', () => modal.closest('.modal-wrap').querySelector('[data-close]').click());

    const confirmBtn = modal.querySelector('#pub-confirm');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', async () => {
        await doPublishNow(modal, articleId, pid, r, p, acc);
      });
    }
    const copyBtn = modal.querySelector('#pub-confirm-copy');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        await doPublishNow(modal, articleId, pid, r, p, null);
      });
    }
    const goAcc = modal.querySelector('#pub-go-acc');
    if (goAcc) {
      goAcc.addEventListener('click', () => {
        location.hash = '#/accounts';
        modal.closest('.modal-wrap').querySelector('[data-close]').click();
      });
    }
  }

  async function doPublishNow(modal, articleId, pid, r, p, acc) {
    const btn = modal.querySelector('#pub-confirm, #pub-confirm-copy');
    if (!btn) return;
    btn.disabled = true;
    btn.innerHTML = ui().icon('refresh', 15) + ' 发布中…';
    const res = await CP.api.publish({
      articleId, platformId: pid, title: r.title, body: r.body,
      accountNickname: acc ? acc.nickname : ''
    });
    btn.innerHTML = ui().icon('check', 15) + ' 完成';
    modal.closest('.modal-wrap').querySelector('[data-close]').click();
    if (res.data.mode === 'auto') {
      ui().toast(`已通过 ${ui().esc(acc.nickname)} 发布到 ${res.data.platformName}`, 'ok');
    } else {
      ui().toast(`已生成 ${res.data.platformName} 复制稿，请粘贴发布`, 'ok');
    }
  }

  /* ---------- 复制改写稿 ---------- */
  function copyRewrite(pid) {
    const r = S().ui.rewriteResults[pid];
    if (!r) return;
    const text = `标题：${r.title}\n\n${r.body}`;
    // 模拟复制（真实实现用 navigator.clipboard）
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => ui().toast('改写稿已复制，去平台编辑器粘贴吧', 'ok'))
        .catch(() => ui().toast('已生成改写稿（请手动复制）', 'info'));
    } else {
      ui().toast('已生成改写稿', 'info');
    }
  }

  /* ---------- AI 深度改写 ---------- */
  async function aiDeep(root, pid) {
    const btn = root.querySelector(`[data-act="ai-deep"][data-pid="${pid}"]`);
    if (!btn) return;
    const old = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = ui().icon('refresh', 15) + ' 深度改写中…';
    try {
      const res = await CP.api.aiDeepRewrite(S().ui.activeArticleId, pid);
      if (res.code === 2) {
        ui().toast('未配置 AI API，可在设置中填写 Key 后使用深度改写', 'warn');
      } else if (res.code === 0) {
        renderRight(root, 'idle');
        ui().toast('AI 深度改写完成，已更新该平台版本', 'ok');
      } else {
        ui().toast(res.msg || '深度改写失败', 'warn');
      }
    } catch (e) {
      ui().toast(e.message || '深度改写失败', 'warn');
    }
    btn.disabled = false;
    btn.innerHTML = old;
  }

  /* ---------- 切换文章 ---------- */
  function pickArticleModal() {
    const articles = S().articles;
    ui().openModal(`
      <div class="modal-head">
        <h3>选择要分发的文章</h3>
        <p>将基于所选文章生成各平台版本。</p>
      </div>
      <div class="modal-body" style="padding:10px 26px 14px">
        ${articles.map(a => `
          <div class="article-row" data-aid="${a.id}" data-pick style="cursor:pointer">
            <div class="ar-main">
              <div class="ar-title">${ui().esc(a.title)}</div>
              <div class="ar-meta"><span class="tag ${CP.tagClass(a.category)}">${a.category}</span><span>${a.wordCount} 字</span></div>
            </div>
            <span class="badge ${a.status === '已发布' ? 'badge-ok' : 'badge-warn'}">${a.status}</span>
          </div>`).join('')}
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" data-mclose>取消</button>
      </div>`, { width: 620 });

    const modal = document.querySelector('.modal');
    modal.querySelectorAll('[data-pick]').forEach(row => {
      row.addEventListener('click', () => {
        CP.actions.setActiveArticle(row.dataset.aid);
        CP.actions.clearRewrite();
        modal.closest('.modal-wrap').querySelector('[data-close]').click();
        location.reload();
      });
    });
    modal.querySelector('[data-mclose]').addEventListener('click', () => modal.closest('.modal-wrap').querySelector('[data-close]').click());
  }
})();
