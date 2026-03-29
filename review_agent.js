import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import chalk from "chalk";
import { v4 as uuidv4 } from "uuid";
import { apiLimiter, sanitizeInput } from "./middleware.js";

import { AzureChatOpenAI } from "@langchain/openai";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import { OllamaEmbeddings } from "@langchain/ollama";
import { RunnableSequence } from "@langchain/core/runnables";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadLocalEnvMap(filePath = ".env") {
  try {
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, "utf8");
    const result = {};
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex <= 0) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      const hashIndex = value.indexOf("#");
      if (hashIndex >= 0) value = value.slice(0, hashIndex).trim();
      value = value.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
      result[key] = value;
    }
    return result;
  } catch {
    return {};
  }
}

const localEnv = loadLocalEnvMap();

const PORT = Number(process.env.PORT || 5050);
const DATA_DIR = "data";
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const FEEDBACK_DB = path.join(DATA_DIR, "review-feedback.json");
const AUDIT_LOG = path.join(DATA_DIR, "review-audit.json");
const RETRO_ACTIONS_DB = path.join(DATA_DIR, "retro-actions.json");
const KB_CANDIDATES = [path.join(DATA_DIR, "knowledge.json"), path.join(DATA_DIR, "knowledge_base.json")];
const JIRA_BASE_URL = process.env.JIRA_BASE || process.env.JIRA_BASE_URL || localEnv.JIRA_BASE_URL || "";
const JIRA_EMAIL = process.env.JIRA_EMAIL || localEnv.JIRA_EMAIL || "";
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN || localEnv.JIRA_API_TOKEN || "";
const JIRA_STORY_POINTS_FIELD = process.env.JIRA_STORY_POINTS_FIELD || "customfield_10016";
const MS_GRAPH_BASE = "https://graph.microsoft.com/v1.0";

const SIM_WORK_PRODUCTS = {
  best: {
    ticketId: "AP-44",
    status: "Done",
    acceptanceCriteria: [
      "Diagnostic log export includes all expected log files",
      "Manifest-driven bundling validates file list before export",
      "Export succeeds on both Windows and Linux targets",
      "Unit tests cover missing-file edge cases"
    ],
    implementation: [
      "Diagnostic log export includes all expected log files",
      "Manifest-driven bundling validates file list before export",
      "Export succeeds on both Windows and Linux targets",
      "Unit tests cover missing-file edge cases"
    ],
    tests: { passed: 18, failed: 0 },
    coverage: 86,
    prSummary: "Log export bundle — all criteria met, PR merged, Linux edge cases fixed."
  },
  good: {
    ticketId: "AP-43",
    status: "Done",
    acceptanceCriteria: [
      "OTA progress completes to 100% under poor network",
      "Retry logic with exponential backoff on download failure",
      "Progress reporting decoupled from actual download state",
      "Timeout fallback triggers after 5 minutes of no progress"
    ],
    implementation: [
      "OTA progress completes to 100% under poor network",
      "Retry logic with exponential backoff on download failure",
      "Progress reporting decoupled from actual download state",
      "Timeout fallback triggers after 5 minutes of no progress"
    ],
    tests: { passed: 16, failed: 0 },
    coverage: 82,
    prSummary: "OTA progress — all scenarios handled, retry + timeout + poor network covered."
  },
  solid: {
    ticketId: "AP-42",
    status: "Done",
    acceptanceCriteria: [
      "Fleet dashboard REST API returns vehicle status within 200ms",
      "API supports pagination with cursor-based navigation",
      "Authentication via JWT with role-based access"
    ],
    implementation: [
      "Fleet dashboard REST API returns vehicle status within 200ms",
      "API supports pagination with cursor-based navigation",
      "Authentication via JWT with role-based access"
    ],
    tests: { passed: 14, failed: 0 },
    coverage: 79,
    prSummary: "Fleet dashboard API — all endpoints implemented, JWT auth and pagination verified."
  },
  bugfix: {
    ticketId: "AP-41",
    status: "Done",
    acceptanceCriteria: [
      "Memory leak in telemetry collector resolved",
      "Heap usage stays below 150MB over 24h stress test",
      "No regression in telemetry data accuracy"
    ],
    implementation: [
      "Memory leak in telemetry collector resolved",
      "Heap usage stays below 150MB over 24h stress test",
      "No regression in telemetry data accuracy"
    ],
    tests: { passed: 10, failed: 0 },
    coverage: 85,
    prSummary: "Telemetry memory leak — root cause identified and patched, stress test passing."
  },
  techdebt: {
    ticketId: "AP-39",
    status: "Done",
    acceptanceCriteria: [
      "Config parser migrated from XML to JSON schema",
      "Backward compatibility maintained for existing configs"
    ],
    implementation: [
      "Config parser migrated from XML to JSON schema",
      "Backward compatibility maintained for existing configs"
    ],
    tests: { passed: 8, failed: 0 },
    coverage: 91,
    prSummary: "Config parser refactor — JSON schema migration complete, backward compat verified."
  },
  bad: {
    ticketId: "AP-40",
    status: "Done",
    acceptanceCriteria: [
      "System rollbacks to previous firmware if post-OTA boot fails",
      "Dual-partition boot scheme validated",
      "Rollback event logged with timestamp and reason",
      "Alert sent to monitoring dashboard on rollback"
    ],
    implementation: [
      "Rollback event logged with timestamp and reason"
    ],
    tests: { passed: 3, failed: 4 },
    coverage: 38,
    prSummary: "OTA rollback — only logging done, boot scheme and alerts not implemented."
  },
  partial: {
    ticketId: "AP-38",
    status: "Done",
    acceptanceCriteria: [
      "Real-time alert pipeline processes events within 500ms",
      "Alert deduplication over sliding 5-minute window",
      "Dashboard widget displays last 50 alerts with severity",
      "Email notification for critical alerts"
    ],
    implementation: [
      "Real-time alert pipeline processes events within 500ms",
      "Alert deduplication over sliding 5-minute window"
    ],
    tests: { passed: 6, failed: 3 },
    coverage: 58,
    prSummary: "Real-time alerts — pipeline and dedup done, dashboard widget and email not implemented."
  },
  worst: {
    ticketId: "BRAKING-1",
    status: "In Progress",
    acceptanceCriteria: [
      "Sensor integration test covers 5 collision scenarios",
      "Camera-radar fusion latency under 50ms",
      "Emergency braking triggers within 200ms of detection",
      "False positive rate below 1%"
    ],
    implementation: [
      "Sensor integration test covers 5 collision scenarios"
    ],
    tests: { passed: 3, failed: 2 },
    coverage: 45,
    prSummary: "Braking collision detection — sensor tests partial, fusion delay unresolved."
  }
};

const SIM_SPRINT_TICKETS = [
  { ...SIM_WORK_PRODUCTS.best, storyPoints: 5 },
  { ...SIM_WORK_PRODUCTS.good, storyPoints: 5 },
  { ...SIM_WORK_PRODUCTS.solid, storyPoints: 3 },
  { ...SIM_WORK_PRODUCTS.bugfix, storyPoints: 3 },
  { ...SIM_WORK_PRODUCTS.techdebt, storyPoints: 2 },
  { ...SIM_WORK_PRODUCTS.bad, storyPoints: 5 },
  { ...SIM_WORK_PRODUCTS.partial, storyPoints: 5 },
  { ...SIM_WORK_PRODUCTS.worst, storyPoints: 8 }
];

const SIM_TEAMS_REVIEW_CASES = {
  best: {
    id: "review-teams-best-001",
    transcript: "PO: AP-44 log export demo looked complete — all four criteria met, Linux edge cases fixed, PR merged. Stakeholder: Good recovery from the iterative sprint issues. Scrum Master: AP-44 is ready to close."
  },
  good: {
    id: "review-teams-good-001",
    transcript: "PO: AP-44 is fully done, great work. AP-43 OTA progress has improved — retry and timeout working, but poor network scenario still has 2 test failures. Stakeholder: Acceptable progress. Scrum Master: Carry AP-43 remaining work and AP-40 rework to next sprint."
  },
  bad: {
    id: "review-teams-bad-001",
    transcript: "PO: AP-40 OTA rollback is still mostly unimplemented — only logging done. Stakeholder: This was a critical item, very disappointed. Braking detection also incomplete. Scrum Master: Move AP-40 and braking to next sprint with rework tasks."
  },
  worst: {
    id: "review-teams-worst-001",
    transcript: "PO: AP-40 was marked Done but only logging is implemented — boot scheme and alerts are missing. Stakeholder: Reject this item. Braking detection blocked on sensor issues. Scrum Master: Re-open AP-40, escalate braking dependencies."
  }
};

const llm = new AzureChatOpenAI({
  azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY || localEnv.AZURE_OPENAI_API_KEY || "<YOUR_KEY>",
  azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_API_INSTANCE_NAME || localEnv.AZURE_OPENAI_API_INSTANCE_NAME || "<YOUR_INSTANCE>",
  azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME || localEnv.AZURE_OPENAI_API_DEPLOYMENT_NAME || "<YOUR_DEPLOYMENT>",
  azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION || localEnv.AZURE_OPENAI_API_VERSION || "2024-04-01-preview",
  temperature: 0.2
});

