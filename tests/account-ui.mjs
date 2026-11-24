import { app, BrowserWindow, session } from 'electron';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { READ_ACCOUNT_SCRIPT, createAccountService } from '../src/account-service.js';

app.whenReady().then(async () => {
  let win;
  try {
    win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<button data-testid="nav-user" aria-expanded="true" aria-controls="account">头像</button><div id="account" role="menu"><div role="note">test@example.com</div><button id="settings">设置</button></div>`));
    const run = expression => win.webContents.executeJavaScript(expression);
    const source = await fs.readFile(new URL('../src/account-ui.js', import.meta.url), 'utf8');
    await run(`window.calls=[];window.links=[];window.nextResult={ok:true,balance:12.34,updatedAt:Date.now(),subscriptions:[
      {status:'active',credit_limit_usd:100,credit_used_usd:35,monthly_usage_usd:35,group:{name:'Coding <Pro>',monthly_limit_usd:100}},
      {status:'active',daily_usage_usd:5,weekly_usage_usd:20,monthly_usage_usd:40,group:{name:'Weekly',daily_limit_usd:10,weekly_limit_usd:50,monthly_limit_usd:100}},
      {status:'expired',group:{name:'Expired'}},
      {status:'active',expires_at:'2020-01-01',group:{name:'Old'}},
      {status:'active',starts_at:'2099-01-01',group:{name:'Future'}}
    ]};window.oproxyDesktop={getAccountSummary:async email=>{calls.push(email);return nextResult},openAccountPage:async value=>{links.push(value);return {ok:true}}};${source}`);
    await new Promise(resolve => setTimeout(resolve, 80));
    let text = await run(`document.querySelector('[data-oproxy-account-panel]').textContent`);
    for (const value of ['¥12.34', '¥65.00', '¥5.00', '¥30.00', '¥60.00', 'Coding <Pro>']) assert.ok(text.includes(value), value + ': ' + text);
    for (const value of ['Expired', 'Old', 'Future']) assert.ok(!text.includes(value));
    assert.equal(await run(`document.querySelectorAll('[data-oproxy-account-link]').length`), 1);
    if (process.env.OPROXY_ACCOUNT_SCREENSHOT) {
      await run(`document.documentElement.className='dark';document.body.style.cssText='margin:32px;background:#212121;color:#ececec;font:14px -apple-system,sans-serif';document.querySelector('[role="menu"]').style.cssText='width:285px;background:#292929;border:1px solid #444;border-radius:14px;padding:8px';document.querySelectorAll('button,a').forEach(e=>e.style.cssText='display:block;background:transparent;border:0;color:inherit;padding:8px;cursor:pointer')`);
      await fs.writeFile(process.env.OPROXY_ACCOUNT_SCREENSHOT, (await win.webContents.capturePage()).toPNG());
    }
    await run(`document.querySelector('[data-oproxy-account-link="purchase"]').click()`);
    assert.deepEqual(await run('links'), ['purchase']);
    await run(`nextResult={ok:true,balance:0,subscriptions:[],updatedAt:Date.now()};window.__oproxyAccountUI.refresh()`);
    text = await run(`document.querySelector('[data-oproxy-account-panel]').textContent`);
    assert.ok(text.includes('¥0.00')); assert.ok(text.includes('暂无生效')); assert.ok(!text.includes('¥12.34'));
    await run(`nextResult={ok:false,code:'login_required',error:'请登录'};window.__oproxyAccountUI.refresh()`);
    text = await run(`document.querySelector('[data-oproxy-account-panel]').textContent`);
    assert.ok(text.includes('请登录')); assert.ok(!text.includes('¥0.00'));
    await run(`document.querySelector('[data-testid="nav-user"]').setAttribute('aria-expanded','false')`);
    assert.equal(await run(`!!document.querySelector('.oproxy-account-summary')`), false);
    await run(`document.querySelector('[role="note"]').textContent='other@example.com';document.querySelector('[data-testid="nav-user"]').setAttribute('aria-expanded','true')`);
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal((await run('calls')).at(-1), 'other@example.com');

    // Exercise the actual website request script without using account secrets.
    await run(`window.fakeStore=new Map([['auth_token','expired'],['refresh_token','refresh']]);window.network=[];
      Object.defineProperty(window,'localStorage',{value:{getItem:key=>fakeStore.get(key),setItem:(key,value)=>fakeStore.set(key,value)}});
      window.fetch=async (url,options)=>{network.push({url,auth:options.headers.Authorization});
        if(url.endsWith('/auth/refresh'))return {ok:true,json:async()=>({code:0,data:{access_token:'fresh',refresh_token:'next'}})};
        if(url.endsWith('/auth/me')&&options.headers.Authorization==='Bearer expired')return {ok:false,status:401};
        return {ok:true,status:200,json:async()=>({code:0,data:url.endsWith('/auth/me')?{email:'test@example.com',balance:0}:[]})};
      };void 0;`);
    const account = await run(READ_ACCOUNT_SCRIPT);
    assert.equal(account.ok, true); assert.equal(account.balance, 0); assert.deepEqual(account.subscriptions, []);
    assert.deepEqual((await run('network')).map(item => item.url), ['/api/v1/auth/me', '/api/v1/auth/refresh', '/api/v1/auth/me', '/api/v1/subscriptions']);
    await run(`fakeStore.delete('refresh_token');window.fetch=async()=>({ok:false,status:401});void 0;`);
    assert.equal((await run(READ_ACCOUNT_SCRIPT)).code, 'login_required');
    // Verify the main-process identity boundary with a real isolated window.
    await session.defaultSession.protocol.handle('https', () => new Response(`<script>
      window.fetch=async url=>({ok:true,status:200,json:async()=>({code:0,data:url.endsWith('/auth/me')?{email:'test@example.com',balance:17,access_token:'must-not-leak'}:[{status:'active',secret:'must-not-leak',credit_limit_usd:100,credit_used_usd:20,group:{name:'Pro'}}]})});
    </script>`, { headers: { 'content-type': 'text/html' } }));
    const service = createAccountService();
    const summary = await service.read('test@example.com');
    assert.equal(summary.ok, true); assert.equal(summary.balance, 17);
    assert.ok(!JSON.stringify(summary).includes('must-not-leak')); assert.ok(!('email' in summary));
    assert.equal((await service.read('different@example.com')).code, 'account_mismatch');
    assert.equal((await service.read('')).ok, false);
    assert.equal((await service.open('https://example.com')).ok, false);
    await session.defaultSession.protocol.unhandle('https');
    console.log('PASS: account menu amounts, zero balance, subscription limits, expired/future plans, refresh, login errors, account switching, links and token renewal');
    win.destroy(); app.exit(0);
  } catch (error) { console.error(error); win?.destroy(); app.exit(1); }
});
