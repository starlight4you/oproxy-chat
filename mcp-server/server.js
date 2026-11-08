import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PORT = Number(process.env.MCP_PORT || 3333);
const TOKEN = process.env.MCP_TOKEN || "";
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");

if (!TOKEN) {
  console.error("MCP_TOKEN is required");
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: "20mb" }));

const files = new Map();
const transports = new Map();

function sanitizeFilename(value) {
  const name = String(value || "Oproxy 文档")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return name || "Oproxy 文档";
}

function uniqueDownloadPath(filename) {
  const directory = path.join(os.homedir(), "Downloads");
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
  const url = PUBLIC_BASE_URL ? `${PUBLIC_BASE_URL}/files/${fileId}` : null;

  try {
    execFile("open", ["-R", filePath], () => {});
  } catch {
    // Finder reveal is best-effort.
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
          .describe("Full document content in Markdown (headings, paragraphs, bullets)"),
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

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/mcp", async (req, res) => {
  const authorization = req.headers.authorization || "";
  if (authorization !== `Bearer ${TOKEN}`) {
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

app.get("/mcp", (_req, res) => {
  res.status(405).json({ error: "Method not allowed" });
});

app.delete("/mcp", (_req, res) => {
  res.status(405).json({ error: "Method not allowed" });
});

app.get("/sse", async (req, res) => {
  const authorization = req.headers.authorization || "";
  if (authorization !== `Bearer ${TOKEN}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const transport = new SSEServerTransport("/messages", res);
  transports.set(transport.sessionId, transport);
  res.on("close", () => {
    transports.delete(transport.sessionId);
  });

  const server = createMcpServer();
  await server.connect(transport);
  console.log(`[mcp] SSE connected: ${transport.sessionId}`);
});

app.post("/messages", async (req, res) => {
  const sessionId = String(req.query.sessionId || "");
  const transport = transports.get(sessionId);

  if (!transport) {
    res.status(401).json({ error: "Invalid session" });
    return;
  }

  await transport.handlePostMessage(req, res, req.body);
});

app.get("/files/:id", (req, res) => {
  const entry = files.get(req.params.id);
  if (!entry) {
    res.status(404).send("Not found");
    return;
  }

  res.download(entry.path, entry.name);
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`[mcp] listening on http://127.0.0.1:${PORT}`);
  console.log(`[mcp] public base: ${PUBLIC_BASE_URL || "(not set)"}`);
});
