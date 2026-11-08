import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const token = process.env.MCP_TOKEN;
const url = process.env.MCP_URL;

if (!token || !url) {
  console.error("MCP_TOKEN and MCP_URL are required");
  process.exit(1);
}

const transport = new StreamableHTTPClientTransport(new URL(url), {
  requestInit: {
    headers: { Authorization: `Bearer ${token}` },
  },
});

const client = new Client({ name: "oproxy-mcp-tunnel-test", version: "1.0.0" });
await client.connect(transport);

const tools = await client.listTools();
console.log("TOOLS", JSON.stringify(tools, null, 2));

const result = await client.callTool({
  name: "create_docx",
  arguments: {
    title: "MCP 隧道测试",
    content:
      "# 一、简介\n\n这是通过 cloudflared 隧道调用本地 MCP 服务器生成的文档。\n\n- 链路正常\n- 文件保存在下载文件夹",
    filename: "MCP隧道测试.docx",
  },
});

console.log("RESULT", JSON.stringify(result, null, 2));
await client.close();
