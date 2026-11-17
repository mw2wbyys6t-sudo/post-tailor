/* =========================================================
   OmniDraft · 真实数据校准（eval/calibrate.js）
   读取发布记录导出（history JSON），按平台计算：
   质检分 vs log(阅读+1)、点赞率的 Spearman 相关性
   规则：n < 30 不结论；只给建议，不自动改权重
   用法：node eval/calibrate.js [--file=path/to/history.json]
   ========================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
function arg(name, fallback) {
  const hit = args.find(a => a === '--' + name || a.startsWith('--' + name + '='));
  if (!hit) return fallback;
  const eq = hit.indexOf('=');
  return eq >= 0 ? hit.slice(eq + 1) : true;
}

const FILE = String(arg('file', path.join(__dirname, 'history.json')));

function loadRecords() {
  if (!fs.existsSync(FILE)) return null;
  const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const list = Array.isArray(raw) ? raw : (raw.history || raw.records || []);
  return list.map(r => {
    const score = r.score != null ? Number(r.score) : (r.quality && r.quality.total != null ? Number(r.quality.total) : null);
    return {
      platformId: r.platformId,
      score,
      views: Number(r.views) || 0,
      likes: Number(r.likes) || 0
    };
  }).filter(r => r.platformId && r.score != null && r.views >= 0);
}

function ranks(values) {
  const idx = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Array(values.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1].v === idx[i].v) j++;
    const rank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[idx[k].i] = rank;
    i = j + 1;
  }
  return out;
}

/* Pearson on ranks = Spearman（自动处理并列值） */
function spearman(xs, ys) {
  if (xs.length < 3) return null;
  const rx = ranks(xs);
  const ry = ranks(ys);
  const n = xs.length;
  const mx = rx.reduce((a, b) => a + b, 0) / n;
  const my = ry.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += Math.pow(rx[i] - mx, 2);
    dy += Math.pow(ry[i] - my, 2);
  }
  if (!dx || !dy) return 0;
  return num / Math.sqrt(dx * dy);
}

function fmt(n) {
  return n == null ? '-' : (Math.round(n * 1000) / 1000).toFixed(3);
}

const records = loadRecords();
if (!records) {
  console.log('未找到发布记录文件：' + FILE);
  console.log('请从应用「发布记录」导出 JSON（数组，或含 history 字段的对象），然后用 --file 指定路径。');
  console.log('示例：npm run eval:calibrate -- --file=./history.json');
  process.exitCode = 0;
} else {
  const groups = {};
  records.forEach(r => {
    (groups[r.platformId] = groups[r.platformId] || []).push(r);
  });

  console.log('\n平台'.padEnd(10) + '样本'.padEnd(8) + '分-阅读'.padEnd(12) + '分-点赞率'.padEnd(14) + '结论');
  console.log('-'.repeat(78));
  Object.keys(groups).forEach(pid => {
    const rs = groups[pid];
    const n = rs.length;
    if (n < 30) {
      console.log(pid.padEnd(10) + String(n).padEnd(8) + '-'.padEnd(12) + '-'.padEnd(14) + '样本不足（需 ≥30），不下结论');
      return;
    }
    const scores = rs.map(r => r.score);
    const views = rs.map(r => Math.log(1 + r.views));
    const likeRates = rs.map(r => (r.views > 0 ? r.likes / r.views : 0));
    const rhoViews = spearman(scores, views);
    const rhoLike = spearman(scores, likeRates);
    const verdict = rhoViews == null ? '无有效样本'
      : (rhoViews >= 0.3 ? '质检分与阅读正相关，可继续观察'
        : (rhoViews <= -0.1 ? '质检分与阅读负相关，建议人工复盘指标口径'
          : '相关性弱，暂不调整权重'));
    console.log(pid.padEnd(10) + String(n).padEnd(8) + fmt(rhoViews).padEnd(12) + fmt(rhoLike).padEnd(14) + verdict);
  });
  console.log('\n说明：Spearman 仅衡量单调相关，不等于因果；样本 <30 不结论，权重调整幅度建议不超过 ±10%。');
}
