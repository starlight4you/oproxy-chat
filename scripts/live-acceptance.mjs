// Drive an actual, already-open installed app using its loopback debug port.
// This harness never creates an account, supplies credentials or calls a model
// other than the explicitly offered Oproxy OpenAI / gpt-6.1-sol.
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {fileURLToPath} from "node:url";
import {requestModelEvidence} from "./acceptance-model.mjs";
import {validateAcceptanceArtifact} from "./acceptance-validation.mjs";
const exec=promisify(execFile);
import { acceptanceCases } from "./acceptance-cases.mjs";

const port=Number(process.env.CDP_PORT||9224);
const output=path.resolve(process.env.OPROXY_ACCEPTANCE_DIR||"dist/live-acceptance-060");
const command=process.argv[2]||"status";
const expectedModel="gpt-6.1-sol";
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const targets=await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());
const target=targets.find(t=>t.type==="page"&&/^https:\/\/(?:chat\.)?oproxy\.world\//.test(t.url));
if(!target)throw Error("No Oproxy app page found on the supplied loopback debug port.");
const ws=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{ws.addEventListener("open",resolve,{once:true});ws.addEventListener("error",reject,{once:true});});
let id=0;const pending=new Map();let requestEvidence=null;
ws.addEventListener("message",event=>{
  const message=JSON.parse(event.data);
  if(requestEvidence&&message.method==="Network.requestWillBeSent"){
    const request=message.params.request;
    if(request.method==="POST"&&/^https:\/\/chat\.oproxy\.world\/api\/(?:agents\/chat|ask)(?:[/?]|$)/.test(request.url)&&request.postData){
      try{const identifiers=requestModelEvidence(JSON.parse(request.postData));if(identifiers.models.length)requestEvidence.push({path:new URL(request.url).pathname,...identifiers});}catch{}
    }
  }
  const entry=pending.get(message.id);
  if(!entry)return;pending.delete(message.id);clearTimeout(entry.timer);
  message.error?entry.reject(Error(JSON.stringify(message.error))):entry.resolve(message.result);
});
function call(method,params={}){return new Promise((resolve,reject)=>{const next=++id,timer=setTimeout(()=>{pending.delete(next);reject(Error(`CDP timeout: ${method}`));},15000);pending.set(next,{resolve,reject,timer});ws.send(JSON.stringify({id:next,method,params}));});}
async function evaluate(expression){
  const result=await call("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});
  if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
  return result.result?.value;
}
async function until(fn,timeout=30000){const end=Date.now()+timeout;while(Date.now()<end){const result=await fn();if(result)return result;await sleep(200);}throw Error("Timed out waiting for app UI state.");}
async function state(){return evaluate(`({origin:location.origin,path:location.pathname,chatReady:!!document.querySelector('#prompt-textarea'),model:document.querySelector('[data-testid="model-selector-button"]')?.innerText,streaming:!!document.querySelector('[data-testid="stop-generation-button"]'),documentPending:!!window.__oproxyAutoRunTimer})`);}
async function selectModel(){
  await until(async()=>{const s=await state();return s.origin==="https://chat.oproxy.world"&&s.chatReady;});
  if((await state()).model===expectedModel)return;
  await evaluate(`document.querySelector('[data-testid="model-selector-button"]').click();void 0;`);
  await until(()=>evaluate(`!![...document.querySelectorAll('[role="option"]')].find(e=>e.innerText.startsWith('Oproxy OpenAI'))`));
  await evaluate(`[...document.querySelectorAll('[role="option"]')].find(e=>e.innerText.startsWith('Oproxy OpenAI')).click();void 0;`);
  await until(()=>evaluate(`!![...document.querySelectorAll('[role="option"]')].find(e=>e.innerText.split('\\n')[0]==='gpt-6.1-sol')`));
  await evaluate(`[...document.querySelectorAll('[role="option"]')].find(e=>e.innerText.split('\\n')[0]==='gpt-6.1-sol').click();void 0;`);
  await until(async()=>(await state()).model===expectedModel);
}
async function inspectPreview(title,caseId){
  const target=await until(async()=>{
    const targets=await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());
    return targets.find(t=>t.type==="page"&&t.url.startsWith("data:text/html")&&t.title.startsWith(title+" ·"));
  });
  const socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener("open",resolve,{once:true});socket.addEventListener("error",reject,{once:true});});
  let next=0;const pending=new Map();
  socket.addEventListener("message",event=>{const m=JSON.parse(event.data),entry=pending.get(m.id);if(!entry)return;pending.delete(m.id);clearTimeout(entry.timer);m.error?entry.reject(Error(JSON.stringify(m.error))):entry.resolve(m.result);});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++next,timer=setTimeout(()=>reject(Error("Preview inspection timeout")),15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
  try{
    const result=await send("Runtime.evaluate",{expression:`({title:document.title,textChars:document.body.innerText.length,bridge:typeof window.oproxyDesktop,csp:document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content,tables:document.querySelectorAll('table').length,slides:document.querySelectorAll('section.slide').length,notes:document.querySelectorAll('.notes').length,formulas:document.querySelectorAll('td.formula').length,quoteParagraphs:document.querySelectorAll('blockquote p').length,taskItems:document.querySelectorAll('input[type="checkbox"]').length})`,returnByValue:true});
    if(result.exceptionDetails)throw Error("Preview page inspection failed");
    const evidence=result.result?.value;
    if(!evidence||evidence.textChars<50||evidence.bridge!=="undefined"||!evidence.csp?.includes("script-src 'none'"))throw Error("Preview content or isolation check failed");
    const screenshot=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});
    const screenshotPath=path.join(output,`${caseId}-preview.png`);
    await fs.writeFile(screenshotPath,Buffer.from(screenshot.data,"base64"));
    return {...evidence,screenshot:screenshotPath};
  }finally{for(const entry of pending.values())clearTimeout(entry.timer);socket.close();}
}
async function run(testCase){
  const prior=await state();
  if(!prior.chatReady||prior.origin!=="https://chat.oproxy.world")throw Error("Fresh Oproxy login must be completed in the app before running model acceptance.");
  if(prior.streaming||prior.documentPending)throw Error("Existing generation is active; observe it before submitting another case.");
  const receipt=path.join(output,`${testCase.id}.json`);
  try{
    const priorRun=JSON.parse(await fs.readFile(receipt,"utf8"));
    if(priorRun.startedAt)throw Error(`Case ${testCase.id} already has an acceptance attempt (${priorRun.completed?"completed":"incomplete"}). Inspect its original conversation and recorded state before authorizing a new attempt; this harness never silently resubmits.`);
  }catch(error){if(error.code!=="ENOENT")throw error;}
  await evaluate(`location.href='/c/new';void 0;`);
  await until(async()=>{const s=await state();return s.path==="/c/new"&&s.chatReady;});
  await selectModel();
  await until(()=>evaluate(`!!window.__oproxyDocButtonsInstalled`));
  const before=await evaluate(`({messages:document.querySelectorAll('.message-render').length,draft:document.querySelector('#prompt-textarea').value})`);
  if(before.draft.trim())throw Error("Unsent draft found: acceptance will not overwrite user input.");
  requestEvidence=[];
  await call("Network.enable");
  const startedAt=new Date().toISOString();
  const record={case:testCase.id,model:expectedModel,startedAt,completed:false,checks:testCase.checks};
  await fs.mkdir(output,{recursive:true});await fs.writeFile(receipt,JSON.stringify(record,null,2)+"\n");
  await evaluate(`(()=>{if(document.querySelector('[data-testid="model-selector-button"]').innerText!=='gpt-6.1-sol')throw Error('wrong model');const textarea=document.querySelector('#prompt-textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(textarea,${JSON.stringify(testCase.prompt)});textarea.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await until(()=>evaluate(`!!document.querySelector('[data-testid="send-button"]')&&!document.querySelector('[data-testid="send-button"]').disabled`));
  record.submissionStartedAt=new Date().toISOString();
  await fs.writeFile(receipt,JSON.stringify(record,null,2)+"\n");
  await evaluate(`(()=>{if(document.querySelector('[data-testid="model-selector-button"]').innerText!=='gpt-6.1-sol')throw Error('wrong model');document.querySelector('[data-testid="send-button"]').click();})()`);
  console.log(JSON.stringify({case:testCase.id,event:"submitted",model:expectedModel}));
  // All runtime evidence comes from this exact live conversation, not mocks.
  const end=Date.now()+15*60*1000;let lastProgress="",lastReported=0;
  while(Date.now()<end){
    const snapshot=await evaluate(`(()=>{const c=[...document.querySelectorAll('.message-render')].at(-1);return {path:location.pathname,model:document.querySelector('[data-testid="model-selector-button"]')?.innerText,messageCount:document.querySelectorAll('.message-render').length,assistant:/响应|Response/i.test(c?.querySelector('h2')?.innerText||''),complete:!!c?.querySelector('[data-testid="copy-response-button"]'),text:c?.innerText||'',rawLength:c?.textContent.length||0,streaming:!!document.querySelector('[data-testid="stop-generation-button"]'),pending:!!window.__oproxyAutoRunTimer,generating:!!c?.querySelector('.oproxy-generating-banner'),error:c?.querySelector('.oproxy-doc-error')?.innerText,card:c?.querySelector('.oproxy-doc-result')?.innerText};})()`);
    if(snapshot.model!==expectedModel){record.failure="Model changed during acceptance; halted before any further submission.";break;}
    const progress=`${snapshot.messageCount}:${snapshot.rawLength}:${!!snapshot.card}`;
    if(progress!==lastProgress&&Date.now()-lastReported>15000){console.log(JSON.stringify({case:testCase.id,event:"progress",messages:snapshot.messageCount,chars:snapshot.rawLength,streaming:snapshot.streaming}));lastProgress=progress;lastReported=Date.now();}
    if(snapshot.assistant&&snapshot.complete&&!snapshot.streaming&&!snapshot.pending&&!snapshot.generating){
      record.conversation=snapshot.path;record.finishedAt=new Date().toISOString();
      if(snapshot.error||/Something went wrong|Service temporarily unavailable|An error occurred while processing the request/i.test(snapshot.text)){record.failure=snapshot.error||snapshot.text.slice(-1600);break;}
      if(!testCase.format){
        record.reply=snapshot.text;record.completed=snapshot.text.length>60&&!snapshot.card;
        if(!record.completed)record.failure="Ordinary chat did not return a readable non-file answer.";
      }else{
        if(!snapshot.card?.includes("文档已生成")){record.failure="No successful document result card after completion.";break;}
        const document=await evaluate(`(async()=>{const c=[...document.querySelectorAll('.message-render')].at(-1),code=[...c.querySelectorAll('pre code')].find(e=>e.className.includes('language-oproxy_document'));if(!code)return null;const spec=JSON.parse(code.textContent);const response=await window.oproxyDesktop.lookupDocument({spec,requestId:location.pathname+':'+(c.id||'answer')+':'+JSON.stringify(spec)});return {spec,result:response.document};})()`);
        if(!document?.result||document.spec.type!==testCase.format){record.failure="Generated document receipt/format did not match case.";break;}
        const file=await fs.readFile(document.result.filePath);
        record.document={...document.result,sha256:crypto.createHash('sha256').update(file).digest('hex')};
        record.card=snapshot.card;
        await fs.writeFile(path.join(output,`${testCase.id}-spec.json`),JSON.stringify(document.spec,null,2)+"\n");
        const preview=await evaluate(`window.oproxyDesktop.documentAction({documentId:${JSON.stringify(document.result.documentId)},action:'preview'})`);
        if(!preview.ok){record.failure=preview.error;break;}
        record.previewOpened=true;
        record.previewInspection=await inspectPreview(document.spec.title,testCase.id);
        let pdfInspection;
        if(testCase.format==="pdf"){
          const reviewDirectory=path.join(output,"pdf-pages");
          try{
            await exec("swift",[fileURLToPath(new URL("./inspect-pdf.swift",import.meta.url)),document.result.filePath,reviewDirectory],{timeout:60000});
            pdfInspection=JSON.parse(await fs.readFile(path.join(reviewDirectory,"inspection.json"),"utf8"));
            record.pdfPageInspection=path.join(reviewDirectory,"inspection.json");
          }catch(error){record.pdfInspectionFailure=String(error.message||error).slice(0,1000);}
        }
        record.artifactValidation=await validateAcceptanceArtifact(testCase,document.spec,document.result.filePath,{pdfInspection});
        await fs.writeFile(path.join(output,`${testCase.id}-artifact-checks.json`),JSON.stringify(record.artifactValidation,null,2)+"\n");
        record.runtimeCompleted=true;
        record.completed=record.artifactValidation.passed;
        record.accepted=false;
        record.manualReviewRequired=true;
        if(!record.completed)record.failure="Generated file failed artifact acceptance checks; inspect recorded report. No automatic model resubmission.";
      }
      break;
    }
    await sleep(1500);
  }
  record.observedRequests=requestEvidence;
  requestEvidence=null;
  record.modelRequestVerified=record.observedRequests.length>0&&record.observedRequests.every(request=>request.models.length===1&&request.models[0]===expectedModel&&request.endpoints.includes("Oproxy OpenAI"));
  if(!record.modelRequestVerified){record.completed=false;record.failure=record.failure||"No observed request evidence proving the required Oproxy endpoint and model.";}
  if(!record.finishedAt&&!record.failure)record.observationTimeout=true;
  await fs.writeFile(receipt,JSON.stringify(record,null,2)+"\n");
  console.log(JSON.stringify(record,null,2));
  if(!record.completed)throw Error(record.failure||"Observation timeout: generation may still be live. Inspect same conversation; do not restart blindly.");
}
try{
  if(command==="status")console.log(JSON.stringify(await state(),null,2));
  else{
    const selected=command==="all"?acceptanceCases:acceptanceCases.filter(c=>c.id===command);
    if(!selected.length)throw Error("Usage: node scripts/live-acceptance.mjs status|all|chat|docx|pdf|xlsx|pptx");
    for(const testCase of selected)await run(testCase);
  }
}finally{for(const entry of pending.values())clearTimeout(entry.timer);ws.close();}
