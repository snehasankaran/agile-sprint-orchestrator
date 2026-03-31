import React, { useState, useEffect, useRef, useCallback } from "https://esm.sh/react@18";
import { createRoot } from "https://esm.sh/react-dom@18/client";

const h = React.createElement;

async function callApi(url, payload, method = "POST") {
  const opts = { method, headers: { "Content-Type": "application/json", "x-role": "supervisor" } };
  if (payload && method !== "GET") opts.body = JSON.stringify(payload);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`Non-JSON (HTTP ${res.status})`); }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const PHASE_META = {
  backlog:      { icon: "\u{1F4CB}", label: "Backlog", agent: "backlog", port: 3000 },
  planning:     { icon: "\u{1F3AF}", label: "Planning", agent: "planning", port: 3020 },
  development:  { icon: "\u{1F4BB}", label: "Development", agent: "iterative", port: 4040 },
  review:       { icon: "\u{1F50D}", label: "Review", agent: "review", port: 5050 },
  retro:        { icon: "\u{1F504}", label: "Retro", agent: "review", port: 5050 },
  velocity:     { icon: "\u{1F4C8}", label: "Velocity", agent: "review", port: 5050 },
  intelligence: { icon: "\u{1F9E0}", label: "Intelligence", agent: "review", port: 5050 }
};
const PHASES = Object.keys(PHASE_META);

