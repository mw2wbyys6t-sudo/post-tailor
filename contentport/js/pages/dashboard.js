/* =========================================================
   ContentPort · 工作台（dashboard.js）
   数据总览 + 分发流程引导 + 平台热度 + 近期文章
   ========================================================= */
window.CP = window.CP || {};

(function () {
  const ui = () => CP.ui;
  const S = () => CP.state;
  const M = () => CP.mock;

  CP.registerPage('dashboard', (root) => {
    const articles = S().articles;
    const history = S().history;
    const portrait = S().portrait;

    const published = history.filter(h => h.status === '已发布');
    const totalViews = published.reduce((s, h) => s + h.views, 0);
    const totalLikes = published.reduce((s, h) => s + h.likes, 0);

    const flowDone = {
      profile: !!portrait,
      sniff: S().sniffDone,
      rewrite: S().ui.rewriteResults && Object.keys(S().ui.rewriteResults).length > 0,
      publish: history.length > 0
    };

    const steps = [
      { k: 'profile', n: '01', t1: '建立用户画像', t2: portrait ? '已完成' : '回答问题，了解你的创作定位' },
      { k: 'sniff', n: '02', t1: '嗅探平台受众', t2: S().sniffDone ? '已完成平台受众分析' : '分析 4 个平台的读者画像' },
      { k: 'rewrite', n: '03', t1: '自适应改写', t2: flowDone.rewrite ? '已有改写结果' : '一稿生成多平台原生版本' },
      { k: 'publish', n: '04', t1: '一键发布', t2: flowDone.publish ? '已发布多篇内容' : '自动发布或复制稿直达' }
    ];

    root.innerHTML = `
      <div class="page-head fade-up">
        <div>
          <h2>工作台</h2>
          <p>${portrait ? `欢迎回来，${ui().esc(portrait.nickname || '创作者')}。今天要继续分发内容吗？` : '完成用户画像后，分发将更懂你。'}</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-ghost" data-act="import">${ui().icon('upload', 15)} 导入文章</button>
          <button class="btn btn-primary" data-act="go-distribute">${ui().icon('send', 15)} 开始分发</button>
        </div>
      </div>

      <div class="flow-strip fade-up">
        ${steps.map((s, i) => `
          ${i > 0 ? `<div class="flow-arrow">${ui().icon('chevronRight', 16)}</div>` : ''}
          <div class="flow-step ${flowDone[s.k] ? 'done' : ''}" data-step="${s.k}" style="cursor:pointer">
            <div class="fs-num">${flowDone[s.k] ? ui().icon('check', 14) : s.n}</div>
            <div class="fs-txt">
              <div class="fs-t1">${s.t1}</div>
              <div class="fs-t2">${s.t2}</div>
            </div>
          </div>`).join('')}
      </div>

      <div class="stat-grid stagger" style="margin-bottom:18px">
        <div class="card stat-card">
          <div class="stat-ic" style="background:linear-gradient(135deg,#0F766E,#0FA08F)">${ui().icon('book', 17)}</div>
          <div class="stat-val">${articles.length}</div>
          <div class="stat-lbl">文章总数</div>
          <div class="stat-delta up">${ui().icon('trending', 13)} ${articles.filter(a => a.status === '已发布').length} 篇已发布</div>
        </div>
        <div class="card stat-card">
          <div class="stat-ic" style="background:linear-gradient(135deg,#C27803,#E8A33D)">${ui().icon('send', 17)}</div>
          <div class="stat-val">${history.length}</div>
          <div class="stat-lbl">分发次数</div>
          <div class="stat-delta up">${ui().icon('trending', 13)} 覆盖 ${new Set(history.map(h => h.platformId)).size} 个平台</div>
        </div>
        <div class="card stat-card">
          <div class="stat-ic" style="background:linear-gradient(135deg,#0052CC,#4D8DFF)">${ui().icon('eye', 17)}</div>
          <div class="stat-val">${ui().fmtNum(totalViews)}</div>
          <div class="stat-lbl">累计阅读</div>
          <div class="stat-delta up">${ui().icon('trending', 13)} 较上周 +18.2%</div>
        </div>
        <div class="card stat-card">
          <div class="stat-ic" style="background:linear-gradient(135deg,#128A62,#2FBF8A)">${ui().icon('activity', 17)}</div>
          <div class="stat-val">${avgScore(history)}</div>
          <div class="stat-lbl">平均适配度</div>
          <div class="stat-delta up">${ui().icon('trending', 13)} 高于行业均值 12%</div>
        </div>
      </div>

      <div class="split" style="margin-bottom:18px">
        <div class="card">
          <div class="card-head">
            <h3>平台受众热度</h3>
            <button class="btn btn-ghost btn-sm more" data-act="go-audience">${ui().icon('radar', 14)} 详细嗅探</button>
          </div>
          <div class="card-body">
            <div class="plat-grid">
              ${M().PLATFORMS.map((p, i) => {
                const cnt = history.filter(h => h.platformId === p.id).length;
                return `
                <div class="card card-hover plat-card" data-plat="${p.id}" data-act="plat-card" style="padding:14px">
                  <div class="pc-top">
                    <div class="plat-logo" style="background:${p.color}">${p.name[0]}</div>
                    <div>
                      <div class="pc-name">${p.name}</div>
                      <div class="pc-tag">${p.tagline}</div>
                    </div>
                  </div>
                  <div class="pc-heat">${ui().icon('flame', 13)} 热度 ${heatOf(p.id)}</div>
                  <div class="heat-bar"><i style="width:${heatOf(p.id)}%;background:${p.color}"></i></div>
                  <div class="pc-stat">
                    <div class="ps"><div class="ps-v">${cnt}</div><div class="ps-l">已分发</div></div>
                    <div class="ps"><div class="ps-v">${p.trending.length}</div><div class="ps-l">热门话题</div></div>
                    <div class="ps"><div class="ps-v">${p.radar.depth}</div><div class="ps-l">深度指数</div></div>
                  </div>
                </div>`;
              }).join('')}
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <h3>分发快捷入口</h3>
          </div>
          <div class="card-body" style="display:flex;flex-direction:column;gap:10px">
            <button class="btn btn-primary btn-lg" data-act="go-distribute" style="justify-content:flex-start">
              ${ui().icon('send', 16)} 前往分发工作台
              <span style="margin-left:auto;font-size:11px;opacity:.8">改写 → 发布</span>
            </button>
            <button class="btn btn-ghost btn-lg" data-act="import" style="justify-content:flex-start">
              ${ui().icon('upload', 16)} 导入新文章
              <span style="margin-left:auto;font-size:11px;color:var(--ink-3)">支持粘贴 Markdown</span>
            </button>
            <button class="btn btn-ghost btn-lg" data-act="go-profile" style="justify-content:flex-start">
              ${ui().icon('user', 16)} ${portrait ? '更新用户画像' : '创建用户画像'}
              <span style="margin-left:auto;font-size:11px;color:var(--ink-3)">5 步问答</span>
            </button>
            <button class="btn btn-ghost btn-lg" data-act="go-accounts" style="justify-content:flex-start">
              ${ui().icon('key', 16)} 平台账号登录
              <span style="margin-left:auto;font-size:11px;color:var(--ink-3)">CSDN / 微信 / 小红书 / 知乎</span>
            </button>
            <button class="btn btn-ghost btn-lg" data-act="go-history" style="justify-content:flex-start">
              ${ui().icon('clock', 16)} 查看发布记录
              <span style="margin-left:auto;font-size:11px;color:var(--ink-3)">${history.length} 条</span>
            </button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <h3>近期文章</h3>
          <button class="btn btn-ghost btn-sm more" data-act="go-library">${ui().icon('chevronRight', 14)} 全部</button>
        </div>
        <div class="card-body" style="padding-top:6px">
          ${articles.slice(0, 4).map(a => `
            <div class="article-row" data-aid="${a.id}" data-act="open-article">
              <div style="flex:none">${ui().icon('fileText', 16)}</div>
              <div class="ar-main">
                <div class="ar-title">${ui().esc(a.title)}</div>
                <div class="ar-meta">
                  <span class="tag ${tagClass(a.category)}">${a.category}</span>
                  <span>${a.wordCount} 字</span>
                  <span>${a.readMin} 分钟</span>
                  <span>${a.createdAt}</span>
                </div>
              </div>
              <span class="badge ${a.status === '已发布' ? 'badge-ok' : 'badge-warn'}">${a.status}</span>
            </div>`).join('') || '<div class="empty"><div class="empty-ic">' + ui().icon('book', 26) + '</div><h4>还没有文章</h4><p>点击右上角「导入文章」开始创作</p></div>'}
        </div>
      </div>`;

    /* 事件：多个同名按钮需全部绑定 */
    bindAll(root, '[data-act="import"]', () => CP.importArticle());
    bindAll(root, '[data-act="go-distribute"]', () => location.hash = '#/distribute');
    bindAll(root, '[data-act="go-audience"]', () => location.hash = '#/audience');
    bindAll(root, '[data-act="go-profile"]', () => location.hash = '#/profile');
    bindAll(root, '[data-act="go-library"]', () => location.hash = '#/library');
    bindAll(root, '[data-act="go-history"]', () => location.hash = '#/history');
    bindAll(root, '[data-act="go-accounts"]', () => location.hash = '#/accounts');
    root.querySelectorAll('[data-step]').forEach(el => {
      el.addEventListener('click', () => {
        const k = el.dataset.step;
        location.hash = k === 'profile' ? '#/profile' : k === 'sniff' ? '#/audience' : k === 'rewrite' ? '#/distribute' : '#/history';
      });
    });
    root.querySelectorAll('[data-plat]').forEach(el => {
      el.addEventListener('click', () => { location.hash = '#/audience'; });
    });
    root.querySelectorAll('[data-act="open-article"]').forEach(el => {
      el.addEventListener('click', () => {
        CP.actions.setActiveArticle(el.dataset.aid);
        CP.openArticleDetail(el.dataset.aid);
      });
    });
  });

  /* ---------- 辅助 ---------- */
  function bindAll(root, sel, fn) {
    root.querySelectorAll(sel).forEach(el => el.addEventListener('click', fn));
  }

  function tagClass(cat) {
    const map = { '技术干货': 'tag-tech', '职场成长': 'tag-career', '生活方式': 'tag-life', '学习方法': 'tag-study', '产品设计': 'tag-product', '商业财经': 'tag-business', '行业观察': 'tag-career', '效率工具': 'tag-study', '个人成长': 'tag-life', '评测': 'tag-tech', '科普': 'tag-study' };
    return map[cat] || 'tag-default';
  }
  CP.tagClass = tagClass;

  function avgScore(history) {
    const valid = history.filter(h => h.score > 0);
    if (!valid.length) return '—';
    return Math.round(valid.reduce((s, h) => s + h.score, 0) / valid.length);
  }

  function heatOf(pid) {
    const map = { csdn: 82, wechat: 76, xhs: 91, zhihu: 69 };
    return map[pid] || 70;
  }
})();