if (!fs.existsSync(FEEDBACK_DB)) fs.writeFileSync(FEEDBACK_DB, "[]");
if (!fs.existsSync(AUDIT_LOG)) fs.writeFileSync(AUDIT_LOG, "[]");
if (!fs.existsSync(RETRO_ACTIONS_DB)) fs.writeFileSync(RETRO_ACTIONS_DB, "[]");

function readJsonFile(file, fallback = []) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonFile(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function parseJsonFromText(raw) {
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function previewPayload(raw) {
  if (typeof raw === "string") return raw.slice(0, 240);
  try {
    return JSON.stringify(raw).slice(0, 240);
  } catch {
    return "unserializable payload";
  }
}

function formatNetworkError(err) {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  return err.message || String(err);
}

function isGatewayTimeoutPayload(raw) {
  if (!raw || typeof raw !== "string") return false;
  const text = raw.toLowerCase();
  return text.includes("error code: 504") || text.includes("operation timed out") || text.includes("gateway server");
}

async function jiraFetchJson(url, options = {}, label = "JIRA request") {
  const maxAttempts = 3;
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, options);
      const rawBody = await response.text();
      if (isGatewayTimeoutPayload(rawBody)) {
        throw new Error(`${label} timed out through proxy/gateway. Payload preview: ${previewPayload(rawBody)}`);
      }
      if (!response.ok) {
        throw new Error(`${label} failed: HTTP ${response.status}. Payload preview: ${previewPayload(rawBody)}`);
      }
      const data = rawBody ? JSON.parse(rawBody) : {};
      return { status: response.status, data };
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) await sleep(1000 * attempt);
    }
  }
  throw new Error(`${label} failed after ${maxAttempts} attempts: ${formatNetworkError(lastError)}`);
}

function getJiraAuthHeaders(includeJsonContentType = false) {
  const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64");
  const headers = {
    Authorization: `Basic ${auth}`,
    Accept: "application/json"
  };
  if (includeJsonContentType) headers["Content-Type"] = "application/json";
  return headers;
}

function jiraDocToText(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(jiraDocToText).join(" ");
  if (typeof value === "object") {
    if (typeof value.text === "string") return value.text;
    if (Array.isArray(value.content)) return value.content.map(jiraDocToText).join(" ");
  }
  return "";
}

function extractAcceptanceCriteriaFromText(text, fallbackSummary = "") {
  const raw = String(text || "").trim();
  if (!raw) return fallbackSummary ? [fallbackSummary] : [];
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const extracted = lines.filter(line => /^(-|\*|\d+\.|ac[:\s])/i.test(line)).map(line => line.replace(/^(-|\*|\d+\.|ac[:\s]+)/i, "").trim()).filter(Boolean);
  if (extracted.length) return extracted;
  return fallbackSummary ? [fallbackSummary] : [raw.slice(0, 120)];
}

function toReviewTicketFromJiraIssue(issue = {}) {
  const fields = issue.fields || {};
  const summary = String(fields.summary || issue.key || "Untitled");
  const description = jiraDocToText(fields.description);
  const acceptanceCriteria = extractAcceptanceCriteriaFromText(description, summary);
  const implementation = [summary, ...extractAcceptanceCriteriaFromText(description)].slice(0, 6);
  const sp = Number(fields[JIRA_STORY_POINTS_FIELD]);
  return {
    ticketId: String(issue.key || ""),
    status: String(fields.status?.name || ""),
    storyPoints: Number.isFinite(sp) ? sp : 0,
    acceptanceCriteria,
    implementation,
    tests: { passed: 0, failed: 0 },
    coverage: 0,
    prSummary: summary
  };
}

async function fetchJiraSprintTickets({ sprintId, boardId }) {
  if (!JIRA_API_TOKEN || !JIRA_EMAIL || !JIRA_BASE_URL) {
    throw new Error("Missing JIRA credentials. Set JIRA_BASE/JIRA_EMAIL/JIRA_API_TOKEN.");
  }
  const rootUrl = JIRA_BASE_URL.replace(/\/$/, "");
  let effectiveSprintId = Number(sprintId);

  if (!Number.isInteger(effectiveSprintId) || effectiveSprintId <= 0) {
    const numericBoardId = Number(boardId);
    if (!Number.isInteger(numericBoardId) || numericBoardId <= 0) {
      throw new Error("Provide numeric sprintId, or boardId to auto-detect active sprint.");
    }
    const sprintUrl = `${rootUrl}/rest/agile/1.0/board/${numericBoardId}/sprint?state=active&maxResults=20`;
    const sprintResp = await jiraFetchJson(sprintUrl, { method: "GET", headers: getJiraAuthHeaders() }, "Fetch active sprint");
    const sprints = Array.isArray(sprintResp.data?.values) ? sprintResp.data.values : [];
    if (!sprints.length) throw new Error(`No active sprint found for board ${numericBoardId}.`);
    effectiveSprintId = Number(sprints[0].id);
  }

  const issuesUrl = `${rootUrl}/rest/agile/1.0/sprint/${effectiveSprintId}/issue?maxResults=100`;
  const issueResp = await jiraFetchJson(issuesUrl, { method: "GET", headers: getJiraAuthHeaders() }, `Fetch sprint ${effectiveSprintId} issues`);
  const issues = Array.isArray(issueResp.data?.issues) ? issueResp.data.issues : [];
  return {
    sprintId: effectiveSprintId,
    tickets: issues.map(toReviewTicketFromJiraIssue)
  };
}

async function fetchTeamsTranscriptFromGraph({ meetingId, token }) {
  const trimmedId = String(meetingId || "").trim();
  const trimmedToken = String(token || "").trim();
  if (!trimmedId) throw new Error("meetingId is required for Microsoft Graph transcript fetch.");
  if (!trimmedToken) throw new Error("token is required for Microsoft Graph transcript fetch.");
  const listUrl = `${MS_GRAPH_BASE}/me/onlineMeetings/${encodeURIComponent(trimmedId)}/transcripts`;
  const listResp = await axios.get(listUrl, { headers: { Authorization: `Bearer ${trimmedToken}` }, timeout: 15000 });
  const values = Array.isArray(listResp.data?.value) ? listResp.data.value : [];
  if (!values.length) throw new Error("No transcripts found for given meeting.");
  const latest = values[values.length - 1];
  const contentUrl = `${MS_GRAPH_BASE}/me/onlineMeetings/${encodeURIComponent(trimmedId)}/transcripts/${encodeURIComponent(latest.id)}/content`;
  const contentResp = await axios.get(contentUrl, { headers: { Authorization: `Bearer ${trimmedToken}` }, timeout: 15000 });
  return {
    transcriptId: latest.id,
    transcript: typeof contentResp.data === "string" ? contentResp.data : JSON.stringify(contentResp.data || "")
  };
}

async function extractFeedbackFromTranscript(transcript, extra = {}) {
  const prompt = `
Extract sprint review stakeholder feedback from transcript.
Transcript: ${transcript}
Context: ${JSON.stringify(extra)}
Return strict JSON:
{
  "stakeholder":"Product Owner",
  "sentiment":"positive|neutral|negative",
  "feedback":"",
  "followUpTickets":[]
}
`;
  let parsed = null;
  try {
    const res = await llm.invoke([{ role: "user", content: prompt }]);
    parsed = parseJsonFromText(typeof res?.content === "string" ? res.content : "");
  } catch {}
  return {
    stakeholder: String(parsed?.stakeholder || "Stakeholder"),
    sentiment: String(parsed?.sentiment || "neutral"),
    feedback: String(parsed?.feedback || transcript.slice(0, 220)),
    followUpTickets: Array.isArray(parsed?.followUpTickets) ? parsed.followUpTickets : []
  };
}

function audit(event) {
  const logs = readJsonFile(AUDIT_LOG, []);
  logs.push({
    id: uuidv4(),
    time: new Date().toISOString(),
    ...event
  });
  writeJsonFile(AUDIT_LOG, logs);
}

function normalizeTextSet(values) {
  return new Set(
    (Array.isArray(values) ? values : [])
      .map(v => String(v || "").toLowerCase().trim())
      .filter(Boolean)
  );
}

