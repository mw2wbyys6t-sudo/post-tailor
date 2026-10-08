/* =========================================================
   ContentPort · API 桩层（api.js）
   所有接口以「真实 API 形态」定义：方法 + 路径 + 请求/响应形状
   接入后端或真实大模型时，只需替换实现，保持签名不变
   ========================================================= */
window.CP = window.CP || {};

(function () {
  const delay = (ms) => new Promise(r => setTimeout(r, ms));
  const M = () => CP.mock;
  const S = () => CP.state;

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
       POST /api/sniff  —— 触发平台受众嗅探（模拟爬虫分析）
       body: { platformIds: string[] }
       返回每个平台的受众嗅探报告
       -------------------------------------------------------- */
    async runSniff(platformIds) {
      await delay(3200);
      const platforms = M().PLATFORMS.filter(p => platformIds.includes(p.id));
      // 嗅探结果 = 平台画像 + 附加一次实时快照（互动指数 / 热度）
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
       返回各平台改写稿 + 调整清单 + 适配度评分
       -------------------------------------------------------- */
    async rewriteArticle(articleId, platformIds) {
      await delay(2600);
      const article = CP.actions.getArticle(articleId);
      if (!article) return { code: 1, msg: '文章不存在' };
      const results = {};
      platformIds.forEach(pid => {
        // 精选文章使用手工打磨的样例；其余由规则引擎生成
        const sample = M().REWRITE_SAMPLES[pid];
        if (articleId === 'a1' && sample) {
          const plat = M().PLATFORMS.find(p => p.id === pid);
          const engine = CP.genRewrite(article, pid);
          results[pid] = {
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
        } else {
          results[pid] = CP.genRewrite(article, pid);
        }
      });
      return { code: 0, data: results };
    },

    /* --------------------------------------------------------
       POST /api/publish  —— 发布文章到平台
       body: { articleId, platformId, title, body }
       实际模式：接平台开放 API 自动发布；未接入时生成复制稿
       -------------------------------------------------------- */
    async publish({ articleId, platformId, title, body }) {
      await delay(1500);
      const article = CP.actions.getArticle(articleId);
      const platform = M().PLATFORMS.find(p => p.id === platformId);
      // 若已配置该平台 API Key，则走自动发布；否则生成「复制稿」模式
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
    },

    /* --------------------------------------------------------
       POST /api/ai/adapt  —— AI 深度改写（配置 API 后生效）
       body: { articleId, platformId }
       未配置时返回「升级提示」
       -------------------------------------------------------- */
    async aiDeepRewrite(articleId, platformId) {
      const settings = S().settings.ai;
      await delay(600);
      if (!settings.apiKey) {
        return { code: 2, msg: '未配置 AI API，已使用内置规则引擎完成改写', useRule: true };
      }
      // TODO: 替换为真实大模型调用（baseUrl + apiKey）
      return { code: 0, msg: 'AI 深度改写完成', useRule: false };
    }
  };

  CP.api = api;
})();
