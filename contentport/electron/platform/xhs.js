/* =========================================================
   ContentPort · 小红书发布通道（electron/platform/xhs.js）
   说明：小红书没有对第三方开放的文章发布 API，创作者平台
   内部接口（edith.xiaohongshu.com）需要前端 JS 生成的
   x-s 签名，逆向极易失效。
   因此本通道采用「真实登录 + 浏览器全自动发布」：
   1. 登录：Electron 打开小红书创作者平台，用户扫码登录，
      捕获登录态 Cookie（用于校验账号信息）
   2. 发布：在主进程打开官方发布页（复用登录 session），
      自动填入标题与正文、自动点击发布并轮询结果；
      自动化失败时回退为辅助发布（用户手动确认）
   这是当前最稳定、真实生效的接入方式。
   ========================================================= */
'use strict';

const EDITH = 'https://edith.xiaohongshu.com';

/* ---------- 从 Cookie 串中取值 ---------- */
function cookieValue(cookie, name) {
  const m = String(cookie).match(new RegExp('(?:^|;\\s*)' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : '';
}

/* ---------- 获取用户信息（selfinfo 可能要求签名，失败则降级） ---------- */
async function selfinfo(cookie) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch(
      `${EDITH}/api/sns/web/v1/user/selfinfo?source=creator`,
      {
        headers: { cookie, 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' },
        signal: controller.signal
      }
    );
    const json = await resp.json().catch(() => null);
    if (json && json.data && json.data.userInfo) return json.data.userInfo;
    return null;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- 登录校验 ---------- */
async function verifyLogin(cookie) {
  const u = await selfinfo(cookie);
  const userId = cookieValue(cookie, 'userId') || (u && u.userId) || '';
  if (!u && !userId) {
    throw new Error('小红书登录态无效，请重新登录');
  }
  return {
    nickname: (u && (u.nickname || u.userNickName)) || '小红书用户',
    userId,
    method: 'xhs-cookie'
  };
}

module.exports = { verifyLogin, selfinfo, cookieValue };
