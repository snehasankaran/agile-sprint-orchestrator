import fs from "fs";
import readline from "readline";
import chalk from "chalk";
import Ajv from "ajv";
import { v4 as uuidv4 } from "uuid";
import { parse as parseCSV } from "csv-parse/sync";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
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
const JIRA_JQL = process.env.JIRA_JQL || `project = ${JIRA_PROJECT_KEY} ORDER BY created DESC`;
const JIRA_MAX_RESULTS = Number(process.env.JIRA_MAX_RESULTS || 60);
const JIRA_STORY_POINTS_FIELD = process.env.JIRA_STORY_POINTS_FIELD || "";
const REFINEMENT_SCHEMA_FILE = "JSON schema for backlog refinement.json";
const GENERATION_INPUT_DEFAULT_FILE = "JSON Schema for Requirement_feedback.json";
const GUI_PORT = Number(process.env.PORT || 3000);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PLANNING_POKER_SCALE = [1, 2, 3, 5, 8, 13, 21];
const STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "into", "when",
  "then", "shall", "should", "will", "have", "has", "had", "are", "was",
  "were", "your", "about", "after", "before", "while", "within", "without",
  "over", "under", "below", "above", "into", "onto", "must", "can"
]);
const DEPENDENCY_RULES = [
  { regex: /(api|rest|endpoint|service)/g, label: "Backend API dependency" },
  { regex: /(jira|atlassian)/g, label: "JIRA integration dependency" },
  { regex: /(database|db|sql|schema|migration)/g, label: "Database dependency" },
  { regex: /(sensor|camera|radar|lidar)/g, label: "Sensor subsystem dependency" },
  { regex: /(ota|firmware|update)/g, label: "OTA/update pipeline dependency" },
  { regex: /(auth|oauth|token|sso|identity)/g, label: "Identity/auth dependency" },
  { regex: /(ui|frontend|screen|dashboard|ux)/g, label: "Frontend/UI dependency" },
  { regex: /(network|gateway|proxy|dns|connectivity)/g, label: "Network/proxy dependency" },
  { regex: /(test|qa|automation|regression|simulation)/g, label: "QA/testing dependency" }
];

const DATA_DIR = "data";
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const BACKLOG_AUDIT_FILE = path.join(DATA_DIR, "backlog-audit.json");

function audit(event) {
  let log = [];
  try { if (fs.existsSync(BACKLOG_AUDIT_FILE)) log = JSON.parse(fs.readFileSync(BACKLOG_AUDIT_FILE, "utf8")); } catch {}
  log.push({ id: uuidv4(), time: new Date().toISOString(), ...event });
  if (log.length > 1000) log = log.slice(-500);
  try { fs.writeFileSync(BACKLOG_AUDIT_FILE, JSON.stringify(log, null, 2)); } catch {}
}

async function askOperationMode() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(
      "\nWhat would you like to do?\n1. Generate backlog tickets from requirements/feedback (push to JIRA)\n2. Refine existing backlog tickets (fetch from JIRA)\nSelect 1 or 2: ",
      answer => { rl.close(); resolve(answer.trim()); }
    );
  });
}
async function askInputFile(defaultFile) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(`\nEnter input file path (default: ${defaultFile}): `, input => {
      rl.close();
      resolve(input.trim() || defaultFile);
    });
  });
}

async function askGenerationInputMode() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(
      "\nGeneration input source?\n1. File (json/csv/txt/md)\n2. Paste unstructured text now\nSelect 1 or 2: ",
      answer => {
        rl.close();
        resolve(answer.trim() === "2" ? "paste" : "file");
      }
    );
  });
}

async function askUnstructuredTextInput() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log(chalk.cyan("\nPaste unstructured requirements/feedback text."));
  console.log(chalk.cyan("Use '---' between items. End with EOF on a new line.\n"));
  const lines = [];
  while (true) {
    const line = await new Promise(res => rl.question(lines.length ? "" : "> ", res));
    if (line.trim() === "EOF") break;
    lines.push(line);
  }
  rl.close();
  return lines.join("\n").trim();
}

// Support CSV or JSON input
function normalizePriority(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "high") return "High";
  if (v === "low") return "Low";
  return "Medium";
}

function parseTextRecords(raw) {
  const blocks = raw
    .split(/\r?\n\s*---+\s*\r?\n/g)
    .map(b => b.trim())
    .filter(Boolean);

  return blocks.map((block, idx) => {
    const lines = block.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let type = "requirement";
    let priority = "Medium";
    const contentLines = [];

    for (const line of lines) {
      const typeMatch = line.match(/^type\s*:\s*(.+)$/i);
      if (typeMatch) {
        type = typeMatch[1].trim().toLowerCase();
        continue;
      }
      const priMatch = line.match(/^priority\s*:\s*(.+)$/i);
      if (priMatch) {
        priority = normalizePriority(priMatch[1]);
        continue;
      }
      contentLines.push(line);
    }

    const summary = contentLines[0] || `Input ${idx + 1}`;
    const description = contentLines.slice(1).join("\n") || summary;
    return {
      type,
      summary,
      description,
      priority
    };
  });
}