function evaluateWorkProductRuleBased(workProduct = {}) {
  const acceptance = normalizeTextSet(workProduct.acceptanceCriteria);
  const implementation = normalizeTextSet(workProduct.implementation);
  const implementedCount = Array.from(acceptance).filter(c => implementation.has(c)).length;
  const totalCriteria = acceptance.size || 1;
  const acceptanceCoveragePercent = Math.round((implementedCount / totalCriteria) * 100);

  const passed = Number(workProduct.tests?.passed || 0);
  const failed = Number(workProduct.tests?.failed || 0);
  const totalTests = passed + failed;
  const testFailureRatePercent = totalTests > 0 ? Math.round((failed / totalTests) * 100) : 100;
  const codeCoveragePercent = Number(workProduct.coverage || 0);

  let risk = 0;
  const rationale = [];
  const recommendations = [];

  if (acceptanceCoveragePercent < 100) {
    rationale.push(`Only ${implementedCount}/${totalCriteria} acceptance criteria are implemented.`);
    risk += 2;
    recommendations.push("Complete all acceptance criteria before review sign-off.");
  } else {
    rationale.push("All acceptance criteria are currently covered.");
  }

  if (failed > 0) {
    rationale.push(`${failed} tests are failing.`);
    risk += 2;
    recommendations.push("Fix failing tests and re-run regression suite.");
  } else if (passed > 0) {
    rationale.push(`All ${passed} executed tests passed.`);
  } else {
    rationale.push("No test evidence provided.");
    risk += 2;
    recommendations.push("Attach test execution evidence.");
  }

  if (codeCoveragePercent < 70) {
    rationale.push(`Code coverage is low (${codeCoveragePercent}%).`);
    risk += 1;
    recommendations.push("Raise code coverage to at least 70%.");
  } else {
    rationale.push(`Code coverage is ${codeCoveragePercent}%.`);
  }

  const status = risk >= 5 ? "Critical Failure" : risk >= 3 ? "High Risk" : risk >= 2 ? "At Risk" : "On Track";
  const confidence = Math.max(50, Math.min(95, Math.round(92 - risk * 8)));

  return {
    status,
    confidence,
    rationale,
    recommendations,
    metrics: {
      acceptanceCoveragePercent,
      testFailureRatePercent,
      codeCoveragePercent
    }
  };
}

let vectorStore = null;
async function initVectorStore() {
  const feedback = readJsonFile(FEEDBACK_DB, []);
  const kbFile = KB_CANDIDATES.find(file => fs.existsSync(file));
  const kb = kbFile ? readJsonFile(kbFile, []) : [];

  const docs = [
    ...feedback.map(f => ({ pageContent: JSON.stringify(f) })),
    ...kb.map(k => ({ pageContent: String(k.text || `${k.summary || ""}\n${k.description || ""}`.trim()) }))
  ];

  if (!docs.length) {
    vectorStore = null;
    return;
  }

  try {
    vectorStore = await MemoryVectorStore.fromDocuments(
      docs,
      new OllamaEmbeddings({ model: "nomic-embed-text" })
    );
  } catch {
    vectorStore = null;
  }
}

async function getContext(query) {
  if (!vectorStore) return "";
  const docs = await vectorStore.similaritySearch(query, 3);
  return docs.map(d => d.pageContent).join("\n");
}

async function foundryExtract(text) {
  try {
    const res = await axios.post(
      "http://localhost:3000/extract",
      { input: text, model_alias: "phi" },
      { timeout: 10000 }
    );
    return res.data?.result || { blockers: [], tasks: [], gaps: [] };
  } catch {
    return { blockers: [], tasks: [], gaps: [] };
  }
}

const reviewChain = RunnableSequence.from([
  async (input) => {
    const foundry = await foundryExtract(JSON.stringify(input.workProduct || {}));
    const context = await getContext(JSON.stringify(input.workProduct || {}));
    return { ...input, foundry, context };
  },
  async (data) => {
    const ruleEval = evaluateWorkProductRuleBased(data.workProduct || {});
    return { ...data, ruleEval };
  },
  async (data) => {
    const prompt = `
You are a Sprint Review AI for Agile delivery governance.
Decide if the sprint item is truly done.

WorkProduct: ${JSON.stringify(data.workProduct)}
RuleEvaluation: ${JSON.stringify(data.ruleEval)}
FoundryOutput: ${JSON.stringify(data.foundry)}
HistoricalContext: ${data.context}

Return strict JSON:
{
  "decision":"On Track|At Risk|High Risk|Critical Failure",
  "summary":"",
  "risks":[],
  "recommendations":[],
  "confidence":0,
  "rationale":[]
}
`;
    try {
      const res = await llm.invoke([{ role: "user", content: prompt }]);
      return parseJsonFromText(typeof res?.content === "string" ? res.content : "");
    } catch {
      return null;
    }
  }
]);

function validateLLMOutput(parsed, schema = {}) {
  const warnings = [];
  if (!parsed || typeof parsed !== "object") return { valid: false, warnings: ["LLM returned non-object output"], sanitized: null };
  if (schema.requiredFields) {
    for (const f of schema.requiredFields) {
      if (!(f in parsed)) warnings.push(`Missing required field: ${f}`);
    }
  }
  if ("confidence" in parsed) {
    const c = Number(parsed.confidence);
    if (!Number.isFinite(c) || c < 0 || c > 100) {
      warnings.push(`Confidence ${parsed.confidence} out of bounds [0-100], clamped`);
      parsed.confidence = Math.max(0, Math.min(100, c || 0));
    }
  }
  if ("decision" in parsed) {
    const allowed = ["On Track", "At Risk", "High Risk", "Critical Failure"];
    if (!allowed.includes(parsed.decision)) {
      warnings.push(`Unexpected decision value: "${parsed.decision}", defaulting to "At Risk"`);
      parsed.decision = "At Risk";
    }
  }
  const jsonStr = JSON.stringify(parsed);
  const piiPatterns = [/\b\d{3}-\d{2}-\d{4}\b/, /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}\b/i];
  for (const pat of piiPatterns) {
    if (pat.test(jsonStr)) warnings.push("Potential PII detected in LLM output");
  }
  return { valid: warnings.length === 0, warnings, sanitized: parsed };
}

function buildResponsibleEnvelope({ aiEval, ruleEval, foundryUsed, ragUsed, ticketId }) {
  let llmValidation = { valid: true, warnings: [] };
  if (aiEval) {
    llmValidation = validateLLMOutput(aiEval, { requiredFields: ["decision", "confidence", "summary"] });
    if (llmValidation.sanitized) Object.assign(aiEval, llmValidation.sanitized);
  }
  const decision = aiEval?.decision || ruleEval.status;
  const confidence = Number.isFinite(Number(aiEval?.confidence)) ? Number(aiEval.confidence) : ruleEval.confidence;
  const rationale = Array.isArray(aiEval?.rationale) && aiEval.rationale.length
    ? aiEval.rationale
    : ruleEval.rationale;
  const recommendations = Array.isArray(aiEval?.recommendations) && aiEval.recommendations.length
    ? aiEval.recommendations
    : ruleEval.recommendations;
  const risks = Array.isArray(aiEval?.risks)
    ? aiEval.risks
    : (decision === "On Track" ? [] : ["Potential delivery risk based on deterministic checks."]);

  return {
    ticketId: ticketId || "",
    decision,
    summary: String(aiEval?.summary || `Sprint review result: ${decision}`),
    risks,
    recommendations,
    confidence,
    rationale,
    metrics: ruleEval.metrics,
    dataSources: [
      "RuleEngine",
      foundryUsed ? "FoundryLocal" : "FoundryLocal (fallback)",
      ragUsed ? "RAG" : "RAG (unavailable)",
      "AzureLLM"
    ],
    requiresValidation: true,
    llmValidation
  };
}

async function runReview(workProduct, options = {}) {
  const ruleEval = evaluateWorkProductRuleBased(workProduct);
  const foundrySnapshot = await foundryExtract(JSON.stringify(workProduct));
  const context = await getContext(JSON.stringify(workProduct));
  const foundryUsed = Array.isArray(foundrySnapshot?.tasks) || Array.isArray(foundrySnapshot?.blockers);
  const ragUsed = Boolean(context);

  let aiEval = null;
  if (!options.offline) {
    try { aiEval = await reviewChain.invoke({ workProduct }); } catch { aiEval = null; }
  }

  return buildResponsibleEnvelope({
    aiEval,
    ruleEval,
    foundryUsed,
    ragUsed,
    ticketId: String(workProduct.ticketId || "")
  });
}

function isTicketDone(status) {
  const normalized = String(status || "").trim().toLowerCase();
  return normalized === "done" || normalized === "closed" || normalized === "resolved";
}

async function getDefaultSimulatedStakeholderFeedback(sprintId = "SIM-SPRINT-1") {
  const selected = SIM_TEAMS_REVIEW_CASES.good;
  const extracted = await extractFeedbackFromTranscript(selected.transcript, {
    sprintId,
    source: "simulated-default",
    caseKey: "good"
  });
  return [{
    source: "simulated-default",
    caseKey: "good",
    transcriptId: selected.id,
    ...extracted
  }];
}

function toBacklogUpdates({ spillover, incorrectImplementation, stakeholderFeedback }) {
  const updates = [];
  for (const item of spillover) {
    updates.push({
      type: "carryover",
      ticketId: item.ticketId,
      title: `Carryover ${item.ticketId} to next sprint`,
      description: item.reason,
      priority: "high"
    });
  }
  for (const item of incorrectImplementation) {
    updates.push({
      type: "rework",
      ticketId: item.ticketId,
      title: `Rework ${item.ticketId} in next sprint`,
      description: `Correct implementation issues. Decision: ${item.decision}`,
      priority: "high"
    });
  }
  for (const fb of stakeholderFeedback) {
    const base = String(fb.feedback || "").trim();
    if (!base) continue;
    updates.push({
      type: "stakeholder_feedback",
      ticketId: "",
      title: "Stakeholder feedback follow-up",
      description: base,
      priority: String(fb.sentiment || "").toLowerCase() === "negative" ? "high" : "medium"
    });
  }
  return updates;
}

