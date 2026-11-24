import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { buildDocumentPreview } from "./preview.js";
import { createDocumentEngine } from "./engine.js";
import { cleanDocumentCitations } from "./citations.js";
import { isThesisDocument } from "./word.js";

// IPC retries and page reloads share the same durable receipt. Failed jobs can retry.
export function createDocumentService({ directory, stateDirectory, renderPdf, renderSvg, onDocument, rendererVersion = "0.8.6", legacyRendererVersions = rendererVersion === "0.8.6" ? ["0.8.5", "0.8.4", "0.7.1", "0.6.0"] : [] }) {
  const engine = createDocumentEngine({ directory, renderPdf, renderSvg, onDocument });
  const inflight = new Map();
  const receiptFile = path.join(stateDirectory, "document-receipts.json");
  let persistence = Promise.resolve();
  let receipts;
  try {
    const value=JSON.parse(fs.readFileSync(receiptFile,"utf8"));
    receipts=value && typeof value==="object" && !Array.isArray(value)?value:{};
  } catch { receipts={}; }
  function receiptKey({spec,requestId}, version = rendererVersion) {
    if (typeof requestId !== "string" || !requestId || requestId.length > 2100000) throw new Error("文档请求标识无效。");
    return createHash("sha256").update(version).update("\0").update(requestId).update(JSON.stringify(spec)).digest("hex");
  }
  async function existing(key) {
    const entry=receipts[key]; if(!entry?.filePath)return null;
    try {
      const stat=await fs.promises.lstat(entry.filePath);
      if(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0)return {...entry,filename:path.basename(entry.filePath),bytes:stat.size,documentId:key};
    } catch {}
    return null;
  }
  async function persistReceipt(key, entry) {
    receipts[key] = entry;
    receipts = Object.fromEntries(Object.entries(receipts).slice(-500));
    persistence = persistence.catch(() => {}).then(async () => {
      await fs.promises.mkdir(stateDirectory, { recursive: true });
      await fs.promises.writeFile(receiptFile + ".tmp", JSON.stringify(receipts));
      await fs.promises.rename(receiptFile + ".tmp", receiptFile);
    });
    await persistence;
  }
  async function lookup(request) {
    const key = receiptKey(request), current = await existing(key);
    if (current) return current;
    for (const version of legacyRendererVersions) {
      const previous = await existing(receiptKey(request, version));
      if (!previous) continue;
      // A known existing delivery is upgraded from its original content. Keep
      // the old file intact; unaffected history reuses its existing file.
      if (cleanDocumentCitations(request.spec).removed || isThesisDocument(request.spec)) return generate(request);
      const { documentId: _oldId, ...entry } = previous;
      await persistReceipt(key, entry);
      return existing(key);
    }
    return null;
  }
  async function resolveDocument(documentId) {
    if(typeof documentId!=="string"||!/^[a-f0-9]{64}$/.test(documentId))throw new Error("文档标识无效。");
    const entry=await existing(documentId);
    if(!entry)throw new Error("文档已移动或删除，请重新生成。");
    return entry;
  }
  async function previewDocument(documentId) {
    const entry=await resolveDocument(documentId);
    if(!entry.previewPath)throw new Error("此文档暂无内置预览，请重新生成或使用外部应用打开。");
    const allowed=path.resolve(stateDirectory,"document-previews");
    if(path.dirname(path.resolve(entry.previewPath))!==allowed)throw new Error("预览位置无效。");
    const stat=await fs.promises.lstat(entry.previewPath);
    if(!stat.isFile()||stat.isSymbolicLink())throw new Error("预览文件无效。");
    return {title:entry.filename,html:await fs.promises.readFile(entry.previewPath,"utf8")};
  }
  async function generate(request) {
    const {spec}=request,key=receiptKey(request);
    if(inflight.has(key))return inflight.get(key);
    const previous=await existing(key);
    if(previous)return previous;
    if(inflight.has(key))return inflight.get(key);
    const job = (async () => {
      const result = await engine.generateDocument(spec);
      const previewPath=path.join(stateDirectory,"document-previews",`${key}.html`);
      let previewError="";
      try {
        const html=await buildDocumentPreview(spec,result.filePath);
        if(Buffer.byteLength(html,"utf8")>12*1024*1024)throw new Error("内容过大，无法创建内置预览。");
        await fs.promises.mkdir(path.dirname(previewPath),{recursive:true});
        await fs.promises.writeFile(previewPath+".tmp",html,{encoding:"utf8",mode:0o600});
        await fs.promises.rename(previewPath+".tmp",previewPath);
      }catch(error){previewError=String(error.message||error);}
      const entry = {...result,...(!previewError?{previewPath}:{previewError})};
      await persistReceipt(key, entry);
      return { ...entry,documentId:key };
    })();
    inflight.set(key, job);
    try { return await job; } finally { inflight.delete(key); }
  }
  return { generate, lookup, resolveDocument, previewDocument, generateDocument: engine.generateDocument };
}
