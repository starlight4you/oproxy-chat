import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDocumentEnvelope as parse} from '../src/documents/protocol.js';
const fence='`'.repeat(3);
test('Recovers an inline explicit document fence and preserves complete JSON strings, braces, links and formatting',()=>{
 const spec={type:'docx',title:'论文',content:'## 摘要\n\n**标签**：[来源](https://example.com)。{内部示例}\n\n结尾',summary:'第一条\n第二条'};
 assert.deepEqual(parse('简短回应。'+fence+'oproxy_document\n'+JSON.stringify(spec)+'\n'+fence+'后文{}'),spec);
 assert.deepEqual(parse(JSON.stringify(spec),true),spec);
 assert.equal(parse(fence+'text\n'+JSON.stringify(spec)+fence),null);
 assert.equal(parse('解释示例：'+JSON.stringify(spec)),null);
 assert.equal(parse(fence+'oproxy_document\n{"type":"docx","title":"x","content":"截断'),null);
});
test('Decodes only double-escaped prose; valid code, formulas and file paths retain backslashes',()=>{
 const spec={type:'docx',title:'测试',filename:String.raw`C:\new.docx`,content:String.raw`## 摘要\n\n正文\n\n代码示例：`+'`'+String.raw`\n`+'`'};
 const result=parse(JSON.stringify(spec),true);
 assert.equal(result.content,'## 摘要\n\n正文\n\n代码示例：`\\n`');assert.equal(result.filename,spec.filename);
 const book={type:'xlsx',title:'表格',sheets:[{rows:[[String.raw`C:\new`,{formula:String.raw`IF(A1="\n",1,0)`}]]}]};
 assert.deepEqual(parse(JSON.stringify(book),true),book);
});

test('Skill fence works inline after prose while ordinary text and malformed requests are ignored',async()=>{
 const {parseSkillEnvelope}=await import('../src/documents/protocol.js');
 assert.equal(parseSkillEnvelope('准备文档。'+fence+'oproxy_skill\n{"type":"xlsx"}\n'+fence),'xlsx');
 assert.equal(parseSkillEnvelope('{"type":"docx"}',true),'docx');
 assert.equal(parseSkillEnvelope(fence+'json\n{"type":"docx"}'+fence),null);
 assert.equal(parseSkillEnvelope(fence+'oproxy_skill\n{"type":"shell"}'),null);
});
