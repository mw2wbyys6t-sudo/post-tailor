/* =========================================================
   OmniDraft · 本地质检器（engine/quality.js）
   输出：{ total, dims:{C,S,L,T,O,R,M}, metrics, issues }
   C 信息保留 / S 结构合规 / L 长度 / T 标题 / O 原创度 /
   R 可读性 / M 合规；所有扣分都能定位到具体维度与原因。
   ========================================================= */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.CP = window.CP || {};
    window.CP.engine = window.CP.engine || {};
    window.CP.engine.quality = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number(n) || 0));

  function normalize(text) {
    return String(text || '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/https?:\/\/\S+/gi, '')
      .replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF\uFE0F]/gu, '')
      .replace(/[\s\p{P}\p{S}]/gu, '')
      .toLowerCase();
  }

  function charCount(text) {
    return String(text || '').replace(/\s/g, '').length;
  }

  function containment(phrase, haystack, n) {
    const p = normalize(phrase);
    const h = normalize(haystack);
    if (!p) return 0;
    const size = n || 4;
    if (p.length < size) return h.indexOf(p) >= 0 ? 1 : 0;
    const grams = new Set();
    for (let i = 0; i + size <= p.length; i++) grams.add(p.slice(i, i + size));
    let hit = 0;
    grams.forEach(g => { if (h.indexOf(g) >= 0) hit++; });
    return grams.size ? hit / grams.size : 0;
  }

  function ngramCopyRun(draft, source, n) {
    const size = n || 8;
    const d = normalize(draft);
    const s = normalize(source);
    if (!d || !s) return 0;
    let total = 0;
    let hit = 0;
    for (let i = 0; i + size <= d.length; i++) {
      total++;
      if (s.indexOf(d.slice(i, i + size)) >= 0) hit++;
    }
    return total ? hit / total : 0;
  }

  function headingsOf(body) {
    const out = [];
    const re = /^#{1,6}\s+(.+)$/gm;
    let m;
    while ((m = re.exec(body))) out.push(m[1].trim());
    const bold = /^\*\*([^*]{2,20})\*\*$/gm;
    while ((m = bold.exec(body))) out.push(m[1].trim());
    return out;
  }

  function prose(body) {
    return String(body || '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/^#{1,6}\s+.*$/gm, '')
      .replace(/[*_~`>#]/g, '')
      .replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF\uFE0F]/gu, '')
      .trim();
  }

  function splitProse(body) {
    return prose(body)
      .split(/(?<=[。！？!?；;\n])/)
      .map(s => s.trim())
      .filter(s => s.length >= 6);
  }

  function topicTerms(analysis) {
    const terms = [];
    analysis.sectionTopics.forEach(h => {
      String(h).split(/[与和、\s，,：:（）()【】\[\]]+/).forEach(part => {
        if (part.length >= 2 && part.length <= 3) terms.push(part);
        else if (part.length > 3) {
          for (let i = 0; i + 2 <= part.length; i++) terms.push(part.slice(i, i + 2));
        }
      });
    });
    return Array.from(new Set(terms)).slice(0, 20);
  }

  /* ---------------- 七个维度 ---------------- */
  function dimCoverage(draft, analysis, plan, text) {
    const kps = (plan.mustKeep && plan.mustKeep.length ? plan.mustKeep : analysis.keyPoints.map(k => k.text)).slice(0, 5);
    let kp = 0;
    if (kps.length) {
      const ratios = kps.map(k => clamp(containment(k, text) / 0.6, 0, 1));
      kp = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    } else {
      kp = 0.6;
    }

    const nums = analysis.numbers.map(n => n.value).filter((v, i, arr) => arr.indexOf(v) === i);
    let num = 1;
    if (nums.length) {
      const d = normalize(draft.body);
      num = nums.filter(v => d.indexOf(String(v)) >= 0).length / nums.length;
    }

    const terms = topicTerms(analysis);
    let sec = 0.6;
    if (terms.length) {
      const d = normalize(draft.body + draft.title);
      sec = terms.filter(t => d.indexOf(normalize(t)) >= 0).length / terms.length;
    }

    const score = 100 * (0.5 * kp + 0.3 * num + 0.2 * sec);
    return { score, kp, num, sec };
  }

  function hookScore(draft, plan) {
    const head = String(draft.body || '').slice(0, 300);
    const patterns = {
      conclusion: /(结论|先说|核心|一句话)/,
      result: /(\d|从.+到|提升|下降|降低|增长|节省|达到)/,
      pain: /(困扰|痛点|问题|难|消耗|如果你也)/,
      contrarian: /(以为|其实|并不是|反而|不一样|别再)/,
      numbered: /\d+\s*[个条步点]/,
      contrast: /(vs|对比|差别|怎么选|区别)/i,
      identity: /(如果你|作为|同样|打工人|姐妹|家人们|学生党|职场人)/,
      timeline: /(从.+到|\d+\s*(年|个月|周|天))/,
      story: /(过去|当时|曾经|记得|我们|团队)/
    };
    const re = patterns[plan.hookId] || patterns.conclusion;
    return re.test(head) ? 1 : 0;
  }

  function requiredPresent(draft, platform, plan) {
    const labels = {
      conclusion: /(结论|先说|核心)/, background: /(背景|为什么|问题|痛点)/,
      steps: /(步骤|做法|方法|实践|怎么|落地|优化)/, code: /```/,
      pitfalls: /(坑|注意|风险|教训)/, data: /(数据|效果|结果|收益)/,
      story: /(背景|经历|故事|这一年|过去)/, timeline: /(过程|时间|阶段|年|月)/,
      methods: /(方法|方案|做法|实践|设计|架构)/, checklist: /(清单|要点|建议)/,
      golden: /\*\*[^*]+\*\*/, opinion: /(判断|观点|认为)/,
      arguments: /(为什么|理由|观点|分析|^\d+\.)/m, boundaries: /(风险|边界|局限|注意|前提)/,
      verdict: /(结论|总结|建议|值不值)/, definition: /(是什么|定义|概念|本质)/,
      analogy: /(像|比喻|好比)/, takeaways: /(要点|总结|记住)/,
      result: /(结果|效果|收益|变化|数据)/, tips: /(建议|避坑|技巧|注意)/,
      stance: /(立场|观点|结论|判断)/, reasons: /(理由|为什么|第一|第二|^\d+\.)/m,
      prosCons: /(适合|不适合|优点|缺点|要点)/, facts: /(知识|事实|冷知识)/,
      cta: /(收藏|点赞|在看|评论|转发)/
    };
    const required = (plan && plan.requiredRoles && plan.requiredRoles.length)
      ? plan.requiredRoles
      : (platform.required || []);
    let present = 0;
    required.forEach(role => {
      const re = labels[role] || new RegExp(role);
      if (re.test(draft.body)) present++;
    });
    return { present, total: required.length || 1 };
  }

  function formatScore(draft, platform) {
    const body = String(draft.body || '');
    const lines = body.split('\n').filter(Boolean);
    const bullets = lines.filter(l => /^\s*(?:[-*+]|\d+\.|✅|📌|📊|▪️|🔥)\s/.test(l)).length;
    const headings = headingsOf(body).length;
    const bolds = (body.match(/\*\*[^*]+\*\*/g) || []).length;
    const emojis = (body.match(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF}]/gu) || []).length;
    const contentLines = lines.filter(l => !/^#{1,6}\s/.test(l) && l.length > 1);
    const shortRatio = contentLines.length
      ? contentLines.filter(l => l.length <= 50).length / contentLines.length
      : 0;

    switch (platform.id) {
      case 'csdn':
        return (bullets >= 1 || /```/.test(body) ? 1 : 0) && headings >= 2 ? 1 : 0;
      case 'wechat':
        return bolds >= 1 && headings >= 2 ? 1 : 0;
      case 'xhs':
        return emojis >= 3 && shortRatio >= 0.7 ? 1 : 0;
      case 'zhihu':
        return (bullets >= 2 || bolds >= 2) && headings >= 2 ? 1 : 0;
      default:
        return 1;
    }
  }

  function dimStructure(draft, platform, plan) {
    const hook = hookScore(draft, plan);
    const req = requiredPresent(draft, platform, plan);
    const headings = headingsOf(draft.body).length;
    const headingScore = headings >= 3 ? 1 : (headings === 2 ? 0.6 : 0);
    const tail = String(draft.body || '').slice(-320);
    const cta = (platform.cta.keywords || []).some(k => tail.indexOf(k) >= 0) ? 1 : 0;
    const fmt = formatScore(draft, platform);
    const score = 20 * hook + 40 * (req.present / req.total) + 15 * headingScore + 15 * cta + 10 * fmt;
    return { score, hook, requiredPresent: req.present, requiredTotal: req.total, headings, cta, fmt };
  }

  function dimLength(draft, platform, plan) {
    const len = charCount(draft.body);
    const min = plan.length.min;
    const max = plan.length.max;
    let score;
    if (len >= min && len <= max) score = 100;
    else if (len >= min * 0.85 && len <= max * 1.15) score = 80;
    else {
      const span = Math.max(1, max - min);
      const dist = len < min ? min - len : len - max;
      score = clamp(100 - (dist / span) * 100, 0, 79);
    }
    return { score, len };
  }

  function dimTitle(draft, platform, plan) {
    const title = String(draft.title || '');
    const len = Array.from(title).length;
    let s1 = 35;
    if (len < platform.title.min || len > platform.title.max) {
      const dist = len < platform.title.min ? platform.title.min - len : len - platform.title.max;
      s1 = clamp(35 - dist * 3, 0, 35);
    }
    const kw = plan.keyword && title.indexOf(plan.keyword) >= 0;
    const formula = /[\d：:｜|？?]/.test(title) || title === plan.title;
    const s2 = (kw ? 20 : 0) + (formula ? 10 : 0);
    const s3 = (/\d/.test(title) ? 10 : 0) + (/[：:｜|？?]/.test(title) ? 10 : 0);
    const banned = platform.title.banned.some(w => title.indexOf(w) >= 0);
    const s4 = banned ? 0 : 15;
    return { score: clamp(s1 + s2 + s3 + s4, 0, 100), len, kw, banned };
  }

  function dimOriginality(draft, analysis, platform) {
    const run = ngramCopyRun(draft.body, analysis.body, 8);
    const target = platform.originalityTarget;
    const over = Math.max(0, run - target);
    const score = clamp(100 - 200 * over, 0, 100);
    return { score, copyRun: run, target };
  }

  function dimReadability(draft, analysis) {
    const sents = splitProse(draft.body);
    const avg = sents.length ? sents.reduce((a, s) => a + s.length, 0) / sents.length : 0;
    let s1 = 20;
    if (avg >= 12 && avg <= 38) s1 = 40;
    else if (avg > 38 && avg <= 50) s1 = 30;
    else if (avg < 12) s1 = 26;

    const longRatio = sents.length ? sents.filter(s => s.length > 60).length / sents.length : 0;
    const s2 = longRatio <= 0.1 ? 20 : (longRatio <= 0.2 ? 15 : 8);

    const lines = String(draft.body || '').split('\n').filter(Boolean);
    const bullets = lines.filter(l => /^\s*(?:[-*+]|\d+\.|✅|📌|📊|▪️|🔥)\s/.test(l)).length;
    const paragraphs = lines.filter(l => !/^#{1,6}\s/.test(l) && l.length > 10).length;
    const s3 = bullets >= 3 ? 30 : (paragraphs >= 3 ? 22 : 12);

    const terms = analysis.keywords.slice(0, 6).map(k => k.term);
    const text = normalize(draft.body);
    const hits = terms.reduce((n, t) => n + (text.split(normalize(t)).length - 1), 0);
    const density = text.length ? hits * 2 / text.length : 0;
    const s4 = density <= 0.02 ? 10 : 6;

    return { score: clamp(s1 + s2 + s3 + s4, 0, 100), avgSentence: Math.round(avg * 10) / 10, longRatio };
  }

  function dimCompliance(draft, platform) {
    const text = String(draft.title || '') + '\n' + String(draft.body || '');
    const issues = [];
    let score = 100;
    (platform.taboo || []).forEach(t => {
      if (t.re.test(text)) {
        if (t.level === 'P0') score = 0;
        else if (t.level === 'P1') score = Math.max(0, score - 30);
        else score = Math.max(0, score - 10);
        issues.push({ code: 'TABOO_' + t.level, level: t.level, msg: t.msg, fix: t.fix, where: '标题/正文' });
      }
    });
    return { score, issues };
  }

  function check(draft, analysis, plan, platform) {
    // 图片语法不参与文本类指标：base64 会撑爆字数、拉低可读性并干扰原创度
    const textDraft = {
      title: draft.title,
      body: String(draft.body || '').replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    };
    const cov = dimCoverage(textDraft, analysis, plan, textDraft.body + '\n' + textDraft.title);
    const str = dimStructure(textDraft, platform, plan);
    const len = dimLength(textDraft, platform, plan);
    const title = dimTitle(textDraft, platform, plan);
    const orig = dimOriginality(textDraft, analysis, platform);
    const read = dimReadability(textDraft, analysis);
    const comp = dimCompliance(draft, platform);

    const dims = {
      C: Math.round(cov.score),
      S: Math.round(str.score),
      L: Math.round(len.score),
      T: Math.round(title.score),
      O: Math.round(orig.score),
      R: Math.round(read.score),
      M: Math.round(comp.score)
    };
    const w = platform.weights || { C: 0.25, S: 0.2, L: 0.1, T: 0.1, O: 0.15, R: 0.1, M: 0.1 };
    let total = 0;
    Object.keys(w).forEach(k => { total += (dims[k] || 0) * w[k]; });

    const issues = comp.issues.slice();
    if (dims.C < 80) issues.push({ code: 'LOW_COVERAGE', level: 'P1', msg: '关键结论或数据保留不足', fix: '保留原文的核心结论、关键数字与章节主题' });
    if (dims.S < 80) issues.push({ code: 'LOW_STRUCTURE', level: 'P1', msg: '平台结构不完整（钩子/必备章节/CTA）', fix: '补齐平台必备结构与结尾行动引导' });
    if (dims.O < 70) issues.push({ code: 'LOW_ORIGINALITY', level: 'P1', msg: '与原文重复度过高，易被判搬运', fix: '压缩原句、调整语序、替换连接词' });
    if (dims.L < 100) issues.push({ code: 'LENGTH', level: 'P2', msg: `字数 ${len.len} 偏离平台区间 ${plan.length.min}-${plan.length.max}`, fix: '按目标字数补充或精简内容' });
    if (dims.T < 80) issues.push({ code: 'TITLE', level: 'P2', msg: '标题长度/关键词/具体性不达标', fix: '使用平台标题公式并前置关键词' });
    if (dims.R < 75) issues.push({ code: 'READABILITY', level: 'P2', msg: '句子偏长或排版节奏偏弱', fix: '拆短句、增加清单与分段' });

    const p0 = issues.some(i => i.level === 'P0');
    const gate = p0 || cov.num < 0.8;
    if (gate) total = Math.min(total, 69);

    return {
      total: Math.round(total),
      dims,
      metrics: {
        charCount: len.len,
        copyRun: Math.round(orig.copyRun * 100) / 100,
        copyTarget: orig.target,
        keypointRecall: Math.round(cov.kp * 100) / 100,
        numberRecall: Math.round(cov.num * 100) / 100,
        sectionRecall: Math.round(cov.sec * 100) / 100,
        hook: str.hook,
        requiredPresent: str.requiredPresent,
        requiredTotal: str.requiredTotal,
        headings: str.headings,
        cta: str.cta,
        format: str.fmt,
        titleLen: title.len,
        keywordInTitle: title.kw,
        banned: title.banned,
        avgSentence: read.avgSentence,
        longSentenceRatio: Math.round(read.longRatio * 100) / 100,
        capped: gate,
        p0
      },
      issues: issues.slice(0, 8)
    };
  }

  return { check, containment, ngramCopyRun, normalize, charCount, headingsOf };
});