function parseInputFlexible(filePath) {
  const ext = filePath.toLowerCase().split(".").pop();
  const raw = fs.readFileSync(filePath, "utf8");
  if (ext === "json") {
    try { return JSON.parse(raw); } catch { throw new Error(`Could not parse JSON: ${filePath}`); }
  } else if (ext === "csv") {
    try {
      const records = parseCSV(raw, { columns: true, skip_empty_lines: true });
      return records;
    } catch {
      throw new Error(`Could not parse CSV: ${filePath}`);
    }
  } else if (ext === "txt" || ext === "md") {
    const records = parseTextRecords(raw);
    if (!records.length) throw new Error(`Could not parse text input: ${filePath}`);
    return records;
  } else {
    try { return JSON.parse(raw); } catch {}
    try {
      return parseCSV(raw, { columns: true, skip_empty_lines: true });
    } catch {
      const records = parseTextRecords(raw);
      if (records.length) return records;
      throw new Error("Unsupported file format or invalid content");
    }
  }
}

function validateSchema(schema, data) {
  const ajv = new Ajv();
  const validate = ajv.compile(schema);
  const valid = validate(data);
  if (!valid) {
    console.log(chalk.red("❌ Schema validation failed"));
    console.log(validate.errors);
  }
  return valid;
}

// Fetch issues from JIRA
function previewPayload(data) {
  if (data == null) return "null/undefined payload";
  if (typeof data === "string") {
    return data.replace(/\s+/g, " ").slice(0, 300);
  }
  try {
    return JSON.stringify(data).slice(0, 300);
  } catch {
    return "unserializable payload";
  }
}

function adfToPlainText(adfNode) {
  if (!adfNode) return "";
  if (typeof adfNode === "string") return adfNode;
  if (Array.isArray(adfNode)) {
    return adfNode.map(adfToPlainText).filter(Boolean).join("\n");
  }
  if (typeof adfNode !== "object") return String(adfNode);

  if (adfNode.type === "text") {
    return adfNode.text || "";
  }

  const content = Array.isArray(adfNode.content) ? adfNode.content : [];
  const inlineTypes = new Set(["paragraph", "heading", "text", "strong", "em", "link"]);

  if (content.length === 0) return "";

  if (inlineTypes.has(adfNode.type)) {
    return content.map(adfToPlainText).join("");
  }

  return content.map(adfToPlainText).filter(Boolean).join("\n");
}

function normalizeJiraDescription(description) {
  if (!description) return "";
  if (typeof description === "string") return description;
  if (typeof description === "object") return adfToPlainText(description).trim();
  return String(description);
}

function isGatewayTimeoutPayload(raw) {
  if (!raw || typeof raw !== "string") return false;
  const text = raw.toLowerCase();
  return text.includes("error code: 504") ||
    text.includes("operation timed out") ||
    text.includes("gateway server");
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatNetworkError(err) {
  const code = err?.code ? `code=${err.code}` : "";
  const causeCode = err?.cause?.code ? `cause=${err.cause.code}` : "";
  const details = [code, causeCode].filter(Boolean).join(", ");
  return details ? `${err.message} (${details})` : err.message;
}

async function jiraFetchJson(url, options = {}, methodLabel = "JIRA request") {
  const maxAttempts = 3;
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      let response;
      try {
        response = await fetch(url, {
          method: options.method || "GET",
          headers: options.headers || {},
          body: options.body,
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeout);
      }
      const rawBody = await response.text();

      // Some proxy paths return HTML timeout pages even when HTTP status isn't 504.
      if (isGatewayTimeoutPayload(rawBody)) {
        throw new Error(`${methodLabel} timed out through gateway/proxy. Payload preview: ${previewPayload(rawBody)}`);
      }

      if (!response.ok) {
        throw new Error(`${methodLabel} failed: HTTP ${response.status}. Payload preview: ${previewPayload(rawBody)}`);
      }

      if (!rawBody || !rawBody.trim()) {
        return { status: response.status, data: null };
      }

      try {
        return { status: response.status, data: JSON.parse(rawBody) };
      } catch {
        throw new Error(`${methodLabel} returned non-JSON payload. Payload preview: ${previewPayload(rawBody)}`);
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxAttempts) {
        await sleep(1000 * attempt);
        continue;
      }
    }
  }
  if (lastError?.message) {
    throw new Error(`${methodLabel} failed after ${maxAttempts} attempts: ${formatNetworkError(lastError)}`);
  }
  throw new Error(`${methodLabel} failed after ${maxAttempts} attempts`);
}

