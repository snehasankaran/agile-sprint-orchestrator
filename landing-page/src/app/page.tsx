import Architecture from "./Architecture";

const stats = [
  { number: "5", label: "AI Agents" },
  { number: "7", label: "Sprint Phases" },
  { number: "11", label: "MCP Tools" },
  { number: "5", label: "Dashboards" },
];

const painPoints = [
  {
    icon: "📋",
    title: "Backlog Chaos",
    desc: "Tickets enter sprints without acceptance criteria, estimates, or dependency mapping. Teams discover missing requirements mid-sprint.",
    glow: "glow-red",
  },
  {
    icon: "🎯",
    title: "Planning by Gut Feel",
    desc: "Nobody connects actual capacity to historical velocity. Result: 30-40% spillover rates, every sprint.",
    glow: "glow-orange",
  },
  {
    icon: "👻",
    title: "Invisible Quality",
    desc: '"Done" doesn\'t mean "done right." Work product quality is a mystery until the review demo.',
    glow: "glow-purple",
  },
  {
    icon: "🧠",
    title: "Sprint Amnesia",
    desc: "Every sprint starts from zero. The retro insights from three sprints ago? Gone. Same patterns repeat for months.",
    glow: "glow-blue",
  },
];

const agents = [
  {
    title: "Backlog Agent",
    role: "For the Product Owner",
    desc: "Refines raw requirements into sprint-ready tickets. Validates schema, estimates story points, detects dependencies, flags risks.",
    port: "3000",
    color: "text-orange-400",
    border: "border-orange-500/20",
    glow: "glow-orange",
  },
  {
    title: "Planning Agent",
    role: "For the Scrum Master",
    desc: "Builds optimal sprint plans within team capacity. Uses historical velocity + RAG to prevent overcommitment.",
    port: "3020",
    color: "text-blue-400",
    border: "border-blue-500/20",
    glow: "glow-blue",
  },
  {
    title: "Dev + Standup Agent",
    role: "For the Team",
    desc: "Processes standup transcripts, extracts blockers, evaluates work products against acceptance criteria using rule-based evaluation.",
    port: "4040",
    color: "text-green-400",
    border: "border-green-500/20",
    glow: "glow-green",
  },
  {
    title: "Review + Retro Agent",
    role: "For PO and Scrum Master",
    desc: "3-layer evaluation pipeline (Rule Engine + Foundry Local + Azure OpenAI). Data-driven retrospectives with pattern detection.",
    port: "5050",
    color: "text-red-400",
    border: "border-red-500/20",
    glow: "glow-red",
  },
  {
    title: "The Orchestrator",
    role: "The Brain",
    desc: "Coordinates all agents through 7 phases. Maintains cross-sprint memory, detects cross-phase correlations, generates intelligence reports.",
    port: "6060",
    color: "text-purple-400",
    border: "border-purple-500/20",
    glow: "glow-purple",
  },
];

const phases = [
  { name: "Backlog", color: "bg-orange-500/15 border-orange-500/30 text-orange-300" },
  { name: "Planning", color: "bg-blue-500/15 border-blue-500/30 text-blue-300" },
  { name: "Development", color: "bg-green-500/15 border-green-500/30 text-green-300" },
  { name: "Review", color: "bg-red-500/15 border-red-500/30 text-red-300" },
  { name: "Retro", color: "bg-yellow-500/15 border-yellow-500/30 text-yellow-300" },
  { name: "Velocity", color: "bg-cyan-500/15 border-cyan-500/30 text-cyan-300" },
  { name: "Intelligence", color: "bg-purple-500/15 border-purple-500/30 text-purple-300" },
];

const techStack = [
  "Node.js 20+",
  "Express.js",
  "Azure OpenAI GPT-4o",
  "Foundry Local (phi)",
  "Ollama Embeddings",
  "LangChain.js",
  "MCP Protocol",
  "React 18",
  "Chart.js",
  "JIRA Cloud",
  "GitHub REST",
  "MS Graph",
  "Azure Container Apps",
  "Bicep IaC",
];

const raiFeatures = [
  {
    icon: "🔍",
    title: "Transparency",
    desc: "Every output lists its data sources (RuleEngine, FoundryLocal, AzureLLM, RAG) and a confidence score (0-100). Nothing is a black box.",
    glow: "glow-blue",
  },
  {
    icon: "🛡️",
    title: "Safety & Accountability",
    desc: "Input sanitization, rate limiting at 60 req/min, RBAC with 3 roles. Per-agent audit logs. Responsible AI Dashboard.",
    glow: "glow-green",
  },
  {
    icon: "🔒",
    title: "Offline Mode",
    desc: "One toggle switches to Foundry Local + Ollama. Zero data leaves the machine. Critical for sensitive sprint data.",
    glow: "glow-purple",
  },
];

