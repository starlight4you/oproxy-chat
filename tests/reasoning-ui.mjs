// Electron fixture exercises the actual UI script against a typed parameter
// binding. The enum's visible input intentionally has a no-op onChange.
import {app,BrowserWindow} from 'electron';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import path from 'node:path';
import os from 'node:os';
app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{
const directory=await fs.mkdtemp(path.join(os.tmpdir(),'oproxy-reasoning-'));
let window,server;
try{
 window=new BrowserWindow({show:false,width:960,height:720,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
 server=createServer((_req,res)=>res.end('<!doctype html><meta charset="utf-8"><body style="font:14px system-ui"><button data-testid="model-selector-button">gpt-6.1-sol</button><button data-testid="nav-panel-conversations" aria-pressed="true">Chats</button><button data-testid="nav-panel-parameters" aria-pressed="false">Parameters</button><form style="position:fixed;bottom:12px;right:12px;left:12px;display:flex;justify-content:flex-end"><textarea id="prompt-textarea"></textarea><div><button data-testid="send-button" type="button">Send</button></div></form>'));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 await window.loadURL(`http://127.0.0.1:${server.address().port}/c/test`);
 const run=async code=>window.webContents.executeJavaScript(code),wait=ms=>new Promise(r=>setTimeout(r,ms));
 await run(`(()=>{window.submissions=[];window.settingUpdates=[];window.conversation={model:'gpt-6.1-sol'};window.mountSetting=()=>{let input=document.querySelector('#reasoning_effort-dynamic-setting-input');if(!input){input=document.createElement('input');input.id='reasoning_effort-dynamic-setting-input';input.value='自动';document.body.append(input);}window.parameter={settingKey:'reasoning_effort',options:['none','minimal','low','medium','high','xhigh','max'],conversation, setOption:key=>value=>{settingUpdates.push({key,value});conversation[key]=value;input.value=value;document.body.append(document.createElement('i'));}};input.__reactFiber$test={memoizedProps:{value:input.value,onChange:()=>{}},return:{memoizedProps:parameter}};};document.querySelector('[data-testid=nav-panel-parameters]').onclick=()=>{document.querySelector('[data-testid=nav-panel-conversations]').setAttribute('aria-pressed','false');document.querySelector('[data-testid=nav-panel-parameters]').setAttribute('aria-pressed','true');mountSetting();};document.querySelector('[data-testid=nav-panel-conversations]').onclick=()=>{document.querySelector('[data-testid=nav-panel-parameters]').setAttribute('aria-pressed','false');document.querySelector('[data-testid=nav-panel-conversations]').setAttribute('aria-pressed','true');document.querySelector('#reasoning_effort-dynamic-setting-input')?.remove();};document.querySelector('[data-testid=send-button]').onclick=()=>submissions.push({text:document.querySelector('textarea').value,effort:conversation.reasoning_effort});return true})()`);
 const source=await fs.readFile(new URL('../src/reasoning-ui.js',import.meta.url),'utf8');
 await run(source);await wait(400);
 assert.equal(await run('window.__oproxyReasoningUI.read()'),'xhigh');
 assert.equal(await run('conversation.reasoning_effort'),'xhigh','Default updates real setting despite no-op input');
 assert.equal(await run('document.querySelector("[data-testid=nav-panel-conversations]").getAttribute("aria-pressed")'),'true','Preserve the original sidebar panel');
 assert.equal(await run('document.querySelectorAll("[data-oproxy-reasoning-control]").length'),1);
 assert.equal(await run('!!document.querySelector("[data-oproxy-reasoning-control] select")'),false,'No native select');
 await run('document.querySelector(".oproxy-reasoning-trigger").click()');await wait(100);
 assert.equal(await run('document.querySelector(".oproxy-reasoning-title").textContent'),'极高');
 assert.equal(await run('document.querySelector(".oproxy-reasoning-range").value'),'3');
 await run(`(()=>{const r=document.querySelector('.oproxy-reasoning-range');r.value='1';r.dispatchEvent(new Event('input',{bubbles:true}));r.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);await wait(250);
 assert.equal(await run('conversation.reasoning_effort'),'medium');
 assert.equal(await run('localStorage.getItem("oproxy-reasoning-effort-v1")'),'medium');
 await run('document.querySelector(".oproxy-reasoning-reset").click()');await wait(250);
 assert.equal(await run('conversation.reasoning_effort'),'xhigh');
 // Claude-style bindings use the shorter `effort` setting key.
 await run(`(()=>{window.conversation={model:'claude-opus-5-5'};document.querySelector('[data-testid=model-selector-button]').textContent='claude-opus-5-5';document.querySelector('#reasoning_effort-dynamic-setting-input')?.remove();const input=document.createElement('input');input.id='effort-dynamic-setting-input';document.body.append(input);window.parameter={settingKey:'effort',options:['low','medium','high','xhigh','max'],conversation, setOption:key=>value=>{conversation[key]=value;input.value=value;document.body.append(document.createElement('i'));}};input.__reactFiber$claude={memoizedProps:{},return:{memoizedProps:parameter}};history.pushState({},'','/c/claude');return true})()`);await wait(300);
 assert.equal(await run('conversation.effort'),'xhigh','Claude effort binding receives the shared default');
 await run(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
 assert.equal(await run('document.querySelector(".oproxy-reasoning-popover").hidden'),true);
 // Native focus ownership in a hidden BrowserWindow is platform-dependent.
 assert.equal(await run('document.querySelector(".oproxy-reasoning-trigger").getAttribute("aria-expanded")'),'false');
 await window.setContentSize(360,640);
 await run('document.querySelector(".oproxy-reasoning-trigger").click()');await wait(100);
 assert.equal(await run(`(()=>{const b=document.querySelector('.oproxy-reasoning-popover').getBoundingClientRect();return b.left>=0&&b.right<=innerWidth&&b.top>=0&&b.bottom<=innerHeight})()`),true,'Panel fits narrow windows');
 await run('document.documentElement.classList.add("dark")');
 assert.equal(await run('getComputedStyle(document.querySelector(".oproxy-reasoning-popover")).backgroundColor'),'rgb(41, 41, 41)');
 await run('document.querySelector("textarea").click()');
 assert.equal(await run('document.querySelector(".oproxy-reasoning-popover").hidden'),true);
 // New chat with same model must reapply the choice. A draft edited while the
 // lazy settings panel opens is preserved and never automatically submitted.
 await run(`(()=>{history.pushState({},'','/c/another');window.conversation={model:'gpt-6.1-sol'};document.querySelector('[data-testid=model-selector-button]').textContent='gpt-6.1-sol';document.querySelector('#effort-dynamic-setting-input')?.remove();document.querySelector('textarea').value='original';document.querySelector('[data-testid=send-button]').click();document.querySelector('textarea').value='changed';return true})()`);await wait(300);
 assert.equal(await run('submissions.length'),0);
 assert.equal(await run('document.querySelector("textarea").value'),'changed');
 assert.equal(await run('conversation.reasoning_effort'),'xhigh');
 await run(`document.querySelector('[data-testid=send-button]').click()`);
 assert.deepEqual(await run('submissions'),[{text:'changed',effort:'xhigh'}]);
 await run('window.__oproxyReasoningUI.dispose();void 0');
 await run(source);await wait(200);
 assert.equal(await run('window.__oproxyReasoningUI.read()'),'xhigh');
 console.log(JSON.stringify({ok:true,checks:['reference slider UI','real parameter binding','default xhigh','persistent selection','reset','keyboard and outside close','dark and narrow layouts','sidebar restoration','draft protection','same-model conversation change']}));
}catch(error){console.error(error);process.exitCode=1}
finally{window?.destroy();server?.close();await fs.rm(directory,{recursive:true,force:true});app.exit(process.exitCode||0)}

});
