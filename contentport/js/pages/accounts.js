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

  /* 各平台 API 登录所需凭据字段 */
  const CRED_FIELDS = {
    csdn: {
      fields: [
        { key: 'username', label: 'CSDN 用户名', ph: '登录 CSDN 的用户名 / 手机号', type: 'text' },
        { key: 'password', label: 'CSDN 密码', ph: '登录密码（用于 MetaWeblog 自动发布）', type: 'password' }
      ],
      hint: '将通过 CSDN MetaWeblog（XML-RPC）接口校验账号并发布文章，与 Word 发布 CSDN 的方式相同。'
    },
    wechat: {
      fields: [
        { key: 'appid', label: '公众号 AppID', ph: '公众平台 → 设置与开发 → 基本配置', type: 'text' },
        { key: 'secret', label: '公众号 AppSecret', ph: 'AppSecret（本机 IP 需加入白名单）', type: 'password' }
      ],
      hint: '将通过微信官方接口校验凭据，发布到公众号草稿箱。未认证的订阅号可能无法使用发布接口。'
    },
    xhs: {
      fields: [{ key: 'token', label: '开放平台 Token', ph: '小红书开放平台 Token（演示）', type: 'password' }],
      hint: '小红书自动发布接入中，当前先体验绑定流程。'
    },
    zhihu: {
      fields: [{ key: 'token', label: '开放平台 Token', ph: '知乎开放平台 Token（演示）', type: 'password' }],
      hint: '知乎自动发布接入中，当前先体验绑定流程。'
    }
  };

  /* ================= 登录弹窗 ================= */
  function openLoginModal(pid, root) {
    const p = M().PLATFORMS.find(x => x.id === pid);
    const cfg = CRED_FIELDS[pid] || CRED_FIELDS.xhs;
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
              <div class="opt-d">${cfg.fields.length > 1 ? '账号 + 密码 / Secret' : '平台 Token'}</div>
            </div>
          </div>
          <div class="opt" data-method="cookie">
            <div class="opt-ic" style="color:var(--primary)">${ui().icon('globe', 17)}</div>
            <div>
              <div class="opt-l">浏览器 Cookie</div>
              <div class="opt-d">粘贴网页版登录后的 Cookie（演示）</div>
            </div>
          </div>
        </div>
        <div id="acc-form">
          <label class="label">账号昵称（显示用）</label>
          <input class="input" id="acc-nick" placeholder="例如：张三的 ${p.name}" />
          ${cfg.fields.map(f => `
            <label class="label" style="margin-top:12px">${f.label}</label>
            <input class="input" id="acc-${f.key}" type="${f.type}" placeholder="${f.ph}" />`).join('')}
          <div class="hint">${cfg.hint}</div>
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
          ${cfg.fields.map(f => `
            <label class="label" style="margin-top:12px">${f.label}</label>
            <input class="input" id="acc-${f.key}" type="${f.type}" placeholder="${f.ph}" />`).join('')}
          <div class="hint">${cfg.hint}</div>` : `
          <label class="label">账号昵称（显示用）</label>
          <input class="input" id="acc-nick" placeholder="例如：张三的 ${p.name}" />
          <label class="label" style="margin-top:12px">Cookie（完整复制）</label>
          <textarea class="textarea" id="acc-cookie" rows="4" placeholder="粘贴 ${p.name} 网页版登录后浏览器里的 Cookie 字符串…"></textarea>
          <div class="hint">演示模式：真实接入将在 Electron 内打开 ${p.name} 登录页自动捕获 Cookie。</div>`;
      });
    });

    modal.querySelector('[data-mclose]').addEventListener('click', () => modal.closest('.modal-wrap').querySelector('[data-close]').click());
    modal.querySelector('#acc-confirm').addEventListener('click', async () => {
      const nick = (document.getElementById('acc-nick') || {}).value?.trim() || '';
      const cookie = (document.getElementById('acc-cookie') || {}).value?.trim() || '';

      // 按平台收集凭据
      const credential = {};
      let missing = '';
      cfg.fields.forEach(f => {
        const v = (document.getElementById('acc-' + f.key) || {}).value?.trim() || '';
        credential[f.key] = v;
        if (!v) missing = missing || `${f.label}不能为空`;
      });
      if (!nick) { ui().toast('请填写账号昵称', 'warn'); return; }
      if (method === 'api' && missing) { ui().toast(missing, 'warn'); return; }
      if (method === 'cookie' && !cookie) { ui().toast('请粘贴 Cookie', 'warn'); return; }

      const btn = modal.querySelector('#acc-confirm');
      btn.disabled = true;
      btn.innerHTML = ui().icon('refresh', 15) + ' 登录中…';

      const res = await CP.api.loginAccount(pid, {
        method,
        nickname: nick,
        credential: method === 'api' ? credential : null,
        cookie: method === 'cookie' ? cookie : ''
      });
      btn.innerHTML = ui().icon('check', 15) + ' 完成';

      if (res.code === 0) {
        const accounts = getAccounts();
        accounts[pid] = {
          linked: true,
          nickname: res.data.nickname || nick,
          method,
          updatedAt: new Date().toLocaleDateString('zh-CN'),
          // 仅存本机；CSDN=用户名+密码，微信=AppID+AppSecret，其余平台=Token/Cookie
          credential: method === 'api' ? credential : { cookie }
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
