# Agile Sprint Orchestrator -- Agents for Impact

### Tagline

The Intelligence Layer That Runs Your Sprint | A Multi-Agent System for Autonomous Agile Lifecycle Management | From Scattered Rituals to Data-Driven Sprint Execution

### Keywords

Multi-Agent Systems, Agentic Architecture, Sprint Intelligence, RAG, Local Inference, MCP, Responsible AI, Decision Automation

---

## Agile Sprint Orchestrator -- Autonomous AI Sprint Engine for Agile Teams

In every Agile team, the same story plays out. Sprints start with optimistic planning, standups become status updates nobody acts on, reviews are a demo walkthrough instead of an evaluation, and retros produce the same three sticky notes every two weeks. The data to make better decisions exists -- scattered across JIRA tickets, GitHub PRs, Teams transcripts, and human memory -- but nobody connects it.

**Agile Sprint Orchestrator eliminates this friction by transforming the sprint lifecycle into an intelligent, automated system.**

Agile Sprint Orchestrator is an AI-powered sprint intelligence platform where every Agile ceremony -- from backlog refinement to retrospective -- is handled by a multi-agent autonomous engine. Instead of stopping at dashboards and reports, the platform actively evaluates tickets, assigns work, detects risks, generates insights, and learns across sprints on behalf of the entire Scrum team -- structured, evidence-based, and fully transparent.

---

## The Problem No Tool Has Solved

Billions of engineering hours flow through Agile sprints every year -- yet the process behind every sprint decision is still manual, fragmented, and inefficient.

| What Happens Today | The Cost |
|-------------------|----------|
| Backlog items enter sprints without validation, missing acceptance criteria, no estimates, no dependency mapping | Rework. Scope creep. Failed sprints. |
| Sprint planning is based on gut feel. Teams over-commit every sprint because nobody tracks actual capacity vs. historical velocity | 30-40% spillover rates. The same tickets carry over sprint after sprint. |
| During the sprint, work product quality is invisible until the review. PRs merge without checking acceptance criteria. | Defects discovered at sprint review, not during development. |
| Sprint reviews are a walkthrough, not an evaluation. Nobody knows which tickets truly met acceptance criteria. | Stakeholders lose trust. "Done" doesn't mean "done right." |
| Retrospectives produce the same insights every time. Action items are never tracked. Patterns repeat. | Teams don't improve. The same mistakes recur for months. |
| Each sprint starts from zero. Nobody remembers what happened three sprints ago. | No organizational learning. No compounding intelligence. |

**Agile Sprint Orchestrator doesn't just visualize this problem. It solves it.**

---

## Multi-Agent AI Architecture

At the core of Agile Sprint Orchestrator is a multi-agent system designed to mirror the real-world Agile lifecycle. Each agent has a distinct role, a distinct responsibility, and a distinct AI stack:

### The Refinement Agent -- Backlog Quality Gate

Ensures no poorly defined ticket enters the sprint. Fetches tickets from JIRA Cloud, validates every item against JSON schema (AJV), estimates story points using historical similarity, detects dependencies through keyword analysis, and flags risk signals.

**Outcome for PO:** A refined backlog with validated, estimated tickets. No more "this story has no acceptance criteria" surprises mid-sprint.

**Outcome for Team:** Clear acceptance criteria and AI-suggested story points to anchor planning poker discussions.

### The Planning Agent -- Capacity Intelligence

Prevents over-commitment before it happens. Loads refined backlog, applies capacity constraints, and uses Azure OpenAI + RAG to match tickets to team members by skill and availability. If previous sprints show overcommitment, the system automatically reduces suggested capacity.

**Outcome for SM:** Data-driven sprint scope that respects actual team capacity. AI-suggested assignments with rationale. Historical velocity guard rails.

**Outcome for PO:** No more "we committed to 40 points but only delivered 25."

### The Development Agent -- In-Sprint Quality Monitor

Makes work product quality visible during the sprint, not after. Evaluates GitHub PRs against acceptance criteria using AI + rule engine, runs simulated daily standups from Teams transcripts, and computes real-time sprint health: burndown pace, at-risk tickets, completion likelihood.

