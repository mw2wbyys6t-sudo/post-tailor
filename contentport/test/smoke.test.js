/* =========================================================
   OmniDraft · 冒烟测试（node --test）
   覆盖：改写流水线、Markdown 转义、首次启动/升级数据清理
   ========================================================= */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const caseRag = require(path.join(ROOT, 'eval/cases/01-rag.json'));

test('pipeline: 四平台均生成完整改写稿并通过基础质检', async () => {
  const pipeline = require(path.join(ROOT, 'js/engine/pipeline.js'));
  const article = {
    id: caseRag.id,
    title: caseRag.title,
    body: caseRag.body,
    category: caseRag.category
  };
  for (const pid of ['csdn', 'wechat', 'xhs', 'zhihu']) {
    const r = await pipeline.run(article, pid, { aiChat: null, portrait: {} });
    assert.ok(r && r.title && r.body, `${pid} 缺少标题或正文`);
    assert.ok(r.quality && Number.isFinite(r.quality.total), `${pid} 缺少质检结果`);
    assert.ok(r.quality.total >= 80, `${pid} 质检分偏低：${r.quality.total}`);
  }
});

test('planner: 用户画像被转换成可执行的写作约束', () => {
  const analysis = require(path.join(ROOT, 'js/engine/analysis.js'));
  const planner = require(path.join(ROOT, 'js/engine/planner.js'));
  const a = analysis.analyze({
    id: caseRag.id, title: caseRag.title, body: caseRag.body, category: caseRag.category
  });
  const portrait = {
    identityLabel: '技术人',
    expertise: 'expert',
    expertiseLabel: '资深从业者',
    voice: 'sharp',
    voiceLabel: '犀利直接',
    readers: ['expert'],
    readerLabels: ['资深同行'],
    avoid: ['emoji', 'slang'],
    avoidLabels: ['表情符号', '网络热词']
  };
  const plan = planner.buildPlan(a, 'xhs', portrait);
  assert.ok(plan.brief.includes('【创作者偏好】'), '缺少创作者偏好');
  assert.ok(plan.brief.includes('【写作约束】'), '缺少写作约束');
  assert.ok(plan.brief.includes('不使用网络热词'), '未应用“避免网络热词”');
  assert.ok(plan.brief.includes('观点前置'), '未应用“犀利直接”风格');
  assert.strictEqual(plan.hookId, 'conclusion', '犀利风格未让开头结论前置');
  assert.ok(plan.risks.some(r => r.includes('表情符号')), '未提示 emoji 与小红书规则的冲突');
});

test('markdown: 用户内容中的 HTML 被转义', () => {
  global.window = global;
  global.CP = global.CP || {};
  const uiPath = require.resolve(path.join(ROOT, 'js/ui.js'));
  delete require.cache[uiPath];
  require(uiPath);

  const html = global.CP.ui.renderMd('<script>alert(1)</script>\n\n**重点**');
  assert.ok(!html.includes('<script>'), '脚本标签未被转义');
  assert.ok(html.includes('&lt;script&gt;'), '缺少转义后的脚本文本');
  assert.ok(html.includes('<strong>重点</strong>'), '加粗渲染丢失');
});

test('state: 升级时清空演示数据且保留用户内容', () => {
  global.window = global;
  global.CP = global.CP || {};

  const store = new Map();
  global.localStorage = {
    get length() { return store.size; },
    key: (i) => Array.from(store.keys())[i] ?? null,
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  };
  store.set('cp.articles.v1', JSON.stringify([
    { id: 'demo-1', title: '演示文章', demo: true },
    { id: 'user-1', title: '我的文章' }
  ]));
  store.set('cp.history.v1', JSON.stringify([{ id: 'h1', articleId: 'demo-1', demo: true }]));
  store.set('cp.rewrites.v1', JSON.stringify({ 'demo-1': { csdn: {} }, 'user-1': { csdn: {} } }));
  store.set('cp.drafts.v1', JSON.stringify({ 'demo-1': {}, 'user-1': {} }));

  const statePath = require.resolve(path.join(ROOT, 'js/state.js'));
  delete require.cache[statePath];
  require(statePath);

  assert.deepStrictEqual(global.CP.state.articles.map(a => a.id), ['user-1']);
  assert.deepStrictEqual(global.CP.state.history, []);
  assert.deepStrictEqual(Object.keys(global.CP.state.rewrites), ['user-1']);
  assert.deepStrictEqual(Object.keys(global.CP.state.drafts), ['user-1']);
});
