// Hot reload only our presentation script; never replaces draft or submits chat.
import fs from 'node:fs/promises';
const source=await fs.readFile('src/reasoning-ui.js','utf8');
const target=(await fetch('http://127.0.0.1:9224/json/list').then(r=>r.json())).find(t=>t.type==='page'&&t.url.startsWith('https://chat.oproxy.world'));
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
const expression=`window.__oproxyReasoningUI?.dispose?.();document.querySelectorAll('[data-oproxy-reasoning-control]').forEach(e=>e.remove());delete window.__oproxyReasoningUI;`+source+`;void 0;`;
const result=await new Promise(r=>{ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id===1)r(m.result)});ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression,returnByValue:true}}))});
ws.close();console.log(JSON.stringify({injected:!result.exceptionDetails,error:result.exceptionDetails?.exception?.description}));
