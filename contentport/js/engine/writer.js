/* =========================================================
   OmniDraft · 离线成稿器（engine/writer.js）
   输入：analysis + plan + 平台策略
   输出：{ title, body }
   规则：只抽取/压缩原文事实，不新增论据；按平台结构重组，
         通过删冗余、换连接词、拆短句降低与原文的重复度。
   ========================================================= */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.CP = window.CP || {};
    window.CP.engine = window.CP.engine || {};
    window.CP.engine.writer = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function planner() {
    if (typeof CP !== 'undefined' && CP.engine && CP.engine.planner) return CP.engine.planner;
    if (typeof require === 'function') return require('./planner.js');
    return { ROLE_LABEL: {} };
  }

  const SYN = [
    ['我们团队', '团队'], ['团队', '团队'], ['我们', '我'], ['你们', '你'],
    ['因此', '所以'], ['但是', '但'], ['然而', '但'], ['通过', '用'],
    ['能够', '能'], ['需要', '要'], ['已经', '已'], ['进行', '做'],
    ['目前', '现在'], ['大幅', '明显'], ['显著', '明显'], ['例如', '比如'],
    ['以及', '和'], ['如果', '若'], ['由于', '因为'], ['并且', '同时'],
    ['此外', '另外'], ['从而', '进而'], ['非常', '很'], ['一定', '要']
  ];
  const FILLER_RE = /(其实|真的|确实|大家|可以说|一定程度上|在某种程度上|还是|就是|比如|例如|以及|而且|然后|这样|那样|这种|那种|一个|一些|很多|比较|相对|方面|情况|时候|过程|东西|本身|非常)/g;

  function plain(text) {
    return String(text || '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_~`>#]/g, '')
      .replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function replaceSyn(text) {
    let t = text;
    SYN.forEach(([from, to]) => {
      if (from !== to) t = t.split(from).join(to);
    });
    return t;
  }

  function safeSlice(text, maxLen) {
    if (!maxLen || text.length <= maxLen) return text;
    let cut = text.slice(0, maxLen);
    const next = text.charAt(maxLen);
    if (/\d/.test(cut.charAt(cut.length - 1)) && /\d/.test(next)) {
      cut = cut.replace(/\d+$/, '');
    }
    const punc = Math.max(cut.lastIndexOf('，'), cut.lastIndexOf('、'), cut.lastIndexOf(' '), cut.lastIndexOf('：'));
    if (punc > maxLen * 0.55) cut = cut.slice(0, punc);
    return cut.replace(/[，,、；;：:]+$/, '');
  }

  function compact(text, level, maxLen) {
    let t = plain(text);
    if (!t) return '';
    if (level >= 1) t = replaceSyn(t);
    if (level >= 2) {
      t = t.replace(FILLER_RE, '');
      t = t.replace(/^(我|我们|你|团队)(?=[\u4e00-\u9fa5])/, '');
    }
    let clauses = t.split(/[，,；;]/).map(s => s.trim()).filter(s => s.length >= 3);
    if (!clauses.length) clauses = [t];
    if (level >= 2) {
      clauses = clauses.map(c => c.length > 30 ? safeSlice(c, 30) : c);
    }
    let out = '';
    for (const c of clauses) {
      if (!out) {
        out = c;
      } else if (!maxLen || out.length + c.length + 1 <= maxLen) {
        out += '，' + c;
      }
    }
    if (maxLen && out.length > maxLen) out = safeSlice(out, maxLen);
    return out.replace(/[，,、；;：:]+$/, '').trim();
  }

  function chars(text) {
    return String(text || '').replace(/\s/g, '').length;
  }

  function sentencesFor(analysis, secIndexes, used, n, preferNumbers) {
    const set = new Set(secIndexes || []);
    let list = analysis.sentences.filter(s => set.has(s.sectionIndex) && !used.has(s.text));
    list.sort((a, b) => {
      const na = preferNumbers ? (a.hasNumber ? 4 : 0) : 0;
      const nb = preferNumbers ? (b.hasNumber ? 4 : 0) : 0;
      return (nb + b.score) - (na + a.score);
    });
    const out = [];
    for (const s of list) {
      if (out.length >= n) break;
      if (out.some(x => x.text === s.text)) continue;
      used.add(s.text);
      out.push(s);
    }
    return out;
  }

  function keypointPool(analysis, used) {
    return analysis.keyPoints.filter(k => !used.has(k.text));
  }

  function takeKeypoints(analysis, used, n) {
    const pool = keypointPool(analysis, used);
    const out = pool.slice(0, n);
    out.forEach(k => used.add(k.text));
    return out;
  }

  function bulletLines(sentences, level, maxLen, emoji) {
    return sentences
      .map(s => compact(s.text || s, level, maxLen))
      .filter(Boolean)
      .map(t => (emoji ? '✅ ' : '- ') + t);
  }

  /* ---------------- 钩子 ---------------- */
  function hookText(analysis, plan, platform, level) {
    const role = (plan.portrait && plan.portrait.readerLabels && plan.portrait.readerLabels[0]) || '读者';
    const thesis = compact(analysis.thesis, level, platform.id === 'xhs' ? 46 : 90);
    switch (plan.hookId) {
      case 'result':
        return '结果先说：' + compact(analysis.resultSentence || analysis.thesis, level, platform.id === 'xhs' ? 46 : 90);
      case 'pain':
        return compact(analysis.painSentence, level, platform.id === 'xhs' ? 46 : 90) +
          (platform.id === 'xhs' ? ' 这篇把可复用的部分整理好了。' : ' 如果你也遇到类似问题，这篇可以帮你少走弯路。');
      case 'numbered':
        return `${plan.length.target > 800 ? plan.mustKeep.length : 4} 个要点，先看最关键的：` + compact(analysis.keyPoints[0] ? analysis.keyPoints[0].text : thesis, level, 56);
      case 'contrast':
        return `${plan.keyword}到底怎么选？把差别拆开看就清楚了。`;
      case 'identity':
        return `如果你也是${role}，这篇值得看完。` + thesis;
      case 'timeline':
        return compact(analysis.timelineSentence || analysis.thesis, level, platform.id === 'xhs' ? 46 : 90);
      case 'contrarian':
        return `关于${plan.keyword}，有几个判断可能和直觉不一样。` + thesis;
      case 'conclusion':
      default:
        return '先说结论：' + thesis;
    }
  }

  /* ---------------- 章节内容 ---------------- */
  function buildBlocks(analysis, plan, platform, used) {
    const level = platform.id === 'xhs' ? 2 : 1;
    const labels = (planner().ROLE_LABEL) || {};
    const blocks = [];

    plan.sections.forEach(sec => {
      const role = sec.role;
      if (role === 'cta') return;
      const block = { role, label: labels[role] || sec.label, lines: [], code: [] };

      switch (role) {
        case 'conclusion':
          block.lines = [compact(analysis.thesis, level, platform.id === 'xhs' ? 48 : 100)];
          used.add(analysis.thesis);
          break;
        case 'background':
        case 'story': {
          const ss = sentencesFor(analysis, sec.sourceSections, used, platform.id === 'xhs' ? 2 : 3, false);
          block.lines = ss.map(s => compact(s.text, level, platform.id === 'xhs' ? 40 : 95));
          break;
        }
        case 'steps':
        case 'methods': {
          const ss = sentencesFor(analysis, sec.sourceSections, used, platform.id === 'xhs' ? 4 : 5, false);
          const pool = ss.length >= 2 ? ss : ss.concat(takeKeypoints(analysis, used, 3));
          block.lines = bulletLines(pool.length ? pool : takeKeypoints(analysis, used, 4), level, platform.id === 'xhs' ? 32 : 62, platform.id === 'xhs');
          break;
        }
        case 'code':
          block.code = (analysis.sections.find(s => s.code.length) || { code: [] }).code.slice(0, 2);
          break;
        case 'pitfalls':
        case 'boundaries': {
          const ss = sentencesFor(analysis, sec.sourceSections, used, 4, false);
          block.lines = bulletLines(ss.length ? ss : takeKeypoints(analysis, used, 3), level, platform.id === 'xhs' ? 32 : 66, platform.id === 'xhs');
          if (!block.lines.length) {
            block.lines = [platform.id === 'xhs' ? '✅ 结论有前提，换环境要先小范围验证' : '- 以上结论基于原文场景，迁移时需结合自身条件验证。'];
          }
          break;
        }
        case 'data':
        case 'result': {
          const numbered = analysis.sentences.filter(s => s.hasNumber && !used.has(s.text)).slice(0, 5);
          const ss = numbered.length ? numbered : sentencesFor(analysis, sec.sourceSections, used, 3, true);
          ss.forEach(s => used.add(s.text));
          block.lines = bulletLines(ss.length ? ss : takeKeypoints(analysis, used, 3), level, platform.id === 'xhs' ? 34 : 70, platform.id === 'xhs');
          break;
        }
        case 'timeline': {
          const ss = sentencesFor(analysis, sec.sourceSections, used, 4, true);
          block.lines = bulletLines(ss, level, platform.id === 'xhs' ? 34 : 70, platform.id === 'xhs');
          break;
        }
        case 'checklist':
        case 'tips': {
          const ss = sentencesFor(analysis, sec.sourceSections, used, 5, false);
          const pool = ss.length >= 2 ? ss : ss.concat(takeKeypoints(analysis, used, 4));
          block.lines = bulletLines(pool.length ? pool : takeKeypoints(analysis, used, 4), level, platform.id === 'xhs' ? 30 : 58, platform.id === 'xhs');
          break;
        }
        case 'golden': {
          const kp = takeKeypoints(analysis, used, 1)[0];
          block.lines = [compact(kp ? kp.text : analysis.thesis, level, 48)];
          break;
        }
        case 'opinion':
        case 'stance': {
          block.lines = [compact(analysis.thesis, level, 90)];
          used.add(analysis.thesis);
          const extra = takeKeypoints(analysis, used, 2).map(k => compact(k.text, level, platform.id === 'xhs' ? 34 : 66));
          block.lines = block.lines.concat(extra);
          break;
        }
        case 'arguments':
        case 'reasons':
        case 'prosCons':
        case 'facts': {
          const ss = sentencesFor(analysis, sec.sourceSections, used, 4, false);
          const pool = ss.length >= 3 ? ss : ss.concat(takeKeypoints(analysis, used, 4 - ss.length));
          block.lines = pool.map((s, i) => `${i + 1}. ` + compact(s.text || s, level, platform.id === 'xhs' ? 34 : 70));
          break;
        }
        case 'verdict': {
          const ss = sentencesFor(analysis, sec.sourceSections, used, 2, false);
          block.lines = [
            '结论：' + compact(ss[0] ? ss[0].text : analysis.thesis, level, 80)
          ].concat(takeKeypoints(analysis, used, 2).map(k => '建议：' + compact(k.text, level, 60)));
          break;
        }
        case 'definition': {
          const sec0 = analysis.sections[0] || { sentences: [] };
          const pick = sec0.sentences.find(s => !used.has(s.text)) ||
            analysis.sentences.find(s => s.sectionIndex > 0 && !used.has(s.text));
          if (pick) {
            block.lines = [compact(pick.text, level, 90)];
            used.add(pick.text);
          }
          break;
        }
        case 'analogy': {
          const s = analysis.sentences.find(x => /就像|像是|比喻|好比/.test(x.text) && !used.has(x.text));
          if (s) {
            block.lines = [compact(s.text, level, 80)];
            used.add(s.text);
          }
          break;
        }
        case 'takeaways': {
          const kp = takeKeypoints(analysis, used, 3);
          block.lines = bulletLines(kp, level, platform.id === 'xhs' ? 30 : 60, platform.id === 'xhs');
          break;
        }
        default: {
          const ss = sentencesFor(analysis, sec.sourceSections, used, 2, false);
          block.lines = ss.map(s => compact(s.text, level, 70));
        }
      }

      block.lines = block.lines.filter(Boolean);
      if (block.lines.length || block.code.length) blocks.push(block);
    });

    return blocks;
  }

  /* ---------------- 数字兜底：确保原文数字尽量保留 ---------------- */
  function ensureNumbers(analysis, blocks, used, platform, level) {
    const text = blocks.map(b => b.lines.join('\n')).join('\n');
    const missing = analysis.numbers.filter(n => text.indexOf(n.value) < 0);
    if (!missing.length) return;
    const lines = [];
    if (missing.length > 4 || missing.some(n => !n.context)) {
      // 长文/表格数字较多时，合并为一行数据速览，避免正文被数据项撑爆
      lines.push((platform.id === 'xhs' ? '📊 ' : '- ') + '关键数据：' + missing.map(n => n.raw).join('、'));
    } else {
      missing.slice(0, 10).forEach(n => {
        const maxLen = platform.id === 'xhs' ? 40 : 80;
        let t = compact(n.context, level, maxLen);
        if (!t) return;
        if (t.indexOf(n.value) < 0) t = t + '（' + n.raw + '）';
        lines.push(platform.id === 'xhs' ? '📊 ' + t : '- ' + t);
      });
    }
    if (!lines.length) return;
    let target = blocks.find(b => b.role === 'data' || b.role === 'result');
    if (!target) {
      target = { role: 'data', label: '关键数据', lines: [], code: [] };
      const ctaIdx = blocks.findIndex(b => b.role === 'cta');
      if (ctaIdx >= 0) blocks.splice(ctaIdx, 0, target);
      else blocks.push(target);
    }
    target.lines = target.lines.concat(lines);
  }

  /* ---------------- 关键结论兜底：确保 mustKeep 被覆盖 ---------------- */
  function norm(text) {
    return String(text || '')
      .replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF\uFE0F]/gu, '')
      .replace(/[\s\p{P}\p{S}]/gu, '');
  }

  function phraseHit(phrase, text, n) {
    const p = norm(phrase);
    const t = norm(text);
    if (!p) return 1;
    const size = n || 4;
    if (p.length < size) return t.indexOf(p) >= 0 ? 1 : 0;
    const grams = new Set();
    for (let i = 0; i + size <= p.length; i++) grams.add(p.slice(i, i + size));
    let hit = 0;
    grams.forEach(g => { if (t.indexOf(g) >= 0) hit++; });
    return grams.size ? hit / grams.size : 0;
  }

  function ensureMustKeep(analysis, plan, blocks, used, platform, level) {
    const text = blocks.map(b => b.lines.join('\n')).join('\n');
    const missing = (plan.mustKeep || []).filter(k => phraseHit(k, text) < 0.62);
    if (!missing.length) return;
    let target = blocks.find(b => b.role === 'takeaways');
    if (!target) {
      target = { role: 'takeaways', label: '核心要点', lines: [], code: [] };
      const ctaIdx = blocks.findIndex(b => b.role === 'cta');
      if (ctaIdx >= 0) blocks.splice(ctaIdx, 0, target);
      else blocks.push(target);
    }
    missing.slice(0, 4).forEach(k => {
      used.add(k);
      target.lines.push((platform.id === 'xhs' ? '📌 ' : '- ') + compact(k, level, platform.id === 'xhs' ? 34 : 78));
    });
  }

  /* ---------------- 长度控制 ---------------- */
  function totalChars(title, blocks, platform) {
    let n = chars(title) + 4;
    blocks.forEach(b => {
      n += chars(b.lines.join('')) + (platform.id === 'xhs' ? 2 : 8);
      (b.code || []).forEach(c => { n += chars(c.code) + 8; });
    });
    return n;
  }

  function fillToMin(analysis, plan, blocks, used, platform, level) {
    const min = plan.length.min;
    const extra = analysis.sentences
      .filter(s => !used.has(s.text))
      .sort((a, b) => b.score - a.score);
    if (!extra.length) return;
    const ctaIdx = blocks.findIndex(b => b.role === 'cta');
    let block = { role: 'takeaways', label: '补充要点', lines: [], code: [] };
    if (ctaIdx >= 0) blocks.splice(ctaIdx, 0, block);
    else blocks.push(block);
    for (const s of extra) {
      if (totalChars(plan.title, blocks, platform) >= min) break;
      used.add(s.text);
      const t = compact(s.text, level, platform.id === 'xhs' ? 34 : 76);
      if (t) block.lines.push(platform.id === 'xhs' ? '📌 ' + t : '- ' + t);
    }
    if (!block.lines.length) blocks.splice(blocks.indexOf(block), 1);
  }

  function trimToMax(plan, blocks, platform) {
    // 预留标题、话题标签与空行占位，避免渲染后超出上限
    const max = plan.length.max - (platform.id === 'xhs' ? 45 : 15);
    const priority = {
      story: 6, background: 5, arguments: 4, reasons: 4, checklist: 3, methods: 2,
      steps: 2, tips: 3, timeline: 2, verdict: 2, opinion: 1, prosCons: 2, facts: 2,
      takeaways: 0, data: 0, result: 0, conclusion: 0, code: 0, boundary: 0, cta: 0
    };
    let guard = 200;
    while (totalChars(plan.title, blocks, platform) > max && guard-- > 0) {
      let candidate = null;
      let best = -1;
      blocks.forEach(b => {
        if (b.role === 'cta' || b.role === 'data' || b.role === 'result' || b.role === 'code') return;
        if (b.lines.length <= 1) return;
        const p = priority[b.role] == null ? 2 : priority[b.role];
        if (p > best) { best = p; candidate = b; }
      });
      if (!candidate) break;
      candidate.lines.pop();
    }
  }

  /* ---------------- 平台渲染 ---------------- */
  function render(analysis, plan, platform, blocks, hook, level) {
    const isXhs = platform.id === 'xhs';
    const parts = [plan.title, ''];
    const visible = blocks.filter(b => b.role !== 'cta');

    if (isXhs) {
      parts.push(hook, '');
      visible.forEach(b => {
        if (b.code.length) return;
        if (!b.lines.length) return;
        parts.push('**' + b.label + '**');
        b.lines.forEach(line => parts.push(line));
        parts.push('');
      });
      parts.push(platform.cta.text, '');
      const tags = plan.tags.slice(0, 5).map(t => '#' + String(t).replace(/\s+/g, ''));
      if (tags.length < 3) tags.push('#干货分享', '#经验总结');
      parts.push(tags.join(' '), '');
    } else {
      parts.push(hook, '');
      let idx = 0;
      const CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
      visible.forEach(b => {
        if (b.code.length) {
          idx++;
          parts.push(`## ${CN[idx - 1] || idx}、${b.label}`, '');
          b.code.forEach(c => {
            parts.push('```' + (c.lang || ''), c.code, '```', '');
          });
          return;
        }
        if (!b.lines.length) return;
        if (b.role === 'golden') {
          parts.push('**' + b.lines[0] + '**', '');
          return;
        }
        idx++;
        parts.push(`## ${CN[idx - 1] || idx}、${b.label}`, '');
        if (b.role === 'conclusion' && platform.id === 'csdn') {
          parts.push('> ' + b.lines[0], '');
          return;
        }
        b.lines.forEach(line => parts.push(line));
        parts.push('');
      });
      if (parts[parts.length - 1] !== '') parts.push('');
      parts.push(platform.cta.text, '');
    }

    let body = parts.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    return body;
  }

  function levelFor(platform) {
    return platform.id === 'xhs' || platform.id === 'wechat' ? 2 : 1;
  }

  function write(analysis, plan, platform) {
    const level = levelFor(platform);
    const used = new Set();
    const hook = hookText(analysis, plan, platform, level);
    let blocks = buildBlocks(analysis, plan, platform, used);
    ensureNumbers(analysis, blocks, used, platform, level);
    ensureMustKeep(analysis, plan, blocks, used, platform, level);

    // CTA 作为最后一块参与长度计算
    blocks.push({ role: 'cta', label: '写在最后', lines: [platform.cta.text], code: [] });
    fillToMin(analysis, plan, blocks, used, platform, level);
    trimToMax(plan, blocks, platform);

    const body = render(analysis, plan, platform, blocks, hook, level);
    return {
      title: plan.title,
      body,
      meta: {
        charCount: chars(body),
        hookId: plan.hookId,
        structureId: plan.structureId,
        usedBlockRoles: blocks.map(b => b.role)
      }
    };
  }

  return { write, compact, chars, plain };
});
