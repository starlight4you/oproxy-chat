// Protocol fixture only: no model or external service. Real-model acceptance
// remains a separate Oproxy gpt-6.1-sol run.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";

const bundle=path.resolve(process.argv[2]||"dist/mac-arm64/Oproxy Chat.app");
const root=await fs.mkdtemp(path.join(os.tmpdir(),"oproxy-clean-package-"));
const downloads=path.join(root,"downloads");
const specs={
  docx:{type:"docx",title:"安装包中文报告",content:"## 检查结果\n**中文粗体：**正确。检查人：________　日期：________\n\n| 项目 | 结果 |\n|---|---|\n| 零依赖 | 通过 |"},
  pdf:{type:"pdf",title:"安装包PDF表单",content:"## 检查表\n月份：____年__月　姓名：________\n\n| 项目 | 签字 |\n|---|---|\n| 确认 | ________ |"},
  xlsx:{type:"xlsx",title:"安装包预算",sheets:[{name:"预算",columns:["项目","金额","含税"],rows:[["示例",100,{formula:"B2*1.06",result:106}]],formats:["@","#,##0.00","#,##0.00"]}]},
  pptx:{type:"pptx",title:"安装包图表",slides:[{title:"示例预算",layout:"chart",chart:{type:"bar",categories:["软件","培训"],series:[{name:"元",values:[6000,2000]}]},notes:"协议测试用示例数据",bullets:["图表补充说明必须保留"]}]},
};
const page=`<!doctype html><html><head><meta charset="utf-8"></head><body><textarea id="prompt-textarea"></textarea><button data-testid="send-button">发送</button><main></main><script>
const specs=${JSON.stringify(specs)};let selected='docx',seq=0,broken=false;window.events=[];
function message(role,language,value){const box=document.createElement('section');box.className='message-render';box.id='fixture-'+(++seq);const heading=document.createElement('h2');heading.textContent=role;box.appendChild(heading);if(language){const pre=document.createElement('pre'),code=document.createElement('code');code.className='language-'+language;code.textContent=JSON.stringify(value);pre.appendChild(code);box.appendChild(pre);const footer=document.createElement('span');footer.innerHTML='<button data-testid="copy-response-button">Copy</button>';box.appendChild(footer);}document.querySelector('main').appendChild(box);}
document.querySelector('[data-testid="send-button"]').onclick=()=>{const textarea=document.querySelector('textarea'),value=textarea.value;textarea.value='';
 if(value.includes('文档尚未生成')&&value.includes('OPROXY_LOCAL_RUNTIME')){events.push('repair:'+selected);message('Prompt');setTimeout(()=>message('Response','oproxy_document',specs[selected]),50);}
 else if(value.includes('已读取')&&value.includes('OPROXY_LOCAL_RUNTIME')){events.push('skill:'+selected);message('Prompt');setTimeout(()=>{const spec=JSON.parse(JSON.stringify(specs[selected]));if(selected==='xlsx'&&!broken){broken=true;spec.sheets[0].rows[0][2].formula='SUMM(B2)';}message('Response','oproxy_document',spec);},50);}
 else{selected=Object.keys(specs).find(type=>value.includes('生成'+type))||(value.includes('再给一个PDF版本')?'pdf':selected);events.push('request:'+selected);message('Prompt');if(location.pathname==='/c/new')history.replaceState({},'','/c/package-fixture');setTimeout(()=>message('Response','oproxy_skill',{type:selected}),50);}
};
</script></body></html>`;
const server=createServer((_req,res)=>{res.setHeader("Content-Type","text/html;charset=utf-8");res.end(page);});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const port=server.address().port;
// Occupy the optional MCP endpoint; document creation must still work.
const blocker=createServer((_req,res)=>res.end("occupied"));
let blockerOwned=false;
await new Promise(resolve=>{blocker.once("error",error=>{if(error.code!=="EADDRINUSE")throw error;resolve();});blocker.listen(3333,"127.0.0.1",()=>{blockerOwned=true;resolve();});});
let child,ws,exitCode;
let log="";
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,timeout=20000){const end=Date.now()+timeout;while(Date.now()<end){const value=await fn();if(value)return value;if(exitCode!==undefined)throw Error(`Package exited ${exitCode}: ${log.slice(-3000)}`);await delay(100);}throw Error(`Timed out: ${log.slice(-3000)}`);}
try{
  child=spawn(path.join(bundle,"Contents/MacOS/Oproxy Chat"),["--remote-debugging-port=0"],{env:{...process.env,PATH:"/usr/bin:/bin",OPROXY_CHAT_URL:`http://127.0.0.1:${port}/c/new`,OPROXY_USER_DATA_DIR:path.join(root,"profile"),OPROXY_DOWNLOADS_DIR:downloads},stdio:["ignore","pipe","pipe"]});
  child.on("exit",code=>exitCode=code);child.stdout.on("data",data=>log+=data);child.stderr.on("data",data=>log+=data);
  const debugPort=await until(async()=>{try{return Number((await fs.readFile(path.join(root,"profile/DevToolsActivePort"),"utf8")).split("\n")[0]);}catch{return null;}});
  const target=await until(async()=>{try{return (await fetch(`http://127.0.0.1:${debugPort}/json/list`).then(r=>r.json())).find(t=>t.type==="page"&&t.url.includes(`127.0.0.1:${port}`));}catch{return null;}});
  ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.addEventListener("open",resolve,{once:true});ws.addEventListener("error",reject,{once:true});});
  let id=0;const pending=new Map();ws.addEventListener("message",event=>{const message=JSON.parse(event.data);if(pending.has(message.id)){const {resolve,reject}=pending.get(message.id);pending.delete(message.id);message.error?reject(Error(JSON.stringify(message.error))):resolve(message.result);}});
  async function evaluate(expression){const result=await new Promise((resolve,reject)=>{const next=++id;pending.set(next,{resolve,reject});ws.send(JSON.stringify({id:next,method:"Runtime.evaluate",params:{expression,returnByValue:true,awaitPromise:true}}));});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result?.value;}
  await until(()=>evaluate("!!window.oproxyDesktop?.readDocumentSkill && !!window.__oproxyDocButtonsInstalled"));
  const results=[];
  for(const type of Object.keys(specs)){
    await evaluate(`(()=>{const t=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'生成${type}文档');t.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-testid="send-button"]').click();return true;})()`);
    const files=await until(async()=>{try{const files=(await fs.readdir(downloads)).filter(f=>f.endsWith('.'+type));return files.length?files:null;}catch{return null;}},40000);
    await until(()=>evaluate("!window.__oproxyAutoRunTimer && localStorage.getItem('oproxy-document-job-v1')===null"));
    const file=path.join(downloads,files[0]),data=await fs.readFile(file);
    assert.ok(data.length>5000);assert.ok(type==="pdf"?data.subarray(0,5).toString()==="%PDF-":data.subarray(0,2).toString()==="PK");
    const restored=await evaluate(`(()=>{const container=[...document.querySelectorAll('.message-render')].at(-1);const spec=JSON.parse(container.querySelector('code').textContent);return window.oproxyDesktop.lookupDocument({spec,requestId:location.pathname+':'+(container.id||'answer')+':'+JSON.stringify(spec)});})()`);
    assert.ok(restored.ok&&restored.document?.documentId);
    assert.equal(restored.document.filename,files[0]);
    assert.ok(restored.document.previewPath,"Each generated format has a bundled preview");
    const icon=await evaluate(`window.oproxyDesktop.getDocumentIcon('${restored.document.documentId}')`);
    assert.ok(icon.ok&&icon.dataUrl.startsWith('data:image/png;base64,'),'Native OS file icon is available for each format');
    await until(()=>evaluate(`!![...document.querySelectorAll('.oproxy-file-icon img')].at(-1)?.complete`));
    const mainAction=await evaluate(`[...document.querySelectorAll('.oproxy-file-actions')].at(-1)?.querySelector('button')?.dataset.oproxyDocumentAction`);
    assert.equal(mainAction,'open','Primary file action uses the default application');
    const previewAction=await evaluate(`window.oproxyDesktop.documentAction({documentId:'${restored.document.documentId}',action:'preview'})`);
    assert.equal(previewAction.ok,true);
    const previews=await until(async()=>{const targets=await fetch(`http://127.0.0.1:${debugPort}/json/list`).then(r=>r.json());return targets.filter(t=>t.type==="page"&&t.url.startsWith("data:text/html")).length>=results.length+1;});
    assert.ok(previews,"In-app preview opens without external software");
    const allTargets=await fetch(`http://127.0.0.1:${debugPort}/json/list`).then(r=>r.json());
    const previewTarget=allTargets.find(t=>t.type==="page"&&t.url.startsWith("data:text/html")&&t.url.includes(encodeURIComponent(specs[type].title)));
    assert.ok(previewTarget,"Preview target has the generated document title");
    const previewSocket=new WebSocket(previewTarget.webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{previewSocket.addEventListener("open",resolve,{once:true});previewSocket.addEventListener("error",reject,{once:true});});
    const rendered=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error("Preview content inspection timeout")),5000);
      previewSocket.addEventListener("message",event=>{const message=JSON.parse(event.data);if(message.id===1){clearTimeout(timer);resolve(message.result?.result?.value);}}, {once:true});
      previewSocket.send(JSON.stringify({id:1,method:"Runtime.evaluate",params:{expression:"({text:document.body.innerText,csp:document.querySelector('meta[http-equiv=\"Content-Security-Policy\"]')?.content,bridge:typeof window.oproxyDesktop})",returnByValue:true}}));
    });
    previewSocket.close();
    assert.ok(rendered.text.includes(specs[type].title));
    assert.ok(rendered.csp.includes("script-src 'none'"));
    assert.equal(rendered.bridge,"undefined","Preview has no privileged chat bridge");
    if(type==="xlsx")assert.ok(rendered.text.includes("106.00"),"Workbook preview displays recalculated value");
    if(type==="pptx")assert.ok(rendered.text.includes("图表补充说明必须保留"),"Presentation preview includes continuation commentary");
    if(type==="pptx")assert.equal(restored.document.presentation?.slides,3,"Cover, chart and visible commentary");
    assert.equal(await evaluate(`document.querySelectorAll('[data-oproxy-document-action]').length`),(results.length+1)*3);
    results.push({type,filename:files[0],bytes:data.length,receiptLookup:true,appPreview:true,formulas:restored.document.calculation?.formulas||0,slides:restored.document.presentation?.slides||0});
  }
  await evaluate(`specs.pptx.filename='修订演示.pptx';document.querySelector('textarea').value='把第二部分再详细一些，保留其他内容';document.querySelector('[data-testid="send-button"]').click();`);
  await until(async()=>{try{return (await fs.readdir(downloads)).includes("修订演示.pptx");}catch{return false;}});
  await until(()=>evaluate("localStorage.getItem('oproxy-document-job-v1')===null"));
  await evaluate(`specs.pdf.filename='转换版本.pdf';document.querySelector('textarea').value='再给一个PDF版本';document.querySelector('[data-testid="send-button"]').click();`);
  await until(async()=>{try{return (await fs.readdir(downloads)).includes("转换版本.pdf");}catch{return false;}});
  await until(()=>evaluate("localStorage.getItem('oproxy-document-job-v1')===null"));
  assert.ok(log.includes("Local MCP server failed") && log.includes("EADDRINUSE"),`Optional MCP failure was exercised: ${log.slice(-3000)}`);
  const events=await evaluate("window.events");for(const type of Object.keys(specs))assert.equal(events.filter(e=>e==='skill:'+type).length,(type==='pptx'||type==='pdf')?2:1);
  assert.equal(events.filter(e=>e==='repair:xlsx').length,1,"One bounded authoring repair was completed by the packaged app");
  const report={ok:true,kind:"protocol fixture, not model evaluation",bundle,profile:"fresh temporary directory",path:"/usr/bin:/bin",mcpPort:"occupied",keywordFreeRevision:true,formatConversion:true,events,results};
  await fs.mkdir("dist",{recursive:true});await fs.writeFile("dist/clean-package-smoke.json",JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify(report,null,2));
}finally{
  ws?.close();if(child&&exitCode===undefined){child.kill("SIGTERM");await Promise.race([new Promise(r=>child.once("exit",r)),delay(3000)]);if(exitCode===undefined)child.kill("SIGKILL");}
  server.close();if(blockerOwned)blocker.close();await fs.rm(root,{recursive:true,force:true});
}