async function fetchJiraBacklog() {
  const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');
  const fields = [
    "summary",
    "description",
    "status",
    "priority",
    "issuetype",
    "assignee",
    "created",
    "updated"
  ];
  if (JIRA_STORY_POINTS_FIELD) fields.push(JIRA_STORY_POINTS_FIELD);
  const params = new URLSearchParams({
    jql: JIRA_JQL,
    startAt: "0",
    maxResults: String(JIRA_MAX_RESULTS),
    fields: fields.join(",")
  });
  const url = `${JIRA_BASE_URL.replace(/\/$/, "")}/rest/api/3/search/jql?${params.toString()}`;

  try {
    const { data } = await jiraFetchJson(url, {
      method: "GET",
      headers: {
        "Authorization": "Basic " + auth,
        "Accept": "application/json"
      }
    }, "JIRA search");

    const issues = data?.issues;
    if (!Array.isArray(issues)) {
      const keys = data && typeof data === "object"
        ? Object.keys(data).join(", ")
        : "non-object payload";
      const payloadType = Array.isArray(data) ? "array" : typeof data;
      const payloadPreview = previewPayload(data);
      throw new Error(
        `Unexpected JIRA response shape. Expected data.issues[], got keys: ${keys}, payload type: ${payloadType}. Payload preview: ${payloadPreview}`
      );
    }

    return issues.map(issue => ({
      key: issue.key,
      summary: issue.fields?.summary || "",
      description: normalizeJiraDescription(issue.fields?.description),
      status: issue.fields?.status?.name || "",
      priority: issue.fields?.priority?.name || "",
      itemType: issue.fields?.issuetype?.name || "",
      assignee: issue.fields?.assignee?.displayName || "",
      created: issue.fields?.created || "",
      updated: issue.fields?.updated || "",
      storyPoints: JIRA_STORY_POINTS_FIELD
        ? parseStoryPoints(issue.fields?.[JIRA_STORY_POINTS_FIELD])
        : null
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown JIRA fetch error";
    throw new Error(`Failed to fetch JIRA backlog: ${message}`);
  }
}

// Push ticket to JIRA (after approval)
async function pushBacklogTicketToJira(ticket) {
  const url = `${JIRA_BASE_URL}/rest/api/3/issue`;
  const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');
  const baseDescriptionText = typeof ticket.description === "string"
    ? ticket.description
    : JSON.stringify(ticket.description || "", null, 2);
  const storyPoints = resolveStoryPoints(ticket);
  const descriptionText = Number.isFinite(storyPoints)
    ? `${baseDescriptionText}\n\nStory Points (Planning Poker): ${storyPoints}`
    : baseDescriptionText;
  const body = {
    fields: {
      project: { key: JIRA_PROJECT_KEY },
      summary: ticket.title || ticket.summary || "No summary",
      description: {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: descriptionText || "No description" }]
          }
        ]
      },
      issuetype: { name: ticket.itemType || "Story" },
      priority: { name: ticket.priority || "Medium" },
    }
  };
  if (Number.isFinite(storyPoints) && JIRA_STORY_POINTS_FIELD) {
    body.fields[JIRA_STORY_POINTS_FIELD] = storyPoints;
  }
  const { status, data } = await jiraFetchJson(url, {
    method: "POST",
    headers: {
      "Authorization": "Basic " + auth,
      "Accept": "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  }, "JIRA create issue");
  if (status !== 201) {
    throw new Error(`JIRA create issue unexpected status: ${status}`);
  }
  return data;
}

async function updateJiraTicketWithRefinement(ticket) {
  const issueKey = ticket.key || ticket.jiraIssueKey;
  if (!issueKey) {
    throw new Error("Missing Jira issue key on refined ticket.");
  }
  const url = `${JIRA_BASE_URL}/rest/api/3/issue/${issueKey}`;
  const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');
  const baseDescriptionText = typeof ticket.description === "string"
    ? ticket.description
    : JSON.stringify(ticket.description || "", null, 2);
  const storyPoints = resolveStoryPoints(ticket);
  const descriptionText = Number.isFinite(storyPoints)
    ? `${baseDescriptionText}\n\nStory Points (Planning Poker): ${storyPoints}`
    : baseDescriptionText;
  const body = {
    fields: {
      summary: ticket.title || ticket.summary || "No summary",
      description: {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: descriptionText || "No description" }]
          }
        ]
      },
      issuetype: { name: ticket.itemType || "Story" },
      priority: { name: ticket.priority || "Medium" },
    }
  };
  if (Number.isFinite(storyPoints) && JIRA_STORY_POINTS_FIELD) {
    body.fields[JIRA_STORY_POINTS_FIELD] = storyPoints;
  }

  const { status } = await jiraFetchJson(url, {
    method: "PUT",
    headers: {
      "Authorization": "Basic " + auth,
      "Accept": "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  }, `JIRA update issue ${issueKey}`);
  if (status !== 204) {
    throw new Error(`JIRA update failed for ${issueKey}. Unexpected HTTP ${status}.`);
  }

  const verifyUrl = `${JIRA_BASE_URL}/rest/api/3/issue/${issueKey}?fields=summary,description,priority,issuetype`;
  const verifyResp = await jiraFetchJson(verifyUrl, {
    method: "GET",
    headers: {
      "Authorization": "Basic " + auth,
      "Accept": "application/json"
    }
  }, `JIRA verify issue ${issueKey}`);
  if (verifyResp.status < 200 || verifyResp.status >= 300 || !verifyResp.data) {
    throw new Error(`Updated ${issueKey} but failed verification read. HTTP ${verifyResp.status || "unknown"}`);
  }
  return verifyResp.data;
}

function buildRefinementDraft(req) {
  return {
    ...req,
    key: req.key,
    itemType: req.itemType || "Story",
    title: req.title || req.summary || "Untitled",
    summary: req.summary || req.title || "Untitled",
    description: typeof req.description === "string"
      ? req.description
      : JSON.stringify(req.description || "", null, 2),
    priority: req.priority || "Medium",
  };
}

function buildGenerationDraft(req) {
  const normalizedType = String(req.type || "").toLowerCase();
  let mappedItemType = req.itemType;
  if (!mappedItemType) {
    if (normalizedType === "requirement") mappedItemType = "Story";
    else if (normalizedType === "feedback") mappedItemType = "Bug";
    else mappedItemType = "Task";
  }

  return {
    ...req,
    itemType: mappedItemType,
    title: req.title || req.summary || "Untitled",
    summary: req.summary || req.title || "Untitled",
    description: typeof req.description === "string"
      ? req.description
      : JSON.stringify(req.description || "", null, 2),
    priority: req.priority || "Medium",
  };
}

function isApprovalStatus(status) {
  return status === "Approved" || status === "Edited & Approved";
}

function loadSchema() {
  const schema = parseInputFlexible(REFINEMENT_SCHEMA_FILE);
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    throw new Error(`Invalid schema in ${REFINEMENT_SCHEMA_FILE}`);
  }
  return schema;
}

function toReviewObject(review = {}) {
  const comments = Array.isArray(review.comments)
    ? review.comments
    : [review.comment || ""];
  return {
    status: review.status || "Pending",
    reviewer: review.reviewer || "",
    comments: comments.filter(Boolean)
  };
}

function toEstimationObject(estimation = {}, fallbackStoryPoints) {
  const aiSuggestedPoints = parseStoryPoints(
    estimation.aiSuggestedPoints ?? fallbackStoryPoints
  );
  const approvedPoints = parseStoryPoints(
    estimation.approvedPoints ?? aiSuggestedPoints
  );
  return {
    aiSuggestedPoints: Number.isFinite(aiSuggestedPoints) ? aiSuggestedPoints : null,
    approvedPoints: Number.isFinite(approvedPoints) ? approvedPoints : null,
    status: estimation.status || "Pending Approval",
    rationale: estimation.rationale || "",
    basedOnHistoryCount: Number(estimation.basedOnHistoryCount || 0),
    similarTickets: Array.isArray(estimation.similarTickets) ? estimation.similarTickets : []
  };
}

function buildDraftsForOperation(op, inputArray) {
  return inputArray.map(req => {
    const draft = op === "2" ? buildRefinementDraft(req) : buildGenerationDraft(req);
    draft.review = toReviewObject(draft.review);
    draft.estimation = toEstimationObject(draft.estimation, req.storyPoints ?? draft.storyPoints);
    return draft;
  });
}

function parseOperationInput(op, payload = {}) {
  if (op === "2") {
    return fetchJiraBacklog();
  }

  const inputMode = payload.inputMode || "file";
  if (inputMode === "paste") {
    const rawText = String(payload.rawText || "").trim();
    if (!rawText) {
      throw new Error("Pasted text is empty.");
    }
    return parseTextRecords(rawText);
  }

  const inputFile = String(payload.inputFile || GENERATION_INPUT_DEFAULT_FILE).trim();
  return parseInputFlexible(inputFile);
}

function parseStoryPoints(value) {
  if (value == null || value === "") return null;
  const parsed = Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function toPlanningPoker(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 3;
  let best = PLANNING_POKER_SCALE[0];
  let minDiff = Math.abs(best - num);
  for (const point of PLANNING_POKER_SCALE) {
    const diff = Math.abs(point - num);
    if (diff < minDiff) {
      minDiff = diff;
      best = point;
    }
  }
  return best;
}

function tokenizeText(rawText) {
  const text = String(rawText || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  return text
    .split(/\s+/)
    .filter(Boolean)
    .filter(token => token.length > 2)
    .filter(token => !STOP_WORDS.has(token));
}

function getTicketText(ticket) {
  return [
    ticket.title || ticket.summary || "",
    ticket.summary || "",
    ticket.description || ""
  ].join(" ");
}

function getJaccardScore(wordsA, wordsB) {
  if (!wordsA.size || !wordsB.size) return 0;
  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection += 1;
  }
  const union = wordsA.size + wordsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function scoreSimilarity(ticket, historical) {
  const wordsA = new Set(tokenizeText(getTicketText(ticket)));
  const wordsB = new Set(tokenizeText(historical.text));
  let score = getJaccardScore(wordsA, wordsB);
  if ((ticket.itemType || "").toLowerCase() === (historical.itemType || "").toLowerCase()) {
    score += 0.15;
  }
  if ((ticket.priority || "").toLowerCase() === (historical.priority || "").toLowerCase()) {
    score += 0.1;
  }
  return Math.min(score, 1);
}

function parseHistoricalCsvRecords(csvPath) {
  if (!fs.existsSync(csvPath)) return [];
  const raw = fs.readFileSync(csvPath, "utf8");
  const records = parseCSV(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true
  });
  return records.map(record => {
    const storyPoints = parseStoryPoints(
      record["Custom field (Story point estimate)"] ??
      record["Story point estimate"] ??
      record.storyPoints
    );
    return {
      key: record["Issue key"] || "",
      summary: record.Summary || "",
      description: record.Description || "",
      itemType: record["Issue Type"] || "",
      priority: record.Priority || "",
      storyPoints,
      text: `${record.Summary || ""} ${record.Description || ""}`.trim()
    };
  }).filter(row => Number.isFinite(row.storyPoints));
}

function parseHistoricalJsonRecords(jsonPath) {
  if (!fs.existsSync(jsonPath)) return [];
  let data = [];
  try {
    data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  return data.map(record => {
    const storyPoints = parseStoryPoints(
      record.storyPoints ?? record.estimation?.approvedPoints ?? record.estimation?.aiSuggestedPoints
    );
    return {
      key: record.key || record.jiraIssueKey || "",
      summary: record.summary || record.title || "",
      description: record.description || "",
      itemType: record.itemType || "",
      priority: record.priority || "",
      storyPoints,
      text: `${record.summary || record.title || ""} ${record.description || ""}`.trim()
    };
  }).filter(row => Number.isFinite(row.storyPoints));
}

function getHistoricalEstimationData() {
  const fromCsv = parseHistoricalCsvRecords("jira_issues_clean.csv");
  const fromJson = parseHistoricalJsonRecords(path.join(DATA_DIR, "refined_backlog.json"));
  return [...fromCsv, ...fromJson];
}

function buildRiskSignals(ticket) {
  const text = getTicketText(ticket).toLowerCase();
  const risks = [];
  if (/(security|auth|token|credential|encryption|privacy)/.test(text)) {
    risks.push("Security/privacy risk");
  }
  if (/(brake|collision|safety|emergency|critical)/.test(text)) {
    risks.push("Safety-critical behavior");
  }
  if (/(timeout|latency|performance|slow|stuck|memory)/.test(text)) {
    risks.push("Performance/reliability risk");
  }
  if (/(integration|api|dependency|third-party|external)/.test(text)) {
    risks.push("Integration dependency risk");
  }
  if (!risks.length) risks.push("No high-risk terms detected");
  return risks;
}

function suggestPriority(ticket) {
  const text = getTicketText(ticket).toLowerCase();
  if ((ticket.itemType || "").toLowerCase() === "bug" && /(critical|crash|outage|stuck|data loss|safety)/.test(text)) {
    return "Highest";
  }
  if (/(emergency|collision|safety|security|production|blocking)/.test(text)) return "High";
  if (/(minor|cosmetic|typo|ui text)/.test(text)) return "Low";
  return ticket.priority || "Medium";
}

function extractDependenciesFromText(rawText) {
  const text = String(rawText || "").toLowerCase();
  const deps = [];
  for (const rule of DEPENDENCY_RULES) {
    if (rule.regex.test(text)) {
      deps.push(rule.label);
    }
    rule.regex.lastIndex = 0;
  }
  return deps;
}

function buildDependencySignals(ticket, topSimilar = []) {
  const direct = extractDependenciesFromText(getTicketText(ticket));
  const history = new Set();
  for (const similar of topSimilar) {
    const inferred = extractDependenciesFromText(similar.text);
    for (const dep of inferred) {
      history.add(dep);
    }
  }
  const combined = Array.from(new Set([...direct, ...history]));
  if (!combined.length) {
    combined.push("No explicit technical dependency detected");
  }
  return {
    dependencies: combined,
    historyDependencies: Array.from(history)
  };
}

function generateAiInsight(ticket, historicalData) {
  const scored = historicalData
    .map(h => ({ ...h, similarity: scoreSimilarity(ticket, h) }))
    .filter(h => h.similarity > 0)
    .sort((a, b) => b.similarity - a.similarity);

  const topSimilar = scored.slice(0, 3);
  const referenceKeys = topSimilar.map(row => row.key).filter(Boolean);
  let estimatedPoints;
  let rationale;
  if (topSimilar.length) {
    const weighted = topSimilar.reduce((acc, row) => {
      acc.sum += row.storyPoints * row.similarity;
      acc.weight += row.similarity;
      return acc;
    }, { sum: 0, weight: 0 });
    estimatedPoints = weighted.weight > 0 ? weighted.sum / weighted.weight : null;
    rationale = `Estimated from ${topSimilar.length} similar historical tickets (Refs: ${referenceKeys.join(", ") || "N/A"})`;
  } else {
    const text = getTicketText(ticket).toLowerCase();
    let base = 3;
    if (text.length > 350) base += 2;
    if (/(integration|migration|refactor|cross-team|architecture)/.test(text)) base += 3;
    if ((ticket.itemType || "").toLowerCase() === "bug") base += 1;
    estimatedPoints = base;
    rationale = "Estimated from complexity heuristics (no close historical match)";
  }

  const planningPokerEstimate = toPlanningPoker(estimatedPoints);
  const confidenceScore = Math.round(
    Math.min(95, 45 + (topSimilar.length * 12) + ((topSimilar[0]?.similarity || 0) * 30))
  );
  const dependencySignals = buildDependencySignals(ticket, topSimilar);

  return {
    risks: buildRiskSignals(ticket),
    suggestions: [
      "Validate acceptance criteria before approval",
      "Confirm dependencies and test coverage",
      "Re-check estimate if scope changes"
    ],
    prioritySuggestion: suggestPriority(ticket),
    planningPokerEstimate,
    confidenceScore,
    rationale,
    dependencies: dependencySignals.dependencies,
    historyDependencies: dependencySignals.historyDependencies,
    basedOnHistoryCount: topSimilar.length,
    historicalReferenceKeys: referenceKeys,
    similarTickets: topSimilar.map(row => ({
      key: row.key,
      summary: row.summary,
      storyPoints: row.storyPoints,
      similarity: Number(row.similarity.toFixed(2))
    }))
  };
}

function applyAiInsightsToTickets(tickets) {
  const historicalData = getHistoricalEstimationData();
  return tickets.map(ticket => {
    const insight = generateAiInsight(ticket, historicalData);
    const existingEstimation = toEstimationObject(ticket.estimation, ticket.storyPoints);
    const approvedPoints = Number.isFinite(parseStoryPoints(existingEstimation.approvedPoints))
      ? parseStoryPoints(existingEstimation.approvedPoints)
      : insight.planningPokerEstimate;

    return {
      ...ticket,
      dependencies: insight.dependencies,
      aiInsights: {
        ...(ticket.aiInsights || {}),
        risks: insight.risks.join("; "),
        dependencies: insight.dependencies.join("; "),
        historyDependencies: insight.historyDependencies.join("; "),
        suggestions: insight.suggestions.join("; "),
        prioritySuggestion: insight.prioritySuggestion,
        planningPokerEstimate: insight.planningPokerEstimate,
        confidenceScore: insight.confidenceScore
      },
      estimation: {
        ...existingEstimation,
        aiSuggestedPoints: insight.planningPokerEstimate,
        approvedPoints,
        rationale: insight.rationale,
        basedOnHistoryCount: insight.basedOnHistoryCount,
        historicalReferenceKeys: insight.historicalReferenceKeys,
        similarTickets: insight.similarTickets
      }
    };
  });
}

function resolveStoryPoints(ticket) {
  const approved = ticket.estimation?.status === "Approved"
    ? parseStoryPoints(ticket.estimation?.approvedPoints)
    : null;
  const direct = parseStoryPoints(ticket.storyPoints);
  return approved ?? direct;
}

async function readMultilineInput(rl, firstPrompt = "> ") {
  const lines = [];
  while (true) {
    const prompt = lines.length === 0 ? firstPrompt : "";
    const line = await new Promise(res => rl.question(prompt, res));
    const trimmed = line.trim();
    if (trimmed === "EOF") break;
    if (trimmed === "" && lines.length > 0) break;
    lines.push(line);
  }
  return lines.join("\n").trim();
}

async function humanReview(ticket, schema) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log(chalk.blue("\n===== REVIEW TICKET ====="));
  const cScore = (ticket.confidenceScore || 0);
  let csCol = chalk.green;
  if (cScore < 60) csCol = chalk.red;
  else if (cScore < 80) csCol = chalk.yellow;
  console.log(`Confidence Score: ${csCol(`${cScore}`)}`);
  console.log(chalk.yellow(JSON.stringify(ticket, null, 2)));
  const reviewer = await new Promise(res => rl.question("Reviewer Name: ", res));
  let isValid = validateSchema(schema, ticket);
  if (!isValid) { console.log(chalk.red("⚠️ Schema invalid — must fix before approval")); }
  const action = await new Promise(res => rl.question("Approve? (y = approve / n = reject / e = edit): ", res));
  const comment = await new Promise(res => rl.question("Add comment (optional): ", res));
  if (action === "y") {
    if (!isValid) { console.log(chalk.red("❌ Cannot approve invalid schema")); rl.close(); return ticket; }
    ticket.review = { status: "Approved", reviewer, comments: [comment] };
  } else if (action === "n") {
    ticket.review = { status: "Rejected", reviewer, comments: [comment] };
  } else {
    console.log(chalk.cyan("\nPaste updated JSON (finish with EOF on new line, or blank line):"));
    const edited = await readMultilineInput(rl, "> ");
    try {
      const parsed = JSON.parse(edited);
      // Keep original fields unless explicitly overwritten in edit payload.
      // This prevents accidental missing required fields during copy/paste edits.
      let updated = { ...ticket, ...parsed };
      const validAfterEdit = validateSchema(schema, updated);
      if (!validAfterEdit) {
        const requiredList = Array.isArray(schema?.required) ? schema.required : [];
        const missing = requiredList.filter(k => updated[k] == null || updated[k] === "");
        if (missing.length) {
          console.log(chalk.red(`Missing required fields after edit: ${missing.join(", ")}`));
        }
      }
      updated.review = { status: validAfterEdit ? "Edited & Approved" : "Needs Update", reviewer, comments: [comment] };
      ticket = updated;
    } catch { console.log(chalk.red("Invalid JSON. Keeping original.")); }
  }
  rl.close();
  return ticket;
}

function exportToMarkdown(tickets) {
  let md = "# Refined Backlog\n\n";
  tickets.forEach(t => {
    md += `## ${t.title || t.summary}\n`;
    md += `- Priority: ${t.priority}\n`;
    md += `- Confidence Score: ${t.confidenceScore}\n`;
    md += `- Status: ${t.review.status}\n`;
    md += `- Reviewer: ${t.review.reviewer || "N/A"}\n`;
    md += `- Comments: ${(t.review.comments || []).join(", ")}\n\n`;
  });
  fs.writeFileSync(path.join(DATA_DIR, "backlog.md"), md);
}
function exportToHTML(tickets) {
  let html = `<html><body><h1>Backlog</h1>`;
  tickets.forEach(t => {
    html += `
    <div style="border:1px solid #ccc; margin:10px; padding:10px;">
      <h2>${t.title || t.summary}</h2>
      <p>Priority: ${t.priority}</p>
      <p>Confidence Score: ${t.confidenceScore}</p>
      <p>Status: ${t.review.status}</p>
      <p>Reviewer: ${t.review.reviewer || "N/A"}</p>
      <p>Comments: ${(t.review.comments || []).join(", ")}</p>
    </div>`;
  });
  html += "</body></html>";
  fs.writeFileSync(path.join(DATA_DIR, "backlog.html"), html);
}

async function processTickets(op, incomingTickets, schema) {
  const results = [];
  const rejected = [];

  for (const incomingTicket of incomingTickets) {
    const ticket = {
      ...incomingTicket,
      review: toReviewObject(incomingTicket.review),
      estimation: toEstimationObject(incomingTicket.estimation, incomingTicket.storyPoints)
    };
    ticket.storyPoints = resolveStoryPoints(ticket);

    if (isApprovalStatus(ticket.review.status)) {
      const isValid = validateSchema(schema, ticket);
      if (!isValid) {
        ticket.review.status = "Needs Update";
      }
    }

    if ((op === "1") && isApprovalStatus(ticket.review.status)) {
      try {
        const jiraResp = await pushBacklogTicketToJira(ticket);
        ticket.jiraIssueKey = jiraResp.key;
      } catch (e) {
        ticket.review.status = `${ticket.review.status} (JIRA create failed)`;
        ticket.review.comments = [
          ...(ticket.review.comments || []),
          `JIRA create failed: ${e.message}`
        ];
      }
    }

    if ((op === "2") && isApprovalStatus(ticket.review.status)) {
      try {
        await updateJiraTicketWithRefinement(ticket);
      } catch (e) {
        ticket.review.status = `${ticket.review.status} (JIRA update failed)`;
        ticket.review.comments = [
          ...(ticket.review.comments || []),
          `JIRA update failed: ${e.message}`
        ];
      }
    }

    if (ticket.review.status === "Rejected") {
      rejected.push(ticket);
    }
    results.push(ticket);
  }

  fs.writeFileSync(path.join(DATA_DIR, "refined_backlog.json"), JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(DATA_DIR, "rejected_tickets.json"), JSON.stringify(rejected, null, 2));
  exportToMarkdown(results);
  exportToHTML(results);
  return { results, rejected };
}

async function runGuiServer() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use("/api/", apiLimiter);
  app.use("/api/", sanitizeInput);

  const publicDir = path.join(__dirname, "public");
  app.use(express.static(publicDir));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/prepare", async (req, res) => {
    try {
      const operation = req.body?.operation === "2" ? "2" : "1";
      const inputArray = await parseOperationInput(operation, req.body || {});
      if (!Array.isArray(inputArray) || inputArray.length === 0) {
        return res.status(400).json({ error: "No input tickets found." });
      }
      const drafts = buildDraftsForOperation(operation, inputArray);
      audit({ type: "BACKLOG_PREPARE", operation, ticketCount: drafts.length });
      return res.json({ operation, tickets: drafts });
    } catch (err) {
      return res.status(400).json({ error: err.message || "Failed to prepare tickets." });
    }
  });

  app.post("/api/insights", (req, res) => {
    try {
      const tickets = Array.isArray(req.body?.tickets) ? req.body.tickets : [];
      if (!tickets.length) {
        return res.status(400).json({ error: "No tickets provided for insights." });
      }
      const enrichedTickets = applyAiInsightsToTickets(tickets);
      audit({ type: "BACKLOG_INSIGHTS", ticketCount: enrichedTickets.length });
      return res.json({ ok: true, tickets: enrichedTickets, dataSources: ["HistoricalSimilarity", "HeuristicRules"] });
    } catch (err) {
      return res.status(500).json({ error: err.message || "Failed to generate AI insights." });
    }
  });

  app.post("/api/process", async (req, res) => {
    try {
      const operation = req.body?.operation === "2" ? "2" : "1";
      const tickets = Array.isArray(req.body?.tickets) ? req.body.tickets : [];
      if (!tickets.length) {
        return res.status(400).json({ error: "No tickets provided for processing." });
      }
      const schema = loadSchema();
      const { results, rejected } = await processTickets(operation, tickets, schema);
      audit({ type: "BACKLOG_PROCESS", operation, processed: results.length, rejected: rejected.length });
      return res.json({
        ok: true,
        processed: results.length,
        rejected: rejected.length,
        results,
        dataSources: ["AjvSchema", "HeuristicRules", "HistoricalSimilarity"]
      });
    } catch (err) {
      return res.status(500).json({ error: err.message || "Failed to process tickets." });
    }
  });

  app.get("/api/audit", (_req, res) => {
    try {
      const log = fs.existsSync(BACKLOG_AUDIT_FILE) ? JSON.parse(fs.readFileSync(BACKLOG_AUDIT_FILE, "utf8")) : [];
      res.json(log);
    } catch { res.json([]); }
  });

  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });

  app.listen(GUI_PORT, () => {
    console.log(chalk.green(`GUI ready at http://localhost:${GUI_PORT}`));
  });
}

