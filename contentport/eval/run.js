/* =========================================================
   ContentPort · 评测 CLI（eval/run.js）
   零依赖：node eval/run.js [--engine=old|new|both] [--platforms=...]
                           [--ai] [--json] [--fail-under=85]
                           [--save-baseline]
   指标：质检总分 / 七维 / 字数 / 覆盖 / 原创 / 合规 / 问题数
   基线：eval/baseline.json（npm run eval:baseline 生成）
   ========================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

global.window = global;

const ROOT = path.join(__dirname, '..');
require(path.join(ROOT, 'js', 'mock.js'));
require(path.join(ROOT, 'js', 'rewrite.js'));

const A = require(path.join(ROOT, 'js', 'engine', 'analysis.js'));
const S = require(path.join(ROOT, 'js', 'engine', 'strategies.js'));
const PR = require(path.join(ROOT, 'js', 'engine', 'planner.js'));
const Q = require(path.join(ROOT, 'js', 'engine', 'quality.js'));
const PIPE = require(path.join(ROOT, 'js', 'engine', 'pipeline.js'));

const args = process.argv.slice(2);
function arg(name, fallback) {
  const hit = args.find(a => a === '--' + name || a.startsWith('--' + name + '='));
  if (!hit) return fallback;
  const eq = hit.indexOf('=');
  return eq >= 0 ? hit.slice(eq + 1) : true;
}
const ENGINE = String(arg('engine', 'both'));
const PLATFORMS = String(arg('platforms', 'csdn,wechat,xhs,zhihu')).split(',').map(s => s.trim()).filter(Boolean);
const USE_AI = !!arg('ai', false);
const AS_JSON = !!arg('json', false);
const FAIL_UNDER = Number(arg('fail-under', 85));
const SAVE_BASELINE = !!arg('save-baseline', false);
const BASELINE_FILE = path.join(__dirname, 'baseline.json');
const CASES_DIR = path.join(__dirname, 'cases');

function readCases() {
  const files = fs.readdirSync(CASES_DIR).filter(f => f.endsWith('.json')).sort();
  return files.map(f => JSON.parse(fs.readFileSync(path.join(CASES_DIR, f), 'utf8')));
}

function aiChat() {
  const key = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error('未配置 AI_API_KEY / OPENAI_API_KEY，无法使用 --ai');
  const base = (process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  const model = process.env.AI_MODEL || process.env.OPENAI_MODEL || 'deepseek-chat';
  return async (messages, opts) => {
    const o = opts || {};
    const resp = await fetch(base + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({
        model,
        messages,
        temperature: o.temperature == null ? 0.7 : o.temperature,
        max_tokens: o.maxTokens || 4000,
        stream: false,
        ...(o.json ? { response_format: { type: 'json_object' } } : {})
      })
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error('AI ' + resp.status + ' ' + text.slice(0, 160));
    }
    const data = await resp.json();
    return data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : '';
  };
}

function avg(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function pct(n) {
  return Math.round(n * 1000) / 10 + '%';
}

async function evaluate() {
  const cases = readCases();
  const chat = USE_AI ? aiChat() : null;
  const rows = [];
  for (const article of cases) {
    const analysis = A.analyze(article);
    for (const pid of PLATFORMS) {
      const platform = S.getPlatform(pid);
      const plan = PR.buildPlan(analysis, pid, {});
      const row = { id: article.id, label: article.label || article.id, pid, platform: platform.name };

      if (ENGINE !== 'new') {
        const old = CP.genRewrite(article, pid);
        const q = Q.check({ title: old.title, body: old.body }, analysis, plan, platform);
        row.old = { total: q.total, dims: q.dims, metrics: q.metrics };
      }
      if (ENGINE !== 'old') {
        const out = await PIPE.run(article, pid, { analysis, aiChat: chat });
        row.new = { total: out.score, dims: out.quality.dims, metrics: out.quality.metrics, engine: out.engine, aiCalls: out.algorithm.aiCalls, issues: out.quality.issues.length };
      }
      rows.push(row);
    }
  }
  return rows;
}

function summarize(rows) {
  const out = {};
  PLATFORMS.forEach(pid => {
    const rs = rows.filter(r => r.pid === pid);
    const olds = rs.filter(r => r.old).map(r => r.old.total);
    const news = rs.filter(r => r.new).map(r => r.new.total);
    const dims = {};
    ['C', 'S', 'L', 'T', 'O', 'R', 'M'].forEach(k => {
      dims[k] = Math.round(avg(rs.filter(r => r.new).map(r => r.new.dims[k])) * 10) / 10;
    });
    out[pid] = {
      n: rs.length,
      oldAvg: Math.round(avg(olds) * 10) / 10,
      newAvg: Math.round(avg(news) * 10) / 10,
      gain: olds.length && news.length ? Math.round((avg(news) - avg(olds)) * 10) / 10 : null,
      dims,
      p0Count: rs.filter(r => r.new && r.new.metrics.p0).length,
      lengthOk: rs.filter(r => r.new && r.new.dims.L >= 80).length,
      aiCalls: rs.reduce((n, r) => n + (r.new ? r.new.aiCalls || 0 : 0), 0)
    };
  });
  return out;
}

function check(summary, rows) {
  const failures = [];
  const hasNew = rows.some(r => r.new);
  if (!hasNew) return { overallAvg: '-', failures };
  let overall = 0;
  let count = 0;
  Object.keys(summary).forEach(pid => {
    const s = summary[pid];
    overall += s.newAvg * s.n;
    count += s.n;
    if (s.newAvg < FAIL_UNDER) failures.push(`${pid} 均值 ${s.newAvg} < ${FAIL_UNDER}`);
    if (s.gain != null && s.gain < 10) failures.push(`${pid} 相对旧引擎增益 ${s.gain} < 10`);
    if (s.dims.M < 95) failures.push(`${pid} 合规均值 ${s.dims.M} < 95`);
    if (s.dims.C < 80) failures.push(`${pid} 信息覆盖均值 ${s.dims.C} < 80`);
    if (s.p0Count > 0) failures.push(`${pid} 存在 ${s.p0Count} 条 P0 违规`);
    if (s.lengthOk < s.n) failures.push(`${pid} 长度合规 ${s.lengthOk}/${s.n}，未达 100%`);
  });
  const overallAvg = count ? Math.round(overall / count * 10) / 10 : 0;
  if (count && overallAvg < FAIL_UNDER) failures.push(`整体均值 ${overallAvg} < ${FAIL_UNDER}`);
  return { overallAvg, failures };
}

function checkBaseline(summary) {
  if (!fs.existsSync(BASELINE_FILE)) return [];
  const base = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
  const failures = [];
  Object.keys(summary).forEach(pid => {
    const b = base.platformAvg && base.platformAvg[pid];
    const prev = b && (b.newAvg != null ? b.newAvg : b.oldAvg);
    if (prev != null && summary[pid].newAvg < prev - 2) {
      failures.push(`${pid} 较基线下降超过 2 分（${prev} → ${summary[pid].newAvg}）`);
    }
  });
  return failures;
}

function printTable(rows) {
  const pad = (s, n) => {
    const w = Array.from(String(s)).length;
    return String(s) + ' '.repeat(Math.max(0, n - w));
  };
  console.log('\n' + pad('用例', 22) + pad('平台', 8) + pad('旧分', 7) + pad('新分', 7) + pad('增益', 7) + pad('字数', 7) + pad('覆盖', 7) + pad('原创', 7) + pad('合规', 7) + '问题');
  console.log('-'.repeat(96));
  rows.forEach(r => {
    const issueCount = r.new ? r.new.issues : '-';
    console.log(
      pad(r.id, 22) + pad(r.pid, 8) +
      pad(r.old ? r.old.total : '-', 7) + pad(r.new ? r.new.total : '-', 7) +
      pad(r.old && r.new ? (r.new.total - r.old.total) : '-', 7) +
      pad(r.new ? r.new.metrics.charCount : '-', 7) +
      pad(r.new ? r.new.dims.C : '-', 7) +
      pad(r.new ? r.new.dims.O : '-', 7) +
      pad(r.new ? r.new.dims.M : '-', 7) +
      issueCount
    );
  });
}

function printSummary(summary, result) {
  console.log('\n平台汇总');
  console.log('-'.repeat(96));
  Object.keys(summary).forEach(pid => {
    const s = summary[pid];
    console.log(
      pid.padEnd(8) + `旧 ${s.oldAvg}`.padEnd(10) + `新 ${s.newAvg}`.padEnd(10) +
      `增益 ${s.gain == null ? '-' : s.gain}`.padEnd(10) +
      `C/S/L/T/O/R/M ${s.dims.C}/${s.dims.S}/${s.dims.L}/${s.dims.T}/${s.dims.O}/${s.dims.R}/${s.dims.M}`.padEnd(34) +
      `长度合规 ${s.lengthOk}/${s.n}` + (s.aiCalls ? ` · AI ${s.aiCalls} 次` : '')
    );
  });
  console.log(`\n整体均值：${result.overallAvg}`);
  if (result.failures.length) {
    console.log('\n未通过项：');
    result.failures.forEach(f => console.log('  ✗ ' + f));
  } else {
    console.log('\n✓ 全部阈值通过');
  }
}

(async () => {
  const rows = await evaluate();
  const summary = summarize(rows);
  const result = check(summary, rows);
  const baselineFailures = ENGINE !== 'old' ? checkBaseline(summary) : [];
  const allFailures = result.failures.concat(baselineFailures);

  if (AS_JSON) {
    console.log(JSON.stringify({ rows, summary, overallAvg: result.overallAvg, failures: allFailures }, null, 2));
  } else {
    printTable(rows);
    printSummary(summary, { overallAvg: result.overallAvg, failures: allFailures });
  }

  if (SAVE_BASELINE) {
    fs.writeFileSync(BASELINE_FILE, JSON.stringify({
      generatedAt: new Date().toISOString(),
      engine: ENGINE,
      platformAvg: summary,
      cases: rows
    }, null, 2) + '\n');
    console.log('\n已写入基线：' + path.relative(ROOT, BASELINE_FILE));
  }

  if (allFailures.length) process.exitCode = 1;
})().catch(e => {
  console.error(e);
  process.exitCode = 2;
});
