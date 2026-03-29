# Building an Autonomous Sprint Engine with Multi-Agent AI

### Agile Sprint Orchestrator -- Agents for Impact

**GitHub:** [snehasankaran/agile-sprint-orchestrator](https://github.com/snehasankaran/agile-sprint-orchestrator)

---

## The Problem Every Agile Team Knows

If you've worked in an Agile team, you've seen the pattern:

- Backlog items enter sprints without acceptance criteria, estimates, or dependency mapping. Result: rework, scope creep, failed sprints.
- Planning is based on gut feel. Teams over-commit because nobody connects actual capacity to historical velocity. Result: 30-40% spillover rates.
- During the sprint, work product quality is invisible until the review. PRs merge without checking acceptance criteria. Result: defects discovered at demo, not during development.
- Sprint reviews are a walkthrough, not an evaluation. Nobody measures which tickets truly met acceptance criteria. Result: "Done" doesn't mean "done right."
- Retrospectives produce the same insights every time. Action items are never tracked. The same mistakes repeat for months.
- Every sprint starts from zero. Nobody remembers what happened three sprints ago.

The data to make better decisions exists -- scattered across JIRA, GitHub, Teams transcripts, and human memory. But no tool connects it.

**We built a system that does.**

---

## What We Built

Agile Sprint Orchestrator is a multi-agent AI system where every Agile ceremony -- from backlog refinement to retrospective -- is handled by a specialized AI agent. A central orchestrator coordinates all agents through a 7-phase pipeline, maintains cross-sprint memory, and generates intelligence reports.

It doesn't generate dashboards. It evaluates every ticket against acceptance criteria. It doesn't suggest capacity. It prevents overcommitment with historical evidence. It doesn't list retro items. It detects patterns that have recurred for months and injects them into the next sprint's planning.

---

## Architecture

The system consists of 5 independently deployable services communicating via HTTP APIs:

```
                         ┌─────────────────────┐
                         │    Orchestrator      │
                         │    (port 6060)       │
                         │                     │
                         │  Shared State       │
                         │  Cross-Sprint Memory│
                         │  SSE Event Stream   │
                         └──────┬──────────────┘
                                │
              ┌─────────┬───────┴────────┬──────────┐
              ▼         ▼                ▼          ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ Backlog  │ │ Planning │ │ Iterative│ │ Review   │
        │ Agent    │ │ Agent    │ │ Dev Agent│ │ Agent    │
        │ :3000    │ │ :3020    │ │ :4040    │ │ :5050    │
        └──────────┘ └──────────┘ └──────────┘ └──────────┘
              │           │            │            │
              ▼           ▼            ▼            ▼
         JIRA Cloud   JIRA Cloud   GitHub API   JIRA Cloud
                      Azure LLM   Teams API    Foundry Local
                      Ollama RAG  Azure LLM    Azure LLM
                                  Ollama RAG   Ollama RAG
```

**Pipeline:** `Backlog → Planning → Development → Review → Retro → Velocity → Intelligence`

Each phase calls the appropriate agent, passes results to the next phase through shared state (`orchestrator_state.json`), and streams events to the dashboard in real-time via Server-Sent Events (SSE).

---

## Step-by-Step: How Each Agent Works

### 1. Backlog Refinement Agent (Port 3000)

**Who it helps:** Product Owner

**What it does:** Takes raw requirements (pasted text, CSV upload, or JIRA fetch) and transforms them into sprint-ready tickets.

**How it works:**

1. Fetches tickets from JIRA Cloud REST API
2. Validates each ticket against JSON schema using AJV
3. Scores ticket completeness (description quality, acceptance criteria presence)
4. Estimates story points using historical similarity from past refined tickets
5. Detects dependencies through keyword analysis (backend, database, auth, OTA, etc.)
6. Flags risk signals (blocking dependencies, missing fields, complexity indicators)

**Key code pattern -- dependency detection:**

```javascript
const DEPENDENCY_RULES = [
  { regex: /(api|rest|endpoint|service)/g, label: "Backend API dependency" },
  { regex: /(database|db|sql|schema|migration)/g, label: "Database dependency" },
  { regex: /(auth|oauth|token|sso|identity)/g, label: "Identity/auth dependency" },
  { regex: /(sensor|camera|radar|lidar)/g, label: "Sensor subsystem dependency" },
  { regex: /(ui|frontend|screen|dashboard|ux)/g, label: "Frontend/UI dependency" }
];
```

Every refinement decision is logged to `data/backlog-audit.json` for Responsible AI traceability.

---

### 2. Sprint Planning Agent (Port 3020)

**Who it helps:** Scrum Master

**What it does:** Builds an optimal sprint plan within team capacity using historical velocity data and AI-powered assignment.

**How it works:**

1. Loads the refined backlog from the previous phase
2. Reads historical velocity from `data/sprint_metrics_simulated.json`
3. If past sprints show overcommitment, automatically reduces suggested capacity
4. Selects tickets by priority within capacity constraints
5. Uses Azure OpenAI + RAG (LangChain.js + Ollama embeddings) to match tickets to team members
6. Generates a sprint plan with goal, ticket list, and point distribution

**Key code pattern -- capacity guard from cross-sprint memory:**

```javascript
const sprintContext = buildSprintContext();
if (sprintContext.avgVelocity > 0) {
  const suggestedCapacity = Math.round(sprintContext.avgVelocity * 0.9);
  emit("INSIGHT", {
    message: `Historical velocity suggests ${suggestedCapacity} SP capacity`
  });
}
```

The planning agent also consumes unresolved retro actions from the orchestrator's memory, ensuring past learnings influence future plans.

---

### 3. Iterative Dev + Standup Agent (Port 4040)

**Who it helps:** Development Team

**What it does:** Monitors work product quality during the sprint and processes daily standup transcripts.

**How it works -- Standup Processing:**

1. Accepts standup transcript (pasted text or fetched from Microsoft Teams via Graph API)
2. Uses Azure OpenAI to extract per-developer updates: progress, plans, blockers
3. Maps updates to sprint tickets
4. Flags at-risk tickets with completion probability (green/amber/red)

**How it works -- Work Product Evaluation:**

1. Fetches work products from GitHub repository
2. Evaluates each against its JIRA ticket's acceptance criteria
3. Rule-based evaluation computes acceptance coverage % and test failure rate %
4. AI evaluation provides decision (Go/No-Go), confidence score, and recommendations
5. Computes sprint health: burndown pace, blocked tickets, spillover prediction

**Key code pattern -- rule-based evaluation (no LLM hallucination on pass/fail):**

```javascript
function evaluateWorkProductRuleBased(wp) {
  const ac = wp.acceptanceCriteria || [];
  const impl = wp.implementationNotes || "";
  const metCount = ac.filter(c =>
    impl.toLowerCase().includes(c.toLowerCase().slice(0, 20))
  ).length;

  return {
    metrics: {
      acceptanceCoveragePercent: Math.round((metCount / ac.length) * 100),
      testFailureRatePercent: wp.testResults?.failRate ?? 100,
      codeCoveragePercent: wp.coverage ?? 0
    }
  };
}
```

---

### 4. Review + Retro Agent (Port 5050)

**Who it helps:** Product Owner and Scrum Master

**What it does:** Evaluates sprint deliverables through a 3-layer pipeline, runs data-driven retrospectives, and tracks velocity.

**The 3-layer evaluation pipeline:**

| Layer | Technology | What It Does |
|-------|-----------|-------------|
| Layer 1 | Rule Engine | Deterministic check: acceptance criteria coverage %, test failure rate % |
| Layer 2 | Foundry Local | On-device AI extraction of tasks, blockers, gaps (phi model) |
| Layer 3 | Azure OpenAI | LLM-powered decision with confidence scoring and recommendations |

**Key code pattern -- combining rule + AI evaluation (nullish coalescing for zero-value correctness):**

```javascript
const metricsPass =
  Number(review.metrics?.acceptanceCoveragePercent ?? 0) === 100 &&
  Number(review.metrics?.testFailureRatePercent ?? 100) === 0;
```

We caught a subtle bug during development: using `||` instead of `??` caused `testFailureRatePercent: 0` (perfect score) to be treated as `100` (failure) because `0` is falsy in JavaScript. This single character change (`||` to `??`) fixed a 0% completion rate bug across the entire system.

**Retrospective features:**
- AI-generated "what went well" and "what to improve" based on actual sprint data
- Recurring pattern detection across sprints
- Action items with owners, tracked for follow-through
- Velocity charts with burndown visualization and CSV export

---

### 5. The Orchestrator (Port 6060)

**Who it helps:** Scrum Master and Product Owner

The orchestrator is more than a sequencer. It's the intelligence layer:

**Cross-Sprint Memory:**

```javascript
const MEMORY_FILE = path.join(DATA_DIR, "orchestrator_memory.json");

function buildSprintContext() {
  const mem = loadMemory();
  const sprints = mem.sprints || [];
  const velocities = sprints
    .filter(s => s.completedPoints != null)
    .map(s => s.completedPoints);
  const avgVelocity = velocities.length
    ? Math.round(velocities.reduce((a, b) => a + b, 0) / velocities.length)
    : 0;
  // ... unresolved actions, recurring patterns
}
```

After every sprint cycle, the orchestrator saves velocity, completion rate, retro actions, and detected patterns. The next cycle's Backlog and Planning phases automatically consume this context.

**Cross-Phase Intelligence:**

The orchestrator detects correlations that no human manually tracks:

- Overcommitment in planning correlating with spillover in review
- Low standup engagement correlating with at-risk tickets
- Recurring retro patterns that were never addressed
- Estimation drift: consistently under-estimating certain ticket types

**AI Manager:**

A meta-agent that evaluates team performance across sprints:
- Velocity trend (improving, declining, stable)
- Quality trend (defect rates over time)
- Predictability (commitment vs. delivery ratio)
- Action follow-through (retro items resolved vs. still open)

---

## Responsible AI -- Built In, Not Bolted On

This wasn't an afterthought. Every AI decision in the system has:

### Transparency

```javascript
const aiResult = {
  decision: "Sprint Needs Follow-up",
  confidence: 72,
  dataSources: ["RuleEngine", "FoundryLocal", "AzureLLM", "RAG"],
  requiresValidation: true
};
```

Every output explicitly lists which systems contributed to the decision. Confidence scores are bounded 0-100 with automatic clamping.

### Safety

```javascript
export function sanitizeInput(req, _res, next) {
  if (req.body && typeof req.body === "object") {
    req.body = sanitizeValue(req.body);
  }
  next();
}
```

All API inputs are sanitized (HTML stripping, `javascript:` URI removal, event handler removal). Rate limiting at 60 req/min per IP. RBAC with `public`/`supervisor`/`admin` roles.

### Accountability

- Per-agent audit logs (`data/*-audit.json`) with timestamps, event types, inputs, outputs
- Responsible AI Dashboard in the orchestrator UI showing aggregated audit events, validation flags, and data source distribution
- **Offline Mode:** A single toggle runs the entire system on Foundry Local + Ollama. Zero data leaves the machine. Critical for enterprises handling sensitive sprint data.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20+, ES Modules, Express.js |
| LLM (Cloud) | Azure OpenAI GPT-4o via @langchain/openai |
| LLM (Local) | Microsoft Foundry Local (phi model) |
| Embeddings | Ollama nomic-embed-text for RAG vectors |
| RAG | LangChain.js MemoryVectorStore + dual retrieval |
| Protocol | MCP (Model Context Protocol) via @modelcontextprotocol/sdk |
| Frontend | React 18 (CDN, no build step) + Chart.js |
| Validation | AJV JSON Schema |
| Integrations | JIRA Cloud REST, GitHub REST, Microsoft Graph |
| Deploy | Azure Developer CLI (azd) + Azure Container Apps + Bicep IaC |
| CI | GitHub Actions (Node 20+22 matrix, npm test + audit) |

---

## How to Run It

```bash
git clone https://github.com/snehasankaran/agile-sprint-orchestrator.git
cd agile-sprint-orchestrator
npm install
cp .env.example .env   # Add your API keys

# Start all agents (5 terminals)
node backlog_agent_final.js       # Port 3000
node sprint_planning_agent.js     # Port 3020
node iterative_standup_agent.js   # Port 4040
node review_agent.js              # Port 5050
node orchestrator.js              # Port 6060
```

Open `http://localhost:6060` for the orchestrator dashboard. Click **Run Full Cycle** to execute all 7 phases.

For corporate proxy environments:
```bash
$env:NO_PROXY = "localhost,127.0.0.1"
node --use-env-proxy orchestrator.js
```

---

## MCP Integration

The system exposes 11 tools via Model Context Protocol, making all agent capabilities accessible from VS Code, GitHub Copilot, or Claude Desktop:

```json
{
  "mcpServers": {
    "agile-sprint-orchestrator": {
      "command": "node",
      "args": ["mcp_server.js"]
    }
  }
}
```

Available tools: `refine_backlog`, `plan_sprint`, `run_standup`, `review_sprint`, `run_full_cycle`, `get_intelligence_report`, `get_sprint_health`, `get_velocity`, `run_retro`, `get_manager_evaluation`, `get_sprint_context`.

---

## Five Dashboards, One Design System

All five dashboards share a unified dark theme with consistent typography, card layouts, stat badges, and color palette:

| Dashboard | Port | Key Features |
|-----------|------|-------------|
| Orchestrator | 6060 | Full pipeline, phase results, daily health, sprint context, intelligence report, AI manager, RAI dashboard, event log |
| Backlog | 3000 | Ticket editor, schema validation, AI insights, story points, dependency tags |
| Sprint Planning | 3020 | Capacity config, ticket recommendation, AI assignment, JIRA push |
| Iterative Dev | 4040 | Work product eval, PR analysis, standup processing, burndown chart |
| Review | 5050 | 3-layer ticket evaluation, stakeholder feedback, retro, velocity charts |

---

## What We Learned (Honest Takeaways)

**What worked well:**

- **Rule engine + LLM hybrid** was the right call. Pass/fail decisions on acceptance criteria should never depend on LLM opinion alone. The rule engine provides deterministic baselines; the LLM adds nuance and recommendations.
- **Cross-sprint memory** is the differentiator. Most tools treat each sprint as isolated. Persisting velocity, patterns, and action items across sprints creates compounding intelligence.
- **SSE for real-time streaming** made the orchestrator dashboard feel alive. Watching each phase execute in real-time is more convincing than a loading spinner followed by results.

**What was harder than expected:**

- **Proxy handling in corporate environments.** `--use-env-proxy` routes localhost calls through the proxy unless you set `NO_PROXY`. This caused "fetch failed" errors between agents that took significant debugging.
- **JavaScript falsy values.** A `testFailureRatePercent` of `0` (perfect) evaluated as falsy, causing `0 || 100` to become `100`. One character fix (`||` to `??`) solved a system-wide 0% completion bug. Always use nullish coalescing for numeric values.
- **Data file paths after restructuring.** Moving runtime JSON files to a `data/` folder required updating ~30 path references across 5 agents. Missing even one caused silent failures.

**What we'd do differently:**

- Add WebSocket for bidirectional communication instead of one-way SSE
- Implement a proper event bus (Redis/NATS) instead of in-memory EventEmitter for production scale
- Add end-to-end integration tests that spin up all 5 agents

---

## AI-Powered Builder Note

This project was built with significant assistance from AI tools:

- **Cursor (Claude)** was used throughout for architecture decisions, code generation, debugging, and documentation. The conversation spanned agent design, orchestrator logic, theme unification, secrets cleanup, and folder restructuring.
- **Prompt strategy:** We started with high-level intent ("build a sprint review agent") and iteratively refined through specific requests ("add velocity tracking," "unify the dark theme," "remove hardcoded secrets"). Breaking complex tasks into focused prompts produced better results than single large prompts.
- **Key debugging with AI:** The 0% completion bug (falsy value), proxy configuration issues, and cross-sprint memory parsing were all diagnosed through iterative AI-assisted debugging.

---

## Links

- **GitHub:** [snehasankaran/agile-sprint-orchestrator](https://github.com/snehasankaran/agile-sprint-orchestrator)
- **Video Demo:** *(add YouTube/Vimeo link)*

---

*Built for the JavaScript AI Build-a-thon Hack 2026 -- Agents for Impact*
