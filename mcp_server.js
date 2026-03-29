import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const AGENTS = {
  backlog:     { port: 3000, name: "Backlog Agent" },
  planning:    { port: 3020, name: "Sprint Planning Agent" },
  iterative:   { port: 4040, name: "Iterative + Standup Agent" },
  review:      { port: 5050, name: "Review + Retro Agent" },
  orchestrator:{ port: 6060, name: "Orchestrator" }
};

async function callAgent(agentKey, apiPath, payload = null, method = "POST") {
  const agent = AGENTS[agentKey];
  const url = `http://localhost:${agent.port}${apiPath}`;
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (payload && method !== "GET") opts.body = JSON.stringify(payload);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(data.error || `${agent.name} returned HTTP ${res.status}`);
  return data;
}

const server = new McpServer({
  name: "agile-sprint-orchestrator",
  version: "1.0.0"
});

// ── Tool: Refine Backlog ──
server.tool(
  "refine_backlog",
  "Fetch JIRA tickets and refine them through AI-powered backlog processing (insights, estimation, risk analysis, schema validation). Uses Foundry Local + RAG + heuristic estimation.",
  { operation: z.string().optional().describe("Operation mode: '1' for generate, '2' for refine. Default: '2'") },
  async ({ operation }) => {
    const op = operation || "2";
    const prepareResult = await callAgent("backlog", "/api/prepare", { operation: op });
    const tickets = prepareResult.tickets || [];
    const insightResult = await callAgent("backlog", "/api/insights", { tickets });
    const enrichedTickets = insightResult.tickets || tickets;
    const processResult = await callAgent("backlog", "/api/process", { operation: op, tickets: enrichedTickets });
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          ticketsProcessed: (processResult.results || []).length,
          rejected: (processResult.rejected || []).length,
          tickets: (processResult.results || []).slice(0, 10).map(t => ({
            key: t.key || t.ticketId,
            summary: t.summary || t.title,
            points: t.estimation?.approvedPoints || t.storyPoints || 0,
            confidence: t.aiInsights?.confidenceScore || 0,
            status: t.review?.status || "Processed"
          }))
        }, null, 2)
      }]
    };
  }
);

// ── Tool: Plan Sprint ──
server.tool(
  "plan_sprint",
  "Run sprint planning: recommend tickets for sprint based on capacity, AI-assign team members, save sprint plan. Uses Azure OpenAI + Foundry Local + RAG.",
  {
    capacityPoints: z.number().optional().describe("Sprint capacity in story points. Default: 30"),
    sprintGoal: z.string().optional().describe("Sprint goal description")
  },
  async ({ capacityPoints, sprintGoal }) => {
    const cap = capacityPoints || 30;
    const loadResult = await callAgent("planning", "/api/backlog/load", { source: "file" });
    const tickets = loadResult.tickets || loadResult.backlog || [];
    const recResult = await callAgent("planning", "/api/sprint/recommend", { tickets, capacityPoints: cap });
    const selected = recResult.selected || tickets.filter(t => t.selected);
    const aiResult = await callAgent("planning", "/api/sprint/ai-assign", { tickets: selected });
    const enriched = aiResult.tickets || selected;
    await callAgent("planning", "/api/sprint/save", {
      sprintBacklog: enriched,
      capacityPoints: cap,
      sprintGoal: sprintGoal || recResult.sprintGoal || ""
    });
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          sprintGoal: recResult.sprintGoal || sprintGoal || "",
          ticketsSelected: enriched.length,
          totalPoints: enriched.reduce((s, t) => s + (t.storyPoints || 0), 0),
          capacity: cap,
          tickets: enriched.slice(0, 10).map(t => ({
            key: t.key || t.ticketId,
            summary: t.summary || t.title,
            points: t.storyPoints || 0,
            assignee: t.assignee || "Unassigned",
            confidence: t.confidence || 0
          }))
        }, null, 2)
      }]
    };
  }
);

