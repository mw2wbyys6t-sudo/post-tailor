/* =========================================================
   OmniDraft · 改写规划器（engine/planner.js）
   输入：analysis + 平台策略
   输出：钩子 / 结构 / 标题公式 / 长度预算 / 章节映射 /
         mustKeep / tags / brief（AI 与离线成稿共用同一份 plan）
   ========================================================= */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.CP = window.CP || {};
    window.CP.engine = window.CP.engine || {};
    window.CP.engine.planner = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function strategies() {
    if (typeof CP !== 'undefined' && CP.engine && CP.engine.strategies) return CP.engine.strategies;
    if (typeof require === 'function') return require('./strategies.js');
    throw new Error('strategies 未加载');
  }

  const ROLE_LABEL = {
    conclusion: '核心结论', background: '背景与问题', steps: '关键做法', code: '代码与配置',
    pitfalls: '踩坑与注意', data: '效果数据', story: '背景与经历', timeline: '过程复盘',
    methods: '方法与方案', checklist: '行动清单', golden: '金句', opinion: '我的判断',
    arguments: '为什么这么说', boundaries: '风险与边界', verdict: '结论与建议',
    definition: '它到底是什么', analogy: '一个类比', takeaways: '记住这几点',
    result: '先说结果', tips: '避坑建议', stance: '我的立场', reasons: '三个理由',
    prosCons: '适合与不适合', facts: '几个关键事实', cta: '写在最后'
  };

  const ROLE_WEIGHT = {
    conclusion: 0.12, background: 0.12, steps: 0.22, code: 0.12, pitfalls: 0.12, data: 0.12,
    story: 0.16, timeline: 0.14, methods: 0.22, checklist: 0.14, golden: 0.06, opinion: 0.12,
    arguments: 0.2, boundaries: 0.1, verdict: 0.1, definition: 0.12, analogy: 0.08,
    takeaways: 0.12, result: 0.12, tips: 0.14, stance: 0.1, reasons: 0.2, prosCons: 0.16,
    facts: 0.14, cta: 0.08
  };

  function sectionsMatching(analysis, re) {
    return analysis.sections.filter(s => re.test(s.heading || '')).map(s => s.index);
  }

  function sectionsWith(analysis, fn) {
    return analysis.sections.filter(fn).map(s => s.index);
  }

  function unique(arr) {
    const seen = new Set();
    return arr.filter(x => (seen.has(x) ? false : (seen.add(x), true)));
  }

  /* 章节角色 → 原文来源（优先按小标题命中，其次按结构特征，最后回退首节） */
  function sourceForRole(analysis, role) {
    const all = analysis.sections.map(s => s.index);
    const first = all.length ? [all[0]] : [];
    const hasBullets = sectionsWith(analysis, s => s.bullets.length >= 2);
    const hasCode = sectionsWith(analysis, s => s.code.length > 0);
    const withNumbers = sectionsWith(analysis, s => s.sentences.filter(x => x.hasNumber).length > 0);
    const pick = (...lists) => {
      for (const list of lists) {
        const v = unique(list);
        if (v.length) return v.slice(0, 3);
      }
      return [];
    };

    switch (role) {
      case 'background':
      case 'story':
        return pick(sectionsMatching(analysis, /背景|痛点|为什么|问题|起因|发现|这一年|经历/), first);
      case 'steps':
      case 'methods':
        return pick(sectionsMatching(analysis, /步骤|做法|实践|方法|优化|实施|方案|落地|设计|架构|测试/), hasBullets, first);
      case 'code':
        return hasCode;
      case 'pitfalls':
      case 'boundaries':
        return pick(sectionsMatching(analysis, /坑|注意|风险|边界|局限|反思|教训|取舍/), hasBullets);
      case 'data':
      case 'result':
        return pick(sectionsMatching(analysis, /效果|数据|结果|收益|变化|上线后/), withNumbers);
      case 'timeline':
        return pick(sectionsWith(analysis, s => s.sentences.some(x => /\d+\s*(?:年|个月|周|天)|从.+到/.test(x.text))), first);
      case 'checklist':
      case 'tips':
        return pick(hasBullets, sectionsMatching(analysis, /清单|要点|建议/), all);
      case 'definition':
        return first;
      case 'analogy':
        return pick(sectionsWith(analysis, s => s.sentences.some(x => /就像|像是|比喻|好比/.test(x.text))), first);
      case 'verdict':
        return pick(sectionsMatching(analysis, /结论|总结|建议|效果|结果/), all.slice(-1));
      case 'arguments':
      case 'reasons':
      case 'prosCons':
      case 'facts':
      case 'takeaways':
        return all.slice(0, 4);
      case 'conclusion':
      case 'opinion':
      case 'stance':
      case 'golden':
      case 'cta':
        return [];
      default:
        return first;
    }
  }

  function chooseHook(analysis, matrix, portrait) {
    const available = {
      conclusion: !!analysis.thesis,
      result: !!analysis.resultSentence,
      pain: !!analysis.painSentence,
      contrarian: !!analysis.thesis,
      numbered: analysis.keyPoints.length >= 3,
      contrast: false,
      identity: true,
      timeline: !!analysis.timelineSentence
    };
    /* 表达风格影响本地成稿的开头选择（AI 模式另有更完整的措辞约束） */
    const voice = (portrait && portrait.voice) || '';
    const preferred = voice === 'sharp' ? ['conclusion', 'contrarian']
      : voice === 'story' ? ['pain', 'timeline']
      : voice === 'warm' ? ['pain', 'identity']
      : voice === 'rigorous' ? ['conclusion', 'numbered'] : [];
    const order = preferred.concat(matrix.hookCandidates.filter(id => preferred.indexOf(id) < 0));
    for (const id of order) {
      if (available[id]) return id;
    }
    return 'conclusion';
  }

  function chooseTitle(analysis, platform, matrix) {
    const S = strategies();
    const ctx = S.titleContext(analysis, platform);
    const candidates = [];
    matrix.titleFormulas.forEach((id, i) => {
      const title = S.renderTitle(id, ctx, platform);
      if (!title) return;
      candidates.push({ id, title, score: S.titleScore(title, ctx, platform) + (3 - i) });
    });
    // 兜底标题：关键词 + 核心结论
    if (ctx.thesisShort) {
      const fallback = `${ctx.kw}：${ctx.thesisShort}`;
      candidates.push({ id: 'F1', title: S.short(fallback, platform.title.max), score: S.titleScore(fallback, ctx, platform) - 2 });
    }
    candidates.sort((a, b) => b.score - a.score);
    return { ctx, candidates, best: candidates[0] || { id: 'F0', title: ctx.kw, score: 0 } };
  }

  function buildPlan(analysis, platformId, portrait) {
    const S = strategies();
    const platform = S.getPlatform(platformId);
    const matrix = S.getMatrix(analysis.contentType, platformId);
    const hookId = chooseHook(analysis, matrix, portrait);
    const { ctx, candidates, best } = chooseTitle(analysis, platform, matrix);

    const srcLen = Math.max(120, analysis.charCount);
    const lo = Math.min(platform.length.min, Math.round(srcLen * 0.6));
    // 短文的 1.8 倍上限往往装不下标题/小标题/CTA 的固定开销，额外预留 60 字
    const hi = Math.min(platform.length.max, Math.max(lo + 80, Math.round(srcLen * 1.8) + 60));
    const target = Math.min(hi, Math.max(lo, Math.round(srcLen * matrix.ratio)));

    const sections = matrix.roles.map(role => ({
      role,
      label: ROLE_LABEL[role] || role,
      sourceSections: sourceForRole(analysis, role),
      budget: Math.round(target * (ROLE_WEIGHT[role] || 0.08))
    }));

    const mustKeep = analysis.keyPoints
      .slice()
      .sort((a, b) => (b.hasNumber ? 1 : 0) - (a.hasNumber ? 1 : 0) || b.score - a.score)
      .slice(0, 4)
      .map(k => k.text);

    const risks = [];
    if (analysis.keyPoints.length < 3) risks.push('原文可提炼的要点较少，改写以保留信息为主');
    if (matrix.roles.indexOf('code') >= 0 && !analysis.hasCode) risks.push('原文没有代码块，技术平台建议补一段可运行示例');
    if (matrix.roles.indexOf('data') >= 0 && analysis.numbers.length === 0) risks.push('原文没有量化数据，结论说服力有限');
    if (hookId === 'result' && !analysis.resultSentence) risks.push('缺少结果型句子，已回退到结论钩子');

    /* 用户画像 → 可执行约束（只使用用户自己的问答，不引入平台统计） */
    const p = portrait || {};
    const pref = [];
    if (p.identityLabel) pref.push(`身份：${p.identityLabel}`);
    if (p.expertiseLabel) pref.push(`专业程度：${p.expertiseLabel}`);
    if (p.voiceLabel) pref.push(`表达风格：${p.voiceLabel}`);
    if (p.readerLabels && p.readerLabels.length) pref.push(`目标读者：${p.readerLabels.join('、')}`);
    if (p.avoidLabels && p.avoidLabels.length) pref.push(`避免表达：${p.avoidLabels.join('、')}`);

    const constraints = [];
    const readers = p.readers || [];
    const avoid = p.avoid || [];
    if (readers.some(r => r === 'beginner' || r === 'broad')) constraints.push('降低术语密度，增加类比与案例');
    if (readers.indexOf('expert') >= 0) constraints.push('保留专业细节与推导过程');
    if (readers.indexOf('decision') >= 0) constraints.push('结论与决策清单前置');
    if (p.expertise === 'entry') constraints.push('步骤清晰、可复现，补齐必要背景');
    if (p.expertise === 'expert') constraints.push('保留判断、边界与取舍，不写基础科普');
    if (p.voice === 'warm') constraints.push('口语化、第二人称，降低阅读门槛');
    if (p.voice === 'sharp') constraints.push('观点前置，句子短，少铺垫');
    if (p.voice === 'story') constraints.push('用场景或经历开场');
    if (p.voice === 'rigorous') constraints.push('术语准确、论证完整，减少口语化');
    if (avoid.indexOf('slang') >= 0) constraints.push('不使用网络热词');
    if (avoid.indexOf('clickbait') >= 0) constraints.push('不使用夸张标题党');
    if (avoid.indexOf('jargon') >= 0) constraints.push('控制术语数量，必要时先解释');
    if (avoid.indexOf('marketing') >= 0) constraints.push('避免强营销话术与夸张承诺');
    if (avoid.indexOf('emoji') >= 0) {
      constraints.push('尽量少用表情符号');
      if (platformId === 'xhs') risks.push('你选择了避免表情符号，但小红书的平台结构规则通常需要 emoji，成稿会尽量少用并在质检中体现');
    }

    const tags = S.buildTagList(analysis, platform);

    const brief = [
      `【平台】${platform.name}（语气：${platform.tone}；标题：${platform.titleRule}；长度：${platform.lengthRule}）`,
      `【内容类型】${analysis.contentTypeLabel}`,
      `【钩子】${S.HOOKS[hookId] ? S.HOOKS[hookId].label : hookId}`,
      `【结构】${sections.map(s => s.label).join(' → ')}`,
      `【字数】${lo}-${hi} 字，目标 ${target} 字`,
      `【标题公式】${best.id} ${best.title}`,
      `【必须保留】${mustKeep.join(' / ') || '无'}`,
      `【可量化证据】${analysis.numbers.map(n => n.raw).join('、') || '无'}`,
      pref.length ? `【创作者偏好】${pref.join('；')}` : '',
      constraints.length ? `【写作约束】${constraints.join('；')}` : '',
      risks.length ? `【风险】${risks.join('；')}` : ''
    ].filter(Boolean).join('\n');

    return {
      platformId,
      platformName: platform.name,
      platformColor: platform.color,
      contentType: analysis.contentType,
      contentTypeLabel: analysis.contentTypeLabel,
      hookId,
      hookLabel: S.HOOKS[hookId] ? S.HOOKS[hookId].label : hookId,
      hookOptions: matrix.hookCandidates.slice(),
      structureId: matrix.structureId,
      structureRoles: matrix.roles.slice(),
      requiredRoles: matrix.requiredRoles.slice(),
      titleFormulaId: best.id,
      title: best.title,
      titleCandidates: candidates.slice(0, 4),
      angle: S.HOOKS[hookId] ? S.HOOKS[hookId].label : hookId,
      keyword: ctx.kw,
      length: { min: lo, max: hi, target, source: analysis.charCount },
      sections,
      mustKeep,
      numbers: analysis.numbers.slice(),
      tags,
      risks,
      brief,
      portrait: p,
      portraitPref: pref,
      portraitConstraints: constraints,
      platform
    };
  }

  return { buildPlan, ROLE_LABEL, ROLE_WEIGHT };
});