async function evaluateSprintTickets(tickets = [], options = {}) {
  const sprintId = String(options?.sprintId || "SIM-SPRINT-1");
  const includeDefaultSimulatedFeedback = options?.includeDefaultSimulatedFeedback !== false;
  let stakeholderFeedback = Array.isArray(options?.stakeholderFeedback)
    ? options.stakeholderFeedback.filter(Boolean)
    : [];
  if (!stakeholderFeedback.length && includeDefaultSimulatedFeedback) {
    stakeholderFeedback = await getDefaultSimulatedStakeholderFeedback(sprintId);
  }

  const reviewedTickets = [];
  const completedCorrectly = [];
  const incorrectImplementation = [];
  const spillover = [];

  for (const ticket of tickets) {
    const current = ticket && typeof ticket === "object" ? ticket : {};
    const ticketId = String(current.ticketId || current.key || "UNKNOWN");
    if (!isTicketDone(current.status)) {
      const item = {
        ticketId,
        status: String(current.status || "Not Done"),
        reason: "Ticket is not in Done/Closed/Resolved state.",
        nextSprintAction: "Carry over to next sprint and finish remaining scope."
      };
      spillover.push(item);
      reviewedTickets.push({
        ticketId,
        decision: "Spillover",
        summary: item.reason,
        requiresValidation: true
      });
      continue;
    }

    const review = await runReview(current, { offline: options.offline || false });
    reviewedTickets.push(review);
    const metricsPass = Number(review.metrics?.acceptanceCoveragePercent ?? 0) === 100
      && Number(review.metrics?.testFailureRatePercent ?? 100) === 0;
    const decisionPass = review.decision === "On Track" || review.decision === "At Risk";
    const isCorrect = metricsPass && (decisionPass || metricsPass);

    if (isCorrect) {
      completedCorrectly.push({
        ticketId,
        summary: metricsPass
          ? "All acceptance criteria met, zero test failures — accepted."
          : `Accepted with decision: ${review.decision}.`
      });
    } else {
      incorrectImplementation.push({
        ticketId,
        decision: review.decision,
        rationale: review.rationale || [],
        nextSprintAction: "Create corrective follow-up ticket in next sprint.",
        recommendations: review.recommendations || []
      });
    }
  }

  const totalTickets = tickets.length;
  const doneCorrectCount = completedCorrectly.length;
  const spilloverCount = spillover.length;
  const incorrectCount = incorrectImplementation.length;
  const completedPercent = totalTickets > 0 ? Math.round((doneCorrectCount / totalTickets) * 100) : 0;
  const hasNegativeStakeholderFeedback = stakeholderFeedback.some(
    fb => String(fb.sentiment || "").toLowerCase() === "negative"
  );

  const decision = (spilloverCount === 0 && incorrectCount === 0 && !hasNegativeStakeholderFeedback)
    ? "Sprint Done"
    : "Sprint Needs Follow-up";
  const recommendations = [
    ...(spilloverCount > 0 ? ["Move spillover tickets to next sprint backlog with clear owners."] : []),
    ...(incorrectCount > 0 ? ["Create correction tickets for incorrect implementation in next sprint."] : []),
    ...(hasNegativeStakeholderFeedback ? ["Address negative stakeholder feedback items in next sprint backlog."] : []),
    ...(decision === "Sprint Done" ? ["Close sprint after PO validation."] : ["Review follow-up items with PO/Scrum Master before sprint closure."])
  ];
  const backlogUpdates = toBacklogUpdates({
    spillover,
    incorrectImplementation,
    stakeholderFeedback
  });
  const demoSummary = {
    opening: `Sprint review outcome: ${decision}.`,
    highlights: [
      `${doneCorrectCount}/${totalTickets} tickets completed correctly.`,
      `${spilloverCount} tickets spilled over.`,
      `${incorrectCount} tickets need implementation correction next sprint.`,
      `${stakeholderFeedback.length} stakeholder feedback item(s) considered.`
    ],
    nextSprintFocus: [
      ...spillover.map(t => `Carry over ${t.ticketId}: ${t.reason}`),
      ...incorrectImplementation.map(t => `Rework ${t.ticketId}: ${t.decision}`),
      ...stakeholderFeedback.map(fb => `Stakeholder (${fb.sentiment || "neutral"}): ${String(fb.feedback || "").slice(0, 120)}`)
    ]
  };

  return {
    decision,
    summary: `${doneCorrectCount}/${totalTickets} tickets completed correctly. ${spilloverCount} spillover and ${incorrectCount} incorrect implementations need next sprint actions.`,
    metrics: {
      totalTickets,
      completedCorrectly: doneCorrectCount,
      spillover: spilloverCount,
      incorrectImplementation: incorrectCount,
      completedCorrectPercent: completedPercent
    },
    completedCorrectly,
    spillover,
    incorrectImplementation,
    nextSprintPlan: [
      ...spillover.map(t => ({ ticketId: t.ticketId, action: t.nextSprintAction })),
      ...incorrectImplementation.map(t => ({ ticketId: t.ticketId, action: t.nextSprintAction }))
    ],
    stakeholderFeedbackConsidered: stakeholderFeedback,
    backlogUpdates,
    demoSummary,
    reviewedTickets,
    recommendations,
    dataSources: ["RuleEngine", "FoundryLocal", "RAG", "AzureLLM", "SprintTicketStatus"],
    requiresValidation: true
  };
}

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use("/api/", apiLimiter);
app.use("/api/", sanitizeInput);
app.use(express.static(path.join(__dirname, "public-review")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/review/sim/work-products", (_req, res) => {
  res.json({ ok: true, cases: SIM_WORK_PRODUCTS });
});

app.get("/api/review/sprint/sim-raw-tickets", (_req, res) => {
  res.json({ tickets: SIM_SPRINT_TICKETS, source: "simulated-raw" });
});

app.get("/api/jira/boards", async (_req, res) => {
  try {
    if (!JIRA_API_TOKEN || !JIRA_EMAIL || !JIRA_BASE_URL) {
      throw new Error("Missing JIRA credentials. Set JIRA_BASE_URL/JIRA_EMAIL/JIRA_API_TOKEN.");
    }
    const rootUrl = JIRA_BASE_URL.replace(/\/$/, "");
    const url = `${rootUrl}/rest/agile/1.0/board?maxResults=50`;
    const resp = await jiraFetchJson(url, { method: "GET", headers: getJiraAuthHeaders() }, "Fetch boards");
    const boards = Array.isArray(resp.data?.values) ? resp.data.values : [];
    res.json({ boards: boards.map(b => ({ id: b.id, name: b.name, type: b.type })) });
  } catch (err) {
    res.status(400).json({ error: err?.message || "Failed to fetch JIRA boards." });
  }
});

app.get("/api/jira/boards/:boardId/sprints", async (req, res) => {
  try {
    if (!JIRA_API_TOKEN || !JIRA_EMAIL || !JIRA_BASE_URL) {
      throw new Error("Missing JIRA credentials. Set JIRA_BASE_URL/JIRA_EMAIL/JIRA_API_TOKEN.");
    }
    const rootUrl = JIRA_BASE_URL.replace(/\/$/, "");
    const boardId = Number(req.params.boardId);
    if (!Number.isInteger(boardId) || boardId <= 0) {
      return res.status(400).json({ error: "Invalid board ID." });
    }
    const url = `${rootUrl}/rest/agile/1.0/board/${boardId}/sprint?maxResults=50&orderBy=-startDate`;
    const resp = await jiraFetchJson(url, { method: "GET", headers: getJiraAuthHeaders() }, `Fetch sprints for board ${boardId}`);
    const sprints = Array.isArray(resp.data?.values) ? resp.data.values : [];
    res.json({ sprints: sprints.map(s => ({ id: s.id, name: s.name, state: s.state, startDate: s.startDate, endDate: s.endDate })) });
  } catch (err) {
    res.status(400).json({ error: err?.message || "Failed to fetch JIRA sprints." });
  }
});

app.post("/api/review", async (req, res) => {
  try {
    const workProduct = req.body?.workProduct || req.body;
    if (!workProduct || typeof workProduct !== "object") {
      return res.status(400).json({ error: "workProduct is required." });
    }
    const output = await runReview(workProduct);
    audit({ type: "SPRINT_REVIEW", input: workProduct, output });
    res.json(output);
  } catch (err) {
    res.status(400).json({ error: err?.message || "Failed to run sprint review." });
  }
});

app.post("/api/review/simulated", async (req, res) => {
  try {
    const caseKey = String(req.body?.caseKey || "").trim().toLowerCase();
    const selected = SIM_WORK_PRODUCTS[caseKey];
    if (!selected) {
      return res.status(400).json({ error: "Invalid caseKey. Use best/good/bad/worst." });
    }
    const output = await runReview(selected);
    audit({ type: "SPRINT_REVIEW_SIMULATED", caseKey, input: selected, output });
    res.json({ caseKey, ...output });
  } catch (err) {
    res.status(400).json({ error: err?.message || "Failed simulated sprint review." });
  }
});

