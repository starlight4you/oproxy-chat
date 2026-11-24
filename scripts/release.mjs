import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { releaseConfig } from "./release-config.mjs";

const root=fileURLToPath(new URL("../",import.meta.url));
try{
  const identities=execFileSync("security",["find-identity","-v","-p","codesigning"],{encoding:"utf8"});
  const config=releaseConfig(process.env,identities,path.join(root,"build"));
  if(process.argv.includes("--check")){console.log("Developer ID 与公证凭据配置检查通过；尚未签名或公证任何产物。");process.exit(0);}
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),"oproxy-release-"));
  try{
    const file=path.join(directory,"release.json");await fs.writeFile(file,JSON.stringify(config));
    const builder=path.join(root,"node_modules/electron-builder/cli.js");
    const child=spawn(process.execPath,[builder,"--config",file,"--mac","--arm64",...process.argv.slice(2)],{cwd:root,stdio:"inherit",env:process.env});
    process.exitCode=await new Promise(resolve=>{child.once("error",()=>resolve(1));child.once("exit",code=>resolve(code??1));});
  }finally{await fs.rm(directory,{recursive:true,force:true});}
}catch(error){console.error(String(error.message||error));process.exitCode=1;}
