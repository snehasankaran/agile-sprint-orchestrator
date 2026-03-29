import fs from "fs";
import readline from "readline";
import chalk from "chalk";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import { parse as parseCSV } from "csv-parse/sync";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import { OllamaEmbeddings } from "@langchain/ollama";
import { AzureChatOpenAI } from "@langchain/openai";
import { v4 as uuidv4 } from "uuid";
import { apiLimiter, sanitizeInput } from "./middleware.js";

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

const JIRA_BASE_URL = process.env.JIRA_BASE_URL || localEnv.JIRA_BASE_URL || "";
const JIRA_EMAIL = process.env.JIRA_EMAIL || localEnv.JIRA_EMAIL || "";
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN || localEnv.JIRA_API_TOKEN || "";
const JIRA_PROJECT_KEY = process.env.JIRA_PROJECT_KEY || localEnv.JIRA_PROJECT_KEY || "AP";
const JIRA_STORY_POINTS_FIELD = process.env.JIRA_STORY_POINTS_FIELD || "";
const GUI_PORT = Number(process.env.PORT || 3020);
const DATA_DIR = "data";
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const METRICS_FILE = path.join(DATA_DIR, "sprint_metrics_simulated.json");
const KNOWLEDGE_BASE_FILE = path.join(DATA_DIR, "knowledge_base.json");
const PLANNING_AUDIT_FILE = path.join(DATA_DIR, "planning-audit.json");

function audit(event) {
  let entries = [];
  try {
    if (fs.existsSync(PLANNING_AUDIT_FILE)) {
      const raw = fs.readFileSync(PLANNING_AUDIT_FILE, "utf8");
      const parsed = JSON.parse(raw);
      entries = Array.isArray(parsed) ? parsed : [];
    }
  } catch {
    entries = [];
  }
  entries.push({ id: uuidv4(), time: new Date().toISOString(), ...event });
  fs.writeFileSync(PLANNING_AUDIT_FILE, JSON.stringify(entries, null, 2));
}

const AZURE_OPENAI_API_KEY = process.env.AZURE_OPENAI_API_KEY || localEnv.AZURE_OPENAI_API_KEY || "";
const AZURE_OPENAI_INSTANCE_NAME = process.env.AZURE_OPENAI_API_INSTANCE_NAME || localEnv.AZURE_OPENAI_API_INSTANCE_NAME || "<YOUR_INSTANCE>";
const AZURE_OPENAI_DEPLOYMENT_NAME = process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME || localEnv.AZURE_OPENAI_API_DEPLOYMENT_NAME || "<YOUR_DEPLOYMENT>";
const AZURE_OPENAI_API_VERSION = process.env.AZURE_OPENAI_API_VERSION || localEnv.AZURE_OPENAI_API_VERSION || "2024-04-01-preview";

const llm = new AzureChatOpenAI({
  azureOpenAIApiKey: AZURE_OPENAI_API_KEY,
  azureOpenAIApiInstanceName: AZURE_OPENAI_INSTANCE_NAME,
  azureOpenAIApiDeploymentName: AZURE_OPENAI_DEPLOYMENT_NAME,
  azureOpenAIApiVersion: AZURE_OPENAI_API_VERSION,
  temperature: 0.2
});

