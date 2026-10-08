/* =========================================================
   ContentPort · 自适应改写引擎（rewrite.js）
   输入：文章 + 目标平台 → 输出：平台原生改写稿
   逻辑：根据平台受众画像（mock 数据）重写标题/开头/结构/语气
   接入真实 AI 后，此函数由 API 层的大模型调用替代
   ========================================================= */
window.CP = window.CP || {};

(function () {
  const M = () => CP.mock;

  /* 从 markdown 提取纯文本（去掉 ##、>、-、| 等） */
  function plain(md) {
    return String(md)
      .replace(/```[\s\S]*?```/g, '')
      .split('\n')
      .map(l => l.replace(/^#{1,4}\s/, '').replace(/^>\s?/, '').replace(/^\d+\.\s/, '').replace(/^[-*]\s/, '').replace(/\|/g, ' ').trim())
      .filter(Boolean)
      .join('\n');
  }

  function firstSentence(md) {
    const p = plain(md).split('\n').map(s => s.trim()).filter(Boolean)[0] || '';
    return p.slice(0, 46) + (p.length > 46 ? '…' : '');
  }

  /* 标题改写：每个平台一套策略 */
  function genTitle(article, pid) {
    const t = article.title;
    switch (pid) {
      case 'csdn': {
        // 技术关键词前置 + 数字/结论
        const base = t.replace(/：.*$/, '');
        const short = base.slice(0, 26);
        return short + '：从选型到落地的完整实践';
      }
      case 'wechat': {
        // 情绪 + 价值感 + 数字
        if (t.length > 22) {
          const cut = t.slice(0, 18).replace(/：/g, '，');
          return `${cut}…（附完整复盘）`;
        }
        return `${t}｜我的真实经历分享`;
      }
      case 'xhs': {
        // emoji + 痛点/好奇 + 数字
        const kw = article.keyword || article.category;
        return `🔥${t.slice(0, 14).replace(/：/g, '｜')}｜亲测有效`;
      }
      case 'zhihu': {
        // 观点/问题式
        return `${t}：真的可行吗？一篇讲透`;
      }
      default:
        return t;
    }
  }

  /* 开头改写：每个平台一套钩子 */
  function genOpening(article, pid) {
    const s = firstSentence(article.body);
    switch (pid) {
      case 'csdn':
        return `**结论先行**：${s}。本文从选型、架构到踩坑完整复盘，文末附效果数据。`;
      case 'wechat':
        return `我们团队曾经被一个很实际的问题困扰：${s}。今天想把这个过程完整地讲给你听。`;
      case 'xhs':
        return `家人们，这个真的值得分享！${s} 话不多说，直接上干货👇`;
      case 'zhihu':
        return `先说结论：这件事值得做，但有几个坑必须先知道。本文基于团队真实落地经验，逐层拆解。`;
      default:
        return s;
    }
  }

  /* 结尾改写 */
  function genClosing(article, pid) {
    switch (pid) {
      case 'csdn':
        return `以上是本次完整复盘，如果对你有帮助，欢迎收藏。后续会更新部署细节与性能调优。`;
      case 'wechat':
        return `如果这篇文章对你有启发，点个「在看」或转发给需要的朋友。你的支持，是我持续输出的动力。`;
      case 'xhs':
        return `整理不易，有用的话记得 👍 收藏 ⭐ 转发给需要的姐妹～ 有问题的评论区留言，看到都会回！`;
      case 'zhihu':
        return `以上，欢迎在评论区交流你的看法与补充。认同的话点个赞，让更多人看到有价值的讨论。`;
      default:
        return '';
    }
  }

  /* 调整清单：from → to → reason */
  function genChanges(article, pid) {
    const orig = article.title;
    const plat = M().PLATFORMS.find(p => p.id === pid);
    const changes = [
      {
        dim: '标题',
        from: orig,
        to: genTitle(article, pid),
        reason: `${plat.name}受众偏好「${pid === 'xhs' ? '痛点+情绪词，点击率提升约 40%' : pid === 'wechat' ? '价值感+悬念，打开率提升约 35%' : pid === 'zhihu' ? '观点前置引发思考' : '关键词前置便于搜索命中'}」`
      },
      {
        dim: '开头',
        from: firstSentence(article.body).slice(0, 40) + '…',
        to: genOpening(article, pid).slice(0, 60),
        reason: `该平台用户${pid === 'xhs' ? ' 3 秒内决定是否继续阅读' : pid === 'wechat' ? '习惯先看故事再判断价值' : pid === 'zhihu' ? '期待先看到结论而非铺垫' : '习惯先看结论再决定是否深入'}`
      },
      {
        dim: '结构',
        from: '原始章节顺序：背景 → 方案 → 实践',
        to: pid === 'xhs' ? '清单化短句 + 表情符号分段' : pid === 'csdn' ? '结论 → 要点 → 细节 → 数据' : pid === 'wechat' ? '故事 → 干货 → 金句收尾' : '结论 → 论证分点 → 数据引用',
        reason: `匹配 ${plat.name} 的阅读习惯（${plat.audience.habits[0]}）`
      },
      {
        dim: '语气',
        from: '中性叙述',
        to: pid === 'xhs' ? '口语化、亲切、有画面感' : pid === 'wechat' ? '专业且带温度' : pid === 'zhihu' ? '严谨理性、观点鲜明' : '专业务实、直给',
        reason: `${plat.name} 主流受众为「${plat.audience.role}」，偏好「${plat.audience.tone}」`
      },
      {
        dim: '字数',
        from: article.wordCount + ' 字',
        to: pid === 'xhs' ? '压缩至 600-1200 字（约 ' + Math.round(article.wordCount * 0.45) + ' 字）' : pid === 'csdn' ? '保持 1200-3000 字' : pid === 'wechat' ? '扩展至 2000-4000 字' : '扩展至 3000-8000 字',
        reason: `符合 ${plat.name} 的字数偏好（${plat.audience.wordPref}）`
      }
    ];
    return changes;
  }

  /* 正文改写：基于平台策略重组 */
  function genBody(article, pid) {
    const t = genTitle(article, pid);
    const opening = genOpening(article, pid);
    const closing = genClosing(article, pid);
    const summary = article.summary;
    const kw = article.keyword || article.category;

    switch (pid) {
      case 'xhs':
        return `${t}

${opening}

📌 ${article.category} | ${article.wordCount} 字阅读约 ${article.readMin} 分钟

**为什么值得看：**
${summary}

**核心要点速览：**
- ✅ 实践路径清晰，可直接套用
- ✅ 覆盖选型 / 架构 / 踩坑全流程
- ✅ 附真实效果数据

${plain(article.body).split('\n').slice(1, 4).map(s => `▪️ ${s.slice(0, 34)}`).join('\n')}

${closing}

#${kw} #干货分享 #经验总结 #知识库`;
      case 'wechat':
        return `${t}

${opening}

${plain(article.body).split('\n').map(s => s.trim()).filter(Boolean).slice(0, 3).join('\n\n')}

**以下是正文（节选）**

${plain(article.body).split('\n').slice(2, 8).map(s => `- ${s.slice(0, 40)}`).join('\n')}

**写在最后**

${closing}`;
      case 'zhihu':
        return `${t}

${opening}

## 核心观点
${summary}

## 详细展开
${plain(article.body).split('\n').map(s => s.trim()).filter(Boolean).slice(1, 6).map((s, i) => `**${i + 1}. ${s.slice(0, 30)}**`).join('\n')}

## 风险与边界
需要说明的是，本文结论基于团队特定场景，不同团队落地时需结合自身约束调整。建议先小范围验证，再决定是否全量推广。

${closing}`;
      case 'csdn':
      default:
        return `${t}

${opening}

## 正文（按原结构保留，突出代码与要点）

${plain(article.body).split('\n').map(s => s.trim()).filter(Boolean).slice(1, 8).map(s => `- ${s.slice(0, 42)}`).join('\n')}

${closing}`;
    }
  }

  /* 适配度评分：由平台 radar + 文章匹配度合成 */
  function genScore(article, pid) {
    const plat = M().PLATFORMS.find(p => p.id === pid);
    const base = Math.round((plat.radar.info + plat.radar.depth) / 2);
    const bonus = article.status === '已发布' ? 4 : 0;
    return Math.min(97, base - 6 + bonus + Math.round(Math.random() * 6));
  }

  function genRewrite(article, pid) {
    const plat = M().PLATFORMS.find(p => p.id === pid);
    const title = genTitle(article, pid);
    return {
      platformId: pid,
      platformName: plat.name,
      platformColor: plat.color,
      title,
      body: genBody(article, pid),
      changes: genChanges(article, pid),
      score: genScore(article, pid),
      keywords: [article.keyword || article.category, ...plat.trending.slice(0, 2)],
      fitted: plat.audience.habits[0]
    };
  }

  /* 文章关键字（用于小红书标签等）——惰性补充 */
  function ensureKeywords() {
    CP.mock.ARTICLES.forEach(a => {
      if (!a.keyword) {
        const map = {
          'a1': 'RAG知识库', 'a2': '监控体系', 'a3': '前端趋势', 'a4': '知识管理',
          'a5': '职场避坑', 'a6': '学习方法', 'a7': '数据库优化', 'a8': '独立开发',
          'a9': 'AI编程助手', 'a10': 'API科普'
        };
        a.keyword = map[a.id] || a.category;
      }
    });
  }
  ensureKeywords();

  CP.genRewrite = genRewrite;
})();