function App() {
  const [status, setStatus] = useState(null);
  const [agents, setAgents] = useState({});
  const [events, setEvents] = useState([]);
  const [running, setRunning] = useState(false);
  const [runningPhase, setRunningPhase] = useState(null);
  const [msg, setMsg] = useState("Initializing...");
  const [capacity, setCapacity] = useState(30);
  const [boardId, setBoardId] = useState("");
  const [sprintId, setSprintId] = useState("");
  const [boards, setBoards] = useState([]);
  const [sprints, setSprints] = useState([]);
  const [loadingBoards, setLoadingBoards] = useState(false);
  const [loadingSprints, setLoadingSprints] = useState(false);
  const [phaseResults, setPhaseResults] = useState({});
  const [expandedPhases, setExpandedPhases] = useState({});
  const [managerReport, setManagerReport] = useState(null);
  const [managerRunning, setManagerRunning] = useState(false);
  const [managerExpanded, setManagerExpanded] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  const [raiSummary, setRaiSummary] = useState(null);
  const [dailyCheck, setDailyCheck] = useState(null);
  const [dailyRunning, setDailyRunning] = useState(false);
  const [sprintContext, setSprintContext] = useState(null);
  const evtRef = useRef(null);

  const refreshStatus = useCallback(async () => {
    try {
      const s = await callApi("/api/orchestrator/status", null, "GET");
      setStatus(s);
      if (s.sprint?.capacity) setCapacity(s.sprint.capacity);
      if (s.sprint?.boardId && !boardId) setBoardId(String(s.sprint.boardId));
      if (s.sprint?.sprintId && !sprintId) setSprintId(String(s.sprint.sprintId));
      if (s.offlineMode != null) setOfflineMode(s.offlineMode);
    } catch {}
  }, [boardId, sprintId]);

  const refreshAgents = useCallback(async () => {
    try {
      const a = await callApi("/api/orchestrator/agents", null, "GET");
      setAgents(a);
    } catch {}
  }, []);

  async function fetchBoards() {
    setLoadingBoards(true);
    try {
      const data = await callApi("/api/jira/boards", null, "GET");
      setBoards(Array.isArray(data.boards) ? data.boards : []);
    } catch { setBoards([]); }
    setLoadingBoards(false);
  }

  const fetchPhaseResults = useCallback(async () => {
    try {
      const pr = await callApi("/api/orchestrator/phase-results", null, "GET");
      setPhaseResults(pr || {});
    } catch {}
  }, []);

  const fetchManagerReport = useCallback(async () => {
    try {
      const r = await callApi("/api/orchestrator/manager/report", null, "GET");
      if (r.available) setManagerReport(r);
    } catch {}
  }, []);

  const fetchRaiSummary = useCallback(async () => {
    try {
      const r = await callApi("/api/orchestrator/rai-summary", null, "GET");
      setRaiSummary(r);
    } catch {}
  }, []);

  const fetchDailyCheck = useCallback(async () => {
    try {
      const r = await callApi("/api/orchestrator/daily-check", null, "GET");
      if (r && r.available !== false) setDailyCheck(r);
    } catch {}
  }, []);

  const fetchSprintContext = useCallback(async () => {
    try {
      const r = await callApi("/api/orchestrator/sprint-context", null, "GET");
      if (r && r.available !== false) setSprintContext(r);
    } catch {}
  }, []);

  async function runDailyCheck() {
    setDailyRunning(true);
    setMsg("Running daily sprint health check...");
    try {
      const r = await callApi("/api/orchestrator/daily-check", {});
      setDailyCheck(r);
      setMsg(`Daily check complete — ${r.metrics?.completionPace === "on_track" ? "On Track" : r.metrics?.completionPace === "slightly_behind" ? "Slightly Behind" : "Behind Schedule"}`);
    } catch (err) {
      setMsg(`Daily check failed: ${err.message}`);
    }
    setDailyRunning(false);
  }

  async function runManagerEval() {
    setManagerRunning(true);
    setMsg("Running AI Manager evaluation...");
    try {
      const r = await callApi("/api/orchestrator/manager/evaluate", {});
      setManagerReport(r);
      setMsg(`Manager evaluation complete — Grade: ${r.overallGrade || "N/A"}`);
    } catch (err) {
      setMsg(`Manager eval error: ${err.message}`);
    }
    setManagerRunning(false);
  }

  function togglePhase(phase) {
    setExpandedPhases(prev => ({ ...prev, [phase]: !prev[phase] }));
  }

  async function fetchSprints(bid) {
    if (!bid) { setSprints([]); setSprintId(""); return; }
    setLoadingSprints(true);
    setSprints([]);
    try {
      const data = await callApi(`/api/jira/boards/${bid}/sprints`, null, "GET");
      const list = Array.isArray(data.sprints) ? data.sprints : [];
      setSprints(list);
      const active = list.find(s => s.state === "active");
      if (active) setSprintId(String(active.id));
    } catch { setSprints([]); }
    setLoadingSprints(false);
  }

  useEffect(() => {
    if (boardId) fetchSprints(boardId);
  }, [boardId]);

  useEffect(() => {
    refreshStatus();
    refreshAgents();
    fetchBoards();
    fetchPhaseResults();
    fetchManagerReport();
    fetchRaiSummary();
    fetchDailyCheck();
    fetchSprintContext();
    const iv = setInterval(() => { refreshStatus(); refreshAgents(); fetchPhaseResults(); fetchRaiSummary(); }, 8000);

    const sse = new EventSource("/api/orchestrator/events");
    sse.onmessage = (e) => {
      try {
        const evt = JSON.parse(e.data);
        setEvents(prev => [...prev.slice(-200), evt]);
      } catch {}
    };
    evtRef.current = sse;

    setMsg("Ready.");
    return () => { clearInterval(iv); sse.close(); };
  }, [refreshStatus, refreshAgents, fetchPhaseResults, fetchManagerReport, fetchRaiSummary, fetchDailyCheck, fetchSprintContext]);

  async function runPhase(phase) {
    setRunningPhase(phase);
    setRunning(true);
    setMsg(`Running ${PHASE_META[phase].label}...`);
    try {
      const result = await callApi("/api/orchestrator/run-phase", { phase });
      setMsg(result.success ? `${PHASE_META[phase].label} completed.` : `${PHASE_META[phase].label} failed: ${result.error}`);
    } catch (err) {
      setMsg(`Error: ${err.message}`);
    }
    setRunning(false);
    setRunningPhase(null);
    refreshStatus();
    fetchPhaseResults();
  }

  async function runFullCycle() {
    setRunning(true);
    setMsg("Running full sprint cycle...");
    try {
      const result = await callApi("/api/orchestrator/run-cycle", {});
      setMsg(result.success ? "Full sprint cycle completed!" : `Cycle aborted at ${result.failedPhase}: ${result.results?.[result.failedPhase]?.error || "unknown"}`);
    } catch (err) {
      setMsg(`Error: ${err.message}`);
    }
    setRunning(false);
    refreshStatus();
    fetchPhaseResults();
  }

  async function resetState() {
    try {
      await callApi("/api/orchestrator/reset", {});
      setEvents([]);
      setPhaseResults({});
      setExpandedPhases({});
      setManagerReport(null);
      setMsg("State reset.");
      refreshStatus();
    } catch (err) {
      setMsg(`Error: ${err.message}`);
    }
  }

  async function saveCfg() {
    try {
      const payload = { capacity: Number(capacity), offlineMode };
      if (boardId) payload.boardId = Number(boardId);
      if (sprintId) payload.sprintId = Number(sprintId);
      await callApi("/api/orchestrator/configure", payload);
      setMsg(`Config saved — Capacity: ${capacity} SP${offlineMode ? " [OFFLINE]" : ""}${boardId ? `, Board: ${boardId}` : ""}${sprintId ? `, Sprint: ${sprintId}` : ""}`);
      refreshStatus();
    } catch (err) {
      setMsg(`Error: ${err.message}`);
    }
  }

  const ps = status?.phaseStatus || {};

  function renderPhaseCard(phaseKey, title, data, expanded, toggle, contentFn) {
    const isExpanded = expanded[phaseKey];
    return h("div", { className: "phase-result-card", key: phaseKey },
      h("div", { className: "phase-result-header", onClick: () => toggle(phaseKey) },
        h("span", { style: { fontSize: "18px" } }, PHASE_META[phaseKey]?.icon || ""),
        h("h3", { style: { margin: 0, flex: 1, fontSize: "14px", color: "#c9d1d9" } }, title),
        h("span", { className: "expand-arrow" }, isExpanded ? "\u25BC" : "\u25B6")
      ),
      data.highlights && h("div", { className: "phase-highlights" },
        data.highlights.map((hl, i) => h("div", { key: i, className: "highlight-item" }, hl))
      ),
      ...(contentFn() || [])
    );
  }

  function miniStat(label, value, color) {
    return h("div", { className: "mini-stat" },
      h("div", { style: { fontSize: "16px", fontWeight: 700, color: color || "#c9d1d9" } }, String(value)),
      h("div", { style: { fontSize: "10px", color: "#8b949e", marginTop: "2px" } }, label)
    );
  }

  function eventClass(type) {
    if (type === "INSIGHT") return "insight";
    if (type.includes("DAILY_CHECK")) return "daily";
    if (type.includes("COMPLETED") || type === "CYCLE_COMPLETE") return "completed";
    if (type.includes("FAILED") || type === "CYCLE_ABORTED") return "failed";
    if (type.includes("STARTED") || type === "CYCLE_STARTED") return "started";
    return "info";
  }

  return h("div", { className: "container" },

    // Header
    h("div", { className: "header" },
      h("div", null,
        h("h1", null, "Agile Sprint Orchestrator"),
        h("span", { style: { fontSize: "12px", color: "#8b949e" } }, msg)
      ),
      h("div", { className: "header-actions" },
        h("button", { className: "btn-primary", onClick: runFullCycle, disabled: running }, running ? "Running..." : "Run Full Cycle"),
        h("button", { className: "btn-danger", onClick: resetState, disabled: running }, "Reset")
      )
    ),

    // Pipeline
    h("div", { className: "pipeline" },
      ...PHASES.flatMap((phase, i) => {
        const meta = PHASE_META[phase];
        const st = runningPhase === phase ? "running" : (ps[phase] || "pending");
        const items = [
          h("div", {
            key: phase,
            className: `phase-step ${st}`,
            onClick: () => !running && runPhase(phase)
          },
            h("div", { className: "icon" }, meta.icon),
            h("div", { className: "label" }, meta.label),
            h("div", { style: { fontSize: "10px", marginTop: "2px", textTransform: "capitalize" } }, st)
          )
        ];
        if (i < PHASES.length - 1) items.push(h("div", { key: `arr-${i}`, className: "phase-arrow" }, "\u279C"));
        return items;
      })
    ),

    // Config
    h("div", { className: "card", style: { marginBottom: "16px" } },
      h("div", { className: "config-row" },
        h("label", null, "Board"),
        h("select", {
          value: boardId,
          onChange: e => { setBoardId(e.target.value); setSprintId(""); },
          style: { minWidth: "200px" }
        },
          h("option", { value: "" }, loadingBoards ? "Loading boards..." : "— Select JIRA Board —"),
          ...boards.map(b => h("option", { key: b.id, value: String(b.id) }, `${b.name} (${b.id})`))
        ),
        h("label", { style: { marginLeft: "12px" } }, "Sprint"),
        h("select", {
          value: sprintId,
          onChange: e => setSprintId(e.target.value),
          disabled: !boardId || loadingSprints,
          style: { minWidth: "220px" }
        },
          h("option", { value: "" }, !boardId ? "Select a board first" : loadingSprints ? "Loading sprints..." : "— Select Sprint —"),
          ...sprints.map(s => h("option", { key: s.id, value: String(s.id) },
            `${s.name}${s.state === "active" ? " (active)" : s.state === "closed" ? " (closed)" : ""}`
          ))
        ),
        h("label", { style: { marginLeft: "12px" } }, "Capacity"),
        h("input", { type: "number", value: capacity, onChange: e => setCapacity(e.target.value), style: { width: "80px" } }),
        h("span", { style: { fontSize: "12px", color: "#8b949e" } }, "SP"),
        h("button", { className: "btn-secondary", onClick: saveCfg, style: { marginLeft: "12px" } }, "Save Config"),
        h("label", { className: "offline-toggle", style: { marginLeft: "16px", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" } },
          h("input", { type: "checkbox", checked: offlineMode, onChange: e => setOfflineMode(e.target.checked) }),
          h("span", { style: { fontSize: "12px", color: offlineMode ? "#3fb950" : "#8b949e", fontWeight: offlineMode ? 700 : 400 } },
            offlineMode ? "OFFLINE (Local AI Only)" : "Online (Cloud + Local)")
        ),
        status?.sprint?.goal && h("span", { style: { marginLeft: "24px", fontSize: "12px", color: "#8b949e" } }, `Goal: ${status.sprint.goal}`)
      )
    ),

    // Top stats
    h("div", { className: "grid-3" },
      h("div", { className: "card stat-card" },
        h("div", { className: "stat-val", style: { color: "#58a6ff" } }, status?.sprint?.ticketCount ?? "—"),
        h("div", { className: "stat-label" }, "Sprint Tickets")
      ),
      h("div", { className: "card stat-card" },
        h("div", { className: "stat-val", style: { color: status?.review?.decision === "Sprint Done" ? "#3fb950" : "#d29922" } }, status?.review ? `${status.review.completed}/${status.review.total}` : "—"),
        h("div", { className: "stat-label" }, "Completed / Total")
      ),
      h("div", { className: "card stat-card" },
        h("div", { className: "stat-val", style: { color: status?.velocity?.trend === "Improving" ? "#3fb950" : status?.velocity?.trend === "Declining" ? "#f85149" : "#d29922" } }, status?.velocity?.avgVelocity ?? "—"),
        h("div", { className: "stat-label" }, `Velocity ${status?.velocity?.trend ? `(${status.velocity.trend})` : ""}`)
      )
    ),

    // Main grid: agents + phase details
    h("div", { className: "grid" },

      // Agent Health
      h("div", { className: "card" },
        h("h3", null, "Agent Health"),
        ...Object.entries(agents).map(([key, agent]) =>
          h("div", { key, className: "agent-row" },
            h("div", { className: `dot ${agent.healthy ? "up" : "down"}` }),
            h("span", { className: "agent-name" }, agent.name),
            h("span", { className: "agent-port" }, `:${agent.port}`),
            h("a", { className: "agent-link", href: `http://localhost:${agent.port}`, target: "_blank" }, "Open")
          )
        ),
        Object.keys(agents).length === 0 && h("div", { style: { fontSize: "12px", color: "#484f58" } }, "Checking agents...")
      ),

      // Phase Summary
      h("div", { className: "card" },
        h("h3", null, "Phase Summary"),
        PHASES.map(phase => {
          const st = ps[phase] || "pending";
          const color = st === "done" ? "#3fb950" : st === "running" ? "#d29922" : st === "failed" ? "#f85149" : "#484f58";
          return h("div", { key: phase, style: { display: "flex", alignItems: "center", gap: "10px", padding: "6px 0", borderBottom: "1px solid #21262d" } },
            h("span", { style: { fontSize: "16px" } }, PHASE_META[phase].icon),
            h("span", { style: { flex: 1, fontSize: "13px" } }, PHASE_META[phase].label),
            h("span", { style: { fontSize: "12px", fontWeight: 600, color, textTransform: "uppercase" } }, st),
            h("button", {
              className: "btn-phase",
              disabled: running,
              onClick: () => runPhase(phase)
            }, "Run")
          );
        })
      )
    ),

    // ── Daily Sprint Health ──
    h("div", { className: "card", style: { borderLeft: "3px solid #f0883e" } },
      h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" } },
        h("h3", { style: { margin: 0, color: "#f0883e" } }, "Daily Sprint Health"),
        h("button", {
          className: "btn-primary",
          onClick: runDailyCheck,
          disabled: dailyRunning,
          style: { fontSize: "12px", padding: "4px 14px" }
        }, dailyRunning ? "Checking..." : "Run Daily Check")
      ),
      dailyCheck && dailyCheck.metrics ? h("div", null,
        // Summary
        h("div", { style: { background: "#161b22", padding: "10px 14px", borderRadius: "8px", marginBottom: "12px", fontSize: "13px", color: "#c9d1d9", lineHeight: "1.5" } },
          dailyCheck.summary
        ),
        // Sprint Progress Bar
        h("div", { style: { marginBottom: "12px" } },
          h("div", { style: { display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#8b949e", marginBottom: "4px" } },
            h("span", null, `Day ${dailyCheck.sprintDay} of ${dailyCheck.sprintDaysTotal}`),
            h("span", null, `${dailyCheck.metrics.completionPct}% complete`)
          ),
          h("div", { style: { background: "#21262d", borderRadius: "4px", height: "8px", overflow: "hidden" } },
            h("div", { style: {
              width: `${dailyCheck.metrics.completionPct}%`,
              height: "100%",
              borderRadius: "4px",
              background: dailyCheck.metrics.completionPace === "on_track" ? "#3fb950" : dailyCheck.metrics.completionPace === "slightly_behind" ? "#f0883e" : "#f85149",
              transition: "width 0.5s"
            } })
          )
        ),
        // Ticket Status Breakdown
        h("div", { style: { display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "12px" } },
          miniStat("Done", dailyCheck.metrics.done, "#3fb950"),
          miniStat("In Progress", dailyCheck.metrics.inProgress, "#58a6ff"),
          miniStat("To Do", dailyCheck.metrics.todo, "#8b949e"),
          miniStat("Blocked", dailyCheck.metrics.blocked, dailyCheck.metrics.blocked > 0 ? "#f85149" : "#8b949e"),
          miniStat("Points", `${dailyCheck.metrics.completedPoints}/${dailyCheck.metrics.plannedPoints}`, "#d2a8ff"),
          miniStat("Burndown", `${dailyCheck.metrics.burndownDelta > 0 ? "+" : ""}${dailyCheck.metrics.burndownDelta}%`,
            dailyCheck.metrics.burndownDelta >= 0 ? "#3fb950" : "#f85149")
        ),
        // Risks
        dailyCheck.risks && dailyCheck.risks.length > 0 && h("div", { style: { marginBottom: "12px" } },
          h("strong", { style: { fontSize: "12px", color: "#f85149" } }, `Risks (${dailyCheck.risks.length})`),
          h("div", { style: { marginTop: "6px", display: "flex", flexDirection: "column", gap: "6px" } },
            ...dailyCheck.risks.map((r, i) =>
              h("div", { key: i, style: {
                background: r.severity === "high" ? "#f8514922" : "#f0883e22",
                border: `1px solid ${r.severity === "high" ? "#f8514944" : "#f0883e44"}`,
                borderRadius: "6px", padding: "8px 10px", fontSize: "12px"
              } },
                h("div", { style: { display: "flex", justifyContent: "space-between" } },
                  h("span", { style: { color: "#c9d1d9" } }, `${r.ticket}: ${r.risk}`),
                  h("span", { className: "badge", style: {
                    background: r.severity === "high" ? "#f8514933" : "#f0883e33",
                    color: r.severity === "high" ? "#f85149" : "#f0883e",
                    fontSize: "10px", padding: "1px 6px"
                  } }, r.severity)
                ),
                h("div", { style: { color: "#8b949e", fontSize: "11px", marginTop: "3px" } }, r.recommendation)
              )
            )
          )
        ),
        // Predictions
        dailyCheck.predictions && h("div", { style: { background: "#161b22", borderRadius: "8px", padding: "10px 14px", fontSize: "12px" } },
          h("div", { style: { display: "flex", gap: "16px", flexWrap: "wrap" } },
            h("span", { style: { color: "#8b949e" } }, "Projected completion: ",
              h("strong", { style: { color: parseInt(dailyCheck.predictions.likelyCompletion) >= 80 ? "#3fb950" : "#f0883e" } }, dailyCheck.predictions.likelyCompletion)
            ),
            h("span", { style: { color: "#8b949e" } }, `Days left: ${dailyCheck.predictions.daysLeft}`),
            h("span", { style: { color: "#8b949e" } }, `Confidence: ${dailyCheck.predictions.confidence}%`)
          ),
          dailyCheck.predictions.spilloverRisk && dailyCheck.predictions.spilloverRisk.length > 0 &&
            h("div", { style: { marginTop: "6px", color: "#f0883e" } },
              `Spillover risk: ${dailyCheck.predictions.spilloverRisk.join(", ")}`
            )
        ),
        // Action Recommendations
        dailyCheck.recommendations && dailyCheck.recommendations.length > 0 && h("div", { style: { marginTop: "10px" } },
          h("strong", { style: { fontSize: "12px", color: "#d2a8ff" } }, `Action Recommendations (${dailyCheck.recommendations.length})`),
          h("div", { style: { marginTop: "6px", display: "flex", flexDirection: "column", gap: "6px" } },
            ...dailyCheck.recommendations.map((r, i) =>
              h("div", { key: i, style: {
                background: "#1f6feb22", border: "1px solid #1f6feb44", borderRadius: "6px", padding: "8px 10px", fontSize: "12px"
              } },
                h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
                  h("span", { style: { color: "#c9d1d9", fontWeight: 600 } }, r.action),
                  h("span", { className: "badge", style: {
                    background: r.priority === "high" ? "#f8514933" : "#f0883e33",
                    color: r.priority === "high" ? "#f85149" : "#f0883e",
                    fontSize: "10px", padding: "1px 6px"
                  } }, r.priority)
                ),
                h("div", { style: { color: "#8b949e", fontSize: "11px", marginTop: "3px" } }, r.reason)
              )
            )
          )
        ),
        // Data Sources
        h("div", { style: { marginTop: "8px", fontSize: "10px", color: "#484f58" } },
          `Sources: ${(dailyCheck.dataSources || []).join(" · ")} | Last checked: ${new Date(dailyCheck.timestamp).toLocaleTimeString()}`
        )
      ) : h("div", { style: { color: "#8b949e", fontSize: "13px", padding: "10px 0" } },
        "No daily check run yet. Click 'Run Daily Check' to get current sprint status and risk assessment."
      )
    ),

    // ── Sprint Context (Feedback Loop) ──
    sprintContext && h("div", { className: "card", style: { borderLeft: "3px solid #3fb950" } },
      h("h3", { style: { margin: "0 0 12px 0", color: "#3fb950" } }, "Sprint Context — Learnings from Previous Sprints"),
      h("div", { style: { display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "12px" } },
        miniStat("Sprints Analyzed", sprintContext.sprintsAnalyzed || 0, "#3fb950"),
        sprintContext.previousVelocity?.avg && miniStat("Avg Velocity", `${sprintContext.previousVelocity.avg} SP`, "#58a6ff"),
        sprintContext.previousVelocity?.trend && miniStat("Trend", sprintContext.previousVelocity.trend === "declining" ? "Declining" : "Stable/Up",
          sprintContext.previousVelocity.trend === "declining" ? "#f85149" : "#3fb950"),
        sprintContext.estimationAccuracy && miniStat("Estimation Accuracy", `${sprintContext.estimationAccuracy}%`,
          sprintContext.estimationAccuracy >= 80 ? "#3fb950" : "#f0883e"),
        sprintContext.suggestedCapacity && miniStat("Suggested Capacity", `${sprintContext.suggestedCapacity} SP`, "#d2a8ff")
      ),
      sprintContext.unresolvedRetroActions?.length > 0 && h("div", { style: { marginBottom: "10px" } },
        h("strong", { style: { fontSize: "12px", color: "#f0883e" } }, `Unresolved Retro Actions (${sprintContext.unresolvedRetroActions.length})`),
        h("div", { style: { marginTop: "4px", display: "flex", flexDirection: "column", gap: "4px" } },
          ...sprintContext.unresolvedRetroActions.map((a, i) =>
            h("div", { key: i, style: { fontSize: "11px", color: "#c9d1d9", padding: "4px 8px", background: "#f0883e11", borderRadius: "4px" } },
              `Sprint -${a.sprintAge || "?"}: ${a.description || a}`)
          )
        )
      ),
      sprintContext.recurringRiskPatterns?.length > 0 && h("div", null,
        h("strong", { style: { fontSize: "12px", color: "#f85149" } }, "Recurring Risk Patterns"),
        h("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "4px" } },
          ...sprintContext.recurringRiskPatterns.map((p, i) =>
            h("span", { key: i, style: { background: "#f8514922", color: "#f85149", fontSize: "11px", padding: "2px 8px", borderRadius: "10px" } }, p)
          )
        )
      ),
      h("div", { style: { marginTop: "8px", fontSize: "10px", color: "#484f58" } },
        "This context is automatically fed into Backlog and Planning phases to help the system learn and improve."
      )
    ),

    // ── Phase Results ──
    Object.keys(phaseResults).length > 0 && h("div", { className: "phase-results-section" },
      h("h2", { style: { margin: "0 0 16px", fontSize: "18px", color: "#c9d1d9" } }, "Phase Results"),

      // Backlog
      phaseResults.backlog && renderPhaseCard("backlog", "Backlog Refinement", phaseResults.backlog, expandedPhases, togglePhase, () => [
        h("div", { className: "mini-stats", key: "stats" },
          miniStat("Processed", phaseResults.backlog.ticketCount, "#58a6ff"),
          miniStat("Rejected", phaseResults.backlog.rejectedCount || 0, "#f85149")
        ),
        expandedPhases.backlog && phaseResults.backlog.tickets?.length > 0 &&
          h("table", { className: "result-table", key: "table" },
            h("thead", null, h("tr", null,
              h("th", null, "Key"), h("th", null, "Summary"), h("th", null, "Type"), h("th", null, "Priority"), h("th", null, "SP"), h("th", null, "Status")
            )),
            h("tbody", null, phaseResults.backlog.tickets.map((t, i) =>
              h("tr", { key: i },
                h("td", { className: "mono" }, t.key), h("td", null, t.summary), h("td", null, t.type),
                h("td", null, t.priority), h("td", null, t.points), h("td", null, t.status)
              )
            ))
          )
      ]),

      // Planning
      phaseResults.planning && renderPhaseCard("planning", "Sprint Planning", phaseResults.planning, expandedPhases, togglePhase, () => [
        h("div", { className: "mini-stats", key: "stats" },
          miniStat("Sprint Goal", phaseResults.planning.sprintGoal || "N/A", "#58a6ff"),
          miniStat("Tickets", phaseResults.planning.ticketCount, "#3fb950"),
          miniStat("Capacity", `${phaseResults.planning.capacityUsed}/${phaseResults.planning.capacityTotal} SP`, "#d29922"),
          miniStat("Deferred", phaseResults.planning.deferredCount || 0, "#f85149")
        ),
        expandedPhases.planning && phaseResults.planning.tickets?.length > 0 &&
          h("table", { className: "result-table", key: "table" },
            h("thead", null, h("tr", null,
              h("th", null, "Key"), h("th", null, "Summary"), h("th", null, "Type"), h("th", null, "SP"), h("th", null, "Assignee")
            )),
            h("tbody", null, phaseResults.planning.tickets.map((t, i) =>
              h("tr", { key: i },
                h("td", { className: "mono" }, t.key), h("td", null, t.summary), h("td", null, t.type),
                h("td", null, t.points), h("td", null, t.assignee)
              )
            ))
          )
      ]),

      // Development
      phaseResults.development && renderPhaseCard("development", "Iterative Development", phaseResults.development, expandedPhases, togglePhase, () => [
        h("div", { className: "mini-stats", key: "stats" },
          miniStat("Evaluations", phaseResults.development.evaluationCount, "#58a6ff"),
          miniStat("Sprint Health", phaseResults.development.healthDecision || "N/A",
            phaseResults.development.healthDecision === "GREEN" ? "#3fb950" : phaseResults.development.healthDecision === "RED" ? "#f85149" : "#d29922")
        ),
        expandedPhases.development && phaseResults.development.evaluations?.length > 0 &&
          h("table", { className: "result-table", key: "table" },
            h("thead", null, h("tr", null,
              h("th", null, "Ticket"), h("th", null, "Decision"), h("th", null, "Confidence"),
              h("th", null, "Acceptance %"), h("th", null, "Test Fail %"), h("th", null, "Coverage %")
            )),
            h("tbody", null, phaseResults.development.evaluations.map((e, i) =>
              h("tr", { key: i },
                h("td", { className: "mono" }, e.key),
                h("td", null, h("span", { className: `badge ${e.decision === "PASS" ? "badge-pass" : e.decision === "FAIL" ? "badge-fail" : "badge-warn"}` }, e.decision)),
                h("td", null, e.confidence != null ? `${e.confidence}%` : "—"),
                h("td", null, e.acceptance != null ? `${e.acceptance}%` : "—"),
                h("td", null, e.testFail != null ? `${e.testFail}%` : "—"),
                h("td", null, e.coverage != null ? `${e.coverage}%` : "—")
              )
            ))
          )
      ]),

      // Review
      phaseResults.review && renderPhaseCard("review", "Sprint Review", phaseResults.review, expandedPhases, togglePhase, () => [
        h("div", { className: "mini-stats", key: "stats" },
          miniStat("Decision", phaseResults.review.decision,
            phaseResults.review.decision === "Sprint Done" ? "#3fb950" : "#d29922"),
          miniStat("Completed", `${phaseResults.review.completedCorrectly}/${phaseResults.review.totalTickets}`, "#3fb950"),
          miniStat("Spillover", phaseResults.review.spillover || 0, "#d29922"),
          miniStat("Rework", phaseResults.review.incorrectImplementation || 0, "#f85149")
        ),
        expandedPhases.review && h("div", { key: "details" },
          phaseResults.review.summary && h("p", { style: { color: "#8b949e", fontSize: "12px", margin: "8px 0" } }, phaseResults.review.summary),

          phaseResults.review.committedTickets?.length > 0 && h("div", { style: { marginTop: "10px" }, key: "committed" },
            h("h4", { className: "sub-header green" }, `Committed & Closed (${phaseResults.review.committedTickets.length})`),
            h("div", { className: "tag-list" }, phaseResults.review.committedTickets.map((t, i) =>
              h("span", { key: i, className: "tag tag-green" }, `${t.key}${t.summary ? ` – ${t.summary}` : ""}`)
            ))
          ),

          phaseResults.review.spilloverTickets?.length > 0 && h("div", { style: { marginTop: "10px" }, key: "spill" },
            h("h4", { className: "sub-header yellow" }, `Spillover (${phaseResults.review.spilloverTickets.length})`),
            phaseResults.review.spilloverTickets.map((t, i) =>
              h("div", { key: i, className: "detail-item" },
                h("span", { className: "mono" }, t.key),
                h("span", { className: "tag tag-yellow" }, t.status),
                t.reason && h("span", { style: { color: "#8b949e", fontSize: "11px" } }, t.reason)
              )
            )
          ),

          phaseResults.review.incorrectTickets?.length > 0 && h("div", { style: { marginTop: "10px" }, key: "incorrect" },
            h("h4", { className: "sub-header red" }, `Needs Rework (${phaseResults.review.incorrectTickets.length})`),
            phaseResults.review.incorrectTickets.map((t, i) =>
              h("div", { key: i, className: "detail-item" },
                h("span", { className: "mono" }, t.key),
                h("span", { className: "tag tag-red" }, t.decision),
                t.reason && h("span", { style: { color: "#8b949e", fontSize: "11px" } }, t.reason)
              )
            )
          ),

          phaseResults.review.reviewedTickets?.length > 0 && h("div", { style: { marginTop: "10px" }, key: "all-reviewed" },
            h("h4", { className: "sub-header" }, "All Reviewed Tickets"),
            h("table", { className: "result-table" },
              h("thead", null, h("tr", null,
                h("th", null, "Ticket"), h("th", null, "Decision"), h("th", null, "Confidence"),
                h("th", null, "Acceptance %"), h("th", null, "Test Fail %"), h("th", null, "Coverage %")
              )),
              h("tbody", null, phaseResults.review.reviewedTickets.map((t, i) =>
                h("tr", { key: i },
                  h("td", { className: "mono" }, t.key),
                  h("td", null, h("span", { className: `badge ${t.decision?.includes("PASS") || t.decision?.includes("Done") ? "badge-pass" : t.decision?.includes("FAIL") ? "badge-fail" : "badge-warn"}` }, t.decision)),
                  h("td", null, t.confidence != null ? `${t.confidence}%` : "—"),
                  h("td", null, t.acceptance != null ? `${t.acceptance}%` : "—"),
                  h("td", null, t.testFail != null ? `${t.testFail}%` : "—"),
                  h("td", null, t.coverage != null ? `${t.coverage}%` : "—")
                )
              ))
            )
          ),

          phaseResults.review.stakeholderFeedback?.length > 0 && h("div", { style: { marginTop: "10px" }, key: "feedback" },
            h("h4", { className: "sub-header" }, "Stakeholder Feedback"),
            phaseResults.review.stakeholderFeedback.map((fb, i) =>
              h("div", { key: i, className: "feedback-card" },
                h("div", { style: { display: "flex", gap: "8px", alignItems: "center" } },
                  h("strong", { style: { color: "#c9d1d9" } }, fb.stakeholder),
                  h("span", { className: `tag ${fb.sentiment === "Positive" ? "tag-green" : fb.sentiment === "Negative" ? "tag-red" : "tag-yellow"}` }, fb.sentiment)
                ),
                h("p", { style: { margin: "4px 0 0", color: "#8b949e", fontSize: "12px" } }, fb.feedback)
              )
            )
          )
        )
      ]),

      // Retro
      phaseResults.retro && renderPhaseCard("retro", "Retrospective", phaseResults.retro, expandedPhases, togglePhase, () => [
        h("div", { className: "mini-stats", key: "stats" },
          miniStat("Morale", phaseResults.retro.teamHealth?.morale || "N/A", "#58a6ff"),
          miniStat("Velocity Trend", phaseResults.retro.teamHealth?.velocityTrend || "N/A",
            phaseResults.retro.teamHealth?.velocityTrend === "Improving" ? "#3fb950" : "#d29922"),
          miniStat("Actions", (phaseResults.retro.actionItems || []).length, "#d29922"),
          miniStat("Patterns", (phaseResults.retro.patterns || []).length, "#f85149")
        ),
        expandedPhases.retro && h("div", { key: "details" },
          phaseResults.retro.wentWell?.length > 0 && h("div", { style: { marginTop: "10px" }, key: "well" },
            h("h4", { className: "sub-header green" }, "What Went Well"),
            h("ul", { className: "retro-list" }, phaseResults.retro.wentWell.map((item, i) =>
              h("li", { key: i }, typeof item === "string" ? item : item.description || JSON.stringify(item))
            ))
          ),

          phaseResults.retro.didntGoWell?.length > 0 && h("div", { style: { marginTop: "10px" }, key: "bad" },
            h("h4", { className: "sub-header red" }, "What Didn't Go Well"),
            h("ul", { className: "retro-list" }, phaseResults.retro.didntGoWell.map((item, i) =>
              h("li", { key: i }, typeof item === "string" ? item : item.description || JSON.stringify(item))
            ))
          ),

          phaseResults.retro.improvements?.length > 0 && h("div", { style: { marginTop: "10px" }, key: "improve" },
            h("h4", { className: "sub-header yellow" }, "Improvements"),
            h("ul", { className: "retro-list" }, phaseResults.retro.improvements.map((item, i) =>
              h("li", { key: i }, typeof item === "string" ? item : item.description || JSON.stringify(item))
            ))
          ),

          phaseResults.retro.actionItems?.length > 0 && h("div", { style: { marginTop: "10px" }, key: "actions" },
            h("h4", { className: "sub-header" }, "Action Items"),
            h("table", { className: "result-table" },
              h("thead", null, h("tr", null,
                h("th", null, "Description"), h("th", null, "Owner"), h("th", null, "Priority"), h("th", null, "Target")
              )),
              h("tbody", null, phaseResults.retro.actionItems.map((a, i) =>
                h("tr", { key: i },
                  h("td", null, a.description), h("td", null, a.owner),
                  h("td", null, h("span", { className: `badge ${a.priority === "high" ? "badge-fail" : a.priority === "medium" ? "badge-warn" : "badge-pass"}` }, a.priority)),
                  h("td", null, a.targetSprint)
                )
              ))
            )
          ),

          phaseResults.retro.patterns?.length > 0 && h("div", { style: { marginTop: "10px" }, key: "patterns" },
            h("h4", { className: "sub-header" }, "Recurring Patterns"),
            h("ul", { className: "retro-list" }, phaseResults.retro.patterns.map((p, i) =>
              h("li", { key: i },
                h("strong", null, p.pattern || p), " ",
                p.frequency && h("span", { style: { color: "#f85149" } }, `(${p.frequency}x)`), " ",
                p.recommendation && h("span", { style: { color: "#8b949e" } }, `— ${p.recommendation}`)
              )
            ))
          )
        )
      ]),

      // Intelligence Report
      phaseResults.intelligence && renderPhaseCard("intelligence", "Sprint Intelligence Report", phaseResults.intelligence, expandedPhases, togglePhase, () => [
        phaseResults.intelligence.executiveSummary && h("div", { className: "exec-summary", key: "exec" },
          h("p", { style: { color: "#c9d1d9", fontSize: "13px", lineHeight: 1.6, margin: "8px 0" } }, phaseResults.intelligence.executiveSummary)
        ),
        h("div", { className: "mini-stats", key: "stats" },
          miniStat("Risks", (phaseResults.intelligence.risks || []).length,
            (phaseResults.intelligence.risks || []).some(r => r.severity === "high") ? "#f85149" : "#d29922"),
          miniStat("Dependencies", (phaseResults.intelligence.dependencies || []).length, "#58a6ff"),
          miniStat("Suggestions", (phaseResults.intelligence.suggestions || []).length, "#3fb950"),
          miniStat("Next Sprint", phaseResults.intelligence.sprintPrediction?.nextSprintSuccess || "N/A",
            phaseResults.intelligence.sprintPrediction?.nextSprintSuccess === "High" ? "#3fb950" : phaseResults.intelligence.sprintPrediction?.nextSprintSuccess === "Low" ? "#f85149" : "#d29922"),
          miniStat("Morale", phaseResults.intelligence.teamInsights?.moraleIndicator || "N/A", "#58a6ff")
        ),
        expandedPhases.intelligence && h("div", { key: "details" },

          (phaseResults.intelligence.risks || []).length > 0 && h("div", { style: { marginTop: "12px" }, key: "risks" },
            h("h4", { className: "sub-header red" }, "Risks"),
            phaseResults.intelligence.risks.map((r, i) =>
              h("div", { key: i, className: "risk-card", "data-severity": r.severity },
                h("div", { style: { display: "flex", gap: "8px", alignItems: "center" } },
                  h("span", { className: `badge ${r.severity === "high" ? "badge-fail" : r.severity === "medium" ? "badge-warn" : "badge-pass"}` }, r.severity),
                  h("strong", { style: { color: "#c9d1d9", fontSize: "13px" } }, r.title)
                ),
                h("p", { style: { margin: "4px 0 0", color: "#8b949e", fontSize: "12px" } }, r.description),
                r.mitigation && h("p", { style: { margin: "2px 0 0", color: "#58a6ff", fontSize: "11px" } }, `Mitigation: ${r.mitigation}`)
              )
            )
          ),

          (phaseResults.intelligence.dependencies || []).length > 0 && h("div", { style: { marginTop: "12px" }, key: "deps" },
            h("h4", { className: "sub-header" }, "Dependencies"),
            h("table", { className: "result-table" },
              h("thead", null, h("tr", null, h("th", null, "From"), h("th", null, "Type"), h("th", null, "To"), h("th", null, "Description"))),
              h("tbody", null, phaseResults.intelligence.dependencies.map((d, i) =>
                h("tr", { key: i },
                  h("td", { className: "mono" }, d.from), h("td", null, h("span", { className: "badge badge-warn" }, d.type)),
                  h("td", { className: "mono" }, d.to), h("td", null, d.description)
                )
              ))
            )
          ),

          (phaseResults.intelligence.suggestions || []).length > 0 && h("div", { style: { marginTop: "12px" }, key: "sugg" },
            h("h4", { className: "sub-header green" }, "Suggestions for PO / Scrum Master"),
            phaseResults.intelligence.suggestions.map((s, i) =>
              h("div", { key: i, className: "feedback-card" },
                h("div", { style: { display: "flex", gap: "8px", alignItems: "center" } },
                  h("span", { className: `badge ${s.priority === "high" ? "badge-fail" : s.priority === "medium" ? "badge-warn" : "badge-pass"}` }, s.priority),
                  h("span", { className: "tag tag-green" }, s.category || "general"),
                  h("strong", { style: { color: "#c9d1d9", fontSize: "13px" } }, s.title)
                ),
                h("p", { style: { margin: "4px 0 0", color: "#8b949e", fontSize: "12px" } }, s.description)
              )
            )
          ),

          phaseResults.intelligence.teamInsights?.summary && h("div", { style: { marginTop: "12px" }, key: "team" },
            h("h4", { className: "sub-header" }, "Team Insights"),
            h("div", { className: "mini-stats" },
              miniStat("Workload", phaseResults.intelligence.teamInsights.workloadBalance || "N/A", "#58a6ff"),
              miniStat("Morale", phaseResults.intelligence.teamInsights.moraleIndicator || "N/A",
                phaseResults.intelligence.teamInsights.moraleIndicator === "High" ? "#3fb950" : phaseResults.intelligence.teamInsights.moraleIndicator === "Low" ? "#f85149" : "#d29922")
            ),
            h("p", { style: { color: "#8b949e", fontSize: "12px", marginTop: "8px" } }, phaseResults.intelligence.teamInsights.summary),
            (phaseResults.intelligence.teamInsights.skillGaps || []).length > 0 &&
              h("div", { style: { marginTop: "6px" } },
                h("span", { style: { fontSize: "11px", color: "#f85149" } }, "Skill gaps: "),
                phaseResults.intelligence.teamInsights.skillGaps.map((g, i) =>
                  h("span", { key: i, className: "tag tag-red", style: { marginRight: "4px" } }, g)
                )
              )
          ),

          phaseResults.intelligence.sprintPrediction && h("div", { style: { marginTop: "12px" }, key: "pred" },
            h("h4", { className: "sub-header" }, "Next Sprint Prediction"),
            h("div", { className: "mini-stats" },
              miniStat("Success Likelihood", phaseResults.intelligence.sprintPrediction.nextSprintSuccess || "N/A",
                phaseResults.intelligence.sprintPrediction.nextSprintSuccess === "High" ? "#3fb950" : "#d29922"),
              miniStat("Confidence", phaseResults.intelligence.sprintPrediction.confidence != null ? `${phaseResults.intelligence.sprintPrediction.confidence}%` : "N/A", "#58a6ff"),
              miniStat("Recommended Capacity", phaseResults.intelligence.sprintPrediction.recommendedCapacity ? `${phaseResults.intelligence.sprintPrediction.recommendedCapacity} SP` : "N/A", "#d29922")
            ),
            (phaseResults.intelligence.sprintPrediction.factors || []).length > 0 &&
              h("ul", { className: "retro-list", style: { marginTop: "8px" } },
                phaseResults.intelligence.sprintPrediction.factors.map((f, i) => h("li", { key: i }, f))
              )
          ),

          // Monte Carlo Simulation
          phaseResults.intelligence.monteCarlo?.available && h("div", { style: { marginTop: "12px" }, key: "mc" },
            h("h4", { className: "sub-header" }, "\u{1F3B2} Monte Carlo Sprint Prediction"),
            h("p", { style: { color: "#8b949e", fontSize: "11px", marginBottom: "8px" } },
              `Based on ${phaseResults.intelligence.monteCarlo.sampleSize} historical sprint(s), ${phaseResults.intelligence.monteCarlo.iterations.toLocaleString()} simulations`
            ),
            h("div", { className: "mini-stats" },
              miniStat("P50", `${phaseResults.intelligence.monteCarlo.percentiles.p50} SP`, "#58a6ff"),
              miniStat("P75", `${phaseResults.intelligence.monteCarlo.percentiles.p75} SP`, "#3fb950"),
              miniStat("P90", `${phaseResults.intelligence.monteCarlo.percentiles.p90} SP`, "#d29922"),
              miniStat("Completion Prob.", `${phaseResults.intelligence.monteCarlo.completionProbability}%`,
                phaseResults.intelligence.monteCarlo.completionProbability >= 80 ? "#3fb950" :
                phaseResults.intelligence.monteCarlo.completionProbability >= 50 ? "#d29922" : "#f85149"),
              miniStat("Planned", `${phaseResults.intelligence.monteCarlo.plannedPoints} SP`, "#8b949e")
            ),
            h("div", { style: {
              marginTop: "8px", padding: "8px 12px", borderRadius: "6px",
              background: phaseResults.intelligence.monteCarlo.completionProbability >= 80 ? "#3fb95015" :
                          phaseResults.intelligence.monteCarlo.completionProbability >= 50 ? "#d2992215" : "#f8514915",
              border: `1px solid ${phaseResults.intelligence.monteCarlo.completionProbability >= 80 ? "#3fb95033" :
                       phaseResults.intelligence.monteCarlo.completionProbability >= 50 ? "#d2992233" : "#f8514933"}`
            } },
              h("span", { style: { fontSize: "12px", color: "#c9d1d9" } },
                `\u{1F4CA} ${phaseResults.intelligence.monteCarlo.recommendation}`),
              h("div", { style: { fontSize: "11px", color: "#8b949e", marginTop: "4px" } },
                `Historical mean: ${phaseResults.intelligence.monteCarlo.historicalMean} SP | Std dev: ${phaseResults.intelligence.monteCarlo.historicalStdDev} SP`)
            )
          ),

          // Cross-Phase Analysis
          phaseResults.intelligence.crossPhaseAnalysis?.correlations?.length > 0 && h("div", { style: { marginTop: "12px" }, key: "cross" },
            h("h4", { className: "sub-header red" }, "Cross-Phase Analysis"),
            phaseResults.intelligence.crossPhaseAnalysis.correlations.map((c, i) =>
              h("div", { key: i, style: {
                background: c.severity === "high" ? "#f8514915" : "#f0883e15",
                border: `1px solid ${c.severity === "high" ? "#f8514933" : "#f0883e33"}`,
                borderRadius: "6px", padding: "8px 10px", marginBottom: "6px", fontSize: "12px"
              } },
                h("div", { style: { display: "flex", gap: "8px", alignItems: "center" } },
                  h("span", { className: `badge ${c.severity === "high" ? "badge-fail" : "badge-warn"}` }, c.severity),
                  h("span", { style: { color: "#58a6ff" } }, `${c.from} → ${c.to}`),
                  h("strong", { style: { color: "#c9d1d9" } }, c.pattern)
                ),
                h("p", { style: { margin: "4px 0 0", color: "#8b949e", fontSize: "11px" } }, c.evidence)
              )
            ),
            phaseResults.intelligence.crossPhaseAnalysis.rootCauses?.length > 0 &&
              h("div", { style: { marginTop: "8px", padding: "8px 10px", background: "#f8514915", borderRadius: "6px" } },
                h("strong", { style: { fontSize: "11px", color: "#f85149" } }, "Root Causes: "),
                h("span", { style: { fontSize: "11px", color: "#c9d1d9" } }, phaseResults.intelligence.crossPhaseAnalysis.rootCauses.join(" | "))
              )
          ),

          // Action Recommendations
          phaseResults.intelligence.actionRecommendations?.length > 0 && h("div", { style: { marginTop: "12px" }, key: "recs" },
            h("h4", { className: "sub-header green" }, "Action Recommendations"),
            phaseResults.intelligence.actionRecommendations.map((r, i) =>
              h("div", { key: i, style: {
                background: "#1f6feb15", border: "1px solid #1f6feb33",
                borderRadius: "6px", padding: "8px 10px", marginBottom: "6px", fontSize: "12px"
              } },
                h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
                  h("strong", { style: { color: "#c9d1d9" } }, r.action),
                  h("span", { className: `badge ${r.priority === "high" ? "badge-fail" : "badge-warn"}` }, `${r.priority} | ${r.type}`)
                ),
                h("p", { style: { margin: "3px 0 0", color: "#8b949e", fontSize: "11px" } }, r.reason)
              )
            )
          )
        )
      ]),

      // Velocity
      phaseResults.velocity && renderPhaseCard("velocity", "Velocity Tracking", phaseResults.velocity, expandedPhases, togglePhase, () => [
        h("div", { className: "mini-stats", key: "stats" },
          miniStat("Avg Velocity", `${phaseResults.velocity.avgVelocity || "—"} SP`, "#58a6ff"),
          miniStat("Last 3 Sprints", `${phaseResults.velocity.last3Velocity || "—"} SP`, "#3fb950"),
          miniStat("Avg Completion", phaseResults.velocity.avgCompletion != null ? `${phaseResults.velocity.avgCompletion}%` : "—", "#d29922"),
          miniStat("Trend", phaseResults.velocity.trend || "—",
            phaseResults.velocity.trend === "Improving" ? "#3fb950" : phaseResults.velocity.trend === "Declining" ? "#f85149" : "#d29922")
        ),
        expandedPhases.velocity && h("div", { key: "details" },
          phaseResults.velocity.currentSprint && h("div", { style: { marginTop: "10px" }, key: "current" },
            h("h4", { className: "sub-header" }, "Current Sprint Breakdown"),
            h("div", { className: "mini-stats" },
              miniStat("Planned", `${phaseResults.velocity.currentSprint.planned} SP`, "#58a6ff"),
              miniStat("Completed", `${phaseResults.velocity.currentSprint.completed} SP`, "#3fb950"),
              miniStat("Spillover", `${phaseResults.velocity.currentSprint.spillover} SP`, "#f85149")
            ),
            phaseResults.velocity.currentSprint.ticketBreakdown?.length > 0 &&
              h("table", { className: "result-table", style: { marginTop: "8px" } },
                h("thead", null, h("tr", null,
                  h("th", null, "Ticket"), h("th", null, "SP"), h("th", null, "Outcome")
                )),
                h("tbody", null, phaseResults.velocity.currentSprint.ticketBreakdown.map((t, i) =>
                  h("tr", { key: i },
                    h("td", { className: "mono" }, t.ticketId || t.key),
                    h("td", null, t.storyPoints || t.sp || "—"),
                    h("td", null, h("span", { className: `badge ${t.outcome === "Completed" ? "badge-pass" : t.outcome === "Spillover" ? "badge-warn" : "badge-fail"}` }, t.outcome))
                  )
                ))
              )
          ),

          phaseResults.velocity.projection && h("div", { style: { marginTop: "10px" }, key: "proj" },
            h("h4", { className: "sub-header" }, "Next Sprint Projection"),
            h("div", { className: "mini-stats" },
              miniStat("Recommended", `${phaseResults.velocity.projection.recommendedRange?.min || "—"} – ${phaseResults.velocity.projection.recommendedRange?.max || "—"} SP`, "#58a6ff"),
              miniStat("Confidence", phaseResults.velocity.projection.confidence || "N/A", "#d29922")
            )
          )
        )
      ])
    ),

    // Sprint History
    status?.historyCount > 0 && h("div", { className: "card", style: { marginTop: "0" } },
      h("h3", null, "Sprint History"),
      h("div", null,
        (status.history || []).slice(-5).reverse().map((s, i) =>
          h("div", { key: i, className: "history-row" },
            h("span", { style: { color: "#58a6ff", minWidth: "100px" } }, s.sprintId || `Sprint ${i + 1}`),
            h("span", { style: { flex: 1, color: "#8b949e" } }, s.goal || ""),
            h("span", { style: { color: s.reviewDecision === "Sprint Done" ? "#3fb950" : "#d29922", minWidth: "130px" } }, s.reviewDecision || ""),
            h("span", { style: { color: "#8b949e", minWidth: "80px" } }, s.velocity?.trend || ""),
            h("span", { style: { color: "#484f58", minWidth: "140px", fontSize: "11px" } }, s.completedAt ? new Date(s.completedAt).toLocaleString() : "")
          )
        )
      )
    ),

    // ── AI Manager ──
    h("div", { className: "manager-section" },
      h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" } },
        h("h2", { style: { margin: 0, fontSize: "18px", color: "#c9d1d9" } }, "AI Manager — Team Performance"),
        h("button", {
          className: "btn-primary",
          onClick: runManagerEval,
          disabled: managerRunning || running
        }, managerRunning ? "Evaluating..." : "Run Manager Evaluation")
      ),

      managerReport ? h("div", null,
        h("div", { className: "manager-header", onClick: () => setManagerExpanded(!managerExpanded), style: { cursor: "pointer" } },
          h("div", { className: "mini-stats" },
            miniStat("Overall Grade", managerReport.overallGrade || "N/A",
              managerReport.overallGrade === "A" ? "#3fb950" : managerReport.overallGrade === "B" ? "#58a6ff" :
              managerReport.overallGrade === "C" ? "#d29922" : "#f85149"),
            miniStat("Score", managerReport.overallScore != null ? `${managerReport.overallScore}/100` : "N/A", "#58a6ff"),
            miniStat("Velocity", managerReport.velocityAnalysis?.trend || "N/A",
              managerReport.velocityAnalysis?.trend === "Improving" ? "#3fb950" : managerReport.velocityAnalysis?.trend === "Declining" ? "#f85149" : "#d29922"),
            miniStat("Quality", managerReport.qualityAnalysis?.defectTrend || "N/A",
              managerReport.qualityAnalysis?.defectTrend === "Improving" ? "#3fb950" : managerReport.qualityAnalysis?.defectTrend === "Worsening" ? "#f85149" : "#d29922"),
            miniStat("Predictability", managerReport.predictability?.score != null ? `${managerReport.predictability.score}/100` : "N/A", "#58a6ff"),
            miniStat("Action Follow-through", managerReport.actionFollowThrough?.followThroughRate != null ? `${managerReport.actionFollowThrough.followThroughRate}%` : "N/A", "#d29922"),
            miniStat("Sprints Analyzed", managerReport.sprintsAnalyzed || 0, "#484f58")
          ),
          h("span", { className: "expand-arrow", style: { marginTop: "8px", display: "block", textAlign: "right" } }, managerExpanded ? "\u25BC Details" : "\u25B6 Details")
        ),

        managerReport.executiveSummary && h("div", { className: "exec-summary", style: { marginTop: "10px" } },
          h("p", { style: { color: "#c9d1d9", fontSize: "13px", lineHeight: 1.6, margin: 0 } }, managerReport.executiveSummary)
        ),

        managerExpanded && h("div", { style: { marginTop: "12px" } },

          h("div", { className: "grid", style: { marginBottom: "12px" } },
            h("div", { className: "card" },
              h("h3", null, "Velocity Analysis"),
              h("div", { className: "mini-stats" },
                miniStat("Avg Velocity", managerReport.velocityAnalysis?.avgVelocity ?? "N/A", "#58a6ff"),
                miniStat("Consistency", managerReport.velocityAnalysis?.consistency || "N/A", "#d29922")
              ),
              managerReport.velocityAnalysis?.recommendation && h("p", { style: { color: "#8b949e", fontSize: "12px", marginTop: "8px" } }, managerReport.velocityAnalysis.recommendation)
            ),
            h("div", { className: "card" },
              h("h3", null, "Quality Analysis"),
              h("div", { className: "mini-stats" },
                miniStat("Rework Rate", managerReport.qualityAnalysis?.reworkRate != null ? `${managerReport.qualityAnalysis.reworkRate}%` : "N/A", "#f85149"),
                miniStat("Test Coverage", managerReport.qualityAnalysis?.testCoverage || "N/A", "#3fb950")
              ),
              managerReport.qualityAnalysis?.recommendation && h("p", { style: { color: "#8b949e", fontSize: "12px", marginTop: "8px" } }, managerReport.qualityAnalysis.recommendation)
            )
          ),

          h("div", { className: "grid", style: { marginBottom: "12px" } },
            h("div", { className: "card" },
              h("h3", null, "Predictability"),
              managerReport.predictability?.plannedVsActual && h("p", { style: { color: "#c9d1d9", fontSize: "13px" } }, managerReport.predictability.plannedVsActual),
              managerReport.predictability?.recommendation && h("p", { style: { color: "#8b949e", fontSize: "12px" } }, managerReport.predictability.recommendation)
            ),
            h("div", { className: "card" },
              h("h3", null, "Action Follow-through"),
              h("div", { className: "mini-stats" },
                miniStat("Total", managerReport.actionFollowThrough?.totalActions || 0, "#58a6ff"),
                miniStat("Addressed", managerReport.actionFollowThrough?.addressed || 0, "#3fb950"),
                miniStat("Overdue", managerReport.actionFollowThrough?.overdue || 0, "#f85149")
              ),
              managerReport.actionFollowThrough?.recommendation && h("p", { style: { color: "#8b949e", fontSize: "12px", marginTop: "8px" } }, managerReport.actionFollowThrough.recommendation)
            )
          ),

          (managerReport.riskRadar || []).length > 0 && h("div", { className: "card", style: { marginBottom: "12px" } },
            h("h3", null, "Risk Radar"),
            managerReport.riskRadar.map((r, i) =>
              h("div", { key: i, className: "risk-card", "data-severity": r.severity },
                h("div", { style: { display: "flex", gap: "8px", alignItems: "center" } },
                  h("span", { className: `badge ${r.severity === "high" ? "badge-fail" : r.severity === "medium" ? "badge-warn" : "badge-pass"}` }, r.severity),
                  h("strong", { style: { color: "#c9d1d9", fontSize: "13px" } }, r.risk),
                  r.recurring && h("span", { className: "tag tag-red" }, "Recurring")
                ),
                r.recommendation && h("p", { style: { margin: "4px 0 0", color: "#8b949e", fontSize: "12px" } }, r.recommendation)
              )
            )
          ),

          (managerReport.teamRecommendations || []).length > 0 && h("div", { className: "card", style: { marginBottom: "12px" } },
            h("h3", null, "Team Recommendations"),
            managerReport.teamRecommendations.map((r, i) =>
              h("div", { key: i, className: "feedback-card" },
                h("div", { style: { display: "flex", gap: "8px", alignItems: "center" } },
                  h("span", { className: `badge ${r.priority === "high" ? "badge-fail" : r.priority === "medium" ? "badge-warn" : "badge-pass"}` }, r.priority),
                  h("span", { className: "tag tag-green" }, r.category || "general"),
                  h("strong", { style: { color: "#c9d1d9", fontSize: "13px" } }, r.title)
                ),
                h("p", { style: { margin: "4px 0 0", color: "#8b949e", fontSize: "12px" } }, r.description)
              )
            )
          )
        )
      ) : h("div", { style: { color: "#484f58", fontSize: "12px", padding: "12px" } },
        "Run a full sprint cycle first, then click \"Run Manager Evaluation\" to get cross-sprint performance analysis."
      )
    ),

    // Responsible AI Card
    raiSummary && h("div", { className: "card", style: { borderLeft: "3px solid #8b5cf6" } },
      h("h3", { style: { margin: "0 0 12px 0", color: "#8b5cf6" } }, "Responsible AI Dashboard"),
      h("div", { style: { display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "12px" } },
        miniStat("Audit Events", raiSummary.aggregate?.totalAuditEvents || 0, "#8b5cf6"),
        miniStat("Validation Flags", raiSummary.aggregate?.requiresValidationCount || 0, "#f0883e"),
        miniStat("LLM Warnings", raiSummary.aggregate?.validationWarnings || 0, raiSummary.aggregate?.validationWarnings > 0 ? "#f85149" : "#3fb950"),
        miniStat("Mode", raiSummary.aggregate?.offlineMode ? "Offline" : "Online", raiSummary.aggregate?.offlineMode ? "#3fb950" : "#58a6ff")
      ),
      h("div", { style: { marginBottom: "10px" } },
        h("strong", { style: { fontSize: "12px", color: "#c9d1d9" } }, "Data Sources Across Phases"),
        h("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "6px" } },
          ...Object.entries(raiSummary.aggregate?.dataSources || {}).map(([ds, count]) =>
            h("span", { key: ds, className: "badge", style: {
              background: ds.includes("LLM") ? "#1f6feb33" : ds.includes("Rule") ? "#23853133" : ds.includes("Foundry") ? "#8b5cf633" : "#30363d",
              color: "#c9d1d9", padding: "3px 8px", borderRadius: "12px", fontSize: "11px"
            } }, `${ds} (${count})`)
          )
        )
      ),
      h("div", null,
        h("strong", { style: { fontSize: "12px", color: "#c9d1d9" } }, "Agent Audit Health"),
        h("div", { style: { display: "flex", gap: "8px", marginTop: "6px" } },
          ...Object.entries(raiSummary.agents || {}).map(([agent, info]) =>
            h("span", { key: agent, style: {
              padding: "3px 8px", borderRadius: "12px", fontSize: "11px",
              background: info.healthy ? "#23853133" : "#f8514933",
              color: info.healthy ? "#3fb950" : "#f85149"
            } }, `${agent}: ${info.auditEvents} events`)
          )
        )
      ),
      h("div", { style: { marginTop: "10px", fontSize: "11px", color: "#8b949e", borderTop: "1px solid #30363d", paddingTop: "8px" } },
        "All AI outputs include dataSources, confidence scores, requiresValidation flags, and LLM output validation. ",
        "Audit trails are available per-agent at /api/audit endpoints."
      )
    ),

    // Event Log
    h("div", { className: "card" },
      h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
        h("h3", { style: { margin: 0 } }, "Event Log"),
        h("span", { style: { fontSize: "11px", color: "#484f58" } }, `${events.length} events`)
      ),
      h("div", { className: "event-log", style: { marginTop: "10px" } },
        events.length === 0
          ? h("div", { style: { color: "#484f58", fontSize: "12px" } }, "No events yet. Run a phase or full cycle to see events here.")
          : [...events].reverse().map((evt, i) =>
              h("div", { key: i, className: "entry" },
                h("span", { className: "time" }, evt.time ? new Date(evt.time).toLocaleTimeString() : ""),
                h("span", { className: `etype ${eventClass(evt.type)}` }, evt.type),
                h("span", { className: "emsg" },
                  evt.data?.phase ? `[${evt.data.phase}] ` : "",
                  evt.data?.message || evt.data?.error || evt.data?.decision || evt.data?.agent
                    ? (evt.data.message || evt.data.error || evt.data.decision || `${evt.data.agent || ""} ${evt.data.path || ""}`)
                    : JSON.stringify(evt.data || {})
                )
              )
            )
      )
    )
  );
}

createRoot(document.getElementById("root")).render(h(App));