const teamMembers = [
  { name: "Ravi", capacity: 12, used: 0, skills: ["ADAS", "Sensor Fusion", "Computer Vision", "Safety Systems", "Control Systems"], velocity: 10 },
  { name: "Priya", capacity: 10, used: 0, skills: ["Backend", "API", "OTA Pipeline", "Middleware", "Observability", "Network"], velocity: 9 },
  { name: "Arun", capacity: 8, used: 0, skills: ["DB", "Integration", "Backend", "Diagnostics", "Embedded Systems"], velocity: 7 },
  { name: "Sneha", capacity: 10, used: 0, skills: ["React", "UI", "Performance Tuning", "Audio Processing", "Embedded Systems"], velocity: 8 },
  { name: "Kiran", capacity: 8, used: 0, skills: ["ADAS", "ML Tuning", "Computer Vision", "Sensor Fusion"], velocity: 7 }
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PRIORITY_SCORE = {
  Highest: 5,
  High: 4,
  Medium: 3,
  Low: 2,
  Lowest: 1
};

const DEFAULT_EXCLUDED_STATUSES = new Set(["done", "closed", "resolved"]);

function round(value) {
  return Math.round(value * 100) / 100;
}

function formatNetworkError(err) {
  const msg = err?.message || String(err);
  const code = err?.code ? `code=${err.code}` : "";
  const causeCode = err?.cause?.code ? `cause=${err.cause.code}` : "";
  const details = [code, causeCode].filter(Boolean).join(", ");
  return details ? `${msg} (${details})` : msg;
}

function createSeededRandom(seedInput = "42") {
  let seed = 0;
  const text = String(seedInput);
  for (let i = 0; i < text.length; i++) {
    seed = (seed * 31 + text.charCodeAt(i)) >>> 0;
  }
  return () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function simulateHistoricalSprintMetrics(count = 6) {
  const rng = createSeededRandom(`${JIRA_PROJECT_KEY}-${count}`);
  const history = [];
  let baseCapacity = 32;
  for (let idx = count; idx >= 1; idx--) {
    const capacityNoise = Math.floor((rng() - 0.5) * 8);
    const capacityPoints = Math.max(20, baseCapacity + capacityNoise);
    const plannedPoints = Math.max(18, capacityPoints - Math.floor(rng() * 4));
    const completedPoints = Math.max(15, plannedPoints - Math.floor(rng() * 7));
    const spilloverPoints = Math.max(0, plannedPoints - completedPoints);
    history.push({
      sprintName: `Sprint-${idx}`,
      capacityPoints,
      plannedPoints,
      completedPoints,
      velocityPoints: completedPoints,
      spilloverPoints
    });
    baseCapacity = Math.max(22, Math.min(38, baseCapacity + Math.floor((rng() - 0.5) * 4)));
  }
  return history.reverse();
}

function buildVelocitySummary(history) {
  if (!history.length) {
    return {
      avgVelocity: 0,
      avgCapacity: 0,
      lastSprintVelocity: 0,
      lastSprintCapacity: 0,
      trend: "stable"
    };
  }
  const avgVelocity = history.reduce((sum, s) => sum + s.velocityPoints, 0) / history.length;
  const avgCapacity = history.reduce((sum, s) => sum + s.capacityPoints, 0) / history.length;
  const last = history[history.length - 1];
  const prev = history.length > 1 ? history[history.length - 2] : last;
  const diff = last.velocityPoints - prev.velocityPoints;
  const trend = diff > 1 ? "up" : diff < -1 ? "down" : "stable";
  return {
    avgVelocity: round(avgVelocity),
    avgCapacity: round(avgCapacity),
    lastSprintVelocity: last.velocityPoints,
    lastSprintCapacity: last.capacityPoints,
    trend
  };
}

function simulateCurrentSprintMetrics(history, userCapacityInput) {
  const summary = buildVelocitySummary(history);
  const userCapacityPoints = toPointsNumber(userCapacityInput, Math.round(summary.avgCapacity || 30));
  const expectedVelocity = round(
    Math.min(
      userCapacityPoints,
      Math.max(0, (summary.avgVelocity || userCapacityPoints) * 0.85 + summary.lastSprintVelocity * 0.15)
    )
  );
  const confidence = summary.trend === "stable" ? "High" : "Medium";
  return {
    sprintName: "Current Sprint (simulated)",
    userCapacityPoints,
    expectedVelocityPoints: expectedVelocity,
    recommendedPlanRange: {
      min: Math.max(0, Math.floor(expectedVelocity - 3)),
      max: Math.ceil(expectedVelocity + 2)
    },
    confidence
  };
}

function getSimulatedMetrics(userCapacityInput) {
  const history = simulateHistoricalSprintMetrics(6);
  return buildMetricsPayload(history, userCapacityInput, "simulated");
}

function buildMetricsPayload(history, userCapacityInput, source = "simulated") {
  const summary = buildVelocitySummary(history);
  const current = simulateCurrentSprintMetrics(history, userCapacityInput);
  const payload = {
    generatedAt: new Date().toISOString(),
    source,
    history,
    summary,
    current
  };
  fs.writeFileSync(METRICS_FILE, JSON.stringify(payload, null, 2));
  return payload;
}

function normalizeMetricRow(row, index) {
  const capacityPoints = Number(row.capacityPoints ?? row.capacity ?? row["Capacity Points"] ?? row["capacity_points"]);
  const velocityPoints = Number(row.velocityPoints ?? row.velocity ?? row["Velocity Points"] ?? row["velocity_points"] ?? row.completedPoints ?? row.completed);
  if (!Number.isFinite(capacityPoints) || !Number.isFinite(velocityPoints)) {
    return null;
  }
  const plannedPointsRaw = Number(row.plannedPoints ?? row.planned ?? row["Planned Points"] ?? row["planned_points"]);
  const completedPointsRaw = Number(row.completedPoints ?? row.completed ?? row["Completed Points"] ?? row["completed_points"] ?? velocityPoints);
  const plannedPoints = Number.isFinite(plannedPointsRaw) ? plannedPointsRaw : capacityPoints;
  const completedPoints = Number.isFinite(completedPointsRaw) ? completedPointsRaw : velocityPoints;
  return {
    sprintName: String(row.sprintName ?? row.sprint ?? row["Sprint Name"] ?? `Sprint-${index + 1}`),
    capacityPoints,
    plannedPoints,
    completedPoints,
    velocityPoints,
    spilloverPoints: Math.max(0, plannedPoints - completedPoints)
  };
}

function loadMetricsFromFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  if (filePath.toLowerCase().endsWith(".json")) {
    const parsed = JSON.parse(raw);
    const rows = Array.isArray(parsed) ? parsed : parsed?.history;
    if (!Array.isArray(rows)) throw new Error("Metrics JSON must be an array or contain a history[] array");
    const normalized = rows.map((row, idx) => normalizeMetricRow(row, idx)).filter(Boolean);
    if (!normalized.length) throw new Error("No valid metrics rows found in JSON");
    return normalized;
  }

  const records = parseCSV(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true
  });
  const normalized = records.map((row, idx) => normalizeMetricRow(row, idx)).filter(Boolean);
  if (!normalized.length) throw new Error("No valid metrics rows found in CSV");
  return normalized;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function previewPayload(data) {
  if (data == null) return "null/undefined payload";
  if (typeof data === "string") return data.replace(/\s+/g, " ").slice(0, 300);
  try {
    return JSON.stringify(data).slice(0, 300);
  } catch {
    return "unserializable payload";
  }
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

      if (!rawBody || !rawBody.trim()) return { status: response.status, data: null };
      try {
        return { status: response.status, data: JSON.parse(rawBody) };
      } catch {
        throw new Error(`${label} returned non-JSON payload. Payload preview: ${previewPayload(rawBody)}`);
      }
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await sleep(1000 * attempt);
      }
    }
  }
  if (lastError) {
    throw new Error(`${label} failed after ${maxAttempts} attempts: ${formatNetworkError(lastError)}`);
  }
  throw new Error(`${label} failed`);
}

