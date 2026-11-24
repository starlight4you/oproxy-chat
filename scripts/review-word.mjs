// Developer-only: print macOS Quick Look's interpretation of an actual DOCX.
// This is an import review, not proof of Microsoft Word pagination fidelity.
import { app, BrowserWindow } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
app.on("window-all-closed",()=>{});
app.whenReady().then(async()=>{
  let window;
  try{
    const [input,output]=process.argv.slice(2);
    if(!input||!output)throw Error("Usage: electron scripts/review-word.mjs QuickLook-Preview.html review.pdf");
    window=new BrowserWindow({show:false,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true}});
    await window.loadFile(path.resolve(input));
    const inspection=await window.webContents.executeJavaScript(`(()=>{const pages=[...document.body.children];return {text:document.body.innerText,height:document.body.scrollHeight,blocks:pages.length};})()`);
    await window.webContents.insertCSS(`@media print {body{margin:0!important}body>div{overflow:visible!important;min-height:0!important;width:auto!important;padding:0!important}p{orphans:3;widows:3}tr{break-inside:avoid}}`);
    const pdf=await window.webContents.printToPDF({pageSize:"A4",printBackground:true,margins:{top:0.6,bottom:0.6,left:0.6,right:0.6}});
    await fs.writeFile(output,pdf);await fs.writeFile(output+".json",JSON.stringify(inspection,null,2));
    console.log(JSON.stringify({output,bytes:pdf.length,importedTextChars:inspection.text.length}));app.exit(0);
  }catch(error){console.error(error);app.exit(1);}finally{window?.destroy();}
});
