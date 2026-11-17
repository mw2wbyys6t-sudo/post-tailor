/* =========================================================
   ContentPort · 改写流水线（engine/pipeline.js）
   编排：analysis → plan → （AI 计划 → AI 成稿 → 本地质检 →
   按问题单修复一次）→ 兼容旧字段的结果
   无 AI / AI 失败：writer 确定性成稿兜底
   ========================================================= */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.CP = window.CP || {};
    window.CP.engine = window.CP.engine || {};
    window.CP.engine.pipeline = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ENGINE_VERSION = '2.0.0';
  const MAX_AI_CALLS = 3;
  const TIMEOUT_MS = 90000;

  function dep(name) {
    if (typeof CP !== 'undefined' && CP.engine && CP.engine[name]) return CP.engine[name];
    if (typeof require === 'function') {
      try { return require('./' + name + '.js'); } catch (e) { /* ignore */ }
    }
    throw new Error('引擎模块未加载：' + name);
  }

  /* ---------- 并发限制：最多 2 个 AI 请求同时进行 ---------- */
  let running = 0;
  const waiting = [];
  function withLimit(fn) {
    return new Promise((resolve, reject) => {
      const exec = () => {
        running++;
        Promise.resolve().then(fn).then(resolve, reject).finally(() => {
          running--;
          const next = waiting.shift();
          if (next) next();
        });
      };
      if (running < 2) exec();
      else waiting.push(exec);
    });
  }

  function withTimeout(promise, ms) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('AI 调用超时')), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  function parseJsonLoose(content) {
    let text = String(content || '').trim();
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) throw new Error('AI 未返回有效 JSON');
    return JSON.parse(text.slice(start, end + 1));
  }

  function digitsOf(text) {
    return String(text || '').match(/\d+(?:\.\d+)?/g) || [];
  }

  function charCount(text) {
    return String(text || '').replace(/\s/g, '').length;
  }

  function p0Violation(platform, text) {
    return (platform.taboo || []).some(t => t.level === 'P0' && t.re.test(text));
  }

  function validateDraft(draft, analysis, plan, platform) {
    if (!draft || typeof draft.title !== 'string' || typeof draft.body !== 'string') throw new Error('改写结果字段不完整');
    if (!draft.title.trim() || charCount(draft.body) < 80) throw new Error('改写结果为空或过短');
    const len = charCount(draft.body);
    if (len < plan.length.min * 0.4 || len > plan.length.max * 1.6) throw new Error('改写字数严重偏离目标区间');
    if (p0Violation(platform, draft.title + draft.body)) throw new Error('改写结果触发平台 P0 禁忌');
    const allowed = new Set(digitsOf([analysis.title, analysis.summary, analysis.body].join(' ')));
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'].forEach(n => allowed.add(n));
    const bad = digitsOf(draft.title + ' ' + draft.body).find(d => !allowed.has(d));
    if (bad) throw new Error('出现原文不存在的数字：' + bad);
    return true;
  }

  /* ---------- AI 提示词 ---------- */
  function planMessages(analysis, plan, platform, portrait) {
    const system = [
      `你是多平台爆款内容策划，精通${platform.name}的读者心理与推荐机制。`,
      '你的任务不是搬运，而是基于原文事实重新设计该平台的表达方案。',
      '只能输出合法 JSON，不要任何解释文字。',
      JSON.stringify({
        hookId: plan.hookId,
        structureRoles: plan.structureRoles,
        titleFormulaId: plan.titleFormulaId,
        title: plan.title,
        tags: plan.tags
      })
    ].join('\n');
    const user = [
      '【平台策略】',
      JSON.stringify({
        name: platform.name, tone: platform.audience.tone, role: platform.audience.role,
        habits: platform.audience.habits, length: plan.length, titles: platform.title,
        styleRules: platform.styleRules, cta: platform.cta, taboo: (platform.taboo || []).map(t => t.msg)
      }, null, 2),
      '【文章分析】',
      JSON.stringify({
        contentType: analysis.contentTypeLabel, thesis: analysis.thesis,
        keyPoints: analysis.keyPoints.slice(0, 6).map(k => k.text),
        numbers: analysis.numbers.map(n => n.raw),
        sectionTopics: analysis.sectionTopics
      }, null, 2),
      '【用户画像】' + JSON.stringify(portrait || {}),
      '请输出改写计划 JSON：{"angle":"切入角度","hookId":"钩子ID","structureRoles":["结构角色"],"titleFormulaId":"标题公式","title":"最终标题","tags":["标签"]}'
    ].join('\n');
    return [{ role: 'system', content: system }, { role: 'user', content: user }];
  }

  function draftMessages(analysis, plan, platform) {
    const system = [
      `你是${platform.name}的资深原生作者，写的稿子要像该平台土生土长。`,
      '硬性要求：',
      '1. 只使用原文事实与数字，不得编造新数据、案例或结论；',
      `2. 结构必须遵循：${plan.structureRoles.join(' → ')}；`,
      `3. 字数控制在 ${plan.length.min}-${plan.length.max} 字；`,
      `4. 标题使用：${plan.title}（可微调，但必须保留关键词「${plan.keyword}」）；`,
      '5. 合并本平台禁忌：' + (platform.taboo || []).map(t => t.msg).join('；'),
      '6. 输出合法 JSON：{"title":"标题","body":"markdown 正文","usedFacts":["用到的原文事实"]}',
      '不要输出 JSON 以外的任何文字。'
    ].join('\n');
    const user = [
      plan.brief,
      '【必须保留的原文要点】',
      plan.mustKeep.map(k => '- ' + k).join('\n'),
      '【原文】',
      analysis.body.slice(0, 12000),
      '请输出该平台的原生改写稿 JSON。'
    ].join('\n\n');
    return [{ role: 'system', content: system }, { role: 'user', content: user }];
  }

  function reviseMessages(draft, analysis, plan, platform, qa) {
    const system = [
      '你是严格的多平台内容质检编辑。根据问题单修改稿件，保留原有事实与数字，不得新增原文没有的信息。',
      `目标平台：${platform.name}；结构：${plan.structureRoles.join(' → ')}；字数：${plan.length.min}-${plan.length.max}。`,
      '输出合法 JSON：{"title":"标题","body":"markdown 正文"}。不要输出其他文字。'
    ].join('\n');
    const user = [
      '【质检问题单】',
      qa.issues.map(i => `- [${i.code}] ${i.msg}；修复建议：${i.fix}`).join('\n'),
      '【当前稿件】',
      draft.body,
      '【原文（事实来源）】',
      analysis.body.slice(0, 10000),
      '请输出修复后的完整 JSON。'
    ].join('\n\n');
    return [{ role: 'system', content: system }, { role: 'user', content: user }];
  }

  async function callAI(aiChat, messages, temperature) {
    return withLimit(() => withTimeout(
      aiChat(messages, { json: true, temperature, maxTokens: 6000 }),
      TIMEOUT_MS
    ));
  }

  function mergeAiPlan(aiPlan, plan, platform) {
    if (!aiPlan || typeof aiPlan !== 'object') return;
    const S = dep('strategies');
    if (aiPlan.hookId && S.HOOKS[aiPlan.hookId] && (plan.hookOptions || []).indexOf(aiPlan.hookId) >= 0) {
      plan.hookId = aiPlan.hookId;
    }
    if (typeof aiPlan.title === 'string' && aiPlan.title.trim()) {
      const t = aiPlan.title.trim();
      if (Array.from(t).length <= platform.title.max + 4 && !platform.title.banned.some(w => t.indexOf(w) >= 0)) {
        plan.title = t;
      }
    }
    if (typeof aiPlan.titleFormulaId === 'string' && platform.title.formulas.indexOf(aiPlan.titleFormulaId) >= 0) {
      plan.titleFormulaId = aiPlan.titleFormulaId;
    }
    if (Array.isArray(aiPlan.structureRoles)) {
      const valid = aiPlan.structureRoles.filter(r => plan.structureRoles.indexOf(r) >= 0);
      if (valid.length >= 3) {
        const map = {};
        plan.sections.forEach(s => { map[s.role] = s; });
        plan.sections = valid.filter(r => map[r]).map(r => map[r]);
        plan.structureRoles = valid.slice();
      }
    }
    if (Array.isArray(aiPlan.tags)) {
      const tags = aiPlan.tags.filter(t => typeof t === 'string' && t.trim()).map(t => t.trim().slice(0, 12));
      if (tags.length) plan.tags = Array.from(new Set(tags)).slice(0, platform.id === 'xhs' ? 5 : 4);
    }
    if (aiPlan.angle) plan.angle = String(aiPlan.angle).slice(0, 30);
  }

  function buildChanges(analysis, plan, draft, platform) {
    const labels = dep('planner').ROLE_LABEL || {};
    const firstOrig = analysis.sentences[0] ? analysis.sentences[0].text : analysis.thesis;
    const firstNew = String(draft.body || '').split('\n').find(l => l.trim() && !/^#{1,6}\s/.test(l)) || '';
    return [
      { dim: '标题', from: analysis.title, to: draft.title, reason: `${platform.name}偏好「${platform.audience.titleLen}」，使用「${plan.angle}」切入` },
      { dim: '开头', from: firstOrig.slice(0, 40) + (firstOrig.length > 40 ? '…' : ''), to: firstNew.slice(0, 60), reason: `匹配${platform.name}受众习惯：${platform.audience.habits[0]}` },
      { dim: '结构', from: '原文结构：' + (analysis.sectionTopics.join(' → ') || '无小标题'), to: plan.structureRoles.map(r => labels[r] || r).join(' → '), reason: `按${platform.name}推荐结构重组内容` },
      { dim: '语气', from: '原文语气', to: platform.audience.tone, reason: `目标受众「${platform.audience.role}」偏好${platform.audience.tone}` },
      { dim: '字数', from: analysis.charCount + ' 字', to: charCount(draft.body) + ' 字（目标 ' + plan.length.min + '-' + plan.length.max + '）', reason: `平台字数偏好 ${platform.audience.wordPref || plan.length.min + '-' + plan.length.max + ' 字'}` }
    ];
  }

  function compileResult(analysis, plan, platform, draft, qa, meta) {
    const mode = meta.usedAI ? 'hybrid' : 'local';
    return {
      platformId: platform.id,
      platformName: platform.name,
      platformColor: platform.color,
      title: draft.title,
      body: draft.body,
      changes: buildChanges(analysis, plan, draft, platform),
      score: qa.total,
      keywords: plan.tags,
      fitted: platform.audience.habits[0],
      quality: qa,
      algorithm: {
        engineVersion: ENGINE_VERSION,
        contentType: analysis.contentType,
        contentTypeLabel: analysis.contentTypeLabel,
        hookId: plan.hookId,
        structureId: plan.structureId,
        titleFormulaId: plan.titleFormulaId,
        mode,
        aiCalls: meta.aiCalls,
        errors: meta.errors
      },
      engine: mode,
      aiGenerated: meta.usedAI
    };
  }

  async function run(article, platformId, options) {
    const opts = options || {};
    const A = dep('analysis');
    const PR = dep('planner');
    const S = dep('strategies');
    const W = dep('writer');
    const Q = dep('quality');

    const analysis = opts.analysis || A.analyze(article);
    const platform = S.getPlatform(platformId);
    const plan = PR.buildPlan(analysis, platformId, opts.portrait || {});
    const errors = [];
    let usedAI = false;
    let aiCalls = 0;
    let draft = null;

    if (opts.aiChat) {
      // A. 计划（可选，失败沿用本地计划）
      if (opts.aiChat) {
        try {
          aiCalls++;
          const text = await callAI(opts.aiChat, planMessages(analysis, plan, platform, opts.portrait), 0.4);
          mergeAiPlan(parseJsonLoose(text), plan, platform);
        } catch (e) {
          errors.push('plan: ' + e.message);
        }
      }

      // B. 成稿（可重试一次）
      for (let attempt = 0; attempt < 2 && !draft; attempt++) {
        try {
          aiCalls++;
          const text = await callAI(opts.aiChat, draftMessages(analysis, plan, platform), attempt === 0 ? 0.75 : 0.2);
          const parsed = parseJsonLoose(text);
          validateDraft(parsed, analysis, plan, platform);
          draft = { title: String(parsed.title).trim().slice(0, 80), body: String(parsed.body).trim() };
          usedAI = true;
        } catch (e) {
          errors.push('draft' + (attempt + 1) + ': ' + e.message);
        }
      }
    }

    // 无 AI / AI 失败：确定性成稿
    if (!draft) {
      const out = W.write(analysis, plan, platform);
      draft = { title: out.title, body: out.body };
    }

    let qa = Q.check(draft, analysis, plan, platform);

    // C/D. 质检不过 → 带着问题单修复一次
    if (opts.aiChat && usedAI && (qa.total < 85 || qa.issues.some(i => i.level === 'P1')) && aiCalls < MAX_AI_CALLS) {
      try {
        aiCalls++;
        const text = await callAI(opts.aiChat, reviseMessages(draft, analysis, plan, platform, qa), 0.35);
        const parsed = parseJsonLoose(text);
        validateDraft(parsed, analysis, plan, platform);
        const revised = { title: String(parsed.title).trim().slice(0, 80), body: String(parsed.body).trim() };
        const qa2 = Q.check(revised, analysis, plan, platform);
        const newP0 = qa2.metrics.p0;
        if (qa2.total >= qa.total + 3 && !newP0) {
          draft = revised;
          qa = qa2;
        }
      } catch (e) {
        errors.push('revise: ' + e.message);
      }
    }

    return compileResult(analysis, plan, platform, draft, qa, { usedAI, aiCalls, errors });
  }

  return { run, ENGINE_VERSION, parseJsonLoose, validateDraft, withLimit };
});
