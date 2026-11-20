/* =========================================================
   OmniDraft · 一稿千面 —— 平台写作规则与问卷配置
   这里只保存产品规则（结构、语气、长度、禁忌）与问答模板，
   不包含任何平台统计数据、受众画像或演示内容。
   ========================================================= */
window.CP = window.CP || {};

(function () {
  const PLATFORMS = [
    {
      id: 'csdn',
      name: 'CSDN',
      tagline: '技术社区',
      color: '#FC5531',
      emoji: '⌘',
      tone: '专业务实，直给结论',
      titleRule: '≤30 字，技术关键词前置',
      lengthRule: '1200-3000 字',
      styleRules: [
        '开头先给结论，再展开论证',
        '核心知识点用代码块 + 注释呈现',
        '每节配一个「实战要点」清单',
        '少用比喻，多用数据与对比'
      ]
    },
    {
      id: 'wechat',
      name: '微信公众号',
      tagline: '深度阅读',
      color: '#07C160',
      emoji: '§',
      tone: '专业但亲切，有温度',
      titleRule: '16-25 字，情绪 + 价值感',
      lengthRule: '2000-4000 字',
      styleRules: [
        '用场景故事开场，让读者迅速代入',
        '分段小标题 + 加粗金句引导阅读',
        '结尾给「行动清单」，方便读者收藏',
        '适度使用引号、短句制造节奏'
      ]
    },
    {
      id: 'xhs',
      name: '小红书',
      tagline: '种草笔记',
      color: '#FF2442',
      emoji: '✦',
      tone: '口语化、亲切、有画面感',
      titleRule: '≤20 字 + emoji，痛点/好奇前置',
      lengthRule: '600-1200 字',
      styleRules: [
        '标题必须带 emoji 与数字钩子',
        '正文短句分段，每条独立成行',
        '大量使用「清单体」与口语词',
        '结尾引导互动：评论区聊聊'
      ]
    },
    {
      id: 'zhihu',
      name: '知乎',
      tagline: '理性问答',
      color: '#0066FF',
      emoji: '¶',
      tone: '严谨理性，观点鲜明',
      titleRule: '问题式/观点式，引发思考',
      lengthRule: '3000-8000 字',
      styleRules: [
        '开头直接抛出观点（先说结论）',
        '论证分点，配数据/案例/引用',
        '主动标注资料来源，增加可信度',
        '避免营销腔，保持客观中立'
      ]
    }
  ];

  /* ---------- 用户画像问答模板 ----------
     只问能真正改变改写结果的关键问题；答案全部保存在本机。
     每组选项 value 同时是引擎读取的字段值，label 仅用于展示。 */
  const PORTRAIT_QUESTIONS = [
    {
      key: 'name',
      title: '怎么称呼你？',
      desc: '用于工作台问候，可跳过（默认为「创作者」）',
      type: 'text',
      placeholder: '例如：小林 / 阿哲'
    },
    {
      key: 'identity',
      title: '你是谁？',
      desc: '选择你最主要的内容创作身份',
      type: 'single',
      options: [
        { value: 'tech', label: '技术人', desc: '开发者 / 工程师 / 架构师' },
        { value: 'worker', label: '职场人', desc: '产品 / 运营 / 管理 / 白领' },
        { value: 'student', label: '学生', desc: '在校学生 / 研究生' },
        { value: 'creator', label: '内容创作者', desc: '自媒体 / 写作者 / 博主' }
      ]
    },
    {
      key: 'domain',
      title: '你主要写什么？',
      desc: '你的内容属于哪些领域（可多选）',
      type: 'multi',
      options: [
        { value: 'tech', label: '技术编程' },
        { value: 'career', label: '职场成长' },
        { value: 'life', label: '生活方式' },
        { value: 'study', label: '学习方法' },
        { value: 'product', label: '产品设计' },
        { value: 'business', label: '商业财经' }
      ]
    },
    {
      key: 'expertise',
      title: '你在这个领域的专业程度？',
      desc: '决定改写时保留多少术语与推导',
      type: 'single',
      options: [
        { value: 'entry', label: '入门探索', desc: '正在学习，边学边分享' },
        { value: 'mid', label: '有一定经验', desc: '做过一些项目，能讲清方法' },
        { value: 'expert', label: '资深从业者', desc: '有体系化经验与判断' }
      ]
    },
    {
      key: 'goals',
      title: '你的核心目标？',
      desc: '你希望通过分发内容得到什么（可多选）',
      type: 'multi',
      options: [
        { value: 'fans', label: '涨粉涨关注' },
        { value: 'income', label: '变现收入' },
        { value: 'influence', label: '建立个人品牌' },
        { value: 'record', label: '记录与复盘' },
        { value: 'job', label: '求职背书' }
      ]
    },
    {
      key: 'readers',
      title: '你希望吸引哪类读者？',
      desc: '目标读者最符合哪些特征（可多选）',
      type: 'multi',
      options: [
        { value: 'beginner', label: '入门新手' },
        { value: 'mid', label: '有经验者' },
        { value: 'expert', label: '资深同行' },
        { value: 'broad', label: '泛大众' },
        { value: 'decision', label: '决策者/管理者' }
      ]
    },
    {
      key: 'voice',
      title: '你偏好的表达风格？',
      desc: '改写时会优先保持这种语气（平台底线仍会保留）',
      type: 'single',
      options: [
        { value: 'rigorous', label: '专业严谨', desc: '术语准确，论证充分' },
        { value: 'warm', label: '亲和口语', desc: '像朋友聊天，易读易懂' },
        { value: 'sharp', label: '犀利直接', desc: '观点鲜明，少铺垫' },
        { value: 'story', label: '故事叙事', desc: '用经历和场景带出结论' }
      ]
    },
    {
      key: 'avoid',
      title: '你不想出现的表达？',
      desc: '改写与质检会主动规避（可多选）',
      type: 'multi',
      options: [
        { value: 'clickbait', label: '夸张标题党' },
        { value: 'slang', label: '网络热词' },
        { value: 'jargon', label: '大量术语' },
        { value: 'emoji', label: '表情符号' },
        { value: 'marketing', label: '强营销话术' }
      ]
    },
    {
      key: 'frequency',
      title: '你的发文节奏？',
      desc: '你计划多久发布一次内容',
      type: 'single',
      options: [
        { value: 'daily', label: '几乎每天' },
        { value: 'weekly', label: '每周 1-3 篇' },
        { value: 'biweekly', label: '两周一篇' },
        { value: 'monthly', label: '每月几篇' }
      ]
    }
  ];

  window.CP.mock = { PLATFORMS, PORTRAIT_QUESTIONS };
})();
