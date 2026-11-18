/* =========================================================
   OmniDraft · 状态层（state.js）
   集中管理：用户画像 / 文章库 / 发布记录 / 当前选择 / UI 状态
   持久化：localStorage（刷新不丢失）
   ========================================================= */
window.CP = window.CP || {};

(function () {
  const LS = {
    portrait: 'cp.portrait.v1',
    articles: 'cp.articles.v1',
    history: 'cp.history.v1',
    settings: 'cp.settings.v1',
    sniffDone: 'cp.sniffDone.v1',
    scheduled: 'cp.scheduled.v1',
    rewrites: 'cp.rewrites.v1',
    drafts: 'cp.drafts.v1',
    aiUsage: 'cp.aiUsage.v1'
  };

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function save(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
      return true;
    } catch (e) {
      return false; // 配额不足等：由调用方决定是否提示
    }
  }

  /* AI 润色每日额度（本机账号维度） */
  const AI_POLISH_LIMIT = 20;

  const state = {
    portrait: load(LS.portrait, null),            // 用户画像（问答结果）
    articles: load(LS.articles, null),            // 文章库（含用户新增）
    history: load(LS.history, null),              // 发布记录
    settings: load(LS.settings, {
      ai: { baseUrl: 'https://api.deepseek.com', apiKey: '', model: 'deepseek-chat' },
      autoPull: { enabled: true, interval: 30 }
    }),
    sniffDone: load(LS.sniffDone, false),         // 是否完成过嗅探
    scheduledPublishes: load(LS.scheduled, []),   // 定时发布任务队列
    rewrites: load(LS.rewrites, {}),              // 改写稿持久化 { articleId: { platformId: result } }
    drafts: load(LS.drafts, {}),                  // 编辑器草稿 { articleId|'new': { title, body, ... } }
    aiUsage: load(LS.aiUsage, { date: '', polish: 0 }), // AI 润色每日用量
    /* ---- 会话内 UI 状态 ---- */
    ui: {
      activeArticleId: null,                       // 分发工作台选中的文章
      selectedPlatforms: ['csdn', 'wechat', 'xhs', 'zhihu'], // 分发目标
      rewriteResults: {},                          // 当前文章的 { platformId: rewrite }
      editingArticleId: null,                      // 文章详情抽屉
      toasts: []
    },
    LS
  };

  /* 默认接入 DeepSeek：老版本设置里 Base URL / 模型为空时补齐，填 Key 即可用 */
  if (!state.settings.ai || typeof state.settings.ai !== 'object') state.settings.ai = { apiKey: '' };
  let aiDefaultsChanged = false;
  if (!state.settings.ai.baseUrl) { state.settings.ai.baseUrl = 'https://api.deepseek.com'; aiDefaultsChanged = true; }
  if (!state.settings.ai.model) { state.settings.ai.model = 'deepseek-chat'; aiDefaultsChanged = true; }
  if (aiDefaultsChanged) save(LS.settings, state.settings);

  /* ---------- 首次启动：内置样例数据，显式标记为演示 ---------- */
  if (!state.articles) {
    state.articles = CP.mock.ARTICLES.map(a => ({ ...a, demo: true }));
    save(LS.articles, state.articles);
  }
  if (!state.history) {
    state.history = CP.mock.HISTORY.map(h => ({ ...h, demo: true }));
    save(LS.history, state.history);
  }

  /* 本地日期键：额度按用户所在时区的自然日重置 */
  function todayKey() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /* ---------- 文章状态与发布记录保持一致 ----------
     有任意一条「已发布」记录 → 已发布；否则回到草稿。
     发布、重试、删除记录后都会调用，避免文章库长期显示旧状态。 */
  function syncArticleStatus(articleId) {
    if (!articleId) return;
    const a = state.articles.find(x => x.id === articleId);
    if (!a) return;
    const published = state.history.some(h => h.articleId === articleId && h.status === '已发布');
    const next = published ? '已发布' : '草稿';
    if (a.status !== next) {
      a.status = next;
      save(LS.articles, state.articles);
      try { window.dispatchEvent(new Event('cp:articles-updated')); } catch (_) { /* ignore */ }
    }
  }

  /* ---------- 数据操作 ---------- */
  const actions = {
    getPortrait: () => state.portrait,
    setPortrait(p) {
      state.portrait = p;
      save(LS.portrait, p);
    },
    getArticles: () => state.articles,
    getArticle: (id) => state.articles.find(a => a.id === id),
    addArticle(a) {
      a.id = 'a' + Date.now();
      state.articles.unshift(a);
      const ok = save(LS.articles, state.articles);
      if (!ok) {
        // 配额不足：回滚内存，避免出现"看起来存了其实没存"
        state.articles = state.articles.filter(x => x !== a);
        return { ok: false, article: null };
      }
      return { ok: true, article: a };
    },
    updateArticle(id, patch) {
      const a = state.articles.find(x => x.id === id);
      if (!a) return false;
      const prev = { ...a };
      Object.assign(a, patch);
      if (patch.title || patch.body) delete a.demo; // 用户已编辑，不再是演示数据
      const ok = save(LS.articles, state.articles);
      if (!ok) Object.assign(a, prev);
      return ok;
    },
    /* 删除文章：改写稿、草稿、该文章的待发布任务一并清理；发布记录保留并显示「已删除」 */
    deleteArticle(id) {
      const before = state.articles.length;
      state.articles = state.articles.filter(a => a.id !== id);
      if (state.articles.length === before) return false;
      save(LS.articles, state.articles);

      if (state.rewrites && state.rewrites[id]) {
        delete state.rewrites[id];
        save(LS.rewrites, state.rewrites);
      }
      if (state.drafts && state.drafts[id]) {
        delete state.drafts[id];
        save(LS.drafts, state.drafts);
      }
      const sched = state.scheduledPublishes.filter(t => t.articleId === id);
      if (sched.length) {
        state.scheduledPublishes = state.scheduledPublishes.filter(t => t.articleId !== id);
        save(LS.scheduled, state.scheduledPublishes);
      }
      if (state.ui.activeArticleId === id) {
        state.ui.activeArticleId = null;
        state.ui.rewriteResults = {};
      }
      return true;
    },
    deleteHistory(id) {
      const rec = state.history.find(x => x.id === id);
      state.history = state.history.filter(x => x.id !== id);
      save(LS.history, state.history);
      if (rec) syncArticleStatus(rec.articleId);
      return !!rec;
    },
    syncArticleStatus,
    /* 按给定顺序重排文章库（拖拽排序用，未提及的文章保持相对顺序在后） */
    reorderArticles(orderedIds) {
      const map = {};
      state.articles.forEach(a => { map[a.id] = a; });
      const head = orderedIds.map(id => map[id]).filter(Boolean);
      const rest = state.articles.filter(a => !orderedIds.includes(a.id));
      state.articles = [...head, ...rest];
      save(LS.articles, state.articles);
    },
    getHistory: () => state.history,
    addHistory(rec) {
      state.history.unshift(rec);
      save(LS.history, state.history);
      syncArticleStatus(rec.articleId);
    },
    updateHistory(id, patch) {
      const h = state.history.find(x => x.id === id);
      if (h) Object.assign(h, patch);
      save(LS.history, state.history);
      if (h) syncArticleStatus(h.articleId);
    },
    getSettings: () => state.settings,
    saveSettings(s) {
      state.settings = s;
      save(LS.settings, s);
    },
    /* ---------- AI 润色每日额度（本机账号，20 次/天） ---------- */
    aiPolishUsage() {
      const today = todayKey();
      if (!state.aiUsage || state.aiUsage.date !== today) {
        state.aiUsage = { date: today, polish: 0 };
        save(LS.aiUsage, state.aiUsage);
      }
      const used = Math.max(0, Number(state.aiUsage.polish) || 0);
      return {
        date: today,
        used,
        limit: AI_POLISH_LIMIT,
        remaining: Math.max(0, AI_POLISH_LIMIT - used),
        allowed: used < AI_POLISH_LIMIT
      };
    },
    consumeAiPolish() {
      const u = actions.aiPolishUsage();
      if (!u.allowed) return u;
      state.aiUsage.polish = u.used + 1;
      save(LS.aiUsage, state.aiUsage);
      const used = state.aiUsage.polish;
      return {
        date: u.date,
        used,
        limit: AI_POLISH_LIMIT,
        remaining: Math.max(0, AI_POLISH_LIMIT - used),
        allowed: used < AI_POLISH_LIMIT
      };
    },
    /* ---- 定时发布队列 ---- */
    getScheduled: () => state.scheduledPublishes,
    addScheduled(task) {
      task.id = 'sp' + Date.now() + Math.floor(Math.random() * 100);
      task.status = 'pending';
      task.createdAt = new Date().toLocaleString('zh-CN', { hour12: false });
      state.scheduledPublishes.unshift(task);
      save(LS.scheduled, state.scheduledPublishes);
      return task;
    },
    updateScheduled(id, patch) {
      const t = state.scheduledPublishes.find(x => x.id === id);
      if (t) Object.assign(t, patch);
      save(LS.scheduled, state.scheduledPublishes);
    },
    removeScheduled(id) {
      state.scheduledPublishes = state.scheduledPublishes.filter(x => x.id !== id);
      save(LS.scheduled, state.scheduledPublishes);
    },
    markSniffDone() {
      state.sniffDone = true;
      save(LS.sniffDone, true);
    },
    /* ---- 分发工作台 ---- */
    setActiveArticle(id) {
      state.ui.activeArticleId = id;
    },
    togglePlatform(id) {
      const i = state.ui.selectedPlatforms.indexOf(id);
      if (i >= 0) state.ui.selectedPlatforms.splice(i, 1);
      else state.ui.selectedPlatforms.push(id);
    },
    setRewriteResult(pid, result) {
      state.ui.rewriteResults[pid] = result;
      const aid = state.ui.activeArticleId;
      if (!aid) return;
      state.rewrites[aid] = state.rewrites[aid] || {};
      state.rewrites[aid][pid] = result;
      save(LS.rewrites, state.rewrites);
    },
    clearRewrite() {
      state.ui.rewriteResults = {};
      const aid = state.ui.activeArticleId;
      if (aid && state.rewrites[aid]) {
        delete state.rewrites[aid];
        save(LS.rewrites, state.rewrites);
      }
    },
    /* 切换文章时载入该文章已保存的改写稿 */
    openRewriteFor(articleId) {
      state.ui.rewriteResults = { ...((state.rewrites[articleId]) || {}) };
      return state.ui.rewriteResults;
    },
    /* ---------- 编辑器草稿 ---------- */
    getDraft(key) {
      return (state.drafts && state.drafts[key]) || null;
    },
    saveDraft(key, draft) {
      if (!state.drafts) state.drafts = {};
      const prev = state.drafts[key];
      state.drafts[key] = draft;
      const ok = save(LS.drafts, state.drafts);
      if (!ok) {
        // 配额不足：回滚内存，避免出现"看起来存了其实没存"
        if (prev) state.drafts[key] = prev;
        else delete state.drafts[key];
      }
      return ok;
    },
    removeDraft(key) {
      if (state.drafts && state.drafts[key]) {
        delete state.drafts[key];
        save(LS.drafts, state.drafts);
      }
    },
    clearAllDrafts() {
      state.drafts = {};
      save(LS.drafts, state.drafts);
    },
    /* ---------- 演示数据 ---------- */
    hasDemoData() {
      return state.articles.some(a => a.demo) || state.history.some(h => h.demo);
    },
    clearDemoData() {
      const removed = new Set(state.articles.filter(a => a.demo).map(a => a.id));
      state.articles = state.articles.filter(a => !a.demo);
      state.history = state.history.filter(h => !h.demo);
      save(LS.articles, state.articles);
      save(LS.history, state.history);

      // 演示文章的改写稿、草稿与待发布任务一并清理，避免留下无主数据
      let rewritesChanged = false;
      removed.forEach(id => {
        if (state.rewrites && state.rewrites[id]) { delete state.rewrites[id]; rewritesChanged = true; }
        if (state.drafts && state.drafts[id]) { delete state.drafts[id]; save(LS.drafts, state.drafts); }
      });
      if (rewritesChanged) save(LS.rewrites, state.rewrites);
      const schedBefore = state.scheduledPublishes.length;
      state.scheduledPublishes = state.scheduledPublishes.filter(t => !removed.has(t.articleId));
      if (state.scheduledPublishes.length !== schedBefore) save(LS.scheduled, state.scheduledPublishes);

      state.ui.rewriteResults = {};
      state.ui.activeArticleId = null;
    },
    /* ---------- 全量备份 / 恢复（不含 AI Key 与平台凭据） ---------- */
    exportAll() {
      const s = state.settings || {};
      return JSON.stringify({
        app: 'OmniDraft',
        format: 1,
        exportedAt: new Date().toISOString(),
        note: '备份不包含 AI API Key 与平台凭据，恢复后需重新填写',
        data: {
          portrait: state.portrait,
          articles: state.articles,
          history: state.history,
          scheduledPublishes: state.scheduledPublishes,
          rewrites: state.rewrites,
          sniffDone: state.sniffDone,
          settings: {
            ai: { baseUrl: (s.ai && s.ai.baseUrl) || '', model: (s.ai && s.ai.model) || '', apiKey: '' },
            autoPull: s.autoPull || { enabled: true, interval: 30 },
            accounts: Object.fromEntries(Object.entries(s.accounts || {}).map(([pid, acc]) => [
              pid,
              { linked: !!acc.linked, nickname: acc.nickname || '', method: acc.method || '', updatedAt: acc.updatedAt || '', credOk: false }
            ]))
          }
        }
      }, null, 2);
    },
    importAll(json) {
      let obj;
      try { obj = typeof json === 'string' ? JSON.parse(json) : json; } catch (e) { throw new Error('备份文件不是合法 JSON'); }
      if (!obj || (obj.app !== 'OmniDraft' && obj.app !== 'ContentPort') || !obj.data) {
        throw new Error('不是 OmniDraft 的备份文件');
      }
      const d = obj.data;
      if (!Array.isArray(d.articles) || !Array.isArray(d.history)) throw new Error('备份缺少文章或发布记录');
      state.portrait = d.portrait || null;
      state.articles = d.articles;
      state.history = d.history;
      state.scheduledPublishes = Array.isArray(d.scheduledPublishes) ? d.scheduledPublishes : [];
      state.rewrites = d.rewrites && typeof d.rewrites === 'object' ? d.rewrites : {};
      state.sniffDone = !!d.sniffDone;
      const incoming = d.settings || {};
      state.settings = {
        ai: {
          baseUrl: (incoming.ai && incoming.ai.baseUrl) || '',
          apiKey: (state.settings.ai && state.settings.ai.apiKey) || '',
          model: (incoming.ai && incoming.ai.model) || ''
        },
        autoPull: incoming.autoPull || { enabled: true, interval: 30 },
        accounts: incoming.accounts || {}
      };
      // 备份可能来自旧版本：AI 配置缺省时回落到 DeepSeek
      if (!state.settings.ai.baseUrl) state.settings.ai.baseUrl = 'https://api.deepseek.com';
      if (!state.settings.ai.model) state.settings.ai.model = 'deepseek-chat';
      save(LS.portrait, state.portrait);
      save(LS.articles, state.articles);
      save(LS.history, state.history);
      save(LS.scheduled, state.scheduledPublishes);
      save(LS.rewrites, state.rewrites);
      save(LS.sniffDone, state.sniffDone);
      save(LS.settings, state.settings);
      // 备份可能来自旧版本，用发布记录重新校准文章状态
      state.articles.forEach(a => syncArticleStatus(a.id));
      state.ui.rewriteResults = {};
      state.ui.activeArticleId = null;
      return {
        articles: state.articles.length,
        history: state.history.length,
        rewrites: Object.keys(state.rewrites).length
      };
    }
  };

  CP.state = state;
  CP.actions = actions;
  CP.AI_POLISH_LIMIT = AI_POLISH_LIMIT;
})();
