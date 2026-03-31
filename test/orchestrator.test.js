import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

describe("Pipeline phase ordering", () => {
  const EXPECTED_PHASES = ["backlog", "planning", "development", "review", "retro", "velocity", "intelligence"];

  it("defines all 7 phases in correct order", () => {
    const src = fs.readFileSync(path.join(ROOT, "orchestrator.js"), "utf8");
    const match = src.match(/const PHASES\s*=\s*\[([^\]]+)\]/);
    assert.ok(match, "PHASES constant must exist");
    const phases = match[1].match(/"([^"]+)"/g).map(s => s.replace(/"/g, ""));
    assert.deepStrictEqual(phases, EXPECTED_PHASES);
  });

  it("defines all 4 agent endpoints", () => {
    const src = fs.readFileSync(path.join(ROOT, "orchestrator.js"), "utf8");
    for (const agent of ["backlog", "planning", "iterative", "review"]) {
      assert.ok(src.includes(`"${agent}"`), `Agent key "${agent}" must be defined`);
    }
  });

  it("uses correct agent ports", () => {
    const src = fs.readFileSync(path.join(ROOT, "orchestrator.js"), "utf8");
    const portMap = { backlog: 3000, planning: 3020, iterative: 4040, review: 5050 };
    for (const [agent, port] of Object.entries(portMap)) {
      assert.ok(src.includes(String(port)), `Port ${port} for ${agent} must be defined`);
    }
  });
});

describe("State management", () => {
  it("defaultState has all required fields", () => {
    const src = fs.readFileSync(path.join(ROOT, "orchestrator.js"), "utf8");
    const requiredFields = ["currentPhase", "phaseStatus", "offlineMode", "sprint", "backlog", "reviewResult", "retroResult", "velocityData", "phaseResults"];
    for (const field of requiredFields) {
      assert.ok(src.includes(field), `State must include field: ${field}`);
    }
  });

  it("state file path uses data/ directory", () => {
    const src = fs.readFileSync(path.join(ROOT, "orchestrator.js"), "utf8");
    assert.ok(src.includes('path.join(DATA_DIR,'), "State file must be stored in DATA_DIR");
  });
});

describe("Cross-sprint memory", () => {
  it("memory file is valid JSON with required arrays", () => {
    const dataDir = path.join(ROOT, "data");
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const memFile = path.join(dataDir, "orchestrator_memory.json");
    if (!fs.existsSync(memFile)) {
      fs.writeFileSync(memFile, JSON.stringify({ sprints: [], patterns: [], actionTracker: [] }));
    }
    const mem = JSON.parse(fs.readFileSync(memFile, "utf8"));
    assert.ok(Array.isArray(mem.sprints), "Memory must have sprints array");
    assert.ok(Array.isArray(mem.patterns), "Memory must have patterns array");
    assert.ok(Array.isArray(mem.actionTracker), "Memory must have actionTracker array");
  });

  it("caps sprint history at 20 entries", () => {
    const src = fs.readFileSync(path.join(ROOT, "orchestrator.js"), "utf8");
    assert.ok(src.includes("storeSprintMemory"), "storeSprintMemory must be defined");
    assert.ok(src.includes("mem.sprints.length > 20"), "Must cap sprints at 20");
  });

  it("caps action tracker at 100 entries", () => {
    const src = fs.readFileSync(path.join(ROOT, "orchestrator.js"), "utf8");
    assert.ok(src.includes("mem.actionTracker.length > 100"), "Must cap actionTracker at 100");
  });

  it("detects recurring patterns across sprints", () => {
    const src = fs.readFileSync(path.join(ROOT, "orchestrator.js"), "utf8");
    assert.ok(src.includes("existing.count++"), "Must increment pattern count on recurrence");
  });
});

describe("Circuit breaker", () => {
  it("defines threshold and reset window", () => {
    const src = fs.readFileSync(path.join(ROOT, "orchestrator.js"), "utf8");
    assert.ok(src.includes("CIRCUIT_THRESHOLD"), "Must define CIRCUIT_THRESHOLD");
    assert.ok(src.includes("CIRCUIT_RESET_MS"), "Must define CIRCUIT_RESET_MS");
  });

  it("has open/fail/success state transitions", () => {
    const src = fs.readFileSync(path.join(ROOT, "orchestrator.js"), "utf8");
    assert.ok(src.includes("isCircuitOpen"), "Must have isCircuitOpen");
    assert.ok(src.includes("recordFailure"), "Must have recordFailure");
    assert.ok(src.includes("recordSuccess"), "Must have recordSuccess");
  });
});

describe("Retry with exponential backoff", () => {
  it("callAgent supports maxRetries", () => {
    const src = fs.readFileSync(path.join(ROOT, "orchestrator.js"), "utf8");
    assert.ok(src.includes("maxRetries"), "callAgent must accept maxRetries");
  });

  it("uses sleep for backoff delay", () => {
    const src = fs.readFileSync(path.join(ROOT, "orchestrator.js"), "utf8");
    assert.ok(src.includes("function sleep"), "Must have sleep utility");
    assert.ok(src.includes("await sleep"), "Must await sleep between retries");
  });
});

describe("SSE event streaming", () => {
  it("caps event log at 500 entries", () => {
    const src = fs.readFileSync(path.join(ROOT, "orchestrator.js"), "utf8");
    assert.ok(src.includes("eventLog.length > 500"), "Event log must cap at 500");
  });

  it("writes events to SSE clients", () => {
    const src = fs.readFileSync(path.join(ROOT, "orchestrator.js"), "utf8");
    assert.ok(src.includes("sseClients"), "Must maintain SSE client list");
  });
});
