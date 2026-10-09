/* =========================================================
   ContentPort · 账号中心（accounts.js）
   登录 / 绑定 / 解绑平台账号
   登录方式：① 开放平台 API 凭据（AppID/AppSecret/Token）
            ② 浏览器 Cookie（模拟平台网页登录，真实实现见 TODO）
   ========================================================= */
window.CP = window.CP || {};

(function () {
  const ui = () => CP.ui;
  const S = () => CP.state;
  const M = () => CP.mock;

  /* 账号绑定状态（持久化在 settings.accounts） */
  function getAccounts() {
    return S().settings.accounts || {};
  }
  function saveAccounts(accounts) {
    const s = S().settings;
    s.accounts = accounts;
    CP.actions.saveSettings(s);
  }

  CP.registerPage('accounts', (root) => {
    const accounts = getAccounts();

    root.innerHTML = `
      <div class="page-head fade-up">
        <div>
          <h2>账号中心</h2>
          <p>登录你的平台账号，发布时将以该账号自动发布。账号信息仅保存在本机。</p>
        </div>
      </div>
      <div class="card fade-up" style="margin-bottom:16px">
        <div class="card-body" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
          <span style="display:inline-flex;align-items:center;gap:8px;font-size:13.5px;font-weight:600">${ui().icon('shield', 15)} 安全说明</span>
          <span class="hint" style="margin:0;flex:1;min-width:220px">Cookie / API 凭据仅保存在本机浏览器 localStorage，不会上传；Electron 桌面版凭据存于本机应用数据目录。</span>
          <span class="badge badge-ok">${ui().icon('lock', 12)} 本地存储</span>
        </div>
      </div>
      <div class="plat-grid stagger" id="acc-list">
        ${M().PLATFORMS.map(p => renderCard(p, accounts[p.id])).join('')}
      </div>
      <div class="card fade-up" style="margin-top:16px">
        <div class="card-head"><h3>发布模式说明</h3></div>
        <div class="card-body">
          <ul class="rule-list">
            <li><span class="rl-ic">${ui().icon('send', 15)}</span><span><strong>已绑定账号</strong> → 发布时走「自动发布」，以你的账号直接发布到平台。</span></li>
            <li><span class="rl-ic">${ui().icon('copy', 15)}</span><span><strong>未绑定账号</strong> → 使用「复制稿」模式，生成成品后手动粘贴到平台编辑器（最稳定，无需授权）。</span></li>
            <li><span class="rl-ic">${ui().icon('link', 15)}</span><span>真实接入各平台开放接口后，自动发布将直接生效；当前原型模拟绑定流程用于演示交互。</span></li>
          </ul>
        </div>
      </div>`;

    root.querySelectorAll('[data-login]').forEach(btn => {
      btn.addEventListener('click', () => openLoginModal(btn.dataset.login, root));
    });
    root.querySelectorAll('[data-logout]').forEach(btn => {
      btn.addEventListener('click', () => {
        const pid = btn.dataset.logout;
        const acc = getAccounts();
        delete acc[pid];
        saveAccounts(acc);
        ui().toast('已解绑该平台账号', 'info');
        renderCardAll(root);
      });
    });
  });

  function renderCard(p, acc) {
    if (acc && acc.linked) {
      return `
        <div class="card card-hover" style="padding:18px">
          <div class="pc-top">
            <div class="plat-logo" style="background:${p.color}">${p.name[0]}</div>
            <div style="flex:1;min-width:0">
              <div class="pc-name">${p.name}</div>
              <div class="pc-tag">${ui().icon('checkCircle', 12)} 已登录</div>
            </div>
            <span class="badge badge-ok">在线</span>
          </div>
          <div style="display:flex;align-items:center;gap:12px;margin-top:14px;padding:12px;background:var(--surface-2);border-radius:10px">
            <div class="sidebar-avatar" style="width:38px;height:38px;background:linear-gradient(135deg,${p.color},${p.color}cc)">${ui().esc((acc.nickname || '?')[0]).toUpperCase()}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:13.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${ui().esc(acc.nickname || '已登录账号')}</div>
              <div style="font-size:11.5px;color:var(--ink-3)">${acc.method === 'api' ? '开放 API 凭据' : '浏览器 Cookie'} · ${ui().esc(acc.updatedAt || '')}</div>
            </div>
          </div>
          <div style="display:flex;gap:8px;margin-top:14px">
            <button class="btn btn-ghost btn-sm" data-logout="${p.id}" style="flex:1">${ui().icon('x', 13)} 解绑</button>
          </div>
        </div>`;
    }
    return `
      <div class="card card-hover" style="padding:18px">
        <div class="pc-top">
          <div class="plat-logo" style="background:${p.color}">${p.name[0]}</div>
          <div style="flex:1;min-width:0">
            <div class="pc-name">${p.name}</div>
            <div class="pc-tag">${p.tagline}</div>
          </div>
          <span class="badge badge-gray">未登录</span>
        </div>
        <div class="hint" style="margin-top:14px;line-height:1.7">登录后，分发工作台可直接以你的账号一键发布到 ${p.name}。</div>
        <div style="display:flex;gap:8px;margin-top:14px">
          <button class="btn btn-primary btn-sm" data-login="${p.id}" style="flex:1">${ui().icon('user', 13)} 登录账号</button>
        </div>
      </div>`;
  }

  function renderCardAll(root) {
    const list = root.querySelector('#acc-list');
    if (list) {
      const accounts = getAccounts();
      list.innerHTML = M().PLATFORMS.map(p => renderCard(p, accounts[p.id])).join('');
      list.querySelectorAll('[data-login]').forEach(btn => {
        btn.addEventListener('click', () => openLoginModal(btn.dataset.login, root));
      });
      list.querySelectorAll('[data-logout]').forEach(btn => {
        btn.addEventListener('click', () => {
          const pid = btn.dataset.logout;
          const acc = getAccounts();
          delete acc[pid];
          saveAccounts(acc);
          ui().toast('已解绑该平台账号', 'info');
          renderCardAll(root);
        });
      });
    }
  }

  /* ================= 登录弹窗 ================= */
  function openLoginModal(pid, root) {
    const p = M().PLATFORMS.find(x => x.id === pid);
    ui().openModal(`
      <div class="modal-head">
        <h3>登录 ${p.name} 账号</h3>
        <p>选择登录方式并完成授权，发布时将使用该账号。</p>
      </div>
      <div class="modal-body">
        <div class="label">登录方式</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
          <div class="opt on" data-method="api">
            <div class="opt-ic" style="color:var(--primary)">${ui().icon('key', 17)}</div>
            <div>
              <div class="opt-l">开放 API 凭据</div>
              <div class="opt-d">填写平台开放平台的 Token / Secret</div>
            </div>
          </div>
          <div class="opt" data-method="cookie">
            <div class="opt-ic" style="color:var(--primary)">${ui().icon('globe', 17)}</div>
            <div>
              <div class="opt-l">浏览器 Cookie</div>
              <div class="opt-d">粘贴网页版登录后的 Cookie（原型演示）</div>
            </div>
          </div>
        </div>
        <div id="acc-form">
          <label class="label">账号昵称（显示用）</label>
          <input class="input" id="acc-nick" placeholder="例如：张三的 ${p.name}" />
          <label class="label" style="margin-top:12px">开放平台 Token / 凭据</label>
          <input class="input" id="acc-token" type="password" placeholder="粘贴 ${p.name} 开放平台 Token…" />
          <div class="hint">真实接入后，系统将调用 ${p.name} 开放接口校验凭据并获取账号信息。</div>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" data-mclose>取消</button>
        <button class="btn btn-primary" id="acc-confirm">${ui().icon('check', 15)} 登录</button>
      </div>`, { width: 520 });

    const modal = document.querySelector('.modal');
    const methodEls = modal.querySelectorAll('[data-method]');
    const form = modal.querySelector('#acc-form');
    let method = 'api';

    methodEls.forEach(el => {
      el.addEventListener('click', () => {
        methodEls.forEach(x => x.classList.toggle('on', x === el));
        method = el.dataset.method;
        form.innerHTML = method === 'api' ? `
          <label class="label">账号昵称（显示用）</label>
          <input class="input" id="acc-nick" placeholder="例如：张三的 ${p.name}" />
          <label class="label" style="margin-top:12px">开放平台 Token / 凭据</label>
          <input class="input" id="acc-token" type="password" placeholder="粘贴 ${p.name} 开放平台 Token…" />
          <div class="hint">真实接入后，系统将调用 ${p.name} 开放接口校验凭据并获取账号信息。</div>` : `
          <label class="label">账号昵称（显示用）</label>
          <input class="input" id="acc-nick" placeholder="例如：张三的 ${p.name}" />
          <label class="label" style="margin-top:12px">Cookie（完整复制）</label>
          <textarea class="textarea" id="acc-cookie" rows="4" placeholder="粘贴 ${p.name} 网页版登录后浏览器里的 Cookie 字符串…"></textarea>
          <div class="hint">原型演示：真实接入将在 Electron 内打开 ${p.name} 登录页自动捕获 Cookie。</div>`;
      });
    });

    modal.querySelector('[data-mclose]').addEventListener('click', () => modal.closest('.modal-wrap').querySelector('[data-close]').click());
    modal.querySelector('#acc-confirm').addEventListener('click', async () => {
      const nick = (document.getElementById('acc-nick') || {}).value?.trim() || '';
      const token = (document.getElementById('acc-token') || {}).value?.trim() || '';
      const cookie = (document.getElementById('acc-cookie') || {}).value?.trim() || '';
      if (!nick) { ui().toast('请填写账号昵称', 'warn'); return; }
      if (method === 'api' && !token) { ui().toast('请粘贴开放平台 Token', 'warn'); return; }
      if (method === 'cookie' && !cookie) { ui().toast('请粘贴 Cookie', 'warn'); return; }

      const btn = modal.querySelector('#acc-confirm');
      btn.disabled = true;
      btn.innerHTML = ui().icon('refresh', 15) + ' 登录中…';

      // TODO: 真实实现调用平台开放接口校验凭据 / 用捕获的 Cookie 验证登录
      const res = await CP.api.loginAccount(pid, { method, nickname: nick, token, cookie });
      btn.innerHTML = ui().icon('check', 15) + ' 完成';

      if (res.code === 0) {
        const accounts = getAccounts();
        accounts[pid] = {
          linked: true,
          nickname: res.data.nickname || nick,
          method,
          updatedAt: new Date().toLocaleDateString('zh-CN'),
          // 仅存本机；真实凭据可加密后存于 Electron safeStorage
          credential: method === 'api' ? token : cookie
        };
        saveAccounts(accounts);
        ui().toast(`已登录 ${p.name}：${accounts[pid].nickname}`, 'ok');
        modal.closest('.modal-wrap').querySelector('[data-close]').click();
        renderCardAll(root);
      } else {
        ui().toast(res.msg || '登录失败', 'warn');
        btn.disabled = false;
        btn.innerHTML = ui().icon('check', 15) + ' 登录';
      }
    });
  }
})();
