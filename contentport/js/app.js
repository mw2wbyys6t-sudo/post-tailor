/* =========================================================
   OmniDraft · 应用外壳 + 路由（app.js）
   冻结的 App Shell：侧边栏 + 顶栏 + 内容槽（SPA，一次性注入）
   ========================================================= */
window.CP = window.CP || {};

(function () {
  const ui = () => CP.ui;
  const S = () => CP.state;
  const M = () => CP.mock;

  /* ---------- 冻结导航 ---------- */
  const NAV = [
    { key: 'dashboard', label: '工作台', icon: 'dashboard', crumb: '总览与快捷入口' },
    { key: 'profile', label: '用户画像', icon: 'user', crumb: '问答式自画像' },
    { key: 'library', label: '文章库', icon: 'book', crumb: '内容资产管理' },
    { key: 'audience', label: '受众嗅探', icon: 'radar', crumb: '平台受众分析' },
    { key: 'distribute', label: '分发工作台', icon: 'send', crumb: '自适应改写与发布' },
    { key: 'accounts', label: '账号中心', icon: 'key', crumb: '平台账号登录与绑定' },
    { key: 'history', label: '发布记录', icon: 'clock', crumb: '发布历史与数据' }
  ];

  /* ---------- 应用外壳 ---------- */
  function renderShell() {
    const app = document.getElementById('app');
    const userName = S().portrait ? S().portrait.nickname || '创作者' : '未创建画像';
    const userSub = S().portrait ? (S().portrait.domainLabels || ['内容创作者']).join(' · ') : '点击创建你的自画像';

    app.innerHTML = `
      <div class="app-shell">
        <aside class="sidebar">
          <div class="brand">
            <div class="brand-logo">${ui().icon('send', 19)}</div>
            <div>
              <div class="brand-name">OmniDraft</div>
              <div class="brand-sub">一 稿 千 面 · 多 端 分 发</div>
            </div>
          </div>
          <nav class="nav">
            <div class="nav-label">内容分发</div>
            ${NAV.map(n => `
              <a href="#/${n.key}" data-nav="${n.key}">
                ${ui().icon(n.icon, 18)}<span>${n.label}</span>
              </a>`).join('')}
          </nav>
          <div class="sidebar-foot">
            <div class="sidebar-avatar">${(userName[0] || '创').toUpperCase()}</div>
            <div class="sidebar-user">
              <div class="u1">${ui().esc(userName)}</div>
              <div class="u2">${ui().esc(userSub)}</div>
            </div>
            <button class="btn btn-ghost btn-sm" data-act="settings" title="设置">${ui().icon('settings', 15)}</button>
          </div>
          <div class="sidebar-ver"><span>v1.4.0</span><span>离线优先</span></div>
        </aside>
        <div class="main">
          <header class="topbar">
            <div>
              <div class="topbar-title" id="tb-title">工作台</div>
              <div class="topbar-crumb" id="tb-crumb">总览与快捷入口</div>
            </div>
            <div class="topbar-right">
              <span class="badge" id="sniff-badge" style="cursor:pointer" data-act="goto-audience">
                ${S().sniffDone ? ui().icon('checkCircle', 13) + ' 画像已生成' : ui().icon('radar', 13) + ' 未生成画像'}
              </span>
              <button class="btn btn-primary btn-sm" data-act="goto-distribute">${ui().icon('send', 14)} 去分发</button>
            </div>
          </header>
          <main class="content" id="content"></main>
        </div>
      </div>`;
    bindShell();
  }

  function bindShell() {
    const app = document.getElementById('app');
    app.querySelector('[data-act="settings"]').addEventListener('click', openSettings);
    app.querySelector('[data-act="goto-audience"]').addEventListener('click', () => location.hash = '#/audience');
    app.querySelector('[data-act="goto-distribute"]').addEventListener('click', () => location.hash = '#/distribute');
  }

  /* ---------- 路由 ---------- */
  function currentRoute() {
    const hash = location.hash.replace(/^#\//, '') || 'dashboard';
    const [key] = hash.split('?');
    return NAV.find(n => n.key === key) ? key : 'dashboard';
  }

  function render() {
    const key = currentRoute();
    const nav = NAV.find(n => n.key === key);
    document.body.dataset.page = key;
    document.getElementById('tb-title').textContent = nav.label;
    document.getElementById('tb-crumb').textContent = nav.crumb;

    document.querySelectorAll('.nav a').forEach(a => {
      a.classList.toggle('active', a.dataset.nav === key);
    });

    const content = document.getElementById('content');
    const pageFn = CP.getPage(key);
    if (pageFn) {
      pageFn(content, { key });
    } else {
      content.innerHTML = '<div class="empty"><div class="empty-ic"></div><h4>页面不存在</h4></div>';
    }
    window.scrollTo({ top: 0 });
  }

  /* ---------- 嗅探状态徽章 ---------- */
  CP.updateSniffBadge = function () {
    const b = document.querySelector('#sniff-badge');
    if (!b) return;
    b.innerHTML = S().sniffDone
      ? ui().icon('checkCircle', 13) + ' 画像已生成'
      : ui().icon('radar', 13) + ' 未生成画像';
  };

  /* ---------- 本地存储占用（图片以 base64 存在 localStorage，容易接近上限） ---------- */
  function storageBytes() {
    let total = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        const v = localStorage.getItem(k) || '';
        total += (String(k).length + v.length) * 2; // UTF-16
      }
    } catch (_) { /* ignore */ }
    return total;
  }

  function fmtBytes(n) {
    if (n >= 1024 * 1024) return (n / 1048576).toFixed(1) + ' MB';
    if (n >= 1024) return Math.round(n / 1024) + ' KB';
    return n + ' B';
  }

  /* ---------- 设置弹窗（AI Key 存入系统钥匙串） ---------- */
  async function openSettings() {
    const s = S().settings;
    const ap = s.autoPull || { enabled: true, interval: 30 };
    const aiUsage = CP.actions.aiPolishUsage();
    const secureMode = CP.vault.mode ? CP.vault.mode() : 'keychain';
    const secureText = secureMode === 'keychain' ? '系统钥匙串加密保存' : '浏览器预览：仅本次会话有效';
    const usedBytes = storageBytes();
    const storageWarn = usedBytes > 3.5 * 1024 * 1024;
    let keyStored = false;
    try { keyStored = !!(await CP.vault.getRaw('ai:key')); } catch (_) { keyStored = false; }
    ui().openModal(`
      <div class="modal-head">
        <h3>设置</h3>
        <p>${secureMode === 'keychain' ? 'AI Key 与平台凭据存入系统钥匙串，明文不落盘' : '浏览器预览模式下 AI Key 仅保存在内存，关闭页面即失效'}；平台账号请在「账号中心」登录。</p>
      </div>
      <div class="modal-body">
        <div class="label" style="display:flex;align-items:center;gap:7px">${ui().icon('bot', 14)} AI 服务（OpenAI 兼容）</div>
        <div class="hint" style="margin-top:6px">已预置 DeepSeek（deepseek-chat）。填入 API Key 即可使用「AI 润色」，每天 20 次。Key ${secureText}。</div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:10px">
          <label class="label" style="margin:0">Base URL</label>
          <button class="btn btn-ghost btn-sm" id="set-deepseek" style="margin-left:auto">${ui().icon('zap', 12)} 使用 DeepSeek</button>
        </div>
        <input class="input" id="set-base" placeholder="https://api.deepseek.com" value="${ui().esc(s.ai.baseUrl)}" />
        <label class="label" style="margin-top:12px">API Key</label>
        <input class="input" id="set-key" type="password" placeholder="${keyStored ? (secureMode === 'keychain' ? '已保存（留空则不修改）' : '已保存（仅本次会话）') : 'sk-...'}" value="" />
        <label class="label" style="margin-top:12px">模型名称</label>
        <input class="input" id="set-model" placeholder="deepseek-chat" value="${ui().esc(s.ai.model)}" />
        <div style="display:flex;align-items:center;gap:10px;margin-top:10px">
          <button class="btn btn-soft btn-sm" id="set-test">${ui().icon('zap', 13)} 测试连接</button>
          <span class="hint" id="set-test-msg" style="margin-top:0">${keyStored ? (secureMode === 'keychain' ? 'Key 已加密保存' : 'Key 仅本次会话有效') : '尚未保存 Key'}</span>
        </div>
        <div class="hint" id="set-ai-usage" style="margin-top:8px">今日 AI 润色（本机账号）：已用 ${aiUsage.used}/${aiUsage.limit} 次，剩余 ${aiUsage.remaining} 次</div>
        <div class="divider"></div>
        <div class="label" style="display:flex;align-items:center;gap:7px">${ui().icon('clock', 14)} 数据自动回拉</div>
        <div style="display:flex;align-items:center;gap:10px;margin-top:8px">
          <input type="checkbox" id="ap-enabled" ${ap.enabled ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--primary)" />
          <label for="ap-enabled" style="font-size:13px;cursor:pointer">定时自动更新各平台发布数据的阅读 / 点赞 / 评论</label>
        </div>
        <div style="display:flex;align-items:center;gap:10px;margin-top:10px">
          <label class="label" style="margin:0">回拉间隔</label>
          <select class="select" id="ap-interval" style="width:auto">
            ${[15, 30, 60, 180].map(m => `<option value="${m}" ${(ap.interval || 30) === m ? 'selected' : ''}>每 ${m} 分钟</option>`).join('')}
          </select>
          <span class="hint" style="margin:0">关闭开关可立即停止自动回拉</span>
        </div>
        <div class="divider"></div>
        <div class="label" style="display:flex;align-items:center;gap:7px">${ui().icon('download', 14)} 数据备份</div>
        <div class="hint" style="margin-top:6px">导出文章库、发布记录、改写稿与画像为一个 JSON 文件；不含 AI Key 与平台凭据，恢复后需重新登录。</div>
        <div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap">
          <button class="btn btn-soft btn-sm" id="set-export">${ui().icon('download', 13)} 导出备份</button>
          <button class="btn btn-ghost btn-sm" id="set-import">${ui().icon('upload', 13)} 导入备份</button>
          <input type="file" id="set-import-file" accept="application/json,.json" style="display:none" />
        </div>
        <div class="divider"></div>
        <div class="label" style="display:flex;align-items:center;gap:7px">${ui().icon('gauge', 14)} 本地存储</div>
        <div class="hint" id="set-storage" style="margin-top:6px;color:${storageWarn ? 'var(--amber)' : ''}">
          已用约 ${fmtBytes(usedBytes)}（浏览器上限约 5 MB）。图片以 base64 内嵌，占用较大。
        </div>
        <div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" id="set-clear-drafts">${ui().icon('trash', 13)} 清理编辑器草稿</button>
          ${CP.actions.hasDemoData() ? `<button class="btn btn-ghost btn-sm" id="set-clear-demo">${ui().icon('trash', 13)} 清理演示数据</button>` : ''}
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" data-mclose>取消</button>
        <button class="btn btn-primary" id="set-save">${ui().icon('check', 15)} 保存配置</button>
      </div>`, { width: 620 });

    const modal = document.querySelector('.modal');
    modal.querySelector('[data-mclose]').addEventListener('click', () => modal.closest('.modal-wrap').querySelector('[data-close]').click());

    modal.querySelector('#set-deepseek').addEventListener('click', () => {
      modal.querySelector('#set-base').value = 'https://api.deepseek.com';
      modal.querySelector('#set-model').value = 'deepseek-chat';
      modal.querySelector('#set-test-msg').textContent = '已填入 DeepSeek 推荐配置，填好 Key 后点「测试连接」';
    });

    modal.querySelector('#set-test').addEventListener('click', async () => {
      const btn = modal.querySelector('#set-test');
      const msg = modal.querySelector('#set-test-msg');
      btn.disabled = true;
      msg.textContent = '测试中…';
      // 先把当前输入写入保险库再测试（Key 不写 localStorage）
      const keyInput = document.getElementById('set-key').value.trim();
      try {
        if (keyInput) await CP.vault.setAiKey(keyInput);
      } catch (e) {
        msg.innerHTML = `<span style="color:var(--danger)">${ui().icon('x', 12)} ${ui().esc(e.message || '安全存储不可用')}</span>`;
        btn.disabled = false;
        return;
      }
      CP.actions.saveSettings({
        ai: {
          baseUrl: document.getElementById('set-base').value.trim(),
          apiKey: '',
          model: document.getElementById('set-model').value.trim()
        },
        autoPull: collectAutoPull()
      });
      try {
        const res = await CP.api.aiPing();
        if (res.code === 0) {
          msg.innerHTML = `<span style="color:var(--ok)">${ui().icon('checkCircle', 12)} ${res.msg}（${res.costMs}ms）</span>`;
        } else {
          msg.innerHTML = `<span style="color:var(--amber)">${ui().icon('flame', 12)} ${ui().esc(res.msg)}</span>`;
        }
      } catch (e) {
        msg.innerHTML = `<span style="color:var(--danger)">${ui().icon('x', 12)} ${ui().esc(e.message || '连接失败')}</span>`;
      }
      btn.disabled = false;
    });

    modal.querySelector('#set-save').addEventListener('click', async () => {
      const keyInput = document.getElementById('set-key').value.trim();
      try {
        if (keyInput) await CP.vault.setAiKey(keyInput);
      } catch (e) {
        ui().toast(e.message || '安全存储不可用，Key 未保存', 'warn');
        return;
      }
      CP.actions.saveSettings({
        ai: {
          baseUrl: document.getElementById('set-base').value.trim(),
          apiKey: '',
          model: document.getElementById('set-model').value.trim()
        },
        autoPull: collectAutoPull()
      });
      ui().toast(secureMode === 'keychain' ? '配置已保存（AI Key 存入系统钥匙串）' : '配置已保存（浏览器预览模式下 Key 仅本次会话有效）', 'ok');
      modal.closest('.modal-wrap').querySelector('[data-close]').click();
      restartAutoPull();
    });

    /* 数据备份 / 恢复 */
    modal.querySelector('#set-export').addEventListener('click', () => {
      const stamp = new Date().toISOString().slice(0, 10);
      ui().downloadFile(`OmniDraft-backup-${stamp}.json`, CP.actions.exportAll(), 'application/json');
      ui().toast('备份已导出（不含密钥）', 'ok');
    });
    const importFile = modal.querySelector('#set-import-file');
    modal.querySelector('#set-import').addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', () => {
      const file = importFile.files && importFile.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          if (!window.confirm('导入备份会覆盖当前所有文章、发布记录、改写稿与画像，且无法撤销。\n\n建议先「导出备份」保留现有数据。确定继续？')) return;
          const r = CP.actions.importAll(String(reader.result));
          ui().toast(`已恢复：${r.articles} 篇文章、${r.history} 条记录`, 'ok');
          modal.closest('.modal-wrap').querySelector('[data-close]').click();
          renderShell();
          render();
        } catch (e) {
          ui().toast(e.message || '导入失败', 'warn');
        }
      };
      reader.readAsText(file);
    });

    /* 本地存储清理 */
    function refreshStorageHint() {
      const el = modal.querySelector('#set-storage');
      if (!el) return;
      const b = storageBytes();
      el.textContent = `已用约 ${fmtBytes(b)}（浏览器上限约 5 MB）。图片以 base64 内嵌，占用较大。`;
      el.style.color = b > 3.5 * 1024 * 1024 ? 'var(--amber)' : '';
    }

    modal.querySelector('#set-clear-drafts').addEventListener('click', async () => {
      const ok = await ui().confirm({
        title: '清理编辑器草稿',
        message: '将删除所有未保存的编辑器草稿，已保存的文章不受影响。确定继续？',
        confirmText: '清理',
        danger: true,
        stack: true
      });
      if (!ok) return;
      CP.actions.clearAllDrafts();
      refreshStorageHint();
      ui().toast('已清理编辑器草稿', 'ok');
    });

    const clearDemoBtn = modal.querySelector('#set-clear-demo');
    if (clearDemoBtn) {
      clearDemoBtn.addEventListener('click', async () => {
        const ok = await ui().confirm({
          title: '清理演示数据',
          message: '将删除内置的演示文章与发布记录，你自己创建的内容不受影响。确定继续？',
          confirmText: '清理',
          danger: true,
          stack: true
        });
        if (!ok) return;
        CP.actions.clearDemoData();
        refreshStorageHint();
        clearDemoBtn.remove();
        renderShell();
        render();
        ui().toast('已清理演示数据', 'ok');
      });
    }

    function collectAutoPull() {
      return {
        enabled: !!modal.querySelector('#ap-enabled').checked,
        interval: parseInt(modal.querySelector('#ap-interval').value, 10) || 30
      };
    }
  }

  /* ---------- 自动定时回拉 ---------- */
  let autoPullTimer = null;
  let autoPullFirstDelay = null;

  function restartAutoPull() {
    if (autoPullTimer) { clearInterval(autoPullTimer); autoPullTimer = null; }
    if (autoPullFirstDelay) { clearTimeout(autoPullFirstDelay); autoPullFirstDelay = null; }
    const ap = S().settings.autoPull || {};
    // 未配置过（老版本存档）默认开启；显式关闭才停止
    if (ap.enabled === false) return;
    const mins = Math.max(5, ap.interval || 30);

    // 启动后延迟执行一次（给页面与登录态就绪时间），之后按间隔执行
    autoPullFirstDelay = setTimeout(() => runAutoPullOnce(), 2 * 60 * 1000);
    autoPullTimer = setInterval(runAutoPullOnce, mins * 60 * 1000);
  }

  async function runAutoPullOnce() {
    const r = await CP.api.pullAllStats();
    if (r.total === 0) return;
    if (r.updated > 0) {
      ui().toast(`已自动更新 ${r.updated} 条发布数据` + (r.fail ? `，${r.fail} 条失败` : ''), r.fail ? 'warn' : 'info');
    } else if (r.fail > 0) {
      ui().toast(`自动回拉：${r.fail} 条记录更新失败（${ui().esc(r.firstFail)}）`, 'warn');
    }
  }

  /* ---------- 定时发布调度器（每 30 秒检查一次到期任务） ---------- */
  let schedTimer = null;
  function initScheduler() {
    if (schedTimer) return;
    schedTimer = setInterval(runScheduler, 30000);
  }

  async function runScheduler() {
    const due = S().scheduledPublishes.filter(t => t.status === 'pending' && new Date(t.scheduledAt).getTime() <= Date.now());
    for (const t of due) {
      // 到点再检查一次平台限制，避免入队后规则变化导致无效发布
      if (typeof CP.preflightPublish === 'function') {
        const pre = CP.preflightPublish(t.platformId, { title: t.title, body: t.body });
        if (pre.blockers.length) {
          CP.actions.updateScheduled(t.id, { status: 'failed', error: '发布前检查未通过：' + pre.blockers[0] });
          ui().toast(`定时发布已跳过：「${t.title}」${pre.blockers[0]}`, 'warn');
          try { window.dispatchEvent(new Event('cp:sched-updated')); } catch (_) { /* ignore */ }
          continue;
        }
      }
      CP.actions.updateScheduled(t.id, { status: 'publishing' });
      let res;
      try {
        res = await CP.api.publish({ articleId: t.articleId, platformId: t.platformId, title: t.title, body: t.body, score: t.score, algorithm: t.algorithm });
      } catch (e) {
        res = { code: 1, msg: e.message || '发布失败' };
      }
      if (res.code === 0) {
        const mode = res.data && res.data.mode;
        if (mode === 'auto') {
          CP.actions.updateScheduled(t.id, { status: 'done' });
          ui().toast(`定时发布完成：「${t.title}」已发布到 ${res.data.platformName}`, 'ok');
        } else {
          CP.actions.updateScheduled(t.id, { status: 'done', note: '未绑定账号，已生成复制稿，请手动粘贴发布' });
          ui().toast(`定时任务到点：「${t.title}」未绑定账号，已生成复制稿`, 'info');
        }
      } else {
        CP.actions.updateScheduled(t.id, { status: 'failed', error: res.msg || '发布失败' });
        ui().toast(`定时发布失败：「${t.title}」${res.msg || '未知错误'}`, 'warn');
      }
      try { window.dispatchEvent(new Event('cp:sched-updated')); } catch (_) { /* ignore */ }
    }
  }

  /* ---------- 供页面调用的重渲染 ---------- */
  CP.refreshPage = function () {
    const content = document.getElementById('content');
    const pageFn = CP.getPage(currentRoute());
    if (pageFn && content) pageFn(content, { key: currentRoute() });
    CP.updateSniffBadge();
    restartAutoPull();
  };

  /* 编辑器等页面可直接打开设置（AI Key / 额度） */
  CP.openSettings = openSettings;

  /* ---------- 启动时处理错过的定时任务（应用未运行不会执行） ---------- */
  function markMissedSchedules() {
    let changed = false;
    S().scheduledPublishes.forEach(t => {
      if (t.status === 'pending' && new Date(t.scheduledAt).getTime() < Date.now() - 60 * 1000) {
        CP.actions.updateScheduled(t.id, { status: 'missed', error: '应用未运行，已错过计划时间，请重新安排' });
        changed = true;
      }
    });
    if (changed) {
      try { window.dispatchEvent(new Event('cp:sched-updated')); } catch (_) { /* ignore */ }
    }
  }

  /* ---------- 初始化 ---------- */
  async function init() {
    try { await CP.vault.migrate(); } catch (_) { /* 保险库不可用时保持原样 */ }
    markMissedSchedules();
    renderShell();
    render();
    window.addEventListener('hashchange', render);
    restartAutoPull();
    initScheduler();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
