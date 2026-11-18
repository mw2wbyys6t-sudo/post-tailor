/* =========================================================
   OmniDraft · 改写流水线（engine/pipeline.js）
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

  /* 正文字数：图片与链接语法不计入，避免 base64 把字数撑爆 */
  function textLength(text) {
    return charCount(String(text || '')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'));
  }

  /* ---------- 配图：原文图片在改写稿中的保留策略 ----------
     图片优先平台（小红书、公众号）需要图，文本平台不复制图片，
     避免 base64 在多平台版本中重复占用本地存储。 */
  const IMAGE_LIMITS = { xhs: 3, wechat: 2, article: 50 };

  function stripImages(text) {
    return String(text || '').replace(/!\[[^\]]*\]\([^)]*\)/g, '');
  }

  function extractImages(md) {
    return String(md || '').match(/!\[[^\]]*\]\((?:https?:\/\/|data:image\/)[^)]+\)/g) || [];
  }

  function attachImages(body, images, platformId) {
    const limit = IMAGE_LIMITS[platformId] || 0;
    if (!limit || !images.length) return body;
    const picked = images.slice(0, limit);
    // 按空行切段，跳过标题行与代码块，把图片均匀插入正文段落之间
    const lines = String(body).split('\n');
    const blocks = [];
    let buf = [];
    let inCode = false;
    lines.forEach(line => {
      if (/^```/.test(line.trim())) inCode = !inCode;
      if (!inCode && !line.trim()) {
        if (buf.length) { blocks.push(buf.join('\n')); buf = []; }
        return;
      }
      buf.push(line);
    });
    if (buf.length) blocks.push(buf.join('\n'));
    if (!blocks.length) return body;

    const out = [];
    let inserted = 0;
    const step = Math.max(1, Math.floor(blocks.length / (picked.length + 1)));
    blocks.forEach((b, i) => {
      out.push(b);
      const isHeading = /^#{1,6}\s/.test(b.trim());
      if (inserted < picked.length && !isHeading && (i + 1) % step === 0) out.push(picked[inserted++]);
    });
    while (inserted < picked.length) out.push(picked[inserted++]);
    return out.join('\n\n');
  }

  /* ---------- 结构修复：模型常把「小标题」写成加粗行 ----------
     这里做确定性后处理，只调整排版与结构，不新增事实。 */
  function normalizeTitle(title, plan, platform) {
    const t = String(title || '').trim();
    const len = Array.from(t).length;
    const max = platform.title.max;
    const min = platform.title.min;
    if ((len > max || len < min) && plan.title) {
      const pl = Array.from(plan.title).length;
      if (pl >= min && pl <= max) return plan.title;
    }
    return t.slice(0, 80);
  }

  function convertBoldHeadings(body) {
    const lines = String(body).split('\n');
    let inCode = false;
    return lines.map(line => {
      const t = line.trim();
      if (/^```/.test(t)) { inCode = !inCode; return line; }
      if (inCode || !t) return line;
      // 整行加粗 → 小标题
      let m = t.match(/^\*\*([^*\n]{2,30})\*\*[。.：:]?$/);
      if (m) return '## ' + m[1].replace(/[。.：:]\s*$/, '');
      // 段落以加粗短语开头 → 小标题 + 正文
      m = t.match(/^\*\*([^*\n]{2,24})[。.：:]?\*\*\s*([\s\S]+)$/);
      if (m) return '## ' + m[1].replace(/[。.：:]\s*$/, '') + '\n\n' + m[2].trim();
      return line;
    }).join('\n');
  }

  function countHeadings(body) {
    return (String(body).match(/^#{1,6}\s+/gm) || []).length;
  }

  function countBullets(body) {
    return (String(body).match(/^\s*(?:[-*+]|\d+\.)\s+/gm) || []).length;
  }

  function ensureList(body, min, plan) {
    if (countBullets(body) >= min) return body;
    const items = (plan.mustKeep || []).slice(0, Math.max(2, min))
      .map(s => '- ' + String(s).replace(/\s+/g, ' ').slice(0, 50))
      .filter(s => s.length > 4);
    if (!items.length) return body;
    return body.trimEnd() + '\n\n## 核心要点\n\n' + items.join('\n');
  }

  function ensureHeading(body) {
    if (countHeadings(body) > 0) return body;
    const blocks = String(body).split(/\n{2,}/);
    const idx = blocks.findIndex(b => /^[-*+]\s|^\d+\.\s/.test(b.trim()));
    if (idx >= 0) {
      blocks.splice(idx, 0, '## 核心要点');
      return blocks.join('\n\n');
    }
    blocks.splice(Math.max(1, blocks.length - 1), 0, '## 核心要点');
    return blocks.join('\n\n');
  }

  function ensureBold(body) {
    if (/\*\*[^*\n]+\*\*/.test(body)) return body;
    const blocks = String(body).split(/\n{2,}/);
    for (let i = 0; i < blocks.length; i++) {
      const t = blocks[i].trim();
      if (!t || /^#{1,6}\s/.test(t) || /^```/.test(t) || /^[-*+]\s/.test(t) || /^\d+\.\s/.test(t)) continue;
      const m = t.match(/^([^。！？!?\n]{6,40})([。！？!?]?)([\s\S]*)$/);
      if (m) {
        blocks[i] = '**' + m[1] + '**' + m[2] + m[3];
        return blocks.join('\n\n');
      }
    }
    return body;
  }

  function ensureCTA(body, platform) {
    const tail = String(body).slice(-400);
    const kws = (platform.cta && platform.cta.keywords) || [];
    if (kws.some(k => tail.indexOf(k) >= 0)) return body;
    const text = platform.cta && platform.cta.text;
    return text ? String(body).trimEnd() + '\n\n' + text : body;
  }

  function splitLongParagraphs(body, max) {
    const blocks = String(body).split(/\n{2,}/);
    const out = [];
    let inCode = false;
    blocks.forEach(b => {
      const t = b.trim();
      if (/^```/.test(t)) { inCode = !inCode; out.push(b); return; }
      if (inCode || t.length <= max || /^#{1,6}\s/.test(t) || /^[-*+]\s|^\d+\.\s/.test(t) || /^\|/.test(t)) {
        out.push(b);
        return;
      }
      const parts = t.split(/(?<=[。！？!?])/).map(s => s.trim()).filter(Boolean);
      let buf = '';
      parts.forEach(p => {
        if (buf && (buf + p).length > max) { out.push(buf); buf = p; }
        else buf += p;
      });
      if (buf) out.push(buf);
    });
    return out.join('\n\n');
  }

  function ensureXhsFormat(body) {
    const EMOJIS = ['🔥', '✨', '📌', '✅', '💡'];
    const emojiRe = /[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu;
    let out = splitLongParagraphs(body, 50);
    const countEmoji = s => (s.match(emojiRe) || []).length;
    let need = Math.max(0, 3 - countEmoji(out));
    if (!need) return out;
    const lines = out.split('\n');
    let k = 0;
    // 优先给标题和列表加 emoji
    for (let i = 0; i < lines.length && need > 0; i++) {
      const t = lines[i].trim();
      if (/^#{1,6}\s/.test(t) && !/^#{1,6}\s*[\u{1F300}-\u{1FAFF}]/u.test(t)) {
        lines[i] = t.replace(/^(#{1,6})\s+/, '$1 ' + EMOJIS[k++ % EMOJIS.length] + ' ');
        need--;
      } else if (/^[-*+]\s/.test(t) && !/^[-*+]\s*[\u{1F300}-\u{1FAFF}]/u.test(t)) {
        lines[i] = t.replace(/^([-*+])\s+/, '$1 ' + EMOJIS[k++ % EMOJIS.length] + ' ');
        need--;
      }
    }
    out = lines.join('\n');
    // 还不够就点缀前三个短段落
    if (need > 0) {
      const blocks = out.split(/\n{2,}/);
      for (let i = 0; i < blocks.length && need > 0; i++) {
        const t = blocks[i].trim();
        if (!t || /^#{1,6}\s/.test(t) || /^```/.test(t) || /^[-*+]\s/.test(t)) continue;
        blocks[i] = EMOJIS[k++ % EMOJIS.length] + ' ' + t;
        need--;
      }
      out = blocks.join('\n\n');
    }
    return out;
  }

  function repairStructure(body, plan, platform) {
    let out = String(body || '').trim();
    out = convertBoldHeadings(out);
    if (platform.id === 'xhs') {
      out = ensureXhsFormat(out);
    }
    if (platform.id === 'wechat') {
      out = ensureBold(out);
    }
    if (platform.id === 'csdn' || platform.id === 'zhihu') {
      out = ensureList(out, platform.id === 'csdn' ? 1 : 2, plan);
    }
    out = ensureHeading(out);
    out = ensureCTA(out, platform);
    return out.replace(/\n{3,}/g, '\n\n').trim();
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
  const STRUCTURE_RULES = {
    csdn: ['至少 3 个 ## 小标题', '至少 1 个 - 列表或 1 个代码块', '结尾给一句总结或行动建议'],
    wechat: ['至少 2 个 ## 小标题', '至少 1 处 **加粗** 金句', '开头两句内给出结论', '结尾有互动引导'],
    xhs: ['至少 3 个 emoji', '70% 以上段落不超过 50 字', '标题不超过 20 字', '结尾提问或引导评论'],
    zhihu: ['至少 2 个 ## 小标题', '至少 2 条 - 列表或 2 处加粗', '标注来源或适用边界', '结尾总结']
  };

  function structureRules(platform) {
    return (STRUCTURE_RULES[platform.id] || ['至少 2 个 ## 小标题', '结尾有行动引导']).join('；');
  }

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

  function draftMessages(analysis, plan, platform, baseDraft) {
    const system = [
      `你是${platform.name}的资深原生编辑，任务是把「本地初稿」润色成该平台读者读起来毫无违和感的成稿。`,
      '硬性要求：',
      '1. 只使用初稿与原文要点里的事实、数字，不得编造新数据、案例或结论；',
      `2. 结构必须遵循：${plan.structureRoles.join(' → ')}；`,
      `3. 字数控制在 ${plan.length.min}-${plan.length.max} 字；`,
      `4. 标题使用：${plan.title}（可微调，但必须保留关键词「${plan.keyword}」）；`,
      '5. 合并本平台禁忌：' + (platform.taboo || []).map(t => t.msg).join('；'),
      '6. 结构硬性清单（必须全部满足）：' + structureRules(platform) + '；',
      '7. 原创硬性要求：不得原句照搬原文要点；用新的句式和连接词表达，事实与数字保持不变；',
      '8. 小标题必须使用 Markdown 的 ##，不要用 **加粗行** 代替小标题；',
      '9. 输出合法 JSON：{"title":"标题","body":"markdown 正文","usedFacts":["用到的原文事实"]}',
      '不要输出 JSON 以外的任何文字。'
    ].join('\n');
    const user = [
      plan.brief,
      '【直接受众与语气】' + JSON.stringify({ role: platform.audience.role, tone: platform.audience.tone, habits: platform.audience.habits }),
      '【必须保留的原文要点】',
      plan.mustKeep.map(k => '- ' + k).join('\n'),
      '【必须保留的数字】',
      analysis.numbers.map(n => n.raw).join('、') || '（无）',
      '【本地初稿·标题】',
      baseDraft.title,
      '【本地初稿·正文】',
      baseDraft.body,
      '请在这份初稿的基础上润色，输出该平台的原生成稿 JSON。'
    ].join('\n\n');
    return [{ role: 'system', content: system }, { role: 'user', content: user }];
  }

  function reviseMessages(draft, analysis, plan, platform, qa, missing) {
    const system = [
      '你是严格的多平台内容质检编辑。根据问题单修改稿件，保留原有事实与数字，不得新增原文没有的信息。',
      `目标平台：${platform.name}；结构：${plan.structureRoles.join(' → ')}；字数：${plan.length.min}-${plan.length.max}。`,
      '结构硬性清单（必须全部满足）：' + structureRules(platform) + '。',
      '原创硬性要求：逐句替换与原文重复的长句，不得连续照抄超过 10 个字；事实和数字必须保留。',
      '输出合法 JSON：{"title":"标题","body":"markdown 正文"}。不要输出其他文字。'
    ].join('\n');
    const user = [
      '【质检问题单】',
      qa.issues.map(i => `- [${i.code}] ${i.msg}；修复建议：${i.fix}`).join('\n'),
      (missing && missing.length ? '【必须补充的原文要点】\n' + missing.map(k => '- ' + k).join('\n') : ''),
      '【必须保留的数字】\n' + (analysis.numbers.map(n => n.raw).join('、') || '（无）'),
      '【当前稿件】',
      draft.body,
      '请输出修复后的完整 JSON。不得新增事实，也不得整段照抄原文要点。'
    ].filter(Boolean).join('\n\n');
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
      { dim: '字数', from: analysis.charCount + ' 字', to: textLength(draft.body) + ' 字（目标 ' + plan.length.min + '-' + plan.length.max + '）', reason: `平台字数偏好 ${platform.audience.wordPref || plan.length.min + '-' + plan.length.max + ' 字'}` }
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

    // 本地初稿：结构、事实与原创度的基线，也是 AI 润色的底稿
    let localDraft = null;
    let localQa = null;
    function buildLocalDraft() {
      if (localDraft) return;
      const out = W.write(analysis, plan, platform);
      localDraft = {
        title: normalizeTitle(out.title, plan, platform),
        body: repairStructure(out.body, plan, platform)
      };
      localQa = Q.check(localDraft, analysis, plan, platform);
    }

    if (opts.aiChat) {
      // A. 计划（可选，失败沿用本地计划）
      try {
        aiCalls++;
        const text = await callAI(opts.aiChat, planMessages(analysis, plan, platform, opts.portrait), 0.4);
        mergeAiPlan(parseJsonLoose(text), plan, platform);
      } catch (e) {
        errors.push('plan: ' + e.message);
      }

      // 本地初稿在 AI 计划合并后生成，确保与最终结构一致
      buildLocalDraft();

      // B. 润色本地初稿（可重试一次）
      for (let attempt = 0; attempt < 2 && !draft; attempt++) {
        try {
          aiCalls++;
          const text = await callAI(opts.aiChat, draftMessages(analysis, plan, platform, localDraft), attempt === 0 ? 0.65 : 0.2);
          const parsed = parseJsonLoose(text);
          validateDraft(parsed, analysis, plan, platform);
          draft = { title: String(parsed.title).trim().slice(0, 80), body: String(parsed.body).trim() };
          usedAI = true;
        } catch (e) {
          errors.push('draft' + (attempt + 1) + ': ' + e.message);
        }
      }
    }

    // 无 AI / AI 失败：直接用本地初稿
    if (!draft) {
      buildLocalDraft();
      draft = { title: localDraft.title, body: localDraft.body };
    }

    // 结构修复：把加粗小标题转成 Markdown 标题，补齐平台必备格式与 CTA
    draft.title = normalizeTitle(draft.title, plan, platform);
    draft.body = repairStructure(draft.body, plan, platform);

    let qa = Q.check(draft, analysis, plan, platform);

    // C/D. 质检不过 → 带着问题单修复一次
    if (opts.aiChat && usedAI && (qa.total < 85 || qa.issues.some(i => i.level === 'P1')) && aiCalls < MAX_AI_CALLS) {
      try {
        aiCalls++;
        const missing = plan.mustKeep
          .filter(k => Q.containment(k, draft.body) < 0.45)
          .slice(0, 5);
        const text = await callAI(opts.aiChat, reviseMessages(draft, analysis, plan, platform, qa, missing), 0.35);
        const parsed = parseJsonLoose(text);
        validateDraft(parsed, analysis, plan, platform);
        const revised = { title: String(parsed.title).trim().slice(0, 80), body: String(parsed.body).trim() };
        revised.title = normalizeTitle(revised.title, plan, platform);
        revised.body = repairStructure(revised.body, plan, platform);
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

    // AI 稿若明显差于本地初稿（尤其原创度），回退本地，避免为了用 AI 而降低质量
    if (usedAI && (qa.dims.O < 60 || qa.total < localQa.total - 8)) {
      draft = { title: localDraft.title, body: localDraft.body };
      qa = localQa;
      usedAI = false;
      errors.push('local-fallback: AI 稿质量低于本地初稿');
    }

    // 图片优先平台：把原文配图带回改写稿，避免发布前检查因缺图被阻断
    draft.body = attachImages(draft.body, extractImages(analysis.body), platformId);

    return compileResult(analysis, plan, platform, draft, qa, { usedAI, aiCalls, errors });
  }

  return { run, ENGINE_VERSION, parseJsonLoose, validateDraft, withLimit, extractImages, stripImages, attachImages, IMAGE_LIMITS };
});
