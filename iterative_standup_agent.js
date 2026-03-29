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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 4040);
const DATA_DIR = "data";
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const FEEDBACK_DB = path.join(DATA_DIR, "feedback.json");
const AUDIT_LOG = path.join(DATA_DIR, "audit.json");
const KB_CANDIDATES = [path.join(DATA_DIR, "knowledge.json"), path.join(DATA_DIR, "knowledge_base.json")];

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

const JIRA_BASE_URL = process.env.JIRA_BASE || process.env.JIRA_BASE_URL || localEnv.JIRA_BASE_URL || "";
const JIRA_EMAIL = process.env.JIRA_EMAIL || localEnv.JIRA_EMAIL || "";
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN || localEnv.JIRA_API_TOKEN || "";
const MS_GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const GITHUB_API_BASE = "https://api.github.com";

function loadSprintTickets() {
  try {
    const raw = fs.readFileSync(path.join("data", "sprint_plan.json"), "utf8");
    const plan = JSON.parse(raw);
    return Array.isArray(plan.sprintBacklog) ? plan.sprintBacklog : [];
  } catch {
    return [];
  }
}

const SIM_WORK_PRODUCTS = {
  good: {
    ticketId: "AP-44",
    summary: "Bug: Log export bundle missing files",
    status: "In Progress",
    acceptanceCriteria: [
      "Diagnostic log export includes all expected log files",
      "Manifest-driven bundling validates file list before export",
      "Export succeeds on both Windows and Linux targets",
      "Unit tests cover missing-file edge cases"
    ],
    implementation: [
      "Manifest-driven bundling validates file list before export",
      "Export succeeds on both Windows and Linux targets"
    ],
    tests: { passed: 7, failed: 2 },
    coverage: 68
  },
  bad: {
    ticketId: "AP-43",
    summary: "Bug: OTA progress stuck at 99%",
    status: "In Progress",
    acceptanceCriteria: [
      "OTA progress completes to 100% under poor network",
      "Retry logic with exponential backoff on download failure",
      "Progress reporting decoupled from actual download state",
      "Timeout fallback triggers after 5 minutes of no progress"
    ],
    implementation: [
      "Retry logic with exponential backoff on download failure"
    ],
    tests: { passed: 3, failed: 5 },
    coverage: 35
  },
  worst: {
    ticketId: "AP-40",
    summary: "OTA: rollback on failed boot - acceptance criteria",
    status: "Done",
    acceptanceCriteria: [
      "System rollbacks to previous firmware if post-OTA boot fails",
      "Dual-partition boot scheme validated",
      "Rollback event logged with timestamp and reason",
      "Alert sent to monitoring dashboard on rollback"
    ],
    implementation: [],
    tests: { passed: 0, failed: 0 },
    coverage: 0
  }
};

const DEFAULT_TEAMS_TRANSCRIPT = {
  id: "teams-standup-sprint",
  transcript: `Daily Standup - Sprint Day 3

Ravi: Working on AP-44 (Log export bundle missing files). Manifest-driven bundling is implemented and Windows export works. Two test failures on Linux path edge case still open. Aiming to fix by end of day. No blockers.

Priya: On AP-43 (OTA progress stuck at 99%). Retry logic with exponential backoff is coded and merged. Progress decoupling from download state is still pending - about 50% done. Five tests failing, coverage at 35%. Blocker: need OTA team to confirm timeout threshold value.

Arun: Assigned AP-40 (OTA rollback on failed boot). Rollback triggers are defined but dual-partition boot validation not started yet. Blocked on firmware team for test image. No code committed yet. Raised dependency ticket.

Sneha: Braking collision detection ticket - sensor integration test partially done, 3 out of 5 scenarios passing. Camera-radar fusion delay causing intermittent failures. Will pair with Ravi tomorrow on sensor threshold tuning.

Kiran: Supporting Ravi on AP-44 Linux edge case and reviewing Priya's retry logic PR. Also investigating flaky test environment affecting multiple tickets.

Summary: AP-44 is on track with minor risk. AP-43 has medium risk due to OTA dependency. AP-40 is at high risk - blocked and no implementation yet. Braking detection progressing but sensor issues need attention.`,
  burndown: { totalPoints: 12, completedPerDay: [3, 2, 1] }
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

function validateBurndown(burndown = {}) {
  if (!Number.isFinite(Number(burndown.totalPoints)) || Number(burndown.totalPoints) <= 0) {
    throw new Error("Burndown.totalPoints is mandatory and must be > 0");
  }
  if (!Array.isArray(burndown.completedPerDay)) {
    throw new Error("Burndown.completedPerDay must be an array");
  }
}

function computeBurndown(days, totalPoints, completedPerDay) {
  const totalDays = Number.isFinite(Number(days)) && Number(days) > 0
    ? Math.floor(Number(days))
    : completedPerDay.length;
  let remaining = Number(totalPoints);
  const result = [];
  for (let i = 0; i < totalDays; i++) {
    remaining -= Number(completedPerDay[i] || 0);
    remaining = Math.max(remaining, 0);
    result.push({ day: i + 1, remaining });
  }
  return result;
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

async function jiraFetchJson(url, options = {}, label = "JIRA request") {
  const maxAttempts = 3;
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, options);
      const raw = await response.text();
      if (!response.ok) {
        throw new Error(`${label} failed: HTTP ${response.status}. ${raw.slice(0, 240)}`);
      }
      return raw ? JSON.parse(raw) : {};
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, 600 * attempt));
      }
    }
  }
  throw lastError || new Error(`${label} failed`);
}

