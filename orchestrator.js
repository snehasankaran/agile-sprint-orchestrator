import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { EventEmitter } from "events";
import chalk from "chalk";
import { apiLimiter, sanitizeInput, requireRole } from "./middleware.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.ORCH_PORT || 6060);
const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const STATE_FILE = path.join(DATA_DIR, "orchestrator_state.json");

const AGENTS = {
  backlog:    { port: 3000, name: "Backlog Agent" },
  planning:   { port: 3020, name: "Sprint Planning Agent" },
  iterative:  { port: 4040, name: "Iterative + Standup Agent" },
  review:     { port: 5050, name: "Review + Retro Agent" }
};

const PHASES = ["backlog", "planning", "development", "review", "retro", "velocity", "intelligence"];

// ── Event Bus ──

const bus = new EventEmitter();
const eventLog = [];
const sseClients = [];

function emit(type, data = {}) {
  const event = { type, data, time: new Date().toISOString() };
  eventLog.push(event);
  if (eventLog.length > 500) eventLog.shift();
  bus.emit(type, event);
  for (const res of sseClients) {
    try { res.write(`data: ${JSON.stringify(event)}\n\n`); } catch {}
  }
}

// ── Shared Context ──

function defaultState() {
  return {
    currentPhase: null,
    phaseStatus: Object.fromEntries(PHASES.map(p => [p, "pending"])),
    offlineMode: false,
    sprint: { id: null, goal: "", tickets: [], capacity: 30 },
    backlog: [],
    reviewResult: null,
    retroResult: null,
    velocityData: null,
    retroActions: [],
    phaseResults: {},
    dailyCheck: null,
    history: [],
    lastUpdated: null
  };
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) return { ...defaultState(), ...JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) };
  } catch {}
  return defaultState();
}

function saveState(state) {
  state.lastUpdated = new Date().toISOString();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

let state = loadState();

// ── Cross-Sprint Memory Layer ──

const MEMORY_FILE = path.join(DATA_DIR, "orchestrator_memory.json");

function loadMemory() {
  try {
    if (fs.existsSync(MEMORY_FILE)) return JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8"));
  } catch {}
  return { sprints: [], patterns: [], actionTracker: [] };
}

function saveMemory(mem) {
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(mem, null, 2));
}

function storeSprintMemory(st) {
  const mem = loadMemory();
  const review = st.reviewResult || {};
  const retro = st.retroResult || {};
  const velocity = st.velocityData?.summary || {};
  const m = review.metrics || {};

  const sprintEntry = {
    sprintId: st.sprint.sprintId || st.sprint.id || `Sprint-${mem.sprints.length + 1}`,
    goal: st.sprint.goal || "",
    completedAt: new Date().toISOString(),
    metrics: {
      totalTickets: m.totalTickets || 0,
      completedCorrectly: m.completedCorrectly || 0,
      spillover: m.spillover || 0,
      incorrect: m.incorrectImplementation || 0,
      completedPercent: m.completedCorrectPercent || 0,
      plannedPoints: st.velocityData?.currentSprint?.plannedPoints || 0,
      completedPoints: st.velocityData?.currentSprint?.completedPoints || 0,
      spilloverPoints: st.velocityData?.currentSprint?.spilloverPoints || 0
    },
    velocity: {
      avgVelocity: velocity.avgVelocity,
      trend: velocity.trend,
      avgCompletion: velocity.avgCompletion
    },
    reviewDecision: review.decision || "N/A",
    risks: (review.spillover || []).map(t => `${t.ticketId}: ${t.reason || "spillover"}`),
    retroWentWell: retro.wentWell || [],
    retroDidntGoWell: retro.didntGoWell || [],
    retroActionItems: (retro.actionItems || []).map(a => ({
      description: a.description,
      owner: a.owner || "Team",
      priority: a.priority || "medium",
      addressed: false
    })),
    retroPatterns: retro.patterns || []
  };

  mem.sprints.push(sprintEntry);
  if (mem.sprints.length > 20) mem.sprints = mem.sprints.slice(-20);

  for (const ai of sprintEntry.retroActionItems) {
    mem.actionTracker.push({ ...ai, sprintId: sprintEntry.sprintId, createdAt: sprintEntry.completedAt });
  }
  if (mem.actionTracker.length > 100) mem.actionTracker = mem.actionTracker.slice(-100);

  const newPatterns = (retro.patterns || []).map(p => typeof p === "string" ? { pattern: p, count: 1 } : { pattern: p.pattern || String(p), count: 1 });
  for (const np of newPatterns) {
    const existing = mem.patterns.find(mp => mp.pattern === np.pattern);
    if (existing) { existing.count++; existing.lastSeen = sprintEntry.sprintId; }
    else mem.patterns.push({ ...np, firstSeen: sprintEntry.sprintId, lastSeen: sprintEntry.sprintId });
  }

  saveMemory(mem);
  emit("MEMORY_STORED", { sprintId: sprintEntry.sprintId, sprintCount: mem.sprints.length, patternCount: mem.patterns.length });
  return sprintEntry;
}

function queryMemory(topic) {
  const mem = loadMemory();
  const kw = (topic || "").toLowerCase();
  const recent = mem.sprints.slice(-5);
  if (!kw) return { sprints: recent, patterns: mem.patterns.slice(-10), actionTracker: mem.actionTracker.slice(-20) };

  const matchedSprints = mem.sprints.filter(s =>
    (s.goal || "").toLowerCase().includes(kw) ||
    s.risks.some(r => r.toLowerCase().includes(kw)) ||
    s.retroWentWell.some(w => String(w).toLowerCase().includes(kw)) ||
    s.retroDidntGoWell.some(w => String(w).toLowerCase().includes(kw))
  );
  const matchedPatterns = mem.patterns.filter(p => (p.pattern || "").toLowerCase().includes(kw));
  return { sprints: matchedSprints.slice(-5), patterns: matchedPatterns, actionTracker: mem.actionTracker.filter(a => (a.description || "").toLowerCase().includes(kw)).slice(-10) };
}

// ── Agent HTTP Caller (with retry + circuit breaker) ──

const circuitState = {};
const CIRCUIT_THRESHOLD = 5;
const CIRCUIT_RESET_MS = 30000;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function isCircuitOpen(agentKey) {
  const cs = circuitState[agentKey];
  if (!cs || cs.failures < CIRCUIT_THRESHOLD) return false;
  if (Date.now() - cs.lastFailure > CIRCUIT_RESET_MS) {
    cs.failures = 0;
    return false;
  }
  return true;
}

function recordFailure(agentKey) {
  if (!circuitState[agentKey]) circuitState[agentKey] = { failures: 0, lastFailure: 0 };
  circuitState[agentKey].failures++;
  circuitState[agentKey].lastFailure = Date.now();
}

function recordSuccess(agentKey) {
  circuitState[agentKey] = { failures: 0, lastFailure: 0 };
}

async function callAgent(agentKey, apiPath, payload = null, method = "POST", maxRetries = 3) {
  const agent = AGENTS[agentKey];
  if (!agent) throw new Error(`Unknown agent: ${agentKey}`);

  if (isCircuitOpen(agentKey)) {
    emit("CIRCUIT_OPEN", { agent: agent.name, message: `Circuit breaker open — ${agent.name} skipped for ${CIRCUIT_RESET_MS / 1000}s after ${CIRCUIT_THRESHOLD} failures.` });
    throw new Error(`${agent.name} circuit breaker open — too many recent failures. Will retry after cooldown.`);
  }

  const url = `http://localhost:${agent.port}${apiPath}`;
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (payload && method !== "GET") opts.body = JSON.stringify(payload);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      emit("AGENT_CALL", { agent: agent.name, path: apiPath, method, attempt });
      const res = await fetch(url, opts);
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
      if (!res.ok) throw new Error(data.error || `${agent.name} returned HTTP ${res.status}`);
      recordSuccess(agentKey);
      return data;
    } catch (err) {
      if (attempt < maxRetries) {
        const delayMs = 1000 * Math.pow(2, attempt - 1);
        emit("AGENT_RETRY", { agent: agent.name, path: apiPath, attempt, maxRetries, error: err.message, retryInMs: delayMs });
        await sleep(delayMs);
      } else {
        recordFailure(agentKey);
        throw err;
      }
    }
  }
}