**Outcome for SM:** Automated blocker detection from standups. Early warning when burndown deviates from plan. Days of advance notice, not zero.

**Outcome for Team:** Immediate feedback on PR quality vs. acceptance criteria. Know if your work will pass review before submitting.

### The Review Agent -- Evidence-Based Sprint Closure

Replaces subjective reviews with a 3-layer evaluation pipeline:

- **Layer 1 -- Rule Engine:** Deterministic check of acceptance criteria coverage (%) and test failure rate (%)
- **Layer 2 -- Foundry Local:** On-device AI extraction of tasks, blockers, and gaps
- **Layer 3 -- Azure OpenAI:** LLM-powered decision with confidence scoring

Also generates AI-driven retrospectives with recurring pattern detection, tracks velocity sprint-over-sprint, and analyzes stakeholder feedback from Teams transcripts.

**Outcome for PO:** "5/8 tickets completed correctly (62.5%), 2 need rework, 1 spillover" -- with per-ticket evidence.

**Outcome for SM:** Retrospective patterns tracked across sprints. Action items that persist. Velocity trends showing improvement or decline.

---

## The Orchestrator -- The System That Connects the Dots

These agents don't operate in isolation. They are coordinated by a central orchestrator that runs a 7-phase pipeline:

```
Backlog --> Planning --> Development --> Review --> Retro --> Velocity --> Intelligence
```

Each phase calls the appropriate agent, passes results to the next phase through shared state, and streams events to the dashboard in real-time via SSE.

But the orchestrator does more than sequence phases. It thinks across them:

| Intelligence Feature | What It Does |
|---------------------|-------------|
| **Cross-Phase Intelligence** | Detects correlations: overcommitment in planning leads to spillover in review leads to recurring retro patterns. Connects dots no human tracks. |
| **Action Recommendations** | "Reduce next sprint capacity by 15% based on 3-sprint overcommitment trend." Concrete, actionable, evidence-backed. |
| **Feedback Loop** | Injects historical learnings into new sprint planning. Unresolved retro actions. Recurring risks. Velocity-adjusted capacity. |
| **Daily Health Check** | Real-time sprint status with burndown pace, risk detection, spillover prediction, and AI summary. |
| **Sprint Intelligence Report** | End-of-sprint AI analysis of risks, dependencies, and strategic suggestions for PO and SM. |
| **AI Manager Evaluation** | Cross-sprint team performance: velocity trend, quality trend, predictability, action follow-through. |
| **Cross-Sprint Memory** | Remembers what happened 5, 10, 20 sprints ago. Patterns, metrics, action items. The team's institutional memory. |

---

## Responsible AI -- Not a Checkbox

### Transparency

- **`dataSources`** on every AI output -- explicitly lists which systems contributed (e.g., `["RuleEngine", "FoundryLocal", "RAG", "AzureLLM"]`)
- **`requiresValidation: true`** flag on all AI decisions indicating human review is needed
- **`confidence`** scores bounded 0-100 with automatic clamping for out-of-range LLM outputs

### Safety

- **`validateLLMOutput()`** -- Checks JSON structure, required fields, confidence bounds, unexpected decision values, and PII patterns (SSN, email)
- **Input Sanitization** -- Strips HTML tags, `javascript:` URIs, event handlers from all API inputs
- **Rate Limiting** -- 60 requests/minute per IP via express-rate-limit
- **RBAC** -- `x-role` header: `public` (read-only) vs `supervisor` (write/action) vs `admin`

### Accountability

- **Audit Trail** -- Every AI operation logged to per-agent JSONL files with timestamps, event types, inputs, and outputs
- **Responsible AI Dashboard** -- Aggregated view of audit events, data source distribution, validation warnings across all agents
- **Offline Mode** -- Privacy-first toggle that runs entirely on Foundry Local + Ollama. Zero data leaves the machine.
- **Graceful Degradation** -- If cloud AI is unavailable, system continues with local models + rule engine. Never fails silently.

---

## What Works Today