let vectorStore = null;
async function initVectorStore() {
  const kbFile = KB_CANDIDATES.find(file => fs.existsSync(file));
  const kb = kbFile ? readJsonFile(kbFile, []) : [];
  const feedback = readJsonFile(FEEDBACK_DB, []);

  const docs = [
    ...kb.map(k => ({ pageContent: String(k.text || `${k.summary || ""}\n${k.description || ""}`.trim()) })),
    ...feedback.map(f => ({ pageContent: JSON.stringify(f) }))
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

async function foundryExtract(text) {
  try {
    const res = await axios.post(
      "http://localhost:3000/extract",
      { input: text, model_alias: "phi" },
      { timeout: 10000 }
    );
    return res.data?.result || { blockers: [], tasks: [], skillsRequired: [] };
  } catch {
    return { blockers: [], tasks: [], skillsRequired: [] };
  }
}

async function getContext(query) {
  if (!vectorStore) return "";
  const docs = await vectorStore.similaritySearch(query, 3);
  return docs.map(d => d.pageContent).join("\n");
}

async function fetchTeamsTranscriptFromGraph({ meetingId, token }) {
  const trimmedId = String(meetingId || "").trim();
  const trimmedToken = String(token || "").trim();
  if (!trimmedId) throw new Error("meetingId is required for Microsoft Graph transcript fetch");
  if (!trimmedToken) throw new Error("token is required for Microsoft Graph transcript fetch");

  const listUrl = `${MS_GRAPH_BASE}/me/onlineMeetings/${encodeURIComponent(trimmedId)}/transcripts`;
  const listResp = await axios.get(listUrl, {
    headers: { Authorization: `Bearer ${trimmedToken}` },
    timeout: 15000
  });
  const values = Array.isArray(listResp.data?.value) ? listResp.data.value : [];
  if (!values.length) throw new Error("No transcripts found for the given meeting");

  const latest = values[values.length - 1];
  if (!latest?.id) throw new Error("Transcript item missing id");

  const contentUrl = `${MS_GRAPH_BASE}/me/onlineMeetings/${encodeURIComponent(trimmedId)}/transcripts/${encodeURIComponent(latest.id)}/content`;
  const contentResp = await axios.get(contentUrl, {
    headers: { Authorization: `Bearer ${trimmedToken}` },
    timeout: 15000
  });

  const transcriptText = typeof contentResp.data === "string"
    ? contentResp.data
    : JSON.stringify(contentResp.data || "");
  return {
    transcriptId: latest.id,
    transcript: transcriptText
  };
}

function decodeGitHubContentBase64(content = "") {
  const clean = String(content || "").replace(/\n/g, "");
  return Buffer.from(clean, "base64").toString("utf8");
}

async function fetchSimulatedWorkProductsFromGitHub({ owner, repo, path: filePath, token }) {
  const o = String(owner || "").trim();
  const r = String(repo || "").trim();
  const p = String(filePath || "").trim();
  if (!o || !r || !p) {
    throw new Error("owner, repo and path are required to fetch simulated work products from GitHub.");
  }
  const url = `${GITHUB_API_BASE}/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/contents/${p}`;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await axios.get(url, {
    headers: {
      ...headers,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    timeout: 90000
  });
  const payload = typeof res.data === "string"
    ? (parseJsonFromText(res.data) || {})
    : (res.data || {});

  let jsonText = "";
  const contentRaw = payload?.content;
  if (contentRaw) {
    jsonText = decodeGitHubContentBase64(contentRaw);
  } else if (payload?.download_url) {
    const rawResp = await axios.get(String(payload.download_url), {
      timeout: 90000,
      responseType: "text",
      transformResponse: [v => v]
    });
    jsonText = String(rawResp.data || "");
  }
  if (!jsonText.trim()) {
    const rawCandidates = [
      `https://raw.githubusercontent.com/${encodeURIComponent(o)}/${encodeURIComponent(r)}/main/${p}`,
      `https://raw.githubusercontent.com/${encodeURIComponent(o)}/${encodeURIComponent(r)}/master/${p}`
    ];
    for (const rawUrl of rawCandidates) {
      try {
        const rawResp = await axios.get(rawUrl, {
          timeout: 90000,
          responseType: "text",
          transformResponse: [v => v]
        });
        const text = String(rawResp.data || "");
        if (text.trim()) {
          jsonText = text;
          break;
        }
      } catch {}
    }
  }
  if (!jsonText.trim()) throw new Error("GitHub file content was empty.");

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    const preview = jsonText.slice(0, 120).replace(/\s+/g, " ");
    throw new Error(`GitHub response was not valid JSON. Payload preview: ${preview}`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("GitHub file must contain a JSON object of simulated work products.");
  }
  return parsed;
}

function buildGitHubHeaders(token) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function fetchGitHubPullRequest({ owner, repo, pullNumber, token }) {
  const o = String(owner || "").trim();
  const r = String(repo || "").trim();
  const number = Number(pullNumber);
  if (!o || !r || !Number.isFinite(number) || number <= 0) {
    throw new Error("owner, repo, and a numeric pullNumber are required.");
  }
  const headers = buildGitHubHeaders(String(token || "").trim());
  const prUrl = `${GITHUB_API_BASE}/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/pulls/${number}`;
  const filesUrl = `${prUrl}/files`;
  const [prResp, filesResp] = await Promise.all([
    axios.get(prUrl, { headers, timeout: 90000 }),
    axios.get(filesUrl, { headers, timeout: 90000 })
  ]);
  return {
    owner: o,
    repo: r,
    pullNumber: number,
    pr: prResp.data,
    files: Array.isArray(filesResp.data) ? filesResp.data : []
  };
}

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
  const jsonStr = JSON.stringify(parsed);
  const piiPatterns = [/\b\d{3}-\d{2}-\d{4}\b/, /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}\b/i];
  for (const pat of piiPatterns) {
    if (pat.test(jsonStr)) warnings.push("Potential PII detected in LLM output");
  }
  return { valid: warnings.length === 0, warnings, sanitized: parsed };
}

function buildResponsibleEnvelope({ decision, confidence, rationale, summary, risks, recommendations, dataSources, completionLikelihood, relatedSprintTickets, standupInsights, dependencyRisks, criteriaBreakdown, criteriaProgress }) {
  const llmValidation = validateLLMOutput({ decision, confidence, summary, risks, recommendations }, { requiredFields: ["decision", "confidence"] });
  const envelope = {
    decision: decision || "Insight generated",
    confidence: Number.isFinite(Number(confidence)) ? Number(confidence) : 50,
    summary: summary || "",
    risks: Array.isArray(risks) ? risks : [],
    recommendations: Array.isArray(recommendations) ? recommendations : [],
    rationale: Array.isArray(rationale) ? rationale : [],
    dataSources: Array.isArray(dataSources) ? dataSources : ["Foundry", "RAG", "Azure LLM"],
    requiresValidation: true,
    llmValidation
  };
  if (completionLikelihood) envelope.completionLikelihood = completionLikelihood;
  if (Array.isArray(relatedSprintTickets) && relatedSprintTickets.length) envelope.relatedSprintTickets = relatedSprintTickets;
  if (standupInsights) envelope.standupInsights = standupInsights;
  if (Array.isArray(dependencyRisks) && dependencyRisks.length) envelope.dependencyRisks = dependencyRisks;
  if (Array.isArray(criteriaBreakdown) && criteriaBreakdown.length) envelope.criteriaBreakdown = criteriaBreakdown;
  if (Array.isArray(criteriaProgress) && criteriaProgress.length) envelope.criteriaProgress = criteriaProgress;
  return envelope;
}

async function generateInsight(inputText, burndown, mode = "standup") {
  validateBurndown(burndown);
  const foundry = await foundryExtract(inputText);
  const context = await getContext(inputText);

  const prompt = `
You are an Agile intelligence assistant.
Mode: ${mode}
Input: ${inputText}
Burndown: ${JSON.stringify(burndown)}
FoundryExtract: ${JSON.stringify(foundry)}
RAG Context: ${context}

Return strict JSON:
{
  "decision": "",
  "summary": "",
  "risks": [],
  "recommendations": [],
  "confidence": 0,
  "rationale": []
}
`;

  let parsed = null;
  try {
    const res = await llm.invoke([{ role: "user", content: prompt }]);
    parsed = parseJsonFromText(typeof res?.content === "string" ? res.content : "");
  } catch {}

  if (!parsed || typeof parsed !== "object") {
    parsed = {
      decision: "Potential sprint risk",
      summary: "Fallback insight generated because model response parsing failed.",
      risks: ["Model response unavailable in structured format"],
      recommendations: ["Review blockers manually and re-run analysis"],
      confidence: 55,
      rationale: [
        "Foundry preprocessing and RAG context were available.",
        "Used deterministic fallback to preserve transparency."
      ]
    };
  }

  return buildResponsibleEnvelope({
    ...parsed,
    dataSources: ["Foundry", "RAG", "Azure LLM", "Burndown"]
  });
}

function normalizeTextSet(values) {
  return new Set(
    (Array.isArray(values) ? values : [])
      .map(v => String(v || "").toLowerCase().trim())
      .filter(Boolean)
  );
}

function evaluateWorkProductRuleBased(workProduct) {
  const acceptance = normalizeTextSet(workProduct.acceptanceCriteria);
  const implementation = normalizeTextSet(workProduct.implementation);
  const implementedCount = Array.from(acceptance).filter(c => implementation.has(c)).length;
  const totalCriteria = acceptance.size || 1;
  const coveragePct = Math.round((implementedCount / totalCriteria) * 100);

  const passed = Number(workProduct.tests?.passed || 0);
  const failed = Number(workProduct.tests?.failed || 0);
  const totalTests = passed + failed;
  const failRate = totalTests > 0 ? failed / totalTests : 1;
  const codeCoverage = Number(workProduct.coverage || 0);
  const status = String(workProduct.status || "");

  const rationale = [];
  const recommendations = [];
  let riskScore = 0;

  if (coveragePct < 100) {
    rationale.push(`Only ${implementedCount}/${totalCriteria} acceptance criteria are implemented.`);
    riskScore += (100 - coveragePct) / 25;
  } else {
    rationale.push("All acceptance criteria are implemented.");
  }

  if (totalTests === 0) {
    rationale.push("No tests were provided.");
    riskScore += 2;
  } else if (failRate > 0) {
    rationale.push(`Test failure rate is ${Math.round(failRate * 100)}%.`);
    riskScore += failRate * 3;
  } else {
    rationale.push("All tests passed.");
  }

  if (codeCoverage < 70) {
    rationale.push(`Code coverage is low at ${codeCoverage}%.`);
    riskScore += 1.8;
  } else if (codeCoverage < 85) {
    rationale.push(`Code coverage is moderate at ${codeCoverage}%.`);
    riskScore += 0.8;
  } else {
    rationale.push(`Code coverage is healthy at ${codeCoverage}%.`);
  }

  if (status.toLowerCase() === "done" && (implementation.size === 0 || totalTests === 0)) {
    rationale.push("Ticket is marked Done but implementation/tests are missing.");
    riskScore += 3;
  }

  let health = "On Track";
  if (riskScore >= 5.5) health = "High Risk";
  else if (riskScore >= 3) health = "At Risk";

  if (health !== "On Track") {
    recommendations.push("Re-open ticket and complete missing acceptance criteria.");
    recommendations.push("Increase test coverage and resolve failing tests.");
  } else {
    recommendations.push("Proceed to next workflow stage.");
  }

  const confidence = Math.max(50, Math.min(95, Math.round(92 - riskScore * 8)));
  return {
    ticketId: workProduct.ticketId || "",
    status: health,
    confidence,
    rationale,
    recommendations,
    metrics: {
      acceptanceCoveragePercent: coveragePct,
      testFailureRatePercent: Math.round(failRate * 100),
      codeCoveragePercent: codeCoverage
    }
  };
}

async function evaluateWorkProductWithAI(workProduct, ruleEval) {
  const foundry = await foundryExtract(JSON.stringify(workProduct));
  const context = await getContext(JSON.stringify(workProduct));

  const sprintTickets = loadSprintTickets();
  const matchingTicket = sprintTickets.find(t => t.key === workProduct.ticketId);
  const deps = matchingTicket?.dependencies || matchingTicket?.finalDependencies || "None identified";
  const sprintEndDate = matchingTicket?.sprintEndDate || "End of current sprint (approx 2 weeks)";
  const sprintContext = sprintTickets.length
    ? sprintTickets.map(t => `${t.key}: ${t.summary || t.title} [${t.priority}] ${t.storyPoints || 0} SP`).join("\n")
    : "No sprint tickets loaded.";
  const standupContext = DEFAULT_TEAMS_TRANSCRIPT.transcript;

  const isComplete = Array.isArray(workProduct.acceptanceCriteria) && Array.isArray(workProduct.implementation)
    && workProduct.implementation.length >= workProduct.acceptanceCriteria.length;

  const prompt = `
Evaluate this work product from the GitHub repo against its acceptance criteria.

WorkProduct: ${JSON.stringify(workProduct)}
RuleEvaluation: ${JSON.stringify(ruleEval)}
FoundryExtract: ${JSON.stringify(foundry)}
RAG Context: ${context}

Sprint tickets (JIRA): 
${sprintContext}

This ticket's dependencies: ${deps}
Sprint end date: ${sprintEndDate}

Latest standup transcript:
${standupContext}

${isComplete ? `This work product appears COMPLETE. Evaluate each acceptance criterion thoroughly - check for Met/Not Met/Partially Met with evidence.` : `This work product is IN PROGRESS. Based on standup context, sprint end date, and dependencies, estimate completion likelihood and flag risks.`}

Return strict JSON:
{
  "status": "On Track|At Risk|Off Track",
  "confidence": 0,
  "completionLikelihood": "High|Medium|Low",
  "rationale": [],
  "recommendations": [],
  "risks": [],
  "relatedSprintTickets": [],
  "standupInsights": "",
  "dependencyRisks": []
}
`;
  let parsed = null;
  try {
    const res = await llm.invoke([{ role: "user", content: prompt }]);
    parsed = parseJsonFromText(typeof res?.content === "string" ? res.content : "");
  } catch {}

  const merged = {
    status: parsed?.status || ruleEval.status,
    confidence: Number.isFinite(Number(parsed?.confidence)) ? Number(parsed.confidence) : ruleEval.confidence,
    rationale: Array.isArray(parsed?.rationale) && parsed.rationale.length ? parsed.rationale : ruleEval.rationale,
    recommendations: Array.isArray(parsed?.recommendations) && parsed.recommendations.length
      ? parsed.recommendations
      : ruleEval.recommendations,
    completionLikelihood: parsed?.completionLikelihood || (isComplete ? "High" : "Low"),
    risks: Array.isArray(parsed?.risks) && parsed.risks.length ? parsed.risks : ((parsed?.status || ruleEval.status) === "On Track" ? [] : ["Work product indicates delivery risk"]),
    relatedSprintTickets: Array.isArray(parsed?.relatedSprintTickets) ? parsed.relatedSprintTickets : [workProduct.ticketId].filter(Boolean),
    standupInsights: parsed?.standupInsights || "",
    dependencyRisks: Array.isArray(parsed?.dependencyRisks) ? parsed.dependencyRisks : []
  };

  return buildResponsibleEnvelope({
    decision: merged.status,
    summary: `Work product ${workProduct.ticketId || ""} evaluated as ${merged.status}`,
    confidence: merged.confidence,
    rationale: merged.rationale,
    risks: merged.risks,
    recommendations: merged.recommendations,
    completionLikelihood: merged.completionLikelihood,
    relatedSprintTickets: merged.relatedSprintTickets,
    standupInsights: merged.standupInsights,
    dependencyRisks: merged.dependencyRisks,
    dataSources: ["WorkProduct", "Foundry", "RAG", "Azure LLM", "RuleEngine", "Standup", "JIRA Sprint"]
  });
}

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use("/api/", apiLimiter);
app.use("/api/", sanitizeInput);
app.use(express.static(path.join(__dirname, "public-iterative")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/teams/graph/health", async (req, res) => {
  const token = String(req.body?.token || process.env.MS_GRAPH_TOKEN || localEnv.MS_GRAPH_TOKEN || "").trim();
  const meetingId = String(req.body?.meetingId || "").trim();
  if (!token) {
    return res.status(400).json({
      ok: false,
      authConfigured: false,
      error: "Missing Microsoft Graph token. Set MS_GRAPH_TOKEN or pass token."
    });
  }
  try {
    const headers = { Authorization: `Bearer ${token}` };
    const meResp = await axios.get(`${MS_GRAPH_BASE}/me`, { headers, timeout: 12000 });
    const out = {
      ok: true,
      authConfigured: true,
      account: {
        id: meResp.data?.id || "",
        displayName: meResp.data?.displayName || "",
        userPrincipalName: meResp.data?.userPrincipalName || ""
      },
      meetingCheck: null
    };
    if (meetingId) {
      try {
        const transcriptsUrl = `${MS_GRAPH_BASE}/me/onlineMeetings/${encodeURIComponent(meetingId)}/transcripts`;
        const listResp = await axios.get(transcriptsUrl, { headers, timeout: 12000 });
        const count = Array.isArray(listResp.data?.value) ? listResp.data.value.length : 0;
        out.meetingCheck = {
          meetingId,
          canAccess: true,
          transcriptCount: count
        };
      } catch (meetingErr) {
        out.meetingCheck = {
          meetingId,
          canAccess: false,
          error: meetingErr?.response?.data || meetingErr?.message || "Could not access meeting transcripts"
        };
      }
    }
    res.json(out);
  } catch (err) {
    res.status(400).json({
      ok: false,
      authConfigured: true,
      error: err?.response?.data || err?.message || "Microsoft Graph health check failed"
    });
  }
});

app.post("/api/github/health", async (req, res) => {
  const token = String(req.body?.token || process.env.GITHUB_TOKEN || localEnv.GITHUB_TOKEN || "").trim();
  const owner = String(req.body?.owner || "").trim();
  const repo = String(req.body?.repo || "").trim();
  if (!token) {
    return res.status(400).json({
      ok: false,
      authConfigured: false,
      error: "Missing GitHub token. Set GITHUB_TOKEN or pass token."
    });
  }
  try {
    const headers = buildGitHubHeaders(token);
    const userResp = await axios.get(`${GITHUB_API_BASE}/user`, { headers, timeout: 12000 });
    const out = {
      ok: true,
      authConfigured: true,
      account: {
        login: userResp.data?.login || "",
        id: userResp.data?.id || ""
      },
      repoCheck: null
    };
    if (owner && repo) {
      try {
        const repoResp = await axios.get(`${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
          headers,
          timeout: 12000
        });
        out.repoCheck = {
          owner,
          repo,
          canAccess: true,
          private: Boolean(repoResp.data?.private)
        };
      } catch (repoErr) {
        out.repoCheck = {
          owner,
          repo,
          canAccess: false,
          error: repoErr?.response?.data || repoErr?.message || "Could not access repository"
        };
      }
    }
    res.json(out);
  } catch (err) {
    res.status(400).json({
      ok: false,
      authConfigured: true,
      error: err?.response?.data || err?.message || "GitHub health check failed"
    });
  }
});

app.get("/api/sim/work-products", (_req, res) => {
  res.json({ ok: true, cases: SIM_WORK_PRODUCTS });
});

app.get("/api/sprint/tickets", (_req, res) => {
  const tickets = loadSprintTickets();
  res.json({ ok: true, count: tickets.length, tickets });
});

app.post("/api/github/work-products/fetch", async (req, res) => {
  try {
    const owner = req.body?.owner;
    const repo = req.body?.repo;
    const filePath = req.body?.path;
    const token = req.body?.token || process.env.GITHUB_TOKEN || localEnv.GITHUB_TOKEN;
    const cases = await fetchSimulatedWorkProductsFromGitHub({
      owner,
      repo,
      path: filePath,
      token
    });
    audit({ type: "GITHUB_SIM_FETCH", owner, repo, path: filePath });
    res.json({ ok: true, source: "github", cases });
  } catch (err) {
    res.status(400).json({ error: err?.message || "Failed to fetch simulated work products from GitHub" });
  }
});

app.post("/api/github/work-products/evaluate", async (req, res) => {
  try {
    const owner = req.body?.owner;
    const repo = req.body?.repo;
    const filePath = req.body?.path;
    const token = req.body?.token || process.env.GITHUB_TOKEN || localEnv.GITHUB_TOKEN;
    const caseKey = String(req.body?.caseKey || "good").trim().toLowerCase();
    const cases = await fetchSimulatedWorkProductsFromGitHub({
      owner,
      repo,
      path: filePath,
      token
    });
    const selected = cases[caseKey];
    if (!selected || typeof selected !== "object") {
      throw new Error(`Case '${caseKey}' not found in GitHub JSON.`);
    }
    const ruleEval = evaluateWorkProductRuleBased(selected);
    const evalResult = await evaluateWorkProductWithAI(selected, ruleEval);
    audit({
      type: "GITHUB_SIM_EVALUATE",
      owner,
      repo,
      path: filePath,
      caseKey,
      evalResult
    });
    res.json({ ok: true, source: "github", caseKey, input: selected, ...evalResult, metrics: ruleEval.metrics });
  } catch (err) {
    res.status(400).json({ error: err?.message || "Failed to evaluate GitHub simulated work product" });
  }
});

app.post("/api/github/work-products/evaluate-all", async (req, res) => {
  try {
    const owner = req.body?.owner || "snehasankaran";
    const repo = req.body?.repo || "agile-sim-data";
    const filePath = req.body?.path || "simulated_work_products.json";
    const token = req.body?.token || process.env.GITHUB_TOKEN || localEnv.GITHUB_TOKEN;

    let cases;
    try {
      cases = await fetchSimulatedWorkProductsFromGitHub({ owner, repo, path: filePath, token });
    } catch {
      const localFallback = fs.readFileSync(path.join(__dirname, "data", "simulated_work_products.json"), "utf8");
      cases = JSON.parse(localFallback.replace(/^\uFEFF/, ""));
    }

    const results = [];
    for (const [caseKey, wp] of Object.entries(cases)) {
      if (!wp || typeof wp !== "object" || !wp.ticketId) continue;
      const ruleEval = evaluateWorkProductRuleBased(wp);
      const aiEval = await evaluateWorkProductWithAI(wp, ruleEval);
      results.push({
        caseKey,
        ticketId: wp.ticketId,
        summary: wp.summary || "",
        status: wp.status || "Unknown",
        input: wp,
        ...aiEval,
        metrics: ruleEval.metrics
      });
    }

    audit({ type: "GITHUB_SIM_EVALUATE_ALL", owner, repo, count: results.length });
    res.json({ ok: true, source: "github", owner, repo, results });
  } catch (err) {
    res.status(400).json({ error: err?.message || "Failed to evaluate all work products" });
  }
});

app.post("/api/github/pr/fetch", async (req, res) => {
  try {
    const token = req.body?.token || process.env.GITHUB_TOKEN || localEnv.GITHUB_TOKEN;
    const owner = req.body?.owner;
    const repo = req.body?.repo;
    const pullNumber = req.body?.pullNumber;
    const prData = await fetchGitHubPullRequest({ owner, repo, pullNumber, token });
    const minimal = {
      number: prData.pr?.number,
      title: prData.pr?.title || "",
      state: prData.pr?.state || "",
      user: prData.pr?.user?.login || "",
      base: prData.pr?.base?.ref || "",
      head: prData.pr?.head?.ref || "",
      changedFiles: Number(prData.pr?.changed_files || prData.files.length || 0),
      additions: Number(prData.pr?.additions || 0),
      deletions: Number(prData.pr?.deletions || 0),
      body: String(prData.pr?.body || ""),
      files: prData.files.map(f => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        changes: f.changes
      }))
    };
    audit({ type: "GITHUB_PR_FETCH", owner, repo, pullNumber: Number(pullNumber) });
    res.json({ ok: true, source: "github", owner, repo, pullNumber: Number(pullNumber), pr: minimal });
  } catch (err) {
    res.status(400).json({ error: err?.response?.data || err?.message || "Failed to fetch GitHub PR" });
  }
});

function detectSprintTicketFromPR(prTitle, prBody, branchName) {
  const searchText = `${prTitle} ${prBody} ${branchName}`.toUpperCase();
  const allWorkProducts = Object.values(SIM_WORK_PRODUCTS);
  for (const wp of allWorkProducts) {
    if (wp.ticketId && searchText.includes(wp.ticketId.toUpperCase())) {
      return wp;
    }
  }
  return null;
}

function getAcceptanceCriteriaForTicket(ticketKey) {
  const wp = Object.values(SIM_WORK_PRODUCTS).find(w => w.ticketId === ticketKey);
  return wp?.acceptanceCriteria || [];
}

function getAllSprintAcceptanceCriteria() {
  return Object.values(SIM_WORK_PRODUCTS).map(wp => ({
    ticketId: wp.ticketId,
    summary: wp.summary,
    acceptanceCriteria: wp.acceptanceCriteria || []
  }));
}

app.get("/api/sprint/acceptance-criteria", (_req, res) => {
  res.json({ ok: true, tickets: getAllSprintAcceptanceCriteria() });
});

app.post("/api/github/pr/evaluate", async (req, res) => {
  try {
    const token = req.body?.token || process.env.GITHUB_TOKEN || localEnv.GITHUB_TOKEN;
    const owner = req.body?.owner;
    const repo = req.body?.repo;
    const pullNumber = req.body?.pullNumber;
    const prData = await fetchGitHubPullRequest({ owner, repo, pullNumber, token });
    const prState = String(prData.pr?.state || "open").toLowerCase();
    const isMerged = !!prData.pr?.merged_at || prState === "closed";
    const isCompleted = isMerged;

    const prTitle = prData.pr?.title || "";
    const prBody = String(prData.pr?.body || "");
    const branchName = prData.pr?.head?.ref || "";

    const prPayload = {
      number: prData.pr?.number,
      title: prTitle,
      state: prState,
      merged: !!prData.pr?.merged_at,
      body: prBody,
      branch: branchName,
      changedFiles: Number(prData.pr?.changed_files || prData.files.length || 0),
      additions: Number(prData.pr?.additions || 0),
      deletions: Number(prData.pr?.deletions || 0),
      files: prData.files.slice(0, 40).map(f => ({
        filename: f.filename,
        status: f.status,
        changes: f.changes,
        patch: String(f.patch || "").slice(0, 1200)
      }))
    };

    const matchedTicket = detectSprintTicketFromPR(prTitle, prBody, branchName);

    const sprintTickets = loadSprintTickets();
    const sprintContext = sprintTickets.length
      ? sprintTickets.map(t => {
          const deps = t.dependencies || t.finalDependencies || "None";
          const ac = getAcceptanceCriteriaForTicket(t.key);
          const acText = ac.length ? ac.map((c, i) => `  ${i + 1}. ${c}`).join("\n") : "  (none defined)";
          return `${t.key || "(no-key)"}: ${t.summary || t.title} [${t.priority}] ${t.storyPoints || 0} SP | Dependencies: ${deps}\n  Acceptance Criteria:\n${acText}`;
        }).join("\n\n")
      : "No sprint tickets loaded.";

    const sprintEndDate = sprintTickets[0]?.sprintEndDate || "End of current sprint (approx 2 weeks)";
    const standupContext = DEFAULT_TEAMS_TRANSCRIPT.transcript;

    let criteriaText;
    let matchedTicketId = null;
    if (matchedTicket) {
      matchedTicketId = matchedTicket.ticketId;
      criteriaText = matchedTicket.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join("\n");
    } else {
      const allAC = getAllSprintAcceptanceCriteria();
      criteriaText = allAC.map(t => `${t.ticketId} (${t.summary}):\n${t.acceptanceCriteria.map((c, i) => `  ${i + 1}. ${c}`).join("\n")}`).join("\n\n");
    }

    let prompt;
    if (isCompleted) {
      prompt = `
You are evaluating a COMPLETED (merged/closed) GitHub PR against acceptance criteria from the sprint plan.
${matchedTicketId ? `This PR is matched to sprint ticket ${matchedTicketId}.` : "Could not auto-match to a specific ticket. Evaluate against all sprint ticket criteria below."}

Acceptance Criteria (from Sprint Planning):
${criteriaText}

PR Details: ${JSON.stringify(prPayload)}

All Sprint Planned Tickets with Acceptance Criteria:
${sprintContext}

Instructions:
1. Check EACH acceptance criterion individually - does the committed code satisfy it? (Met / Not Met / Partially Met)
2. For each criterion, provide specific evidence from the PR files/patches.
3. Overall verdict: PASS (all criteria met), FAIL (critical criteria not met), or PARTIAL (some met, some not).
4. Identify any gaps, missing test coverage, or edge cases not handled.
5. Map which sprint tickets this PR addresses.

Return strict JSON:
{
  "status":"PASS|FAIL|PARTIAL",
  "confidence":0,
  "matchedTicket":"${matchedTicketId || ""}",
  "criteriaBreakdown":[{"criterion":"...","verdict":"Met|Not Met|Partially Met","evidence":"..."}],
  "rationale":[],
  "recommendations":[],
  "risks":[],
  "relatedSprintTickets":[]
}
`;
    } else {
      prompt = `
You are evaluating an IN-PROGRESS (open) GitHub PR. This PR is NOT yet completed.
${matchedTicketId ? `This PR is matched to sprint ticket ${matchedTicketId}.` : "Could not auto-match to a specific ticket. Evaluate against all sprint ticket criteria below."}
Provide insights on progress, remaining work, and delivery risk using standup context, sprint end date, and dependencies.

Acceptance Criteria (from Sprint Planning):
${criteriaText}

PR Details: ${JSON.stringify(prPayload)}

All Sprint Planned Tickets with Acceptance Criteria and Dependencies:
${sprintContext}

Sprint end date: ${sprintEndDate}

Latest Daily Standup Transcript (team context):
${standupContext}

Instructions:
1. Assess how much of the acceptance criteria is addressed so far vs what remains.
2. Based on the standup transcript, identify what the team has reported about this work - blockers, progress, risks.
3. Considering the sprint end date, dependencies, and current progress, estimate completion likelihood.
4. Flag dependency risks - are there blockers from other teams or tickets?
5. Provide actionable recommendations to improve delivery chances.

Return strict JSON:
{
  "status":"IN_PROGRESS",
  "confidence":0,
  "matchedTicket":"${matchedTicketId || ""}",
  "completionLikelihood":"High|Medium|Low",
  "criteriaProgress":[{"criterion":"...","status":"Done|In Progress|Not Started","notes":"..."}],
  "standupInsights":"...",
  "dependencyRisks":[],
  "rationale":[],
  "recommendations":[],
  "risks":[],
  "relatedSprintTickets":[]
}
`;
    }
    let parsed = null;
    try {
      const r = await llm.invoke([{ role: "user", content: prompt }]);
      parsed = parseJsonFromText(typeof r?.content === "string" ? r.content : "");
    } catch {}
    if (!parsed || typeof parsed !== "object") {
      parsed = isCompleted
        ? { status: "PARTIAL", confidence: 50, rationale: ["Could not parse model response; returning fallback."], recommendations: ["Review PR manually against criteria."] }
        : { status: "IN_PROGRESS", confidence: 50, completionLikelihood: "Unknown", rationale: ["Could not parse model response; returning fallback."], recommendations: ["Review PR manually."] };
    }
    const response = {
      ok: true,
      source: "github",
      owner: String(owner || ""),
      repo: String(repo || ""),
      pullNumber: Number(pullNumber || 0),
      matchedTicket: matchedTicketId || parsed?.matchedTicket || null,
      acceptanceCriteria: matchedTicket ? matchedTicket.acceptanceCriteria : getAllSprintAcceptanceCriteria().flatMap(t => t.acceptanceCriteria),
      prState: prState,
      isCompleted,
      evaluation: parsed,
      pr: {
        number: prPayload.number,
        title: prPayload.title,
        state: prState,
        merged: !!prData.pr?.merged_at,
        branch: branchName,
        changedFiles: prPayload.changedFiles,
        additions: prPayload.additions,
        deletions: prPayload.deletions
      }
    };
    audit({ type: "GITHUB_PR_EVALUATE", ...response });
    res.json(response);
  } catch (err) {
    res.status(400).json({ error: err?.response?.data || err?.message || "Failed to evaluate GitHub PR" });
  }
});

app.get("/api/sim/teams-transcripts", (_req, res) => {
  res.json({ ok: true, transcript: DEFAULT_TEAMS_TRANSCRIPT });
});

app.post("/api/sim/work-products/evaluate", async (req, res) => {
  try {
    const caseKey = String(req.body?.caseKey || "").trim();
    const provided = req.body?.workProduct;
    const workProduct = provided || SIM_WORK_PRODUCTS[caseKey];
    if (!workProduct) {
      return res.status(400).json({ error: "Provide caseKey (best/good/bad/worst) or workProduct payload." });
    }
    const ruleEval = evaluateWorkProductRuleBased(workProduct);
    const aiEval = await evaluateWorkProductWithAI(workProduct, ruleEval);
    const output = {
      ticketId: ruleEval.ticketId,
      ...aiEval,
      metrics: ruleEval.metrics
    };
    audit({ type: "WORK_PRODUCT_EVAL", input: workProduct, output });
    res.json(output);
  } catch (err) {
    res.status(400).json({ error: err?.message || "Failed to evaluate work product" });
  }
});

app.post("/api/sim/teams-transcripts/run", async (req, res) => {
  try {
    const customTranscript = String(req.body?.transcript || "").trim();
    const burndownInput = req.body?.burndown;
    const transcriptText = customTranscript || DEFAULT_TEAMS_TRANSCRIPT.transcript;
    const burndown = burndownInput || DEFAULT_TEAMS_TRANSCRIPT.burndown;
    const insight = await generateInsight(transcriptText, burndown, "standup-simulated");
    audit({ type: "TEAMS_SIMULATED", transcriptId: DEFAULT_TEAMS_TRANSCRIPT.id, insight });
    res.json({ transcriptId: DEFAULT_TEAMS_TRANSCRIPT.id, ...insight });
  } catch (err) {
    res.status(400).json({ error: err?.message || "Failed to run transcript analysis" });
  }
});

app.post("/api/teams", async (req, res) => {
  try {
    const transcript = String(req.body?.transcript || "").trim();
    const burndown = req.body?.burndown || {};
    if (!transcript) return res.status(400).json({ error: "transcript is required" });
    const insight = await generateInsight(transcript, burndown, "standup");
    audit({ type: "TEAMS", transcript, insight });
    res.json(insight);
  } catch (err) {
    res.status(400).json({ error: err?.message || "Failed to process teams transcript" });
  }
});

app.post("/api/teams/graph", async (req, res) => {
  try {
    const meetingId = req.body?.meetingId;
    const token = req.body?.token || process.env.MS_GRAPH_TOKEN || localEnv.MS_GRAPH_TOKEN;
    const burndown = req.body?.burndown || {};
    validateBurndown(burndown);
    const graphData = await fetchTeamsTranscriptFromGraph({ meetingId, token });
    const insight = await generateInsight(graphData.transcript, burndown, "standup-graph");
    audit({
      type: "TEAMS_GRAPH",
      meetingId,
      transcriptId: graphData.transcriptId,
      insight
    });
    res.json({
      meetingId,
      transcriptId: graphData.transcriptId,
      ...insight
    });
  } catch (err) {
    res.status(400).json({ error: err?.message || "Failed to process Teams transcript from Graph API" });
  }
});

app.post("/api/teams/graph/simulated", async (req, res) => {
  try {
    const meetingId = req.body?.meetingId;
    const token = req.body?.token || process.env.MS_GRAPH_TOKEN || localEnv.MS_GRAPH_TOKEN;
    const caseKey = String(req.body?.caseKey || "good").trim().toLowerCase();
    const burndownInput = req.body?.burndown;
    let transcriptPayload;
    let source = "graph";

    try {
      transcriptPayload = await fetchTeamsTranscriptFromGraph({ meetingId, token });
    } catch {
      transcriptPayload = { transcriptId: DEFAULT_TEAMS_TRANSCRIPT.id, transcript: DEFAULT_TEAMS_TRANSCRIPT.transcript };
      source = "simulated-fallback";
    }

    const burndown = burndownInput || DEFAULT_TEAMS_TRANSCRIPT.burndown;
    validateBurndown(burndown);
    const insight = await generateInsight(transcriptPayload.transcript, burndown, "standup-graph-or-simulated");
    audit({
      type: "TEAMS_GRAPH_SIMULATED",
      source,
      meetingId: meetingId || "",
      transcriptId: transcriptPayload.transcriptId,
      caseKey,
      insight
    });
    res.json({
      ok: true,
      source,
      transcriptId: transcriptPayload.transcriptId,
      caseKey,
      ...insight
    });
  } catch (err) {
    res.status(400).json({ error: err?.message || "Failed Teams Graph/simulated flow" });
  }
});

app.post("/api/jira", async (req, res) => {
  try {
    const issueKey = String(req.body?.issueKey || "").trim();
    const insight = req.body?.insight || {};
    if (!issueKey) return res.status(400).json({ error: "issueKey is required" });
    const summary = String(insight.summary || insight.decision || "AI update");
    const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64");
    const url = `${JIRA_BASE_URL.replace(/\/$/, "")}/rest/api/3/issue/${issueKey}/comment`;
    await jiraFetchJson(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        body: {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: summary }]
            }
          ]
        }
      })
    }, "Jira comment update");
    audit({ type: "JIRA_UPDATE", issueKey, summary });
    res.json({ status: "updated", issueKey });
  } catch (err) {
    res.status(400).json({ error: err?.message || "Failed to update Jira issue" });
  }
});

app.post("/api/github", async (req, res) => {
  try {
    const prText = String(req.body?.prText || "").trim();
    const criteria = String(req.body?.criteria || "").trim();
    if (!prText || !criteria) {
      return res.status(400).json({ error: "prText and criteria are required" });
    }
    const prompt = `
Check PR text against acceptance criteria.
PR Text: ${prText}
Criteria: ${criteria}
Return strict JSON:
{"status":"PASS|FAIL","confidence":0,"rationale":[]}
`;
    let parsed = null;
    try {
      const r = await llm.invoke([{ role: "user", content: prompt }]);
      parsed = parseJsonFromText(typeof r?.content === "string" ? r.content : "");
    } catch {}
    if (!parsed || typeof parsed !== "object") {
      parsed = { status: "FAIL", confidence: 50, rationale: ["Could not parse model response"] };
    }
    audit({ type: "GITHUB_VALIDATION", input: { prText, criteria }, result: parsed });
    res.json(parsed);
  } catch (err) {
    res.status(400).json({ error: err?.message || "Failed to validate PR" });
  }
});

app.post("/api/sprint-health", async (req, res) => {
  try {
    const burndownInput = req.body?.burndown || {};
    const sprintTickets = loadSprintTickets();

    let historicalMetrics = {};
    try {
      const raw = fs.readFileSync(path.join("data", "sprint_metrics_simulated.json"), "utf8");
      historicalMetrics = JSON.parse(raw.replace(/^\uFEFF/, ""));
    } catch {}

    const history = Array.isArray(historicalMetrics.history) ? historicalMetrics.history : [];
    const summary = historicalMetrics.summary || {};
    const current = historicalMetrics.current || {};

    const allAC = getAllSprintAcceptanceCriteria();
    const standupContext = DEFAULT_TEAMS_TRANSCRIPT.transcript;

    const ticketContext = sprintTickets.map(t => {
      const ac = getAcceptanceCriteriaForTicket(t.key);
      const deps = t.dependencies || t.finalDependencies || "None";
      return `${t.key || "(no-key)"}: ${t.summary || t.title} [${t.priority}] ${t.storyPoints || 0} SP | Deps: ${deps} | AC: ${ac.length} criteria`;
    }).join("\n");

    const historyContext = history.map(s =>
      `${s.sprintName}: planned ${s.plannedPoints} SP, completed ${s.completedPoints} SP, spillover ${s.spilloverPoints} SP (velocity ${s.velocityPoints})`
    ).join("\n");

    const burndown = burndownInput.totalPoints ? burndownInput : {
      totalPoints: current.userCapacityPoints || sprintTickets.reduce((s, t) => s + (t.storyPoints || 0), 0),
      completedPerDay: burndownInput.completedPerDay || [3, 2, 1]
    };

    const foundry = await foundryExtract(standupContext);
    const context = await getContext("sprint health risk velocity burndown");

    const prompt = `
You are an Agile Sprint Health Analyst. Generate a comprehensive sprint health report.

CURRENT SPRINT TICKETS (from JIRA):
${ticketContext}

LATEST DAILY STANDUP:
${standupContext}

HISTORICAL SPRINT DATA (past ${history.length} sprints):
${historyContext}

Historical Summary:
- Average velocity: ${summary.avgVelocity || "N/A"} SP
- Average capacity: ${summary.avgCapacity || "N/A"} SP
- Last sprint velocity: ${summary.lastSprintVelocity || "N/A"} SP
- Velocity trend: ${summary.trend || "N/A"}

Current Sprint Plan:
- Capacity: ${current.userCapacityPoints || "N/A"} SP
- Expected velocity: ${current.expectedVelocityPoints || "N/A"} SP
- Recommended range: ${current.recommendedPlanRange ? `${current.recommendedPlanRange.min}-${current.recommendedPlanRange.max}` : "N/A"} SP
- Total planned: ${sprintTickets.reduce((s, t) => s + (t.storyPoints || 0), 0)} SP across ${sprintTickets.length} tickets

Burndown: ${JSON.stringify(burndown)}

Foundry Extract: ${JSON.stringify(foundry)}
RAG Context: ${context}

Generate a high-level sprint health assessment:
1. Overall health status (Healthy / At Risk / Critical)
2. Compare current sprint progress against historical velocity patterns
3. Reference specific past sprints where similar patterns occurred
4. Identify tickets at risk based on standup and historical data
5. Burndown projection - will the team hit the sprint goal?
6. Top risks and actionable recommendations

Return strict JSON:
{
  "overallHealth": "Healthy|At Risk|Critical",
  "healthScore": 0,
  "summary": "...",
  "velocityComparison": "...",
  "historicalReferences": [{"sprintName":"...","relevance":"..."}],
  "ticketsAtRisk": [{"ticketId":"...","risk":"...","likelihood":"High|Medium|Low"}],
  "burndownProjection": "...",
  "risks": [],
  "recommendations": [],
  "rationale": [],
  "confidence": 0
}
`;

    let parsed = null;
    try {
      const r = await llm.invoke([{ role: "user", content: prompt }]);
      parsed = parseJsonFromText(typeof r?.content === "string" ? r.content : "");
    } catch {}

    if (!parsed || typeof parsed !== "object") {
      parsed = {
        overallHealth: "At Risk",
        healthScore: 50,
        summary: "Could not generate AI assessment; fallback response.",
        risks: ["AI model response parsing failed"],
        recommendations: ["Review sprint health manually"],
        confidence: 40
      };
    }

    const response = {
      ...parsed,
      sprintTicketCount: sprintTickets.length,
      totalPlannedPoints: sprintTickets.reduce((s, t) => s + (t.storyPoints || 0), 0),
      historicalSprintCount: history.length,
      avgHistoricalVelocity: summary.avgVelocity || null,
      velocityTrend: summary.trend || null,
      dataSources: ["JIRA Sprint Plan", "Standup Transcript", "Historical Sprints", "Foundry", "RAG", "Azure LLM"]
    };

    audit({ type: "SPRINT_HEALTH", response });
    res.json(response);
  } catch (err) {
    res.status(400).json({ error: err?.message || "Failed to generate sprint health insight" });
  }
});

app.post("/api/burndown", (req, res) => {
  try {
    const days = Number(req.body?.days);
    const totalPoints = Number(req.body?.totalPoints);
    const completedPerDay = Array.isArray(req.body?.completedPerDay) ? req.body.completedPerDay : [];
    validateBurndown({ totalPoints, completedPerDay });
    const data = computeBurndown(days, totalPoints, completedPerDay);
    res.json({ data });
  } catch (err) {
    res.status(400).json({ error: err?.message || "Failed to compute burndown" });
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
    res.status(400).json({ error: err?.message || "Failed to save validation feedback" });
  }
});

app.get("/api/audit", (_req, res) => {
  res.json(readJsonFile(AUDIT_LOG, []));
});

app.get("/api/feedback", (_req, res) => {
  res.json(readJsonFile(FEEDBACK_DB, []));
});

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(__dirname, "public-iterative", "index.html"));
});

app.listen(PORT, async () => {
  await initVectorStore();
  console.log(chalk.green(`Iterative + Standup Agent running at http://localhost:${PORT}`));
});
