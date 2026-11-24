import { app, shell } from "electron";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import express from "express";
import path from "node:path";
import { writePdf, renderSvgImage } from "./export.js";
import { createDocumentEngine } from "./documents/engine.js";
import { sheetSchema, slideSchema } from "./documents/schema.js";
import { skills } from "./documents/skills.js";
export function createMcpService({
  token,
  port = 3333,
  publicBaseUrl = "",
  onDocument = () => {},
  documentEngine,
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

  const engine = documentEngine || createDocumentEngine({ directory: app.getPath("downloads"), renderPdf: writePdf, renderSvg: renderSvgImage });
  async function generateDocument(payload) {
    const { filePath } = await engine.generateDocument(payload);
    return registerFile(filePath);
  }
  const createDocx = (title, content, filename) => generateDocument({ type: "docx", title, content, filename });
  const createPdf = (title, content, filename) => generateDocument({ type: "pdf", title, content, filename });
  const createXlsx = (title, content, filename, sheets) => generateDocument({ type: "xlsx", title, content, filename, sheets });
  const createPptx = (title, content, filename, slides) => generateDocument({ type: "pptx", title, content, filename, slides });

  function createMcpServer() {
    const server = new McpServer({
      name: "oproxy-local-docs",
      version: "1.0.0",
    });

    server.registerTool("get_document_skill", {
      title: "Read document authoring skill",
      description: "Read the bundled skill before creating Word, PDF, Excel or PowerPoint. Includes content quality requirements, formatting and structured input guidance.",
      inputSchema: { type: z.enum(["docx", "pdf", "xlsx", "pptx"]) },
    }, async ({ type }) => ({ content: [{ type: "text", text: skills[type] }] }));

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
          sheets: z.array(sheetSchema).optional().describe("Structured worksheets with numeric cells, cached formulas, optional column formats"),
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
          slides: z.array(slideSchema).optional().describe("Structured slides: bullets, comparison, metrics, timeline, table, chart, section; include speaker notes"),
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
      const candidate=createServer(expressApp);
      candidate.once("error",reject);
      candidate.listen(port,"127.0.0.1",()=>{
        candidate.removeListener("error",reject);
        httpServer=candidate;
        resolve();
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
    generateDocument,
  };
}