- Backlog items are fetched from JIRA, validated against schema, estimated with historical similarity, and dependency-mapped
- Sprint planning recommends tickets within capacity constraints, assigns to team members with AI rationale, and integrates historical velocity feedback
- Work products are evaluated against acceptance criteria during the sprint with per-ticket health scoring
- Sprint review evaluates every ticket through a 3-layer AI pipeline and produces evidence-based pass/fail decisions
- AI-generated retrospectives detect recurring patterns across sprints and track action items
- Velocity analytics with burndown charts, completion trends, and CSV export
- Full cycle orchestration sequences all 7 phases with real-time SSE streaming
- Cross-phase intelligence detects overcommitment, quality cascades, estimation drift, and recurring retro patterns
- Action recommendations generate concrete suggestions backed by sprint data
- Feedback loop injects previous sprint learnings into new sprint planning
- Daily health check provides real-time sprint status with risk predictions
- Sprint intelligence report provides end-of-sprint strategic analysis
- AI Manager evaluates team performance across sprints
- Cross-sprint memory persists metrics, patterns, and action items
- 11 MCP tools expose all capabilities to IDE/Copilot/Claude Desktop
- Offline mode runs the entire system on local models with zero cloud dependency
- 5 interactive dashboards with unified dark theme design system
- Deployed to Azure Container Apps via `azd up`

---

## Five Interactive Dashboards

| Dashboard | Port | What It Shows |
|-----------|------|---------------|
| **Orchestrator** | 6060 | Full sprint pipeline, phase status, stat cards, event log, config panel, daily health, sprint context, intelligence report, AI manager, RAI dashboard |
| **Backlog Agent** | 3000 | Ticket editor, schema validation, AI insights with story point estimates, dependency detection, risk signals |
| **Sprint Planning** | 3020 | Capacity configuration, ticket recommendation, AI-powered assignment with rationale, JIRA push |
| **Iterative Dev** | 4040 | Work product evaluation, PR analysis, standup simulation, sprint health with burndown and at-risk tickets |
| **Sprint Review** | 5050 | Per-ticket 3-layer evaluation, stakeholder feedback, retrospective, velocity charts with burndown |

All five dashboards share a unified dark theme design system with consistent typography, color palette, badges, stat cards, and result tables.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Node.js 20+, ES Modules, Express.js |
| **LLM (Cloud)** | Azure OpenAI GPT-4o via @langchain/openai |
| **LLM (Local)** | Microsoft Foundry Local (phi model) |
| **Embeddings** | Ollama nomic-embed-text for RAG vectors |
| **RAG** | LangChain.js MemoryVectorStore + dual retrieval |
| **Protocol** | MCP (Model Context Protocol) via @modelcontextprotocol/sdk |
| **Frontend** | React 18 (CDN, no build step) + Chart.js |
| **Validation** | AJV JSON Schema |
| **Integrations** | JIRA Cloud REST, GitHub REST, Microsoft Graph |
| **Deploy** | Azure Developer CLI (azd) + Azure Container Apps + Bicep IaC |
| **CI** | GitHub Actions (Node 20+22 matrix, npm test + audit) |
| **Tests** | 24+ unit/integration tests via node:test |

---

## Quest Mapping

| Quest | Technology | Implementation |
|-------|-----------|----------------|
| **Quest 1: Foundry Local** | On-device AI inference | Foundry Local (phi model) for extraction in all agents; Ollama embeddings for RAG; full offline mode |
| **Quest 3: RAG** | Retrieval-augmented generation | MemoryVectorStore with Ollama embeddings across all agents for context-aware decisions |
| **Quest 4: AI Toolkit / MCP** | Agent builder + MCP tools | `mcp_server.js` exposes 11 tools via MCP stdio for IDE/Copilot integration |
| **Quest 5: E2E Agent System** | Multi-agent orchestration | 4 agents + orchestrator with shared state, memory, SSE, retry/circuit breaker |

---

## Quick Start

### Prerequisites

- Node.js 20+
- Foundry Local CLI with `phi` model
- Ollama running with `nomic-embed-text`
- Azure OpenAI endpoint and API key
- JIRA Cloud API token (optional)

