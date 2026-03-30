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
  { icon: "🤖", title: "Autonomous Execution", desc: "AI runs all 7 sprint phases end-to-end" },
  { icon: "🧠", title: "Cross-Sprint Memory", desc: "Every sprint learns from the last" },
  { icon: "⚡", title: "Hybrid AI", desc: "Cloud (Azure) + Local (Foundry) in one system" },
  { icon: "🛡️", title: "Responsible AI", desc: "Transparency, auditing, and offline mode built in" },
  { icon: "🔗", title: "MCP Protocol", desc: "11 tools accessible from VS Code, Copilot, Claude" },
  { icon: "📊", title: "5 Live Dashboards", desc: "Real-time UI for every agent and the orchestrator" },
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
          <p className="mt-6 text-2xl md:text-3xl text-gray-400 font-light">
            Agents for Impact
          </p>
          <p className="mt-8 text-lg text-gray-500 max-w-3xl mx-auto leading-relaxed">
            We built a system where AI doesn&apos;t just assist Agile teams
            &mdash; it runs them. Five specialized agents. Seven automated
            phases. One intelligent pipeline that learns from every sprint.
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
          The Problem
        </h2>
        <p className="text-center text-gray-500 mb-16 max-w-2xl mx-auto text-lg">
          Every two weeks, the same cycle repeats. The data to make better
          decisions exists &mdash; but nothing connects it.
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

      {/* ── BUG STORY ── */}
      <section className="py-28 px-6 section-alt">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold mb-8">
            The Bug That Almost Killed the Demo
          </h2>
          <p className="text-gray-400 leading-relaxed text-lg mb-10">
            During testing, every sprint showed{" "}
            <strong className="text-red-400">0% completion</strong>. Every
            ticket failed. We spent hours debugging. The root cause? One
            character.
          </p>
          <div className="code-block">
            <p className="text-red-400/80 mb-1">
              {"// BEFORE: 0 is falsy, so 0 || 100 = 100 (failure!)"}
            </p>
            <p className="text-gray-300 text-base">
              {"Number(value "}
              <span className="text-red-400 font-bold text-lg">{"||"}</span>
              {" 100) === 0;"}
            </p>
            <br />
            <p className="text-green-400/80 mb-1">
              {"// AFTER: ?? only falls back on null/undefined, not 0"}
            </p>
            <p className="text-gray-300 text-base">
              {"Number(value "}
              <span className="text-green-400 font-bold text-lg">{"??"}</span>
              {" 100) === 0;"}
            </p>
          </div>
          <p className="text-gray-400 mt-8 leading-relaxed text-lg">
            A{" "}
            <code className="text-amber-300 bg-white/5 px-2 py-1 rounded text-sm">
              testFailureRatePercent
            </code>{" "}
            of{" "}
            <code className="text-amber-300 bg-white/5 px-2 py-1 rounded text-sm">
              0
            </code>{" "}
            (perfect) was treated as{" "}
            <code className="text-amber-300 bg-white/5 px-2 py-1 rounded text-sm">
              100
            </code>{" "}
            (failure). Changing{" "}
            <code className="text-red-400 bg-white/5 px-2 py-1 rounded text-sm">
              ||
            </code>{" "}
            to{" "}
            <code className="text-green-400 bg-white/5 px-2 py-1 rounded text-sm">
              ??
            </code>{" "}
            &mdash; one character &mdash; fixed everything.
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

      {/* ── BUILT WITH AI ── */}
      <section className="py-20 px-6 text-center">
        <h2 className="text-3xl font-bold mb-6">Built With AI</h2>
        <p className="text-gray-500 max-w-3xl mx-auto leading-relaxed">
          This project was built with <strong className="text-gray-300">Cursor (Claude)</strong>{" "}
          throughout &mdash; architecture, code generation, debugging, and this
          page. We started with high-level intent and iterated with focused
          follow-ups. Breaking complex tasks into small, specific prompts worked
          better than large &ldquo;build everything&rdquo; prompts.
        </p>
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
