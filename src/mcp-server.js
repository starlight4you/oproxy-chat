import { app, shell } from "electron";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import ExcelJS from "exceljs";
import PptxGenJS from "pptxgenjs";
import { marked } from "marked";
import { randomUUID } from "node:crypto";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { writePdf } from "./export.js";

function sanitizeFilename(value) {
  const name = String(value || "Oproxy 文档")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return name || "Oproxy 文档";
}

function uniqueDownloadPath(filename) {
  const directory = app.getPath("downloads");
  const extension = path.extname(filename);
  const baseName = path.basename(filename, extension);
  let candidate = path.join(directory, filename);
  let index = 1;

  while (fs.existsSync(candidate)) {
    candidate = path.join(directory, `${baseName} (${index})${extension}`);
    index += 1;
  }

  return candidate;
}

function markdownToParagraphs(title, content) {
  const paragraphs = [
    new Paragraph({
      text: title,
      heading: HeadingLevel.TITLE,
      spacing: { after: 240 },
    }),
  ];

  const lines = String(content || "").split(/\r?\n/);
  const firstNonEmptyIndex = lines.findIndex((line) => line.trim());
  if (firstNonEmptyIndex >= 0) {
    const firstLine = lines[firstNonEmptyIndex].trim();
    const firstHeading = firstLine.match(/^#\s+(.*)$/);
    if (
      firstHeading &&
      firstHeading[1].trim() === String(title || "").trim()
    ) {
      lines.splice(firstNonEmptyIndex, 1);
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      paragraphs.push(new Paragraph({ text: "", spacing: { after: 80 } }));
      continue;
    }

    if (trimmed.startsWith("```")) {
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = Math.min(heading[1].length, 3);
      const headingLevel =
        level === 1
          ? HeadingLevel.HEADING_1
          : level === 2
            ? HeadingLevel.HEADING_2
            : HeadingLevel.HEADING_3;
      paragraphs.push(
        new Paragraph({
          text: heading[2],
          heading: headingLevel,
          spacing: { before: 220, after: 100 },
        }),
      );
      continue;
    }

    const bullet = trimmed.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      paragraphs.push(
        new Paragraph({
          text: bullet[1],
          bullet: { level: 0 },
          spacing: { after: 60 },
        }),
      );
      continue;
    }

    const numbered = trimmed.match(/^\d+[.)]\s+(.*)$/);
    if (numbered) {
      paragraphs.push(
        new Paragraph({
          text: numbered[1],
          bullet: { level: 0 },
          spacing: { after: 60 },
        }),
      );
      continue;
    }

    if (trimmed.startsWith(">")) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: trimmed.replace(/^>\s?/, ""),
              italics: true,
              color: "555555",
            }),
          ],
          indent: { left: 360 },
          spacing: { after: 100 },
        }),
      );
      continue;
    }

    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: trimmed })],
        spacing: { after: 100, line: 360 },
      }),
    );
  }

  return paragraphs;
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
  const body = marked
    .parse(markdown, { async: false, gfm: true })
    .replace(/<script[\s\S]*?<\/script>/gi, "");

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
  }
  h1 { font-size: 22pt; line-height: 1.3; margin: 0 0 18px; color: #0f172a; }
  h2 { font-size: 16pt; line-height: 1.4; margin: 24px 0 10px; color: #0f766e; }
  h3 { font-size: 13pt; line-height: 1.5; margin: 18px 0 8px; color: #334e68; }
  h4 { font-size: 12pt; margin: 14px 0 6px; color: #334e68; }
  p { margin: 0 0 10px; }
  ul, ol { margin: 0 0 12px; padding-left: 24px; }
  li { margin: 3px 0; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0 16px; font-size: 10.5pt; }
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
    return slides.map((slide, index) => ({
      title: String(slide.title || `第 ${index + 1} 页`),
      bullets: (slide.bullets || []).map(String),
    }));
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

function chunkSlides(sections) {
  const result = [];

  for (const section of sections) {
    const bullets = section.bullets.length ? section.bullets : [""];

    for (let index = 0; index < bullets.length; index += 6) {
      const chunk = bullets.slice(index, index + 6);
      result.push({
        title: index === 0 ? section.title : `${section.title}（续）`,
        bullets: chunk.filter(Boolean),
      });
    }
  }

  return result;
}

export function createMcpService({
  token,
  port = 3333,
  publicBaseUrl = "",
  onDocument = () => {},
}) {
  let httpServer = null;
  let currentPublicBaseUrl = String(publicBaseUrl || "").replace(/\/$/, "");
  let currentToken = String(token || "");
  const files = new Map();

  function registerFile(filePath) {
    const fileId = randomUUID();
    files.set(fileId, { path: filePath, name: path.basename(filePath) });
    const url = currentPublicBaseUrl
      ? `${currentPublicBaseUrl}/files/${fileId}`
      : null;

    try {
      shell.showItemInFolder(filePath);
    } catch {
      // Finder reveal is best-effort.
    }

    try {
      onDocument(filePath);
    } catch {
      // The host app can ignore notification errors.
    }

    return { filePath, url };
  }

  async function writeBuffer(buffer, filename, extension) {
    const name = ensureExtension(sanitizeFilename(filename), extension);
    const filePath = uniqueDownloadPath(name);
    await fs.promises.writeFile(filePath, buffer);
    return registerFile(filePath);
  }

  async function createDocx(title, content, filename) {
    const document = new Document({
      styles: {
        default: {
          document: {
            run: {
              font: "PingFang SC",
              size: 24,
            },
          },
        },
      },
      sections: [
        {
          properties: {},
          children: markdownToParagraphs(title, content),
        },
      ],
    });

    const buffer = await Packer.toBuffer(document);
    return writeBuffer(buffer, filename || title, ".docx");
  }

  async function createPdf(title, content, filename) {
    const html = buildPdfHtml(title, content);
    const name = ensureExtension(sanitizeFilename(filename || title), ".pdf");
    const filePath = uniqueDownloadPath(name);
    await writePdf(html, filePath);
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

    const buffer = await workbook.xlsx.writeBuffer();
    return writeBuffer(Buffer.from(buffer), filename || title, ".xlsx");
  }

  async function createPptx(title, content, filename, slides) {
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    pptx.author = "Oproxy Chat";
    pptx.company = "Oproxy";
    pptx.title = title;

    const deck = chunkSlides(normalizeSlides(title, content, slides));

    const cover = pptx.addSlide();
    cover.background = { color: "F4F7F9" };
    cover.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 13.33,
      h: 0.18,
      fill: { color: "0F766E" },
      line: { color: "0F766E" },
    });
    cover.addText(title, {
      x: 0.8,
      y: 2.0,
      w: 11.73,
      h: 1.6,
      fontSize: 36,
      bold: true,
      color: "1F2933",
      align: "center",
      valign: "middle",
    });
    cover.addText("Oproxy Chat", {
      x: 0.8,
      y: 6.5,
      w: 11.73,
      h: 0.4,
      fontSize: 12,
      color: "9AA5B1",
      align: "center",
    });

    deck.forEach((definition, index) => {
      const slide = pptx.addSlide();
      slide.background = { color: "FFFFFF" };
      slide.addShape(pptx.ShapeType.rect, {
        x: 0,
        y: 0,
        w: 13.33,
        h: 0.12,
        fill: { color: "0F766E" },
        line: { color: "0F766E" },
      });
      slide.addText(definition.title, {
        x: 0.6,
        y: 0.35,
        w: 12.13,
        h: 0.8,
        fontSize: 26,
        bold: true,
        color: "0F766E",
      });

      if (definition.bullets.length) {
        slide.addText(
          definition.bullets.map((text) => ({
            text,
            options: {
              bullet: true,
              fontSize: 17,
              color: "323F4B",
              breakLine: true,
              paraSpaceAfter: 10,
            },
          })),
          {
            x: 0.8,
            y: 1.35,
            w: 11.73,
            h: 5.6,
            valign: "top",
          },
        );
      }

      slide.addText(String(index + 1), {
        x: 12.2,
        y: 6.9,
        w: 0.6,
        h: 0.3,
        fontSize: 10,
        color: "9AA5B1",
        align: "right",
      });
    });

    const buffer = await pptx.write({ outputType: "nodebuffer" });
    return writeBuffer(Buffer.from(buffer), filename || title, ".pptx");
  }

  function createMcpServer() {
    const server = new McpServer({
      name: "oproxy-local-docs",
      version: "1.0.0",
    });

    server.registerTool(
      "create_docx",
      {
        title: "Create Word document",
        description:
          "Create a Word .docx document locally on the user's Mac and save it to the Downloads folder. Use this whenever the user asks for a Word document. Provide the full document content in Markdown.",
        inputSchema: {
          title: z.string().describe("Document title"),
          content: z
            .string()
            .describe(
              "Full document content in Markdown (headings, paragraphs, bullets, tables)",
            ),
          filename: z
            .string()
            .optional()
            .describe("Optional output file name, without a path"),
        },
      },
      async ({ title, content, filename }) => {
        const { filePath, url } = await createDocx(title, content, filename);
        const lines = [
          `已生成 Word 文档：${path.basename(filePath)}`,
          `保存位置：${filePath}`,
        ];
        if (url) lines.push(`下载链接：${url}`);
        console.log(`[mcp] create_docx -> ${filePath}`);

        return {
          content: [{ type: "text", text: lines.join("\n") }],
        };
      },
    );

    server.registerTool(
      "create_pdf",
      {
        title: "Create PDF document",
        description:
          "Create a PDF document locally on the user's Mac and save it to the Downloads folder. Use this whenever the user asks for a PDF. Provide the full document content in Markdown (headings, paragraphs, bullets, tables). Chinese fonts are rendered automatically.",
        inputSchema: {
          title: z.string().describe("Document title"),
          content: z
            .string()
            .describe(
              "Full document content in Markdown (headings, paragraphs, bullets, tables)",
            ),
          filename: z
            .string()
            .optional()
            .describe("Optional output file name, without a path"),
        },
      },
      async ({ title, content, filename }) => {
        const { filePath, url } = await createPdf(title, content, filename);
        const lines = [
          `已生成 PDF 文档：${path.basename(filePath)}`,
          `保存位置：${filePath}`,
        ];
        if (url) lines.push(`下载链接：${url}`);
        console.log(`[mcp] create_pdf -> ${filePath}`);

        return {
          content: [{ type: "text", text: lines.join("\n") }],
        };
      },
    );

    server.registerTool(
      "create_xlsx",
      {
        title: "Create Excel workbook",
        description:
          "Create an Excel .xlsx workbook locally on the user's Mac and save it to the Downloads folder. Use this whenever the user asks for an Excel spreadsheet. Either provide Markdown content where each table becomes a worksheet (a preceding heading names the sheet), or provide structured sheets.",
        inputSchema: {
          title: z.string().describe("Workbook title"),
          content: z
            .string()
            .optional()
            .describe(
              "Markdown content. Tables become worksheets; the nearest heading before a table names the sheet.",
            ),
          sheets: z
            .array(
              z.object({
                name: z.string().optional().describe("Worksheet name"),
                columns: z
                  .array(z.string())
                  .optional()
                  .describe("Header row"),
                rows: z
                  .array(z.array(z.any()))
                  .optional()
                  .describe("Data rows"),
              }),
            )
            .optional()
            .describe(
              "Structured worksheets. Use instead of content for precise control.",
            ),
          filename: z
            .string()
            .optional()
            .describe("Optional output file name, without a path"),
        },
      },
      async ({ title, content, filename, sheets }) => {
        if (!String(content || "").trim() && !(sheets && sheets.length)) {
          throw new Error("请提供 content 或 sheets。");
        }

        const { filePath, url } = await createXlsx(
          title,
          content,
          filename,
          sheets,
        );
        const lines = [
          `已生成 Excel 表格：${path.basename(filePath)}`,
          `保存位置：${filePath}`,
        ];
        if (url) lines.push(`下载链接：${url}`);
        console.log(`[mcp] create_xlsx -> ${filePath}`);

        return {
          content: [{ type: "text", text: lines.join("\n") }],
        };
      },
    );

    server.registerTool(
      "create_pptx",
      {
        title: "Create PowerPoint presentation",
        description:
          "Create a PowerPoint .pptx presentation locally on the user's Mac and save it to the Downloads folder. Use this whenever the user asks for slides or a PPT. Either provide Markdown content (each H1/H2 becomes a slide title and bullets become slide content), or provide structured slides.",
        inputSchema: {
          title: z.string().describe("Presentation title"),
          content: z
            .string()
            .optional()
            .describe(
              "Markdown content. Each H1/H2 becomes a slide title; paragraphs and list items become bullets.",
            ),
          slides: z
            .array(
              z.object({
                title: z.string().describe("Slide title"),
                bullets: z
                  .array(z.string())
                  .optional()
                  .describe("Slide bullet points"),
              }),
            )
            .optional()
            .describe(
              "Structured slides. Use instead of content for precise control.",
            ),
          filename: z
            .string()
            .optional()
            .describe("Optional output file name, without a path"),
        },
      },
      async ({ title, content, filename, slides }) => {
        if (!String(content || "").trim() && !(slides && slides.length)) {
          throw new Error("请提供 content 或 slides。");
        }

        const { filePath, url } = await createPptx(
          title,
          content,
          filename,
          slides,
        );
        const lines = [
          `已生成 PowerPoint 演示文稿：${path.basename(filePath)}`,
          `保存位置：${filePath}`,
        ];
        if (url) lines.push(`下载链接：${url}`);
        console.log(`[mcp] create_pptx -> ${filePath}`);

        return {
          content: [{ type: "text", text: lines.join("\n") }],
        };
      },
    );

    return server;
  }

  function getStatus() {
    const base = currentPublicBaseUrl;
    return {
      running: Boolean(httpServer),
      port,
      token: currentToken,
      publicBaseUrl: base,
      localUrl: `http://127.0.0.1:${port}/mcp`,
      publicUrl: base ? `${base}/mcp` : "",
      fileCount: files.size,
    };
  }

  async function start() {
    if (httpServer) return getStatus();

    const expressApp = express();
    expressApp.use(express.json({ limit: "20mb" }));

    expressApp.get("/health", (_req, res) => {
      res.json({ ok: true, name: "oproxy-local-mcp", port });
    });

    expressApp.post("/mcp", async (req, res) => {
      const authorization = req.headers.authorization || "";
      if (authorization !== `Bearer ${currentToken}`) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const server = createMcpServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });

      res.on("close", () => {
        transport.close();
      });

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    });

    expressApp.get("/mcp", (_req, res) => {
      res.status(405).json({ error: "Method not allowed" });
    });

    expressApp.delete("/mcp", (_req, res) => {
      res.status(405).json({ error: "Method not allowed" });
    });

    expressApp.get("/files/:id", (req, res) => {
      const entry = files.get(req.params.id);
      if (!entry) {
        res.status(404).send("Not found");
        return;
      }
      res.download(entry.path, entry.name);
    });

    await new Promise((resolve, reject) => {
      httpServer = expressApp.listen(port, "127.0.0.1", resolve);
      httpServer.on("error", (error) => {
        httpServer = null;
        reject(error);
      });
    });

    return getStatus();
  }

  async function stop() {
    if (!httpServer) return getStatus();

    const server = httpServer;
    httpServer = null;
    await new Promise((resolve) => server.close(resolve));
    return getStatus();
  }

  function setPublicBaseUrl(url) {
    currentPublicBaseUrl = String(url || "").replace(/\/$/, "");
    return getStatus();
  }

  function setToken(newToken) {
    currentToken = String(newToken || "");
    return getStatus();
  }

  return {
    start,
    stop,
    getStatus,
    setPublicBaseUrl,
    setToken,
  };
}
