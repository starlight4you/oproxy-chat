import { renderWord, isThesisDocument } from "./word.js";
import ExcelJS from "exceljs";
import { paginateSlides } from "./presentation-plan.js";
import { buildPresentation } from "./presentation.js";
import { Renderer } from "marked";
import { markdown as marked } from "./markdown.js";
import fs from "node:fs";
import path from "node:path";
import { recalculateWorkbook } from "./formulas.js";
import { publishDocument } from "./files.js";
import { validateDocument } from "./schema.js";
function sanitizeFilename(value) {
  const name = String(value || "Oproxy 文档")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return name || "Oproxy 文档";
}

function ensureExtension(filename, extension) {
  return filename.toLowerCase().endsWith(extension)
    ? filename
    : `${filename}${extension}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripLeadingTitle(title, content) {
  const lines = String(content || "").split(/\r?\n/);
  const index = lines.findIndex((line) => line.trim());

  if (index >= 0) {
    const match = lines[index].trim().match(/^#\s+(.*)$/);
    if (match && match[1].trim() === String(title || "").trim()) {
      lines.splice(index, 1);
    }
  }

  return lines.join("\n").trim();
}

function buildPdfHtml(title, content) {
  const markdown = stripLeadingTitle(title, content);
  const renderer = Object.assign(new Renderer(), {
    html: () => "",
    image: ({ text }) => escapeHtml(text || ""),
    link({href,tokens,text}) {
      const label=tokens?this.parser.parseInline(tokens):escapeHtml(text);
      return /^(https?:|mailto:)/i.test(href)?`<a href="${escapeHtml(href)}">${label}</a>`:label;
    },
  });
  const body = marked.parse(markdown, { async: false, gfm: true, renderer });

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<style>
  @page { size: A4; margin: 16mm 14mm; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    margin: 0;
    padding: 0;
    font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    font-size: 11.5pt;
    line-height: 1.75;
    color: #1f2933;
    overflow-wrap: anywhere;
  }
  h1 { font-size: 22pt; line-height: 1.3; margin: 0 0 18px; color: #0f172a; }
  h2 { font-size: 16pt; line-height: 1.4; margin: 24px 0 10px; color: #0f766e; }
  h3 { font-size: 13pt; line-height: 1.5; margin: 18px 0 8px; color: #334e68; }
  h4 { font-size: 12pt; margin: 14px 0 6px; color: #334e68; }
  p { margin: 0 0 10px; }
  ul, ol { margin: 0 0 12px; padding-left: 24px; }
  li { margin: 3px 0; }
  table { width: 100%; table-layout: fixed; border-collapse: collapse; margin: 10px 0 16px; font-size: 10.5pt; }
  tr { break-inside: avoid; }
  thead { display: table-header-group; }
  p, li { orphans: 3; widows: 3; }
  th, td { border: 1px solid #d9e2ec; padding: 6px 9px; text-align: left; vertical-align: top; }
  th { background: #f0f4f8; color: #243b53; font-weight: 600; }
  blockquote { margin: 10px 0; padding: 6px 14px; border-left: 3px solid #9fb3c8; color: #52606d; background: #f8fafc; }
  code { font-family: "SF Mono", Menlo, monospace; font-size: 10pt; background: #f0f4f8; padding: 1px 4px; border-radius: 3px; }
  pre { background: #f0f4f8; padding: 12px 14px; border-radius: 6px; overflow: hidden; white-space: pre-wrap; word-break: break-word; }
  pre code { background: transparent; padding: 0; }
  hr { border: 0; border-top: 1px solid #d9e2ec; margin: 18px 0; }
  h1, h2, h3, h4 { break-after: avoid; }
  img { max-width: 100%; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
${body}
</body>
</html>`;
}

function tableCells(cells) {
  return (cells || []).map((cell) =>
    typeof cell === "object" && cell !== null
      ? String(cell.text ?? "")
      : String(cell ?? ""),
  );
}

