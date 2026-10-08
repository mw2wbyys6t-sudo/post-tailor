/* =========================================================
   ContentPort · 应用外壳 + 路由（app.js）
   冻结的 App Shell：侧边栏 + 顶栏 + 内容槽（SPA，一次性注入）
   ========================================================= */
window.CP = window.CP || {};

(function () {
  const ui = () => CP.ui;
  const S = () => CP.state;

  /* ---------- 冻结导航 ---------- */
  const NAV = [
    { key: 'dashboard', label: '工作台', icon: 'dashboard', crumb: '总览与快捷入口' },
    { key: 'profile', label: '用户画像', icon: 'user', crumb: '问答式自画像' },
    { key: 'library', label: '文章库', icon: 'book', crumb: '内容资产管理' },
    { key: 'audience', label: '受众嗅探', icon: 'radar', crumb: '平台受众分析' },
    { key: 'distribute', label: '分发工作台', icon: 'send', crumb: '自适应改写与发布' },
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
    ui().openModal(`
      <div class="modal-head">
        <h3>设置</h3>
        <p>接入你的 AI / 平台 API 后，自动发布与深度改写将生效。配置保存在本机浏览器。</p>
      </div>
      <div class="modal-body">
        <label class="label">AI 服务地址（Base URL）</label>
        <input class="input" id="set-base" placeholder="https://api.deepseek.com" value="${ui().esc(s.ai.baseUrl)}" />
        <label class="label" style="margin-top:14px">AI API Key</label>
        <input class="input" id="set-key" type="password" placeholder="sk-..." value="${ui().esc(s.ai.apiKey)}" />
        <label class="label" style="margin-top:14px">模型名称</label>
        <input class="input" id="set-model" placeholder="deepseek-chat" value="${ui().esc(s.ai.model)}" />
        <div class="hint">Key 只保存在本机，不会上传。未配置时使用内置「规则引擎」改写。</div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" data-mclose>取消</button>
        <button class="btn btn-primary" id="set-save">${ui().icon('check', 15)} 保存配置</button>
      </div>`, { width: 500 });

    const modal = document.querySelector('.modal');
    modal.querySelector('[data-mclose]').addEventListener('click', () => modal.closest('.modal-wrap').querySelector('[data-close]').click());
    modal.querySelector('#set-save').addEventListener('click', () => {
      CP.actions.saveSettings({
        ai: {
          baseUrl: document.getElementById('set-base').value.trim(),
          apiKey: document.getElementById('set-key').value.trim(),
          model: document.getElementById('set-model').value.trim()
        }
      });
      ui().toast('配置已保存（存于本机）', 'ok');
      modal.closest('.modal-wrap').querySelector('[data-close]').click();
    });
  }

  /* ---------- 初始化 ---------- */
  function init() {
    renderShell();
    render();
    window.addEventListener('hashchange', render);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