const highlights = [
  { icon: "🎯", title: "Decision Intelligence", desc: "Converts complex sprint data into clear, actionable decisions (risk score, recommendations)" },
  { icon: "🤖", title: "Autonomous Execution", desc: "AI runs all 7 sprint phases end-to-end" },
  { icon: "🧠", title: "Cross-Sprint Memory", desc: "Every sprint learns from the last" },
  { icon: "⚡", title: "Hybrid AI", desc: "Cloud (Azure) + Local (Foundry) in one system" },
  { icon: "🛡️", title: "Responsible AI", desc: "Transparency, auditing, and offline mode built in" },
  { icon: "🔗", title: "MCP Protocol", desc: "11 tools accessible from VS Code, Copilot, Claude" },
];

export default function Home() {
  return (
    <main className="min-h-screen">
      {/* ── HERO ── */}
      <section className="text-center pt-32 pb-24 px-6 relative overflow-hidden">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />

        <div className="relative z-10">
          <p className="text-blue-400 text-sm font-medium tracking-[0.2em] uppercase mb-8">
            JavaScript AI Build-a-thon 2026
          </p>
          <h1 className="text-6xl md:text-8xl font-bold leading-tight max-w-5xl mx-auto">
            <span className="gradient-text">Agile Sprint</span>
            <br />
            <span className="gradient-text">Orchestrator</span>
          </h1>
          <p className="mt-6 text-2xl md:text-3xl text-gray-400 font-light italic">
            We don&apos;t track sprints. We predict and optimize them.
          </p>
          <p className="mt-4 text-lg text-blue-300/80 max-w-3xl mx-auto font-medium">
            Used to simulate, validate, and improve real sprint decisions &mdash; not just generate insights.
          </p>
          <p className="mt-6 text-lg text-gray-500 max-w-3xl mx-auto leading-relaxed">
            An AI system that predicts sprint failure before it happens &mdash;
            and autonomously fixes it. Five specialized agents. Seven phases.
            One intelligent pipeline that learns from every sprint.
          </p>
          <div className="mt-10 flex justify-center gap-4 flex-wrap">
            <a
              href="https://github.com/snehasankaran/agile-sprint-orchestrator"
              target="_blank"
              className="btn-primary"
            >
              View on GitHub
            </a>
            <a href="#architecture" className="btn-secondary">
              See Architecture
            </a>
          </div>
        </div>
      </section>

      {/* ── STATS BAR ── */}
      <section className="py-8 px-6 border-y border-white/5">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6">
          {stats.map((s) => (
            <div key={s.label} className="stat-card">
              <div className="stat-number">{s.number}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── THE PAIN ── */}
      <section className="py-28 px-6 max-w-6xl mx-auto">
        <h2 className="text-4xl md:text-5xl font-bold text-center mb-4">
          Sprints Don&apos;t Fail at the End &mdash; They Fail on Day 1
        </h2>
        <p className="text-center text-gray-500 mb-16 max-w-2xl mx-auto text-lg">
          By the time a sprint looks &ldquo;at risk,&rdquo; it&apos;s already
          too late. The data to prevent failure exists &mdash; but nothing
          connects it.
        </p>
        <div className="grid md:grid-cols-2 gap-6">
          {painPoints.map((p) => (
            <div key={p.title} className={`glass-card ${p.glow}`}>
              <div className="text-3xl mb-4">{p.icon}</div>
              <h3 className="text-lg font-semibold text-white mb-2">
                {p.title}
              </h3>
              <p className="text-gray-400 leading-relaxed">{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <hr className="section-divider" />

      {/* ── THE IDEA ── */}
      <section className="py-28 px-6 text-center section-alt">
        <h2 className="text-4xl md:text-5xl font-bold mb-6">The Idea</h2>
        <p className="text-xl text-gray-400 max-w-3xl mx-auto mb-14">
          What if every Agile ceremony had a dedicated AI agent &mdash; and a
          central brain coordinated all of them into a learning system?
        </p>
        <div className="flex flex-wrap justify-center gap-3 max-w-4xl mx-auto">
          {phases.map((step, i) => (
            <div key={step.name} className="flex items-center gap-3">
              <span
                className={`phase-pill border ${step.color}`}
              >
                {step.name}
              </span>
              {i < phases.length - 1 && (
                <span className="text-gray-600 text-lg">&rarr;</span>
              )}
            </div>
          ))}
        </div>
        <p className="mt-10 text-purple-400 font-semibold text-lg">
          Five agents. Seven phases. One intelligent pipeline.
        </p>
        <div className="mt-16 max-w-2xl mx-auto text-left">
          <div className="grid grid-cols-2 gap-0 rounded-xl overflow-hidden border border-white/10">
            <div className="p-4 bg-red-500/10 border-b border-r border-white/10 text-red-400 font-semibold text-sm">Traditional Agile</div>
            <div className="p-4 bg-green-500/10 border-b border-white/10 text-green-400 font-semibold text-sm">This System</div>
            <div className="p-3 border-b border-r border-white/5 text-gray-500 text-sm">Tracks progress</div>
            <div className="p-3 border-b border-white/5 text-gray-300 text-sm">Predicts outcomes</div>
            <div className="p-3 border-b border-r border-white/5 text-gray-500 text-sm">Reacts to issues</div>
            <div className="p-3 border-b border-white/5 text-gray-300 text-sm">Prevents issues</div>
            <div className="p-3 border-b border-r border-white/5 text-gray-500 text-sm">Manual planning</div>
            <div className="p-3 border-b border-white/5 text-gray-300 text-sm">AI-optimized planning</div>
            <div className="p-3 border-r border-white/5 text-gray-500 text-sm">Static velocity</div>
            <div className="p-3 text-gray-300 text-sm">Adaptive learning</div>
          </div>
        </div>
      </section>

      <hr className="section-divider" />

      {/* ── ARCHITECTURE (interactive) ── */}
      <Architecture />

      <hr className="section-divider" />

      {/* ── AGENTS ── */}
      <section className="py-28 px-6 section-alt">
        <h2 className="text-4xl md:text-5xl font-bold text-center mb-4">
          What Each Agent Does
        </h2>
        <p className="text-center text-gray-500 mb-16 max-w-2xl mx-auto text-lg">
          Each agent is an independent service with its own API, dashboard, and
          specialized intelligence.
        </p>
        <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {agents.map((a) => (
            <div
              key={a.title}
              className={`glass-card ${a.glow} border ${a.border}`}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className={`text-lg font-semibold ${a.color}`}>
                  {a.title}
                </h3>
                <span className="text-xs font-mono text-gray-600 bg-white/5 px-2.5 py-1 rounded-full">
                  :{a.port}
                </span>
              </div>
              <p className="text-sm text-gray-500 mb-3 font-medium">
                {a.role}
              </p>
              <p className="text-gray-400 text-sm leading-relaxed">{a.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <hr className="section-divider" />

      {/* ── DIFFERENTIATOR ── */}
      <section className="py-28 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold mb-8">
            Sprints That Learn
          </h2>
          <p className="text-gray-400 leading-relaxed text-lg mb-10">
            Most tools treat each sprint as isolated. We don&apos;t. After every
            cycle, the orchestrator persists what happened &mdash; which tickets
            spilled over, which retro items were never addressed, how estimates
            compared to actuals. The next sprint automatically consumes this
            context.
          </p>
          <div className="p-10 rounded-2xl bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-purple-500/20 relative overflow-hidden">
            <div className="orb" style={{ width: 300, height: 300, background: '#8b5cf6', top: -100, right: -100, position: 'absolute', opacity: 0.08, filter: 'blur(60px)' }} />
            <p className="text-purple-300 text-xl leading-relaxed italic relative z-10">
              &ldquo;After 3 cycles, the system suggested reducing capacity by
              15% because historical data showed consistent overcommitment. No
              human asked for this. The memory surfaced it automatically.&rdquo;
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-4 mt-8">
            {[
              "Overcommitment correlating with spillover",
              "Recurring retro patterns never addressed",
              "Estimation drift on certain ticket types",
            ].map((item) => (
              <div
                key={item}
                className="glass-card glow-purple text-sm text-gray-400"
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <hr className="section-divider" />

      {/* ── MOMENT IT CLICKED ── */}
      <section className="py-28 px-6 section-alt">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold mb-8">
            The Moment It Clicked
          </h2>
          <p className="text-gray-400 leading-relaxed text-lg mb-6">
            During testing, the system flagged a sprint as &ldquo;high
            risk&rdquo; &mdash; before it even started.
          </p>
          <p className="text-gray-400 leading-relaxed text-lg mb-6">
            No bugs. No blockers. Just one silently overloaded developer.
          </p>
          <p className="text-gray-400 leading-relaxed text-lg mb-6">
            We redistributed work. The prediction changed.
          </p>
          <div className="p-8 rounded-2xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20 mt-10">
            <p className="text-blue-300 text-xl leading-relaxed italic">
              That&apos;s when it became clear: this isn&apos;t automation.
              This is <strong className="text-white">decision intelligence</strong>.
            </p>
          </div>
          <p className="text-gray-500 text-lg mt-8 font-medium">
            Not tracking work &mdash; <strong className="text-white">deciding outcomes.</strong>
          </p>
        </div>
      </section>

      <hr className="section-divider" />

      {/* ── SPRINT RISK INTELLIGENCE ── */}
      <section className="py-28 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Sprint Risk Intelligence
          </h2>
          <p className="text-gray-400 text-lg mb-10">
            Before execution begins, the system generates a <strong className="text-white">Sprint Risk Score (0&ndash;100)</strong> &mdash; converting complex sprint signals into a single, actionable decision.
          </p>
          <div className="p-8 rounded-2xl bg-gradient-to-br from-red-500/10 to-orange-500/10 border border-red-500/20">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-2xl bg-red-500/20 flex items-center justify-center text-3xl">
                🚨
              </div>
              <div>
                <p className="text-red-400 text-2xl font-bold">Risk Score: 72</p>
                <p className="text-gray-500 text-sm">HIGH &mdash; Sprint needs intervention</p>
              </div>
            </div>
            <div className="grid md:grid-cols-3 gap-4 mb-6">
              {[
                { label: "Developer overload", value: "150%", color: "text-red-400" },
                { label: "Unresolved dependencies", value: "3", color: "text-orange-400" },
                { label: "Spillover trend", value: "+25%", color: "text-yellow-400" },
              ].map((f) => (
                <div key={f.label} className="bg-white/5 rounded-xl p-4 border border-white/5">
                  <p className={`text-xl font-bold ${f.color}`}>{f.value}</p>
                  <p className="text-gray-500 text-sm mt-1">{f.label}</p>
                </div>
              ))}
            </div>
            <div className="bg-white/5 rounded-xl p-4 border border-white/5">
              <p className="text-sm text-gray-500 mb-1">Recommendation</p>
              <p className="text-gray-300">Reduce scope by 20% or rebalance workload across team members.</p>
            </div>
          </div>
          <p className="text-center text-gray-500 mt-8 text-lg italic">
            &ldquo;Is this sprint going to fail &mdash; before it even starts?&rdquo;
          </p>
        </div>
      </section>

      <hr className="section-divider" />

      {/* ── RESPONSIBLE AI ── */}
      <section className="py-28 px-6">
        <h2 className="text-4xl md:text-5xl font-bold text-center mb-4">
          Responsible AI
        </h2>
        <p className="text-center text-gray-500 mb-16 max-w-2xl mx-auto text-lg">
          Built in, not bolted on. Every AI decision is transparent, safe, and
          auditable.
        </p>
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {raiFeatures.map((f) => (
            <div key={f.title} className={`glass-card ${f.glow}`}>
              <div className="text-3xl mb-4">{f.icon}</div>
              <h3 className="text-lg font-semibold text-white mb-3">
                {f.title}
              </h3>
              <p className="text-gray-400 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <hr className="section-divider" />

      {/* ── TECH STACK ── */}
      <section className="py-28 px-6 text-center section-alt">
        <h2 className="text-4xl md:text-5xl font-bold mb-14">Tech Stack</h2>
        <div className="flex flex-wrap justify-center gap-3 max-w-4xl mx-auto">
          {techStack.map((t) => (
            <span
              key={t}
              className="px-5 py-2.5 bg-white/5 border border-white/10 rounded-full text-sm text-gray-300 hover:bg-white/10 hover:border-white/20 transition-all cursor-default"
            >
              {t}
            </span>
          ))}
        </div>
      </section>

      <hr className="section-divider" />

      {/* ── TRY IT ── */}
      <section className="py-28 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-14">
            Try It Yourself
          </h2>
          <div className="code-block">
            <p className="text-green-400">
              {"git clone https://github.com/snehasankaran/agile-sprint-orchestrator.git"}
            </p>
            <p className="text-green-400">{"cd agile-sprint-orchestrator"}</p>
            <p className="text-green-400">{"npm install"}</p>
            <p className="text-green-400">
              {"cp .env.example .env   "}
              <span className="text-gray-600">{"# Add your API keys"}</span>
            </p>
            <br />
            <p className="text-gray-600">{"# Start all 5 services"}</p>
            <p className="text-gray-300">
              {"node backlog_agent_final.js       "}
              <span className="text-gray-600">{"# :3000"}</span>
            </p>
            <p className="text-gray-300">
              {"node sprint_planning_agent.js     "}
              <span className="text-gray-600">{"# :3020"}</span>
            </p>
            <p className="text-gray-300">
              {"node iterative_standup_agent.js   "}
              <span className="text-gray-600">{"# :4040"}</span>
            </p>
            <p className="text-gray-300">
              {"node review_agent.js              "}
              <span className="text-gray-600">{"# :5050"}</span>
            </p>
            <p className="text-gray-300">
              {"node orchestrator.js              "}
              <span className="text-gray-600">{"# :6060"}</span>
            </p>
          </div>
          <p className="text-center text-gray-500 mt-8 text-lg">
            Open{" "}
            <code className="text-blue-400 bg-white/5 px-2.5 py-1 rounded">
              http://localhost:6060
            </code>{" "}
            and click <strong className="text-white">Run Full Cycle</strong>.
          </p>
        </div>
      </section>

      <hr className="section-divider" />

      {/* ── WHY THIS STANDS OUT ── */}
      <section className="py-28 px-6 section-alt">
        <h2 className="text-4xl md:text-5xl font-bold text-center mb-16">
          Why This Stands Out
        </h2>
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {highlights.map((h) => (
            <div key={h.title} className="glass-card glow-blue text-center">
              <div className="text-4xl mb-4">{h.icon}</div>
              <h3 className="text-lg font-semibold text-white mb-2">
                {h.title}
              </h3>
              <p className="text-gray-400 text-sm">{h.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <hr className="section-divider" />

      {/* ── ACTION CAPABILITIES ── */}
      <section className="py-28 px-6">
        <h2 className="text-4xl md:text-5xl font-bold text-center mb-4">
          Action Capabilities
        </h2>
        <p className="text-center text-gray-500 mb-14 max-w-2xl mx-auto text-lg">
          Not just analysis &mdash; our agents take real action on external systems.
        </p>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {[
            { icon: "\u{1F4E4}", title: "Push to JIRA", desc: "Refined backlog tickets and sprint plans are pushed directly to your JIRA board via REST API." },
            { icon: "\u{1F4E5}", title: "Fetch from JIRA", desc: "Live board, sprint, and ticket data pulled in real-time for planning and review." },
            { icon: "\u{1F4DD}", title: "MS Teams Transcript Parsing", desc: "Standup insights extracted from Microsoft Teams meeting transcripts via Graph API." },
            { icon: "\u{1F4CA}", title: "Monte Carlo Prediction", desc: "10,000-iteration simulation forecasts sprint completion probability from historical velocity." },
            { icon: "\u{1F9E0}", title: "Cross-Sprint Memory", desc: "Retro actions and patterns persist across sprints and auto-feed into next planning cycle." },
            { icon: "\u{1F6E1}\uFE0F", title: "Responsible AI Guardrails", desc: "Every LLM output is validated, PII-scanned, confidence-scored, and audit-logged." },
          ].map((cap) => (
            <div key={cap.title} className="glass-card glow-purple">
              <div className="text-3xl mb-3">{cap.icon}</div>
              <h3 className="text-lg font-semibold text-white mb-2">{cap.title}</h3>
              <p className="text-gray-400 text-sm">{cap.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <hr className="section-divider" />

      {/* ── QUESTS USED ── */}
      <section className="py-28 px-6 section-alt">
        <h2 className="text-4xl md:text-5xl font-bold text-center mb-16">
          Quests Integrated
        </h2>
        <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {[
            { title: "Azure OpenAI (GPT-4o)", desc: "LLM-powered evaluation, sprint planning, and intelligence reports via LangChain.js" },
            { title: "Foundry Local (phi model)", desc: "On-device AI for privacy-first ticket extraction and analysis. Zero data leaves the machine." },
            { title: "Ollama Embeddings", desc: "RAG vector store (nomic-embed-text) for context-aware decisions using historical sprint data" },
            { title: "MCP Server", desc: "11 tools exposed via Model Context Protocol for VS Code, GitHub Copilot, and Claude Desktop" },
            { title: "Azure Developer CLI + Bicep", desc: "Infrastructure-as-code deployment to Azure Container Apps with azd" },
            { title: "GitHub + MS Graph APIs", desc: "Work product fetching from GitHub, Teams transcript ingestion via Microsoft Graph" },
          ].map((q) => (
            <div key={q.title} className="glass-card glow-blue">
              <h3 className="text-lg font-semibold text-blue-400 mb-2">{q.title}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{q.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <hr className="section-divider" />

      {/* ── BUILT WITH AI ── */}
      <section className="py-28 px-6 section-alt">
        <h2 className="text-4xl md:text-5xl font-bold text-center mb-4">
          Built With AI
        </h2>
        <p className="text-center text-gray-500 mb-14 max-w-2xl mx-auto text-lg">
          Real prompts. Real workflows. Here&apos;s how we actually built this with Cursor (Claude).
        </p>
        <div className="max-w-4xl mx-auto space-y-6">
          {[
            {
              label: "Architecture decision",
              prompt: "You're comparing HTTP Orchestrator vs LangGraph. What do you recommend?",
              result: "AI recommended enhancing the existing HTTP orchestrator instead of rewriting -- saving days of work.",
            },
            {
              label: "Feature addition",
              prompt: "Add intelligence report feature, retry, memory enhancements, AI Manager",
              result: "AI broke this into 4 tasks and implemented each with retry logic, circuit breakers, and cross-sprint memory.",
            },
            {
              label: "Bug diagnosis",
              prompt: "Can we have all use cases why is it 0 completion. Realistic data shall help to show the demo",
              result: "AI traced the root cause to a JavaScript falsy-value bug (|| vs ??) and expanded simulated data.",
            },
            {
              label: "UI consistency",
              prompt: "GUI is inconsistent between main GUI and sub agents GUI? Dark theme to match the orchestrator",
              result: "AI systematically updated all 4 agent HTML/CSS and app.js files to match the orchestrator theme.",
            },
            {
              label: "Security cleanup",
              prompt: "Don't store any secrets like tokens, better folder structure",
              result: "AI found hardcoded credentials in 6 files, replaced with env vars, created .env.example and .gitignore.",
            },
          ].map((p) => (
            <div key={p.label} className="glass-card glow-purple">
              <p className="text-purple-400 text-sm font-medium mb-2">{p.label}</p>
              <p className="text-gray-300 italic mb-3">&ldquo;{p.prompt}&rdquo;</p>
              <p className="text-gray-500 text-sm">{p.result}</p>
            </div>
          ))}
        </div>
        <p className="text-center text-gray-500 mt-10 max-w-2xl mx-auto">
          <strong className="text-gray-400">What worked:</strong> Small, focused prompts with clear context.{" "}
          <strong className="text-gray-400">What didn&apos;t:</strong> Large &ldquo;build everything&rdquo; prompts that needed significant rework.
        </p>
      </section>

      <hr className="section-divider" />

      {/* ── FINAL THOUGHT ── */}
      <section className="py-20 px-6 text-center">
        <div className="max-w-3xl mx-auto">
          <p className="text-2xl md:text-3xl text-gray-400 leading-relaxed font-light">
            Most Agile tools tell you what happened.
          </p>
          <p className="text-2xl md:text-3xl text-white leading-relaxed font-semibold mt-4">
            This system tells you what will happen &mdash; and what to do about it.
          </p>
        </div>
      </section>

      <hr className="section-divider" />

      {/* ── CTA ── */}
      <section className="py-36 px-6 text-center relative overflow-hidden">
        <div className="orb orb-2" />
        <div className="orb orb-3" />
        <div className="relative z-10">
          <h2 className="text-4xl md:text-6xl font-bold mb-6">
            Watch It In Action
          </h2>
          <p className="text-gray-500 text-xl mb-12 max-w-2xl mx-auto">
            From backlog to intelligence report &mdash; fully automated, in
            under 5 minutes.
          </p>
          <div className="flex justify-center gap-4 flex-wrap">
            <a
              href="https://github.com/snehasankaran/agile-sprint-orchestrator"
              target="_blank"
              className="btn-secondary"
            >
              GitHub Repository
            </a>
            <a href="https://youtu.be/7eUrJVtNtbQ" target="_blank" className="btn-primary pulse-glow">
              Watch Demo Video
            </a>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="py-10 px-6 text-center border-t border-white/5">
        <p className="text-gray-600 text-sm">
          Built for the JavaScript AI Build-a-thon Hack 2026 &mdash; Agents for
          Impact
        </p>
      </footer>
    </main>
  );
}
