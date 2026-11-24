import FormulaParser from "fast-formula-parser";
import ExcelJS from "exceljs";
import { Renderer } from "marked";
import { markdown } from "./markdown.js";
import { paginateSlides } from "./presentation-plan.js";
import { chartSvg } from "./chart-svg.js";
import { validateDocument } from "./schema.js";

export const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);
function prose(content){
  const renderer=Object.assign(new Renderer(),{html:()=>"",image:({text})=>escapeHtml(text||"")});
  renderer.link=function({href,tokens,text}){const label=tokens?this.parser.parseInline(tokens):escapeHtml(text);return /^(https?:|mailto:)/i.test(href)?`<a href="${escapeHtml(href)}">${label}</a>`:label;};
  return markdown.parse(content,{async:false,gfm:true,renderer});
}
const list=items=>items?.length?`<ul>${items.map(item=>`<li>${escapeHtml(item)}</li>`).join("")}</ul>`:"";
const table=(columns,rows)=>`<div class="table-scroll"><table><thead><tr>${columns.map(c=>`<th>${escapeHtml(c)}</th>`).join("")}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(c=>`<td>${escapeHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
function slideHtml(slide){
  if(slide.layout==="comparison")return `<div class="columns">${slide.columns.map(col=>`<article><h3>${escapeHtml(col.title)}</h3>${list(col.bullets)}</article>`).join("")}</div>`;
  if(slide.layout==="timeline")return `<ol class="columns timeline">${slide.steps.map(step=>`<li value="${step.stepNumber||1}"><h3>${escapeHtml(step.title)}</h3><p>${escapeHtml(step.detail)}</p></li>`).join("")}</ol>`;
  if(slide.layout==="metrics")return `<div class="columns">${slide.metrics.map(m=>`<article><strong class="metric">${escapeHtml(m.value)}</strong><h3>${escapeHtml(m.label)}</h3><p>${escapeHtml(m.detail)}</p></article>`).join("")}</div>`;
  if(slide.layout==="table")return table(slide.table.columns,slide.table.rows);
  if(slide.layout==="chart")return chartSvg(slide.chart);
  return list(slide.bullets);
}
async function workbookHtml(filePath){
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.readFile(filePath);
  const navigation=workbook.worksheets.map((sheet,i)=>`<a href="#sheet-${i}">${escapeHtml(sheet.name)}</a>`).join("");
  const sheets=workbook.worksheets.map((sheet,index)=>{
    const columns=Array.from({length:sheet.columnCount},(_,i)=>sheet.getColumn(i+1).letter);
    const rows=[];
    for(let row=1;row<=sheet.rowCount;row++){
      const cells=[];
      for(let col=1;col<=sheet.columnCount;col++){
        const cell=sheet.getCell(row,col),v=cell.value;
        // cell.result drops 0 in some ExcelJS versions; the loaded model has it.
        const value=v&&typeof v==="object"&&v.formula?cell.model.result:typeof v==="number"?v:cell.text;
        const numeric=typeof value==="number",formula=cell.formula;
        let display=value??"";
        if(numeric){
          try { display=FormulaParser.SSF.format(cell.numFmt||"General",value); }
          catch { display=String(value); }
        }
        cells.push(`<td${formula?` title="${escapeHtml('='+formula)}" class="formula"`:""}>${escapeHtml(display)}${formula?`<details><summary>公式</summary><code>${escapeHtml('='+formula)}</code></details>`:""}</td>`);
      }
      rows.push(`<tr><th scope="row">${row}</th>${cells.join("")}</tr>`);
    }
    return `<section id="sheet-${index}"><h2>${escapeHtml(sheet.name)}</h2><div class="table-scroll"><table class="workbook"><thead><tr><th></th>${columns.map(c=>`<th>${c}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div></section>`;
  }).join("");
  return `<nav>${navigation}</nav>${sheets}`;
}
export async function buildDocumentPreview(input,filePath){
  const spec=validateDocument(input);let body="",notice="内容预览；原始文件的字体与分页以所用文档编辑器为准。";
  if(spec.type==="xlsx"){
    body=await workbookHtml(filePath);notice="读取已生成工作簿的实际单元格与计算结果；展开单元格可查看公式。";
  }else if(spec.type==="pptx"&&spec.slides){
    body=`<section class="cover"><h1>${escapeHtml(spec.title)}</h1></section>`+paginateSlides(spec.slides).map((slide,i)=>`<section class="slide" id="slide-${i+1}"><p class="page-label">${i+1}</p><h2>${escapeHtml(slide.title)}</h2>${slide.subtitle?`<p class="subtitle">${escapeHtml(slide.subtitle)}</p>`:""}${slideHtml(slide)}${slide.source?`<p class="source">${escapeHtml(slide.source)}</p>`:""}${slide.notes?`<details class="notes"><summary>演讲备注</summary><p>${escapeHtml(slide.notes)}</p></details>`:""}</section>`).join("");
    notice="按实际续页计划查看全部内容与讲稿；此处不模拟 PowerPoint 原生编辑视图。";
  }else body=`<section class="prose">${prose(spec.content)}</section>`;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; script-src 'none'; base-uri 'none'; form-action 'none'"><title>${escapeHtml(spec.title)} · 文档预览</title><style>
  :root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#eef3f5;color:#142f3a;font:16px/1.7 -apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif}header{padding:24px 32px;background:white;border-bottom:1px solid #d5e3e6}header h1{font-size:23px;margin:0 0 8px}header p{margin:0;color:#526878;font-size:13px}main{max-width:1200px;padding:24px;margin:auto}section{scroll-margin-top:20px;background:white;padding:32px;margin:0 0 24px;border-radius:8px}h2,h3{line-height:1.4;color:#0f766e}h2{font-size:24px}h3{font-size:19px}p,li{overflow-wrap:anywhere}pre{white-space:pre-wrap;padding:16px;background:#f1f5f9}code{font-family:Menlo,monospace;font-size:13px}blockquote{border-left:4px solid #94a3b8;margin:20px 0;padding:8px 20px;background:#f8fafc}table{border-collapse:collapse;width:100%;font-size:14px}th,td{border:1px solid #d5e3e6;padding:10px 12px;vertical-align:top;min-width:90px;white-space:pre-wrap;overflow-wrap:anywhere}th{background:#e8f1f2}tr:nth-child(even) td{background:#f7fafb}.table-scroll{overflow:auto}.workbook td{max-width:360px;min-width:130px}.workbook th:first-child{min-width:45px}.formula{color:#135f90}details{font-size:13px}summary{cursor:pointer;color:#0f766e}.notes{padding:12px 16px;background:#f1f5f9;margin-top:24px}.notes p{white-space:pre-wrap}.columns{display:flex;gap:20px;padding:0}.columns>article,.timeline>li{flex:1;background:#eff5f6;padding:20px;min-width:0}.columns ul{padding-left:22px}.timeline{list-style-position:inside}.metric{font-size:36px;color:#0f766e}.cover{background:#142f3a;color:white;padding:70px 36px}.cover h1{font-size:32px}.page-label,.source{font-size:12px;color:#526878}.subtitle{color:#526878}svg{width:100%;height:auto}nav{display:flex;gap:12px;flex-wrap:wrap;padding:0 0 20px}nav a,a{color:#0f766e}nav a{background:white;padding:8px 16px;border-radius:6px}@media(max-width:750px){main{padding:12px}section{padding:20px}.columns{display:block}.columns>article,.timeline>li{margin-bottom:16px}}@media print{body{background:white}header{display:none}main{padding:0}section{break-before:page;box-shadow:none}section:first-child{break-before:auto}.notes{break-inside:avoid}details{display:block}}
  </style></head><body><header><h1>${escapeHtml(spec.title)}</h1><p>${escapeHtml(notice)}</p></header><main>${body}</main></body></html>`;
}
