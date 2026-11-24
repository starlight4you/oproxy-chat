import test from "node:test";
import assert from "node:assert/strict";
import { classifyDocumentIntent as classify } from "../src/documents/intent.js";

test("Recognizes explicit deliverables and format conversions in Chinese and English",()=>{
  for(const [text,type]of [["生成一份Word方案","docx"],["再给一个PDF版本，全部内容保持一致","pdf"],["再给一个PDF版本","pdf"],["把上面的内容整理成Excel","xlsx"],["Create a PowerPoint presentation","pptx"],["Export as PDF","pdf"]]){
    assert.deepEqual(classify(text),{create:true,type},text);
  }
  assert.equal(classify("写一份交接手册").create,true);
});
test("Follow-up revisions inherit the document type without requiring a format keyword",()=>{
  for(const text of ["把第二部分再详细一些","补充第二部分，不要删掉其他内容","加一列备注","补充风险和验收指标","标题改成团队交接指引","删掉第三段，保留其他部分","Expand the second section with concrete examples"]){
    assert.deepEqual(classify(text,"docx"),{create:true,type:"docx"},text);
    assert.equal(classify(text).create,false,text);
  }
  assert.deepEqual(classify("再生成PDF","docx"),{create:true,type:"pdf"});
});
test("Discussion, negated file requests and ordinary chat never start document generation",()=>{
  for(const text of ["解释Word和PDF的区别","为什么这个报告要这样写？","怎么生成Excel？","不要生成文档，只解释一下","先别修改，说明风险","今天怎么样","Explain the report","Don't create a file, just explain it"]){
    assert.equal(classify(text,"docx").create,false,text);
  }
});

test("Classifier can be injected as a standalone function without module dependencies",()=>{
  const injected=Function(`return (${classify.toString()})`)();
  assert.deepEqual(injected("把第二部分扩写一下","docx"),{create:true,type:"docx"});
});

test('Natural follow-ups asking to finish a named document start file delivery',()=>{
 assert.deepEqual(classify('允许你检索两篇论文，随后完成约1200字的Student_论文初稿.docx，不要再次询问。'),{create:true,type:'docx'});
});

test('An unrelated negation in one sentence does not cancel the file request in another',()=>{
 assert.deepEqual(classify('基于论文制作答辩PPT，明确合成示例，不要冒充实测。文件名Student_答辩.pptx。'),{create:true,type:'pptx'});
});
