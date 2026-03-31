import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

describe("MCP server tool registration", () => {
  const EXPECTED_TOOLS = [
    "refine_backlog",
    "plan_sprint",
    "evaluate_work_products",
    "run_sprint_review",
    "run_retrospective",
    "get_velocity",
    "run_full_cycle",
    "get_intelligence_report",
    "run_manager_evaluation",
    "get_agent_health",
    "get_daily_status"
  ];

  it("registers all 11 MCP tools", () => {
    const src = fs.readFileSync(path.join(ROOT, "mcp_server.js"), "utf8");
    for (const tool of EXPECTED_TOOLS) {
      assert.ok(src.includes(`"${tool}"`), `MCP tool "${tool}" must be registered`);
    }
  });

  it("uses McpServer from @modelcontextprotocol/sdk", () => {
    const src = fs.readFileSync(path.join(ROOT, "mcp_server.js"), "utf8");
    assert.ok(src.includes("McpServer"), "Must import McpServer");
    assert.ok(src.includes("StdioServerTransport"), "Must use StdioServerTransport");
  });

  it("uses zod for input validation", () => {
    const src = fs.readFileSync(path.join(ROOT, "mcp_server.js"), "utf8");
    assert.ok(src.includes('from "zod"'), "Must import zod for schema validation");
  });

  it("defines all 5 agent endpoints", () => {
    const src = fs.readFileSync(path.join(ROOT, "mcp_server.js"), "utf8");
    const ports = [3000, 3020, 4040, 5050, 6060];
    for (const port of ports) {
      assert.ok(src.includes(String(port)), `Must define agent on port ${port}`);
    }
  });
});
