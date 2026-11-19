/* =========================================================
   OmniDraft · 账号中心（accounts.js）
   登录 / 绑定 / 解绑平台账号
   登录方式：知乎 / 小红书 → 一键打开官方登录页（扫码后自动保存）
            CSDN / 微信公众号 → 账号密码 / AppID + AppSecret
            不登录也可以直接用「复制稿」模式
   ========================================================= */
window.CP = window.CP || {};

(function () {
  const ui = () => CP.ui;
  const S = () => CP.state;
  const M = () => CP.mock;

  /* 账号绑定状态（持久化在 settings.accounts，仅存元数据，不含凭据） */
  function getAccounts() {
    return S().settings.accounts || {};
  }
  function saveAccounts(accounts) {
    const s = S().settings;
    s.accounts = accounts;
    CP.actions.saveSettings(s);
  }
  /* 凭据写入系统保险库；返回是否成功加密落盘 */
  async function storeCredential(pid, credential) {
    try {
      const mode = await CP.vault.set(pid, credential);
      return mode === 'keychain';
    } catch (e) {
      return false;
    }
  }

  /* 凭据是否可用：桌面版以钥匙串落盘结果为准；网页预览为内存模式，仅本次会话有效 */
  function credentialReady(stored) {
    return stored || !window.electronAPI;
  }

  /* 扫码登录平台（Electron 内打开官方登录页，自动捕获 Cookie） */
  const OAUTH_PLATFORMS = ['zhihu', 'xhs'];

  CP.registerPage('accounts', (root) => {
    const accounts = getAccounts();

    root.innerHTML = `
      <div class="page-head fade-up">
        <div>
          <h2>账号中心</h2>
          <p>登录后可直接发布；不登录也能用「复制稿」模式，改写完复制到平台粘贴即可。</p>
        </div>
        <div class="page-actions">
          <a class="btn btn-ghost" href="#/distribute">${ui().icon('copy', 15)} 跳过登录，先用复制稿</a>
        </div>
      </div>
      <div class="card fade-up" style="margin-bottom:16px">
        <div class="card-body" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
          <span style="display:inline-flex;align-items:center;gap:8px;font-size:13.5px;font-weight:600">${ui().icon('shield', 15)} 安全说明</span>
          <span class="hint" style="margin:0;flex:1;min-width:220px">平台凭据通过系统钥匙串（Keychain / DPAPI / libsecret）加密后保存在本机应用数据目录，明文不落盘、不上传；解绑账号会同时删除加密凭据。</span>
          <span class="badge badge-ok">${ui().icon('lock', 12)} 加密存储</span>
        </div>
      </div>
      <div class="plat-grid stagger" id="acc-list">
        ${M().PLATFORMS.map(p => renderCard(p, accounts[p.id])).join('')}
      </div>
      <div class="card fade-up" style="margin-top:16px">
        <div class="card-head"><h3>发布模式说明</h3></div>
        <div class="card-body">
          <ul class="rule-list">
            <li><span class="rl-ic">${ui().icon('copy', 15)}</span><span><strong>不登录也能用</strong> → 「复制稿」模式会生成排版好的成品，手动粘贴到平台编辑器即可，最稳定、无需授权。</span></li>
            <li><span class="rl-ic">${ui().icon('send', 15)}</span><span><strong>登录账号后</strong> → 发布时走「自动发布」，以你的账号直接发布到平台。</span></li>
            <li><span class="rl-ic">${ui().icon('link', 15)}</span><span><strong>登录方式</strong>：知乎、小红书为「打开官方登录页扫码」；CSDN 使用账号密码；微信公众号使用 AppID + AppSecret。平台改版可能导致通道失效，届时请升级版本。</span></li>
          </ul>
        </div>
      </div>`;

    bindCardActions(root);
  });

  /* 统一的账号卡片事件绑定 */
  function bindCardActions(root) {
    root.querySelectorAll('[data-login]').forEach(btn => {
      btn.addEventListener('click', () => startLogin(btn.dataset.login, root));
    });
    root.querySelectorAll('[data-relogin]').forEach(btn => {
      btn.addEventListener('click', () => startLogin(btn.dataset.relogin, root));
    });
    root.querySelectorAll('[data-logout]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pid = btn.dataset.logout;
        const acc = getAccounts();
        delete acc[pid];
        saveAccounts(acc);
        try { await CP.vault.clear(pid); } catch (_) { /* 保险库不可用时忽略 */ }
        ui().toast('已解绑该平台账号', 'info');
        renderCardAll(root);
      });
    });
  }

  function renderCard(p, acc) {
    const isOauth = OAUTH_PLATFORMS.includes(p.id);
    const loginHint = isOauth
      ? '打开官方登录页，扫码后自动完成，无需复制 Cookie'
      : (p.id === 'csdn' ? '使用 CSDN 账号密码登录' : '使用公众号 AppID / AppSecret 登录');

    if (acc && acc.linked) {
      const ok = acc.credOk !== false;
      const methodLabel = acc.method === 'oauth' ? '官方登录页扫码' : (p.id === 'wechat' ? 'AppID / AppSecret' : '账号密码');
      return `
        <div class="card card-hover" style="padding:18px">
          <div class="pc-top">
            <div class="plat-logo" style="background:${p.color}">${p.name[0]}</div>
            <div style="flex:1;min-width:0">
              <div class="pc-name">${p.name}</div>
              <div class="pc-tag">${ok ? ui().icon('checkCircle', 12) + ' 已登录' : ui().icon('alert', 12) + ' 凭据缺失'}</div>
            </div>
            <span class="badge ${ok ? 'badge-ok' : 'badge-warn'}">${ok ? '在线' : '需重新登录'}</span>
          </div>
          <div style="display:flex;align-items:center;gap:12px;margin-top:14px;padding:12px;background:var(--surface-2);border-radius:10px">
            <div class="sidebar-avatar" style="width:38px;height:38px;background:linear-gradient(135deg,${p.color},${p.color}cc)">${ui().esc((acc.nickname || '?')[0]).toUpperCase()}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:13.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${ui().esc(acc.nickname || '已登录账号')}</div>
              <div style="font-size:11.5px;color:var(--ink-3)">${methodLabel} · ${ui().esc(acc.updatedAt || '')}</div>
            </div>
          </div>
          <div style="display:flex;gap:8px;margin-top:14px">
            <button class="btn btn-ghost btn-sm" data-relogin="${p.id}" style="flex:1">${ui().icon('refresh', 13)} 重新登录</button>
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
        <div class="hint" style="margin-top:14px;line-height:1.7">${loginHint}</div>
        <div style="display:flex;gap:8px;margin-top:14px">
          <button class="btn btn-primary btn-sm" data-login="${p.id}" style="flex:1">${ui().icon(isOauth ? 'globe' : 'user', 13)} ${isOauth ? '扫码登录' : '登录账号'}</button>
        </div>
      </div>`;
  }

  function renderCardAll(root) {
    const list = root.querySelector('#acc-list');
    if (!list) return;
    const accounts = getAccounts();
    list.innerHTML = M().PLATFORMS.map(p => renderCard(p, accounts[p.id])).join('');
    bindCardActions(root);
  }

  /* 各平台登录所需字段与说明 */
  const CRED_FIELDS = {
    csdn: {
      desc: '用 CSDN 账号密码登录，发布方式与 Word 发布 CSDN 相同。',
      fields: [
        { key: 'username', label: 'CSDN 账号', ph: '用户名 / 手机号 / 邮箱', type: 'text' },
        { key: 'password', label: 'CSDN 密码', ph: '登录密码', type: 'password' }
      ],
      hint: '账号密码只用于 MetaWeblog（XML-RPC）发布，加密保存在本机。'
    },
    wechat: {
      desc: '填写公众号的 AppID 与 AppSecret，即可发布到公众号草稿箱。',
      guide: '<div class="hint" style="margin-bottom:12px">在 <a href="https://mp.weixin.qq.com/" target="_blank" style="color:var(--primary);font-weight:600">微信公众平台</a> → 设置与开发 → 基本配置 中获取；AppSecret 仅显示一次，请先复制。</div>',
      fields: [
        { key: 'appid', label: 'AppID', ph: '例如 wx1234567890abcdef', type: 'text' },
        { key: 'secret', label: 'AppSecret', ph: '公众号后台的基本配置中复制', type: 'password' }
      ],
      hint: '未认证的订阅号可能无法使用发布接口；本机 IP 需加入公众号 IP 白名单。'
    }
  };

  /* 统一入口：扫码平台一键登录，其余平台打开精简表单 */
  function startLogin(pid, root) {
    if (OAUTH_PLATFORMS.includes(pid)) return startOAuthLogin(pid, root);
    return openApiLoginModal(pid, root);
  }

  /* ---------- 扫码登录（知乎 / 小红书） ---------- */
  async function startOAuthLogin(pid, root) {
    const p = M().PLATFORMS.find(x => x.id === pid);
    const electron = window.electronAPI;
    if (!electron || typeof electron.loginOAuth !== 'function') {
      return showDesktopLoginGuide(pid);
    }
    const scanApp = pid === 'zhihu' ? '知乎 App' : '小红书 App';

    ui().openModal(`
      <div class="modal-head">
        <h3>登录 ${p.name}</h3>
        <p>用${scanApp}扫码，登录成功后自动返回，不需要复制 Cookie。</p>
      </div>
      <div class="modal-body">
        <div style="display:flex;align-items:center;gap:14px;padding:16px;background:var(--primary-soft);border:1px solid rgba(15,118,110,.18);border-radius:12px">
          <div style="width:44px;height:44px;border-radius:12px;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;flex:none">${ui().icon('scan', 24)}</div>
          <div>
            <div style="font-weight:700;font-size:14px">登录窗口已打开</div>
            <div class="hint" style="margin-top:3px">在弹窗中切换到「扫码登录」，用手机${scanApp}扫描二维码。</div>
          </div>
        </div>
        <div class="oauth-steps" id="oauth-steps">
          <div class="oauth-step done"><b>1</b><span>打开登录页</span></div>
          <div class="oauth-step active"><b>2</b><span>手机扫码并确认</span></div>
          <div class="oauth-step"><b>3</b><span>自动完成登录</span></div>
        </div>
        <div class="oauth-status" id="oauth-status">
          <div class="acc-spin"></div>
          <div>
            <div style="font-weight:700;font-size:13.5px" id="oauth-title">等待扫码…</div>
            <div class="hint" id="oauth-msg" style="margin-top:3px">扫码后在手机上点「确认登录」，这里会自动完成。</div>
          </div>
        </div>
        <div class="hint" style="margin-top:10px">若窗口被关掉，点「重新打开窗口」即可继续；页面显示密码登录时，点右上角「扫码登录」切换。</div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-soft" id="oauth-reopen">${ui().icon('refresh', 15)} 重新打开窗口</button>
        <button class="btn btn-ghost" data-mclose>取消登录</button>
      </div>`, { width: 540 });

    const modal = document.querySelector('.modal');
    const closeModal = () => {
      const close = modal.querySelector('[data-close]');
      if (close) close.click();
    };
    let aborted = false;

    modal.querySelector('[data-mclose]').addEventListener('click', async () => {
      aborted = true;
      await CP.api.cancelOAuth(pid);
      closeModal();
    });

    modal.querySelector('#oauth-reopen').addEventListener('click', async () => {
      const btn = modal.querySelector('#oauth-reopen');
      btn.disabled = true;
      btn.innerHTML = ui().icon('refresh', 15) + ' 正在打开…';
      aborted = true;
      await CP.api.cancelOAuth(pid);
      closeModal();
      startOAuthLogin(pid, root);
    });

    const res = await CP.api.loginOAuth(pid);
    if (aborted) return;

    const titleEl = document.getElementById('oauth-title');
    const msgEl = document.getElementById('oauth-msg');

    if (res.code === 0) {
      const nickname = res.data.nickname || p.name;
      const steps = document.querySelectorAll('#oauth-steps .oauth-step');
      if (steps[1]) steps[1].classList.replace('active', 'done');
      if (steps[2]) steps[2].classList.add('done');
      const statusEl = document.getElementById('oauth-status');
      if (statusEl) {
        statusEl.innerHTML = `
          <div style="width:34px;height:34px;border-radius:50%;background:var(--ok-soft);color:var(--ok);display:flex;align-items:center;justify-content:center;flex:none">${ui().icon('checkCircle', 20)}</div>
          <div>
            <div style="font-weight:700;font-size:13.5px">登录成功</div>
            <div class="hint" style="margin-top:3px">已登录 ${ui().esc(nickname)}，正在返回账号中心…</div>
          </div>`;
      }

      const stored = await storeCredential(pid, { cookie: res.data.cookie });
      const ready = credentialReady(stored);
      const accounts = getAccounts();
      accounts[pid] = {
        linked: true,
        nickname,
        method: 'oauth',
        updatedAt: new Date().toLocaleDateString('zh-CN'),
        credOk: ready
      };
      saveAccounts(accounts);
      ui().toast(`已登录 ${p.name}：${nickname}`, 'ok');
      if (!ready) ui().toast('系统安全存储不可用，凭据仅本次运行有效', 'warn');
      setTimeout(() => { closeModal(); renderCardAll(root); }, 600);
    } else {
      if (titleEl) titleEl.textContent = '登录未完成';
      if (msgEl) msgEl.textContent = `${res.msg || '登录失败，请重试'}。可点「重新打开窗口」再试一次。`;
      const steps = document.querySelectorAll('#oauth-steps .oauth-step');
      if (steps[1]) steps[1].classList.remove('active');
      const statusEl = document.getElementById('oauth-status');
      if (statusEl) {
        statusEl.style.background = 'var(--danger-soft)';
        const spin = statusEl.querySelector('.acc-spin');
        if (spin) spin.remove();
      }
    }
  }

  /* 网页预览环境：不展示复杂的 Cookie 表单，直接说明并给出替代方案 */
  function showDesktopLoginGuide(pid) {
    const p = M().PLATFORMS.find(x => x.id === pid);
    ui().openModal(`
      <div class="modal-head">
        <h3>${p.name} 扫码登录</h3>
        <p>桌面版会打开官方登录页，扫码后自动完成，不需要复制 Cookie。</p>
      </div>
      <div class="modal-body">
        <div class="hint" style="line-height:1.8">当前是网页预览环境，无法打开平台登录窗口。请下载桌面版使用；也可以先用「复制稿」模式，不登录一样能完成改写和分发。</div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" data-mclose>知道了</button>
        <a class="btn btn-primary" href="#/distribute" id="acc-go-dist">${ui().icon('copy', 15)} 先用复制稿</a>
      </div>`, { width: 460 });

    const modal = document.querySelector('.modal');
    modal.querySelector('[data-mclose]').addEventListener('click', () => modal.closest('.modal-wrap').querySelector('[data-close]').click());
    modal.querySelector('#acc-go-dist').addEventListener('click', () => {
      modal.closest('.modal-wrap').querySelector('[data-close]').click();
    });
  }

  /* ---------- 账号密码 / AppID + AppSecret 登录 ---------- */
  function openApiLoginModal(pid, root) {
    const p = M().PLATFORMS.find(x => x.id === pid);
    const cfg = CRED_FIELDS[pid];
    if (!cfg) return;

    ui().openModal(`
      <div class="modal-head">
        <h3>登录 ${p.name}</h3>
        <p>${cfg.desc}</p>
      </div>
      <div class="modal-body">
        ${cfg.guide || ''}
        ${cfg.fields.map(f => `
          <label class="label" style="margin-top:12px">${f.label}</label>
          <input class="input" id="acc-${f.key}" type="${f.type}" placeholder="${f.ph}" />`).join('')}
        <div class="hint" style="margin-top:10px">${cfg.hint}</div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" data-mclose>取消</button>
        <button class="btn btn-primary" id="acc-confirm">${ui().icon('check', 15)} 登录</button>
      </div>`, { width: 500 });

    const modal = document.querySelector('.modal');
    modal.querySelector('[data-mclose]').addEventListener('click', () => modal.closest('.modal-wrap').querySelector('[data-close]').click());

    modal.querySelector('#acc-confirm').addEventListener('click', async () => {
      const credential = {};
      let missing = '';
      cfg.fields.forEach(f => {
        const v = (document.getElementById('acc-' + f.key) || {}).value?.trim() || '';
        credential[f.key] = v;
        if (!v) missing = missing || `请填写${f.label}`;
      });
      if (missing) { ui().toast(missing, 'warn'); return; }

      const btn = modal.querySelector('#acc-confirm');
      btn.disabled = true;
      btn.innerHTML = ui().icon('refresh', 15) + ' 验证中…';

      const res = await CP.api.loginAccount(pid, { method: 'api', credential });
      btn.innerHTML = ui().icon('check', 15) + ' 登录';

      if (res.code === 0) {
        const nickname = res.data.nickname || p.name;
        const stored = await storeCredential(pid, credential);
        const ready = credentialReady(stored);
        const accounts = getAccounts();
        accounts[pid] = {
          linked: true,
          nickname,
          method: 'api',
          updatedAt: new Date().toLocaleDateString('zh-CN'),
          // 凭据已进入系统保险库，这里只记录状态，不落明文
          credOk: ready
        };
        saveAccounts(accounts);
        ui().toast(`已登录 ${p.name}：${nickname}`, 'ok');
        if (!ready) ui().toast('系统安全存储不可用，凭据仅本次运行有效', 'warn');
        const close = modal.querySelector('[data-close]');
        if (close) close.click();
        renderCardAll(root);
      } else {
        btn.disabled = false;
        ui().toast(res.msg || '登录失败', 'warn');
      }
    });
  }
})();
