import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {createDocumentService} from "../src/documents/service.js";
import {buildDocumentPreview} from "../src/documents/preview.js";
const directory=await fs.mkdtemp(path.join(os.tmpdir(),"oproxy-previews-"));

test("Word preview retains nested markdown and forbids active or remote content",async()=>{
  const html=await buildDocumentPreview({type:"docx",title:"预览",content:'## 说明\n\n> 第一段\n>\n> 第二段\n\n- **重点**\n  - 子项\n\n<script>alert(1)</script>\n\n![远程图片](https://example.com/image.png)\n\n[危险链接](javascript:alert(1))'},"unused");
  assert.match(html,/第一段/);assert.match(html,/第二段/);assert.match(html,/<strong>重点<\/strong>/);assert.match(html,/子项/);
  assert.doesNotMatch(html,/<script>|javascript:|<img/);assert.match(html,/script-src 'none'/);
});
test("Workbook preview reads actual calculated values and persisted zero results",async()=>{
  const opts={directory,stateDirectory:path.join(directory,"state")},service=createDocumentService(opts);
  const request={requestId:"excel-preview",spec:{type:"xlsx",title:"核算",sheets:[{name:"预算",columns:["数量","金额","结果"],formats:["0","#,##0.00","0.0%"],rows:[[2,100,{formula:"B2/100",result:999}],[0,{formula:"B2-100",result:999},0.5]]}]}};
  const result=await service.generate(request);assert.ok(result.previewPath);
  const preview=await createDocumentService(opts).previewDocument(result.documentId);
  assert.match(preview.html,/100\.00/);assert.match(preview.html,/100\.0%/);assert.match(preview.html,/0\.00/);assert.match(preview.html,/50\.0%/);
  assert.match(preview.html,/=B2\/100/);assert.match(preview.html,/预算/);
  await fs.unlink(result.previewPath);await assert.rejects(service.previewDocument(result.documentId));
});
test("Presentation preview includes all continuation commentary and speaker notes",async()=>{
  const html=await buildDocumentPreview({type:"pptx",title:"演示",slides:[{title:"对比",layout:"comparison",columns:[{title:"A",bullets:["方案A"]},{title:"B",bullets:["方案B"]}],bullets:["重要补充解释"],notes:"详细讲稿必须保留"},{title:"预算图",layout:"chart",chart:{type:"bar",categories:["软件","培训"],series:[{name:"预算",values:[6000,2000]}]}}]},"unused");
  assert.match(html,/方案A/);assert.match(html,/方案B/);assert.match(html,/重要补充解释/);assert.match(html,/详细讲稿必须保留/);assert.match(html,/<svg/);assert.match(html,/6,000/);
});
test("Preview actions require a valid receipt and reject a symlink replacement",async()=>{
  const service=createDocumentService({directory,stateDirectory:path.join(directory,"safe-state")});
  await assert.rejects(service.previewDocument("untrusted-path"),/标识无效/);
  const result=await service.generate({requestId:"safe-preview",spec:{type:"docx",title:"安全预览",content:"正文"}});
  await fs.unlink(result.previewPath);await fs.symlink(result.filePath,result.previewPath);
  await assert.rejects(service.previewDocument(result.documentId),/预览文件无效/);
});
test.after(async()=>{await fs.rm(directory,{recursive:true,force:true});});