app.post("/api/review/sprint", async (req, res) => {
  try {
    const tickets = Array.isArray(req.body?.tickets)
      ? req.body.tickets
      : (Array.isArray(req.body) ? req.body : []);
    if (!tickets.length) {
      return res.status(400).json({ error: "tickets[] is required for sprint review." });
    }
    const output = await evaluateSprintTickets(tickets, {
      sprintId: String(req.body?.sprintId || "SIM-SPRINT-1"),
      stakeholderFeedback: Array.isArray(req.body?.stakeholderFeedback) ? req.body.stakeholderFeedback : [],
      offline: req.body?.offline || false
    });
    audit({ type: "SPRINT_REVIEW_BATCH", ticketCount: tickets.length, output });
    res.json(output);
  } catch (err) {
    res.status(400).json({ error: err?.message || "Failed sprint-level review." });
  }
});

app.post("/api/review/sprint/simulated", async (_req, res) => {
  try {
    const output = await evaluateSprintTickets(SIM_SPRINT_TICKETS, {
      sprintId: "SIM-SPRINT-1",
      includeDefaultSimulatedFeedback: true
    });
    audit({ type: "SPRINT_REVIEW_BATCH_SIMULATED", ticketCount: SIM_SPRINT_TICKETS.length, output });
    res.json({ source: "simulated", ...output });
  } catch (err) {
    res.status(400).json({ error: err?.message || "Failed simulated sprint-level review." });
  }
});

app.post("/api/review/sprint/jira/tickets", async (req, res) => {
  try {
    const sprintId = req.body?.sprintId;
    const boardId = req.body?.boardId;
    const jiraData = await fetchJiraSprintTickets({ sprintId, boardId });
    res.json({ sprintId: jiraData.sprintId, tickets: jiraData.tickets });
  } catch (err) {
    res.status(400).json({ error: err?.message || "Failed to fetch Jira sprint tickets." });
  }
});

const SIM_SCENARIOS = [
  { label: "completed-best",   statusOverride: "Done",        implRatio: 1.0,  passed: 24, failed: 0, coverage: 93 },
  { label: "completed-good",   statusOverride: "Done",        implRatio: 1.0,  passed: 16, failed: 0, coverage: 82 },
  { label: "completed-solid",  statusOverride: "Done",        implRatio: 1.0,  passed: 18, failed: 0, coverage: 88 },
  { label: "completed-clean",  statusOverride: "Done",        implRatio: 1.0,  passed: 20, failed: 0, coverage: 85 },
  { label: "partial-done",     statusOverride: "Done",        implRatio: 0.66, passed: 14, failed: 2, coverage: 78 },
  { label: "failed-impl",      statusOverride: "Done",        implRatio: 0.33, passed: 5,  failed: 6, coverage: 52 },
  { label: "in-progress",      statusOverride: "In Progress", implRatio: 0.5,  passed: 2,  failed: 0, coverage: 64 },
  { label: "in-review",        statusOverride: "In Review",   implRatio: 0.66, passed: 10, failed: 1, coverage: 71 }
];

app.post("/api/review/sprint/jira/simulate", async (req, res) => {
  try {
    const sprintId = req.body?.sprintId;
    const boardId = req.body?.boardId;
    const jiraData = await fetchJiraSprintTickets({ sprintId, boardId });
    const realTickets = jiraData.tickets || [];
    if (!realTickets.length) {
      return res.status(400).json({ error: `No tickets found for sprint ${jiraData.sprintId}.` });
    }
    const simulated = realTickets.map((ticket, idx) => {
      const scenario = SIM_SCENARIOS[idx % SIM_SCENARIOS.length];
      const ac = Array.isArray(ticket.acceptanceCriteria) ? ticket.acceptanceCriteria : [];
      const implCount = Math.round(ac.length * scenario.implRatio);
      return {
        ...ticket,
        status: scenario.statusOverride,
        implementation: ac.slice(0, implCount),
        tests: { passed: scenario.passed, failed: scenario.failed },
        coverage: scenario.coverage,
        scenarioLabel: scenario.label
      };
    });
    res.json({ sprintId: jiraData.sprintId, tickets: simulated, source: "jira-simulated" });
  } catch (err) {
    res.status(400).json({ error: err?.message || "Failed to simulate Jira sprint tickets." });
  }
});

app.post("/api/review/sprint/jira", async (req, res) => {
  try {
    const sprintId = req.body?.sprintId;
    const boardId = req.body?.boardId;
    const jiraData = await fetchJiraSprintTickets({ sprintId, boardId });
    if (!jiraData.tickets.length) {
      return res.status(400).json({ error: `No Jira tickets found for sprint ${jiraData.sprintId}.` });
    }
    const output = await evaluateSprintTickets(jiraData.tickets, {
      sprintId: String(jiraData.sprintId),
      stakeholderFeedback: Array.isArray(req.body?.stakeholderFeedback) ? req.body.stakeholderFeedback : []
    });
    audit({
      type: "SPRINT_REVIEW_BATCH_JIRA",
      sprintId: jiraData.sprintId,
      boardId: boardId || "",
      ticketCount: jiraData.tickets.length,
      output
    });
    res.json({
      source: "jira",
      sprintId: jiraData.sprintId,
      ticketCount: jiraData.tickets.length,
      ...output
    });
  } catch (err) {
    res.status(400).json({ error: err?.message || "Failed Jira sprint review." });
  }
});

app.get("/api/review/sim/teams-feedback", (_req, res) => {
  res.json({ ok: true, cases: SIM_TEAMS_REVIEW_CASES });
});

function buildTranscriptFromTickets(tickets = []) {
  const done = tickets.filter(t => /^(done|closed|resolved)$/i.test(t.status));
  const notDone = tickets.filter(t => !/^(done|closed|resolved)$/i.test(t.status));
  const allAcMet = done.filter(t => {
    const ac = new Set((t.acceptanceCriteria || []).map(c => c.toLowerCase().trim()));
    const impl = new Set((t.implementation || []).map(c => c.toLowerCase().trim()));
    return ac.size > 0 && Array.from(ac).every(c => impl.has(c)) && (t.tests?.failed || 0) === 0;
  });
  const partial = done.filter(t => !allAcMet.includes(t));

  const lines = [];
  lines.push(`Scrum Master: Let's begin the sprint review. We had ${tickets.length} tickets planned this sprint.`);

  if (allAcMet.length > 0) {
    lines.push(`PO: ${allAcMet.map(t => t.ticketId).join(", ")} — demo looked complete. All acceptance criteria met and tests passing. Good work.`);
  }
  if (partial.length > 0) {
    lines.push(`Stakeholder: ${partial.map(t => t.ticketId).join(", ")} are marked Done but have gaps. ${partial[0].ticketId} failed during demo — implementation is incomplete.`);
    lines.push(`PO: We need rework tickets for ${partial.map(t => t.ticketId).join(", ")} in the next sprint.`);
  }
  if (notDone.length > 0) {
    lines.push(`Scrum Master: ${notDone.map(t => `${t.ticketId} (${t.status})`).join(", ")} — these were not completed. Carry them over to next sprint.`);
    lines.push(`Stakeholder: Why weren't ${notDone.map(t => t.ticketId).join(", ")} finished? We committed to these.`);
  }

  const overallOk = notDone.length === 0 && partial.length === 0;
  if (overallOk) {
    lines.push(`Stakeholder: Great sprint overall. No major concerns.`);
    lines.push(`PO: Approved. Close the sprint.`);
  } else if (notDone.length > done.length) {
    lines.push(`Stakeholder: Too many incomplete items. I'm not satisfied with this increment.`);
    lines.push(`PO: We need a corrective plan before the next sprint starts.`);
  } else {
    lines.push(`Stakeholder: Acceptable progress but there are follow-up items to address.`);
    lines.push(`PO: Let's prioritize the rework and carryover tickets next sprint.`);
  }

  return lines.join("\n");
}

app.post("/api/review/feedback/teams/simulated", async (req, res) => {
  try {
    const sprintId = String(req.body?.sprintId || "SIM-SPRINT-1");
    const tickets = Array.isArray(req.body?.tickets) ? req.body.tickets : [];

    let transcript;
    if (tickets.length > 0) {
      transcript = buildTranscriptFromTickets(tickets);
    } else {
      const caseKey = String(req.body?.caseKey || "good").trim().toLowerCase();
      const selected = SIM_TEAMS_REVIEW_CASES[caseKey];
      if (!selected) {
        return res.status(400).json({ error: "Invalid caseKey. Use best/good/bad/worst." });
      }
      transcript = selected.transcript;
    }

    const extracted = await extractFeedbackFromTranscript(transcript, { sprintId, source: "review_meeting" });
    const feedback = readJsonFile(FEEDBACK_DB, []);
    const record = {
      id: uuidv4(),
      time: new Date().toISOString(),
      feedbackType: "teams_sprint_review",
      sprintId,
      source: "review_meeting",
      transcript,
      ...extracted
    };
    feedback.push(record);
    writeJsonFile(FEEDBACK_DB, feedback);
    await initVectorStore();
    audit({ type: "SPRINT_REVIEW_TEAMS_FEEDBACK", data: record });
    res.json({ saved: true, record });
  } catch (err) {
    res.status(400).json({ error: err?.message || "Failed to extract feedback from transcript." });
  }
});

