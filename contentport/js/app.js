/* =========================================================
   ContentPort · 应用外壳 + 路由（app.js）
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
              <div class="brand-name">ContentPort</div>
              <div class="brand-sub">内 容 港 · 分 发</div>
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
          <div class="sidebar-ver"><span>v0.9.0 Prototype</span><span>PC</span></div>
        </aside>
        <div class="main">
          <header class="topbar">
            <div>
              <div class="topbar-title" id="tb-title">工作台</div>
              <div class="topbar-crumb" id="tb-crumb">总览与快捷入口</div>
            </div>
            <div class="topbar-right">
              <span class="badge" id="sniff-badge" style="cursor:pointer" data-act="goto-audience">
                ${S().sniffDone ? ui().icon('checkCircle', 13) + ' 已嗅探' : ui().icon('radar', 13) + ' 未嗅探'}
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
      ? ui().icon('checkCircle', 13) + ' 已嗅探'
      : ui().icon('radar', 13) + ' 未嗅探';
  };

  /* ---------- 设置弹窗（保存用户提供的 API Key） ---------- */
  function openSettings() {
    const s = S().settings;
    const platforms = s.platforms || {};
    const ap = s.autoPull || { enabled: true, interval: 30 };
    ui().openModal(`
      <div class="modal-head">
        <h3>设置</h3>
        <p>接入 AI / 平台 API 后，深度改写与自动发布将生效。配置保存在本机浏览器。</p>
      </div>
      <div class="modal-body">
        <div class="label" style="display:flex;align-items:center;gap:7px">${ui().icon('bot', 14)} AI 服务（OpenAI 兼容）</div>
        <label class="label" style="margin-top:8px">Base URL</label>
        <input class="input" id="set-base" placeholder="https://api.deepseek.com" value="${ui().esc(s.ai.baseUrl)}" />
        <label class="label" style="margin-top:12px">API Key</label>
        <input class="input" id="set-key" type="password" placeholder="sk-..." value="${ui().esc(s.ai.apiKey)}" />
        <label class="label" style="margin-top:12px">模型名称</label>
        <input class="input" id="set-model" placeholder="deepseek-chat" value="${ui().esc(s.ai.model)}" />
        <div style="display:flex;align-items:center;gap:10px;margin-top:10px">
          <button class="btn btn-soft btn-sm" id="set-test">${ui().icon('zap', 13)} 测试连接</button>
          <span class="hint" id="set-test-msg" style="margin-top:0"></span>
        </div>
        <div class="divider"></div>
        <div class="label" style="display:flex;align-items:center;gap:7px">${ui().icon('globe', 14)} 平台开放 API（可选，用于自动发布）</div>
        <div class="hint" style="margin-top:6px">填写后，发布时将走对应平台开放接口自动发布；留空则使用「复制稿」模式。</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">
          ${M().PLATFORMS.map(p => `
            <div>
              <label class="label" style="color:${p.color}">${p.name} API Key</label>
              <input class="input" data-pk="${p.id}" type="password" placeholder="可选" value="${ui().esc(platforms[p.id] || '')}" />
            </div>`).join('')}
        </div>
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
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" data-mclose>取消</button>
        <button class="btn btn-primary" id="set-save">${ui().icon('check', 15)} 保存配置</button>
      </div>`, { width: 620 });

    const modal = document.querySelector('.modal');
    modal.querySelector('[data-mclose]').addEventListener('click', () => modal.closest('.modal-wrap').querySelector('[data-close]').click());

    modal.querySelector('#set-test').addEventListener('click', async () => {
      const btn = modal.querySelector('#set-test');
      const msg = modal.querySelector('#set-test-msg');
      btn.disabled = true;
      msg.textContent = '测试中…';
      // 先临时保存用于测试
      CP.actions.saveSettings({
        ai: {
          baseUrl: document.getElementById('set-base').value.trim(),
          apiKey: document.getElementById('set-key').value.trim(),
          model: document.getElementById('set-model').value.trim()
        },
        platforms: collectPlatformKeys(),
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

    modal.querySelector('#set-save').addEventListener('click', () => {
      CP.actions.saveSettings({
        ai: {
          baseUrl: document.getElementById('set-base').value.trim(),
          apiKey: document.getElementById('set-key').value.trim(),
          model: document.getElementById('set-model').value.trim()
        },
        platforms: collectPlatformKeys(),
        autoPull: collectAutoPull()
      });
      ui().toast('配置已保存（存于本机）', 'ok');
      modal.closest('.modal-wrap').querySelector('[data-close]').click();
      restartAutoPull();
    });

    function collectPlatformKeys() {
      const out = {};
      modal.querySelectorAll('[data-pk]').forEach(inp => {
        const v = inp.value.trim();
        if (v) out[inp.dataset.pk] = v;
      });
      return out;
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

  /* ---------- 初始化 ---------- */
  function init() {
    renderShell();
    render();
    window.addEventListener('hashchange', render);
    restartAutoPull();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