// ── Tool: Evaluate Work Products ──
server.tool(
  "evaluate_work_products",
  "Evaluate all sprint work products using rule engine + Foundry Local + RAG + Azure OpenAI. Returns per-ticket evaluations with confidence scores and sprint health.",
  {},
  async () => {
    const evaluations = await callAgent("iterative", "/api/github/work-products/evaluate-all", {});
    let health = {};
    try { health = await callAgent("iterative", "/api/sprint-health", {}); } catch {}
    const evalList = Array.isArray(evaluations) ? evaluations : Object.values(evaluations);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          evaluationCount: evalList.length,
          sprintHealth: health.decision || "N/A",
          evaluations: evalList.slice(0, 10).map(e => ({
            ticketId: e.ticketId || e.caseKey,
            decision: e.decision,
            confidence: e.confidence,
            dataSources: e.dataSources
          }))
        }, null, 2)
      }]
    };
  }
);

// ── Tool: Run Sprint Review ──
server.tool(
  "run_sprint_review",
  "Run sprint review: simulate JIRA ticket data, gather stakeholder feedback, evaluate each ticket. Returns committed/spillover/rework breakdown.",
  {
    boardId: z.number().optional().describe("JIRA board ID"),
    sprintId: z.number().optional().describe("JIRA sprint ID")
  },
  async ({ boardId, sprintId }) => {
    const simResult = await callAgent("review", "/api/review/sprint/jira/simulate", {
      boardId: boardId || undefined,
      sprintId: sprintId || undefined
    });
    const tickets = simResult.tickets || [];
    let feedback = [];
    try {
      const fbResult = await callAgent("review", "/api/review/feedback/teams/simulated", {});
      feedback = fbResult.feedback ? [fbResult.feedback] : [];
    } catch {}
    const reviewResult = await callAgent("review", "/api/review/sprint", {
      tickets,
      sprintId: sprintId || "SIM-SPRINT",
      stakeholderFeedback: feedback
    });
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          decision: reviewResult.decision,
          totalTickets: reviewResult.metrics?.totalTickets,
          completedCorrectly: reviewResult.metrics?.completedCorrectly,
          spillover: reviewResult.metrics?.spillover,
          incorrectImplementation: reviewResult.metrics?.incorrectImplementation,
          dataSources: reviewResult.dataSources,
          requiresValidation: reviewResult.requiresValidation
        }, null, 2)
      }]
    };
  }
);

// ── Tool: Run Retrospective ──
server.tool(
  "run_retrospective",
  "Generate AI-powered sprint retrospective from review results. Identifies what went well, what didn't, improvements, action items, and recurring patterns.",
  {},
  async () => {
    const autoResult = await callAgent("review", "/api/retro/auto-populate", {});
    const retroResult = await callAgent("review", "/api/retro/generate", {
      reviewResult: autoResult.reviewResult || {},
      wentWell: autoResult.wentWell || [],
      didntGoWell: autoResult.didntGoWell || [],
      improvements: autoResult.improvements || [],
      transcript: autoResult.transcript || ""
    });
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          wentWell: retroResult.wentWell,
          didntGoWell: retroResult.didntGoWell,
          actionItems: (retroResult.actionItems || []).length,
          teamHealth: retroResult.teamHealth,
          patterns: retroResult.patterns,
          dataSources: retroResult.dataSources,
          requiresValidation: retroResult.requiresValidation
        }, null, 2)
      }]
    };
  }
);

// ── Tool: Get Velocity Data ──
server.tool(
  "get_velocity",
  "Get velocity tracking data including burndown, sprint history, and next sprint projection.",
  {},
  async () => {
    const ctx = await callAgent("orchestrator", "/api/orchestrator/context", null, "GET");
    if (!ctx.reviewResult) throw new Error("Run sprint review first -- velocity depends on review results.");
    const velocityData = await callAgent("review", "/api/velocity/data", { reviewResult: ctx.reviewResult });
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          avgVelocity: velocityData.summary?.avgVelocity,
          trend: velocityData.summary?.trend,
          avgCompletion: velocityData.summary?.avgCompletion,
          projection: velocityData.projection
        }, null, 2)
      }]
    };
  }
);

