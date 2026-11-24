import { z } from "zod";
import { DocumentValidationError } from "./errors.js";
import { cleanDocumentCitations } from "./citations.js";

export const cellSchema = z.union([
  z.string().max(32000), z.number().finite(), z.boolean(), z.null(),
  z.object({ formula: z.string().min(1).max(2000), result: z.union([z.number().finite(), z.string(), z.boolean()]).optional() }).strict(),
]);
export const chartSchema = z.object({
  type: z.enum(["bar", "line", "pie", "doughnut"]),
  title: z.string().max(160).optional(),
  categories: z.array(z.string().max(100)).min(1).max(20),
  series: z.array(z.object({ name: z.string().max(100), values: z.array(z.number().finite()).min(1).max(20) }).strict()).min(1).max(6),
}).strict().superRefine((chart, ctx) => {
  if (chart.series.some(s => s.values.length !== chart.categories.length)) ctx.addIssue({code:"custom",message:"图表每组数据必须与分类数量一致。"});
  if ((chart.type === "pie" || chart.type === "doughnut") && (chart.series.length !== 1 || chart.series[0].values.some(n => n < 0) || !chart.series[0].values.some(n => n > 0))) ctx.addIssue({code:"custom",message:"饼图/环形图需要一组非负且合计大于零的数据。"});
});
export const sheetSchema = z.object({
  name: z.string().max(100).optional(),
  columns: z.array(z.string().max(1000)).max(100).default([]),
  rows: z.array(z.array(cellSchema).max(100)).max(10000).default([]),
  formats: z.array(z.string().max(100)).max(100).optional(),
}).strict();
const slideTable = z.object({
  columns: z.array(z.string().max(100)).min(1).max(6),
  rows: z.array(z.array(z.union([z.string().max(300),z.number().finite()])).min(1).max(6)).min(1).max(30),
}).strict().superRefine((table,ctx) => { if (table.rows.some(r=>r.length!==table.columns.length)) ctx.addIssue({code:"custom",message:"表格行与列数不一致。"}); });
export const slideSchema = z.object({
  title: z.string().min(1).max(200),
  layout: z.enum(["bullets", "comparison", "metrics", "timeline", "table", "chart", "section"]).optional(),
  subtitle: z.string().max(300).optional(),
  bullets: z.array(z.string().max(1800)).max(50).default([]),
  notes: z.string().max(20000).optional(),
  columns: z.array(z.object({ title: z.string().max(100), bullets: z.array(z.string().max(500)).min(1).max(6) }).strict()).min(2).max(3).optional(),
  metrics: z.array(z.object({ label: z.string().max(80), value: z.string().max(40), detail: z.string().max(150).optional() }).strict()).min(1).max(4).optional(),
  steps: z.array(z.object({ title: z.string().max(80), detail: z.string().max(300) }).strict()).min(2).max(6).optional(),
  table: slideTable.optional(),
  chart: chartSchema.optional(),
  source: z.string().max(500).optional(),
}).strict().superRefine((slide,ctx)=>{
  const fields = {comparison:"columns",metrics:"metrics",timeline:"steps",table:"table",chart:"chart"};
  const richFields = Object.values(fields).filter(field => slide[field]);
  if (richFields.length > 1 || (richFields.length && slide.layout && fields[slide.layout] !== richFields[0])) ctx.addIssue({code:"custom",message:"每页只能提供与版式匹配的一种结构化内容。"});
  if (fields[slide.layout] && !slide[fields[slide.layout]]) ctx.addIssue({code:"custom",message:`${slide.layout} 版式缺少 ${fields[slide.layout]}。`});
  if (!slide.bullets.length && !slide.columns && !slide.metrics && !slide.steps && !slide.table && !slide.chart && slide.layout!=="section") ctx.addIssue({code:"custom",message:"幻灯片需要实质内容。"});
});
export const documentSchema = z.object({
  type: z.enum(["docx", "pdf", "xlsx", "pptx"]),
  title: z.string().trim().min(1).max(300),
  filename: z.string().max(200).optional(),
  documentStyle: z.enum(["standard", "thesis"]).optional(),
  summary: z.string().trim().max(4000).optional(),
  content: z.string().max(600000).default(""),
  sheets: z.array(sheetSchema).min(1).max(30).optional(),
  slides: z.array(slideSchema).min(1).max(100).optional(),
}).strict().superRefine((spec, ctx) => {
  if (!spec.content.trim() && !(spec.type === "xlsx" && spec.sheets?.length) && !(spec.type === "pptx" && spec.slides?.length)) ctx.addIssue({ code: "custom", message: "请提供完整文档正文，或对应的工作表/幻灯片内容。" });
  if (spec.sheets && spec.type !== "xlsx" || spec.slides && spec.type !== "pptx") ctx.addIssue({ code: "custom", message: "结构化内容与文档类型不匹配。" });
  if ((spec.type === "docx" || spec.type === "pdf") && !spec.content.includes("\n") && /\\n/.test(spec.content)) ctx.addIssue({code:"custom",message:"正文的换行被双重转义，请使用正确 JSON 换行。"});
});
export function validateDocument(input) {
  if (JSON.stringify(input)?.length > 2000000) throw new DocumentValidationError("文档内容超过 2 MB 限制。");
  const result = documentSchema.safeParse(input);
  if (!result.success) throw new DocumentValidationError(result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("；"));
  const cleaned = cleanDocumentCitations(result.data);
  if (!cleaned.removed) return result.data;
  const normalized = documentSchema.safeParse(cleaned.spec);
  if (!normalized.success) throw new DocumentValidationError("移除无效引用后文档内容不完整，请补全正文。");
  return normalized.data;
}