app.post("/api/review/feedback/teams", async (req, res) => {
  try {
    const sprintId = String(req.body?.sprintId || "");
    const meetingId = req.body?.meetingId;
    const token = req.body?.token || process.env.MS_GRAPH_TOKEN || localEnv.MS_GRAPH_TOKEN;
    const caseKey = String(req.body?.caseKey || "good").trim().toLowerCase();
    let transcriptData;
    let source = "graph";
    try {
      transcriptData = await fetchTeamsTranscriptFromGraph({ meetingId, token });
    } catch {
      const selected = SIM_TEAMS_REVIEW_CASES[caseKey];
      if (!selected) {
        throw new Error("Graph fetch failed and invalid simulated caseKey. Use best/good/bad/worst.");
      }
      transcriptData = { transcriptId: selected.id, transcript: selected.transcript };
      source = "simulated-fallback";
    }
    const extracted = await extractFeedbackFromTranscript(transcriptData.transcript, { sprintId, source, meetingId: meetingId || "" });
    const feedback = readJsonFile(FEEDBACK_DB, []);
    const record = {
      id: uuidv4(),
      time: new Date().toISOString(),
      feedbackType: "teams_sprint_review",
      sprintId,
      source,
      meetingId: String(meetingId || ""),
      transcriptId: transcriptData.transcriptId,
      ...extracted
    };
    feedback.push(record);
    writeJsonFile(FEEDBACK_DB, feedback);
    await initVectorStore();
    audit({ type: "SPRINT_REVIEW_TEAMS_FEEDBACK", data: record });
    res.json({ saved: true, record });
  } catch (err) {
    res.status(400).json({ error: err?.message || "Failed Teams feedback extraction." });
  }
});

app.post("/api/review/feedback", async (req, res) => {
  try {
    const payload = req.body || {};
    const feedback = readJsonFile(FEEDBACK_DB, []);
    const record = {
      id: uuidv4(),
      time: new Date().toISOString(),
      feedbackType: "stakeholder_review",
      sprintId: String(payload.sprintId || ""),
      stakeholder: String(payload.stakeholder || "Stakeholder"),
      sentiment: String(payload.sentiment || "neutral"),
      feedback: String(payload.feedback || ""),
      followUpTickets: Array.isArray(payload.followUpTickets) ? payload.followUpTickets : []
    };
    feedback.push(record);
    writeJsonFile(FEEDBACK_DB, feedback);
    await initVectorStore();
    audit({ type: "SPRINT_REVIEW_FEEDBACK", data: record });
    res.json({ saved: true, record });
  } catch (err) {
    res.status(400).json({ error: err?.message || "Failed to save stakeholder feedback." });
  }
});

app.post("/api/validate", async (req, res) => {
  try {
    const payload = req.body || {};
    const feedback = readJsonFile(FEEDBACK_DB, []);
    feedback.push({
      id: uuidv4(),
      time: new Date().toISOString(),
      ...payload
    });
    writeJsonFile(FEEDBACK_DB, feedback);
    await initVectorStore();
    audit({ type: "VALIDATION", data: payload });
    res.json({ saved: true });
  } catch (err) {
    res.status(400).json({ error: err?.message || "Failed to save validation." });
  }
});

app.get("/api/audit", (_req, res) => {
  res.json(readJsonFile(AUDIT_LOG, []));
});

app.get("/api/feedback", (_req, res) => {
  res.json(readJsonFile(FEEDBACK_DB, []));
});

// ── Retro ──

function autoPopulateRetroFromReview(reviewResult = {}) {
  const wentWell = [];
  const didntGoWell = [];

  if (Array.isArray(reviewResult.completedCorrectly)) {
    for (const t of reviewResult.completedCorrectly) {
      wentWell.push(`${t.ticketId} — completed correctly and accepted.`);
    }
  }

  if (Array.isArray(reviewResult.reviewedTickets)) {
    for (const rt of reviewResult.reviewedTickets) {
      if (rt.decision === "On Track" && !wentWell.some(w => w.startsWith(rt.ticketId))) {
        wentWell.push(`${rt.ticketId} — on track with ${rt.confidence || "N/A"}% confidence.`);
      }
      const m = rt.metrics || {};
      if (m.codeCoveragePercent >= 80 && m.testFailureRatePercent === 0) {
        wentWell.push(`${rt.ticketId} — strong test coverage (${m.codeCoveragePercent}%) with zero failures.`);
      }
    }
  }

  const metrics = reviewResult.metrics || {};
  if (metrics.completedCorrectPercent >= 50) {
    wentWell.push(`${metrics.completedCorrectPercent}% sprint completion rate — met delivery target.`);
  }
  if (metrics.completedCorrectly > 0) {
    wentWell.push(`${metrics.completedCorrectly} out of ${metrics.totalTickets} tickets delivered successfully.`);
  }

  if (Array.isArray(reviewResult.stakeholderFeedbackConsidered)) {
    for (const fb of reviewResult.stakeholderFeedbackConsidered) {
      const s = String(fb.sentiment || "").toLowerCase();
      if (s === "positive") wentWell.push(`Stakeholder (${fb.stakeholder || ""}): ${String(fb.feedback || "").slice(0, 150)}`);
      if (s === "negative") didntGoWell.push(`Stakeholder (${fb.stakeholder || ""}): ${String(fb.feedback || "").slice(0, 150)}`);
    }
  }
  if (Array.isArray(reviewResult.spillover)) {
    for (const t of reviewResult.spillover) {
      didntGoWell.push(`${t.ticketId} — not completed (${t.status}). ${t.reason || ""}`);
    }
  }
  if (Array.isArray(reviewResult.incorrectImplementation)) {
    for (const t of reviewResult.incorrectImplementation) {
      didntGoWell.push(`${t.ticketId} — marked Done but failed acceptance checks (${t.decision}).`);
    }
  }

  return { wentWell, didntGoWell };
}

function buildRetroTranscript(reviewResult = {}) {
  const { wentWell, didntGoWell } = autoPopulateRetroFromReview(reviewResult);
  const lines = [];
  lines.push("Scrum Master: Let's start the retrospective. What went well this sprint?");
  if (wentWell.length > 0) {
    lines.push(`Dev Lead: ${wentWell[0]}`);
    if (wentWell.length > 1) lines.push(`PO: Also, ${wentWell.slice(1).join(". ")}`);
  } else {
    lines.push("Dev Lead: Hard to point out specific wins this sprint.");
  }
  lines.push("Scrum Master: What didn't go well?");
  if (didntGoWell.length > 0) {
    lines.push(`Dev 1: ${didntGoWell[0]}`);
    if (didntGoWell.length > 1) lines.push(`QA Lead: Additionally, ${didntGoWell.slice(1).join(". ")}`);
  } else {
    lines.push("Dev 1: No major issues this sprint.");
  }
  lines.push("Scrum Master: What should we improve for next sprint?");
  if (didntGoWell.length > 2) {
    lines.push("Dev Lead: We need better estimation and earlier code reviews.");
    lines.push("QA Lead: Testing should start earlier in the sprint, not the last two days.");
  } else if (didntGoWell.length > 0) {
    lines.push("Dev Lead: Let's improve our acceptance criteria clarity before sprint starts.");
  } else {
    lines.push("Dev Lead: Keep doing what we're doing. Maybe improve documentation.");
  }
  lines.push("Scrum Master: Good discussion. Let's turn these into action items.");
  return lines.join("\n");
}

const retroChain = RunnableSequence.from([
  async (input) => {
    const foundry = await foundryExtract(JSON.stringify(input.reviewResult || {}));
    const context = await getContext("sprint retrospective " + JSON.stringify(input.wentWell || []) + JSON.stringify(input.didntGoWell || []));
    return { ...input, foundry, context };
  },
  async (data) => {
    const prompt = `
You are a Sprint Retrospective AI for Agile delivery governance.
Analyse the sprint review results, team feedback, and historical context to produce a structured retrospective.

Review Result Summary: ${data.reviewResult?.summary || "N/A"}
Review Decision: ${data.reviewResult?.decision || "N/A"}
Completed Correctly: ${JSON.stringify(data.reviewResult?.completedCorrectly || [])}
Spillover: ${JSON.stringify(data.reviewResult?.spillover || [])}
Incorrect Implementation: ${JSON.stringify(data.reviewResult?.incorrectImplementation || [])}
Stakeholder Feedback: ${JSON.stringify(data.reviewResult?.stakeholderFeedbackConsidered || [])}

Team Input - What Went Well: ${JSON.stringify(data.wentWell || [])}
Team Input - What Didn't Go Well: ${JSON.stringify(data.didntGoWell || [])}
Team Input - Improvements: ${JSON.stringify(data.improvements || [])}
Transcript: ${data.transcript || "N/A"}

FoundryOutput: ${JSON.stringify(data.foundry)}
HistoricalContext: ${data.context}

Return strict JSON:
{
  "wentWell": ["..."],
  "didntGoWell": ["..."],
  "improvements": ["..."],
  "actionItems": [{ "description": "", "owner": "Team|Scrum Master|PO|Dev Lead|QA Lead", "priority": "high|medium|low", "targetSprint": "Next Sprint" }],
  "patterns": ["recurring themes or observations from historical data"],
  "teamHealth": {
    "velocityTrend": "Improving|Stable|Declining",
    "morale": "High|Moderate|Low",
    "summary": ""
  },
  "confidence": 0,
  "rationale": []
}
`;
    try {
      const res = await llm.invoke([{ role: "user", content: prompt }]);
      return parseJsonFromText(typeof res?.content === "string" ? res.content : "");
    } catch {
      return null;
    }
  }
]);