// ── Tool: Run Full Sprint Cycle ──
server.tool(
  "run_full_cycle",
  "Execute a complete Agile sprint cycle through the orchestrator: Backlog → Planning → Development → Review → Retro → Velocity → Intelligence Report. All 7 phases run sequentially.",
  {
    boardId: z.number().optional().describe("JIRA board ID for review phase"),
    sprintId: z.number().optional().describe("JIRA sprint ID for review phase"),
    capacity: z.number().optional().describe("Sprint capacity in story points. Default: 30")
  },
  async ({ boardId, sprintId, capacity }) => {
    if (boardId || sprintId || capacity) {
      const payload = {};
      if (capacity) payload.capacity = capacity;
      if (boardId) payload.boardId = boardId;
      if (sprintId) payload.sprintId = sprintId;
      await callAgent("orchestrator", "/api/orchestrator/configure", payload);
    }
    const result = await callAgent("orchestrator", "/api/orchestrator/run-cycle", {});
    const status = await callAgent("orchestrator", "/api/orchestrator/status", null, "GET");
    const phaseResults = await callAgent("orchestrator", "/api/orchestrator/phase-results", null, "GET");
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: result.success,
          failedPhase: result.failedPhase || null,
          phases: Object.fromEntries(
            Object.entries(phaseResults).map(([k, v]) => [k, { highlights: v.highlights }])
          ),
          review: status.review,
          velocity: status.velocity
        }, null, 2)
      }]
    };
  }
);

// ── Tool: Get Intelligence Report ──
server.tool(
  "get_intelligence_report",
  "Get the Sprint Intelligence Report with risks, dependencies, suggestions for PO/SM, team insights, and next sprint prediction. Requires a completed sprint cycle.",
  {},
  async () => {
    const phaseResults = await callAgent("orchestrator", "/api/orchestrator/phase-results", null, "GET");
    if (!phaseResults.intelligence) throw new Error("Run a full sprint cycle first -- intelligence report is generated at the end.");
    return {
      content: [{
        type: "text",
        text: JSON.stringify(phaseResults.intelligence, null, 2)
      }]
    };
  }
);

// ── Tool: Run Manager Evaluation ──
server.tool(
  "run_manager_evaluation",
  "Run AI Manager cross-sprint team performance evaluation. Analyzes velocity trends, quality, predictability, action follow-through, and generates team recommendations. Requires at least one completed sprint.",
  {},
  async () => {
    const report = await callAgent("orchestrator", "/api/orchestrator/manager/evaluate", {});
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          overallGrade: report.overallGrade,
          overallScore: report.overallScore,
          velocityTrend: report.velocityAnalysis?.trend,
          qualityTrend: report.qualityAnalysis?.defectTrend,
          predictability: report.predictability?.score,
          actionFollowThrough: report.actionFollowThrough?.followThroughRate,
          recommendations: (report.teamRecommendations || []).length,
          executiveSummary: report.executiveSummary
        }, null, 2)
      }]
    };
  }
);

// ── Tool: Get Agent Health ──
server.tool(
  "get_agent_health",
  "Check health status of all agents in the Agile Sprint Orchestrator system.",
  {},
  async () => {
    const agents = await callAgent("orchestrator", "/api/orchestrator/agents", null, "GET");
    return {
      content: [{
        type: "text",
        text: JSON.stringify(agents, null, 2)
      }]
    };
  }
);

// ── Tool: Get Daily Sprint Status ──
server.tool(
  "get_daily_status",
  "Run a daily sprint health check. Returns current ticket status breakdown, burndown position, risk flags, spillover predictions, and AI-generated summary. Use this to get a quick pulse on sprint health.",
  {},
  async () => {
    const existing = await callAgent("orchestrator", "/api/orchestrator/daily-check", null, "GET");
    let report = existing;
    if (!existing || existing.available === false) {
      report = await callAgent("orchestrator", "/api/orchestrator/daily-check", {});
    }
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          sprintDay: report.sprintDay,
          sprintDaysTotal: report.sprintDaysTotal,
          metrics: report.metrics,
          risks: (report.risks || []).length,
          topRisks: (report.risks || []).slice(0, 3),
          predictions: report.predictions,
          summary: report.summary,
          pace: report.metrics?.completionPace
        }, null, 2)
      }]
    };
  }
);

// ── Start Server ──
const transport = new StdioServerTransport();
await server.connect(transport);