async function checkAgentHealth(agentKey) {
  try {
    const agent = AGENTS[agentKey];
    const res = await fetch(`http://localhost:${agent.port}/api/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch { return false; }
}

// ── Phase Runners ──

async function runBacklog() {
  state.currentPhase = "backlog";
  state.phaseStatus.backlog = "running";
  saveState(state);
  emit("PHASE_STARTED", { phase: "backlog" });

  try {
    const sprintCtx = buildSprintContext();
    state.sprintContext = sprintCtx;
    if (sprintCtx) {
      emit("INSIGHT", { message: `Sprint context loaded: ${sprintCtx.sprintsAnalyzed} previous sprint(s), avg velocity ${sprintCtx.previousVelocity?.avg || "N/A"}, ${sprintCtx.unresolvedRetroActions?.length || 0} unresolved action(s), ${sprintCtx.recurringRiskPatterns?.length || 0} recurring pattern(s)` });
      if (sprintCtx.recurringRiskPatterns?.length > 0) {
        emit("INSIGHT", { message: `Recurring risk patterns from history: ${sprintCtx.recurringRiskPatterns.join(", ")}` });
      }
    }

    const prepareResult = await callAgent("backlog", "/api/prepare", { operation: "2" });
    let tickets = prepareResult.tickets || [];

    if (state.retroActions.length > 0) {
      emit("INSIGHT", { message: `Injecting ${state.retroActions.length} retro action(s) into backlog refinement.` });
    }

    const insightResult = await callAgent("backlog", "/api/insights", { tickets });
    tickets = insightResult.tickets || tickets;

    const processResult = await callAgent("backlog", "/api/process", { operation: "2", tickets });

    state.backlog = processResult.results || [];
    const processed = processResult.results || [];
    const rejected = processResult.rejected || [];
    state.phaseResults.backlog = {
      ticketCount: processed.length,
      rejectedCount: rejected.length,
      tickets: processed.slice(0, 20).map(t => ({
        key: t.key || t.ticketId || "",
        summary: t.summary || t.title || "",
        type: t.itemType || t.type || "Story",
        priority: t.priority || "Medium",
        points: t.estimation?.approvedPoints || t.storyPoints || 0,
        status: t.review?.status || "Processed"
      })),
      highlights: [
        `${processed.length} ticket(s) refined and validated.`,
        rejected.length > 0 ? `${rejected.length} ticket(s) rejected.` : null,
        state.retroActions.length > 0 ? `${state.retroActions.length} retro action(s) considered from previous sprint.` : null
      ].filter(Boolean)
    };
    state.phaseStatus.backlog = "done";
    saveState(state);
    emit("PHASE_COMPLETED", { phase: "backlog", ticketCount: state.backlog.length });
    return { success: true, ticketCount: state.backlog.length };
  } catch (err) {
    state.phaseStatus.backlog = "failed";
    saveState(state);
    emit("PHASE_FAILED", { phase: "backlog", error: err.message });
    return { success: false, error: err.message };
  }
}

async function runPlanning() {
  state.currentPhase = "planning";
  state.phaseStatus.planning = "running";
  saveState(state);
  emit("PHASE_STARTED", { phase: "planning" });

  try {
    const loadResult = await callAgent("planning", "/api/backlog/load", { source: "file" });
    const tickets = loadResult.tickets || loadResult.backlog || [];

    const sprintCtx = state.sprintContext || buildSprintContext();
    let effectiveCapacity = state.sprint.capacity || 30;
    if (sprintCtx?.suggestedCapacity && sprintCtx.suggestedCapacity < effectiveCapacity) {
      emit("INSIGHT", { message: `Feedback loop: reducing capacity from ${effectiveCapacity} to ${sprintCtx.suggestedCapacity} SP based on historical velocity (avg ${sprintCtx.previousVelocity?.avg || "?"}, trend: ${sprintCtx.previousVelocity?.trend || "?"})` });
      effectiveCapacity = sprintCtx.suggestedCapacity;
    }
    if (sprintCtx?.unresolvedRetroActions?.length > 0) {
      emit("INSIGHT", { message: `Feedback loop: ${sprintCtx.unresolvedRetroActions.length} unresolved retro action(s) should be considered in planning` });
    }

    const recResult = await callAgent("planning", "/api/sprint/recommend", {
      tickets,
      capacityPoints: effectiveCapacity
    });

    const selected = recResult.selected || tickets.filter(t => t.selected);
    const aiResult = await callAgent("planning", "/api/sprint/ai-assign", { tickets: selected });
    const enriched = aiResult.tickets || selected;

    await callAgent("planning", "/api/sprint/save", {
      sprintBacklog: enriched,
      capacityPoints: state.sprint.capacity || 30,
      sprintGoal: recResult.sprintGoal || state.sprint.goal || ""
    });

    state.sprint.tickets = enriched;
    state.sprint.goal = recResult.sprintGoal || state.sprint.goal;
    const totalPoints = enriched.reduce((s, t) => s + (t.storyPoints || t.estimation?.approvedPoints || 0), 0);
    state.phaseResults.planning = {
      sprintGoal: state.sprint.goal,
      ticketCount: enriched.length,
      capacityUsed: totalPoints,
      capacityTotal: state.sprint.capacity || 30,
      deferredCount: recResult.deferred?.length || 0,
      tickets: enriched.slice(0, 20).map(t => ({
        key: t.key || t.ticketId || "",
        summary: t.summary || t.title || "",
        type: t.itemType || t.type || "Story",
        points: t.storyPoints || t.estimation?.approvedPoints || 0,
        assignee: t.assignee || "Unassigned"
      })),
      highlights: [
        `Sprint goal: ${state.sprint.goal}`,
        `${enriched.length} ticket(s) selected, ${totalPoints}/${state.sprint.capacity || 30} SP capacity.`,
        recResult.deferred?.length ? `${recResult.deferred.length} ticket(s) deferred to next sprint.` : null
      ].filter(Boolean)
    };
    state.phaseStatus.planning = "done";
    saveState(state);
    emit("PHASE_COMPLETED", { phase: "planning", ticketCount: enriched.length, goal: state.sprint.goal });
    return { success: true, ticketCount: enriched.length, goal: state.sprint.goal };
  } catch (err) {
    state.phaseStatus.planning = "failed";
    saveState(state);
    emit("PHASE_FAILED", { phase: "planning", error: err.message });
    return { success: false, error: err.message };
  }
}

async function runDevelopment() {
  state.currentPhase = "development";
  state.phaseStatus.development = "running";
  saveState(state);
  emit("PHASE_STARTED", { phase: "development" });

  try {
    const ticketsResult = await callAgent("iterative", "/api/sprint/tickets", null, "GET");
    const sprintTickets = ticketsResult.tickets || [];

    const evalResult = await callAgent("iterative", "/api/github/work-products/evaluate-all", {});
    const evaluations = evalResult.results || evalResult;

    let healthResult = null;
    try {
      healthResult = await callAgent("iterative", "/api/sprint-health", {
        tickets: sprintTickets
      });
    } catch {}

    const evalEntries = Array.isArray(evaluations)
      ? evaluations.map(e => ({ key: e.ticketId || e.caseKey || "", decision: e.decision || "N/A", confidence: e.confidence, acceptance: e.metrics?.acceptanceCoveragePercent, testFail: e.metrics?.testFailureRatePercent, coverage: e.metrics?.codeCoveragePercent, summary: e.summary || "" }))
      : Object.entries(evaluations).map(([k, e]) => ({ key: k, decision: e.decision || "N/A", confidence: e.confidence, acceptance: e.metrics?.acceptanceCoveragePercent, testFail: e.metrics?.testFailureRatePercent, coverage: e.metrics?.codeCoveragePercent, summary: e.summary || "" }));

    state.phaseResults.development = {
      evaluationCount: evalEntries.length,
      healthDecision: healthResult?.decision || "N/A",
      healthHighlights: healthResult?.highlights || [],
      evaluations: evalEntries.slice(0, 20),
      highlights: [
        `${evalEntries.length} work product(s) evaluated.`,
        `Sprint health: ${healthResult?.decision || "N/A"}`,
        ...(healthResult?.highlights || []).slice(0, 3)
      ]
    };
    state.phaseStatus.development = "done";
    saveState(state);
    emit("PHASE_COMPLETED", {
      phase: "development",
      evaluationCount: evalEntries.length,
      healthDecision: healthResult?.decision || "N/A"
    });
    return { success: true, evaluations, health: healthResult };
  } catch (err) {
    state.phaseStatus.development = "failed";
    saveState(state);
    emit("PHASE_FAILED", { phase: "development", error: err.message });
    return { success: false, error: err.message };
  }
}

async function runReview() {
  state.currentPhase = "review";
  state.phaseStatus.review = "running";
  saveState(state);
  emit("PHASE_STARTED", { phase: "review" });

  try {
    let tickets = [];
    if (state.sprint.boardId || state.sprint.sprintId) {
      const simResult = await callAgent("review", "/api/review/sprint/jira/simulate", {
        boardId: state.sprint.boardId,
        sprintId: state.sprint.sprintId
      });
      tickets = simResult.tickets || [];
    } else {
      const simResult = await callAgent("review", "/api/review/sprint/sim-raw-tickets", null, "GET");
      tickets = simResult.tickets || [];
      emit("INSIGHT", { message: "No JIRA board configured — using simulated sprint data for review." });
    }

    let feedbackResult = null;
    try {
      feedbackResult = await callAgent("review", "/api/review/feedback/teams/simulated", {
        sprintId: state.sprint.sprintId || "SPRINT-REVIEW",
        tickets
      });
    } catch {}

    const stakeholderFeedback = feedbackResult?.record ? [{
      stakeholder: feedbackResult.record.stakeholder || "Stakeholder",
      sentiment: feedbackResult.record.sentiment || "neutral",
      feedback: feedbackResult.record.feedback || "",
      followUpTickets: []
    }] : [];

    const reviewResult = await callAgent("review", "/api/review/sprint", {
      tickets,
      sprintId: state.sprint.sprintId || "SPRINT-REVIEW",
      stakeholderFeedback,
      offline: state.offlineMode || false
    });

    state.reviewResult = reviewResult;
    const m = reviewResult.metrics || {};
    state.phaseResults.review = {
      decision: reviewResult.decision || "N/A",
      summary: reviewResult.summary || "",
      totalTickets: m.totalTickets || 0,
      completedCorrectly: m.completedCorrectly || 0,
      spillover: m.spillover || 0,
      incorrectImplementation: m.incorrectImplementation || 0,
      completedPercent: m.completedCorrectPercent || 0,
      committedTickets: (reviewResult.completedCorrectly || []).map(t => ({ key: t.ticketId, summary: t.summary || "" })),
      spilloverTickets: (reviewResult.spillover || []).map(t => ({ key: t.ticketId, status: t.status, reason: t.reason || "" })),
      incorrectTickets: (reviewResult.incorrectImplementation || []).map(t => ({ key: t.ticketId, decision: t.decision, reason: t.nextSprintAction || "" })),
      reviewedTickets: (reviewResult.reviewedTickets || []).slice(0, 20).map(rt => ({
        key: rt.ticketId, decision: rt.decision, confidence: rt.confidence,
        acceptance: rt.metrics?.acceptanceCoveragePercent, testFail: rt.metrics?.testFailureRatePercent,
        coverage: rt.metrics?.codeCoveragePercent, summary: rt.summary || ""
      })),
      stakeholderFeedback: (reviewResult.stakeholderFeedbackConsidered || []).map(fb => ({
        stakeholder: fb.stakeholder, sentiment: fb.sentiment, feedback: String(fb.feedback || "").slice(0, 200)
      })),
      highlights: [
        reviewResult.decision || "",
        `${m.completedCorrectly || 0}/${m.totalTickets || 0} tickets completed correctly (${m.completedCorrectPercent || 0}%).`,
        m.spillover > 0 ? `${m.spillover} ticket(s) spilled over.` : null,
        m.incorrectImplementation > 0 ? `${m.incorrectImplementation} ticket(s) need rework.` : null
      ].filter(Boolean)
    };
    state.phaseStatus.review = "done";
    saveState(state);
    emit("PHASE_COMPLETED", {
      phase: "review",
      decision: reviewResult.decision,
      completed: m.completedCorrectly || 0,
      total: m.totalTickets || 0
    });
    return { success: true, reviewResult };
  } catch (err) {
    state.phaseStatus.review = "failed";
    saveState(state);
    emit("PHASE_FAILED", { phase: "review", error: err.message });
    return { success: false, error: err.message };
  }
}

async function runRetro() {
  state.currentPhase = "retro";
  state.phaseStatus.retro = "running";
  saveState(state);
  emit("PHASE_STARTED", { phase: "retro" });

  try {
    if (!state.reviewResult) throw new Error("Run Sprint Review first — retro depends on review results.");

    const autoResult = await callAgent("review", "/api/retro/auto-populate", {
      reviewResult: state.reviewResult
    });

    const retroResult = await callAgent("review", "/api/retro/generate", {
      reviewResult: state.reviewResult,
      wentWell: autoResult.wentWell || [],
      didntGoWell: autoResult.didntGoWell || [],
      improvements: [],
      transcript: "",
      offline: state.offlineMode || false
    });

    await callAgent("review", "/api/retro/actions/save", {
      sprintId: state.sprint.sprintId || "SPRINT-RETRO",
      actionItems: retroResult.actionItems || [],
      patterns: retroResult.patterns || [],
      teamHealth: retroResult.teamHealth || {}
    });

    state.retroResult = retroResult;
    state.retroActions = retroResult.actionItems || [];
    state.phaseResults.retro = {
      wentWell: retroResult.wentWell || [],
      didntGoWell: retroResult.didntGoWell || [],
      improvements: retroResult.improvements || [],
      actionItems: (retroResult.actionItems || []).map(a => ({
        description: a.description, owner: a.owner || "Team",
        priority: a.priority || "medium", targetSprint: a.targetSprint || "Next Sprint"
      })),
      patterns: retroResult.patterns || [],
      teamHealth: retroResult.teamHealth || {},
      highlights: [
        `Team morale: ${retroResult.teamHealth?.morale || "N/A"}`,
        `Velocity trend: ${retroResult.teamHealth?.velocityTrend || "N/A"}`,
        `${(retroResult.actionItems || []).length} action item(s) generated.`,
        (retroResult.patterns || []).length > 0 ? `${retroResult.patterns.length} recurring pattern(s) identified.` : null
      ].filter(Boolean)
    };
    state.phaseStatus.retro = "done";
    saveState(state);
    emit("PHASE_COMPLETED", {
      phase: "retro",
      actionItems: (retroResult.actionItems || []).length,
      teamHealth: retroResult.teamHealth?.morale || "N/A"
    });
    return { success: true, retroResult };
  } catch (err) {
    state.phaseStatus.retro = "failed";
    saveState(state);
    emit("PHASE_FAILED", { phase: "retro", error: err.message });
    return { success: false, error: err.message };
  }
}

async function runVelocity() {
  state.currentPhase = "velocity";
  state.phaseStatus.velocity = "running";
  saveState(state);
  emit("PHASE_STARTED", { phase: "velocity" });

  try {
    if (!state.reviewResult) throw new Error("Run Sprint Review first — velocity is derived from review results.");

    const velocityData = await callAgent("review", "/api/velocity/data", {
      reviewResult: state.reviewResult
    });

    state.velocityData = velocityData;
    state.phaseResults.velocity = {
      avgVelocity: velocityData.summary?.avgVelocity,
      last3Velocity: velocityData.summary?.last3Velocity,
      avgCompletion: velocityData.summary?.avgCompletion,
      trend: velocityData.summary?.trend,
      currentSprint: velocityData.currentSprint ? {
        planned: velocityData.currentSprint.plannedPoints,
        completed: velocityData.currentSprint.completedPoints,
        spillover: velocityData.currentSprint.spilloverPoints,
        ticketBreakdown: velocityData.currentSprint.ticketBreakdown || []
      } : null,
      projection: velocityData.projection || null,
      highlights: [
        `Average velocity: ${velocityData.summary?.avgVelocity || "—"} SP`,
        `Last 3 sprints: ${velocityData.summary?.last3Velocity || "—"} SP`,
        `Trend: ${velocityData.summary?.trend || "—"}`,
        velocityData.projection ? `Next sprint recommended: ${velocityData.projection.recommendedRange.min}–${velocityData.projection.recommendedRange.max} SP (${velocityData.projection.confidence} confidence)` : null
      ].filter(Boolean)
    };
    state.phaseStatus.velocity = "done";

    state.history.push({
      sprintId: state.sprint.sprintId || state.sprint.id,
      goal: state.sprint.goal,
      reviewDecision: state.reviewResult?.decision,
      velocity: velocityData.summary,
      retroActions: state.retroActions.length,
      completedAt: new Date().toISOString()
    });

    storeSprintMemory(state);
    saveState(state);
    emit("PHASE_COMPLETED", {
      phase: "velocity",
      avgVelocity: velocityData.summary?.avgVelocity,
      trend: velocityData.summary?.trend
    });
    return { success: true, velocityData };
  } catch (err) {
    state.phaseStatus.velocity = "failed";
    saveState(state);
    emit("PHASE_FAILED", { phase: "velocity", error: err.message });
    return { success: false, error: err.message };
  }
}

// ── Cross-Phase Intelligence ──

function analyzeCrossPhasePatterns(st) {
  const pr = st.phaseResults || {};
  const correlations = [];
  const rootCauses = [];
  const cascadeRisks = [];

  const planCap = pr.planning?.capacityUsed || 0;
  const planTotal = pr.planning?.capacityTotal || 30;
  const capUsagePct = planTotal > 0 ? Math.round((planCap / planTotal) * 100) : 0;
  const reviewMetrics = st.reviewResult?.metrics || {};
  const spilloverPct = reviewMetrics.totalTickets > 0
    ? Math.round(((reviewMetrics.spillover || 0) / reviewMetrics.totalTickets) * 100) : 0;
  const incorrectPct = reviewMetrics.totalTickets > 0
    ? Math.round(((reviewMetrics.incorrectImplementation || 0) / reviewMetrics.totalTickets) * 100) : 0;

  if (capUsagePct > 90 && spilloverPct > 20) {
    correlations.push({ from: "planning", to: "review", pattern: "overcommitment → spillover", severity: "high",
      evidence: `Planning used ${capUsagePct}% of capacity, ${spilloverPct}% of tickets spilled over.` });
    rootCauses.push("Overcommitment in sprint planning is the primary driver of spillover.");
  }

  const devTickets = pr.development?.tickets || [];
  const atRiskDev = devTickets.filter(t => t.decision === "At Risk" || t.decision === "High Risk" || t.decision === "Critical Failure");
  if (atRiskDev.length > 0 && incorrectPct > 15) {
    correlations.push({ from: "development", to: "review", pattern: "quality cascade", severity: "high",
      evidence: `${atRiskDev.length} ticket(s) flagged At Risk/High Risk in dev → ${incorrectPct}% incorrect in review.` });
    cascadeRisks.push("Development quality issues cascaded into review failures.");
  }

  const retroActions = pr.retro?.actionItems || [];
  const mem = loadMemory();
  const prevActions = (mem.sprints || []).flatMap(s => s.retroActions || []).map(a => (a.description || a).toLowerCase());
  const recurring = retroActions.filter(a => {
    const desc = (a.description || a || "").toLowerCase();
    return prevActions.some(p => p.includes(desc.slice(0, 20)) || desc.includes(p.slice(0, 20)));
  });
  if (recurring.length > 0) {
    correlations.push({ from: "retro", to: "retro", pattern: "recurring pattern", severity: "medium",
      evidence: `${recurring.length} retro action(s) repeat from previous sprints — not being addressed.` });
    rootCauses.push("Recurring retrospective patterns suggest systemic issues not being resolved.");
  }

  const backlogPoints = (pr.backlog?.tickets || []).reduce((s, t) => s + (t.points || 0), 0);
  const completedPoints = reviewMetrics.completedCorrectly || 0;
  const totalPlanned = reviewMetrics.totalTickets || 0;
  if (backlogPoints > 0 && totalPlanned > 0) {
    const estimationDrift = Math.abs(planCap - (completedPoints * (planTotal / totalPlanned)));
    if (estimationDrift > planTotal * 0.25) {
      correlations.push({ from: "backlog", to: "velocity", pattern: "estimation drift", severity: "medium",
        evidence: `Estimation accuracy is off by >${Math.round((estimationDrift / planTotal) * 100)}%. Points planned vs completed diverge significantly.` });
    }
  }

  if (st.dailyCheck?.metrics?.blocked > 0) {
    const blockedCount = st.dailyCheck.metrics.blocked;
    correlations.push({ from: "development", to: "review", pattern: "WIP bottleneck", severity: blockedCount > 2 ? "high" : "medium",
      evidence: `${blockedCount} ticket(s) blocked during sprint — possible WIP limit issue.` });
    cascadeRisks.push("Blocked tickets reduce effective velocity and may cause late-sprint rush.");
  }

  return { correlations, rootCauses, cascadeRisks };
}

// ── Action Recommendations ──

function generateActionRecommendations(st, dailyMetrics = null) {
  const recs = [];
  const pr = st.phaseResults || {};
  const reviewMetrics = st.reviewResult?.metrics || {};
  const daily = dailyMetrics || st.dailyCheck?.metrics || {};
  const mem = loadMemory();

  if (daily.completionPace === "behind" || daily.burndownDelta < -15) {
    const spilloverCandidates = (st.dailyCheck?.predictions?.spilloverRisk || []).slice(0, 2).join(", ");
    recs.push({ action: `Reduce sprint scope — consider descoping ${spilloverCandidates || "lowest-priority tickets"}`,
      priority: "high", reason: `Sprint is ${daily.burndownDelta || 0}% behind ideal burndown pace.`, type: "scope" });
  }

  if (daily.blocked > 0) {
    recs.push({ action: `Escalate ${daily.blocked} blocked ticket(s) — assign pair or remove dependency`,
      priority: "high", reason: "Blocked tickets erode velocity every day they remain unresolved.", type: "blocker" });
  }

  const devAtRisk = (pr.development?.tickets || []).filter(t => t.decision === "At Risk" || t.decision === "High Risk");
  if (devAtRisk.length > 0) {
    const ticketIds = devAtRisk.slice(0, 3).map(t => t.key || t.ticketId).join(", ");
    recs.push({ action: `Increase QA effort on ${ticketIds}`,
      priority: "medium", reason: `${devAtRisk.length} ticket(s) flagged as At Risk during development evaluation.`, type: "quality" });
  }

  const capUsagePct = pr.planning?.capacityTotal > 0
    ? Math.round((pr.planning.capacityUsed / pr.planning.capacityTotal) * 100) : 0;
  if (capUsagePct > 90 && (reviewMetrics.spillover || 0) > 0) {
    const reducePct = Math.min(20, Math.round(capUsagePct - 85));
    recs.push({ action: `Reduce next sprint capacity by ~${reducePct}% to avoid overcommitment`,
      priority: "medium", reason: `This sprint used ${capUsagePct}% capacity and had ${reviewMetrics.spillover} spillover ticket(s).`, type: "capacity" });
  }

  const unresolvedActions = (mem.sprints || []).flatMap(s => s.retroActions || [])
    .filter(a => !a.resolved && !a.completed).slice(0, 3);
  if (unresolvedActions.length > 0) {
    recs.push({ action: `Address ${unresolvedActions.length} unresolved retro action(s) from previous sprints`,
      priority: "medium", reason: "Recurring unresolved actions indicate systemic issues not being addressed.", type: "process",
      details: unresolvedActions.map(a => a.description || a).slice(0, 3) });
  }

  const velocityData = st.velocityData || {};
  if (velocityData.summary?.trend === "declining") {
    recs.push({ action: "Investigate velocity decline — consider team capacity review or tech debt sprint",
      priority: "medium", reason: `Velocity trend is declining over recent sprints.`, type: "velocity" });
  }

  return recs;
}

// ── Feedback Loop: Build Sprint Context from Memory ──

function buildSprintContext() {
  const mem = loadMemory();
  const sprints = mem.sprints || [];
  if (sprints.length === 0) return null;

  const recent = sprints.slice(-3);
  const velocities = recent.map(s => s.metrics?.completedPoints ?? s.velocity?.avgVelocity ?? 0);
  const nonZeroVelocities = velocities.filter(v => v > 0);
  const avgVelocity = nonZeroVelocities.length > 0
    ? Math.round(nonZeroVelocities.reduce((a, b) => a + b, 0) / nonZeroVelocities.length)
    : (recent[0]?.velocity?.avgVelocity || null);
  const trend = recent.length >= 2
    ? (recent[recent.length - 1]?.velocity?.trend || (velocities[velocities.length - 1] >= velocities[velocities.length - 2] ? "stable_or_improving" : "declining"))
    : (recent[0]?.velocity?.trend || "insufficient_data");

  const allRetroActions = sprints.flatMap((s, idx) => (s.retroActionItems || s.retroActions || []).map(a => ({
    ...(typeof a === "string" ? { description: a } : a),
    sprintAge: sprints.length - idx
  })));
  const unresolvedActions = allRetroActions.filter(a => !a.addressed && !a.resolved && !a.completed);

  const allRiskPatterns = sprints.flatMap(s => s.retroPatterns || s.patterns || s.risks || []).map(r => (typeof r === "string" ? r : (r.pattern || r.title || r.description || "")).toLowerCase());
  const patternCounts = {};
  for (const p of allRiskPatterns) {
    if (!p) continue;
    const key = p.slice(0, 60);
    patternCounts[key] = (patternCounts[key] || 0) + 1;
  }
  const recurringPatterns = Object.entries(patternCounts).filter(([, c]) => c >= 2).map(([p]) => p);

  const lastSprint = sprints[sprints.length - 1];
  const lastPlanned = lastSprint?.metrics?.plannedPoints || 0;
  const lastCompleted = lastSprint?.metrics?.completedPoints || 0;
  const estimationAccuracy = lastPlanned > 0 ? Math.round((lastCompleted / lastPlanned) * 100) : 0;
  const suggestedCapacity = avgVelocity ? Math.round(avgVelocity * 0.9) : (lastPlanned > 0 ? Math.round(lastPlanned * 0.8) : null);

  return {
    previousVelocity: { avg: avgVelocity, trend, recentValues: velocities },
    unresolvedRetroActions: unresolvedActions.slice(0, 5),
    recurringRiskPatterns: recurringPatterns.slice(0, 5),
    estimationAccuracy,
    suggestedCapacity,
    sprintsAnalyzed: sprints.length
  };
}

function runMonteCarloSimulation(mem, plannedPoints = 30, iterations = 10000) {
  const sprints = (mem.sprints || []).filter(s => s.metrics?.completedPoints > 0);
  if (sprints.length < 2) {
    return { available: false, reason: "Need at least 2 completed sprints for simulation" };
  }

  const velocities = sprints.map(s => s.metrics.completedPoints);
  const mean = velocities.reduce((a, b) => a + b, 0) / velocities.length;
  const variance = velocities.reduce((a, v) => a + (v - mean) ** 2, 0) / velocities.length;
  const stdDev = Math.sqrt(variance) || 1;

  function gaussianRandom() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  const simulated = [];
  for (let i = 0; i < iterations; i++) {
    const sample = Math.max(0, mean + stdDev * gaussianRandom());
    simulated.push(sample);
  }

  simulated.sort((a, b) => a - b);
  const p50 = simulated[Math.floor(iterations * 0.5)];
  const p75 = simulated[Math.floor(iterations * 0.75)];
  const p90 = simulated[Math.floor(iterations * 0.9)];
  const completionCount = simulated.filter(v => v >= plannedPoints).length;
  const completionProbability = Math.round((completionCount / iterations) * 100);

  return {
    available: true,
    iterations,
    sampleSize: sprints.length,
    plannedPoints,
    historicalMean: Math.round(mean * 10) / 10,
    historicalStdDev: Math.round(stdDev * 10) / 10,
    percentiles: {
      p50: Math.round(p50 * 10) / 10,
      p75: Math.round(p75 * 10) / 10,
      p90: Math.round(p90 * 10) / 10
    },
    completionProbability,
    recommendation: completionProbability >= 80 ? "Planned capacity looks achievable" :
                    completionProbability >= 50 ? "Moderate risk — consider reducing scope by 10-15%" :
                    "High risk of overcommitment — reduce scope by 20-30%"
  };
}

function computeSprintRiskScore(st, mem, monteCarlo) {
  let score = 0;
  const factors = [];

  const planned = st.sprint?.capacity || 30;
  const ctx = buildSprintContext();
  const avgVelocity = ctx.previousVelocity?.avg || planned;

  const overloadRatio = planned / (avgVelocity || planned);
  if (overloadRatio > 1.3) {
    score += 25;
    factors.push({ label: "Developer overload", value: `${Math.round(overloadRatio * 100)}%`, severity: "high" });
  } else if (overloadRatio > 1.1) {
    score += 12;
    factors.push({ label: "Slight overcommitment", value: `${Math.round(overloadRatio * 100)}%`, severity: "medium" });
  }

  const unresolvedDeps = (ctx.unresolvedRetroActions || []).length;
  if (unresolvedDeps >= 3) {
    score += 20;
    factors.push({ label: "Unresolved dependencies", value: `${unresolvedDeps}`, severity: "high" });
  } else if (unresolvedDeps >= 1) {
    score += 8;
    factors.push({ label: "Unresolved actions", value: `${unresolvedDeps}`, severity: "medium" });
  }

  const sprints = (mem.sprintHistory || []).filter(s => s.metrics);
  const spilloverRates = sprints.map(s => {
    const total = (s.metrics.totalTickets || 1);
    return ((s.metrics.spilloverCount || 0) / total) * 100;
  });
  if (spilloverRates.length >= 2) {
    const recentAvg = spilloverRates.slice(-2).reduce((a, b) => a + b, 0) / 2;
    if (recentAvg > 20) {
      score += 20;
      factors.push({ label: "Spillover trend", value: `+${Math.round(recentAvg)}%`, severity: "high" });
    } else if (recentAvg > 10) {
      score += 10;
      factors.push({ label: "Spillover trend", value: `+${Math.round(recentAvg)}%`, severity: "medium" });
    }
  }

  if (monteCarlo.available && monteCarlo.completionProbability < 50) {
    score += 20;
    factors.push({ label: "Monte Carlo low confidence", value: `${monteCarlo.completionProbability}%`, severity: "high" });
  } else if (monteCarlo.available && monteCarlo.completionProbability < 75) {
    score += 10;
    factors.push({ label: "Monte Carlo moderate confidence", value: `${monteCarlo.completionProbability}%`, severity: "medium" });
  }

  const recurringPatterns = (ctx.recurringRiskPatterns || []).length;
  if (recurringPatterns >= 3) {
    score += 15;
    factors.push({ label: "Recurring risk patterns", value: `${recurringPatterns}`, severity: "high" });
  } else if (recurringPatterns >= 1) {
    score += 5;
    factors.push({ label: "Recurring patterns", value: `${recurringPatterns}`, severity: "low" });
  }

  score = Math.min(100, Math.max(0, score));
  const level = score >= 70 ? "HIGH" : score >= 40 ? "MEDIUM" : "LOW";
  const recommendation = score >= 70
    ? "Reduce scope by 20% or rebalance workload across team members."
    : score >= 40
    ? "Review capacity allocation and address unresolved action items before sprint starts."
    : "Sprint looks healthy. Proceed with current plan.";

  return { score, level, factors, recommendation, computedAt: new Date().toISOString() };
}

async function runIntelligence() {
  state.currentPhase = "intelligence";
  state.phaseStatus.intelligence = "running";
  saveState(state);
  emit("PHASE_STARTED", { phase: "intelligence" });

  try {
    const mem = loadMemory();
    const plannedPts = state.sprint?.capacity || state.velocityData?.currentSprint?.plannedPoints || 30;
    const monteCarlo = runMonteCarloSimulation(mem, plannedPts);

    const sprintRisk = computeSprintRiskScore(state, mem, monteCarlo);
    emit("INSIGHT", { message: `Sprint Risk Score: ${sprintRisk.score}/100 (${sprintRisk.level}) — ${sprintRisk.factors.length} factor(s)` });

    if (state.offlineMode) {
      const crossPhase = analyzeCrossPhasePatterns(state);
      const actionRecs = generateActionRecommendations(state);
      const sprintCtx = buildSprintContext();
      state.phaseResults.intelligence = {
        executiveSummary: `Offline mode — rule-based analysis. Sprint Risk Score: ${sprintRisk.score}/100 (${sprintRisk.level}). ${crossPhase.rootCauses.length > 0 ? crossPhase.rootCauses[0] : "No critical root causes detected."} ${actionRecs.length > 0 ? `${actionRecs.length} action(s) recommended.` : ""}`,
        sprintRisk,
        risks: (state.reviewResult?.spillover || []).map(t => ({ title: `Spillover: ${t.ticketId}`, severity: "medium", description: t.reason || "Not completed", mitigation: "Carry to next sprint" })),
        dependencies: [],
        suggestions: actionRecs.map(r => ({ title: r.action, priority: r.priority, description: r.reason, category: r.type })),
        teamInsights: { workloadBalance: "N/A", moraleIndicator: "N/A", summary: "Offline mode — limited team analysis available." },
        sprintPrediction: { nextSprintSuccess: "N/A", confidence: 0, factors: ["Offline mode — prediction requires cloud AI"] },
        monteCarlo,
        crossPhaseAnalysis: crossPhase,
        actionRecommendations: actionRecs,
        sprintContext: sprintCtx,
        dataSources: ["RuleEngine", "FoundryLocal", "RAG", "CrossPhaseAnalysis", "MonteCarloSimulation", "AzureLLM (skipped — offline)"],
        generatedAt: new Date().toISOString(),
        highlights: [
          `Sprint Risk Score: ${sprintRisk.score}/100 (${sprintRisk.level})`,
          "Offline mode — rule-based intelligence report",
          `${(state.reviewResult?.spillover || []).length} spillover risk(s)`,
          crossPhase.correlations.length > 0 ? `${crossPhase.correlations.length} cross-phase correlation(s)` : null,
          actionRecs.length > 0 ? `${actionRecs.length} action recommendation(s)` : null,
          monteCarlo.available ? `Monte Carlo: ${monteCarlo.completionProbability}% chance of completing ${plannedPts} SP` : null
        ].filter(Boolean)
      };
      state.phaseStatus.intelligence = "done";
      saveState(state);
      emit("PHASE_COMPLETED", { phase: "intelligence", offline: true });
      emit("CYCLE_COMPLETE", { sprintId: state.sprint.sprintId });
      return { success: true, report: state.phaseResults.intelligence };
    }

    const crossPhase = analyzeCrossPhasePatterns(state);
    const actionRecs = generateActionRecommendations(state);
    const sprintCtx = buildSprintContext();

    emit("INSIGHT", { message: `Cross-phase analysis found ${crossPhase.correlations.length} correlation(s), ${crossPhase.rootCauses.length} root cause(s)` });

    const report = await callAgent("review", "/api/intelligence/report", {
      phaseResults: state.phaseResults,
      memory: mem,
      sprintHistory: state.history.slice(-5),
      crossPhaseAnalysis: crossPhase,
      actionRecommendations: actionRecs,
      sprintContext: sprintCtx
    });

    state.phaseResults.intelligence = {
      executiveSummary: report.executiveSummary || "",
      sprintRisk,
      risks: report.risks || [],
      dependencies: report.dependencies || [],
      suggestions: report.suggestions || [],
      teamInsights: report.teamInsights || {},
      sprintPrediction: report.sprintPrediction || {},
      monteCarlo,
      unresolvedActions: report.unresolvedActions || [],
      crossPhaseAnalysis: crossPhase,
      actionRecommendations: actionRecs,
      sprintContext: sprintCtx,
      dataSources: [...(report.dataSources || []), "CrossPhaseAnalysis", "MonteCarloSimulation"],
      generatedAt: report.generatedAt,
      highlights: [
        `Sprint Risk Score: ${sprintRisk.score}/100 (${sprintRisk.level})`,
        report.sprintPrediction?.nextSprintSuccess ? `Next sprint success likelihood: ${report.sprintPrediction.nextSprintSuccess}` : null,
        (report.risks || []).length > 0 ? `${report.risks.length} risk(s) identified` : "No significant risks",
        (report.suggestions || []).length > 0 ? `${report.suggestions.length} suggestion(s) for PO/SM` : null,
        crossPhase.correlations.length > 0 ? `${crossPhase.correlations.length} cross-phase correlation(s) detected` : null,
        crossPhase.rootCauses.length > 0 ? `Root cause: ${crossPhase.rootCauses[0]}` : null,
        actionRecs.length > 0 ? `${actionRecs.length} action recommendation(s) generated` : null,
        report.teamInsights?.moraleIndicator ? `Team morale: ${report.teamInsights.moraleIndicator}` : null,
        monteCarlo.available ? `Monte Carlo (${monteCarlo.iterations.toLocaleString()} sims): ${monteCarlo.completionProbability}% chance of completing ${plannedPts} SP` : null
      ].filter(Boolean)
    };

    state.phaseStatus.intelligence = "done";
    saveState(state);
    emit("PHASE_COMPLETED", { phase: "intelligence", riskCount: (report.risks || []).length, suggestionCount: (report.suggestions || []).length });
    emit("CYCLE_COMPLETE", { sprintId: state.sprint.sprintId });
    return { success: true, report };
  } catch (err) {
    state.phaseStatus.intelligence = "failed";
    saveState(state);
    emit("PHASE_FAILED", { phase: "intelligence", error: err.message });
    return { success: false, error: err.message };
  }
}

const PHASE_RUNNERS = {
  backlog: runBacklog,
  planning: runPlanning,
  development: runDevelopment,
  review: runReview,
  retro: runRetro,
  velocity: runVelocity,
  intelligence: runIntelligence
};

// ── Express Server ──

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use("/api/", apiLimiter);
app.use("/api/", sanitizeInput);
app.use(express.static(path.join(__dirname, "public-orchestrator")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, port: PORT });
});

app.get("/api/orchestrator/agents", async (_req, res) => {
  const status = {};
  for (const [key, agent] of Object.entries(AGENTS)) {
    status[key] = { ...agent, healthy: await checkAgentHealth(key) };
  }
  res.json(status);
});

app.get("/api/orchestrator/status", (_req, res) => {
  res.json({
    currentPhase: state.currentPhase,
    offlineMode: state.offlineMode || false,
    phaseStatus: state.phaseStatus,
    sprint: {
      id: state.sprint.id,
      sprintId: state.sprint.sprintId,
      goal: state.sprint.goal,
      ticketCount: (state.sprint.tickets || []).length,
      capacity: state.sprint.capacity
    },
    review: state.reviewResult ? {
      decision: state.reviewResult.decision,
      completed: state.reviewResult.metrics?.completedCorrectly || 0,
      total: state.reviewResult.metrics?.totalTickets || 0
    } : null,
    retro: state.retroResult ? {
      actionItems: (state.retroResult.actionItems || []).length,
      teamHealth: state.retroResult.teamHealth
    } : null,
    velocity: state.velocityData ? state.velocityData.summary : null,
    retroActions: state.retroActions.length,
    history: state.history.slice(-5),
    historyCount: state.history.length,
    lastUpdated: state.lastUpdated
  });
});

app.get("/api/orchestrator/context", (_req, res) => {
  res.json(state);
});

app.get("/api/orchestrator/phase-results", (_req, res) => {
  res.json(state.phaseResults || {});
});

app.get("/api/orchestrator/memory", (req, res) => {
  const topic = req.query.topic || "";
  res.json(topic ? queryMemory(topic) : loadMemory());
});

app.get("/api/orchestrator/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  for (const event of eventLog.slice(-50)) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  sseClients.push(res);
  req.on("close", () => {
    const idx = sseClients.indexOf(res);
    if (idx >= 0) sseClients.splice(idx, 1);
  });
});

app.post("/api/orchestrator/run-phase", requireRole("supervisor"), async (req, res) => {
  const { phase } = req.body;
  if (!PHASES.includes(phase)) return res.status(400).json({ error: `Invalid phase: ${phase}. Valid: ${PHASES.join(", ")}` });

  const runner = PHASE_RUNNERS[phase];
  if (!runner) return res.status(400).json({ error: `No runner for phase: ${phase}` });

  const result = await runner();
  res.json({ phase, ...result });
});

app.post("/api/orchestrator/run-cycle", requireRole("supervisor"), async (_req, res) => {
  emit("CYCLE_STARTED", {});
  state.phaseStatus = Object.fromEntries(PHASES.map(p => [p, "pending"]));
  saveState(state);

  const results = {};
  for (const phase of PHASES) {
    const runner = PHASE_RUNNERS[phase];
    results[phase] = await runner();
    if (!results[phase].success) {
      emit("CYCLE_ABORTED", { failedPhase: phase, error: results[phase].error });
      return res.json({ success: false, failedPhase: phase, results });
    }
  }

  res.json({ success: true, results });
});

app.post("/api/orchestrator/reset", requireRole("supervisor"), (_req, res) => {
  state = defaultState();
  saveState(state);
  emit("STATE_RESET", {});
  res.json({ ok: true });
});

app.post("/api/orchestrator/configure", requireRole("supervisor"), (req, res) => {
  const { capacity, boardId, sprintId, goal, offlineMode } = req.body;
  if (capacity != null) state.sprint.capacity = Number(capacity);
  if (boardId != null) state.sprint.boardId = boardId;
  if (sprintId != null) state.sprint.sprintId = sprintId;
  if (goal != null) state.sprint.goal = goal;
  if (offlineMode != null) state.offlineMode = !!offlineMode;
  saveState(state);
  res.json({ ok: true, sprint: state.sprint, offlineMode: state.offlineMode });
});

// ── AI Manager Endpoints ──

let managerReport = null;

app.post("/api/orchestrator/manager/evaluate", requireRole("supervisor"), async (_req, res) => {
  try {
    const mem = loadMemory();
    if (mem.sprints.length === 0 && state.history.length === 0) {
      return res.status(400).json({ error: "No sprint history. Complete at least one sprint cycle first." });
    }

    emit("MANAGER_EVAL_STARTED", { sprintsAvailable: mem.sprints.length });
    const report = await callAgent("review", "/api/manager/evaluate", {
      memory: mem,
      sprintHistory: state.history.slice(-10)
    });

    managerReport = report;
    emit("MANAGER_EVAL_COMPLETED", { overallGrade: report.overallGrade, score: report.overallScore });
    res.json(report);
  } catch (err) {
    emit("MANAGER_EVAL_FAILED", { error: err.message });
    res.status(500).json({ error: err?.message || "Manager evaluation failed." });
  }
});

app.get("/api/orchestrator/manager/report", (_req, res) => {
  if (!managerReport) return res.json({ available: false });
  res.json({ available: true, ...managerReport });
});

app.get("/api/jira/boards", async (_req, res) => {
  try {
    const data = await callAgent("review", "/api/jira/boards", null, "GET");
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err?.message || "Failed to fetch JIRA boards from Review Agent." });
  }
});

app.get("/api/jira/boards/:boardId/sprints", async (req, res) => {
  try {
    const data = await callAgent("review", `/api/jira/boards/${req.params.boardId}/sprints`, null, "GET");
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err?.message || "Failed to fetch sprints from Review Agent." });
  }
});

// ── Daily Sprint Health Check ──

app.post("/api/orchestrator/daily-check", requireRole("supervisor"), async (_req, res) => {
  emit("DAILY_CHECK_STARTED", {});
  try {
    const sprintCfg = state.sprint || {};
    const capacity = sprintCfg.capacity || 30;
    const sprintDaysTotal = 10;

    // 1. Fetch current ticket states
    let tickets = [];
    let ticketSource = "simulated";
    try {
      if (sprintCfg.boardId && sprintCfg.sprintId) {
        const jiraData = await callAgent("review", `/api/review/sprint/jira/tickets?sprintId=${sprintCfg.sprintId}&boardId=${sprintCfg.boardId}`, null, "GET");
        if (Array.isArray(jiraData?.tickets) && jiraData.tickets.length) {
          tickets = jiraData.tickets;
          ticketSource = "JIRA";
        }
      }
    } catch {}
    if (!tickets.length) {
      try {
        const simData = await callAgent("review", "/api/review/sprint/jira/simulate", { boardId: sprintCfg.boardId, sprintId: sprintCfg.sprintId });
        tickets = simData?.tickets || [];
        ticketSource = "simulated";
      } catch {}
    }

    // 2. Get standup-based health signals
    let standupHealth = {};
    try { standupHealth = await callAgent("iterative", "/api/sprint-health", {}); } catch {}

    // 3. Compute metrics
    const done = tickets.filter(t => ["done", "closed", "resolved"].includes(String(t.status || "").toLowerCase()));
    const inProgress = tickets.filter(t => ["in progress", "in review", "in development"].includes(String(t.status || "").toLowerCase()));
    const blocked = tickets.filter(t => String(t.status || "").toLowerCase().includes("block"));
    const todo = tickets.filter(t => !done.includes(t) && !inProgress.includes(t) && !blocked.includes(t));

    const completedPoints = done.reduce((s, t) => s + (t.storyPoints || t.story_points || 0), 0);
    const plannedPoints = tickets.reduce((s, t) => s + (t.storyPoints || t.story_points || 0), 0) || capacity;
    const completionPct = plannedPoints > 0 ? Math.round((completedPoints / plannedPoints) * 100) : 0;

    const sprintStartDate = sprintCfg.startDate ? new Date(sprintCfg.startDate) : new Date(Date.now() - 5 * 86400000);
    const daysSinceStart = Math.max(1, Math.ceil((Date.now() - sprintStartDate.getTime()) / 86400000));
    const sprintDay = Math.min(daysSinceStart, sprintDaysTotal);
    const timePct = Math.round((sprintDay / sprintDaysTotal) * 100);
    const burndownDelta = completionPct - timePct;
    const completionPace = burndownDelta >= 0 ? "on_track" : burndownDelta >= -15 ? "slightly_behind" : "behind";

    // 4. Rule-based risk detection
    const risks = [];
    for (const t of blocked) {
      risks.push({ ticket: t.ticketId || t.key, risk: "Ticket is blocked", severity: "high", recommendation: "Escalate blocker immediately" });
    }
    const expectedDonePct = timePct;
    if (completionPct < expectedDonePct - 20) {
      risks.push({ ticket: "Sprint", risk: `Only ${completionPct}% complete at ${timePct}% through sprint`, severity: "high", recommendation: "Review scope — consider descoping lowest-priority items" });
    }
    for (const t of inProgress) {
      const daysSinceUpdate = t.updated ? Math.ceil((Date.now() - new Date(t.updated).getTime()) / 86400000) : 0;
      if (daysSinceUpdate > 3) {
        risks.push({ ticket: t.ticketId || t.key, risk: `No update for ${daysSinceUpdate} days`, severity: "medium", recommendation: "Check with assignee for blockers" });
      }
    }
    if (standupHealth?.risks?.length) {
      for (const r of standupHealth.risks.slice(0, 3)) {
        risks.push({ ticket: r.ticketId || "Standup", risk: r.description || r, severity: "medium", recommendation: r.mitigation || "Address in today's standup" });
      }
    }

    // 5. Predict spillover
    const velocityPerDay = sprintDay > 0 ? completedPoints / sprintDay : 0;
    const projectedTotal = Math.round(velocityPerDay * sprintDaysTotal);
    const remainingPoints = plannedPoints - completedPoints;
    const daysNeeded = velocityPerDay > 0 ? Math.ceil(remainingPoints / velocityPerDay) : sprintDaysTotal;
    const daysLeft = sprintDaysTotal - sprintDay;
    const likelyCompletionPct = Math.min(100, Math.round((projectedTotal / plannedPoints) * 100));

    const spilloverCandidates = [...todo, ...inProgress]
      .filter(t => (t.storyPoints || t.story_points || 3) > (velocityPerDay * daysLeft * 0.5))
      .map(t => t.ticketId || t.key)
      .slice(0, 5);

    // 6. AI summary (if online)
    let aiSummary = "";
    const dataSources = ["RuleEngine", ticketSource];
    if (standupHealth?.decision) dataSources.push("StandupInsights");

    if (!state.offlineMode) {
      try {
        const prompt = `Sprint day ${sprintDay}/${sprintDaysTotal}. ${completionPct}% points done. ${done.length} done, ${inProgress.length} in progress, ${blocked.length} blocked, ${todo.length} todo. ${risks.length} risks identified. Pace: ${completionPace}. Give a 2-sentence daily status summary for the Scrum Master.`;
        const aiResult = await callAgent("review", "/api/intelligence/report", {
          phaseResults: { daily: { summary: prompt, metrics: { completionPct, sprintDay, risks: risks.length } } },
          memory: {},
          sprintHistory: []
        });
        aiSummary = aiResult?.executiveSummary || "";
        dataSources.push("AzureLLM");
      } catch {}
    }

    if (!aiSummary) {
      aiSummary = `Sprint is ${sprintDay} of ${sprintDaysTotal} days in. ${completionPct}% of points completed (${done.length}/${tickets.length} tickets done). ${risks.length > 0 ? `${risks.length} risk(s) need attention.` : "No critical risks."} Pace: ${completionPace === "on_track" ? "on track" : completionPace === "slightly_behind" ? "slightly behind — monitor closely" : "behind schedule — action needed"}.`;
    }

    const dailyReport = {
      timestamp: new Date().toISOString(),
      sprintDay,
      sprintDaysTotal,
      metrics: {
        totalTickets: tickets.length,
        done: done.length,
        inProgress: inProgress.length,
        todo: todo.length,
        blocked: blocked.length,
        plannedPoints,
        completedPoints,
        completionPct,
        burndownDelta,
        completionPace
      },
      risks,
      predictions: {
        likelyCompletion: `${likelyCompletionPct}%`,
        spilloverRisk: spilloverCandidates,
        daysNeeded,
        daysLeft,
        confidence: Math.max(30, Math.min(90, 50 + burndownDelta))
      },
      summary: aiSummary,
      standupHealth: standupHealth?.decision || null,
      dataSources,
      requiresValidation: true
    };

    dailyReport.recommendations = generateActionRecommendations(state, dailyReport.metrics);
    if (dailyReport.recommendations.length > 0) {
      emit("INSIGHT", { message: `Daily check: ${dailyReport.recommendations.length} action recommendation(s) generated` });
    }

    state.dailyCheck = dailyReport;
    saveState(state);
    emit("DAILY_CHECK_COMPLETE", { risks: risks.length, pace: completionPace, recommendations: dailyReport.recommendations.length });
    res.json(dailyReport);
  } catch (err) {
    emit("DAILY_CHECK_FAILED", { error: err?.message });
    res.status(500).json({ error: err?.message || "Daily check failed" });
  }
});

app.get("/api/orchestrator/daily-check", (_req, res) => {
  res.json(state.dailyCheck || { available: false });
});

app.get("/api/orchestrator/sprint-context", (_req, res) => {
  const ctx = buildSprintContext();
  res.json(ctx || { available: false, message: "No previous sprint data in memory." });
});

app.get("/api/orchestrator/rai-summary", async (_req, res) => {
  const summary = { agents: {}, aggregate: { totalAuditEvents: 0, dataSources: {}, validationWarnings: 0, requiresValidationCount: 0, offlineMode: state.offlineMode || false } };
  const agentAudits = [
    { key: "backlog", path: "/api/audit" },
    { key: "planning", path: "/api/audit" },
    { key: "iterative", path: "/api/audit" },
    { key: "review", path: "/api/audit" }
  ];
  for (const a of agentAudits) {
    try {
      const auditLog = await callAgent(a.key, a.path, null, "GET");
      const count = Array.isArray(auditLog) ? auditLog.length : 0;
      summary.agents[a.key] = { auditEvents: count, healthy: true };
      summary.aggregate.totalAuditEvents += count;
    } catch {
      summary.agents[a.key] = { auditEvents: 0, healthy: false };
    }
  }

  const pr = state.phaseResults || {};
  for (const phase of Object.values(pr)) {
    if (Array.isArray(phase?.dataSources)) {
      for (const ds of phase.dataSources) {
        summary.aggregate.dataSources[ds] = (summary.aggregate.dataSources[ds] || 0) + 1;
      }
    }
    if (phase?.requiresValidation) summary.aggregate.requiresValidationCount++;
    if (phase?.llmValidation?.warnings?.length) summary.aggregate.validationWarnings += phase.llmValidation.warnings.length;
    if (Array.isArray(phase?.tickets)) {
      for (const t of phase.tickets) {
        if (t.llmValidation?.warnings?.length) summary.aggregate.validationWarnings += t.llmValidation.warnings.length;
        if (t.requiresValidation) summary.aggregate.requiresValidationCount++;
        if (Array.isArray(t.dataSources)) {
          for (const ds of t.dataSources) {
            summary.aggregate.dataSources[ds] = (summary.aggregate.dataSources[ds] || 0) + 1;
          }
        }
      }
    }
  }
  res.json(summary);
});

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(__dirname, "public-orchestrator", "index.html"));
});

app.listen(PORT, () => {
  console.log(chalk.green(`\n  Agile Orchestrator running at http://localhost:${PORT}\n`));
  console.log(chalk.dim(`  Agents expected at:`));
  for (const [key, agent] of Object.entries(AGENTS)) {
    console.log(chalk.dim(`    ${agent.name}: http://localhost:${agent.port}`));
  }
  console.log();
});
