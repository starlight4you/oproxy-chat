// Read-only final evidence audit. A header, success card or opening a window
// cannot independently satisfy document quality or distribution gates.
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import {acceptanceCases} from "./acceptance-cases.mjs";
const root=path.resolve(process.argv[2]||"dist/live-acceptance-060");
const gates=[];
const gate=(id,passed,detail)=>gates.push({id,passed:!!passed,detail});
async function read(file){try{return JSON.parse(await fs.readFile(path.join(root,file),"utf8"));}catch{return null;}}
const pkg=await read("package-verification.json");
gate("installed-source-and-dependencies",pkg?.ok===true,{version:pkg?.version});
const distribution=await read("distribution-verification.json");
gate("notarized-distribution",distribution?.passed===true,{failed:distribution?.checks?.filter(c=>!c.passed).map(c=>c.id)});
for(const testCase of acceptanceCases){
  const run=await read(`${testCase.id}.json`);
  gate(`${testCase.id}-actual-runtime`,!!run?.completed,{conversation:run?.conversation,failure:run?.failure||(!run?"No actual model run recorded":undefined)});
  gate(`${testCase.id}-required-model`,run?.model==="gpt-6.1-sol"&&run?.modelRequestVerified===true);
  if(testCase.format){
    gate(`${testCase.id}-artifact-checks`,run?.artifactValidation?.passed===true);
    gate(`${testCase.id}-preview`,run?.previewOpened===true&&run?.previewInspection?.bridge==="undefined"&&run?.previewInspection?.textChars>50);
    let matches=false;
    if(run?.document?.filePath){try{matches=crypto.createHash("sha256").update(await fs.readFile(run.document.filePath)).digest("hex")===run.document.sha256;}catch{}}
    gate(`${testCase.id}-current-artifact-hash`,matches);
    const review=await read(`${testCase.id}-manual-review.json`);
    gate(`${testCase.id}-all-page-and-content-review`,review?.accepted===true&&review?.allPagesReviewed===true&&review?.artifactSha256===run?.document?.sha256&&typeof review?.reviewedBy==="string"&&review.reviewedBy.trim().length>0);
  }
}
const login=await read("fresh-login.json");
gate("fresh-oidc-login-observed",login?.authenticated===true&&login?.profileWasFresh===true);
const restart=await read("restart-verification.json");
gate("restart-login-and-receipts",restart?.loginRestored===true&&restart?.allDocumentReceiptsRestored===true);
const machine=await read("clean-machine-review.json");
gate("independent-clean-machine",machine?.accepted===true&&machine?.noAdditionalSoftwareRequired===true&&machine?.gatekeeperAccepted===true);
const report={checkedAt:new Date().toISOString(),root,passed:gates.every(g=>g.passed),gates};
await fs.writeFile(path.join(root,"acceptance-audit.json"),JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
