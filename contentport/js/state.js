/* =========================================================
   ContentPort · 状态层（state.js）
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
    sniffDone: 'cp.sniffDone.v1'
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
    } catch (e) { /* ignore quota */ }
  }

  const state = {
    portrait: load(LS.portrait, null),            // 用户画像（问答结果）
    articles: load(LS.articles, null),            // 文章库（含用户新增）
    history: load(LS.history, null),              // 发布记录
    settings: load(LS.settings, {
      ai: { baseUrl: '', apiKey: '', model: '' },
      autoPull: { enabled: true, interval: 30 }
    }),
    sniffDone: load(LS.sniffDone, false),         // 是否完成过嗅探
    /* ---- 会话内 UI 状态 ---- */
    ui: {
      activeArticleId: null,                       // 分发工作台选中的文章
      selectedPlatforms: ['csdn', 'wechat', 'xhs', 'zhihu'], // 分发目标
      rewriteResults: {},                          // { platformId: rewrite }
      editingArticleId: null,                      // 文章详情抽屉
      toasts: []
    },
    LS
  };

  /* ---------- 惰性初始化：文章库 / 发布记录默认取 mock ---------- */
  state.articles = state.articles || CP.mock.ARTICLES.map(a => ({ ...a }));
  state.history = state.history || CP.mock.HISTORY.map(h => ({ ...h }));

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
      save(LS.articles, state.articles);
      return a;
    },
    updateArticle(id, patch) {
      const a = state.articles.find(x => x.id === id);
      if (a) Object.assign(a, patch);
      save(LS.articles, state.articles);
    },
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
    },
    updateHistory(id, patch) {
      const h = state.history.find(x => x.id === id);
      if (h) Object.assign(h, patch);
      save(LS.history, state.history);
    },
    getSettings: () => state.settings,
    saveSettings(s) {
      state.settings = s;
      save(LS.settings, s);
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
    },
    clearRewrite() {
      state.ui.rewriteResults = {};
    }
  };

  CP.state = state;
  CP.actions = actions;
})();
