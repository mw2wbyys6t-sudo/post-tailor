/* =========================================================
   ContentPort · 受众嗅探（audience.js）
   平台受众分析：扫描动画 → 每平台报告（画像/热度/风格建议/雷达）
   ========================================================= */
window.CP = window.CP || {};

(function () {
  const ui = () => CP.ui;
  const S = () => CP.state;
  const M = () => CP.mock;

  let reports = null;   // 本次会话嗅探结果
  let scanning = false;

  CP.registerPage('audience', (root) => {
    root.innerHTML = `
      <div class="page-head fade-up">
        <div>
          <h2>受众嗅探</h2>
          <p>模拟爬虫分析各平台读者画像，作为「受众自适应改写」的依据。</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" id="a-scan">${ui().icon('radar', 15)} 开始嗅探</button>
          <button class="btn btn-ghost" id="a-scan-all">${ui().icon('refresh', 14)} 重新嗅探</button>
        </div>
      </div>
      <div class="sniff-hero fade-up" id="a-hero"></div>
      <div id="a-report"></div>`;

    root.querySelector('#a-scan').addEventListener('click', runScan);
    root.querySelector('#a-scan-all').addEventListener('click', runScan);
    renderHero(root);
    if (reports) renderReport(root);
  });

  function renderHero(root) {
    const hero = root.querySelector('#a-hero');
    if (scanning) {
      hero.innerHTML = `
        <div class="sniff-radar">
          <div class="scan-line"></div>
          <div class="scan-core"></div>
        </div>
        <div class="sniff-status">
          <div class="ss-t">正在嗅探 ${M().PLATFORMS.length} 个平台…</div>
          <div class="ss-d">正在分析平台受众画像与内容偏好</div>
          <ul class="sniff-steps" id="a-steps">
            ${M().SNIFF_STEPS.map((s, i) => `<li data-step="${i}"><span class="step-dot"></span>${s}</li>`).join('')}
          </ul>
        </div>`;
    } else {
      hero.innerHTML = `
        <div class="sniff-radar">
          <div class="scan-core" style="box-shadow:none;background:var(--surface-3)">
            ${ui().icon('radar', 26)}
          </div>
        </div>
        <div class="sniff-status">
          <div class="ss-t">${S().sniffDone ? '嗅探完成，报告已就绪' : '嗅探你的内容受众'}</div>
          <div class="ss-d">${S().sniffDone ? '各平台读者画像已缓存，可点击「重新嗅探」获取最新快照。' : '系统会分析 4 个平台的读者年龄、职业、阅读习惯与内容偏好，生成适配建议。'}</div>
          <button class="btn btn-primary" id="a-hero-scan">${ui().icon('radar', 15)} 开始嗅探</button>
        </div>`;
      hero.querySelector('#a-hero-scan').addEventListener('click', runScan);
    }
  }

  async function runScan() {
    if (scanning) return;
    scanning = true;
    const root = document.getElementById('content');
    renderHero(root);
    root.querySelector('#a-report').innerHTML = '';

    const steps = root.querySelectorAll('#a-steps li');
    let done = 0;
    const timer = setInterval(() => {
      if (done >= M().SNIFF_STEPS.length) { clearInterval(timer); return; }
      steps[done].classList.add('done');
      if (done + 1 < M().SNIFF_STEPS.length) steps[done + 1].classList.add('running');
      done++;
    }, 620);

    const res = await CP.api.runSniff(M().PLATFORMS.map(p => p.id));
    clearInterval(timer);
    scanning = false;
    reports = res.data;
    renderHero(root);
    renderReport(root);
    CP.updateSniffBadge();
    ui().toast('4 个平台的受众分析完成', 'ok');
  }

  function renderReport(root) {
    const wrap = root.querySelector('#a-report');
    if (!reports) return;
    const first = reports[0].platformId;
    wrap.innerHTML = `
      <div class="compare-head audience-report" style="border:1px solid var(--border);border-radius:var(--radius-md);margin-bottom:16px">
        <span class="dt-lbl">平台</span>
        <div class="compare-tabs" id="a-tabs">
          ${reports.map(r => {
            const p = M().PLATFORMS.find(x => x.id === r.platformId);
            return `<div class="compare-tab ${r.platformId === first ? 'active' : ''}" data-pid="${r.platformId}">
              <span class="plat-dot" style="background:${p.color}"></span>${p.name}
            </div>`;
          }).join('')}
        </div>
        <span class="badge badge-ok">${ui().icon('checkCircle', 12)} 实时快照 ${reports[0].snapshot.sampledAt}</span>
      </div>
      <div id="a-panel"></div>`;

    wrap.querySelectorAll('.compare-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        wrap.querySelectorAll('.compare-tab').forEach(t => t.classList.toggle('active', t === tab));
        renderPanel(wrap.querySelector('#a-panel'), tab.dataset.pid);
      });
    });
    renderPanel(wrap.querySelector('#a-panel'), first);
  }

  function renderPanel(panel, pid) {
    const r = reports.find(x => x.platformId === pid);
    const p = M().PLATFORMS.find(x => x.id === pid);
    panel.innerHTML = `
      <div class="report-grid stagger">
        <div class="card audience-report">
          <div class="card-head">
            <h3>读者画像</h3>
            <span class="badge badge-gray more">${ui().icon('users', 12)} 快照热度 ${r.snapshot.heatIndex}</span>
          </div>
          <div class="card-body">
            <div class="fact-grid">
              <div class="fact"><div class="f-l">年龄分布</div><div class="f-v">${r.audience.age}</div></div>
              <div class="fact"><div class="f-l">性别比例</div><div class="f-v">${r.audience.gender}</div></div>
              <div class="fact"><div class="f-l">核心人群</div><div class="f-v">${r.audience.role}</div></div>
              <div class="fact"><div class="f-l">学历水平</div><div class="f-v">${r.audience.edu}</div></div>
            </div>
            <div class="divider"></div>
            <div class="label" style="display:flex;align-items:center;gap:7px">${ui().icon('activity', 14)} 阅读习惯</div>
            <div style="display:flex;flex-wrap:wrap;gap:7px;margin-top:8px">
              ${r.audience.habits.map(h => `<span class="trend-chip">${h}</span>`).join('')}
            </div>
          </div>
        </div>

        <div class="card audience-report">
          <div class="card-head">
            <h3>内容偏好</h3>
          </div>
          <div class="card-body">
            <div class="fact-grid" style="grid-template-columns:1fr 1fr">
              <div class="fact"><div class="f-l">推荐字数</div><div class="f-v">${r.audience.wordPref}</div></div>
              <div class="fact"><div class="f-l">标题策略</div><div class="f-v" style="font-size:11.5px">${r.audience.titleLen}</div></div>
            </div>
            <div class="divider"></div>
            <div class="label" style="display:flex;align-items:center;gap:7px">${ui().icon('flame', 14)} 平台热门话题</div>
            <div class="trend-chips" style="margin-top:8px">
              ${r.trending.map((t, i) => `<span class="trend-chip" style="background:${i < 2 ? p.color : 'var(--surface-3)'};color:${i < 2 ? '#fff' : 'var(--ink-2)'}"># ${t}</span>`).join('')}
            </div>
          </div>
        </div>

        <div class="card audience-report">
          <div class="card-head">
            <h3>受众适配风格建议</h3>
            <span class="tag tag-default more">基于画像生成</span>
          </div>
          <div class="card-body">
            <ul class="rule-list">
              ${r.styleRules.map(s => `<li><span class="rl-ic">${ui().icon('sparkles', 14)}</span><span>${s}</span></li>`).join('')}
            </ul>
          </div>
        </div>

        <div class="card audience-report">
          <div class="card-head">
            <h3>平台特征雷达</h3>
            <span class="tag more" style="background:${p.color}11;color:${p.color}">${p.tagline}</span>
          </div>
          <div class="radar-wrap">
            ${Object.keys(r.radar).map(k => `
              <div class="radar-row">
                <div class="rr-l">${radarLabel(k)}</div>
                <div class="rr-bar"><i style="width:${r.radar[k]}%;background:linear-gradient(90deg,${p.color},${p.color}cc)"></i></div>
                <div class="rr-v">${r.radar[k]}</div>
              </div>`).join('')}
          </div>
          <div class="card-body" style="padding-top:0">
            <div style="display:flex;gap:10px;flex-wrap:wrap">
              <div class="fact" style="flex:1;min-width:120px"><div class="f-l">活跃时段</div><div class="f-v">${r.snapshot.activeTime.join(' · ')}</div></div>
              <div class="fact" style="flex:1;min-width:120px"><div class="f-l">热度增长</div><div class="f-v" style="color:var(--ok)">↑ ${r.snapshot.growth}</div></div>
            </div>
          </div>
        </div>
      </div>`;
  }

  function radarLabel(k) {
    return { info: '信息密度', depth: '内容深度', tone: '语气亲和', visual: '视觉排版', interaction: '互动引导' }[k] || k;
  }
})();