async function run() {
  const op = await askOperationMode();
  let inputArray = [];
  let opLabel;

  // Load schema
  const schema = loadSchema();

  if (op === "2") { // Refinement
    opLabel = "Refinement";
    console.log(chalk.blue("\n🔗 Connecting to JIRA and fetching backlog tickets..."));
    inputArray = await fetchJiraBacklog();
    if (inputArray.length === 0) {
      console.log(chalk.red("No backlog tickets found in JIRA."));
      process.exit(1);
    }
    console.log(chalk.green(`✅ Loaded ${inputArray.length} tickets from JIRA.`));
  } else { // Generation
    opLabel = "Generation";
    const inputMode = await askGenerationInputMode();
    if (inputMode === "paste") {
      const rawText = await askUnstructuredTextInput();
      inputArray = parseTextRecords(rawText);
    } else {
      const inputFile = await askInputFile(GENERATION_INPUT_DEFAULT_FILE);
      inputArray = parseInputFlexible(inputFile);
    }
    if (!Array.isArray(inputArray) || !inputArray.length) {
      console.log(chalk.red("No input tickets found. Please check your input."));
      process.exit(1);
    }
  }

  const results = [];
  const rejected = [];

  for (const req of inputArray) {
    const draft = op === "2" ? buildRefinementDraft(req) : buildGenerationDraft(req);
    draft.review = { status: "Pending" };
    const ticket = await humanReview(draft, schema);

    if ((op === "1") && (ticket.review.status === "Approved" || ticket.review.status === "Edited & Approved")) {
      // Push to JIRA for Generation
      console.log(chalk.blue("📤 Pushing ticket to JIRA..."));
      try {
        const jiraResp = await pushBacklogTicketToJira(ticket);
        ticket.jiraIssueKey = jiraResp.key;
        console.log(chalk.green(`✅ Created JIRA issue: ${jiraResp.key}`));
      } catch (e) {
        console.log(chalk.red("❌ Failed to push to JIRA"), e.message);
      }
    }
    if ((op === "2") && (ticket.review.status === "Approved" || ticket.review.status === "Edited & Approved")) {
      // Update existing Jira ticket for Refinement
      console.log(chalk.blue(`📤 Updating JIRA issue ${ticket.key} with refinement...`));
      try {
        const verified = await updateJiraTicketWithRefinement(ticket);
        console.log(chalk.green(`✅ Updated JIRA issue: ${ticket.key}`));
        console.log(chalk.gray(`   ↳ Verified summary: ${verified?.fields?.summary || "(none)"}`));
        console.log(chalk.gray(`   ↳ Verified priority: ${verified?.fields?.priority?.name || "(none)"}`));
      } catch (e) {
        ticket.review.status = `${ticket.review.status} (JIRA update failed)`;
        console.log(chalk.red("❌ Failed to update JIRA issue"), e.message);
      }
    }

    if (ticket.review.status === "Rejected") {
      rejected.push(ticket);
    }
    console.log(chalk.green("✅ Final Status:"), ticket.review.status);
    results.push(ticket);
  }

  fs.writeFileSync(path.join(DATA_DIR, "refined_backlog.json"), JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(DATA_DIR, "rejected_tickets.json"), JSON.stringify(rejected, null, 2));
  exportToMarkdown(results);
  exportToHTML(results);
  console.log(chalk.green(`\n🚀 ${opLabel} complete! All tickets processed.`));
}

const shouldRunCli = process.argv.includes("--cli");
if (shouldRunCli) {
  run();
} else {
  runGuiServer().catch(err => {
    console.error(chalk.red("Failed to start GUI server:"), err.message);
    process.exit(1);
  });
}