### Setup

```bash
npm install
cp .env.example .env   # Edit with your API keys

# Start all agents (5 terminals)
npm run backlog        # Port 3000
npm run sprint         # Port 3020
npm run iterative      # Port 4040
npm run review         # Port 5050
npm run orchestrator   # Port 6060
```

### MCP Server

```json
{
  "mcpServers": {
    "agile-sprint-orchestrator": {
      "command": "node",
      "args": ["mcp_server.js"],
      "cwd": "/path/to/agile"
    }
  }
}
```

### Deploy to Azure

```bash
azd auth login
azd up
```

---

## Impact

Agile Sprint Orchestrator transforms sprint execution from:

- **manual** to **autonomous**
- **gut feel** to **data-driven**
- **amnesia** to **cross-sprint memory**
- **reactive** to **predictive**
- **opaque** to **transparent**

It enables faster sprint closure, evidence-based decisions, fair workload distribution, and compounding team intelligence across every sprint.

---

## The Big Idea

Most Agile tools help teams track work.

**Agile Sprint Orchestrator executes the sprint.**

It doesn't generate dashboards. It evaluates every ticket against acceptance criteria. It doesn't suggest capacity. It prevents overcommitment with historical evidence. It doesn't list retro items. It detects patterns that have recurred for months and injects them into the next sprint's planning.

This is not a project management tool.

This is a system that **manufactures sprint intelligence** using AI agents, structured evaluation pipelines, cross-sprint memory, and real-world Agile constraints.

We did not build a dashboard.

**We built an autonomous sprint engine.**

---

## Award Category Fit

### Grand Prize -- $1000

Multi-quest integration (Quests 1, 3, 4, 5) with a cohesive, production-ready platform. Deep AI integration across 4 specialized agents with 3-layer evaluation, cross-sprint memory, intelligence reports, and real-time streaming. Solves a real-world problem every Agile team faces.

### Offline-Ready AI -- $500

Full offline mode using Foundry Local + Ollama for on-device inference. Privacy-first design where zero data leaves the machine. Graceful degradation from cloud to local AI. Rule engine ensures deterministic results even without any AI model.

### Agentic System Architecture -- $500

4 specialized agents orchestrated with shared state, cross-sprint memory, event-driven SSE, retry with exponential backoff, circuit breaker, 11 MCP tools, and comprehensive responsible AI (audit trails, LLM validation, dataSources transparency, PII detection, input sanitization, RBAC, rate limiting).

---

## Project Structure

```
agile/
├── orchestrator.js              # Central orchestrator (port 6060)
├── backlog_agent_final.js       # Backlog refinement agent (port 3000)
├── sprint_planning_agent.js     # Sprint planning agent (port 3020)
├── iterative_standup_agent.js   # Dev + standup agent (port 4040)
├── review_agent.js              # Review + retro + velocity (port 5050)
├── mcp_server.js                # 11 MCP tools via stdio
├── middleware.js                # Rate limiting, sanitization, RBAC
├── data/                        # Runtime data (git-ignored)
│   ├── orchestrator_state.json  #   Shared context between phases
│   ├── orchestrator_memory.json #   Cross-sprint memory
│   ├── *-audit.json             #   Responsible AI audit logs
│   └── ...                      #   Sprint plans, metrics, feedback
├── public-orchestrator/         # Orchestrator dashboard
├── public-review/               # Review agent UI
├── public-iterative/            # Iterative agent UI
├── public/                      # Backlog agent UI
├── public-sprint/               # Planning agent UI
├── test/                        # Unit and integration tests
├── infra/                       # Azure Bicep templates
├── .env.example                 # Environment variable template
├── .gitignore                   # Excludes .env, node_modules, data/
├── azure.yaml                   # azd config
├── Dockerfile                   # Container build
├── mcp.json                     # MCP client config
├── .github/workflows/ci.yml     # CI pipeline
└── package.json
```

> **Note:** Copy `.env.example` to `.env` and fill in your credentials before running. Never commit `.env`.

---

## License

MIT
