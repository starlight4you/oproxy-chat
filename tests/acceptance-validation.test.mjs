import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import {createDocumentEngine} from "../src/documents/engine.js";
import {validateAcceptanceArtifact} from "../scripts/acceptance-validation.mjs";
const directory=await fs.mkdtemp(path.join(os.tmpdir(),"oproxy-acceptance-validator-"));
const engine=createDocumentEngine({directory});
const failIds=report=>report.checks.filter(c=>!c.passed).map(c=>c.id);

test("Acceptance rejects an openable Word file that fails required content",async()=>{
  const spec={type:"docx",title:"不足",filename:"short.docx",content:"只是一个提纲。"};
  const result=await engine.generateDocument(spec);
  const report=await validateAcceptanceArtifact({format:"docx",filename:spec.filename},spec,result.filePath);
  assert.equal(report.passed,false);
  assert.ok(failIds(report).includes("word-native-table"));
  assert.ok(failIds(report).includes("word-two-quote-paragraphs"));
  assert.ok(failIds(report).includes("word-task-state-retained"));
  assert.ok(failIds(report).includes("word-substantive-prose"));
});
test("Acceptance catches actual Word content removed after rendering",async()=>{
  const spec={type:"docx",title:"内容核对",filename:"content.docx",content:"## 目标\n\n"+"明确责任人与验收证据。".repeat(60)+"\n\n> 第一段引用\n>\n> 第二段引用必须保留\n\n|角色|证据|\n|---|---|\n|接收人|独立操作记录|\n\n- [x] 示例已约定\n- [ ] 实际待执行"};
  const result=await engine.generateDocument(spec);
  const before=await validateAcceptanceArtifact({format:"docx",filename:spec.filename},spec,result.filePath);
  assert.equal(before.passed,true);assert.equal(before.manualReviewRequired,true);
  const zip=await JSZip.loadAsync(await fs.readFile(result.filePath));
  zip.file("word/document.xml",(await zip.file("word/document.xml").async("string")).replace("第二段引用必须保留",""));
  await fs.writeFile(result.filePath,await zip.generateAsync({type:"nodebuffer"}));
  const after=await validateAcceptanceArtifact({format:"docx",filename:spec.filename},spec,result.filePath);
  assert.equal(after.passed,false);assert.ok(failIds(after).includes("word-source-content-retained"));
});
test("Acceptance rejects a PDF header without actual page inspection",async()=>{
  const spec={type:"pdf",title:"PDF验收",filename:"check.pdf",content:"## 范围\n\n"+"本检查表供接收人验证交付内容与证据。".repeat(30)+"\n\n|项目|结果|\n|---|---|\n|标题|________|\n\n|整改|责任人|\n|---|---|\n|________|________|\n\n签字：________ 日期：________"};
  const file=path.join(directory,spec.filename);await fs.writeFile(file,"%PDF-"+"fake".repeat(500));
  const report=await validateAcceptanceArtifact({format:"pdf",filename:spec.filename},spec,file);
  assert.equal(report.passed,false);assert.ok(failIds(report).includes("pdf-page-inspection"));
});
test("Acceptance detects a workbook cell changed after generation",async()=>{
  const spec={type:"xlsx",title:"少量预算",filename:"data.xlsx",sheets:[{name:"假设",columns:["金额"],rows:[[100]]},{name:"明细",columns:["部门","金额"],rows:[["A",100]]},{name:"汇总",columns:["合计"],rows:[[{formula:"SUMIF('明细'!A2:A2,\"A\",'明细'!B2:B2)",result:100}]]}]};
  const result=await engine.generateDocument(spec);
  const zip=await JSZip.loadAsync(await fs.readFile(result.filePath));
  zip.file("xl/worksheets/sheet1.xml",(await zip.file("xl/worksheets/sheet1.xml").async("string")).replace("<v>100</v>","<v>999</v>"));
  await fs.writeFile(result.filePath,await zip.generateAsync({type:"nodebuffer"}));
  const report=await validateAcceptanceArtifact({format:"xlsx",filename:spec.filename},spec,result.filePath);
  assert.equal(report.passed,false);assert.ok(failIds(report).includes("workbook-values-types-and-formulas-retained"));
});
test.after(async()=>{await fs.rm(directory,{recursive:true,force:true});});
