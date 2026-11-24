// Live student journey: drives the installed app, uploads only synthetic test
// files and records model routing identifiers, tool names and rendered output.
import fs from 'node:fs/promises';
import path from 'node:path';
import {requestModelEvidence} from './acceptance-model.mjs';
import {parseDocumentEnvelope} from '../src/documents/protocol.js';
const root=path.resolve(process.env.OPROXY_JOURNEY_DIR||'docs/validation/student-journey-2026-11-13');
await fs.mkdir(root,{recursive:true});
const command=process.argv[2]||'status',port=process.env.CDP_PORT||9224;
const reportFile=path.join(root,'journey.json');let report;
try{report=JSON.parse(await fs.readFile(reportFile,'utf8'))}catch{report={startedAt:new Date().toISOString(),phases:[]}}
const target=(await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json())).find(t=>t.type==='page'&&t.url.startsWith('https://chat.oproxy.world'));
if(!target)throw Error('Installed chat page unavailable');
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})});
let seq=0,record;const pending=new Map();
ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Network.requestWillBeSent'&&record){const r=m.params.request;if(r.method==='POST'&&/\/api\/(agents\/chat|ask)/.test(r.url)&&r.postData){try{const ids=requestModelEvidence(JSON.parse(r.postData));record.requests.push(ids);if(ids.models.some(n=>n!=='gpt-6.1-sol'))record.wrongModel=true;}catch{}}if(r.method==='POST'&&/\/files\//.test(r.url))record.uploadPaths?.push(new URL(r.url).pathname)}const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result)}});
function call(method,params={}){return new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timeout'))},20000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}))})}
async function run(expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,timeout=30000){const end=Date.now()+timeout;while(Date.now()<end){const value=await fn();if(value)return value;await delay(250)}throw Error('UI state timeout')}
const stateExpression=`(()=>{const messages=[...document.querySelectorAll('.message-render')],last=messages.at(-1);const raw=[];for(const e of last?.querySelectorAll('.markdown.prose.message-content')||[]){let f=e[Object.keys(e).find(k=>k.startsWith('__reactFiber$'))];let found=false;for(let i=0;f&&i<4;i++,f=f.return)if(typeof f.memoizedProps?.text==='string'){raw.push(f.memoizedProps.text);found=true;break}if(!found)raw.push(e.textContent)}return {path:location.pathname,model:document.querySelector('[data-testid=model-selector-button]')?.innerText,draft:document.querySelector('#prompt-textarea')?.value,ready:!!window.__oproxyParseDocumentEnvelope,count:messages.length,lastId:last?.id,assistant:/Response|响应/.test(last?.querySelector('h2')?.textContent||''),complete:!!last?.querySelector('[data-testid=copy-response-button]'),streaming:!!document.querySelector('[data-testid=stop-generation-button], [data-testid=stop-button]'),pending:!!window.__oproxyAutoRunTimer,raw:raw.join('\\n'),text:last?.innerText||'',card:last?.querySelector('.oproxy-file-name')?.textContent,error:last?.querySelector('.oproxy-doc-error, [role=alert]')?.innerText,tools:[...last?.querySelectorAll('.tool-status-text')||[]].map(e=>e.getAttribute('aria-label')||e.textContent),workflow:[...document.querySelectorAll('.oproxy-workflow')].at(-1)?.innerText,modeStates:[...document.querySelectorAll('.oproxy-workflow')].map(e=>({id:e.dataset.oproxyWorkflow,stage:e.dataset.stage})),job:localStorage.getItem('oproxy-document-job-v1')};})()`;
const state=()=>run(stateExpression);
async function save(){await fs.writeFile(reportFile,JSON.stringify(report,null,2))}
async function screenshot(name){const r=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(path.join(root,name+'.png'),Buffer.from(r.data,'base64'))}
async function ensureModel(){await until(()=>run(`!!document.querySelector('[data-testid=model-selector-button]')`));if((await state()).model==='gpt-6.1-sol')return;await run(`document.querySelector('[data-testid=model-selector-button]').click()`);await until(()=>run(`[...document.querySelectorAll('[role=option]')].some(e=>e.innerText.startsWith('Oproxy OpenAI'))`));await run(`[...document.querySelectorAll('[role=option]')].find(e=>e.innerText.startsWith('Oproxy OpenAI')).click()`);await until(()=>run(`[...document.querySelectorAll('[role=option]')].some(e=>e.innerText.split('\\n')[0]==='gpt-6.1-sol')`));await run(`[...document.querySelectorAll('[role=option]')].find(e=>e.innerText.split('\\n')[0]==='gpt-6.1-sol').click()`)}
const cases={
 chat:{modes:[],prompt:'我是一名正在准备毕业论文的大四学生，选题是电子纸阅读器交互体验。请用三句话建议我今天先做什么，不用搜索，不生成文件。'},
 research_focus:{modes:['paper'],prompt:'刚才没有找到足够论文，请继续实际联网搜索，不要停在建议我自行检索。用英文精确检索 e-ink display reading comprehension eye fatigue，优先PLOS、大学知识库或开放论文原文。需要2篇真实研究，每篇列标题、作者年份、直达原文和研究限制；不是论文的产品页不能充数。如果仍找不到请明确限制。不要生成文件。'},
 research:{modes:['paper'],prompt:'我是一名中国大四学生，毕业论文想研究“电子纸阅读器的交互体验与技术取舍”。请先实际联网检索，给我2篇能确认真实存在、能直接打开原文的相关研究，附作者、年份、标题、可阅读链接和各自对选题的价值。另有同学推荐一篇《2026 Quantum Ink Study by Zhang Xiaoming》，请核对它是否真实，不能确认就明确剔除。先不要生成文件，简明回复。'},
 reading:{upload:true,modes:['paper'],prompt:'老师给了我任务说明和一份阅读体验CSV，我已经上传了。请实际读取这两个附件，告诉我说明里的校验码、论文排版和内容约束，以及CSV哪些行无效。不要只按文件名猜测，不要联网代替读附件，也先不要生成文件。'},
 analysis:{modes:['data'],prompt:'按刚上传材料的valid列剔除无效记录，用可执行脚本独立复算总样本数、有效数、剔除数、有效时长总和与均值、A/B组各自的时长均值和评分均值。中途说明正在复算，最后给可复现的计算依据。注意这些是合成示例，不是真实调研，先不要生成文件。'},
 xlsx:{modes:['data'],format:'xlsx',prompt:'把刚才核对过的合成数据整理成Excel工作簿，文件名Student_有效数据核算.xlsx。三张表：原始数据、有效数据、汇总。原始表保留12条和valid列；有效表只留10条；汇总用公式核算285分钟合计、28.5分钟均值、A组26/B组31分钟均值及评分均值4.4/3.8。明确标注合成示例。'},
 thesis_sources:{modes:['paper'],format:'docx',prompt:'我确认允许你现在实际联网检索并核验2篇公开论文，不再假定前文已有文献。可从 E-Readers and Visual Fatigue（PLOS ONE, 2013）以及 Comparison of reading speed, comprehension, and satisfaction on screen and on paper 检索。核实真实标题和原文，不能确认的不要引用。随后完成约1200字的Student_论文初稿.docx，按上传材料使用thesis样式，三章正文、至少一表、校验码STU2026-731和合成数据限制，个人信息留空。不要再次询问。'},
 thesis:{modes:['paper'],format:'docx',prompt:'现在按上传的论文任务说明生成约1200字的毕业论文初稿，题目《电子纸阅读器的交互体验与技术取舍》，docx文件名Student_论文初稿.docx。保留校验码STU2026-731，只使用前面已核实的2篇参考文献和直达原文链接。使用复算后的合成数据，说明不能代表真实调研。应用thesis样式：独立封面、摘要关键词、目录、三章正文、结论、参考文献，至少一张可编辑表格。个人信息留空，不声称满足某真实学校规范。'},
 revision:{modes:['paper'],format:'docx',prompt:'老师建议把第二章的数据结果和局限写得具体一些，增加约200字，其他章节和参考文献保持，仍保留合成数据声明与全部来源链接，文件名Student_论文修订稿.docx。'},
 pdf:{modes:['paper'],format:'pdf',prompt:'再给一个PDF版本，用于发给老师预览。文件名Student_论文预览.pdf。必须保留修订稿的正文、数据表、校验码和来源链接。'},
 slides:{modes:[],format:'pptx',prompt:'基于修订后的论文制作答辩PPT，封面外5页：问题背景、技术取舍、合成数据结果、局限、后续研究。含A/B组时长均值26与31分钟的原生柱状图、参考来源、每页讲稿。明确合成示例，不要冒充实测。文件名Student_答辩.pptx。'}
};
try{
 if(command==='status'){const s=await state();console.log(JSON.stringify({path:s.path,model:s.model,count:s.count,streaming:s.streaming,pending:s.pending,card:s.card,rawChars:s.raw.length,tail:s.text.slice(-1000),workflow:s.workflow},null,2));}
 else if(command==='new'){
 const s=await state();if(s.draft?.trim()||s.pending||s.streaming)throw Error('Active user task or draft; do not replace');report.returnPath=s.path;report.originalModes=await run(`localStorage.getItem('oproxy-workflow-mode-v1')`);await run(`location.href='/c/new'`);await until(async()=>{const s=await state();return s.path==='/c/new'&&s.ready});await ensureModel();await save();console.log('New test conversation ready');
 }else{
 const basePhase=command.replace(/_retry\d*$/,'');const test=cases[basePhase];if(!test)throw Error('Unknown phase');if(report.phases.some(p=>p.phase===command&&p.submittedAt))throw Error('Phase already submitted; inspect the recorded conversation instead of resubmitting');
 await until(()=>run(`!!document.querySelector('#prompt-textarea')&&!!document.querySelector('input[type=file]')&&!!window.__oproxyWorkflowModesState`));const prior=await state();if(prior.draft?.trim()||prior.pending||prior.streaming)throw Error('Active task or draft');await ensureModel();
 await run(`window.__oproxyWorkflowModesState.save(${JSON.stringify(test.modes)});window.__oproxyDocumentUI.refresh()`);
 record={phase:command,startedAt:new Date().toISOString(),prompt:test.prompt,requests:[],uploadPaths:[],progress:[]};report.phases.push(record);await call('Network.enable');await save();
 if(test.upload){const doc=await call('DOM.getDocument');const q=await call('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'input[type=file]'});if(!q.nodeId)throw Error('No upload input');await call('DOM.setFileInputFiles',{nodeId:q.nodeId,files:[path.join(root,'论文任务说明.docx'),path.join(root,'合成阅读体验数据.csv')]});await delay(2500);record.attachmentUI=await run(`document.querySelector('#prompt-textarea').closest('form').innerText`);await screenshot(command+'-attachments');}
 await run(`(()=>{const t=document.querySelector('#prompt-textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,${JSON.stringify(test.prompt)});t.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 await until(()=>run(`!!document.querySelector('[data-testid=send-button]')&&!document.querySelector('[data-testid=send-button]').disabled`));
 if((await state()).model!=='gpt-6.1-sol')throw Error('Wrong model');record.capabilities=await run(`window.__oproxyCapabilityPolicy?.status()`);record.submittedAt=new Date().toISOString();await save();await run(`document.querySelector('[data-testid=send-button]').click()`);console.log(JSON.stringify({phase:command,event:'submitted'}));
 const end=Date.now()+12*60*1000;let lastProgress=0;while(Date.now()<end){const s=await state();if(record.wrongModel||s.model!=='gpt-6.1-sol')throw Error('Unexpected model changed');if(Date.now()-lastProgress>20000){lastProgress=Date.now();const progress={path:s.path,count:s.count,chars:s.raw.length,tools:s.tools,streaming:s.streaming,pending:s.pending,card:s.card,workflow:s.workflow};record.progress.push(progress);await save();console.log(JSON.stringify({phase:command,...progress}));}
 if(s.count>prior.count&&s.assistant&&(s.complete||s.error)&&!s.streaming&&(!s.pending||s.error)&&(!documentGenerating(s)||s.error)){record.finishedAt=new Date().toISOString();record.conversation=s.path;record.reply=s.raw;record.visibleReply=s.text;record.tools=s.tools;record.workflow=s.workflow;record.error=s.error;record.card=s.card;record.modelVerified=record.requests.length>0&&record.requests.every(r=>r.models.length===1&&r.models[0]==='gpt-6.1-sol'&&r.endpoints.includes('Oproxy OpenAI'));report.path=s.path;
 const spec=parseDocumentEnvelope(s.raw)||parseDocumentEnvelope(s.raw,true);if(spec&&s.card){const r=await run(`window.oproxyDesktop.lookupDocument({spec:${JSON.stringify(spec)},requestId:location.pathname+':'+${JSON.stringify(s.lastId)}+':'+${JSON.stringify(JSON.stringify(spec))}})`);record.document=r.document;record.spec=spec;}
 record.completed=!s.error&&record.modelVerified&&s.raw.length>20&&(!test.format||!!record.document);await screenshot(command+'-complete');await save();console.log(JSON.stringify({phase:command,event:'finished',completed:record.completed,modelVerified:record.modelVerified,tools:record.tools,card:s.card,error:s.error,reply:s.raw.slice(-1600)}));break;}
 await delay(1500);
 }
 if(!record.finishedAt){record.observationTimeout=true;await save();throw Error('Observation timeout; do not resubmit blindly')}
 }
}finally{for(const p of pending.values())clearTimeout(p.timer);ws.close()}
function documentGenerating(s){return !!s.job&&s.job!=='null'}