function getJiraAuthHeaders(includeJsonContentType = false) {
  const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64");
  const headers = {
    Authorization: `Basic ${auth}`,
    Accept: "application/json"
  };
  if (includeJsonContentType) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

function normalizeIssue(issue) {
  const storyPointsRaw = JIRA_STORY_POINTS_FIELD ? issue.fields?.[JIRA_STORY_POINTS_FIELD] : null;
  const storyPoints = Number.isFinite(Number(storyPointsRaw)) ? Number(storyPointsRaw) : null;
  return {
    key: issue.key || "",
    title: issue.fields?.summary || "",
    summary: issue.fields?.summary || "",
    description: issue.fields?.description ? JSON.stringify(issue.fields.description) : "",
    priority: issue.fields?.priority?.name || "Medium",
    status: issue.fields?.status?.name || "",
    itemType: issue.fields?.issuetype?.name || "",
    storyPoints,
    selected: false
  };
}

async function fetchRefinedBacklogFromJira() {
  const fields = ["summary", "description", "status", "priority", "issuetype"];
  if (JIRA_STORY_POINTS_FIELD) fields.push(JIRA_STORY_POINTS_FIELD);
  const params = new URLSearchParams({
    jql: `project = ${JIRA_PROJECT_KEY} ORDER BY priority DESC, updated DESC`,
    startAt: "0",
    maxResults: "100",
    fields: fields.join(",")
  });
  const url = `${JIRA_BASE_URL.replace(/\/$/, "")}/rest/api/3/search/jql?${params.toString()}`;
  const { data } = await jiraFetchJson(url, {
    method: "GET",
    headers: getJiraAuthHeaders()
  }, "Fetch refined backlog");
  const issues = Array.isArray(data?.issues) ? data.issues : [];
  return issues.map(normalizeIssue);
}

async function fetchJiraBoards() {
  const rootUrl = JIRA_BASE_URL.replace(/\/$/, "");
  const boardUrl = `${rootUrl}/rest/agile/1.0/board?projectKeyOrId=${encodeURIComponent(JIRA_PROJECT_KEY)}&maxResults=50`;
  const boardResp = await jiraFetchJson(boardUrl, {
    method: "GET",
    headers: getJiraAuthHeaders()
  }, "Fetch Jira boards");
  const boards = Array.isArray(boardResp.data?.values) ? boardResp.data.values : [];
  return boards.map(board => ({
    id: board.id,
    name: board.name,
    type: board.type
  }));
}

async function fetchJiraSprintOptions() {
  const rootUrl = JIRA_BASE_URL.replace(/\/$/, "");
  const boards = await fetchJiraBoards();
  const allSprints = [];

  for (const board of boards) {
    const sprintUrl = `${rootUrl}/rest/agile/1.0/board/${board.id}/sprint?state=active,future&maxResults=50`;
    try {
      const sprintResp = await jiraFetchJson(sprintUrl, {
        method: "GET",
        headers: getJiraAuthHeaders()
      }, `Fetch sprints for board ${board.id}`);
      const sprints = Array.isArray(sprintResp.data?.values) ? sprintResp.data.values : [];
      for (const sprint of sprints) {
        allSprints.push({
          id: sprint.id,
          name: sprint.name,
          state: sprint.state,
          boardId: board.id,
          boardName: board.name
        });
      }
    } catch {
      // Skip boards where sprint listing is unavailable.
    }
  }

  const unique = new Map();
  for (const sprint of allSprints) {
    if (!unique.has(sprint.id)) {
      unique.set(sprint.id, sprint);
    }
  }
  return Array.from(unique.values()).sort((a, b) => {
    if (a.state === b.state) return String(a.name).localeCompare(String(b.name));
    if (a.state === "active") return -1;
    if (b.state === "active") return 1;
    return 0;
  });
}

async function createJiraSprint({ boardId, name, goal, startDate, endDate }) {
  const numericBoardId = Number(boardId);
  if (!Number.isInteger(numericBoardId) || numericBoardId <= 0) {
    throw new Error(`Board ID must be numeric. Received: ${boardId}`);
  }
  const sprintName = String(name || "").trim();
  if (!sprintName) {
    throw new Error("Sprint name is required.");
  }

  const rootUrl = JIRA_BASE_URL.replace(/\/$/, "");
  const url = `${rootUrl}/rest/agile/1.0/sprint`;
  const body = {
    originBoardId: numericBoardId,
    name: sprintName
  };
  const sprintGoal = String(goal || "").trim();
  if (sprintGoal) body.goal = sprintGoal;
  if (startDate) body.startDate = startDate;
  if (endDate) body.endDate = endDate;

  const { data } = await jiraFetchJson(url, {
    method: "POST",
    headers: getJiraAuthHeaders(true),
    body: JSON.stringify(body)
  }, "Create Jira sprint");

  return {
    id: data?.id,
    name: data?.name || sprintName,
    state: data?.state || "future",
    boardId: numericBoardId
  };
}

async function fetchJiraSprintById(sprintId) {
  const rootUrl = JIRA_BASE_URL.replace(/\/$/, "");
  const url = `${rootUrl}/rest/agile/1.0/sprint/${sprintId}`;
  const { data } = await jiraFetchJson(url, {
    method: "GET",
    headers: getJiraAuthHeaders()
  }, `Fetch sprint ${sprintId}`);
  return data;
}

function loadBacklogFromFile(filePath = path.join(DATA_DIR, "refined_backlog.json")) {
  const raw = fs.readFileSync(filePath, "utf8");
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error("Input file must contain a JSON array");
  return data.map(item => ({
    key: item.key || item.jiraIssueKey || "",
    title: item.title || item.summary || "Untitled",
    summary: item.summary || item.title || "Untitled",
    description: typeof item.description === "string" ? item.description : JSON.stringify(item.description || ""),
    priority: item.priority || "Medium",
    status: item.status || "To Do",
    itemType: item.itemType || "Story",
    storyPoints: Number.isFinite(Number(item.storyPoints)) ? Number(item.storyPoints) : null,
    selected: false
  }));
}

function isSelectableStatus(status) {
  const s = String(status || "").trim().toLowerCase();
  return !DEFAULT_EXCLUDED_STATUSES.has(s);
}

function ticketRankScore(ticket) {
  const priorityScore = PRIORITY_SCORE[ticket.priority] || 3;
  const points = Number.isFinite(ticket.storyPoints) ? ticket.storyPoints : 3;
  const pointsPenalty = Math.min(points, 21) / 25;
  return priorityScore - pointsPenalty;
}

function parseJSON(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function normalizeStoryPoints(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 3;
}

function sanitizeForPlanning(tickets) {
  return tickets.map(ticket => ({
    ...ticket,
    storyPoints: normalizeStoryPoints(ticket.storyPoints)
  }));
}

async function getFoundryContext(text) {
  try {
    const res = await axios.post(
      "http://localhost:3000/extract",
      { input: text, model_alias: "phi" },
      { timeout: 10000 }
    );
    return res.data?.result || { skillsRequired: [], complexity: "Medium" };
  } catch {
    return { skillsRequired: [], complexity: "Medium" };
  }
}

let vectorStorePromise = null;
async function setupVectorStore() {
  if (vectorStorePromise) return vectorStorePromise;
  vectorStorePromise = (async () => {
    const data = fs.existsSync(KNOWLEDGE_BASE_FILE) ? parseJSON(KNOWLEDGE_BASE_FILE) : [];
    const docs = data.map(d => ({
      pageContent: `${d.summary || ""}\n${d.description || ""}`.trim(),
      metadata: d
    }));
    if (!docs.length) return null;
    try {
      return await MemoryVectorStore.fromDocuments(
        docs,
        new OllamaEmbeddings({ model: "nomic-embed-text" })
      );
    } catch {
      return null;
    }
  })();
  return vectorStorePromise;
}

async function getRAGContext(store, ticket) {
  if (!store) return "";
  const query = ticket.summary || ticket.title || "";
  if (!query) return "";
  const res = await store.similaritySearch(query, 2);
  return res.map(r => r.pageContent).join("\n");
}

function score(ticket, member) {
  const required = Array.isArray(ticket.skillsRequired) ? ticket.skillsRequired : [];
  const skillMatch = required.filter(s => member.skills.includes(s)).length;
  const capacityFit = (member.capacity - member.used) >= ticket.storyPoints ? 1 : 0;
  return skillMatch * 0.5 + capacityFit * 0.3 + (member.velocity / 20) * 0.2;
}

function assignFallback(ticket, members) {
  let best = null;
  let bestScore = -1;
  for (const member of members) {
    if ((member.capacity - member.used) < ticket.storyPoints) continue;
    const s = score(ticket, member);
    if (s > bestScore) {
      best = member;
      bestScore = s;
    }
  }
  if (best) best.used += ticket.storyPoints;
  return best?.name || "Unassigned";
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

function loadHistoricalSprintContext() {
  try {
    if (!fs.existsSync(METRICS_FILE)) return "";
    const metrics = JSON.parse(fs.readFileSync(METRICS_FILE, "utf8"));
    const history = Array.isArray(metrics.history) ? metrics.history : [];
    if (!history.length) return "";
    return history.map(s => {
      const refs = Array.isArray(s.ticketRefs) ? s.ticketRefs.join(", ") : "";
      const themes = Array.isArray(s.themes) ? s.themes.join(", ") : "";
      return `${s.sprintName}: velocity ${s.velocityPoints}/${s.capacityPoints} SP, refs=[${refs}], themes=[${themes}]`;
    }).join("\n");
  } catch {
    return "";
  }
}

async function getAIReason(ticket, members, rag) {
  const historicalContext = loadHistoricalSprintContext();
  const membersWithSkills = members.map(m => ({
    name: m.name,
    skills: m.skills,
    remainingCapacity: m.capacity - m.used,
    velocity: m.velocity
  }));
  const prompt = `
Assign the best team member for this ticket based on skill match, remaining capacity, and historical sprint context.

Ticket: ${ticket.summary}
Description: ${ticket.description || "N/A"}
StoryPoints: ${ticket.storyPoints}
Priority: ${ticket.priority || "Medium"}
SkillsRequired: ${JSON.stringify(ticket.skillsRequired || [])}

Team members (with skills and remaining capacity):
${JSON.stringify(membersWithSkills, null, 2)}

Historical sprint context:
${historicalContext || "No historical data available."}

RAG knowledge base context:
${rag || "No RAG matches."}

Assignment criteria:
1. Skill match: member skills should overlap with required skills
2. Capacity: member must have enough remaining capacity for the story points
3. Historical reference: prefer members who worked on similar themes in past sprints

Return JSON only:
{"assignee":"<member name>","confidence":<0-100>,"rationale":["reason1","reason2"]}
`;
  try {
    const res = await llm.invoke([{ role: "user", content: prompt }]);
    const parsed = parseJsonFromText(typeof res?.content === "string" ? res.content : "");
    if (parsed && typeof parsed === "object") return parsed;
  } catch {}
  return { assignee: "", confidence: 50, rationale: [] };
}

function buildFallbackRationale(ticket, foundry, rag, fallbackAssignee, finalAssignee) {
  const reasons = [];
  const skills = Array.isArray(foundry?.skillsRequired) ? foundry.skillsRequired : [];
  if (skills.length) {
    reasons.push(`Skills inferred from Foundry: ${skills.join(", ")}`);
  } else {
    reasons.push("No explicit skills inferred from Foundry; used capacity/velocity scoring.");
  }
  reasons.push(`Story points considered: ${ticket.storyPoints}`);
  reasons.push(`Fallback scoring suggested assignee: ${fallbackAssignee}`);
  if (finalAssignee && finalAssignee !== fallbackAssignee) {
    reasons.push(`Final assignee overridden by AI recommendation: ${finalAssignee}`);
  }
  if (rag) {
    reasons.push("RAG context from knowledge base was included in assignment reasoning.");
  } else {
    reasons.push("No RAG matches found; assignment used ticket-only context.");
  }
  return reasons;
}

async function enrichSprintTicketsWithAI(selectedTickets) {
  const store = await setupVectorStore();
  const members = teamMembers.map(m => ({ ...m, used: 0 }));
  const enriched = [];
  let anyRag = false;
  let anyHeuristicFallback = false;
  for (const original of selectedTickets) {
    const ticket = {
      ...original,
      summary: original.summary || original.title || "Untitled",
      storyPoints: normalizeStoryPoints(original.storyPoints)
    };
    const foundry = await getFoundryContext(ticket.summary);
    ticket.skillsRequired = Array.isArray(foundry?.skillsRequired) ? foundry.skillsRequired : [];
    ticket.complexity = foundry?.complexity || "Medium";
    const rag = await getRAGContext(store, ticket);
    if (String(rag || "").trim()) anyRag = true;
    const fallbackAssignee = assignFallback(ticket, members);
    const ai = await getAIReason(ticket, members, rag);
    const allowed = new Set(members.map(m => m.name));
    const aiAssignee = allowed.has(ai?.assignee) ? ai.assignee : fallbackAssignee;
    if (!allowed.has(ai?.assignee)) anyHeuristicFallback = true;
    ticket.assignee = aiAssignee || "Unassigned";
    ticket.confidence = Number.isFinite(Number(ai?.confidence)) ? Number(ai.confidence) : 50;
    const aiRationale = Array.isArray(ai?.rationale)
      ? ai.rationale.map(v => String(v || "").trim()).filter(Boolean)
      : [];
    ticket.rationale = aiRationale.length
      ? aiRationale
      : buildFallbackRationale(ticket, foundry, rag, fallbackAssignee, aiAssignee);
    ticket.ragContext = rag;
    ticket.assignmentReview = {
      status: "Pending",
      reviewer: "",
      comment: ""
    };
    enriched.push(ticket);
  }
  const dataSources = ["AzureLLM", "FoundryLocal"];
  if (anyRag) dataSources.push("RAG");
  if (anyHeuristicFallback) dataSources.push("HeuristicFallback");
  return { tickets: enriched, dataSources };
}

function recommendSprintBacklog(tickets, capacityPoints = 30) {
  const normalized = sanitizeForPlanning(tickets);
  const sorted = [...normalized]
    .filter(t => isSelectableStatus(t.status))
    .sort((a, b) => ticketRankScore(b) - ticketRankScore(a));

  const selected = [];
  const deferred = [];
  let totalPoints = 0;

  for (const ticket of sorted) {
    const points = Number.isFinite(ticket.storyPoints) ? ticket.storyPoints : 3;
    if (totalPoints + points <= capacityPoints) {
      selected.push({ ...ticket, selected: true });
      totalPoints += points;
    } else {
      deferred.push({ ...ticket, selected: false });
    }
  }

  return {
    selected,
    deferred,
    totalPoints,
    capacityPoints
  };
}

function buildSprintGoal(selectedTickets) {
  if (!selectedTickets.length) return "Deliver top-priority backlog items for this sprint.";
  const top = selectedTickets.slice(0, 3).map(t => t.summary || t.title).filter(Boolean);
  return `Deliver ${selectedTickets.length} prioritized backlog items, including: ${top.join("; ")}.`;
}

function exportSprintPlan(plan) {
  fs.writeFileSync(path.join(DATA_DIR, "sprint_plan.json"), JSON.stringify(plan, null, 2));
  let md = "# Sprint Plan\n\n";
  md += `- Sprint Goal: ${plan.sprintGoal}\n`;
  md += `- Capacity Points: ${plan.capacityPoints}\n`;
  md += `- Planned Points: ${plan.totalPoints}\n\n`;
  md += "## Selected Tickets\n\n";
  for (const t of plan.sprintBacklog) {
    md += `- ${t.key || "(no-key)"} | ${t.priority} | ${t.storyPoints ?? "?"} SP | ${t.summary}\n`;
  }
  fs.writeFileSync(path.join(DATA_DIR, "sprint_plan.md"), md);
}

async function pushTicketsToJiraSprint(sprintId, issueKeys) {
  const rawSprintId = String(sprintId || "").trim();
  if (!rawSprintId) throw new Error("Sprint ID is required.");
  if (!/^\d+$/.test(rawSprintId)) {
    throw new Error(`Sprint ID must be numeric (example: 123). Received: ${rawSprintId}`);
  }
  const numericSprintId = Number(rawSprintId);
  if (!Number.isInteger(numericSprintId) || numericSprintId <= 0) {
    throw new Error(`Invalid sprint ID: ${rawSprintId}`);
  }
  try {
    await fetchJiraSprintById(numericSprintId);
  } catch (err) {
    const msg = err?.message || String(err);
    if (msg.includes("HTTP 404")) {
      throw new Error(`Sprint ${numericSprintId} not found in JIRA. Reload sprints and select a valid sprint.`);
    }
    throw err;
  }
  if (!Array.isArray(issueKeys) || !issueKeys.length) throw new Error("No issue keys provided");
  const url = `${JIRA_BASE_URL.replace(/\/$/, "")}/rest/agile/1.0/sprint/${numericSprintId}/issue`;
  const { status } = await jiraFetchJson(url, {
    method: "POST",
    headers: getJiraAuthHeaders(true),
    body: JSON.stringify({ issues: issueKeys })
  }, "Push tickets to sprint");
  if (status < 200 || status >= 300) {
    throw new Error(`Failed to push issues to sprint. HTTP ${status}`);
  }
  return { pushed: issueKeys.length, sprintId: numericSprintId };
}

function toPointsNumber(value, fallback = 30) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function runGuiServer() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use("/api/", apiLimiter);
  app.use("/api/", sanitizeInput);
  const publicDir = path.join(__dirname, "public-sprint");
  app.use(express.static(publicDir));

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  app.post("/api/metrics/simulate", (req, res) => {
    try {
      const userCapacityPoints = toPointsNumber(req.body?.userCapacityPoints, 30);
      const metrics = getSimulatedMetrics(userCapacityPoints);
      return res.json({ ok: true, ...metrics });
    } catch (err) {
      return res.status(400).json({ error: err?.message || "Failed to simulate sprint metrics" });
    }
  });

  app.post("/api/metrics/load", (req, res) => {
    try {
      const filePath = String(req.body?.filePath || path.join(DATA_DIR, "sprint_metrics_simulated.json"));
      const userCapacityPoints = toPointsNumber(req.body?.userCapacityPoints, 30);
      const history = loadMetricsFromFile(filePath);
      const payload = buildMetricsPayload(history, userCapacityPoints, "user-file");
      return res.json({ ok: true, ...payload });
    } catch (err) {
      return res.status(400).json({ error: err?.message || "Failed to load metrics file" });
    }
  });

  app.post("/api/backlog/load", async (req, res) => {
    try {
      const source = req.body?.source === "jira" ? "jira" : "file";
      const filePath = String(req.body?.filePath || path.join(DATA_DIR, "refined_backlog.json"));
      const tickets = source === "jira"
        ? await fetchRefinedBacklogFromJira()
        : loadBacklogFromFile(filePath);
      return res.json({ source, count: tickets.length, tickets });
    } catch (err) {
      const rawMessage = err?.message || "Failed to load backlog";
      const jiraHint = String(rawMessage).toLowerCase().includes("fetch failed")
        ? " Tip: restart with `node --use-env-proxy sprint_planning_agent.js --gui` for corporate proxy."
        : "";
      return res.status(400).json({ error: `${rawMessage}${jiraHint}` });
    }
  });

  app.get("/api/jira/sprints", async (_req, res) => {
    try {
      const sprints = await fetchJiraSprintOptions();
      return res.json({ ok: true, count: sprints.length, sprints });
    } catch (err) {
      return res.status(400).json({ error: err?.message || "Failed to load Jira sprints" });
    }
  });

  app.get("/api/jira/boards", async (_req, res) => {
    try {
      const boards = await fetchJiraBoards();
      return res.json({ ok: true, count: boards.length, boards });
    } catch (err) {
      return res.status(400).json({ error: err?.message || "Failed to load Jira boards" });
    }
  });

  app.post("/api/jira/sprints/create", async (req, res) => {
    try {
      const created = await createJiraSprint({
        boardId: req.body?.boardId,
        name: req.body?.name,
        goal: req.body?.goal,
        startDate: req.body?.startDate,
        endDate: req.body?.endDate
      });
      return res.json({ ok: true, sprint: created });
    } catch (err) {
      return res.status(400).json({ error: err?.message || "Failed to create Jira sprint" });
    }
  });

  app.post("/api/sprint/recommend", (req, res) => {
    try {
      const tickets = Array.isArray(req.body?.tickets) ? req.body.tickets : [];
      const capacityPoints = toPointsNumber(req.body?.capacityPoints, 30);
      const recommendation = recommendSprintBacklog(tickets, capacityPoints);
      const sprintGoal = buildSprintGoal(recommendation.selected);
      audit({ type: "SPRINT_RECOMMEND", ticketCount: tickets.length, capacityPoints });
      const dataSources = ["VelocityHistory"];
      return res.json({ ...recommendation, sprintGoal, usedCapacityPoints: capacityPoints, dataSources });
    } catch (err) {
      return res.status(400).json({ error: err?.message || "Failed to recommend sprint backlog" });
    }
  });

  app.post("/api/sprint/ai-assign", async (req, res) => {
    try {
      const tickets = Array.isArray(req.body?.tickets) ? req.body.tickets : [];
      if (!tickets.length) {
        return res.status(400).json({ error: "No tickets provided for AI assignment." });
      }
      const selectedOnly = tickets.filter(t => !!t.selected);
      const target = selectedOnly.length ? selectedOnly : tickets;
      const { tickets: enriched, dataSources } = await enrichSprintTicketsWithAI(target);
      audit({ type: "SPRINT_AI_ASSIGN", ticketCount: target.length });
      return res.json({ ok: true, count: enriched.length, tickets: enriched, dataSources });
    } catch (err) {
      return res.status(400).json({ error: err?.message || "Failed to generate AI assignments." });
    }
  });

  app.post("/api/sprint/save", (req, res) => {
    try {
      const sprintBacklog = Array.isArray(req.body?.sprintBacklog) ? req.body.sprintBacklog : [];
      const capacityPoints = toPointsNumber(req.body?.capacityPoints, 30);
      const totalPoints = sprintBacklog.reduce((sum, t) => sum + (Number(t.storyPoints) || 3), 0);
      const sprintGoal = String(req.body?.sprintGoal || buildSprintGoal(sprintBacklog));
      const plan = {
        createdAt: new Date().toISOString(),
        capacityPoints,
        totalPoints,
        sprintGoal,
        sprintBacklog
      };
      exportSprintPlan(plan);
      audit({ type: "SPRINT_SAVE", totalPoints, capacityPoints, ticketCount: sprintBacklog.length });
      return res.json({ ok: true, totalPoints, capacityPoints, sprintGoal });
    } catch (err) {
      return res.status(400).json({ error: err?.message || "Failed to save sprint plan" });
    }
  });

  app.post("/api/sprint/push", async (req, res) => {
    try {
      const sprintId = String(req.body?.sprintId || "").trim();
      const issueKeys = (Array.isArray(req.body?.issueKeys) ? req.body.issueKeys : [])
        .map(v => String(v || "").trim())
        .filter(Boolean);
      const result = await pushTicketsToJiraSprint(sprintId, issueKeys);
      return res.json({ ok: true, ...result });
    } catch (err) {
      return res.status(400).json({ error: err?.message || "Failed to push sprint issues" });
    }
  });

  app.get("/api/audit", (_req, res) => {
    try {
      if (!fs.existsSync(PLANNING_AUDIT_FILE)) {
        return res.json([]);
      }
      const raw = fs.readFileSync(PLANNING_AUDIT_FILE, "utf8");
      const parsed = JSON.parse(raw);
      return res.json(Array.isArray(parsed) ? parsed : []);
    } catch (err) {
      return res.status(500).json({ error: err?.message || "Failed to read audit log" });
    }
  });

  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });

  app.listen(GUI_PORT, () => {
    console.log(chalk.green(`Sprint Planning GUI ready at http://localhost:${GUI_PORT}`));
  });
}

