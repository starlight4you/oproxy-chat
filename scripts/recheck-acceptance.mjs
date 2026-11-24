// Inspect a previously attempted case without submitting another model request.
import fs from "node:fs/promises";
import path from "node:path";
import {acceptanceCases} from "./acceptance-cases.mjs";
import {validateAcceptanceArtifact} from "./acceptance-validation.mjs";
const id=process.argv[2],root=path.resolve(process.argv[3]||"dist/live-acceptance-060");
const testCase=acceptanceCases.find(c=>c.id===id&&c.format);
if(!testCase)throw Error("Usage: node scripts/recheck-acceptance.mjs docx|pdf|xlsx|pptx [run-directory]");
const record=JSON.parse(await fs.readFile(path.join(root,`${id}.json`),"utf8"));
const spec=JSON.parse(await fs.readFile(path.join(root,`${id}-spec.json`),"utf8"));
if(!record.document?.filePath)throw Error("No generated artifact recorded; inspect the original live conversation.");
let pdfInspection;
if(id==="pdf"){
  try{pdfInspection=JSON.parse(await fs.readFile(record.pdfPageInspection||path.join(root,"pdf-pages/inspection.json"),"utf8"));}catch{}
}
const report=await validateAcceptanceArtifact(testCase,spec,record.document.filePath,{pdfInspection});
await fs.writeFile(path.join(root,`${id}-artifact-recheck.json`),JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report,null,2));
if(!report.passed)process.exitCode=1;
