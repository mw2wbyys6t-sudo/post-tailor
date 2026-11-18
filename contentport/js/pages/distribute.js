/* =========================================================
   OmniDraft · 分发工作台（distribute.js）
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
    /* 载入该文章已保存的改写稿（重启应用不丢） */
    CP.actions.openRewriteFor(article.id);

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
    const scoreOf = (res) => (res.quality ? res.quality.total : res.score);
    const score = scoreOf(r);

    right.innerHTML = `
      <div class="compare-head">
        <div class="compare-tabs" id="d-tabs">
          ${tabOrder.map(id => {
            const pp = M().PLATFORMS.find(x => x.id === id);
            const s = scoreOf(results[id]);
            return `<div class="compare-tab ${id === pid ? 'active' : ''}" data-pid="${id}">
              <span class="plat-dot" style="background:${pp.color}"></span>${pp.name}
              <span class="badge" style="background:${s >= 90 ? 'var(--ok-soft)' : 'var(--amber-soft)'};color:${s >= 90 ? 'var(--ok)' : 'var(--amber)'};padding:1px 7px">${s}</span>
            </div>`;
          }).join('')}
        </div>
      </div>

      <div style="display:flex;gap:16px;align-items:center;padding:14px 20px;border-bottom:1px solid var(--border)">
        <div class="score-ring" style="color:${p.color}">
          <svg width="72" height="72">
            <circle cx="36" cy="36" r="31" fill="none" stroke="var(--surface-3)" stroke-width="7"/>
            <circle cx="36" cy="36" r="31" fill="none" stroke="${p.color}" stroke-width="7"
              stroke-linecap="round" stroke-dasharray="${score / 100 * 195} 195"/>
          </svg>
          <div class="sr-num">${score}</div>
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:15px;font-weight:700;font-family:var(--font-display);line-height:1.5">${ui().esc(r.title)}</div>
          <div style="font-size:12px;color:var(--ink-3);margin-top:5px;display:flex;gap:8px;flex-wrap:wrap">
            <span>${ui().icon('target', 12)} 适配「${r.fitted}」</span>
            <span>${ui().icon('hash', 12)} ${r.keywords.map(k => '#' + k).join(' ')}</span>
            ${r.aiGenerated ? `<span class="badge" style="background:var(--primary-soft);color:var(--primary)">${ui().icon('bot', 11)} AI 生成</span>` : `<span class="badge badge-gray">${ui().icon('gauge', 11)} 本地引擎</span>`}
          </div>
        </div>
      </div>

      <div class="rewrite-body">${ui().renderMd(r.body)}</div>

      ${r.quality ? renderQuality(r.quality) : ''}

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
        <button class="btn btn-primary" data-act="publish" data-pid="${pid}">${ui().icon('send', 15)} 发布到${p.name}</button>
        <button class="btn btn-ghost" data-act="edit-rewrite" data-pid="${pid}">${ui().icon('pen', 15)} 编辑此稿</button>
        <button class="btn btn-soft" data-act="publish-all">${ui().icon('send', 15)} 批量发布已改写平台</button>
        <button class="btn btn-ghost" data-act="copy" data-pid="${pid}">${ui().icon('copy', 15)} 复制改写稿</button>
        <button class="btn btn-ghost" data-act="download" data-pid="${pid}">${ui().icon('download', 15)} 下载稿</button>
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
    right.querySelector('[data-act="edit-rewrite"]').addEventListener('click', (e) => editRewrite(root, e.target.closest('[data-act="edit-rewrite"]').dataset.pid));
    right.querySelector('[data-act="publish-all"]').addEventListener('click', () => doPublishAll(root));
    right.querySelector('[data-act="copy"]').addEventListener('click', (e) => copyRewrite(e.target.closest('[data-act="copy"]').dataset.pid));
    right.querySelector('[data-act="download"]').addEventListener('click', (e) => downloadRewrite(e.target.closest('[data-act="download"]').dataset.pid));
    right.querySelector('[data-act="ai-deep"]').addEventListener('click', (e) => aiDeep(root, e.target.closest('[data-act="ai-deep"]').dataset.pid));
  }

  /* ---------- 智能改写 ---------- */
  async function runRewrite() {
    const root = document.getElementById('content');
    const sel = S().ui.selectedPlatforms;
    if (!sel.length) { ui().toast('请先选择目标平台', 'warn'); return; }
    const articleId = S().ui.activeArticleId;
    if (!articleId) { ui().toast('请先选择文章', 'warn'); return; }

    const aiReady = await CP.api.isAiReady();
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

  /* 账号能否自动发布：登录时已校验凭据，凭据存于系统保险库 */
  function credOkOf(pid, acc) {
    return !!(acc && acc.linked && acc.credOk !== false);
  }

  const Q_DIMS = [
    ['C', '信息保留'], ['S', '结构合规'], ['L', '长度'], ['T', '标题'],
    ['O', '原创度'], ['R', '可读性'], ['M', '平台合规']
  ];

  function renderQuality(q) {
    const color = (v) => v >= 85 ? 'var(--ok)' : (v >= 65 ? 'var(--amber)' : 'var(--danger)');
    return `
      <div class="quality-block">
        <div class="q-head">
          <span>${ui().icon('gauge', 14)} 平台质检</span>
          <span class="q-note">代理指标，不代表平台流量</span>
        </div>
        <div class="q-dims">
          ${Q_DIMS.map(([k, label]) => {
            const v = q.dims[k] || 0;
            return `<div class="q-dim">
              <span class="q-label">${label}</span>
              <span class="q-bar"><i style="width:${v}%;background:${color(v)}"></i></span>
              <b style="color:${color(v)}">${v}</b>
            </div>`;
          }).join('')}
        </div>
        ${q.issues && q.issues.length ? `
          <div class="q-issues">
            ${q.issues.slice(0, 3).map(i => `
              <div class="q-issue ${i.level === 'P0' ? 'p0' : ''}">
                <span>${ui().esc(i.msg)}</span>
                <em>${ui().esc(i.fix)}</em>
              </div>`).join('')}
          </div>` : ''}
      </div>`;
  }


  async function doPublish(root, pid) {
    const articleId = S().ui.activeArticleId;
    const r = S().ui.rewriteResults[pid];
    if (!r) return;
    const p = M().PLATFORMS.find(x => x.id === pid);
    const acc = accountOf(pid);
    // 已接入真实发布通道且凭据完整 → 自动发布；否则复制稿
    const realSupport = (window.CP.REAL_PLATFORM_IDS || []).includes(pid);
    const isXhs = pid === 'xhs'; // 小红书为浏览器全自动发布（复用登录 session 自动操作官方发布页）
    const autoMode = !!(acc && realSupport && credOkOf(pid, acc));
    const pendingMode = !!(acc && realSupport && !credOkOf(pid, acc));
    const pre = preflight(pid, r);

    ui().openModal(`
      <div class="modal-head">
        <h3>发布到 ${p.name}</h3>
        <p>「${ui().esc(r.title)}」将发布到 ${p.name}，质检分 ${r.quality ? r.quality.total : r.score}（代理指标）。</p>
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
          <div class="f-v" style="font-weight:600">${autoMode ? (isXhs ? '浏览器全自动发布（自动填写并提交，失败时回到发布页手动确认）' : '自动发布（以你的账号直接发布）') : (pendingMode ? '凭据不完整，请到账号中心重新登录' : '复制稿模式（生成排版后手动粘贴到平台编辑器）')}</div>
        </div>
        <div class="fact" style="margin-bottom:10px">
          <div class="f-l">发布前检查</div>
          <div class="f-v" style="font-weight:600">
            ${pre.blockers.length || pre.warns.length ? `
              ${pre.blockers.map(t => `<div style="color:var(--danger);font-weight:600;display:flex;gap:6px"><span>✕</span><span>${ui().esc(t)}</span></div>`).join('')}
              ${pre.warns.map(t => `<div style="color:var(--amber);display:flex;gap:6px"><span>!</span><span>${ui().esc(t)}</span></div>`).join('')}
            ` : `<span style="color:var(--ok);display:inline-flex;align-items:center;gap:6px">${ui().icon('checkCircle', 14)} 通过，未发现阻断项</span>`}
          </div>
        </div>
        <div class="fact" style="margin-bottom:10px">
          <div class="f-l">发布时间</div>
          <div class="f-v" style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;font-weight:600">
            <label style="display:inline-flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
              <input type="radio" name="pub-when" id="pub-now" checked style="accent-color:var(--primary)" /> 立即发布
            </label>
            <label style="display:inline-flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
              <input type="radio" name="pub-when" id="pub-later" style="accent-color:var(--primary)" /> 定时发布
            </label>
            <input type="datetime-local" id="pub-sched" style="display:none;padding:7px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--ink)" />
          </div>
        </div>
        <div class="hint">${autoMode
          ? (isXhs
            ? `系统将自动打开小红书官方发布页，自动填入标题与正文并点击发布；若平台拦截或改版，将回到发布页由你手动确认。`
            : `系统将以 ${ui().esc(acc.nickname)} 的身份调用 ${p.name} 发布接口。`)
          : (pendingMode
            ? `已绑定账号但凭据不完整，请到「账号中心」重新登录 ${p.name} 后自动发布。`
            : '未绑定账号时推荐使用复制稿模式，最稳定；也可以先到「账号中心」登录该平台账号后自动发布。')}</div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" data-mclose>取消</button>
        ${pre.blockers.length
          ? `<button class="btn btn-primary" disabled title="请先处理顶部的阻断项">${ui().icon('alert', 15)} 存在阻断项，无法发布</button>`
          : (autoMode
            ? `<button class="btn btn-primary" id="pub-confirm">${ui().icon('send', 15)} 确认发布</button>`
            : (pendingMode
              ? `<button class="btn btn-primary" id="pub-confirm-copy">${ui().icon('copy', 15)} 生成复制稿</button>`
              : `<button class="btn btn-primary" id="pub-go-acc">${ui().icon('user', 15)} 去登录账号</button>
                 <button class="btn btn-ghost" id="pub-confirm-copy">${ui().icon('copy', 15)} 生成复制稿</button>`))}
      </div>`, { width: 560 });

    const modal = document.querySelector('.modal');
    modal.querySelector('[data-mclose]').addEventListener('click', () => modal.closest('.modal-wrap').querySelector('[data-close]').click());

    // 立即 / 定时 切换
    const laterRadio = modal.querySelector('#pub-later');
    const schedInput = modal.querySelector('#pub-sched');
    laterRadio.addEventListener('change', () => {
      schedInput.style.display = laterRadio.checked ? 'inline-block' : 'none';
      if (laterRadio.checked && !schedInput.value) {
        // 默认 1 小时后
        const d = new Date(Date.now() + 3600 * 1000);
        schedInput.value = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      }
    });
    modal.querySelector('#pub-now').addEventListener('change', () => {
      schedInput.style.display = 'none';
    });

    const confirmBtn = modal.querySelector('#pub-confirm');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', async () => {
        if (laterRadio.checked && schedInput.value) {
          await doSchedule(modal, articleId, pid, r, p, acc, schedInput.value);
        } else {
          await doPublishNow(modal, articleId, pid, r, p, acc);
        }
      });
    }
    const copyBtn = modal.querySelector('#pub-confirm-copy');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        if (laterRadio.checked && schedInput.value) {
          await doSchedule(modal, articleId, pid, r, p, null, schedInput.value);
        } else {
          await doPublishNow(modal, articleId, pid, r, p, null);
        }
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

  /* ---------- 定时发布：加入队列 ---------- */
  async function doSchedule(modal, articleId, pid, r, p, acc, schedVal) {
    const btn = modal.querySelector('#pub-confirm, #pub-confirm-copy');
    if (!btn) return;
    btn.disabled = true;
    btn.innerHTML = ui().icon('refresh', 15) + ' 加入队列…';
    const res = await CP.api.publish({
      articleId, platformId: pid, title: r.title, body: r.body,
      accountNickname: acc ? acc.nickname : '',
      scheduledAt: schedVal,
      score: r.quality ? r.quality.total : r.score,
      algorithm: r.algorithm ? { ...r.algorithm, quality: r.quality ? r.quality.dims : null } : null
    });
    btn.innerHTML = ui().icon('check', 15) + ' 完成';
    modal.closest('.modal-wrap').querySelector('[data-close]').click();
    if (res.code === 0 && res.data && res.data.mode === 'scheduled') {
      const when = new Date(schedVal).toLocaleString('zh-CN', { hour12: false });
      ui().toast(`已加入定时发布队列：${p.name} · ${when}`, 'ok');
    } else {
      ui().toast(res.msg || '操作失败', 'warn');
    }
  }

  async function doPublishNow(modal, articleId, pid, r, p, acc) {
    const btn = modal.querySelector('#pub-confirm, #pub-confirm-copy');
    if (!btn) return;
    btn.disabled = true;
    btn.innerHTML = ui().icon('refresh', 15) + ' 发布中…';
    const res = await CP.api.publish({
      articleId, platformId: pid, title: r.title, body: r.body,
      accountNickname: acc ? acc.nickname : '',
      score: r.quality ? r.quality.total : r.score,
      algorithm: r.algorithm ? { ...r.algorithm, quality: r.quality ? r.quality.dims : null } : null
    });
    btn.innerHTML = ui().icon('check', 15) + ' 完成';
    modal.closest('.modal-wrap').querySelector('[data-close]').click();
    if (res.data.openedPage) {
      ui().toast(`已回到 ${res.data.platformName} 发布页：${(res.data.note || '请在页面确认发布')}`, 'info');
    } else if (res.data.mode === 'auto') {
      ui().toast(`已通过 ${ui().esc(acc ? acc.nickname : '你的账号')} 发布到 ${res.data.platformName}`, 'ok');
    } else if (res.data.pendingReal) {
      ui().toast(`${res.data.platformName} 凭据不完整，已生成复制稿；请到账号中心重新登录后自动发布`, 'info');
    } else {
      ui().toast(`已生成 ${res.data.platformName} 复制稿，请粘贴发布`, 'ok');
    }
  }

  /* 改写稿就地编辑：保存后重新质检，分数不再是生成时的一次性快照 */
  function requality(articleId, pid, draft) {
    const E = CP.engine;
    const article = CP.actions.getArticle(articleId);
    if (!E || !E.analysis || !article) return null;
    try {
      const analysis = E.analysis.analyze(article);
      const platform = E.strategies.getPlatform(pid);
      const plan = E.planner.buildPlan(analysis, pid, S().portrait || {});
      return E.quality.check(draft, analysis, plan, platform);
    } catch (e) {
      return null;
    }
  }

  function editRewrite(root, pid) {
    const r = S().ui.rewriteResults[pid];
    const articleId = S().ui.activeArticleId;
    if (!r || !articleId) return;
    const p = M().PLATFORMS.find(x => x.id === pid);

    ui().openModal(`
      <div class="modal-head">
        <h3>编辑 ${p.name} 改写稿</h3>
        <p>改完保存会重新质检，分数与问题清单同步更新。</p>
      </div>
      <div class="modal-body">
        <label class="label">标题</label>
        <input class="input" id="rw-title" value="${ui().esc(r.title)}" />
        <div style="display:flex;align-items:center;gap:8px;margin-top:14px">
          <span class="label" style="margin:0">正文（Markdown）</span>
          <div style="margin-left:auto;display:flex;gap:4px">
            <button class="btn btn-ghost btn-sm" data-rw-view="edit">编辑</button>
            <button class="btn btn-ghost btn-sm" data-rw-view="preview">预览</button>
          </div>
        </div>
        <textarea class="textarea" id="rw-body" rows="14" spellcheck="false">${ui().esc(r.body)}</textarea>
        <div id="rw-preview" class="md-body" style="display:none;max-height:360px;overflow:auto;border:1px solid var(--border);border-radius:10px;padding:14px;margin-top:8px"></div>
        <div class="hint" id="rw-count"></div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" data-mclose>取消</button>
        <button class="btn btn-primary" id="rw-save">${ui().icon('check', 15)} 保存并重新质检</button>
      </div>`, { width: 760 });

    const modal = document.querySelector('.modal');
    const titleEl = modal.querySelector('#rw-title');
    const bodyEl = modal.querySelector('#rw-body');
    const previewEl = modal.querySelector('#rw-preview');
    const countEl = modal.querySelector('#rw-count');
    modal.querySelector('[data-mclose]').addEventListener('click', () => modal.closest('.modal-wrap').querySelector('[data-close]').click());

    const refresh = () => {
      const chars = bodyEl.value.replace(/\s/g, '').length;
      countEl.textContent = `${chars} 字（保存前质检 ${r.score} 分）`;
      if (previewEl.style.display !== 'none') previewEl.innerHTML = ui().renderMd(bodyEl.value);
    };
    bodyEl.addEventListener('input', refresh);
    modal.querySelectorAll('[data-rw-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        const isPreview = btn.dataset.rwView === 'preview';
        previewEl.style.display = isPreview ? '' : 'none';
        bodyEl.style.display = isPreview ? 'none' : '';
        if (isPreview) previewEl.innerHTML = ui().renderMd(bodyEl.value);
      });
    });
    refresh();

    modal.querySelector('#rw-save').addEventListener('click', () => {
      const title = titleEl.value.trim();
      const body = bodyEl.value.trim();
      if (!title) { ui().toast('标题不能为空', 'warn'); return; }
      if (!body) { ui().toast('正文不能为空', 'warn'); return; }
      const before = r.score;
      const qa = requality(articleId, pid, { title, body });
      r.title = title;
      r.body = body;
      if (qa) { r.quality = qa; r.score = qa.total; }
      // 调整清单里的标题/字数也要跟着更新，否则会显示旧值
      if (Array.isArray(r.changes)) {
        r.changes.forEach(c => {
          if (c.dim === '标题') c.to = title;
          if (c.dim === '字数' && qa) {
            const target = (String(c.to).match(/（目标[^）]*）/) || [''])[0];
            c.to = qa.metrics.charCount + ' 字' + (target ? ' ' + target : '');
          }
        });
      }
      CP.actions.setRewriteResult(pid, r);
      modal.closest('.modal-wrap').querySelector('[data-close]').click();
      renderRight(root, 'idle');
      const diff = qa ? qa.total - before : 0;
      ui().toast(
        qa ? `已保存并重新质检：${qa.total} 分（${diff >= 0 ? '+' : ''}${diff}）` : '已保存改写稿',
        qa && qa.total < 70 ? 'warn' : 'ok'
      );
    });
  }

  /* 发布前检查：阻断项禁止发布，提醒项可继续 */
  function preflight(pid, r) {
    const out = { blockers: [], warns: [] };
    const E = CP.engine;
    const title = String(r.title || '');
    const body = String(r.body || '');
    const chars = body.replace(/\s/g, '').length;
    const tl = Array.from(title).length;

    if (!title.trim()) out.blockers.push('标题为空');
    if (!chars) out.blockers.push('正文为空');

    if (E && E.strategies) {
      const platform = E.strategies.getPlatform(pid);
      if (tl > platform.title.max) out.blockers.push(`标题 ${tl} 字，超过${platform.name}建议上限 ${platform.title.max} 字`);
      if (chars < platform.length.min * 0.6) out.warns.push(`正文 ${chars} 字，低于${platform.name}常见区间 ${platform.length.min}-${platform.length.max} 字`);
      if (chars > platform.length.max) out.warns.push(`正文 ${chars} 字，超过${platform.name}常见上限 ${platform.length.max} 字`);
    }
    if (pid === 'wechat' && tl > 64) out.blockers.push('微信公众号标题上限 64 字，会被截断');
    if (pid === 'xhs' && !/!\[[^\]]*\]\([^)]+\)/.test(body)) out.blockers.push('小红书是图片优先平台，正文里至少要有一张图');
    if (/data:image\//.test(body)) out.warns.push('正文含 base64 内嵌图片，部分平台发布会丢失，建议改用图片链接');
    if (pid === 'csdn' && !/```/.test(body)) out.warns.push('CSDN 技术文建议附代码块，当前没有');
    if (r.quality && r.quality.metrics && r.quality.metrics.capped) out.warns.push('质检触发硬门槛（P0 或原文数字缺失），发布前建议复核');
    return out;
  }

  /* ---------- 批量发布：把已改写平台依次发布 ---------- */
  function doPublishAll(root) {
    const articleId = S().ui.activeArticleId;
    const sel = S().ui.selectedPlatforms.filter(pid => S().ui.rewriteResults[pid]);
    if (!sel.length) { ui().toast('请先对目标平台完成智能改写', 'warn'); return; }

    const rows = sel.map(pid => {
      const p = M().PLATFORMS.find(x => x.id === pid);
      const acc = accountOf(pid);
      const auto = !!(acc && credOkOf(pid, acc));
      const pre = preflight(pid, S().ui.rewriteResults[pid]);
      return {
        pid, name: p.name, color: p.color, acc, pre,
        mode: pre.blockers.length ? '已阻断' : (auto ? (pid === 'xhs' ? '浏览器自动发布' : '自动发布') : '复制稿')
      };
    });
    const blocked = rows.filter(r => r.pre.blockers.length);
    const autoCount = rows.filter(r => r.mode !== '复制稿' && r.mode !== '已阻断').length;

    ui().openModal(`
      <div class="modal-head">
        <h3>批量发布 ${rows.length} 个平台</h3>
        <p>${autoCount} 个平台将自动发布，${rows.length - autoCount - blocked.length} 个平台生成复制稿${blocked.length ? `，${blocked.length} 个被发布前检查阻断` : ''}。发布按顺序执行，失败不影响其他平台。</p>
      </div>
      <div class="modal-body" style="padding:10px 26px 14px">
        ${rows.map(r => `
          <div class="article-row" style="cursor:default">
            <span class="dot" style="width:9px;height:9px;border-radius:50%;background:${r.color};flex:none"></span>
            <div class="ar-main"><div class="ar-title">${r.name}</div>
              <div class="ar-meta">${r.pre.blockers.length ? ui().esc(r.pre.blockers[0]) : (r.acc ? ui().esc(r.acc.nickname) : '未登录账号')}</div></div>
            <span class="badge ${r.mode === '已阻断' ? 'badge-danger' : (r.mode === '复制稿' ? 'badge-gray' : 'badge-ok')}">${r.mode}</span>
          </div>`).join('')}
        <div class="hint" style="margin-top:10px" id="bulk-status">等待开始…</div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" data-mclose>取消</button>
        <button class="btn btn-primary" id="bulk-go">${ui().icon('send', 15)} 开始发布</button>
      </div>`, { width: 560 });

    const modal = document.querySelector('.modal');
    modal.querySelector('[data-mclose]').addEventListener('click', () => modal.closest('.modal-wrap').querySelector('[data-close]').click());
    modal.querySelector('#bulk-go').addEventListener('click', async () => {
      const btn = modal.querySelector('#bulk-go');
      const status = modal.querySelector('#bulk-status');
      btn.disabled = true;
      let ok = 0, copy = 0, failed = [], skipped = [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row.pre.blockers.length) { skipped.push(row.name); continue; }
        const r = S().ui.rewriteResults[row.pid];
        status.textContent = `正在发布（${i + 1}/${rows.length}）：${row.name}…`;
        const res = await CP.api.publish({
          articleId, platformId: row.pid, title: r.title, body: r.body,
          accountNickname: row.acc ? row.acc.nickname : '',
          score: r.quality ? r.quality.total : r.score,
          algorithm: r.algorithm ? { ...r.algorithm, quality: r.quality ? r.quality.dims : null } : null
        });
        if (res.code === 0) {
          if (res.data && (res.data.mode === 'auto' || res.data.openedPage)) ok++;
          else copy++;
        } else {
          failed.push(row.name + '：' + (res.msg || '失败'));
        }
      }
      btn.disabled = false;
      btn.innerHTML = ui().icon('check', 15) + ' 完成';
      status.innerHTML = `完成：自动发布 ${ok} 个，复制稿 ${copy} 个${failed.length ? `，失败 ${failed.length} 个` : ''}${skipped.length ? `，跳过 ${skipped.length} 个（发布前检查未通过）` : ''}`;
      if (failed.length) {
        status.innerHTML += `<div style="color:var(--danger);margin-top:6px">${failed.map(f => ui().esc(f)).join('<br>')}</div>`;
      }
      ui().toast(`批量发布完成：成功 ${ok + copy}，失败 ${failed.length}`, failed.length ? 'warn' : 'ok');
      try { window.dispatchEvent(new Event('cp:history-updated')); } catch (_) { /* ignore */ }
    });
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

  /* ---------- 下载改写稿（Markdown 文件） ---------- */
  function downloadRewrite(pid) {
    const r = S().ui.rewriteResults[pid];
    if (!r) return;
    const md = `# ${r.title}\n\n${r.body}\n`;
    const safe = String(r.title).replace(/[\\/:*?"<>|\n]/g, '').slice(0, 30) || 'copy';
    ui().downloadFile(`OmniDraft-${safe}.md`, md, 'text/markdown');
    ui().toast('已下载 Markdown 改写稿', 'ok');
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
        CP.actions.openRewriteFor(row.dataset.aid);
        modal.closest('.modal-wrap').querySelector('[data-close]').click();
        CP.refreshPage();
      });
    });
    modal.querySelector('[data-mclose]').addEventListener('click', () => modal.closest('.modal-wrap').querySelector('[data-close]').click());
  }
  /* 供发布记录等页面复用发布前检查 */
  CP.preflightPublish = preflight;
})();
