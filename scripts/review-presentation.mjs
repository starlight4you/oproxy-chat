// Developer-only import review of an actual PPTX via macOS Quick Look HTML.
// Capture each slide independently; this does not claim Office editing fidelity.
import {app,BrowserWindow} from "electron";
import fs from "node:fs/promises";
import path from "node:path";
app.on("window-all-closed",()=>{});
app.whenReady().then(async()=>{
  let window;
  try{
    const [input,directory]=process.argv.slice(2);
    if(!input||!directory)throw Error("Usage: electron scripts/review-presentation.mjs Preview.html output-directory");
    await fs.mkdir(directory,{recursive:true});
    window=new BrowserWindow({show:false,width:1400,height:900,useContentSize:true,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true}});
    await window.loadFile(path.resolve(input));
    const slides=await window.webContents.executeJavaScript(`(()=>[...document.querySelectorAll('div.slide')].map((slide,index)=>({index,text:slide.innerText})))()`);
    const report=[];
    for(let index=0;index<slides.length;index++){
      await window.webContents.executeJavaScript(`(()=>{document.body.style.margin='0';document.body.style.background='white';document.querySelectorAll('div.slide').forEach((slide,i)=>{slide.style.display=i===${index}?'block':'none';slide.style.margin='0';});window.scrollTo(0,0);})()`);
      await window.webContents.executeJavaScript("document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))");
      const bounds=await window.webContents.executeJavaScript(`(()=>{const slide=[...document.querySelectorAll('div.slide')][${index}];const b=slide.getBoundingClientRect();return {x:Math.round(b.x),y:Math.round(b.y),width:Math.ceil(b.width),height:Math.ceil(b.height)};})()`);
      const image=await window.webContents.capturePage(bounds);const name=`slide-${String(index+1).padStart(2,'0')}.png`;
      await fs.writeFile(path.join(directory,name),image.toPNG());report.push({...slides[index],image:name});
    }
    await fs.writeFile(path.join(directory,"inspection.json"),JSON.stringify({input,slides:report},null,2));
    console.log(JSON.stringify({slides:slides.length,directory}));app.exit(0);
  }catch(error){console.error(error);app.exit(1);}finally{window?.destroy();}
});
