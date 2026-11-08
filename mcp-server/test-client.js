import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

const token = process.env.MCP_TOKEN || "testtoken";
const authHeaders = { Authorization: `Bearer ${token}` };

const transport = new SSEClientTransport(
  new URL(process.env.MCP_URL || "http://127.0.0.1:3333/sse"),
  {
    eventSourceInit: {
      fetch: (url, init) => {
        const headers = new Headers(init.headers || {});
        headers.set("Authorization", `Bearer ${token}`);
        return fetch(url, { ...init, headers });
      },
    },
    requestInit: { headers: authHeaders },
  },
);

const client = new Client({ name: "oproxy-mcp-test", version: "1.0.0" });
await client.connect(transport);

const tools = await client.listTools();
console.log("TOOLS", JSON.stringify(tools, null, 2));

const result = await client.callTool({
  name: "create_docx",
  arguments: {
    title: "MCP 本地测试",
    content:
      "# 一、简介\n\n这是通过本地 MCP 服务器生成的测试文档。\n\n- 第一条\n- 第二条\n\n## 二、结论\n\nMCP 链路正常。",
    filename: "MCP本地测试.docx",
  },
});

console.log("RESULT", JSON.stringify(result, null, 2));
await client.close();
