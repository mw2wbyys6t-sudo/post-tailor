/* =========================================================
   OmniDraft · API 层（api.js）
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

  /* 已接入真实发布通道的平台：
     csdn / wechat / zhihu 走官方或网页内部 API 自动发布；
     xhs 走浏览器辅助发布（打开官方发布页，自动填入标题 + 正文入剪贴板） */
  const REAL_PLATFORM_IDS = ['csdn', 'wechat', 'zhihu', 'xhs'];

  /* ========================================================
     凭据保险库
     - Electron：系统钥匙串加密后落盘（safeStorage），渲染进程不持有明文
     - 浏览器：仅进程内内存（用于本地预览，刷新即失效，不落明文）
     存放内容：平台凭据 platform:<pid>、AI Key ai:key
     ======================================================== */
  const memoryVault = new Map();
  const hasKeychain = () => {
    const e = window.electronAPI;
    return !!(e && typeof e.secureSet === 'function');
  };
  const vault = {
    async available() {
      const e = window.electronAPI;
      if (e && typeof e.secureAvailable === 'function') {
        try { return await e.secureAvailable(); } catch (_) { return false; }
      }
      return true; // 浏览器内存模式：仅本会话有效
    },
    async setRaw(key, value) {
      const e = window.electronAPI;
      if (hasKeychain()) {
        await e.secureSet(key, String(value));
        return 'keychain';
      }
      memoryVault.set(key, String(value));
      return 'memory';
    },
    async getRaw(key) {
      const e = window.electronAPI;
      if (hasKeychain()) {
        try { return (await e.secureGet(key)) || ''; } catch (_) { return ''; }
      }
      return memoryVault.get(key) || '';
    },
    async clearRaw(key) {
      const e = window.electronAPI;
      if (hasKeychain()) {
        await e.secureDelete(key);
        return;
      }
      memoryVault.delete(key);
    },
    async set(platformId, credential) {
      return vault.setRaw('platform:' + platformId, JSON.stringify(credential));
    },
    async get(platformId) {
      const raw = await vault.getRaw('platform:' + platformId);
      if (!raw) return null;
      try { return JSON.parse(raw); } catch (_) { return null; }
    },
    async clear(platformId) {
      return vault.clearRaw('platform:' + platformId);
    },
    /* AI Key 同样走保险库，不再明文写 localStorage */
    async getAiKey() {
      const stored = await vault.getRaw('ai:key');
      if (stored) return stored;
      const legacy = (S().settings.ai && S().settings.ai.apiKey) || '';
      if (legacy) {
        try {
          await vault.setRaw('ai:key', legacy);
          const s = S().settings;
          s.ai.apiKey = '';
          CP.actions.saveSettings(s);
        } catch (_) { /* 保险库不可用则退回原值 */ }
      }
      return legacy;
    },
    async setAiKey(value) {
      if (!value) {
        await vault.clearRaw('ai:key');
        return 'cleared';
      }
      return vault.setRaw('ai:key', value);
    },
    /* 老版本把平台凭据明文写在 settings.accounts[pid].credential，这里一次性迁移 */
    async migrate() {
      const accounts = S().settings.accounts || {};
      let changed = false;
      for (const pid of Object.keys(accounts)) {
        const acc = accounts[pid];
        if (acc && acc.credential) {
          try {
            await vault.set(pid, acc.credential);
            delete acc.credential;
            acc.credOk = true;
            changed = true;
          } catch (_) { /* 保险库不可用时保留原状，不丢用户凭据 */ }
        }
      }
      if (changed) CP.actions.saveSettings(S().settings);
      return changed;
    }
  };
  CP.vault = vault;

  /* ========================================================
     AI 调用基础（OpenAI 兼容 /chat/completions）
     ======================================================== */
  async function aiChat(messages, { json = false, temperature = 0.7, maxTokens = 4000 } = {}) {
    const s = S().settings.ai;
    const apiKey = await vault.getAiKey();
    if (!apiKey) throw new Error('未配置 AI API Key');
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
      data = await window.electronAPI.callAI({ url, body, apiKey });
    } else {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
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
       GET /api/articles?query=&category=&status=&tag=
       category 可传数组（多选分类）；tag 为单个标签
       -------------------------------------------------------- */
    async fetchArticles(filter = {}) {
      await delay(300);
      let list = [...S().articles];
      if (filter.query) {
        const q = filter.query.toLowerCase();
        list = list.filter(a => (a.title + a.summary + a.category + (a.tags || []).join(' ')).toLowerCase().includes(q));
      }
      const cats = Array.isArray(filter.categories)
        ? filter.categories
        : (filter.category && filter.category !== '全部' ? [filter.category] : []);
      if (cats.length) {
        list = list.filter(a => cats.includes(a.category));
      }
      if (filter.tag && filter.tag !== '全部') {
        list = list.filter(a => (a.tags || []).includes(filter.tag));
      }
      if (filter.status && filter.status !== '全部') {
        list = list.filter(a => a.status === filter.status);
      }
      return { code: 0, data: list, total: list.length };
    },

    /* --------------------------------------------------------
       POST /api/articles  —— 新建文章
       body: { title, category, body, tags? }
       -------------------------------------------------------- */
    async createArticle({ title, category, body, tags }) {
      await delay(400);
      const wordCount = (body || '').replace(/\s/g, '').length;
      const article = {
        id: 'a' + Date.now(),
        title,
        summary: (body || '').slice(0, 60) + '……',
        category: category || '技术干货',
        tags: Array.isArray(tags) ? tags.slice(0, 5) : [],
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
       POST /api/sniff  —— 生成平台受众画像基线
       body: { platformIds: string[] }
       说明：本应用不抓取平台实时数据。这里输出的是内置平台画像
       基线（受众、语气、结构偏好），数值由画像雷达确定性推导，
       不掺随机数，也不宣称是实时快照。
       -------------------------------------------------------- */
    async runSniff(platformIds) {
      await delay(1400);
      const platforms = M().PLATFORMS.filter(p => platformIds.includes(p.id));
      const BEST_TIME = {
        csdn: ['9-11 点', '14-17 点'],
        wechat: ['7-9 点', '20-22 点'],
        xhs: ['12-14 点', '19-23 点'],
        zhihu: ['21-23 点', '周末上午']
      };
      const reports = platforms.map(p => {
        const r = p.radar;
        return {
          platformId: p.id,
          basis: '内置画像基线',
          snapshot: {
            // 用于排序参考的画像强度，由雷达维度加权得出（非平台真实热度）
            heatIndex: Math.round(r.info * 0.3 + r.depth * 0.3 + r.interaction * 0.2 + r.tone * 0.2),
            deepIndex: r.depth,
            activeTime: BEST_TIME[p.id] || ['20-22 点'],
            updatedAt: new Date().toLocaleDateString('zh-CN')
          },
          audience: p.audience,
          trending: p.trending,
          styleRules: p.styleRules,
          radar: r
        };
      });
      CP.actions.markSniffDone();
      return { code: 0, data: reports };
    },

    /* --------------------------------------------------------
       POST /api/rewrite  —— 平台自适应改写
       body: { articleId, platformIds }
       走 engine/pipeline：内容分析 → 平台规划 →（AI 计划/成稿/
       质检修复）→ 本地质检；无 AI 时确定性成稿兜底
       -------------------------------------------------------- */
    async rewriteArticle(articleId, platformIds) {
      const article = CP.actions.getArticle(articleId);
      if (!article) return { code: 1, msg: '文章不存在' };

      const aiReady = !!(await vault.getAiKey()) && !!S().settings.ai.baseUrl;
      const pipeline = CP.engine && CP.engine.pipeline;
      const results = {};
      const errors = {};

      await Promise.all(platformIds.map(async (pid) => {
        if (pipeline && typeof pipeline.run === 'function') {
          try {
            results[pid] = await pipeline.run(article, pid, {
              aiChat: aiReady ? aiChat : null,
              portrait: S().portrait || {}
            });
            return;
          } catch (e) {
            errors[pid] = e.message || '改写失败';
          }
        }
        results[pid] = CP.genRewrite(article, pid);
      }));

      return { code: 0, data: results, ai: aiReady, errors };
    },

    /* --------------------------------------------------------
       POST /api/ai/adapt  —— AI 深度改写（单平台再打磨）
       body: { articleId, platformId }
       -------------------------------------------------------- */
    async aiDeepRewrite(articleId, platformId) {
      const settings = S().settings.ai;
      const apiKey = await vault.getAiKey();
      if (!apiKey || !settings.baseUrl) {
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
        // 润色后必须重新本地质检，不能沿用模型自报分数
        const engine = CP.engine;
        if (engine && engine.analysis && engine.planner && engine.quality) {
          const analysis = engine.analysis.analyze(article);
          const platform = engine.strategies.getPlatform(platformId);
          const plan = engine.planner.buildPlan(analysis, platformId, S().portrait || {});
          const qa = engine.quality.check({ title: prev.title, body: prev.body }, analysis, plan, platform);
          prev.quality = qa;
          prev.score = qa.total;
          prev.engine = prev.engine || 'hybrid';
          prev.aiGenerated = true;
        } else if (parsed.score) {
          prev.score = clamp(parsed.score);
        }
        CP.actions.setRewriteResult(platformId, prev);
      }
      return { code: 0, msg: 'AI 深度改写完成', useRule: false, data: parsed };
    },

    /* --------------------------------------------------------
       GET /api/ai/ready  —— 是否已配置可用的 AI（Key 在保险库）
       -------------------------------------------------------- */
    async isAiReady() {
      return !!(await vault.getAiKey()) && !!S().settings.ai.baseUrl;
    },

    /* --------------------------------------------------------
       GET /api/ai/ping  —— 测试 AI 连接
       -------------------------------------------------------- */
    async aiPing() {
      const s = S().settings.ai;
      if (!(await vault.getAiKey()) || !s.baseUrl) return { code: 2, msg: '请先填写 Base URL 与 API Key' };
      const t0 = Date.now();
      const content = await aiChat([
        { role: 'user', content: '请只回复两个字：正常' }
      ], { temperature: 0, maxTokens: 16 });
      return { code: 0, msg: '连接正常', costMs: Date.now() - t0, sample: content };
    },

    /* --------------------------------------------------------
       POST /api/accounts/login  —— 登录平台账号（真实校验）
       body: { platformId, method, nickname, credential, cookie }
       credential 按平台结构：
         csdn   → { username, password }
         wechat → { appid, secret }
         zhihu / xhs → { cookie }（扫码登录捕获）
       Electron：走主进程平台通道（CSDN MetaWeblog / 微信 API / 知乎·小红书 Cookie）
       浏览器：返回模拟结果（演示）
       -------------------------------------------------------- */
    async loginAccount(platformId, { method, nickname, credential, cookie } = {}) {
      await delay(400);
      const plat = M().PLATFORMS.find(p => p.id === platformId);
      if (!plat) return { code: 1, msg: '未知平台' };

      // 真实登录通道（Electron）
      const electron = window.electronAPI;
      if (electron && typeof electron.loginTo === 'function') {
        // CSDN/微信只支持开放凭据（MetaWeblog 需用户名+密码，微信需 AppID+Secret）
        if (method === 'cookie' && (platformId === 'csdn' || platformId === 'wechat')) {
          return { code: 1, msg: `${plat.name} 暂不支持 Cookie 登录，请使用开放 API 凭据` };
        }
        try {
          // 手动 Cookie 方式：把 cookie 装进凭据，主进程直接校验
          const cred = credential || {};
          if (method === 'cookie' && cookie && !cred.cookie) cred.cookie = cookie;
          const info = await electron.loginTo({ platformId, credential: cred });
          return { code: 0, data: { nickname: info.nickname, method: info.method } };
        } catch (e) {
          return { code: 1, msg: e.message || '登录校验失败' };
        }
      }

      // 浏览器回退：模拟校验（演示）
      if (method === 'cookie' && !cookie) return { code: 1, msg: 'Cookie 为空' };
      if (method === 'api' && !credential) return { code: 1, msg: '凭据为空' };
      return { code: 0, data: { nickname: nickname || plat.name + '用户', method } };
    },

    /* --------------------------------------------------------
       POST /api/accounts/login-oauth  —— 扫码登录（打开平台登录页）
       body: { platformId }
       仅 Electron 可用：知乎 / 小红书
       -------------------------------------------------------- */
    async loginOAuth(platformId) {
      const electron = window.electronAPI;
      if (electron && typeof electron.loginOAuth === 'function') {
        try {
          const info = await electron.loginOAuth({ platformId });
          return { code: 0, data: { cookie: info.cookie, nickname: info.nickname, method: info.method || 'oauth' } };
        } catch (e) {
          return { code: 1, msg: e.message || '扫码登录失败' };
        }
      }
      return { code: 1, msg: '扫码登录仅支持 Electron 桌面版' };
    },

    /* --------------------------------------------------------
       POST /api/publish  —— 发布文章到平台
       实际模式：接平台开放 API 自动发布；未接入时生成复制稿
       -------------------------------------------------------- */
    async publish({ articleId, platformId, title, body, accountNickname = '', scheduledAt, score = null, algorithm = null }) {
      await delay(1500);
      const article = CP.actions.getArticle(articleId);
      const platform = M().PLATFORMS.find(p => p.id === platformId);

      // 定时发布：若指定了未来时间，先入队，到点由调度器执行
      if (scheduledAt) {
        const t = new Date(scheduledAt).getTime();
        if (t > Date.now()) {
          CP.actions.addScheduled({ articleId, platformId, title, body, scheduledAt, score, algorithm });
          return { code: 0, data: { mode: 'scheduled', platformName: platform.name }, msg: '已加入定时发布队列' };
        }
      }
      // 已登录账号 → 自动发布；否则复制稿模式
      const accounts = S().settings.accounts || {};
      const acc = accounts[platformId];
      // 凭据从系统保险库读取，渲染进程不再持有明文
      const credential = await vault.get(platformId);
      const credOk = !!(acc && acc.linked && credential && acc.credOk !== false);
      // 仅「已接入真实通道 + 已绑定账号 + 凭据可用」才走自动发布
      const realReady = REAL_PLATFORM_IDS.includes(platformId);
      const autoPublish = !!(credOk && realReady);
      const pendingReal = !!(acc && acc.linked && !credOk && realReady);
      const rec = {
        id: 'h' + Date.now(),
        articleId,
        platformId,
        accountNickname: autoPublish ? (accountNickname || acc.nickname) : '',
        status: '已发布',
        time: new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-'),
        link: '',
        views: 0,
        likes: 0,
        score: score != null ? score : 80 + Math.round(Math.random() * 15)
      };
      if (algorithm) rec.algorithm = algorithm;

      // 真实发布通道（Electron + 已登录账号）
      const electron = window.electronAPI;
      if (autoPublish && electron && typeof electron.publishTo === 'function') {
        try {
          const result = await electron.publishTo({
            platformId,
            credential,
            title,
            content: body,
            digest: (article && article.summary) || ''
          });
          // 小红书：已打开官方发布页，等待用户页面确认
          if (result.status === 'opened') {
            rec.status = '已打开发布页';
            rec.link = '';
            CP.actions.addHistory(rec);
            return { code: 0, data: { rec, mode: 'auto', openedPage: true, platformName: result.platformName || platform.name, note: result.note || '' } };
          }
          rec.status = '已发布';
          rec.link = result.url || result.link || '';
          if (result.postid) rec.postId = result.postid;
          if (result.publish_id) rec.publishId = result.publish_id;
          CP.actions.addHistory(rec);
          return { code: 0, data: { rec, mode: 'auto', platformName: result.platformName || platform.name, note: result.note || '' } };
        } catch (e) {
          rec.status = '失败';
          rec.failReason = e.message || '发布失败';
          CP.actions.addHistory(rec);
          return { code: 1, msg: e.message || '发布失败', data: { rec, mode: 'auto', platformName: platform.name } };
        }
      }

      // 复制稿模式
      rec.status = autoPublish ? '已发布' : '复制稿已生成';
      if (!autoPublish) {
        rec.link = '';
        rec.copyContent = { title, body }; // 复制稿导出用
      }
      CP.actions.addHistory(rec);
      return { code: 0, data: { rec, mode: autoPublish ? 'auto' : 'copy', pendingReal, platformName: platform.name } };
    },

    /* --------------------------------------------------------
       GET /api/stats  —— 回拉平台文章数据（阅读/点赞/评论）
       body: { platformId, postId }
       仅 Electron + 已登录账号可用
       -------------------------------------------------------- */
    async fetchStats({ platformId, postId }) {
      if (!postId) return { code: 1, msg: '该记录没有可回拉的文章标识（小红书为浏览器辅助发布，暂不支持回拉）' };
      const accounts = S().settings.accounts || {};
      const acc = accounts[platformId];
      const credential = await vault.get(platformId);
      if (!acc || !acc.linked || !credential) return { code: 1, msg: '请先到账号中心登录该平台账号' };
      const electron = window.electronAPI;
      if (!electron || typeof electron.fetchStats !== 'function') {
        return { code: 1, msg: '数据回拉仅支持 Electron 桌面版' };
      }
      try {
        const stats = await electron.fetchStats({ platformId, credential, postId });
        return { code: 0, data: stats };
      } catch (e) {
        return { code: 1, msg: e.message || '数据回拉失败' };
      }
    },

    /* --------------------------------------------------------
       POST /api/stats/pull-all  —— 批量回拉所有可回拉的发布记录
       供「回拉全部数据」按钮与自动定时回拉共用
       -------------------------------------------------------- */
    /* 把本次回拉结果追加为一条趋势快照（保留最近 20 个点） */
    snapshotSeries(h, d) {
      const t = new Date().toLocaleString('zh-CN', {
        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
      });
      const series = Array.isArray(h.series) ? h.series.slice(-19) : [];
      series.push({ t, views: Number(d.views) || 0, likes: Number(d.likes) || 0, comments: Number(d.comments) || 0 });
      return series;
    },

    async pullAllStats() {
      const targets = S().history.filter(h => (h.postId || h.publishId) && h.platformId !== 'xhs');
      let updated = 0, fail = 0, firstFail = '';
      for (const h of targets) {
        const res = await this.fetchStats({ platformId: h.platformId, postId: h.postId || h.publishId });
        if (res.code === 0) {
          const d = res.data;
          const patch = {
            views: Number(d.views) || 0,
            likes: Number(d.likes) || 0,
            comments: Number(d.comments) || 0,
            series: this.snapshotSeries(h, d),
            lastSync: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
          };
          if (d.status) patch.remoteStatus = d.status;
          CP.actions.updateHistory(h.id, patch);
          updated++;
        } else {
          fail++;
          firstFail = firstFail || res.msg;
        }
      }
      if (targets.length > 0) {
        try { window.dispatchEvent(new Event('cp:stats-updated')); } catch (_) { /* ignore */ }
      }
      return { total: targets.length, updated, fail, firstFail };
    }
  };

  CP.api = api;
  /* 已接入真实发布 API 的平台（供前端展示） */
  CP.REAL_PLATFORM_IDS = REAL_PLATFORM_IDS;
})();
