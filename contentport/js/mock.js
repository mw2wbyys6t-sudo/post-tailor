/* =========================================================
   OmniDraft · 一稿千面 —— 数据层（mock.js）
   单一样板数据源：平台画像 / 文章 / 用户画像模板 / 发布记录
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
      audience: {
        age: '20-35 岁',
        gender: '男性 78% / 女性 22%',
        role: '开发者、工程师、技术管理者',
        edu: '本科及以上 85%',
        habits: ['速览式阅读', '搜索解决方案', '收藏代码片段', '关注实战案例'],
        tone: '专业务实，直给结论',
        likes: ['步骤拆解', '代码示例', '性能对比', '踩坑经验'],
        wordPref: '1200-3000 字',
        titleLen: '≤30 字，技术关键词前置'
      },
      trending: ['AI 大模型', '微服务架构', '云原生', '数据库优化', '前端框架', '低代码'],
      styleRules: [
        '开头先给结论，再展开论证',
        '核心知识点用代码块 + 注释呈现',
        '每节配一个「实战要点」清单',
        '少用比喻，多用数据与对比'
      ],
      radar: { info: 92, depth: 85, tone: 60, visual: 55, interaction: 70 }
    },
    {
      id: 'wechat',
      name: '微信公众号',
      tagline: '深度阅读',
      color: '#07C160',
      emoji: '§',
      audience: {
        age: '25-40 岁',
        gender: '男女均衡 52% / 48%',
        role: '职场白领、中高层、内容从业者',
        edu: '本科及以上 78%',
        habits: ['睡前/通勤阅读', '关注深度分析', '收藏转发金句', '偏好故事化表达'],
        tone: '专业但亲切，有温度',
        likes: ['故事开头', '结构化深度', '金句提炼', '配图排版'],
        wordPref: '2000-4000 字',
        titleLen: '16-25 字，情绪 + 价值感'
      },
      trending: ['职场成长', '行业洞察', '效率工具', '认知升级', '个人IP'],
      styleRules: [
        '用场景故事开场，3 秒抓住读者',
        '分段小标题 + 加粗金句引导阅读',
        '结尾给「行动清单」提升收藏率',
        '适度使用引号、短句制造节奏'
      ],
      radar: { info: 78, depth: 88, tone: 82, visual: 70, interaction: 55 }
    },
    {
      id: 'xhs',
      name: '小红书',
      tagline: '种草笔记',
      color: '#FF2442',
      emoji: '✦',
      audience: {
        age: '18-30 岁',
        gender: '女性 72% / 男性 28%',
        role: '学生、年轻职场人、生活方式爱好者',
        edu: '本科及以上 65%',
        habits: ['碎片化刷屏', '封面党', '清单式阅读', '收藏即学会'],
        tone: '口语化、亲切、有画面感',
        likes: ['emoji 点缀', '清单体', '真实感', '高颜值排版'],
        wordPref: '600-1200 字',
        titleLen: '≤20 字 + emoji，痛点/好奇前置'
      },
      trending: ['干货清单', '学习方法', '好物分享', '自律打卡', '职场避坑', '效率神器'],
      styleRules: [
        '标题必须带 emoji 与数字钩子',
        '正文短句分段，每条独立成行',
        '大量使用「清单体」与口语词',
        '结尾引导互动：评论区聊聊'
      ],
      radar: { info: 70, depth: 55, tone: 88, visual: 95, interaction: 85 }
    },
    {
      id: 'zhihu',
      name: '知乎',
      tagline: '理性问答',
      color: '#0066FF',
      emoji: '¶',
      audience: {
        age: '22-35 岁',
        gender: '男性 64% / 女性 36%',
        role: '高学历白领、研究生、行业从业者',
        edu: '硕士及以上 45%',
        habits: ['搜索问题', '深度长文', '看重论证', '收藏研究资料'],
        tone: '严谨理性，观点鲜明',
        likes: ['结论先行', '数据支撑', '逻辑严密', '引用来源'],
        wordPref: '3000-8000 字',
        titleLen: '问题式/观点式，引发思考'
      },
      trending: ['认知方法论', '职业发展', '技术深潜', '社会议题', '读书思考'],
      styleRules: [
        '开头直接抛出观点（先说结论）',
        '论证分点，配数据/案例/引用',
        '主动标注资料来源，增加可信度',
        '避免营销腔，保持客观中立'
      ],
      radar: { info: 88, depth: 95, tone: 75, visual: 50, interaction: 72 }
    }
  ];

  /* ---------- 用户画像问答模板 ---------- */
  const PORTRAIT_QUESTIONS = [
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

  /* ---------- 嗅探中间数据 ---------- */
  const SNIFF_STEPS = [
    '建立目标平台索引',
    '抓取热门话题与内容标签',
    '分析读者画像与互动行为',
    '统计标题结构与情绪词分布',
    '生成受众适配报告'
  ];

  window.CP.mock = { PLATFORMS, PORTRAIT_QUESTIONS, SNIFF_STEPS };
})();