app.post("/api/retro/auto-populate", (req, res) => {
  try {
    const reviewResult = req.body?.reviewResult || {};
    const populated = autoPopulateRetroFromReview(reviewResult);
    res.json(populated);
  } catch (err) {
    res.status(400).json({ error: err?.message || "Failed to auto-populate retro." });
  }
});

app.post("/api/retro/feedback/transcript", async (req, res) => {
  try {
    const reviewResult = req.body?.reviewResult || {};
    const transcript = buildRetroTranscript(reviewResult);
    const extracted = await extractFeedbackFromTranscript(transcript, { source: "retro_meeting" });
    res.json({ transcript, extracted });
  } catch (err) {
    res.status(400).json({ error: err?.message || "Failed to build retro transcript." });
  }
});

app.post("/api/retro/generate", async (req, res) => {
  try {
    const { reviewResult, wentWell, didntGoWell, improvements, transcript, offline } = req.body || {};

    let chainResult = null;
    if (!offline) {
      try {
        chainResult = await retroChain.invoke({
          reviewResult: reviewResult || {},
          wentWell: Array.isArray(wentWell) ? wentWell : [],
          didntGoWell: Array.isArray(didntGoWell) ? didntGoWell : [],
          improvements: Array.isArray(improvements) ? improvements : [],
          transcript: transcript || ""
        });
      } catch { chainResult = null; }
    }

    const foundrySnapshot = await foundryExtract(JSON.stringify(reviewResult || {}));
    const context = await getContext("retrospective");
    const rMetrics = reviewResult?.metrics || {};
    const offlineFallbackActions = offline ? [{
      description: `Address ${rMetrics.spillover || 0} spillover ticket(s) in next sprint`,
      owner: "Team", priority: rMetrics.spillover > 2 ? "high" : "medium", targetSprint: "Next Sprint"
    }] : [];

    const output = {
      wentWell: Array.isArray(chainResult?.wentWell) ? chainResult.wentWell : (Array.isArray(wentWell) ? wentWell : []),
      didntGoWell: Array.isArray(chainResult?.didntGoWell) ? chainResult.didntGoWell : (Array.isArray(didntGoWell) ? didntGoWell : []),
      improvements: Array.isArray(chainResult?.improvements) ? chainResult.improvements : (Array.isArray(improvements) ? improvements : []),
      actionItems: Array.isArray(chainResult?.actionItems) ? chainResult.actionItems : offlineFallbackActions,
      patterns: Array.isArray(chainResult?.patterns) ? chainResult.patterns : [],
      teamHealth: chainResult?.teamHealth || { velocityTrend: "Stable", morale: "Moderate", summary: offline ? "Offline mode — team health derived from metrics only." : "Unable to determine." },
      confidence: Number.isFinite(Number(chainResult?.confidence)) ? Number(chainResult.confidence) : (offline ? 60 : 70),
      rationale: Array.isArray(chainResult?.rationale) ? chainResult.rationale : (offline ? ["Offline mode: rule-based + Foundry Local analysis only."] : []),
      dataSources: [
        "RuleEngine",
        Array.isArray(foundrySnapshot?.tasks) || Array.isArray(foundrySnapshot?.blockers) ? "FoundryLocal" : "FoundryLocal (fallback)",
        context ? "RAG" : "RAG (unavailable)",
        offline ? "AzureLLM (skipped — offline mode)" : "AzureLLM"
      ],
      requiresValidation: true
    };
    audit({ type: "RETRO_GENERATE", offline: !!offline, output });
    res.json(output);
  } catch (err) {
    res.status(400).json({ error: err?.message || "Failed to generate retro insights." });
  }
});

app.post("/api/retro/actions/save", async (req, res) => {
  try {
    const payload = req.body || {};
    const actions = readJsonFile(RETRO_ACTIONS_DB, []);
    const record = {
      id: uuidv4(),
      time: new Date().toISOString(),
      sprintId: String(payload.sprintId || ""),
      actionItems: Array.isArray(payload.actionItems) ? payload.actionItems : [],
      patterns: Array.isArray(payload.patterns) ? payload.patterns : [],
      teamHealth: payload.teamHealth || {}
    };
    actions.push(record);
    writeJsonFile(RETRO_ACTIONS_DB, actions);

    const feedback = readJsonFile(FEEDBACK_DB, []);
    feedback.push({
      id: uuidv4(),
      time: new Date().toISOString(),
      feedbackType: "retro_actions",
      ...record
    });
    writeJsonFile(FEEDBACK_DB, feedback);
    await initVectorStore();
    audit({ type: "RETRO_ACTIONS_SAVED", data: record });
    res.json({ saved: true, record });
  } catch (err) {
    res.status(400).json({ error: err?.message || "Failed to save retro actions." });
  }
});

app.get("/api/retro/actions", (_req, res) => {
  res.json(readJsonFile(RETRO_ACTIONS_DB, []));
});

// ── Velocity Tracking ──

function deriveCurrentSprintFromReview(reviewResult) {
  const DEFAULT_SP = 3;
  const allTickets = [
    ...(reviewResult.completedCorrectly || []),
    ...(reviewResult.spillover || []),
    ...(reviewResult.incorrectImplementation || [])
  ];

  const spFor = (list) => (list || []).reduce((sum, t) => {
    const sp = Number(t.storyPoints);
    return sum + (Number.isFinite(sp) && sp > 0 ? sp : DEFAULT_SP);
  }, 0);

  const plannedPoints = spFor(allTickets);
  const completedPoints = spFor(reviewResult.completedCorrectly);
  const spilloverPoints = spFor(reviewResult.spillover) + spFor(reviewResult.incorrectImplementation);

  const ticketBreakdown = allTickets.map(t => ({
    ticketId: t.ticketId,
    storyPoints: Number(t.storyPoints) > 0 ? Number(t.storyPoints) : DEFAULT_SP,
    outcome: (reviewResult.completedCorrectly || []).some(c => c.ticketId === t.ticketId) ? "Completed"
      : (reviewResult.spillover || []).some(s => s.ticketId === t.ticketId) ? "Spillover"
      : "Incorrect"
  }));

  return {
    sprintName: "Current Sprint",
    capacityPoints: Math.max(plannedPoints, 30),
    plannedPoints,
    completedPoints,
    velocityPoints: completedPoints,
    spilloverPoints,
    ticketBreakdown
  };
}

app.post("/api/velocity/data", async (req, res) => {
  try {
    const reviewResult = req.body?.reviewResult;
    if (!reviewResult) {
      return res.status(400).json({ error: "Run Sprint Review first — velocity is derived from review results." });
    }

    const metricsPath = path.join(__dirname, "data", "sprint_metrics_simulated.json");
    let pastHistory = [];
    if (fs.existsSync(metricsPath)) {
      const raw = JSON.parse(fs.readFileSync(metricsPath, "utf8"));
      pastHistory = raw.history || [];
    }

    if (!pastHistory.length) {
      pastHistory = [
        { sprintName: "Sprint-1 (ADAS Lane Safety)", capacityPoints: 30, plannedPoints: 28, completedPoints: 24, velocityPoints: 24, spilloverPoints: 4 },
        { sprintName: "Sprint-2 (IVI & Voice)", capacityPoints: 28, plannedPoints: 26, completedPoints: 24, velocityPoints: 24, spilloverPoints: 2 },
        { sprintName: "Sprint-3 (Platform & OTA)", capacityPoints: 32, plannedPoints: 30, completedPoints: 26, velocityPoints: 26, spilloverPoints: 4 },
        { sprintName: "Sprint-4 (ADAS Sensor & Detection)", capacityPoints: 27, plannedPoints: 25, completedPoints: 22, velocityPoints: 22, spilloverPoints: 3 },
        { sprintName: "Sprint-5 (Tech Debt & Reliability)", capacityPoints: 28, plannedPoints: 27, completedPoints: 23, velocityPoints: 23, spilloverPoints: 4 },
        { sprintName: "Sprint-6 (Bug Fixes & Diagnostics)", capacityPoints: 29, plannedPoints: 28, completedPoints: 25, velocityPoints: 25, spilloverPoints: 3 }
      ];
    }

    const currentSprint = deriveCurrentSprintFromReview(reviewResult);
    const history = [...pastHistory, currentSprint];

    const velocities = history.map(s => s.velocityPoints || s.completedPoints || 0);
    const avgVelocity = velocities.length ? Math.round(velocities.reduce((a, b) => a + b, 0) / velocities.length) : 0;
    const last3Velocity = velocities.length >= 3
      ? Math.round(velocities.slice(-3).reduce((a, b) => a + b, 0) / 3) : avgVelocity;
    const completionRates = history.map(s => s.plannedPoints ? Math.round((s.completedPoints / s.plannedPoints) * 100) : 0);
    const avgCompletion = completionRates.length ? Math.round(completionRates.reduce((a, b) => a + b, 0) / completionRates.length) : 0;

    let trend = "Stable";
    if (velocities.length >= 3) {
      const recent = velocities.slice(-3);
      if (recent[2] > recent[0] + 1) trend = "Improving";
      else if (recent[2] < recent[0] - 1) trend = "Declining";
    }

    const totalDays = 10;
    const burndown = [];
    const planned = currentSprint.plannedPoints || 12;
    const completed = currentSprint.completedPoints || 0;
    const idealPerDay = planned / totalDays;
    const remainingAtEnd = planned - completed;
    for (let d = 0; d <= totalDays; d++) {
      const idealRemaining = Math.round((planned - idealPerDay * d) * 10) / 10;
      let actualRemaining;
      if (d === 0) {
        actualRemaining = planned;
      } else if (d === totalDays) {
        actualRemaining = remainingAtEnd;
      } else {
        const progress = d / totalDays;
        const actualBurn = completed * progress + (Math.random() - 0.4) * 1.5;
        actualRemaining = Math.round(Math.max(0, planned - actualBurn) * 10) / 10;
      }
      burndown.push({ day: d, ideal: Math.max(0, idealRemaining), actual: actualRemaining });
    }

    const projection = {
      recommendedRange: { min: Math.max(0, last3Velocity - 3), max: last3Velocity + 2 },
      avgVelocity,
      last3Velocity,
      trend,
      confidence: trend === "Improving" ? "High" : trend === "Stable" ? "Medium" : "Low"
    };

    res.json({
      history,
      currentSprint,
      burndown,
      summary: { avgVelocity, last3Velocity, avgCompletion, trend },
      projection
    });
  } catch (err) {
    res.status(500).json({ error: err?.message || "Failed to load velocity data." });
  }
});