function extractMarkdownTables(content) {
  const tokens = marked.lexer(String(content || ""));
  const tables = [];
  let heading = "";

  for (const token of tokens) {
    if (token.type === "heading" && token.depth <= 2) {
      heading = token.text.trim();
    }

    if (token.type === "table") {
      tables.push({
        name: heading || `Sheet${tables.length + 1}`,
        columns: tableCells(token.header),
        rows: (token.rows || []).map(tableCells),
      });
    }
  }

  return tables;
}

function uniqueSheetName(value, index, used) {
  const base =
    String(value || `Sheet${index + 1}`)
      .replace(/[\\/?*[\]:]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 31) || `Sheet${index + 1}`;
  let name = base;
  let suffix = 2;

  while (used.has(name.toLowerCase())) {
    const tail = ` (${suffix})`;
    name = `${base.slice(0, 31 - tail.length)}${tail}`;
    suffix += 1;
  }

  used.add(name.toLowerCase());
  return name;
}

function displayWidth(value) {
  return [...String(value ?? "")].reduce(
    (width, char) =>
      width + (/[\u3000-\u9fff\uff00-\uffef]/.test(char) ? 2 : 1),
    0,
  );
}

function normalizeSlides(title, content, slides) {
  if (Array.isArray(slides) && slides.length) {
    return slides;
  }

  const tokens = marked.lexer(String(content || ""));
  const sections = [];
  let current = null;
  let intro = "";

  function pushText(text) {
    const value = String(text || "").trim();
    if (!value) return;

    if (!current) {
      if (!intro) {
        intro = value;
        return;
      }

      current = { title: "概述", bullets: [] };
      sections.push(current);
    }

    current.bullets.push(value);
  }

  for (const token of tokens) {
    if (token.type === "heading") {
      const text = token.text.trim();
      if (
        !sections.length &&
        !current &&
        !intro &&
        text === String(title || "").trim()
      ) {
        continue;
      }

      current = { title: text, bullets: [] };
      sections.push(current);
      continue;
    }

    if (token.type === "paragraph") {
      pushText(token.text);
    } else if (token.type === "list") {
      for (const item of token.items || []) pushText(item.text);
    } else if (token.type === "blockquote" || token.type === "code") {
      pushText(token.text);
    } else if (token.type === "table") {
      const columns = tableCells(token.header);
      for (const row of token.rows || []) {
        const cells = tableCells(row);
        pushText(
          cells
            .map((cell, index) => `${columns[index] || `列${index + 1}`}：${cell}`)
            .join("；"),
        );
      }
    }
  }

  if (!sections.length) {
    sections.push({
      title: title || "内容",
      bullets: intro ? [intro] : [],
    });
  } else if (intro) {
    sections.unshift({ title: "概述", bullets: [intro] });
  }

  return sections;
}

