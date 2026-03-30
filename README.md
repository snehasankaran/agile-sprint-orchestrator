# Agile Sprint Orchestrator

**The Intelligence Layer That Runs Your Sprint**
A Multi-Agent System for Autonomous Agile Lifecycle Management powered by RAG, Local Inference, and MCP.

## Overview
Agile Sprint Orchestrator transforms the manual Agile lifecycle into an intelligent, automated system. It uses a multi-agent architecture to evaluate tickets, assign work, detect risks, generate insights, and maintain cross-sprint memory—eliminating scope creep, over-commitment, and manual tracking.

## Multi-Agent Architecture
The system operates via four specialized agents, coordinated by a central Orchestrator through a 7-phase pipeline (`Backlog -> Planning -> Development -> Review -> Retro -> Velocity -> Intelligence`).

* **Refinement Agent (Backlog Quality Gate):** Validates JIRA tickets against JSON schema, estimates story points via historical similarity, and flags dependencies/risks.
* **Planning Agent (Capacity Intelligence):** Applies capacity constraints and uses Azure OpenAI + RAG to match tickets to developers based on skill, availability, and historical velocity.
* **Development Agent (In-Sprint Monitor):** Evaluates GitHub PRs against Acceptance Criteria (AC), analyzes Teams standups, and tracks real-time sprint health (burndown, at-risk tickets).
* **Review Agent (Evidence-Based Closure):** Replaces subjective reviews with a 3-layer check (Rule Engine -> Local AI -> Cloud LLM) to verify AC completion. Generates data-driven retrospectives.
* **The Orchestrator:** Sequences phases, manages shared state and cross-sprint memory, and streams events in real-time via SSE.

## Key Features & Responsible AI
* **Responsible AI (RAI):** Features explicit `dataSources` tracking, human-in-the-loop validation (`requiresValidation: true`), output sanitization, RBAC, and comprehensive audit logs.
* **Offline Mode:** Privacy-first fallback running entirely on local models (Microsoft Foundry Local + Ollama).
* **Cross-Sprint Memory:** Remembers recurring retrospective patterns, velocity trends, and estimation drift across past sprints.
* **MCP Integration:** 11 built-in tools expose platform capabilities directly to IDEs (Copilot/Claude Desktop).
* **Cross-Phase Intelligence:** Detects correlations: overcommitment in planning leads to spillover in review leads to recurring retro patterns. Connects dots no human tracks.
* **Action Recommendations :** Reduce next sprint capacity by 15% based on 3-sprint overcommitment trend." Concrete, actionable, evidence-backed.
* **Feedback Loop :** Injects historical learnings into new sprint planning. Unresolved retro actions. Recurring risks. Velocity-adjusted capacity.
* **Daily Health Check:** Real-time sprint status with burndown pace, risk detection, spillover prediction, and AI summary.
* **Sprint Intelligence Report:** End-of-sprint AI analysis of risks, dependencies, and strategic suggestions for PO and SM.
* **AI Manager Evaluation:** Cross-sprint team performance: velocity trend, quality trend, predictability, action follow-through. |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Core** | Node.js 20+, ES Modules, Express.js |
| **AI Models** | Azure OpenAI GPT-4o, Microsoft Foundry Local (phi) |
| **RAG / Vectors** | LangChain.js, Ollama (`nomic-embed-text`) |
| **Integrations** | Model Context Protocol (MCP), JIRA Cloud, GitHub, Graph API |
| **Frontend** | React 18, Chart.js, Unified Dark Theme CSS |
| **Deployment** | Azure Container Apps, azd, Bicep IaC, GitHub Actions |

## Quick Start

### Prerequisites
* Node.js 20+
* Foundry Local CLI (`phi` model) & Ollama (`nomic-embed-text`)
* Azure OpenAI endpoint/key
* JIRA Cloud API token (optional)

### Setup & Run
```bash
# 1. Install dependencies
npm install

# 2. Configure environment variables
cp .env.example .env   # Add your API keys here!

# 3. Start the system (requires 5 terminal windows)
npm run backlog        # Port 3000: Backlog Agent
npm run sprint         # Port 3020: Planning Agent
npm run iterative      # Port 4040: Dev/Standup Agent
npm run review         # Port 5050: Review Agent
npm run orchestrator   # Port 6060: Central Orchestrator Dashboard
```

### IDE Integration (MCP Server)
Add the following to your MCP client config to expose orchestrator tools to your IDE:
```json
{
  "mcpServers": {
    "agile-sprint-orchestrator": {
      "command": "node",
      "args": ["mcp_server.js"],
      "cwd": "/absolute/path/to/agile"
    }
  }
}
```

### Deployment (Azure)
```bash
azd auth login
azd up
```

## Project Structure
```text
agile/
├── orchestrator.js              # Central orchestrator (Port 6060)
├── backlog_agent_final.js       # Backlog refinement agent (Port 3000)
├── sprint_planning_agent.js     # Sprint planning agent (Port 3020)
├── iterative_standup_agent.js   # Dev + standup agent (Port 4040)
├── review_agent.js              # Review + retro + velocity (Port 5050)
├── mcp_server.js                # 11 MCP tools via stdio
├── middleware.js                # Security: Rate limiting, sanitization, RBAC
├── data/                        # Runtime data (state, memory, audit logs)
├── public-*/                    # React Frontends for each agent/dashboard
├── infra/                       # Azure Bicep templates
├── test/                        # Unit/Integration tests
├── azure.yaml / Dockerfile      # Deployment configs
└── .env.example                 # Env template
```

---

**License:** MIT