async function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise(resolve => rl.question(question, resolve));
  rl.close();
  return String(answer || "").trim();
}

async function runCli() {
  console.log(chalk.blue("\n=== Sprint Planning Agent ==="));
  const sourceInput = await ask("Backlog source? (1 = JIRA, 2 = file): ");
  const source = sourceInput === "1" ? "jira" : "file";
  const capacity = toPointsNumber(await ask("Target sprint capacity (story points, default 30): "), 30);
  const metrics = getSimulatedMetrics(capacity);
  console.log(chalk.cyan(`Previous sprint capacity/velocity: ${metrics.summary.lastSprintCapacity}/${metrics.summary.lastSprintVelocity} SP`));
  console.log(chalk.cyan(`Average velocity/capacity: ${metrics.summary.avgVelocity}/${metrics.summary.avgCapacity} SP`));
  console.log(chalk.cyan(`Current sprint simulation: capacity ${metrics.current.userCapacityPoints}, expected velocity ${metrics.current.expectedVelocityPoints} SP`));

  const tickets = source === "jira"
    ? await fetchRefinedBacklogFromJira()
    : loadBacklogFromFile(await ask("File path (default refined_backlog.json): ") || path.join(DATA_DIR, "refined_backlog.json"));

  const { selected, totalPoints } = recommendSprintBacklog(tickets, capacity);
  const sprintGoal = await ask(`Sprint goal (press Enter for auto): `) || buildSprintGoal(selected);

  const plan = {
    createdAt: new Date().toISOString(),
    source,
    capacityPoints: capacity,
    totalPoints,
    sprintGoal,
    sprintBacklog: selected
  };
  exportSprintPlan(plan);

  console.log(chalk.green(`\nRecommended ${selected.length} tickets, ${totalPoints}/${capacity} SP planned.`));
  selected.forEach(t => {
    console.log(`- ${t.key || "(no-key)"} | ${t.priority} | ${t.storyPoints ?? "?"} SP | ${t.summary}`);
  });
  console.log(chalk.green("\nSaved sprint_plan.json and sprint_plan.md"));
}

const shouldRunCli = process.argv.includes("--cli");
if (shouldRunCli) {
  runCli().catch(err => {
    console.error(chalk.red("Sprint Planning failed:"), err?.message || err);
    process.exit(1);
  });
} else {
  runGuiServer().catch(err => {
    console.error(chalk.red("Failed to start Sprint Planning GUI:"), err?.message || err);
    process.exit(1);
  });
}
