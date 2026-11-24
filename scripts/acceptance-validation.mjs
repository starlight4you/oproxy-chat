// Developer-only validation of actual generated artifacts. These structural
// checks do not prove factual accuracy, design quality or native Office layout.
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import JSZip from "jszip";
import ExcelJS from "exceljs";
import { decodeHTML } from "entities";
import { Lexer } from "marked";
import { markdown } from "../src/documents/markdown.js";
import { validateDocument } from "../src/documents/schema.js";
import { paginateSlides } from "../src/documents/presentation-plan.js";

const normalize=value=>String(value??"").replace(/\s+/g,"");
const xmlText=xml=>decodeHTML(xml.replace(/<[^>]*>/g,""));
function inlineText(value){
  const read=tokens=>tokens.map(t=>t.type==="html"?"":t.type==="br"?"\n":t.tokens?read(t.tokens):decodeHTML(t.text??t.raw??"")).join("");
  return read(new Lexer(markdown.defaults).inlineTokens(String(value??"")));
}
export function markdownFields(content){
  const fields=[];let tables=0,quoteParagraphs=0,tasks=0;
  function visit(tokens,quote=false){
    for(const token of tokens){
      if(token.type==="list")for(const item of token.items){if(item.task)tasks++;visit(item.tokens,quote);}
      else if(token.type==="blockquote")visit(token.tokens,true);
      else if(token.type==="table"){tables++;for(const cell of [...token.header,...token.rows.flat()])fields.push(inlineText(cell.text));}
      else if(["heading","paragraph","text","code"].includes(token.type)){
        fields.push(token.type==="code"?token.text:inlineText(token.text));
        if(quote&&["paragraph","text"].includes(token.type))quoteParagraphs++;
      }
    }
  }
  visit(markdown.lexer(content));
  return {fields:fields.filter(s=>normalize(s)),tables,quoteParagraphs,tasks};
}
const same=(actual,expected)=>typeof expected==="number"?typeof actual==="number"&&Math.abs(actual-expected)<=1e-10*Math.max(1,Math.abs(expected)):actual===expected;
export async function validateAcceptanceArtifact(testCase,input,filePath,{pdfInspection}={}){
  const checks=[];
  const check=(id,passed,detail)=>checks.push({id,passed:!!passed,detail});
  let spec;
  try{spec=validateDocument(input);check("valid-document-spec",true);}
  catch(error){check("valid-document-spec",false,String(error.message));return {passed:false,checks,manualReviewRequired:true};}
  check("requested-format",spec.type===testCase.format,{requested:testCase.format,actual:spec.type});
  if(testCase.filename)check("requested-filename",path.basename(filePath)===testCase.filename&&spec.filename===testCase.filename,{requested:testCase.filename,spec:spec.filename,actual:path.basename(filePath)});
  const bytes=await fs.readFile(filePath);
  check("nonempty-real-file",bytes.length>1000,{bytes:bytes.length});
  const integrity={bytes:bytes.length,sha256:crypto.createHash("sha256").update(bytes).digest("hex")};
  if(spec.type==="pdf"){
    check("pdf-header",bytes.subarray(0,5).toString()==="%PDF-");
    const structure=markdownFields(spec.content);
    check("substantive-prose",normalize(inlineText(spec.content)).length>400,{characters:spec.content.length});
    check("requested-two-tables",structure.tables>=2,{tables:structure.tables});
    check("form-blanks-in-source",(spec.content.match(/_{4,}/g)||[]).length>=3);
    check("signature-section-in-source",/签字|签署/.test(spec.content));
    if(pdfInspection){
      const pages=pdfInspection.pages||[],text=normalize(pages.map(p=>p.text||"").join(""));
      check("all-pdf-pages-readable",pages.length>0&&pages.every(p=>(p.text||"").trim().length>10),{pages:pages.length});
      const missing=structure.fields.filter(field=>!text.includes(normalize(field)));
      check("pdf-text-retained",missing.length===0,{fields:structure.fields.length,missing:missing.map(s=>s.slice(0,100))});
      check("pdf-form-blanks-retained",text.includes("____"));
    }else check("pdf-page-inspection",false,"No actual PDF page/text inspection supplied; header alone is insufficient.");
  }else{
    let zip;
    try{zip=await JSZip.loadAsync(bytes);check("office-package-readable",true);}
    catch(error){check("office-package-readable",false,error.message);return {passed:false,checks,integrity,manualReviewRequired:true};}
    if(spec.type==="docx"){
      const document=zip.file("word/document.xml");
      check("word-main-document",!!document);
      if(document){
        const xml=await document.async("string"),text=normalize(xmlText(xml)),structure=markdownFields(spec.content);
        const missing=structure.fields.filter(field=>!text.includes(normalize(field)));
        check("word-source-content-retained",missing.length===0,{fields:structure.fields.length,missing:missing.map(s=>s.slice(0,100))});
        check("word-substantive-prose",text.length>500,{characters:text.length});
        check("word-native-table",(xml.match(/<w:tbl>/g)||[]).length>=Math.max(1,structure.tables));
        check("word-two-quote-paragraphs",structure.quoteParagraphs>=2,{quoteParagraphs:structure.quoteParagraphs});
        check("word-task-state-retained",structure.tasks>=2&&(xml.match(/☐|☑/g)||[]).length===structure.tasks,{sourceTasks:structure.tasks,outputTasks:(xml.match(/☐|☑/g)||[]).length});
        check("word-has-section-hierarchy",/w:pStyle w:val="Heading[12]"/.test(xml));
      }
    }else if(spec.type==="xlsx"){
      const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(bytes);
      const definitions=spec.sheets||[];
      check("three-required-worksheets",workbook.worksheets.length===3&&["假设","明细","汇总"].every(name=>!!workbook.getWorksheet(name)),{names:workbook.worksheets.map(s=>s.name)});
      const mismatches=[],badCaches=[];let formulas=0,crossSheet=0,conditional=0,percent=false,money=false;
      for(const def of definitions){
        const sheet=workbook.getWorksheet(def.name);if(!sheet){mismatches.push(`Missing sheet: ${def.name}`);continue;}
        def.columns?.forEach((value,i)=>{if(sheet.getCell(1,i+1).value!==value)mismatches.push(`${def.name}!${sheet.getCell(1,i+1).address}: header mismatch`);});
        for(let row=0;row<(def.rows||[]).length;row++)for(let col=0;col<def.rows[row].length;col++){
          const source=def.rows[row][col],cell=sheet.getCell(row+(def.columns?.length?2:1),col+1),label=`${def.name}!${cell.address}`;
          if(source&&typeof source==="object"&&source.formula){
            formulas++;if(source.formula.includes("!"))crossSheet++;if(/SUMIFS?\(/i.test(source.formula))conditional++;
            if(cell.formula!==source.formula.replace(/^=/,""))mismatches.push(`${label}: formula mismatch`);
            const actual=cell.model.result;
            if(!["number","string","boolean"].includes(typeof actual)||typeof actual==="number"&&!Number.isFinite(actual))badCaches.push(label);
          }else if(!same(cell.value??null,source??null))mismatches.push(`${label}: value/type mismatch`);
          const format=cell.numFmt||"";percent ||= format.includes("%");money ||= /\.00/.test(format)&&!format.includes("%");
        }
      }
      check("workbook-values-types-and-formulas-retained",mismatches.length===0,{mismatches});
      check("workbook-formula-caches-readable",badCaches.length===0&&formulas>=10,{formulas,badCaches});
      check("workbook-cross-sheet-and-conditional-formulas",crossSheet>0&&conditional>0,{crossSheet,conditional});
      check("workbook-numeric-display-formats",percent&&money,{percent,money});
      // This validates the persisted artifact. Independent business totals and
      // formula semantics still need a separate review, not the same parser.
    }else if(spec.type==="pptx"){
      const paths=Object.keys(zip.files).filter(p=>/^ppt\/slides\/slide\d+\.xml$/.test(p));
      const xml=(await Promise.all(paths.map(p=>zip.file(p).async("string")))).join(""),text=normalize(xmlText(xml));
      const planned=paginateSlides(spec.slides||[]);
      check("presentation-actual-page-count",paths.length===planned.length+1,{actual:paths.length,planned:planned.length+1});
      const fields=planned.flatMap(slide=>[slide.title,slide.subtitle,slide.source,...(slide.bullets||[]),...(slide.columns||[]).flatMap(c=>[c.title,...c.bullets]),...(slide.steps||[]).flatMap(s=>[s.title,s.detail]),...(slide.metrics||[]).flatMap(m=>[m.label,m.value,m.detail]),...(slide.table?[...slide.table.columns,...slide.table.rows.flat().map(String)]:[])]).filter(Boolean);
      const missing=fields.filter(field=>!text.includes(normalize(field)));
      check("presentation-visible-content-retained",missing.length===0,{fields:fields.length,missing:missing.map(s=>s.slice(0,100))});
      const charts=Object.keys(zip.files).filter(p=>/^ppt\/charts\/chart\d+\.xml$/.test(p));
      check("presentation-native-chart-and-data",charts.length>0&&Object.keys(zip.files).some(p=>p.startsWith("ppt/embeddings/")&&p.endsWith(".xlsx")));
      const notesPaths=Object.keys(zip.files).filter(p=>/^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(p));
      const notes=normalize(xmlText((await Promise.all(notesPaths.map(p=>zip.file(p).async("string")))).join("")));
      check("presentation-speaker-notes-retained",planned.every(s=>s.notes&&notes.includes(normalize(s.notes))));
      check("presentation-rich-layouts",["metrics","comparison","timeline","table","chart"].every(type=>planned.some(s=>s.layout===type)));
      const commentary=(spec.slides||[]).filter(s=>["comparison","table","chart"].includes(s.layout));
      check("presentation-commentary-request",commentary.length>=3&&commentary.every(s=>(s.bullets||[]).length>=2));
    }
  }
  return {passed:checks.every(c=>c.passed),checks,integrity,manualReviewRequired:true,
    limitations:["Structural checks do not prove factual accuracy or business reasoning.","Visual review of all pages and independent arithmetic review remain required."]};
}
