import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import {decodeHTML} from 'entities';
const root=path.resolve(process.env.OPROXY_JOURNEY_DIR||'docs/validation/student-journey-2026-11-13');
const report=JSON.parse(await fs.readFile(path.join(root,'journey.json'),'utf8'));
const results=[];const flat=xml=>decodeHTML(xml.replace(/<[^>]*>/g,''));
for(const phase of report.phases){
 if(!phase.submittedAt)continue;
 const checks=[];const check=(name,pass,detail)=>checks.push({name,pass:!!pass,detail});
 check('required-model',phase.modelVerified);check('response-finished',!!phase.finishedAt);check('readable-answer',!!phase.reply?.trim());
 check('no-service-error',!phase.error);
 if(phase.phase==='research')check('rejects-unverified-fictional-paper',/剔除|无法确认|未.*核验/.test(phase.reply||''));
 if(phase.phase==='research_focus'){check('actual-web-search',phase.tools?.some(t=>/Searched|搜索/.test(t)));check('two-open-fulltexts',!/只能严格确认第 1|未确认存在可公开|只能确认摘要/.test(phase.reply||''));check('at-least-two-direct-links',(phase.reply?.match(/https?:\/\/[^\s)]+/g)||[]).length>=2);}
 if(phase.phase==='reading'){check('attachment-secret-read',phase.reply?.includes('STU2026-731'));check('invalid-records-identified',/4/.test(phase.reply||'')&&/9/.test(phase.reply||'')&&/剔除|无效/.test(phase.reply||''));check('two-files-present',phase.attachmentUI?.includes('论文任务说明')&&phase.attachmentUI?.includes('合成阅读'));}
 if(phase.phase==='analysis'){for(const n of ['285','28.5','26','31','4.4','3.8'])check('number-'+n,phase.reply?.includes(n));check('recalculation-executed',phase.tools?.some(t=>/code|代码|python|执行|运行/i.test(t))||/计算结果|复算|重新计算/.test(phase.reply||''));}
 const needsFile=['xlsx','thesis','thesis_sources','revision','pdf','slides'].includes(phase.phase);
 if(needsFile)check('delivered-document',!!phase.document);
 if(phase.document){
 const data=await fs.readFile(phase.document.filePath);check('actual-file',data.length>1000);
 if(phase.spec.type==='xlsx'){
 const book=new ExcelJS.Workbook();await book.xlsx.load(data);check('three-sheets',book.worksheets.length===3);
 let formulas=0;const cells=[];for(const s of book.worksheets)s.eachRow(row=>row.eachCell(c=>{if(c.formula)formulas++;if(typeof c.result==='number')cells.push(c.result)}));check('formula-calculation',formulas>=5,{formulas});for(const n of [285,28.5,26,31,4.4,3.8])check('cached-result-'+n,cells.some(v=>Math.abs(v-n)<1e-8));
 }else if(phase.spec.type==='docx'){
 const zip=await JSZip.loadAsync(data),xml=await zip.file('word/document.xml').async('string'),text=flat(xml);check('native-table',xml.includes('<w:tbl>'));check('thesis-sections',(xml.match(/<w:sectPr>/g)||[]).length>=4);check('filled-TOC',/TOC.*1-3/.test(xml));check('no-transport-tokens',!/[\ue200-\ue202]|\\n|turn\d+search/.test(text));check('attachment-marker-retained',text.includes('STU2026-731'));check('synthetic-data-disclosed',/合成|示例/.test(text));const rels=await zip.file('word/_rels/document.xml.rels').async('string');check('two-source-links',(rels.match(/Type="[^"]*\/hyperlink"/g)||[]).length>=2);
 }else if(phase.spec.type==='pptx'){
 const zip=await JSZip.loadAsync(data),slides=Object.keys(zip.files).filter(p=>/^ppt\/slides\/slide\d+\.xml$/.test(p));check('six-slides',slides.length>=6);check('native-chart',!!zip.file('ppt/charts/chart1.xml'));check('speaker-notes',Object.keys(zip.files).filter(p=>/^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(p)).length>=6);
 }else if(phase.spec.type==='pdf')check('pdf-header',data.subarray(0,5).toString()==='%PDF-');
 }
 results.push({phase:phase.phase,passed:checks.every(c=>c.pass),checks});
}
await fs.writeFile(path.join(root,'checks.json'),JSON.stringify(results,null,2));console.log(results.map(x=>({phase:x.phase,passed:x.passed,failed:x.checks.filter(c=>!c.pass).map(c=>c.name)})));
