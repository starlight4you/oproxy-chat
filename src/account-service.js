import { BrowserWindow } from 'electron';
import fs from 'node:fs';

const PURCHASE_UI_SCRIPT = fs.readFileSync(new URL('./purchase-ui.js', import.meta.url), 'utf8');

export const ACCOUNT_URLS = Object.freeze({
  login: 'https://oproxy.world/dashboard',
  purchase: 'https://oproxy.world/purchase',
});

// Runs only on the Oproxy origin, keeping website credentials out of chat IPC.
export const READ_ACCOUNT_SCRIPT = `(${async function () {
  const getToken = () => localStorage.getItem('auth_token');
  const request = async path => fetch('/api/v1' + path, {
    cache: 'no-store', credentials: 'include', signal: AbortSignal.timeout(12000),
    headers: { Accept: 'application/json', ...(getToken() ? { Authorization: 'Bearer ' + getToken() } : {}) },
  });
  let response = await request('/auth/me');
  if (response.status === 401 && localStorage.getItem('refresh_token')) {
    const refreshed = await fetch('/api/v1/auth/refresh', {
      method: 'POST', credentials: 'include', signal: AbortSignal.timeout(12000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: localStorage.getItem('refresh_token') }),
    });
    const body = await refreshed.json();
    if (refreshed.ok && body.code === 0 && body.data?.access_token) {
      localStorage.setItem('auth_token', body.data.access_token);
      if (body.data.refresh_token) localStorage.setItem('refresh_token', body.data.refresh_token);
      if (body.data.expires_in) localStorage.setItem('token_expires_at', String(Date.now() + body.data.expires_in * 1000));
      response = await request('/auth/me');
    }
  }
  if (response.status === 401) return { ok: false, code: 'login_required', error: '登录 Oproxy 后查看余额与额度' };
  if (!response.ok) throw new Error('余额暂时无法读取');
  const body = await response.json();
  if (body.code !== 0 || !body.data || !Number.isFinite(Number(body.data.balance)) || body.data.balance == null) throw new Error('余额数据暂不可用');
  const user = body.data;
  let subscriptions = null;
  try {
    const res = await request('/subscriptions');
    const data = await res.json();
    if (res.ok && data.code === 0 && Array.isArray(data.data)) subscriptions = data.data;
  } catch {}
  return { ok: true, email: user.email, balance: Number(user.balance), subscriptions, updatedAt: Date.now() };
}.toString()})()`;

export function createAccountService() {
  let reader, ready, pending;
  const pages = new Set();
  async function read(expectedEmail) {
    if (!expectedEmail || typeof expectedEmail !== 'string') return { ok: false, error: '无法确认当前聊天账号' };
    if (!reader || reader.isDestroyed()) {
      reader = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
      reader.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      ready = reader.loadURL('https://oproxy.world/');
    }
    try {
      await ready;
      if (new URL(reader.webContents.getURL()).origin !== 'https://oproxy.world') throw new Error('账号服务页面不可用');
      pending ||= reader.webContents.executeJavaScript(READ_ACCOUNT_SCRIPT).finally(() => { pending = null; });
      const result = await pending;
      if (result.ok && result.email?.toLowerCase() !== expectedEmail.trim().toLowerCase()) {
        return { ok: false, code: 'account_mismatch', error: '请在 Oproxy 网站登录与聊天相同的账号' };
      }
      // Never send identity or credentials back to the remote chat renderer.
      const subscriptions = result.subscriptions?.map(sub => Object.fromEntries([
        ...['status', 'starts_at', 'expires_at', 'credit_limit_usd', 'credit_used_usd',
          ...['daily', 'weekly', 'monthly'].flatMap(period => [period + '_credit_limit_usd', period + '_usage_usd'])]
          .map(key => [key, sub[key]]),
        ['group', Object.fromEntries(['name', 'daily_limit_usd', 'weekly_limit_usd', 'monthly_limit_usd'].map(key => [key, sub.group?.[key]]))],
      ])) ?? null;
      return result.ok ? { ok: true, balance: result.balance, subscriptions, updatedAt: result.updatedAt } : result;
    } catch {
      if (reader && !reader.isDestroyed()) reader.destroy();
      reader = null;
      return { ok: false, error: '读取失败，请稍后刷新' };
    }
  }
  async function open(destination) {
    const url = ACCOUNT_URLS[destination];
    if (!url) return { ok: false };
    const win = new BrowserWindow({ title: 'Oproxy · 账户', width: 1080, height: 820, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    pages.add(win);
    win.once('closed', () => pages.delete(win));
    if (destination === 'purchase') {
      const update = () => win.webContents.executeJavaScript(PURCHASE_UI_SCRIPT).catch(() => {});
      win.webContents.on('dom-ready', update);
      win.webContents.on('did-navigate-in-page', update);
    }
    await win.loadURL(url);
    return { ok: true };
  }
  return { read, open };
}
