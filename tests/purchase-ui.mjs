import { app, BrowserWindow, session } from 'electron';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

app.whenReady().then(async () => {
  let win;
  try {
    const source = await fs.readFile(new URL('../src/purchase-ui.js', import.meta.url), 'utf8');
    const reference = (await fs.readFile(new URL('../purchase-page/oproxy-purchase-original.html', import.meta.url), 'utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    await session.defaultSession.protocol.handle('https', () => new Response(reference, { headers: { 'content-type': 'text/html;charset=utf-8' } }));
    win = new BrowserWindow({ show: false, width: 1080, height: 820, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    await win.loadURL('https://oproxy.world/purchase');
    const run = expression => win.webContents.executeJavaScript(expression);
    await run(source);
    for (const width of [1080, 600]) {
      win.setSize(width, 820);
      const state = await run(`({rails:[...document.querySelectorAll('.app-shell > aside')].map(e=>getComputedStyle(e).display),bodyMargin:getComputedStyle(document.querySelector('.app-shell__body')).marginLeft,header:getComputedStyle(document.querySelector('.app-header')).display,main:document.querySelector('main').getBoundingClientRect().width,viewport:innerWidth,content:document.querySelector('main').textContent.includes('立即开通')})`);
      assert.ok(state.rails.length >= 2); assert.ok(state.rails.every(value => value === 'none'));
      assert.equal(state.bodyMargin, '0px'); assert.notEqual(state.header, 'none');
      assert.ok(state.main >= state.viewport - 2); assert.ok(state.content);
    }
    win.setSize(1080, 820);
    if (process.env.OPROXY_PURCHASE_SCREENSHOT) await fs.writeFile(process.env.OPROXY_PURCHASE_SCREENSHOT, (await win.webContents.capturePage()).toPNG());
    await run(`const dialog=document.createElement('div');dialog.setAttribute('role','dialog');dialog.textContent='确认支付';document.body.append(dialog);history.pushState({},'', '/payment/result');`);
    await run(source);
    assert.equal(await run(`getComputedStyle(document.querySelector('[role="dialog"]')).display`), 'block');
    assert.equal(await run(`document.documentElement.hasAttribute('data-oproxy-purchase-window')`), true);
    await run(`history.pushState({},'', '/login')`); await run(source);
    assert.equal(await run(`document.documentElement.hasAttribute('data-oproxy-purchase-window')`), false);
    console.log('PASS: purchase rails hidden, full-width content and header retained at desktop/mobile sizes; payment dialog preserved and login layout restored');
    win.destroy(); app.exit(0);
  } catch (error) { console.error(error); win?.destroy(); app.exit(1); }
});
