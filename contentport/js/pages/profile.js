/* =========================================================
   OmniDraft · 用户画像（profile.js）
   关键问题问答向导 + 画像结果卡片 + 实时推导的创作倾向
   所有答案只保存在本机，不上传
   ========================================================= */
window.CP = window.CP || {};

(function () {
  const ui = () => CP.ui;
  const S = () => CP.state;
  const M = () => CP.mock;

  /* 选项图标映射 */
  const OPT_ICON = {
    tech: 'zap', worker: 'briefcase', student: 'bookOpen', creator: 'pen',
    career: 'trending', life: 'heart', study: 'lightbulb',
    product: 'target', business: 'chart', fans: 'users', income: 'chart',
    influence: 'sparkles', record: 'pen', job: 'fileText',
    entry: 'bookOpen', mid: 'trending', expert: 'target',
    beginner: 'bookOpen', broad: 'users', decision: 'chart',
    rigorous: 'target', warm: 'heart', sharp: 'zap', story: 'pen',
    clickbait: 'alert', slang: 'trending', jargon: 'bookOpen', emoji: 'sparkles', marketing: 'send',
    daily: 'refresh', weekly: 'clock', biweekly: 'clock', monthly: 'calendar'
  };

  CP.registerPage('profile', (root) => {
    const portrait = S().portrait;
    if (portrait) renderProfile(root, portrait);
    else renderWizard(root);
  });

  /* ================= 问答向导 ================= */
  let wizardAnswers = null;  // 跨步骤持久（避免重渲染丢答案）

  function renderWizard(root, stepIdx = 0) {
    const questions = M().PORTRAIT_QUESTIONS;
    if (!wizardAnswers) {
      wizardAnswers = {};
      questions.forEach(q => { wizardAnswers[q.key] = q.type === 'multi' ? [] : ''; });
    }
    const answers = wizardAnswers;

    function render() {
      const q = questions[stepIdx];
      const isText = q.type === 'text';
      root.innerHTML = `
        <div class="page-head fade-up">
          <div>
            <h2>用户画像</h2>
            <p>通过 ${questions.length} 个关键问题了解你的创作特点，答案只保存在本机。</p>
          </div>
        </div>
        <div class="card portrait-wizard fade-up">
          <div class="card-body" style="padding:34px 38px">
            <div class="wizard-progress">
              ${questions.map((_, i) => `<i class="${i <= stepIdx ? 'on' : ''}"></i>`).join('')}
            </div>
            <div class="wizard-step" data-step-wrap>
              <div class="wizard-q">${q.title}</div>
              <div class="wizard-d">${q.desc}</div>
              ${isText
                ? `<input class="input" id="w-text" style="margin-top:18px;max-width:420px" placeholder="${ui().esc(q.placeholder || '')}" value="${ui().esc(answers[q.key] || '')}" />`
                : `<div class="opt-grid">
                    ${q.options.map(o => {
                      const sel = q.type === 'single' ? answers[q.key] === o.value : (answers[q.key] || []).includes(o.value);
                      return `
                      <div class="opt ${sel ? 'on' : ''}" data-opt="${o.value}">
                        <div class="opt-ic" style="color:var(--primary)">${ui().icon(OPT_ICON[o.value] || 'check', 17)}</div>
                        <div>
                          <div class="opt-l">${o.label}</div>
                          ${o.desc ? `<div class="opt-d">${o.desc}</div>` : ''}
                        </div>
                      </div>`;
                    }).join('')}
                  </div>`}
            </div>
            <div class="wizard-foot">
              <button class="btn btn-ghost" id="w-prev" ${stepIdx === 0 ? 'disabled' : ''}>${ui().icon('chevronRight', 14)} 上一步</button>
              <button class="btn btn-primary" id="w-next">${stepIdx === questions.length - 1 ? '生成画像' : '下一步'} ${ui().icon('arrowRight', 15)}</button>
            </div>
          </div>
        </div>`;

      if (isText) {
        const input = root.querySelector('#w-text');
        input.addEventListener('input', () => { answers[q.key] = input.value; });
        input.addEventListener('keydown', e => { if (e.key === 'Enter') root.querySelector('#w-next').click(); });
      }

      root.querySelectorAll('[data-opt]').forEach(el => {
        el.addEventListener('click', () => {
          const v = el.dataset.opt;
          if (q.type === 'single') {
            answers[q.key] = v;
            root.querySelectorAll('[data-opt]').forEach(e => e.classList.toggle('on', e === el));
          } else {
            const i = answers[q.key].indexOf(v);
            if (i >= 0) answers[q.key].splice(i, 1); else answers[q.key].push(v);
            el.classList.toggle('on');
          }
        });
      });

      root.querySelector('#w-prev').addEventListener('click', () => {
        if (stepIdx > 0) renderWizard(root, stepIdx - 1);
      });
      root.querySelector('#w-next').addEventListener('click', async () => {
        const val = answers[q.key];
        const ok = q.type === 'text' ? true : q.type === 'single' ? !!val : Array.isArray(val) && val.length > 0;
        if (!ok) {
          ui().toast(q.type === 'single' ? '请选择一个选项' : '请至少选择一个', 'warn');
          return;
        }
        if (stepIdx < questions.length - 1) {
          renderWizard(root, stepIdx + 1);
        } else {
          await submit();
        }
      });
    }

    async function submit() {
      const btns = root.querySelectorAll('button');
      btns.forEach(b => b.disabled = true);
      const portrait = {
        nickname: String(answers.name || '').trim() || '创作者',
        identity: answers.identity,
        domain: answers.domain,
        expertise: answers.expertise,
        goals: answers.goals,
        readers: answers.readers,
        voice: answers.voice,
        avoid: answers.avoid,
        frequency: answers.frequency,
        identityLabel: labelOf('identity', [answers.identity])[0] || '',
        domainLabels: labelOf('domain', answers.domain),
        expertiseLabel: labelOf('expertise', [answers.expertise])[0] || '',
        goalLabels: labelOf('goals', answers.goals),
        readerLabels: labelOf('readers', answers.readers),
        voiceLabel: labelOf('voice', [answers.voice])[0] || '',
        avoidLabels: labelOf('avoid', answers.avoid),
        createdAt: new Date().toISOString().slice(0, 10)
      };
      await CP.api.savePortrait(portrait);
      ui().toast('用户画像已生成，分发将更懂你', 'ok');
      renderProfile(root, S().portrait);
    }

    render();
  }

  function labelOf(key, values) {
    const q = M().PORTRAIT_QUESTIONS.find(x => x.key === key);
    return q.options.filter(o => values.includes(o.value)).map(o => o.label);
  }

  /* ================= 画像结果 ================= */
  function renderProfile(root, p) {
    const identityLabel = labelOf('identity', [p.identity])[0] || '创作者';
    const radar = radarData(p);
    const advice = buildAdvice(p);
    const domainTags = (p.domainLabels || []).map(d => `<span class="tag tag-tech">${d}</span>`).join(' ') || '<span class="tag tag-default">未选择</span>';
    const goalTags = (p.goalLabels || []).map(d => `<span class="tag tag-study">${d}</span>`).join(' ') || '<span class="tag tag-default">未选择</span>';
    const avoidTags = (p.avoidLabels || []).map(d => `<span class="tag tag-default">${d}</span>`).join(' ') || '<span class="tag tag-default">未设置</span>';

    root.innerHTML = `
      <div class="page-head fade-up">
        <div>
          <h2>用户画像</h2>
          <p>这是系统根据你的问答在本地推导出的创作定位，可随时重新问答调整。</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-ghost" id="p-rebuild">${ui().icon('refresh', 14)} 重新问答</button>
          <button class="btn btn-primary" data-act="go-distribute">${ui().icon('send', 15)} 去分发</button>
        </div>
      </div>

      <div class="profile-grid fade-up">
        <div class="card" style="align-self:start">
          <div class="avatar-hero">
            <div class="ah-avatar">${ui().esc((p.nickname || '创')[0]).toUpperCase()}</div>
            <div class="ah-name">${ui().esc(p.nickname || '创作者')}</div>
            <div class="ah-sub">${ui().esc(identityLabel)} · 创建于 ${p.createdAt || '—'}</div>
          </div>
          <div class="profile-item">
            <div class="pi-ic">${ui().icon('pen', 16)}</div>
            <div><div class="pi-l">主要领域</div><div class="pi-v">${domainTags}</div></div>
          </div>
          <div class="profile-item">
            <div class="pi-ic">${ui().icon('target', 16)}</div>
            <div><div class="pi-l">专业程度</div><div class="pi-v">${ui().esc(p.expertiseLabel || '未设置')}</div></div>
          </div>
          <div class="profile-item">
            <div class="pi-ic">${ui().icon('target', 16)}</div>
            <div><div class="pi-l">核心目标</div><div class="pi-v">${goalTags}</div></div>
          </div>
          <div class="profile-item">
            <div class="pi-ic">${ui().icon('users', 16)}</div>
            <div><div class="pi-l">目标读者</div><div class="pi-v">${ui().esc((p.readerLabels || []).join('、') || '未选择')}</div></div>
          </div>
          <div class="profile-item">
            <div class="pi-ic">${ui().icon('zap', 16)}</div>
            <div><div class="pi-l">表达风格</div><div class="pi-v">${ui().esc(p.voiceLabel || '未设置')}</div></div>
          </div>
          <div class="profile-item">
            <div class="pi-ic">${ui().icon('alert', 16)}</div>
            <div><div class="pi-l">避免表达</div><div class="pi-v">${avoidTags}</div></div>
          </div>
          <div class="profile-item">
            <div class="pi-ic">${ui().icon('clock', 16)}</div>
            <div><div class="pi-l">发文节奏</div><div class="pi-v">${ui().esc(freqLabel(p.frequency))}</div></div>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:18px">
          <div class="card">
            <div class="card-head">
              <h3>创作倾向</h3>
              <span class="hint">由你的问答实时推导</span>
            </div>
            <div class="radar-wrap">
              <div class="radar-title">${ui().icon('activity', 15)} 数值随画像变化，不使用平台数据</div>
              ${Object.keys(radar).map(k => `
                <div class="radar-row">
                  <div class="rr-l">${k}</div>
                  <div class="rr-bar"><i style="width:${radar[k]}%;background:linear-gradient(90deg,#0F766E,#0FA08F)"></i></div>
                  <div class="rr-v">${radar[k]}</div>
                </div>`).join('')}
            </div>
          </div>
          <div class="card">
            <div class="card-head"><h3>分发建议</h3></div>
            <div class="card-body">
              <ul class="rule-list">
                ${advice.map(a => `<li><span class="rl-ic">${ui().icon(a.icon, 15)}</span><span>${a.html}</span></li>`).join('')}
              </ul>
              <div class="hint" style="margin-top:12px">以上建议由你的答案在本地计算，不会上传任何数据。本地引擎会落实开头偏好；其余偏好写入改写约束，接入 AI 后完整执行。</div>
            </div>
          </div>
        </div>
      </div>`;

    root.querySelector('#p-rebuild').addEventListener('click', () => {
      wizardAnswers = {
        name: p.nickname && p.nickname !== '创作者' ? p.nickname : '',
        identity: p.identity || '',
        domain: (p.domain || []).slice(),
        expertise: p.expertise || '',
        goals: (p.goals || []).slice(),
        readers: (p.readers || []).slice(),
        voice: p.voice || '',
        avoid: (p.avoid || []).slice(),
        frequency: p.frequency || ''
      };
      renderWizard(root);
    });
    root.querySelector('[data-act="go-distribute"]').addEventListener('click', () => location.hash = '#/distribute');
  }

  function freqLabel(f) {
    return { daily: '几乎每天', weekly: '每周 1-3 篇', biweekly: '两周一篇', monthly: '每月几篇' }[f] || f;
  }

  function platformName(id) {
    const p = M().PLATFORMS.find(x => x.id === id);
    return p ? p.name : id;
  }

  /* 由问答实时计算平台优先级：规则透明，不读取任何平台统计数据 */
  function recommendPlatforms(p) {
    const scores = {};
    M().PLATFORMS.forEach(x => { scores[x.id] = 0; });
    const add = (id, n) => { if (scores[id] != null) scores[id] += n; };
    (p.domain || []).forEach(d => {
      if (d === 'tech') { add('csdn', 3); add('zhihu', 2); }
      if (d === 'career') { add('wechat', 3); add('zhihu', 2); add('xhs', 2); }
      if (d === 'life') { add('xhs', 3); add('wechat', 1); }
      if (d === 'study') { add('xhs', 2); add('zhihu', 2); }
      if (d === 'product') { add('zhihu', 2); add('wechat', 2); }
      if (d === 'business') { add('zhihu', 2); add('wechat', 2); add('csdn', 1); }
    });
    (p.readers || []).forEach(r => {
      if (r === 'beginner') { add('xhs', 3); add('wechat', 1); }
      if (r === 'mid') { add('csdn', 1); add('zhihu', 1); }
      if (r === 'expert') { add('zhihu', 3); add('csdn', 2); }
      if (r === 'decision') { add('zhihu', 2); add('wechat', 2); }
      if (r === 'broad') { add('xhs', 3); add('wechat', 1); }
    });
    if (p.voice === 'rigorous') { add('zhihu', 2); add('csdn', 2); }
    if (p.voice === 'warm') { add('wechat', 3); add('xhs', 2); }
    if (p.voice === 'sharp') { add('zhihu', 2); add('wechat', 1); }
    if (p.voice === 'story') { add('wechat', 3); add('xhs', 2); }
    if (p.expertise === 'expert') { add('zhihu', 2); add('csdn', 1); }
    if (p.expertise === 'entry') { add('xhs', 2); }

    const ranked = M().PLATFORMS
      .map((x, i) => ({ id: x.id, score: scores[x.id], i }))
      .sort((a, b) => b.score - a.score || a.i - b.i);
    return { deep: ranked.slice(0, 2).map(x => x.id), light: ranked[2] ? ranked[2].id : '' };
  }

  function buildAdvice(p) {
    const out = [];
    const rec = recommendPlatforms(p);
    const deep = rec.deep.map(platformName).join(' + ');
    const light = rec.light ? platformName(rec.light) : '';
    out.push({
      icon: 'sparkles',
      html: `基于「${ui().esc((p.domainLabels || []).join('、') || '你的领域')}」的定位，建议以 <strong>${ui().esc(deep)}</strong> 承载深度内容${light ? `，<strong>${ui().esc(light)}</strong> 做轻量分发` : ''}。`
    });

    const voiceGuide = {
      rigorous: '开头会先给结论与要点，再展开论证。',
      warm: '开头会优先用共鸣式表达，句子更口语。',
      sharp: '开头会观点前置，少铺垫，句子更短。',
      story: '开头会优先用经历与场景带入。'
    }[p.voice];
    if (voiceGuide) out.push({ icon: 'zap', html: `你偏好「${ui().esc(p.voiceLabel)}」：${voiceGuide}` });

    const readerGuide = [];
    if ((p.readers || []).some(r => r === 'beginner' || r === 'broad')) readerGuide.push('降低术语密度，增加类比与案例');
    if ((p.readers || []).includes('expert')) readerGuide.push('保留专业细节与推导过程');
    if ((p.readers || []).includes('decision')) readerGuide.push('结论与决策清单前置');
    if ((p.readers || []).includes('mid')) readerGuide.push('按有经验读者的信息密度组织');
    if (readerGuide.length) {
      out.push({ icon: 'users', html: `目标读者「${ui().esc((p.readerLabels || []).join('、'))}」已写入约束：${readerGuide.join('；')}。` });
    }

    const expertiseGuide = {
      entry: '步骤清晰、可复现，补齐必要背景',
      mid: '保留方法细节，省略基础铺垫',
      expert: '保留判断、边界与取舍'
    }[p.expertise];
    if (expertiseGuide) out.push({ icon: 'target', html: `专业程度「${ui().esc(p.expertiseLabel)}」已写入约束：${expertiseGuide}。` });

    if ((p.avoidLabels || []).length) {
      out.push({ icon: 'alert', html: `「${ui().esc(p.avoidLabels.join('、'))}」已写入改写约束；若与平台硬性结构冲突，会在风险提示中标注。` });
    }
    return out;
  }

  function radarData(p) {
    const domain = p.domain || [];
    const readers = p.readers || [];
    const rigor = p.expertise === 'expert' ? 20 : p.expertise === 'mid' ? 10 : 3;
    const warm = p.voice === 'warm' ? 16 : p.voice === 'story' ? 12 : 0;
    const sharp = p.voice === 'sharp' ? 18 : p.voice === 'rigorous' ? 8 : 0;
    const pace = p.frequency === 'daily' ? 6 : p.frequency === 'weekly' ? 4 : p.frequency === 'biweekly' ? 2 : 0;
    const base = {
      '内容密度': 58 + (domain.includes('tech') ? 14 : 0) + rigor + pace,
      '表达温度': 58 + warm + (domain.includes('life') ? 12 : domain.includes('career') ? 8 : 0),
      '观点强度': 58 + sharp + (domain.includes('product') || domain.includes('business') ? 10 : 0),
      '专业深度': 52 + rigor + (domain.includes('tech') || domain.includes('business') ? 14 : 0),
      '案例丰富': 60 + (p.voice === 'story' ? 14 : 0) + (readers.includes('beginner') ? 8 : 0) + (domain.includes('career') || domain.includes('study') ? 8 : 0)
    };
    const out = {};
    Object.keys(base).forEach(k => { out[k] = Math.max(40, Math.min(96, base[k])); });
    return out;
  }
})();
