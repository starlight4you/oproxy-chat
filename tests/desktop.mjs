import { app, BrowserWindow, nativeImage } from "electron";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import assert from "node:assert/strict";
import { createDocumentEngine } from "../src/documents/engine.js";
import { writePdf, renderSvgImage } from "../src/export.js";
import { parseDocumentEnvelope, parseSkillEnvelope } from "../src/documents/protocol.js";
import { classifyDocumentIntent } from "../src/documents/intent.js";
import { documentInstruction, getSkillInstruction } from "../src/documents/skills.js";

app.on("window-all-closed", () => {});
app.whenReady().then(async () => {
const directory = await fs.mkdtemp(path.join(os.tmpdir(), "oproxy-desktop-"));
let win, server;
try {
  const engine = createDocumentEngine({ directory, renderPdf: writePdf, renderSvg: renderSvgImage });
  const {filePath} = await engine.generateDocument({type:"pdf",title:"中文排版验收",content:"## 验收要求\n正文**强调**，支持中文。\n\n|项目|结果|\n|---|---|\n|中文字体|通过|\n\n<script>throw new Error('unexpected execution')</script>"});
  const buffer = await fs.readFile(filePath);
  assert.equal(buffer.subarray(0,5).toString(),"%PDF-"); assert.ok(buffer.length > 8000);
  const {chartSvg}=await import("../src/documents/chart-svg.js");
  const preview=await renderSvgImage(chartSvg({type:"bar",categories:["软件","培训"],series:[{name:"预算",values:[6000,2000]}]}));
  const bitmap=nativeImage.createFromBuffer(preview).toBitmap();
  let teal=0; for(let i=0;i<bitmap.length;i+=4) if(bitmap[i+1]>70&&bitmap[i+1]<160&&bitmap[i+2]<60)teal++;
  assert.ok(teal>10000,"Chart preview contains visible colored bars, not a blank image");
  const {filePath: chartFile} = await engine.generateDocument({type:"pptx",title:"图表兼容验收",slides:[{title:"预算",layout:"chart",chart:{type:"bar",categories:["软件","培训"],series:[{name:"元",values:[6000,2000]}]}}]});
  const {default:JSZip}=await import("jszip");
  const chartZip=await JSZip.loadAsync(await fs.readFile(chartFile));
  assert.ok(Object.keys(chartZip.files).some(name=>/^ppt\/media\/image.*\.png$/.test(name)), "Compatibility preview is bundled");
  assert.ok(chartZip.file("ppt/charts/chart1.xml"), "Editable native chart remains present");
  win = new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  win.webContents.on("console-message", event => console.log("renderer:", event.message));
  const html = "<html><head></head><body><textarea id='prompt-textarea'></textarea><button data-testid='send-button'>Send</button><main></main></body></html>";
  server=createServer((_req,res)=>{res.setHeader("Content-Type","text/html");res.end(html);});
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  await win.loadURL(`http://127.0.0.1:${server.address().port}/c/test`);
  const injectSource=await fs.readFile(new URL("../src/inject.js",import.meta.url),"utf8");
  const reasoningUiSource=await fs.readFile(new URL("../src/reasoning-ui.js",import.meta.url),"utf8");
  const documentUiSource=await fs.readFile(new URL("../src/document-ui.js",import.meta.url),"utf8");
  const workflowSource=await fs.readFile(new URL("../src/document-workflow.js",import.meta.url),"utf8");
  const workflowModesSource=await fs.readFile(new URL("../src/workflow-modes.js",import.meta.url),"utf8");
  const initialize=async(failFirst=true)=>{
    await win.webContents.executeJavaScript(`window.__oproxyParseSkillEnvelope = ${parseSkillEnvelope.toString()};window.__oproxyParseDocumentEnvelope = ${parseDocumentEnvelope.toString()};window.__oproxyDocumentIntent = ${classifyDocumentIntent.toString()};window.__oproxyDocumentInstruction = ${JSON.stringify(documentInstruction)};
      window.calls=[]; window.skillCalls=[]; window.actions=[];window.oproxyDesktop={documentAction:async(payload)=>{actions.push(payload);return {ok:true};},lookupDocument:async()=>({ok:true,document:null}),readDocumentSkill:async(type)=>{skillCalls.push(type);return {ok:true,instruction:"[[OPROXY_LOCAL_RUNTIME]] 已读取技能 [[/OPROXY_LOCAL_RUNTIME]]"};},generateDocument:async(request)=>{calls.push(request);return ${failFirst}&&calls.length===1?{ok:false,error:'temporary failure'}:{ok:true,filePath:'/Downloads/验收.docx',documentId:'a'.repeat(64),bytes:12000};}}; void 0;`);
    await win.webContents.executeJavaScript(workflowModesSource);
    await win.webContents.executeJavaScript(workflowSource);
    await win.webContents.executeJavaScript(reasoningUiSource);
    await win.webContents.executeJavaScript(documentUiSource);
    await win.webContents.executeJavaScript(injectSource);
  };
  await initialize();
  const run = script => win.webContents.executeJavaScript(`try { ${script} } catch(e) { console.error(e.stack); throw e; }`);
  const wait = ms => new Promise(r=>setTimeout(r,ms));
  await run(`document.querySelector('#prompt-textarea').value='生成一份 Word 文档';document.querySelector('[data-testid=send-button]').click();
    document.querySelector('main').innerHTML='<section class="message-render" id="answer1"><h2>Response</h2><div class="markdown prose message-content"><pre><code class="language-oproxy_document"></code></pre></div></section>';
    document.querySelector('code').textContent=JSON.stringify({type:'docx',title:'验收',content:'## 标题\\n完整内容'});`);
  await wait(700);
  assert.equal(await run("calls.length"),0,"Must not generate during streaming");
  await run("document.querySelector('#answer1').insertAdjacentHTML('beforeend','<span><button data-testid=copy-response-button>Copy</button></span>')");
  await wait(800);
  assert.equal(await run("calls.length"),1);
  assert.match(await run("document.querySelector('.oproxy-doc-error').innerText"),/temporary failure/);
  await run("document.querySelector('.oproxy-doc-error button').click()"); await wait(200);
  assert.equal(await run("calls.length"),2);
  assert.match(await run("document.querySelector('.oproxy-doc-result').innerText"),/文档已生成/);
  await run("document.querySelector('[data-oproxy-document-action=open]').click();document.querySelector('[data-oproxy-document-action=reveal]').click();");
  assert.equal(await run("actions.map(a=>a.action).join(',')"),"open,reveal");
  await run("void document.body.appendChild(document.createElement('div'))"); await wait(200);
  assert.equal(await run("calls.length"),2,"Must not repeat after DOM mutation");
  // Historic examples and ordinary JSON must never auto-create files.
  await run(`document.querySelector('main').insertAdjacentHTML('beforeend','<section class="message-render" id="old-user"><h2>Prompt</h2><p>解释文档JSON示例</p></section><section class="message-render" id="old-answer"><h2>Response</h2><pre><code class="language-json"></code></pre><span><button data-testid="copy-response-button">Copy</button></span></section>');
    document.querySelector('#old-answer code').textContent=JSON.stringify({type:'docx',title:'示例',content:'普通JSON'});`);
  await wait(200);
  assert.equal(await run("calls.length"),2);
  assert.equal(await run("document.querySelector('#old-answer').hasAttribute('data-oproxy-doc-hidden')"),false);
  // Model selects a skill, app reads it and automatically continues before generating.
  await run(`document.querySelector('#prompt-textarea').value='制作一份PPT演示文件';document.querySelector('[data-testid=send-button]').click();
    document.querySelector('main').insertAdjacentHTML('beforeend','<section class="message-render" id="skill-answer"><h2>Response</h2><pre><code class="language-oproxy_skill"></code></pre><span><button data-testid="copy-response-button">Copy</button></span></section>');
    document.querySelector('#skill-answer code').textContent=JSON.stringify({type:'pptx'});`);
  // In real LibreChat a successful submit clears the controlled textarea.
  await run(`document.querySelector('#prompt-textarea').value='';document.querySelector('[data-testid=send-button]').addEventListener('click',()=>{document.querySelector('#prompt-textarea').value='';});`);
  await wait(900);
  assert.equal(await run("skillCalls.join(',')"),"pptx");
  assert.equal(await run("calls.length"),2,"Reading a skill must not generate an empty file");
  await run(`document.querySelector('main').insertAdjacentHTML('beforeend','<section class="message-render" id="skill-final"><h2>Response</h2><pre><code class="language-oproxy_document"></code></pre><span><button data-testid="copy-response-button">Copy</button></span></section>');
    document.querySelector('#skill-final code').textContent=JSON.stringify({type:'pptx',title:'技能闭环',slides:[{title:'实施',bullets:['明确的交付要求']}]});`);
  await wait(700);
  assert.equal(await run("calls.length"),3,"Skill continuation produces one document");
  assert.equal(await run("skillCalls.length"),1);
  // A real submit persists a task. Reload loses all DOM/local variables, then
  // navigating elsewhere must not consume or execute its eventual response.
  await run(`document.querySelector('#prompt-textarea').value='生成Word报告';document.querySelector('[data-testid=send-button]').click();`);
  await win.loadURL(`http://127.0.0.1:${server.address().port}/c/test`);
  await initialize(false);
  await run(`document.querySelector('main').innerHTML='<section class="message-render" id="reload-response"><h2>Response</h2><pre><code class="language-oproxy_document"></code></pre></section>';
    document.querySelector('code').textContent=JSON.stringify({type:'docx',title:'恢复任务',content:'完整内容'});`);
  // Baseline messages are restored by the remote app before the new response.
  await run(`const job=JSON.parse(localStorage.getItem('oproxy-document-job-v1')); const main=document.querySelector('main');
    for(let i=0;i<job.baseline;i++){const old=document.createElement('section');old.className='message-render';old.id=job.priorIds[i]||'prior-'+i;old.innerHTML='<h2>Prompt</h2>';main.prepend(old);}`);
  await wait(650);
  assert.equal(await run("calls.length"),0,"Reload must wait for stream completion");
  await run(`history.pushState({},'', '/c/other');window.dispatchEvent(new PopStateEvent('popstate'));`);
  await wait(650);
  await run(`document.querySelector('#reload-response').insertAdjacentHTML('beforeend','<span><button data-testid="copy-response-button">Copy</button></span>');`);
  await wait(650);
  assert.equal(await run("calls.length"),0,"Another conversation cannot execute the saved job");
  await run(`history.pushState({},'', '/c/test');window.dispatchEvent(new PopStateEvent('popstate'));`);
  await wait(850);
  assert.equal(await run("calls.length"),1,"Return to the original conversation resumes exactly once");
  assert.equal(await run("localStorage.getItem('oproxy-document-job-v1')"),null,"Successful result clears the durable task");
  // A pending skill must never overwrite a user's next draft.
  await run(`document.querySelector('#prompt-textarea').value='生成一个PDF文档';document.querySelector('[data-testid=send-button]').click();
    document.querySelector('#prompt-textarea').value='下一条尚未发送的私人草稿';
    document.querySelector('main').insertAdjacentHTML('beforeend','<section class="message-render" id="draft-skill"><h2>Response</h2><pre><code class="language-oproxy_skill"></code></pre><span><button data-testid="copy-response-button">Copy</button></span></section>');
    document.querySelector('#draft-skill code').textContent=JSON.stringify({type:'pdf'});`);
  await wait(800);
  assert.equal(await run("document.querySelector('#prompt-textarea').value"),"下一条尚未发送的私人草稿");
  assert.match(await run("document.querySelector('#draft-skill .oproxy-doc-error').innerText"),/草稿/);
  const beforeRetry=await run("skillCalls.length");
  await run(`document.querySelector('#prompt-textarea').value='';document.querySelector('#draft-skill .oproxy-doc-error button').click();`);
  await wait(350);
  assert.equal(await run("skillCalls.length"),beforeRetry+1);
  assert.equal(await run("document.querySelector('#draft-skill .oproxy-doc-error')"),null);
  await run("clearInterval(window.__oproxyAutoRunTimer);localStorage.removeItem('oproxy-document-job-v1');");
  await win.loadURL(`http://127.0.0.1:${server.address().port}/c/history`);
  await initialize(false);
  // Skill continuation prompts are intentionally hidden; history restoration
  // must use an explicit document fence, not keywords in the preceding prompt.
  const callsBeforeHistory=await run("calls.length");
  await run(`window.__oproxyAutoRunTimer=null;
    window.oproxyDesktop.lookupDocument=async()=>({ok:true,document:{filename:'历史文件.docx',filePath:'/Downloads/历史文件.docx',bytes:12000,documentId:'b'.repeat(64)}});
    document.querySelector('main').insertAdjacentHTML('beforeend','<section class="message-render" id="history-hidden-prompt"><h2>Prompt</h2></section><section class="message-render" id="history-file"><h2>Response</h2><pre><code class="language-oproxy_document"></code></pre><span><button data-testid="copy-response-button">Copy</button></span></section>');
    document.querySelector('#history-file code').textContent=JSON.stringify({type:'docx',title:'历史文件',content:'历史正文'});`);
  await wait(350);
  assert.match(await run("document.querySelector('#history-file .oproxy-doc-result').innerText"),/历史文件.docx/);
  assert.equal(await run("calls.length"),callsBeforeHistory,"History lookup must not create another file");
  // A repairable generation error automatically gives the model its diagnostic;
  // the next invalid response is shown to the user without another auto request.
  await win.loadURL(`http://127.0.0.1:${server.address().port}/c/repair`);
  await initialize(false);
  await run(`window.repairs=[];window.submissions=[];
    window.oproxyDesktop.repairDocument=async(payload)=>{repairs.push(payload);return {ok:true,instruction:'[[OPROXY_LOCAL_RUNTIME]] 文档修正 [[/OPROXY_LOCAL_RUNTIME]]'};};
    window.oproxyDesktop.generateDocument=async(request)=>{calls.push(request);return {ok:false,repairable:true,error:'Excel 公式校验失败：数据!B2 存在循环引用'};};
    document.querySelector('[data-testid="send-button"]').addEventListener('click',()=>{submissions.push(document.querySelector('textarea').value);document.querySelector('textarea').value='';});
    document.querySelector('textarea').value='生成Excel预算';document.querySelector('[data-testid="send-button"]').click();
    document.querySelector('main').innerHTML='<section class="message-render" id="bad-formula"><h2>Response</h2><pre><code class="language-oproxy_document"></code></pre><span><button data-testid="copy-response-button">Copy</button></span></section>';
    document.querySelector('code').textContent=JSON.stringify({type:'xlsx',title:'预算',sheets:[{name:'数据',rows:[[1]]}]});`);
  await wait(850);
  assert.equal(await run("repairs.length"),1);
  assert.match(await run("repairs[0].diagnostic"),/循环引用/);
  assert.equal(await run("JSON.parse(localStorage.getItem('oproxy-document-job-v1')).repairs"),1);
  assert.equal(await run("submissions.length"),2,"One initial request and one automatic repair");
  await run(`document.querySelector('main').insertAdjacentHTML('beforeend','<section class="message-render" id="still-bad"><h2>Response</h2><pre><code class="language-oproxy_document"></code></pre><span><button data-testid="copy-response-button">Copy</button></span></section>');
    document.querySelector('#still-bad code').textContent=JSON.stringify({type:'xlsx',title:'预算',sheets:[{rows:[[1]]}]});`);
  await wait(800);
  assert.equal(await run("repairs.length"),1,"Automatic repair is bounded to one attempt");
  assert.match(await run("document.querySelector('#still-bad .oproxy-doc-error').innerText"),/循环引用/);
  assert.ok(await run("!!document.querySelector('#still-bad [data-oproxy-repair]')"));
  await run(`clearInterval(window.__oproxyAutoRunTimer);localStorage.removeItem('oproxy-document-job-v1');`);
  await win.loadURL(`http://127.0.0.1:${server.address().port}/c/malformed`);
  await initialize(false);
  await run(`window.repairs=[];window.oproxyDesktop.repairDocument=async(payload)=>{repairs.push(payload);return {ok:true,instruction:'[[OPROXY_LOCAL_RUNTIME]] 文档修正 [[/OPROXY_LOCAL_RUNTIME]]'};};
    document.querySelector('[data-testid="send-button"]').addEventListener('click',()=>document.querySelector('textarea').value='');
    document.querySelector('textarea').value='生成Word文档';document.querySelector('[data-testid="send-button"]').click();
    document.querySelector('main').innerHTML='<section class="message-render" id="bad-json"><h2>Response</h2><pre><code class="language-oproxy_document"></code></pre><span><button data-testid="copy-response-button">Copy</button></span></section>';
    document.querySelector('code').textContent='{"type":"docx","title":"未闭合"';`);
  await wait(850);
  assert.equal(await run("repairs.length"),1,"Malformed explicit document JSON is repaired");
  assert.equal(await run("calls.length"),0,"Malformed JSON cannot reach the file engine");
  await run("clearInterval(window.__oproxyAutoRunTimer);localStorage.removeItem('oproxy-document-job-v1');");
  // A user draft pauses repair instead of being sent or overwritten.
  await win.loadURL(`http://127.0.0.1:${server.address().port}/c/repair-draft`);
  await initialize(false);
  await run(`window.repairs=[];window.submissions=[];
    window.oproxyDesktop.repairDocument=async(payload)=>{repairs.push(payload);return {ok:true,instruction:'[[OPROXY_LOCAL_RUNTIME]] 文档修正 [[/OPROXY_LOCAL_RUNTIME]]'};};
    window.oproxyDesktop.generateDocument=async(request)=>{calls.push(request);return {ok:false,repairable:true,error:'Excel 公式校验失败：预算!D4 无效函数'};};
    document.querySelector('[data-testid="send-button"]').addEventListener('click',()=>{submissions.push(document.querySelector('textarea').value);document.querySelector('textarea').value='';});
    document.querySelector('textarea').value='生成Excel文件';document.querySelector('[data-testid="send-button"]').click();
    document.querySelector('textarea').value='不能发送的下一条草稿';
    document.querySelector('main').innerHTML='<section class="message-render" id="repair-draft"><h2>Response</h2><pre><code class="language-oproxy_document"></code></pre><span><button data-testid="copy-response-button">Copy</button></span></section>';
    document.querySelector('code').textContent=JSON.stringify({type:'xlsx',title:'预算',sheets:[{rows:[[1]]}]});`);
  await wait(850);
  assert.equal(await run("document.querySelector('textarea').value"),"不能发送的下一条草稿");
  assert.equal(await run("submissions.length"),1);
  assert.match(await run("document.querySelector('#repair-draft .oproxy-doc-error').innerText"),/草稿/);
  await run("clearInterval(window.__oproxyAutoRunTimer);localStorage.removeItem('oproxy-document-job-v1');");
  // Revision without a format keyword inherits the last file's type. A normal
  // question after that remains unmodified chat and must not show a file error.
  await win.loadURL(`http://127.0.0.1:${server.address().port}/c/multiturn`);
  await initialize(false);
  await run(`window.submitted=[];document.querySelector('[data-testid="send-button"]').addEventListener('click',()=>{submitted.push(document.querySelector('textarea').value);document.querySelector('textarea').value='';});
    document.querySelector('main').innerHTML='<section class="message-render" id="original"><h2>Response</h2><pre><code class="language-oproxy_document"></code></pre><span><button data-testid="copy-response-button">Copy</button></span></section>';
    document.querySelector('code').textContent=JSON.stringify({type:'docx',title:'原文',content:'## 第二部分\\n原内容'});
    document.querySelector('textarea').value='把第二部分再详细一些，保留其他内容';document.querySelector('[data-testid="send-button"]').click();`);
  assert.match(await run("submitted[0]"),/本轮用户在修改或创建 docx 文件/);
  assert.equal(await run("JSON.parse(localStorage.getItem('oproxy-document-job-v1')).type"),"docx");
  await run(`document.querySelector('main').insertAdjacentHTML('beforeend','<section class="message-render" id="revised"><h2>Response</h2><pre><code class="language-oproxy_document"></code></pre><span><button data-testid="copy-response-button">Copy</button></span></section>');
    document.querySelector('#revised code').textContent=JSON.stringify({type:'docx',title:'修订稿',content:'## 第二部分\\n更详细的内容'});`);
  await wait(800);
  assert.equal(await run("calls.length"),1,"Keyword-free revision generates automatically");
  await run(`document.querySelector('textarea').value='为什么第二部分这样安排？';document.querySelector('[data-testid="send-button"]').click();`);
  assert.equal(await run("submitted[1]"),"为什么第二部分这样安排？");
  assert.equal(await run("!!window.__oproxyAutoRunTimer"),false);
  await run(`document.querySelector('textarea').value='再给一个PDF版本';document.querySelector('[data-testid="send-button"]').click();`);
  assert.equal(await run("JSON.parse(localStorage.getItem('oproxy-document-job-v1')).type"),"pdf");
  await run(`document.querySelector('main').insertAdjacentHTML('beforeend','<section class="message-render" id="clarification"><h2>Response</h2><p>请说明目标读者，我会据此调整内容。</p><span><button data-testid="copy-response-button">Copy</button></span></section>');`);
  await wait(750);
  assert.equal(await run("!!document.querySelector('#clarification .oproxy-doc-error')"),false,"A model clarification is normal chat");
  assert.equal(await run("document.querySelector('#clarification').hasAttribute('data-oproxy-doc-hidden')"),false);
  // Regenerate can reuse the same last-message id and message count.
  await run(`document.querySelector('#clarification').innerHTML='<h2>Response</h2><p>Service temporarily unavailable</p><span><button data-testid="copy-response-button">Copy</button><button data-testid="regenerate-generation-button">Retry</button></span>';
    document.querySelector('#clarification [data-testid="regenerate-generation-button"]').click();`);
  const beforeRegeneration=await run("calls.length");
  await wait(650);
  assert.equal(await run("calls.length"),beforeRegeneration,"Retry must not consume the old completed answer");
  await run(`document.querySelector('#clarification').innerHTML='<h2>Response</h2><pre><code class="language-oproxy_document"></code></pre>';
    document.querySelector('#clarification code').textContent=JSON.stringify({type:'pdf',title:'重试结果',content:'重新生成的内容'});`);
  await wait(600);
  assert.equal(await run("calls.length"),beforeRegeneration);
  await run(`document.querySelector('#clarification').insertAdjacentHTML('beforeend','<span><button data-testid="copy-response-button">Copy</button></span>');`);
  await wait(700);
  assert.equal(await run("calls.length"),beforeRegeneration+1,"Same-node regeneration publishes exactly once");
  // Exercise the real message hierarchy: hide only internal scaffolding and
  // keep file actions, prose, attachments and recoverable errors accessible.
  await win.loadURL(`http://127.0.0.1:${server.address().port}/c/layout`);
  await initialize(false);
  await run(`
    const style=document.createElement('style');style.textContent='body{margin:0;font:14px system-ui}main{padding:16px}.message-wrapper{padding:8px}.message-render{display:flex;gap:12px}.avatar{width:24px;flex-shrink:0}.agent-turn,.user-turn{min-width:0;flex:1}.text-message{min-height:20px}';document.head.appendChild(style);
    const message=(id,role,content,extra='')=>'<div class="message-wrapper"><section class="message-render" id="'+id+'"><div class="avatar">O</div><div class="'+(role==='Prompt'?'user':'agent')+'-turn"><h2>'+role+'</h2><div><div class="text-message"><div class="markdown prose message-content">'+content+'</div></div><div class="toolbar"><button data-testid="copy-response-button">Copy</button></div></div>'+extra+'</div></section></div>';
    document.querySelector('main').innerHTML=
      message('real-question','Prompt','<p>[[OPROXY_LOCAL_RUNTIME]]内部指令[[/OPROXY_LOCAL_RUNTIME]]</p><p>请生成城市公园介绍文章</p>')+
      message('internal-skill','Response','<pre><code class="language-oproxy_skill">{"type":"docx"}</code></pre>')+
      message('internal-prompt','Prompt','<p>[[OPROXY_LOCAL_RUNTIME]]技能正文[[/OPROXY_LOCAL_RUNTIME]]</p>')+
      message('file-card','Response','<pre><code class="language-oproxy_document">{"type":"docx","title":"示例","content":"正文"}</code></pre>','<div class="oproxy-doc-result"><span>文档已生成：城市公园介绍文章.docx · 14.0 KB</span><button data-oproxy-document-action="preview">App 内预览</button><button data-oproxy-document-action="open">用外部应用打开</button><button data-oproxy-document-action="reveal">在 Finder 中显示</button><a href="#">打开下载文件夹</a></div>');
    document.querySelectorAll('#file-card [data-oproxy-document-action]').forEach(button=>button.onclick=()=>actions.push(button.dataset.oproxyDocumentAction));
  `);
  await wait(350);
  assert.equal(await run("document.querySelector('#internal-skill').parentElement.getBoundingClientRect().height"),0);
  assert.equal(await run("document.querySelector('#internal-prompt').parentElement.getBoundingClientRect().height"),0);
  assert.ok(await run("document.querySelector('#real-question').getBoundingClientRect().height>0"));
  assert.equal(await run("document.querySelector('#file-card .text-message').getBoundingClientRect().height"),0);
  assert.equal(await run("document.querySelector('#file-card .toolbar').getBoundingClientRect().height"),0);
  assert.equal(await run("document.querySelector('#file-card .oproxy-file-name').textContent"),'城市公园介绍文章.docx');
  assert.equal(await run("document.querySelectorAll('#file-card .oproxy-file-actions > button').length"),2);
  assert.equal(await run("document.querySelector('#file-card .oproxy-file-actions > button').dataset.oproxyDocumentAction"),'open');
  assert.equal(await run("document.querySelector('#file-card .oproxy-file-actions > button').textContent"),'打开文档');
  assert.equal(await run("document.querySelector('#file-card .oproxy-file-icon').textContent"),'','File icon is a graphic, not a text badge');
  await run("document.querySelector('#file-card [data-oproxy-document-action=open]').click();document.querySelector('#file-card summary').click();");
  assert.ok(await run("document.querySelector('#file-card [data-oproxy-document-action=preview]').getBoundingClientRect().height>0"));
  await run("document.querySelector('#file-card [data-oproxy-document-action=preview]').click();document.querySelector('#file-card [data-oproxy-document-action=reveal]').click()");
  assert.equal(await run("actions.join(',')"),'open,preview,reveal');
  assert.equal(await run("document.querySelector('#file-card details').open"),false);
  await win.setContentSize(360,700);
  await run("document.querySelector('#file-card .oproxy-file-name').textContent='很长的城市公园介绍文章与城市生态环境研究'.repeat(6)+'.docx';document.querySelector('#file-card summary').click();");
  await wait(100);
  assert.ok(await run("document.documentElement.scrollWidth<=innerWidth"),'File card and long filename fit narrow windows');
  assert.ok(await run("(()=>{const b=document.querySelector('#file-card .oproxy-file-more-menu').getBoundingClientRect();return b.left>=0&&b.right<=innerWidth;})()"),'More menu stays within the narrow viewport');
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))");
  assert.equal(await run("document.querySelector('#file-card details').open"),false);
  await run("document.documentElement.classList.add('dark')");
  assert.equal(await run("getComputedStyle(document.querySelector('#file-card .oproxy-doc-result')).backgroundColor"),'rgb(38, 38, 38)');
  await run(`
    document.querySelector('#internal-skill .agent-turn').insertAdjacentHTML('beforeend','<div class="oproxy-doc-error">读取失败<button>重试</button></div>');
    document.querySelector('#file-card .markdown').insertAdjacentHTML('afterbegin','<p>文档包含公园功能与生态价值的介绍。</p>');
    document.querySelector('#internal-prompt .markdown').insertAdjacentHTML('beforeend','<img alt="用户附件" src="data:image/png;base64,iVBORw0KGgo=">');
  `);
  await wait(250);
  assert.ok(await run("document.querySelector('#internal-skill .oproxy-doc-error').getBoundingClientRect().height>0"),'Skill errors remain visible and retryable');
  assert.ok(await run("document.querySelector('#file-card .text-message').getBoundingClientRect().height>0"),'New prose restores previously hidden content');
  assert.ok(await run("document.querySelector('#file-card .toolbar').getBoundingClientRect().height>0"),'Prose retains standard chat controls');
  assert.ok(await run("document.querySelector('#internal-prompt').getBoundingClientRect().height>0"),'Attachments are never hidden as empty internal turns');
  assert.equal(await run("calls.length"),0,'Presentation cleanup never generates files or submits prompts');
  await run(`
    window.__oproxyDocumentWorkflow.begin({id:'workflow-test',path:location.pathname,baseline:3,type:'docx',startedAt:Date.now()});
    window.__oproxyDocumentWorkflow.update({id:'workflow-test'},document.querySelector('#file-card'));
  `);
  assert.match(await run("document.querySelector('.oproxy-work-label').textContent"),/编写/);
  assert.ok(!await run("document.querySelector('.oproxy-work-history').textContent.includes('网页搜索')"),'Search status requires an actual server tool element');
  await run(`
    document.querySelector('#file-card code').className='language-json';
    document.querySelector('#file-card .agent-turn').insertAdjacentHTML('afterbegin','<button class="tool-status-text" aria-label="Searching the web">Searching the web</button>');
    window.__oproxyDocumentWorkflow.update({id:'workflow-test'},document.querySelector('#file-card'));
  `);
  assert.match(await run("document.querySelector('.oproxy-work-label').textContent"),/搜索网页/);
  await run(`
    const tool=document.querySelector('#file-card .tool-status-text');tool.textContent='Searched the web';tool.setAttribute('aria-label','Searched the web - 3 sources');
    window.__oproxyDocumentWorkflow.update({id:'workflow-test'},document.querySelector('#file-card'));
    window.__oproxyDocumentWorkflow.stage('rendering');
    window.__oproxyDocumentWorkflow.delivery(document.querySelector('#file-card'),{type:'docx',title:'城市公园',summary:'- 介绍城市公园的生态价值。\\n- 梳理公共服务与空间设计。',content:'## 正文\\n完整内容'},{filename:'城市公园.docx'});
  `);
  assert.match(await run("document.querySelector('.oproxy-work-label').textContent"),/已完成.*用时/);
  assert.equal(await run("document.querySelectorAll('.oproxy-work-summary-list li').length"),2);
  assert.equal(await run("document.querySelector('.oproxy-work-details').open"),false);
  assert.equal(await run("document.querySelectorAll('.oproxy-workflow').length"),1,'One workflow spans skill, search and final delivery');
  await run("history.pushState({},'', '/c/elsewhere');document.querySelector('main').replaceChildren()");
  await wait(250);
  assert.equal(await run("document.querySelector('.oproxy-workflow')"),null,'Workflow cannot leak into another conversation');
  await win.loadURL(`http://127.0.0.1:${server.address().port}/c/search-setup`);
  await initialize(false);
  await run(`
    window.sent=[];window.searchToggles=0;
    const tools=document.createElement('button');tools.id='tools-dropdown-button';tools.type='button';tools.textContent='Tools';document.body.append(tools);
    tools.onclick=()=>{const menu=document.createElement('div');menu.id='tools-dropdown-menu';const item=document.createElement('button');item.setAttribute('role','menuitem');item.textContent='Web Search';menu.append(item);document.body.append(menu);item.onclick=()=>{searchToggles++;const chip=document.createElement('button');chip.setAttribute('role','checkbox');chip.setAttribute('aria-label','Search');chip.setAttribute('aria-checked','true');document.body.append(chip);menu.remove();};};
    document.querySelector('[data-testid=send-button]').addEventListener('click',()=>{sent.push(document.querySelector('textarea').value);document.querySelector('textarea').value='';});
    document.querySelector('textarea').value='生成Word项目报告';document.querySelector('[data-testid=send-button]').click();
  `);
  await wait(750);
  assert.equal(await run('sent.length'),1,'Search setup replays the original submit exactly once');
  assert.equal(await run('searchToggles'),1);
  assert.match(await run('sent[0]'),/网页搜索已启用/);
  await run(`
    clearInterval(window.__oproxyAutoRunTimer);window.__oproxyAutoRunTimer=null;localStorage.removeItem('oproxy-document-job-v1');
    document.querySelector('[role=checkbox]').setAttribute('aria-checked','false');
    document.querySelector('textarea').value='生成Word补充报告';document.querySelector('[data-testid=send-button]').click();
  `);
  assert.equal(await run('sent.length'),2);
  assert.equal(await run('searchToggles'),1,'Explicitly disabled search is respected');
  await run("clearInterval(window.__oproxyAutoRunTimer);localStorage.removeItem('oproxy-document-job-v1')");
  await win.loadURL(`http://127.0.0.1:${server.address().port}/c/recover-document`);
  await initialize(false);
  await run(`
    window.recoveredCalls=[];window.oproxyDesktop.generateDocument=async(request)=>{recoveredCalls.push(request);return {ok:true,filePath:'/Downloads/recovered.docx',documentId:'c'.repeat(64),bytes:12000};};
    window.oproxyDesktop.lookupDocument=async()=>({ok:true,document:null});
    const recoverySpec={type:'docx',title:'恢复文档',content:'## 摘要\\\\n\\\\n正文内容'};
    const main=document.querySelector('main');
    main.innerHTML='<section class="message-render" id="recover-user"><h2>Prompt</h2><div class="user-turn"><div class="markdown prose message-content"><p>生成一个符合毕业论文格式的docx文档</p></div></div></section>';
    const answer=document.createElement('section');answer.className='message-render';answer.id='recover-answer';answer.innerHTML='<h2>Response</h2><div class="markdown prose message-content"></div><span><button data-testid="copy-response-button">Copy</button></span>';
    const fence=String.fromCharCode(96).repeat(3);answer.querySelector('.markdown').textContent='我会整理文稿。'+fence+'oproxy_document\\n'+JSON.stringify(recoverySpec)+'\\n'+fence;main.append(answer);
  `);
  await wait(900);
  assert.equal(await run('recoveredCalls.length'),1,'A stalled explicit document fence resumes once after reload');
  assert.equal(await run('!!window.__oproxyAutoRunTimer'),false,'Successful recovery stops its watcher');
  await run("document.body.appendChild(document.createElement('div'))");await wait(180);
  assert.equal(await run('recoveredCalls.length'),1,'Successful recovery is not re-run after a mutation');
  assert.equal(await run("recoveredCalls[0].spec.content"),'## 摘要\n\n正文内容','Double-escaped line breaks become real Markdown breaks');
  await win.loadURL(`http://127.0.0.1:${server.address().port}/c/raw-document`);
  await initialize(false);
  await run(`
    window.recoveredCalls=[];window.oproxyDesktop.generateDocument=async(request)=>{recoveredCalls.push(request);return {ok:true,filePath:'/Downloads/intact.docx',documentId:'d'.repeat(64),bytes:12000};};
    const main=document.querySelector('main');main.innerHTML='<section class="message-render"><h2>Prompt</h2><div class="user-turn"><div class="markdown prose message-content">生成毕业论文docx文档</div></div></section><section class="message-render" data-oproxy-internal-prompt><h2>Prompt</h2><div class="user-turn"><div class="markdown prose message-content"></div></div></section>';
    const answer=document.createElement('section');answer.className='message-render';answer.id='raw-answer';answer.innerHTML='<h2>Response</h2><div class="agent-turn"><div class="markdown prose message-content"></div><span><button data-testid="copy-response-button">Copy</button></span></div>';
    const element=answer.querySelector('.markdown'),fence=String.fromCharCode(96).repeat(3);
    window.rawSpec={type:'docx',title:'论文',content:'## 摘要\\n\\n**标签**：[来源](https://example.com)\\n\\n末尾内容。'};
    element.textContent='网页错误渲染后的文本：'+fence+'oproxy_document '+JSON.stringify({...rawSpec,content:'丢失格式和链接的内容'});
    element.__reactFiber$fixture={memoizedProps:{className:'markdown'},return:{memoizedProps:{text:'进度说明。'+fence+'oproxy_document\\n'+JSON.stringify(rawSpec)+'\\n'+fence,isCreatedByUser:false}}};
    main.append(answer);
  `);
  await wait(900);
  assert.equal(await run('recoveredCalls.length'),1,'Internal continuation does not prevent recovering the original document request');
  assert.deepEqual(await run('recoveredCalls[0].spec'),await run('rawSpec'),'Recovery uses original message source and preserves Markdown and links');
  assert.equal(await run("getComputedStyle(document.querySelector('#raw-answer .markdown')).display"),'none','Raw document JSON does not appear as chat prose');
  assert.equal(await run('!!window.__oproxyAutoRunTimer'),false);
  await win.loadURL(`http://127.0.0.1:${server.address().port}/c/repair-history`);
  await initialize(false);
  await run(`(()=>{
    const main=document.querySelector('main');main.innerHTML='<section class="message-render" id="obsolete"><h2>Response</h2><pre><code class="language-oproxy_document"></code></pre><button data-testid="copy-response-button">Copy</button></section><section class="message-render" data-oproxy-repair-prompt><h2>Prompt</h2><div class="user-turn"><div class="markdown prose message-content"></div></div></section><section class="message-render"><h2>Response</h2><p>新回答尚在加载</p></section>';
    document.querySelector('#obsolete code').textContent=JSON.stringify({type:'pptx',title:'待修正',slides:[{title:'示例',bullets:['完整内容']}]});return true;
  })()`);
  await wait(300);
  assert.equal(await run("document.querySelector('#obsolete .oproxy-doc-result')"),null,'Superseded authoring failure cannot resurrect an actionable card');
  await win.loadURL(`http://127.0.0.1:${server.address().port}/c/inline-skill`);
  await initialize(false);
  await run(`(()=>{const main=document.querySelector('main');main.innerHTML='<section class="message-render"><h2>Prompt</h2><div class="user-turn"><div class="markdown prose message-content">生成Excel工作簿</div></div></section><section class="message-render" id="inline-skill"><h2>Response</h2><div class="agent-turn"><div class="markdown prose message-content"></div><button data-testid="copy-response-button">Copy</button></div></section>';const element=main.querySelector('#inline-skill .markdown'),fence=String.fromCharCode(96).repeat(3);element.textContent='准备交付。'+fence+'oproxy_skill'+String.fromCharCode(10)+'{"type":"xlsx"}'+String.fromCharCode(10)+fence;document.querySelector('[data-testid=send-button]').addEventListener('click',()=>document.querySelector('textarea').value='');return true})()`);
  await wait(800);
  assert.equal(await run('skillCalls.length'),1,'Inline skill envelope resumes exactly one skill continuation');
  assert.equal(await run('skillCalls[0]'),'xlsx');
  assert.equal(await run("getComputedStyle(document.querySelector('#inline-skill .markdown')).display"),'none');
  await run("clearInterval(window.__oproxyAutoRunTimer);window.__oproxyAutoRunTimer=null;localStorage.removeItem('oproxy-document-job-v1')");
  await win.loadURL(`http://127.0.0.1:${server.address().port}/c/modes`);
  await initialize(false);
  await run(`
    const toolsButton=document.createElement('button');toolsButton.id='tools-dropdown-button';document.body.append(toolsButton);
    const menu=document.createElement('div');menu.id='tools-dropdown-menu';document.body.append(menu);
    window.__oproxyWorkflowModesState.save(['paper','data']);window.__oproxyDocumentUI.refresh();
  `);
  assert.equal(await run("document.querySelectorAll('[data-oproxy-mode-option]').length"),3);
  assert.equal(await run("document.querySelector('[data-oproxy-mode-option=paper]').getAttribute('aria-checked')"),'true');
  assert.equal(await run("document.querySelector('[data-oproxy-mode-option=data]').getAttribute('aria-checked')"),'true');
  await run("document.querySelector('[data-oproxy-mode-option=law]').click()");
  assert.deepEqual(await run("JSON.parse(localStorage.getItem('oproxy-workflow-mode-v1'))"),['paper','data','law']);
  await run(`
    window.sent=[];document.querySelector('[data-testid=send-button]').addEventListener('click',()=>{sent.push(document.querySelector('textarea').value);document.querySelector('textarea').value='';});
    document.querySelector('textarea').value='请说明这份报告的引用和数据';document.querySelector('[data-testid=send-button]').click();
  `);
  await wait(180);
  assert.equal(await run('sent.length'),1);
  assert.match(await run('sent[0]'),/论文助手/);
  assert.match(await run('sent[0]'),/数据分析/);
  assert.match(await run('sent[0]'),/法律助手/);
  assert.equal(await run("document.querySelector('main').textContent.includes('当前启用“论文助手”工作模式')"),false);
  await run("window.__oproxyWorkflowModesState.save([]);localStorage.removeItem('oproxy-document-job-v1')");
  await win.loadURL(`http://127.0.0.1:${server.address().port}/c/mode-errors`);
  await initialize(false);
  await run(`(()=>{
    document.querySelector('main').innerHTML='<section class="message-render"><h2>Prompt</h2><div class="user-turn"><div class="markdown prose message-content">查找文献</div></div></section><section class="message-render" id="mode-error"><h2>Response</h2><div class="agent-turn"><div role="alert">Our servers are currently overloaded</div><button data-testid="copy-response-button">Copy</button></div></section>';
    window.__oproxyDocumentWorkflow.beginModeOnly({baseline:0,modes:['paper']});return true;
  })()`);
  await wait(250);
  assert.equal(await run("document.querySelector('.oproxy-workflow').dataset.stage"),'error','Service errors cannot claim verification complete');
  assert.doesNotMatch(await run("document.querySelector('.oproxy-workflow').textContent"),/已完成文献核验|已完成工作模式核验/);
  await win.loadURL(`http://127.0.0.1:${server.address().port}/c/early-error`);
  await initialize(false);
  await run(`(()=>{document.querySelector('textarea').value='生成Word报告';document.querySelector('[data-testid=send-button]').click();document.querySelector('main').innerHTML='<section class="message-render" id="server-rejection"><h2>Response</h2><div role="alert">Model unavailable</div><button data-testid="regenerate-generation-button">Retry</button></section>';return true})()`);
  await wait(750);
  assert.equal(await run('!!window.__oproxyAutoRunTimer'),false,'Model rejection without Copy stops document generation');
  assert.equal(await run("localStorage.getItem('oproxy-document-job-v1')"),null);
  await win.loadURL(`http://127.0.0.1:${server.address().port}/c/capabilities`);
  await run(`(()=>{
    window.submitted=0;
    const tools=document.createElement('button');tools.id='tools-dropdown-button';tools.onclick=()=>{
      const menu=document.createElement('div');menu.id='tools-dropdown-menu';
      const dismiss=document.createElement('button');dismiss.onclick=()=>menu.remove();menu.append(dismiss);
      for(const label of ['Search','Run Code']){
        const item=document.createElement('div');item.role='menuitem';item.textContent=label==='Search'?'Web Search':label;
        item.onclick=()=>{const chip=document.createElement('button');chip.role='checkbox';chip.setAttribute('aria-label',label);chip.setAttribute('aria-checked','true');chip.onclick=()=>chip.setAttribute('aria-checked',String(chip.getAttribute('aria-checked')!=='true'));document.body.append(chip);menu.remove()};menu.append(item);
      }document.body.append(menu);
    };document.body.append(tools);
    document.querySelector('[data-testid=send-button]').onclick=()=>submitted++;return true;
  })()`);
  const capabilitySource=await fs.readFile(new URL('../src/capability-policy.js',import.meta.url),'utf8');
  await win.webContents.executeJavaScript(capabilitySource);
  await run("document.querySelector('textarea').value='数据';document.querySelector('[data-testid=send-button]').click();document.querySelector('[data-testid=send-button]').click()");
  await wait(1600);
  assert.equal(await run('submitted'),1,'Configuring real capabilities replays submission once');
  assert.deepEqual(await run('window.__oproxyCapabilityPolicy.status()'),{search:true,code:true});
  await run("document.querySelector('[aria-label=Search]').click();document.querySelector('textarea').value='原始草稿';document.querySelector('[data-testid=send-button]').click();document.querySelector('textarea').value='用户新草稿'");
  await wait(700);
  assert.equal(await run('submitted'),1,'Capability setup cannot send a changed draft');
  console.log(JSON.stringify({ok:true,pdfBytes:buffer.length,checks:["Chromium Chinese PDF","stream completion","retry after failure","no duplicate on mutation","model-selected skill continuation","reload recovery","conversation isolation","draft preservation and skill retry","bounded authoring repair","malformed JSON repair","repair draft protection","keyword-free revisions","format conversion","plain clarification","same-node regeneration","document card actions and menu","internal turn cleanup","narrow layout and dark mode","prose/error/attachment visibility"]}));
} catch(error) { console.error(error);process.exitCode=1; }
finally { server?.close(); win?.destroy(); await fs.rm(directory,{recursive:true,force:true}); app.exit(process.exitCode || 0); }

});
