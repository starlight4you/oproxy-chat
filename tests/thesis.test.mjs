import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {renderWord,isThesisDocument} from '../src/documents/word.js';
const content='# 本科毕业论文\n\n## 示例论文\n\n**学生姓名：**__________\n\n---\n\n## 摘要\n\n正文摘要。\n\n**关键词：**测试；排版\n\n---\n\n## 目录\n\n1. 绪论\n2. 结论\n\n---\n\n# 1 绪论\n\n## 1.1 研究方法\n\n段落内容。[来源](https://example.com)\n\n|项目|结果|\n|---|---|\n|标题|存在|\n\n# 2 结论\n\n完整结论。\n\n# 参考文献\n\n[1] [论文](https://example.com/paper)\n\n## 致谢\n\n感谢。';
test('Thesis output has independent cover, abstract, populated TOC, A4, Chinese styles, chapter breaks and native tables',async()=>{
 assert.equal(isThesisDocument({type:'docx',content}),true);
 const zip=await JSZip.loadAsync(await renderWord('示例论文',content,{documentStyle:'thesis'}));
 const doc=await zip.file('word/document.xml').async('string'),styles=await zip.file('word/styles.xml').async('string');
 assert.equal((doc.match(/<w:sectPr>/g)||[]).length,4);
 assert.match(doc,/w:w="11906"/);assert.match(doc,/w:h="16838"/);
 assert.match(doc,/TOC.*1-3/);assert.match(doc,/w:pageBreakBefore/);assert.match(doc,/<w:tbl>/);
 assert.match(doc,/学生姓名/);assert.match(doc,/完整结论/);assert.match(doc,/感谢/);
 assert.match(styles,/w:eastAsia="宋体"/);assert.match(styles,/w:eastAsia="黑体"/);assert.match(styles,/Times New Roman/);
 assert.match(doc,/w:fmt="upperRoman"/);assert.match(doc,/w:fmt="decimal"/);
 assert.doesNotMatch(doc,/\\n|## |\*\*|\|---/);
 assert.match(await zip.file('word/_rels/document.xml.rels').async('string'),/https:\/\/example.com\/paper/);
});
