/* =========================================================
   ContentPort · 用户画像（profile.js）
   5 步问答式自画像向导 + 画像结果卡片 + 雷达图
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
    influence: 'sparkles', record: 'pen', job: 'fileText', beginner: 'bookOpen',
    mid: 'trending', expert: 'target', broad: 'users', decision: 'chart',
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
      wizardAnswers = { identity: null, domain: [], goals: [], readers: [], frequency: null };
    }
    const answers = wizardAnswers;

    function render() {
      const q = questions[stepIdx];
      root.innerHTML = `
        <div class="page-head fade-up">
          <div>
            <h2>用户画像</h2>
            <p>通过 5 个问题了解你，让每次分发都更懂你的创作定位。</p>
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
              <div class="opt-grid">
                ${q.options.map((o, i) => {
                  const sel = q.type === 'single' ? answers[q.key] === o.value : answers[q.key].includes(o.value);
                  return `
                  <div class="opt ${sel ? 'on' : ''}" data-opt="${o.value}">
                    <div class="opt-ic" style="color:var(--primary)">${ui().icon(OPT_ICON[o.value] || 'check', 17)}</div>
                    <div>
                      <div class="opt-l">${o.label}</div>
                      ${o.desc ? `<div class="opt-d">${o.desc}</div>` : ''}
                    </div>
                  </div>`;
                }).join('')}
              </div>
            </div>
            <div class="wizard-foot">
              <button class="btn btn-ghost" id="w-prev" ${stepIdx === 0 ? 'disabled' : ''}>${ui().icon('chevronRight', 14)} 上一步</button>
              <button class="btn btn-primary" id="w-next">${stepIdx === questions.length - 1 ? '生成画像' : '下一步'} ${ui().icon('arrowRight', 15)}</button>
            </div>
          </div>
        </div>`;

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
        const ok = q.type === 'single' ? !!val : val.length > 0;
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
        nickname: '创作者' + Math.floor(Math.random() * 900 + 100),
        identity: answers.identity,
        domain: answers.domain,
        goals: answers.goals,
        readers: answers.readers,
        frequency: answers.frequency,
        domainLabels: labelOf('domain', answers.domain),
        goalLabels: labelOf('goals', answers.goals),
        readerLabels: labelOf('readers', answers.readers),
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
    const domainTags = (p.domainLabels || []).map(d => `<span class="tag tag-tech">${d}</span>`).join(' ') || '<span class="tag tag-default">未选择</span>';
    const goalTags = (p.goalLabels || []).map(d => `<span class="tag tag-study">${d}</span>`).join(' ') || '<span class="tag tag-default">未选择</span>';

    root.innerHTML = `
      <div class="page-head fade-up">
        <div>
          <h2>用户画像</h2>
          <p>这是系统对你的创作定位理解，可随时重新问答调整。</p>
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
            <div class="ah-sub">${ui().esc(identityLabel)} · 创建于 ${p.createdAt}</div>
          </div>
          <div class="profile-item">
            <div class="pi-ic">${ui().icon('pen', 16)}</div>
            <div><div class="pi-l">主要领域</div><div class="pi-v">${domainTags}</div></div>
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
            <div class="pi-ic">${ui().icon('clock', 16)}</div>
            <div><div class="pi-l">发文节奏</div><div class="pi-v">${ui().esc(freqLabel(p.frequency))}</div></div>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:18px">
          <div class="card">
            <div class="card-head"><h3>创作倾向雷达</h3></div>
            <div class="radar-wrap">
              <div class="radar-title">${ui().icon('activity', 15)} 基于画像推导的内容特质</div>
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
                <li><span class="rl-ic">${ui().icon('sparkles', 15)}</span><span>基于你的「${identityLabel}」定位，建议以<strong>知乎 + CSDN</strong> 承载深度内容，<strong>小红书</strong> 做轻量化引流。</span></li>
                <li><span class="rl-ic">${ui().icon('trending', 15)}</span><span>你的目标包含「${ui().esc((p.goalLabels || ['建立影响力']).join('、'))}」，系统会优先优化标题与开头钩子。</span></li>
                <li><span class="rl-ic">${ui().icon('users', 15)}</span><span>目标读者为「${ui().esc((p.readerLabels || ['泛大众']).join('、'))}」时，将自动降低术语密度、增加案例。</span></li>
              </ul>
            </div>
          </div>
        </div>
      </div>`;

    root.querySelector('#p-rebuild').addEventListener('click', () => {
      CP.actions.setPortrait(null);
      renderWizard(root);
    });
    root.querySelector('[data-act="go-distribute"]').addEventListener('click', () => location.hash = '#/distribute');
  }

  function freqLabel(f) {
    return { daily: '几乎每天', weekly: '每周 1-3 篇', biweekly: '两周一篇', monthly: '每月几篇' }[f] || f;
  }

  function radarData(p) {
    const boost = { daily: 12, weekly: 10, biweekly: 6, monthly: 4 }[p.frequency] || 6;
    const domain = p.domain || [];
    const base = {
      '内容密度': 58 + (domain.includes('tech') ? 22 : 0) + boost,
      '表达温度': 62 + (domain.includes('life') || domain.includes('career') ? 18 : 4),
      '观点强度': 60 + (domain.includes('product') || domain.includes('business') ? 18 : 6),
      '专业深度': 56 + (domain.includes('tech') || domain.includes('business') ? 24 : 4) + boost,
      '案例丰富': 64 + (domain.includes('study') || domain.includes('career') ? 16 : 6)
    };
    const out = {};
    Object.keys(base).forEach(k => out[k] = Math.min(96, base[k]));
    return out;
  }
})();