app.get("/api/velocity/export", (_req, res) => {
  try {
    const metricsPath = path.join(__dirname, "data", "sprint_metrics_simulated.json");
    let history = [];
    if (fs.existsSync(metricsPath)) {
      const raw = JSON.parse(fs.readFileSync(metricsPath, "utf8"));
      history = raw.history || [];
    }
    const header = "Sprint,Capacity,Planned,Completed,Velocity,Spillover,Completion%\n";
    const rows = history.map(s => {
      const pct = s.plannedPoints ? Math.round((s.completedPoints / s.plannedPoints) * 100) : 0;
      return `${s.sprintName},${s.capacityPoints},${s.plannedPoints},${s.completedPoints},${s.velocityPoints},${s.spilloverPoints},${pct}`;
    }).join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=velocity_report.csv");
    res.send(header + rows);
  } catch (err) {
    res.status(500).json({ error: err?.message || "Failed to export velocity data." });
  }
});

// ── Sprint Intelligence Report ──

app.post("/api/intelligence/report", async (req, res) => {
  try {
    const { phaseResults, memory, sprintHistory } = req.body || {};
    const pr = phaseResults || {};
    const mem = memory || {};
    const hist = Array.isArray(sprintHistory) ? sprintHistory : [];

    const context = await getContext("sprint intelligence risks dependencies suggestions");

    const prompt = `You are a Sprint Intelligence Analyst for Agile delivery governance.
Analyse all phase results from a completed sprint cycle and cross-sprint memory to produce a strategic intelligence report for the Product Owner and Scrum Master.

=== PHASE RESULTS ===
Backlog: ${JSON.stringify(pr.backlog || {})}
Planning: ${JSON.stringify(pr.planning || {})}
Development: ${JSON.stringify(pr.development || {})}
Review: ${JSON.stringify(pr.review || {})}
Retro: ${JSON.stringify(pr.retro || {})}
Velocity: ${JSON.stringify(pr.velocity || {})}

=== CROSS-SPRINT MEMORY ===
Past Sprints (last 5): ${JSON.stringify((mem.sprints || []).slice(-5))}
Recurring Patterns: ${JSON.stringify(mem.patterns || [])}
Open Action Items: ${JSON.stringify((mem.actionTracker || []).filter(a => !a.addressed).slice(-15))}

=== SPRINT HISTORY ===
${JSON.stringify(hist.slice(-5))}

=== HISTORICAL CONTEXT (RAG) ===
${context || "None available"}

Return strict JSON:
{
  "executiveSummary": "3-5 sentence summary for management",
  "risks": [{ "title": "", "severity": "high|medium|low", "description": "", "mitigation": "" }],
  "dependencies": [{ "from": "ticket/team", "to": "ticket/team", "type": "blocks|needs|impacts", "description": "" }],
  "suggestions": [{ "title": "", "priority": "high|medium|low", "description": "", "category": "process|technical|team|planning" }],
  "teamInsights": {
    "workloadBalance": "Balanced|Skewed|Overloaded",
    "skillGaps": [""],
    "moraleIndicator": "High|Moderate|Low",
    "summary": ""
  },
  "sprintPrediction": {
    "nextSprintSuccess": "High|Medium|Low",
    "confidence": 0,
    "factors": [""],
    "recommendedCapacity": 0
  },
  "unresolvedActions": [{ "description": "", "sprintId": "", "status": "open|overdue" }]
}`;

    const response = await llm.invoke([{ role: "user", content: prompt }]);
    let parsed;
    try {
      const text = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch {
      parsed = { executiveSummary: "Unable to parse intelligence report.", risks: [], dependencies: [], suggestions: [], teamInsights: {}, sprintPrediction: {} };
    }

    parsed.dataSources = ["AzureLLM", context ? "RAG" : "RAG (unavailable)", "PhaseResults", "CrossSprintMemory"];
    parsed.generatedAt = new Date().toISOString();
    audit({ type: "INTELLIGENCE_REPORT", output: parsed });
    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err?.message || "Failed to generate intelligence report." });
  }
});

// ── AI Manager: Cross-Sprint Team Performance Evaluation ──

app.post("/api/manager/evaluate", async (req, res) => {
  try {
    const { memory, sprintHistory } = req.body || {};
    const mem = memory || {};
    const hist = Array.isArray(sprintHistory) ? sprintHistory : [];
    const sprints = mem.sprints || [];

    if (sprints.length === 0 && hist.length === 0) {
      return res.status(400).json({ error: "No sprint history available. Complete at least one sprint cycle first." });
    }

    const context = await getContext("team performance velocity trends quality improvement");

    const prompt = `You are an AI Scrum Master / Agile Manager evaluating long-term team performance across multiple sprints.

=== SPRINT HISTORY (structured) ===
${JSON.stringify(sprints.slice(-10))}

=== SPRINT HISTORY (summary) ===
${JSON.stringify(hist.slice(-10))}

=== RECURRING PATTERNS ===
${JSON.stringify(mem.patterns || [])}

=== ACTION ITEM TRACKER ===
${JSON.stringify((mem.actionTracker || []).slice(-30))}

=== HISTORICAL CONTEXT (RAG) ===
${context || "None available"}

Evaluate the team's performance across these sprints and return strict JSON:
{
  "overallScore": 0,
  "overallGrade": "A|B|C|D|F",
  "velocityAnalysis": {
    "trend": "Improving|Stable|Declining",
    "avgVelocity": 0,
    "consistency": "High|Medium|Low",
    "recommendation": ""
  },
  "qualityAnalysis": {
    "defectTrend": "Improving|Stable|Worsening",
    "reworkRate": 0,
    "testCoverage": "Good|Average|Poor",
    "recommendation": ""
  },
  "predictability": {
    "score": 0,
    "plannedVsActual": "Consistently on target|Often over-commits|Under-commits",
    "recommendation": ""
  },
  "actionFollowThrough": {
    "totalActions": 0,
    "addressed": 0,
    "overdue": 0,
    "followThroughRate": 0,
    "recommendation": ""
  },
  "riskRadar": [{ "risk": "", "severity": "high|medium|low", "recurring": true, "recommendation": "" }],
  "teamRecommendations": [{ "title": "", "category": "process|training|tools|capacity|communication", "priority": "high|medium|low", "description": "" }],
  "executiveSummary": "5-7 sentence performance summary for leadership",
  "sprintBySprintTrend": [{ "sprintId": "", "velocityScore": 0, "qualityScore": 0, "overallScore": 0 }]
}`;

    const response = await llm.invoke([{ role: "user", content: prompt }]);
    let parsed;
    try {
      const text = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch {
      parsed = { overallScore: 0, overallGrade: "N/A", executiveSummary: "Unable to parse manager evaluation.", velocityAnalysis: {}, qualityAnalysis: {}, predictability: {}, actionFollowThrough: {}, riskRadar: [], teamRecommendations: [] };
    }

    parsed.dataSources = ["AzureLLM", context ? "RAG" : "RAG (unavailable)", "CrossSprintMemory"];
    parsed.evaluatedAt = new Date().toISOString();
    parsed.sprintsAnalyzed = sprints.length;
    audit({ type: "MANAGER_EVALUATE", output: parsed });
    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err?.message || "Failed to run manager evaluation." });
  }
});

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(__dirname, "public-review", "index.html"));
});

app.listen(PORT, async () => {
  await initVectorStore();
  console.log(chalk.green(`Sprint Review Agent running at http://localhost:${PORT}`));
});