export function createDocumentEngine({ directory, renderPdf, renderSvg, onDocument = () => {} }) {
  function registerFile(filePath) {
    onDocument(filePath);
    return { filePath, filename:path.basename(filePath), bytes:fs.statSync(filePath).size };
  }
  async function writeBuffer(buffer, filename, extension) {
    const name = ensureExtension(sanitizeFilename(filename), extension);
    const filePath = await publishDocument(directory,name,staging=>fs.promises.writeFile(staging,buffer));
    return registerFile(filePath);
  }

  async function createDocx(title, content, filename, documentStyle) {
    const buffer = await renderWord(title,content,{documentStyle});
    return writeBuffer(buffer, filename || title, ".docx");
  }

  async function createPdf(title, content, filename) {
    const html = buildPdfHtml(title, content);
    const name = ensureExtension(sanitizeFilename(filename || title), ".pdf");
    const filePath = await publishDocument(directory,name,staging=>renderPdf(html,staging));
    return registerFile(filePath);
  }

  async function createXlsx(title, content, filename, sheets) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Oproxy Chat";
    workbook.created = new Date();

    const definitions =
      Array.isArray(sheets) && sheets.length
        ? sheets.map((sheet) => ({
            name: sheet.name,
            formats: sheet.formats,
            columns: Array.isArray(sheet.columns)
              ? sheet.columns.map(String)
              : [],
            rows: Array.isArray(sheet.rows)
              ? sheet.rows.map((row) => (Array.isArray(row) ? row : [row]))
              : [],
          }))
        : extractMarkdownTables(content);

    if (!definitions.length) {
      const lines = String(content || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      definitions.push({
        name: "内容",
        columns: ["内容"],
        rows: lines.map((line) => [line.replace(/^[-*#>\s]+/, "")]),
      });
    }

    const usedNames = new Set();

    definitions.forEach((definition, index) => {
      const worksheet = workbook.addWorksheet(
        uniqueSheetName(definition.name, index, usedNames),
      );

      if (definition.columns.length) {
        worksheet.addRow(definition.columns);
      }

      for (const row of definition.rows) {
        worksheet.addRow(row);
      }

      const columnCount = Math.max(
        definition.columns.length,
        ...definition.rows.map((row) => row.length),
        1,
      );

      for (let column = 1; column <= columnCount; column += 1) {
        const samples = [
          definition.columns[column - 1],
          ...definition.rows.map((row) => row[column - 1]),
        ];
        const width = Math.min(
          60,
          Math.max(12, ...samples.map((value) => displayWidth(value) + 2)),
        );
        worksheet.getColumn(column).width = width;
        if (definition.formats?.[column-1]) worksheet.getColumn(column).numFmt = definition.formats[column-1];
      }

      worksheet.eachRow((row) => {
        row.eachCell((cell) => {
          cell.alignment = { vertical: "middle", wrapText: true };
          cell.border = {
            top: { style: "thin", color: { argb: "FFE2E8F0" } },
            left: { style: "thin", color: { argb: "FFE2E8F0" } },
            bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
            right: { style: "thin", color: { argb: "FFE2E8F0" } },
          };
        });
      });

      if (definition.columns.length) {
        const header = worksheet.getRow(1);
        header.font = { bold: true, color: { argb: "FFFFFFFF" } };
        header.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF0F766E" },
        };
        header.alignment = {
          vertical: "middle",
          horizontal: "center",
          wrapText: true,
        };
        worksheet.views = [{ state: "frozen", ySplit: 1 }];

        if (definition.rows.length) {
          worksheet.autoFilter = {
            from: { row: 1, column: 1 },
            to: { row: 1, column: columnCount },
          };
        }
      }
    });

    const calculation = recalculateWorkbook(workbook);
    const buffer = await workbook.xlsx.writeBuffer();
    return { ...await writeBuffer(Buffer.from(buffer), filename || title, ".xlsx"), calculation };

  }

  async function createPptx(title, content, filename, slides) {
    const definitions=normalizeSlides(title,content,slides);
    const buffer = await buildPresentation(title,definitions,{renderSvg});
    return {...await writeBuffer(buffer,filename||title,".pptx"),presentation:{slides:paginateSlides(definitions).length+1}};
  }

  async function generate(input) {
    const payload = validateDocument(input);
    await fs.promises.mkdir(directory, { recursive: true });
    const type = String(payload?.type || "").toLowerCase().trim();
    const title = String(payload?.title || "Oproxy 文档");
    const content = String(payload?.content || "");
    const filename = payload?.filename;

    if (type === "docx") return createDocx(title, content, filename, isThesisDocument(payload)?"thesis":"standard");
    if (type === "pdf") return createPdf(title, content, filename);
    if (type === "xlsx") {
      return createXlsx(title, content, filename, payload?.sheets);
    }
    if (type === "pptx") {
      return createPptx(title, content, filename, payload?.slides);
    }
    throw new Error(`不支持的文档类型：${type || "(空)"}`);
  }

  let queue = Promise.resolve();
  function generateDocument(input) {
    const job = queue.then(() => generate(input));
    queue = job.catch(() => {});
    return job;
  }
  return { generateDocument };
}
