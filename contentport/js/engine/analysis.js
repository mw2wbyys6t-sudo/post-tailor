/* =========================================================
   OmniDraft · 内容分析器（engine/analysis.js）
   输入：文章（Markdown）
   输出：章节 / 关键句 / 数字证据 / 代码块 / 表格 / 术语 /
         信息密度 / 内容类型 / 标题钩子素材
   零依赖，浏览器挂 CP.engine.analysis，Node 走 module.exports
   ========================================================= */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.CP = window.CP || {};
    window.CP.engine = window.CP.engine || {};
    window.CP.engine.analysis = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CONCLUSION_RE = /(结论|核心|关键|本质|最重要|意味着|因此|所以|原因|结果|真相|要知道|记住)/;
  const STOP_TERMS = new Set([
    '我们', '你们', '他们', '大家', '自己', '这个', '那个', '这些', '那些', '什么', '怎么',
    '为什么', '可以', '没有', '已经', '还是', '就是', '因为', '所以', '但是', '如果', '而且',
    '然后', '这样', '那样', '一个', '一些', '很多', '比较', '非常', '真的', '其实', '确实',
    '时候', '过程', '方面', '情况', '东西', '工作', '问题', '进行', '能够', '需要', '通过',
    '以及', '或者', '同时', '之后', '之前', '现在', '开始', '觉得', '知道', '看到'
  ]);
  const EN_STOP = new Set([
    'the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'were', 'will',
    'have', 'has', 'had', 'not', 'but', 'you', 'your', 'can', 'all', 'our', 'out', 'use',
    'a', 'an', 'of', 'to', 'in', 'on', 'is', 'it', 'as', 'at', 'by', 'or', 'be', 'we'
  ]);
  const FILLER = /(其实|非常|真的|确实|大家|可以说|一定程度上|在某种程度上|进行|能够|已经|还是|就是|比如|例如|以及|而且|然后|这样|那样|这种|那种|一个|一些|很多|比较|相对|方面|情况|时候|过程|东西)/g;

  function plain(text) {
    return String(text == null ? '' : text)
      .replace(/```[\s\S]*?```/g, '')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_~`>#]/g, '')
      .replace(/\|/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function splitSentences(text) {
    const raw = String(text || '').trim();
    if (!raw) return [];
    return raw
      .split(/(?<=[。！？!?；;])\s*/)
      .map(s => s.trim())
      .filter(s => s.length >= 6);
  }

  /* ---------------- Markdown 结构解析 ---------------- */
  function parseMarkdown(markdown) {
    const lines = String(markdown || '').replace(/\r/g, '').split('\n');
    const sections = [];
    let cur = newSection(null, 0);
    let para = [];
    let inCode = false;
    let codeBuf = [];
    let codeLang = '';

    function newSection(heading, level) {
      return { heading, level, paragraphs: [], bullets: [], quotes: [], code: [], tables: [] };
    }
    function flushPara() {
      if (!para.length) return;
      const text = para.join(' ').trim();
      if (text) cur.paragraphs.push(text);
      para = [];
    }
    function pushSection() {
      flushPara();
      if (cur.heading || cur.paragraphs.length || cur.bullets.length || cur.code.length || cur.tables.length || cur.quotes.length) {
        sections.push(cur);
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (inCode) {
        if (/^```/.test(trimmed)) {
          cur.code.push({ lang: codeLang, code: codeBuf.join('\n') });
          codeBuf = [];
          codeLang = '';
          inCode = false;
        } else {
          codeBuf.push(line.replace(/\t/g, '  '));
        }
        continue;
      }
      if (/^```/.test(trimmed)) {
        flushPara();
        inCode = true;
        codeLang = trimmed.slice(3).trim();
        continue;
      }
      if (!trimmed) { flushPara(); continue; }

      const h = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (h) {
        flushPara();
        pushSection();
        cur = newSection(h[2].trim(), h[1].length);
        continue;
      }
      if (/^\|.*\|$/.test(trimmed)) {
        flushPara();
        const rows = [];
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
          rows.push(lines[i].trim());
          i++;
        }
        i--;
        cur.tables.push(rows.join('\n'));
        continue;
      }
      const li = trimmed.match(/^(?:\d+[.、)]|[-*+])\s+(.+)$/);
      if (li) {
        flushPara();
        cur.bullets.push(li[1].trim());
        continue;
      }
      const q = trimmed.match(/^>\s?(.*)$/);
      if (q) {
        flushPara();
        if (q[1].trim()) cur.quotes.push(q[1].trim());
        continue;
      }
      para.push(trimmed);
    }
    if (inCode && codeBuf.length) cur.code.push({ lang: codeLang, code: codeBuf.join('\n') });
    pushSection();

    return sections.map((s, idx) => ({ ...s, index: idx, name: s.heading || '导语' }));
  }

  /* ---------------- 关键词抽取 ---------------- */
  function extractKeywords(title, sections, bodyText) {
    const headingText = sections.map(s => s.heading || '').join(' ');
    const scores = Object.create(null);
    const add = (term, weight) => {
      const t = String(term || '').trim();
      if (t.length < 2 || t.length > 12) return;
      if (STOP_TERMS.has(t)) return;
      scores[t] = (scores[t] || 0) + weight;
    };

    // 1. 标题 / 小标题中的短语权重最高
    [title, headingText].forEach((src, si) => {
      String(src || '').split(/[\s，。！？：:、|｜（）()【】\[\]"'“”‘’/\\\-—]+/).forEach(w => {
        if (/^[\u4e00-\u9fa5]{2,12}$/.test(w) || /^[A-Za-z][A-Za-z0-9+#.\-]{1,}$/.test(w)) {
          add(w, si === 0 ? 5 : 2.5);
        }
      });
    });

    // 2. 英文技术词频
    const enCount = Object.create(null);
    (bodyText.match(/[A-Za-z][A-Za-z0-9+#.\-]{1,}/g) || []).forEach(w => {
      const low = w.toLowerCase();
      if (EN_STOP.has(low) || w.length < 2) return;
      enCount[w] = (enCount[w] || 0) + 1;
    });
    Object.keys(enCount).forEach(w => {
      if (enCount[w] >= 2) add(w, Math.min(4, enCount[w] * 0.8));
    });

    // 3. 中文 2-4 元组频次
    const seq = bodyText.replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '');
    const grams = Object.create(null);
    for (let n = 2; n <= 4; n++) {
      for (let i = 0; i + n <= seq.length; i++) {
        const g = seq.slice(i, i + n);
        if (!/[\u4e00-\u9fa5]/.test(g)) continue;
        if (STOP_TERMS.has(g) || FILLER.test(g)) { FILLER.lastIndex = 0; continue; }
        grams[g] = (grams[g] || 0) + 1;
      }
    }
    Object.keys(grams).forEach(g => {
      if (grams[g] >= 3) add(g, Math.min(3, grams[g] * 0.25));
    });

    return Object.keys(scores)
      .map(term => ({ term, score: Math.round(scores[term] * 10) / 10 }))
      .sort((a, b) => b.score - a.score || b.term.length - a.term.length)
      .slice(0, 18);
  }

  /* ---------------- 数字证据 ---------------- */
  function extractNumbers(text, sentences) {
    const re = /(\d+(?:\.\d+)?)\s*(%|％|倍|分钟|小时|天|个月|年|毫秒|ms|MB|GB|TB|QPS|万|千|条|次|个|人|元|步|层|张|字|份|款|s)/g;
    const seen = new Set();
    const out = [];
    let m;
    while ((m = re.exec(text))) {
      const value = m[1];
      const unit = m[2];
      const raw = value + unit;
      if (seen.has(raw)) continue;
      seen.add(raw);
      const idx = text.indexOf(raw);
      const context = sentences.find(s => s.text.indexOf(value) >= 0) || null;
      out.push({ value, unit, raw, context: context ? context.text : '', pos: idx });
    }
    return out;
  }

  /* ---------------- 内容类型判定 ---------------- */
  function detectType(article, sections, numbers, keywords) {
    const text = [article.title, ...sections.map(s => s.heading || ''), ...sections.map(s => s.paragraphs.join(' ')), ...sections.map(s => s.bullets.join(' '))].join(' ');
    const codeCount = sections.reduce((n, s) => n + s.code.length, 0);
    const listCount = sections.reduce((n, s) => n + s.bullets.length, 0);
    const count = (re) => (text.match(re) || []).length;

    const scores = {
      tutorial: count(/步骤|搭建|配置|安装|实现|教程|实践|部署|使用|集成|接入|排查|优化|怎么做/g) * 1.2 + codeCount * 3 + Math.min(4, listCount * 0.4),
      experience: count(/复盘|经历|踩坑|一年|三年|我|我们|反思|总结|成长|感悟|血泪/g) * 0.7 + count(/我|我们/g) * 0.5,
      opinion: count(/认为|本质|趋势|观点|判断|未来|应该|正在|时代|方向/g) * 1.3,
      review: count(/实测|评测|对比|横评|评分|维度|测试|胜在|PK|vs/gi) * 1.5,
      explainer: count(/是什么|为什么|原理|比喻|科普|简单说|通俗|概念|本质是/g) * 1.5,
      case: count(/案例|上线后|效果|提升|下降|降低|增长|数据|结果/g) * 1.1 + Math.min(3, numbers.length * 0.3)
    };

    let type = 'experience';
    let best = 0;
    Object.keys(scores).forEach(k => {
      if (scores[k] > best) { best = scores[k]; type = k; }
    });

    const cat = String(article.category || '');
    if (best < 3) {
      if (/技术|干货|开发|编程/.test(cat)) type = 'tutorial';
      else if (/评测|测评/.test(cat)) type = 'review';
      else if (/科普/.test(cat)) type = 'explainer';
      else if (/行业|观察|观点/.test(cat)) type = 'opinion';
      else if (/案例|实战/.test(cat)) type = 'case';
      else if (/职场|成长|个人/.test(cat)) type = 'experience';
    }
    const labels = { tutorial: '教程', experience: '经验', opinion: '观点', review: '测评', explainer: '科普', case: '案例' };
    return { type, label: labels[type] || '经验', scores, best };
  }

  /* ---------------- 主分析入口 ---------------- */
  function analyze(article) {
    const a = article || {};
    const title = String(a.title || '');
    const body = String(a.body || '');
    const sections = parseMarkdown(body);
    if (!sections.length) {
      sections.push({ index: 0, heading: null, level: 0, name: '导语', paragraphs: [plain(body)], bullets: [], quotes: [], code: [], tables: [] });
    }

    const sentences = [];
    sections.forEach(sec => {
      sec.sentences = [];
      const blocks = [];
      sec.paragraphs.forEach(p => blocks.push({ text: p, type: 'para' }));
      sec.quotes.forEach(q => blocks.push({ text: q, type: 'quote' }));
      sec.bullets.forEach(b => blocks.push({ text: b, type: 'bullet' }));
      blocks.forEach(block => {
        splitSentences(block.text).forEach((text, idx) => {
          const s = {
            text,
            sectionIndex: sec.index,
            sectionName: sec.name,
            blockType: block.type,
            idx,
            score: 0,
            hasNumber: /\d/.test(text)
          };
          let score = 0;
          if (idx === 0) score += 2;
          if (sec.index === 0 && idx < 2) score += 2;
          if (CONCLUSION_RE.test(text)) score += 3;
          if (s.hasNumber) score += 2;
          if (text.length >= 18 && text.length <= 72) score += 2;
          if (/(关键|核心|最重要|本质|结论|意味着|因此|所以|原因|结果|方法|步骤|建议)/.test(text)) score += 1;
          s.score = score;
          sec.sentences.push(s);
          sentences.push(s);
        });
      });
    });

    const bodyText = plain(body);
    const keywords = extractKeywords(title, sections, bodyText);
    const numbers = extractNumbers(bodyText, sentences);

    // 关键句：每节挑 1-2 句，再全局排序
    const keyPoints = [];
    sections.forEach(sec => {
      sec.sentences
        .slice()
        .sort((x, y) => y.score - x.score)
        .slice(0, 2)
        .forEach(s => keyPoints.push({ text: s.text, section: sec.name, sectionIndex: sec.index, score: s.score, hasNumber: s.hasNumber }));
    });
    sentences
      .filter(s => s.score >= 5 && !keyPoints.some(k => k.text === s.text))
      .sort((x, y) => y.score - x.score)
      .slice(0, 4)
      .forEach(s => keyPoints.push({ text: s.text, section: s.sectionName, sectionIndex: s.sectionIndex, score: s.score, hasNumber: s.hasNumber }));
    keyPoints.sort((x, y) => y.score - x.score);

    const thesisSentence = sentences.slice().sort((x, y) => {
      const cx = (CONCLUSION_RE.test(x.text) ? 5 : 0) + x.score;
      const cy = (CONCLUSION_RE.test(y.text) ? 5 : 0) + y.score;
      return cy - cx;
    })[0];
    const thesis = (thesisSentence && (CONCLUSION_RE.test(thesisSentence.text) || thesisSentence.text.length >= 12))
      ? thesisSentence.text
      : (keyPoints[0] ? keyPoints[0].text : String(a.summary || title));

    const resultSentence = sentences
      .filter(s => /\d/.test(s.text) && /(下降|降低|提升|提高|增长|上涨|节省|达到|从.+到|翻倍|减少)/.test(s.text))
      .sort((x, y) => y.score - x.score)[0];
    const painSentence = (sections[0] && sections[0].sentences[0]) || sentences[0];
    const timelineSentence = sentences
      .filter(s => /(\d+\s*(?:年|个月|周|天)|从.+到)/.test(s.text))
      .sort((x, y) => y.score - x.score)[0];

    const charCount = bodyText.replace(/\s/g, '').length;
    const typeInfo = detectType(a, sections, numbers, keywords);

    const hasCode = sections.some(s => s.code.length > 0);
    const hasTable = sections.some(s => s.tables.length > 0);
    const hasSteps = sections.some(s => /步骤|做法|实践|方法|优化|流程|实施/.test(s.heading || '')) || sections.some(s => s.bullets.length >= 3);
    const density = sentences.length ? Math.round(charCount / Math.max(1, sentences.length) * 10) / 10 : 0;

    return {
      title,
      summary: String(a.summary || ''),
      category: String(a.category || ''),
      body,
      bodyText,
      sections,
      sentences,
      keyPoints: keyPoints.slice(0, 10),
      numbers,
      keywords,
      thesis,
      resultSentence: resultSentence ? resultSentence.text : '',
      painSentence: painSentence ? painSentence.text : '',
      timelineSentence: timelineSentence ? timelineSentence.text : '',
      sectionTopics: sections.map(s => s.heading).filter(Boolean),
      contentType: typeInfo.type,
      contentTypeLabel: typeInfo.label,
      typeScores: typeInfo.scores,
      charCount,
      wordCount: charCount,
      density,
      hasCode,
      hasTable,
      hasSteps,
      hasList: sections.some(s => s.bullets.length > 0)
    };
  }

  return {
    analyze,
    parseMarkdown,
    splitSentences,
    plain,
    extractKeywords,
    extractNumbers,
    STOP_TERMS
  };
});
