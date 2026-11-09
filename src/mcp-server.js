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
import { randomUUID } from "node:crypto";
import express from "express";
import fs from "node:fs";
import path from "node:path";

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
    const safeTitle = sanitizeFilename(filename || title);
    const name = safeTitle.toLowerCase().endsWith(".docx")
      ? safeTitle
      : `${safeTitle}.docx`;
    const filePath = uniqueDownloadPath(name);

    await fs.promises.writeFile(filePath, buffer);

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
              "Full document content in Markdown (headings, paragraphs, bullets)",
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
