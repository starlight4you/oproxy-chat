// Read-only release gate: verify an actual bundle, not merely signing config.
import fs from "node:fs/promises";
import path from "node:path";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import crypto from "node:crypto";
const exec=promisify(execFile);
const bundle=path.resolve(process.argv[2]||"/Applications/Oproxy Chat.app");
const output=path.resolve(process.argv[3]||"dist/distribution-verification.json");
async function check(id,cmd,args,accept=()=>true){
  try{const result=await exec(cmd,args,{timeout:60000,maxBuffer:1024*1024});const text=(result.stdout||"")+(result.stderr||"");return {id,passed:accept(text),exitCode:0,output:text.trim()};}
  catch(error){return {id,passed:false,exitCode:error.code??null,output:String(error.stderr||error.stdout||error.message).trim()};}
}
const checks=[];
checks.push(await check("bundle-integrity","codesign",["--verify","--deep","--strict",bundle]));
checks.push(await check("developer-id-and-hardened-runtime","codesign",["--display","--verbose=4",bundle],text=>/Authority=Developer ID Application:/.test(text)&&/flags=.*runtime/.test(text)));
checks.push(await check("stapled-notarization","xcrun",["stapler","validate",bundle]));
checks.push(await check("gatekeeper","spctl",["--assess","--type","execute","--verbose=4",bundle],text=>/accepted/.test(text)&&/Notarized Developer ID/.test(text)));
const archive=path.join(bundle,"Contents/Resources/app.asar");
let archiveSha256;
try{archiveSha256=crypto.createHash("sha256").update(await fs.readFile(archive)).digest("hex");}catch{}
const report={checkedAt:new Date().toISOString(),bundle,archiveSha256,passed:checks.every(c=>c.passed),checks};
await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report,null,2));
if(!report.passed)process.exitCode=1;
