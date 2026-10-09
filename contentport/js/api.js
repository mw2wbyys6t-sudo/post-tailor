/* =========================================================
   ContentPort · API 层（api.js）
   所有接口以「真实 API 形态」定义：方法 + 路径 + 请求/响应形状
   - 配置 AI API Key 后：改写走真实大模型（OpenAI 兼容协议）
   - 未配置 / 请求失败：自动回退内置规则引擎
   - Electron 环境走主进程调用（绕过 CORS）；浏览器环境直接 fetch
   ========================================================= */
window.CP = window.CP || {};

(function () {
  const delay = (ms) => new Promise(r => setTimeout(r, ms));
  const M = () => CP.mock;
  const S = () => CP.state;

  /* ========================================================
     AI 调用基础（OpenAI 兼容 /chat/completions）
     ======================================================== */
  async function aiChat(messages, { json = false, temperature = 0.7, maxTokens = 4000 } = {}) {
    const s = S().settings.ai;
    if (!s.apiKey) throw new Error('未配置 AI API Key');
    const base = (s.baseUrl || 'https://api.deepseek.com').replace(/\/+$/, '');
    const url = base + '/chat/completions';
    const body = {
      model: s.model || 'deepseek-chat',
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: false,
      ...(json ? { response_format: { type: 'json_object' } } : {})
    };

    let data;
    if (window.electronAPI && typeof window.electronAPI.callAI === 'function') {
      // Electron：主进程代理调用（无 CORS 限制，Key 不出本机）
      data = await window.electronAPI.callAI({ url, body, apiKey: s.apiKey });
    } else {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s.apiKey },
        body: JSON.stringify(body)
      });
      if (!resp.ok) {
        let msg = 'AI 请求失败 (' + resp.status + ')';
        try {
          const e = await resp.json();
          msg += '：' + (e.error?.message || (e.error?.type || ''));
        } catch (_) { /* ignore */ }
        throw new Error(msg);
      }
      data = await resp.json();
    }

    const content = data?.choices?.[0]?.message?.content || '';
    if (!content) throw new Error('AI 返回内容为空');
    return content;
  }

  /* 宽松解析 AI 返回的 JSON（容忍 ```json 围栏与前后杂文本） */
  function parseJsonLoose(content) {
    let text = String(content).trim();
    // 去掉 markdown 代码围栏
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    // 提取第一个 { ... } 块（处理模型偶尔输出解释文字的情况）
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) throw new Error('AI 未返回有效 JSON');
    return JSON.parse(text.slice(start, end + 1));
  }

  const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Number(n) || 0));

  /* ========================================================
     受众自适应改写（AI 优先，规则引擎兜底）
     ======================================================== */
  async function aiRewrite(article, pid) {
    const plat = M().PLATFORMS.find(p => p.id === pid);
    const portrait = S().portrait || {};

    const system = `你是资深的多平台内容运营与写作专家，精通${M().PLATFORMS.map(p => p.name).join('、')}等平台的读者心理、内容偏好与爆款方法论。你的任务是把同一篇文章改写为该平台"原生感"版本——不是简单搬运，而是让读者以为内容就是为这个平台写的。

要求：
1. 严格遵守目标平台画像（受众、语气、字数、标题策略、风格规则）；
2. 结合用户画像（作者定位、领域、目标读者）做取舍；
3. 输出必须是合法 JSON，不要输出任何解释文字；
4. JSON 结构固定如下：
{
  "title": "改写后的标题",
  "body": "改写后的正文（markdown：## 分节、- 列表、> 引用、**加粗**，段落间空行）",
  "changes": [{"dim":"标题/开头/结构/语气/字数","from":"原文对应","to":"改写后","reason":"依据平台画像的原因"}],
  "score": 0-100 之间的适配度整数,
  "keywords": ["2-4 个平台热门标签关键词"],
  "fitted": "一条该平台受众阅读习惯（直接取自画像 habits 中的一条）"
}`;

    const user = `【平台画像】
${JSON.stringify({ name: plat.name, tagline: plat.tagline, audience: plat.audience, trending: plat.trending, styleRules: plat.styleRules }, null, 2)}

【用户画像】
${JSON.stringify(portrait, null, 2)}

【原文】
标题：${article.title}
分类：${article.category}
字数：${article.wordCount}
${article.body}

请输出该文章在「${plat.name}」的完整改写方案 JSON。`;

    const content = await aiChat([
      { role: 'system', content: system },
      { role: 'user', content: user }
    ], { json: true, temperature: 0.75, maxTokens: 5000 });

    const parsed = parseJsonLoose(content);
    const fallback = CP.genRewrite(article, pid);

    return {
      platformId: pid,
      platformName: plat.name,
      platformColor: plat.color,
      title: (parsed.title || fallback.title).slice(0, 80),
      body: parsed.body || fallback.body,
      changes: Array.isArray(parsed.changes) && parsed.changes.length ? parsed.changes : fallback.changes,
      score: clamp(parsed.score, 0, 100) || fallback.score,
      keywords: Array.isArray(parsed.keywords) && parsed.keywords.length ? parsed.keywords.slice(0, 4) : fallback.keywords,
      fitted: parsed.fitted || fallback.fitted,
      aiGenerated: true
    };
  }

  const api = {
    /* --------------------------------------------------------
       GET /api/portrait  —— 获取用户画像（问答结果）
       -------------------------------------------------------- */
    async fetchPortrait() {
      await delay(200);
      return { code: 0, data: S().portrait };
    },

    /* --------------------------------------------------------
       POST /api/portrait  —— 保存用户画像
       body: { portrait }
       -------------------------------------------------------- */
    async savePortrait(portrait) {
      await delay(500);
      CP.actions.setPortrait(portrait);
      return { code: 0, data: portrait };
    },

    /* --------------------------------------------------------
       GET /api/articles?query=&category=&status=
       -------------------------------------------------------- */
    async fetchArticles(filter = {}) {
      await delay(300);
      let list = [...S().articles];
      if (filter.query) {
        const q = filter.query.toLowerCase();
        list = list.filter(a => (a.title + a.summary + a.category).toLowerCase().includes(q));
      }
      if (filter.category && filter.category !== '全部') {
        list = list.filter(a => a.category === filter.category);
      }
      if (filter.status && filter.status !== '全部') {
        list = list.filter(a => a.status === filter.status);
      }
      return { code: 0, data: list, total: list.length };
    },

    /* --------------------------------------------------------
       POST /api/articles  —— 新建文章
       body: { title, category, body }
       -------------------------------------------------------- */
    async createArticle({ title, category, body }) {
      await delay(400);
      const wordCount = (body || '').replace(/\s/g, '').length;
      const article = {
        id: 'a' + Date.now(),
        title,
        summary: (body || '').slice(0, 60) + '……',
        category: category || '技术干货',
        wordCount: Math.max(wordCount, 300),
        status: '草稿',
        source: '本地导入',
        createdAt: new Date().toISOString().slice(0, 10),
        readMin: Math.max(1, Math.round(wordCount / 400)),
        body
      };
      CP.actions.addArticle(article);
      return { code: 0, data: article };
    },

    /* --------------------------------------------------------
       POST /api/sniff  —— 触发平台受众嗅探
       body: { platformIds: string[] }
       返回每个平台的受众嗅探报告
       -------------------------------------------------------- */
    async runSniff(platformIds) {
      await delay(3200);
      const platforms = M().PLATFORMS.filter(p => platformIds.includes(p.id));
      const reports = platforms.map(p => ({
        platformId: p.id,
        snapshot: {
          heatIndex: 60 + Math.round(Math.random() * 35),
          activeTime: ['9-11 点', '12-14 点', '20-23 点'],
          growth: (4 + Math.random() * 10).toFixed(1) + '%',
          sampledAt: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
        },
        audience: p.audience,
        trending: p.trending,
        styleRules: p.styleRules,
        radar: p.radar
      }));
      CP.actions.markSniffDone();
      return { code: 0, data: reports };
    },

    /* --------------------------------------------------------
       POST /api/rewrite  —— 受众自适应改写
       body: { articleId, platformIds }
       配置 AI 后走真实大模型；否则规则引擎
       -------------------------------------------------------- */
    async rewriteArticle(articleId, platformIds) {
      const article = CP.actions.getArticle(articleId);
      if (!article) return { code: 1, msg: '文章不存在' };

      const aiReady = !!(S().settings.ai.apiKey && S().settings.ai.baseUrl);
      const results = {};
      const errors = {};

      // 并行改写各平台，任一失败自动回退规则引擎
      await Promise.all(platformIds.map(async (pid) => {
        const fallback = () => {
          const sample = M().REWRITE_SAMPLES[pid];
          if (articleId === 'a1' && sample) {
            const plat = M().PLATFORMS.find(p => p.id === pid);
            const engine = CP.genRewrite(article, pid);
            return {
              platformId: pid,
              platformName: plat.name,
              platformColor: plat.color,
              title: sample.title,
              body: sample.body,
              changes: engine.changes,
              score: { csdn: 92, wechat: 90, xhs: 87, zhihu: 91 }[pid] || 88,
              keywords: [article.keyword || article.category, ...plat.trending.slice(0, 2)],
              fitted: plat.audience.habits[0]
            };
          }
          return CP.genRewrite(article, pid);
        };

        if (aiReady) {
          try {
            results[pid] = await aiRewrite(article, pid);
            return;
          } catch (e) {
            errors[pid] = e.message;
          }
        }
        results[pid] = fallback();
      }));

      return { code: 0, data: results, ai: aiReady, errors };
    },

    /* --------------------------------------------------------
       POST /api/ai/adapt  —— AI 深度改写（单平台再打磨）
       body: { articleId, platformId }
       -------------------------------------------------------- */
    async aiDeepRewrite(articleId, platformId) {
      const settings = S().settings.ai;
      if (!settings.apiKey || !settings.baseUrl) {
        return { code: 2, msg: '未配置 AI API，已使用内置规则引擎完成改写', useRule: true };
      }
      const article = CP.actions.getArticle(articleId);
      const prev = S().ui.rewriteResults[platformId];
      const plat = M().PLATFORMS.find(p => p.id === platformId);
      if (!article || !plat) return { code: 1, msg: '文章或平台不存在' };

      const content = await aiChat([
        {
          role: 'system',
          content: '你是资深平台内容润色专家。请在保留原意与结构的基础上，把文稿打磨得更契合平台受众：优化节奏、钩子、金句与可读性。输出必须是合法 JSON：{"title":"新标题","body":"润色后的 markdown 正文","score":0-100,"notes":"1-2 句说明本次打磨重点"}。不要输出 JSON 以外的任何文字。'
        },
        {
          role: 'user',
          content: `【平台】${plat.name}（受众：${plat.audience.role}，语气偏好：${plat.audience.tone}）\n【当前标题】${prev ? prev.title : article.title}\n【当前正文】\n${prev ? prev.body : article.body}`
        }
      ], { json: true, temperature: 0.7, maxTokens: 5000 });

      const parsed = parseJsonLoose(content);
      if (prev && parsed.title) {
        prev.title = String(parsed.title).slice(0, 80);
        if (parsed.body) prev.body = parsed.body;
        if (parsed.score) prev.score = clamp(parsed.score);
        CP.actions.setRewriteResult(platformId, prev);
      }
      return { code: 0, msg: 'AI 深度改写完成', useRule: false, data: parsed };
    },

    /* --------------------------------------------------------
       GET /api/ai/ping  —— 测试 AI 连接
       -------------------------------------------------------- */
    async aiPing() {
      const s = S().settings.ai;
      if (!s.apiKey || !s.baseUrl) return { code: 2, msg: '请先填写 Base URL 与 API Key' };
      const t0 = Date.now();
      const content = await aiChat([
        { role: 'user', content: '请只回复两个字：正常' }
      ], { temperature: 0, maxTokens: 16 });
      return { code: 0, msg: '连接正常', costMs: Date.now() - t0, sample: content };
    },

    /* --------------------------------------------------------
       POST /api/publish  —— 发布文章到平台
       实际模式：接平台开放 API 自动发布；未接入时生成复制稿
       -------------------------------------------------------- */
    async publish({ articleId, platformId, title, body }) {
      await delay(1500);
      const article = CP.actions.getArticle(articleId);
      const platform = M().PLATFORMS.find(p => p.id === platformId);
      const autoPublish = !!S().settings.platforms && !!S().settings.platforms[platformId];
      const rec = {
        id: 'h' + Date.now(),
        articleId,
        platformId,
        status: autoPublish ? '已发布' : '复制稿已生成',
        time: new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-'),
        link: autoPublish ? `https://${platformId}.example/${articleId}` : '',
        views: 0,
        likes: 0,
        score: 80 + Math.round(Math.random() * 15)
      };
      CP.actions.addHistory(rec);
      return { code: 0, data: { rec, mode: autoPublish ? 'auto' : 'copy', platformName: platform.name } };
    }
  };

  CP.api = api;
})();
