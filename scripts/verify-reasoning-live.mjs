// One explicit 6.1 Sol probe verifies native reasoning_effort reaches the
// authenticated chat request. Only routing identifiers/effort are retained.
import fs from 'node:fs/promises';
import {requestModelEvidence} from './acceptance-model.mjs';
const targets=await fetch('http://127.0.0.1:9224/json/list').then(r=>r.json());
const target=targets.find(t=>t.type==='page'&&t.url.startsWith('https://chat.oproxy.world'));
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
let seq=0;const pending=new Map(),evidence=[];
ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Network.requestWillBeSent'){const r=m.params.request;if(r.method==='POST'&&/\/api\/(agents\/chat|ask)/.test(r.url)&&r.postData){try{const p=JSON.parse(r.postData),ids=requestModelEvidence(p);const efforts=[];function visit(x,d=0){if(!x||typeof x!=='object'||d>5)return;for(const [k,v]of Object.entries(x)){if(k==='reasoning_effort')efforts.push(v);else if(['endpointOption','conversation','ephemeralAgent','modelOptions','options','model_parameters'].includes(k))visit(v,d+1)}}visit(p);evidence.push({...ids,efforts})}catch{}}}const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result)}});
const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>reject(Error(method+' timeout')),15000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}))});
const run=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value};
const wait=ms=>new Promise(r=>setTimeout(r,ms));const until=async fn=>{for(let i=0;i<100;i++){if(await fn())return;await wait(150)}throw Error('UI timeout')};
try{
 if(await run(`!!document.querySelector('#prompt-textarea')?.value.trim()||!!window.__oproxyAutoRunTimer||!!document.querySelector('[data-testid=stop-generation-button]')`))throw Error('User draft or active generation');
 await run(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));document.querySelector('[data-testid=model-selector-button]').click()`);
 await until(()=>run(`[...document.querySelectorAll('[role=option]')].some(e=>e.innerText.startsWith('Oproxy OpenAI'))`));
 await run(`[...document.querySelectorAll('[role=option]')].find(e=>e.innerText.startsWith('Oproxy OpenAI')).click()`);
 await until(()=>run(`[...document.querySelectorAll('[role=option]')].some(e=>e.innerText.split('\\n')[0]==='gpt-6.1-sol')`));
 await run(`[...document.querySelectorAll('[role=option]')].find(e=>e.innerText.split('\\n')[0]==='gpt-6.1-sol').click()`);
 await until(()=>run(`document.querySelector('[data-testid=model-selector-button]')?.textContent.trim()==='gpt-6.1-sol'`));
 const applied=await run(`window.__oproxyReasoningUI.apply('xhigh')`);if(!applied)throw Error('Actual setting failed');
 await call('Network.enable');
 await run(`window.__oproxyWorkflowModesState.save([]);const t=document.querySelector('#prompt-textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'界面参数验收：请只回复“已收到”，不搜索、不调用工具、不生成文件。');t.dispatchEvent(new Event('input',{bubbles:true}));void 0;`);
 await until(()=>run(`!!document.querySelector('[data-testid=send-button]')&&!document.querySelector('[data-testid=send-button]').disabled`));
 await run(`(()=>{if(document.querySelector('[data-testid=model-selector-button]').textContent.trim()!=='gpt-6.1-sol')throw Error('Wrong model');document.querySelector('[data-testid=send-button]').click();return true})()`);
 await until(()=>evidence.length>0);
 if(!evidence.every(e=>e.models.length===1&&e.models[0]==='gpt-6.1-sol'&&e.endpoints.includes('Oproxy OpenAI')&&e.efforts.length>0&&e.efforts.every(v=>v==='xhigh')))throw Error('Request did not carry required effort: '+JSON.stringify(evidence));
 for(let i=0;i<90;i++){if(await run(`!document.querySelector('[data-testid=stop-generation-button]')&&!![...document.querySelectorAll('.message-render')].at(-1)?.querySelector('[data-testid=copy-response-button], [role=alert]')`))break;await wait(1000)}
 const result=await run(`({path:location.pathname,state:window.__oproxyReasoningUI.state(),reply:[...document.querySelectorAll('.message-render')].at(-1)?.innerText,streaming:!!document.querySelector('[data-testid=stop-generation-button]')})`);
 await fs.writeFile('docs/validation/0.8.11/reasoning-live-request.json',JSON.stringify({evidence,...result},null,2));console.log(JSON.stringify({evidence,...result},null,2));
}finally{for(const p of pending.values())clearTimeout(p.timer);ws.close()}
