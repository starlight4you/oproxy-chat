import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import { cleanCitationText, cleanDocumentCitations } from '../src/documents/citations.js';
import { validateDocument } from '../src/documents/schema.js';
import { createDocumentEngine } from '../src/documents/engine.js';
import { createDocumentService } from '../src/documents/service.js';
import { buildDocumentPreview } from '../src/documents/preview.js';

const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'oproxy-citations-'));
const invalid = /turn\d+(?:search|view)\d+|\\ue20[012]|[\ue200-\ue202]/;
const content = '## 双稳态\n\n画面写好后可以保留。\\ue202turn0search2\n\n## 前光\n\n前光负责照明。\ue200cite\ue202turn0search0\ue202turn1view1\ue201\n\n[官方来源](https://www.eink.com/tech/detail/Benefits)\n';

test('Normalizes real, escaped and repeated search citations without touching ordinary text or links', () => {
  for (const token of ['\\ue202turn0search2', '\\ue202turn0search0\\ue202turn0search3', '\ue200cite\ue202turn0search2\ue201', '\\ue200cite\\ue202turn0search2\\ue201', '\\\\ue202turn12view3', '\ue202turn3search4']) {
    const result = cleanCitationText('中文。' + token + '下一句。');
    assert.equal(result.text, '中文。下一句。'); assert.ok(result.removed > 0);
  }
  const ordinary = '路径 C:\\users\\docs，示例 \\u4e2d，[来源](https://example.com/a?turn0search=2)。';
  assert.deepEqual(cleanCitationText(ordinary), { text: ordinary, removed: 0 });
  const code = '示例 `\\ue202turn0search2`\n\n```text\n\\ue200cite\\ue202turn0search0\\ue201\n```\n正文。\\ue202turn0search3';
  const cleaned = cleanCitationText(code, { markdown: true });
  assert.match(cleaned.text, /`\\ue202turn0search2`/);
  assert.match(cleaned.text, /```text\n\\ue200cite/);
  assert.ok(cleaned.text.endsWith('正文。'));
});

test('Cleans only presentation text while retaining formulas, filenames, numbers and meaningful code examples', () => {
  const input = { type: 'xlsx', title: '预算\\ue202turn0search1', filename: 'turn0search1.xlsx', sheets: [{ name: '预算', columns: ['说明'], rows: [['已核对\\ue202turn0search1', 100, { formula: 'SUM(B1:B2)' }]], formats: ['0.00'] }] };
  const { spec } = cleanDocumentCitations(input);
  assert.equal(spec.title, '预算'); assert.equal(spec.filename, input.filename);
  assert.equal(spec.sheets[0].rows[0][0], '已核对'); assert.equal(spec.sheets[0].rows[0][1], 100);
  assert.equal(spec.sheets[0].rows[0][2].formula, 'SUM(B1:B2)');
  assert.equal(input.title, '预算\\ue202turn0search1', 'Original model response remains unchanged');
  assert.throws(() => validateDocument({ type: 'docx', title: '空内容', content: '\\ue202turn0search1' }), /内容不完整/);
});

test('Published Word, PDF input, workbook and presentation previews omit citation transport tokens and retain sources', async () => {
  let pdfHtml = '';
  const engine = createDocumentEngine({ directory, renderPdf: async (html, output) => { pdfHtml = html; await fs.writeFile(output, '%PDF-fixture'); } });
  const spec = { type: 'docx', title: '墨水屏', content, summary: '已完成\\ue202turn0search2' };
  const result = await engine.generateDocument(spec);
  const zip = await JSZip.loadAsync(await fs.readFile(result.filePath));
  const word = await zip.file('word/document.xml').async('string');
  assert.doesNotMatch(word, invalid); assert.match(word, /画面写好后可以保留/); assert.match(word, /前光负责照明/);
  assert.match(await zip.file('word/_rels/document.xml.rels').async('string'), /https:\/\/www.eink.com\/tech\/detail\/Benefits/);
  const preview = await buildDocumentPreview(spec, result.filePath);
  assert.doesNotMatch(preview, invalid); assert.match(preview, /href="https:\/\/www.eink.com\/tech\/detail\/Benefits"/);
  await engine.generateDocument({ ...spec, type: 'pdf' });
  assert.doesNotMatch(pdfHtml, invalid); assert.match(pdfHtml, /https:\/\/www.eink.com/);
  const xlsx = await engine.generateDocument({ type: 'xlsx', title: '资料', sheets: [{ name: '说明', columns: ['事项', '数量'], rows: [['保留画面\\ue202turn0search2', 100]] }] });
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.readFile(xlsx.filePath);
  assert.equal(workbook.worksheets[0].getCell('A2').value, '保留画面'); assert.equal(workbook.worksheets[0].getCell('B2').value, 100);
  const ppt = { type: 'pptx', title: '墨水屏', slides: [{ title: '原理', bullets: ['保留画面\\ue202turn0search2'], notes: '解说\\ue202turn0search2', source: 'https://www.eink.com/tech/detail/Benefits' }] };
  assert.doesNotMatch(await buildDocumentPreview(ppt, ''), invalid);
  const presentation = await engine.generateDocument(ppt);
  const slides = await JSZip.loadAsync(await fs.readFile(presentation.filePath));
  for (const name of Object.keys(slides.files).filter(name => /^ppt\/(slides|notesSlides)\/.*\.xml$/.test(name))) assert.doesNotMatch(await slides.file(name).async('string'), invalid);
});

test('History upgrades only affected old deliveries once and preserves the original files', async () => {
  const options = { directory: path.join(directory, 'history'), stateDirectory: path.join(directory, 'history-state') };
  const request = { requestId: 'history:answer', spec: { type: 'docx', title: '历史', content } };
  const legacy = createDocumentService({ ...options, rendererVersion: '0.6.0' });
  const previous = await legacy.generate(request);
  // Simulate an actual old artifact; the current engine already cleans tokens.
  const archive = await JSZip.loadAsync(await fs.readFile(previous.filePath));
  archive.file('word/document.xml', (await archive.file('word/document.xml').async('string')).replace('画面写好后可以保留。', '画面写好后可以保留。\\ue202turn0search2'));
  await fs.writeFile(previous.filePath, await archive.generateAsync({ type: 'nodebuffer' }));
  const service = createDocumentService(options);
  const [upgraded, duplicate] = await Promise.all([service.lookup(request), service.lookup(request)]);
  assert.notEqual(upgraded.filePath, previous.filePath); assert.equal(upgraded.filePath, duplicate.filePath);
  assert.equal((await createDocumentService(options).lookup(request)).filePath, upgraded.filePath);
  const cleanZip = await JSZip.loadAsync(await fs.readFile(upgraded.filePath));
  assert.doesNotMatch(await cleanZip.file('word/document.xml').async('string'), invalid);
  assert.match(await (await JSZip.loadAsync(await fs.readFile(previous.filePath))).file('word/document.xml').async('string'), /turn0search2/, 'Original file is retained');
  assert.equal((await fs.readdir(options.directory)).filter(n => n.endsWith('.docx')).length, 2);
  const unaffected = { requestId: 'history:unaffected', spec: { type: 'docx', title: '正常', content: '正常正文' } };
  const original = await legacy.generate(unaffected);
  assert.equal((await createDocumentService(options).lookup(unaffected)).filePath, original.filePath, 'Unaffected history reuses its existing file');
  assert.equal(await service.lookup({ requestId: 'never-generated', spec: request.spec }), null, 'No new file is generated for unknown history');
});

test.after(async () => { await fs.rm(directory, { recursive: true, force: true }); });
