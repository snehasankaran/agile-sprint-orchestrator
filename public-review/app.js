import React, { useState, useEffect, useRef, useCallback } from "https://esm.sh/react@18";
import { createRoot } from "https://esm.sh/react-dom@18/client";

async function callJson(url, payload, method = "POST") {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(payload || {})
  });
  const raw = await res.text();
  let data;
  try { data = raw ? JSON.parse(raw) : {}; } catch { throw new Error(`Non-JSON response (HTTP ${res.status})`); }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function TicketCard({ ticket, reviewResult }) {
  if (!ticket) return null;
  const status = ticket.status || "Unknown";
  const isDone = /^(done|closed|resolved)$/i.test(status);
  const borderColor = isDone ? "#3fb950" : "#d29922";

  const rev = reviewResult || {};
  const decision = rev.decision || "";
  const decisionColor = decision === "On Track" ? "#3fb950"
    : decision === "Spillover" ? "#f85149"
    : decision === "Critical Failure" ? "#f85149"
    : decision === "High Risk" ? "#f85149"
    : decision === "At Risk" ? "#d29922"
    : "#8b949e";

  return React.createElement("div", {
    className: "card",
    style: { marginTop: "8px", background: "#0d1117", borderLeft: `4px solid ${reviewResult ? decisionColor : borderColor}` }
  },
    React.createElement("h3", { style: { margin: "0 0 6px 0" } },
      `${ticket.ticketId || ticket.key || "?"} — ${ticket.prSummary || ticket.summary || ""}`
    ),
    React.createElement("p", { className: "small", style: { margin: "2px 0" } },
      `Status: `,
      React.createElement("span", { style: { color: isDone ? "#3fb950" : "#d29922", fontWeight: "bold" } }, status),
      ticket.storyPoints ? ` | ${ticket.storyPoints} SP` : ""
    ),
    Array.isArray(ticket.acceptanceCriteria) && ticket.acceptanceCriteria.length > 0 &&
      React.createElement("div", { style: { marginTop: "4px" } },
        React.createElement("span", { className: "small", style: { fontWeight: "bold" } }, "Acceptance Criteria:"),
        React.createElement("ol", { style: { margin: "2px 0 0 16px", fontSize: "12px" } },
          ticket.acceptanceCriteria.map((c, i) => React.createElement("li", { key: i }, c))
        )
      ),

    reviewResult && React.createElement("div", {
      style: { marginTop: "8px", padding: "8px", background: "rgba(88,166,255,0.08)", borderRadius: "4px", borderLeft: `3px solid ${decisionColor}` }
    },
      React.createElement("p", { style: { margin: "0 0 4px 0" } },
        React.createElement("strong", null, "AI Decision: "),
        React.createElement("span", { style: { color: decisionColor, fontWeight: "bold" } }, decision)
      ),
      rev.confidence != null && React.createElement("p", { className: "small", style: { margin: "2px 0" } }, `Confidence: ${rev.confidence}%`),
      rev.summary && React.createElement("p", { className: "small", style: { margin: "2px 0" } }, rev.summary),
      rev.metrics && React.createElement("p", { className: "small", style: { margin: "2px 0" } },
        `Acceptance: ${rev.metrics.acceptanceCoveragePercent}% | Test failures: ${rev.metrics.testFailureRatePercent}% | Coverage: ${rev.metrics.codeCoveragePercent}%`
      ),
      Array.isArray(rev.risks) && rev.risks.length > 0 && React.createElement("div", { style: { marginTop: "4px" } },
        React.createElement("strong", { className: "small", style: { color: "#f85149" } }, "Risks:"),
        React.createElement("ul", { style: { margin: "2px 0 0 16px" } },
          rev.risks.map((r, i) => React.createElement("li", { key: i, className: "small" }, r))
        )
      ),
      Array.isArray(rev.recommendations) && rev.recommendations.length > 0 && React.createElement("div", { style: { marginTop: "4px" } },
        React.createElement("strong", { className: "small" }, "Recommendations:"),
        React.createElement("ul", { style: { margin: "2px 0 0 16px" } },
          rev.recommendations.map((r, i) => React.createElement("li", { key: i, className: "small" }, r))
        )
      ),
      Array.isArray(rev.rationale) && rev.rationale.length > 0 && React.createElement("div", { style: { marginTop: "4px" } },
        React.createElement("strong", { className: "small" }, "Rationale:"),
        React.createElement("ul", { style: { margin: "2px 0 0 16px" } },
          rev.rationale.map((r, i) => React.createElement("li", { key: i, className: "small" }, r))
        )
      )
    )
  );
}

function App() {
  const [boards, setBoards] = useState([]);
  const [sprints, setSprints] = useState([]);
  const [jiraBoardId, setJiraBoardId] = useState("");
  const [jiraSprintId, setJiraSprintId] = useState("");
  const [loadingBoards, setLoadingBoards] = useState(false);
  const [loadingSprints, setLoadingSprints] = useState(false);
  const [tickets, setTickets] = useState([]);
  const [ticketsSource, setTicketsSource] = useState("");
  const [loadingTickets, setLoadingTickets] = useState(false);

  const [feedbackSaved, setFeedbackSaved] = useState([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [teamsMeetingId, setTeamsMeetingId] = useState("");
  const [teamsToken, setTeamsToken] = useState("");

  const [reviewResult, setReviewResult] = useState(null);
  const [reviewLoading, setReviewLoading] = useState(false);

  const [retroWentWell, setRetroWentWell] = useState("");
  const [retroDidntGoWell, setRetroDidntGoWell] = useState("");
  const [retroImprovements, setRetroImprovements] = useState("");
  const [retroTranscript, setRetroTranscript] = useState("");
  const [retroResult, setRetroResult] = useState(null);
  const [retroLoading, setRetroLoading] = useState(false);
  const [retroTranscriptLoading, setRetroTranscriptLoading] = useState(false);
  const [retroMeetingId, setRetroMeetingId] = useState("");
  const [retroToken, setRetroToken] = useState("");

  const [velocityData, setVelocityData] = useState(null);
  const [velocityLoading, setVelocityLoading] = useState(false);
  const velocityChartRef = useRef(null);
  const burndownChartRef = useRef(null);
  const velocityChartInstance = useRef(null);
  const burndownChartInstance = useRef(null);

  const [status, setStatus] = useState("Ready.");

  useEffect(() => {
    setLoadingBoards(true);
    fetch("/api/jira/boards")
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d.boards)) setBoards(d.boards);
      })
      .catch(() => {})
      .finally(() => setLoadingBoards(false));
  }, []);

  useEffect(() => {
    if (!jiraBoardId) { setSprints([]); setJiraSprintId(""); return; }
    setLoadingSprints(true);
    setSprints([]);
    setJiraSprintId("");
    fetch(`/api/jira/boards/${jiraBoardId}/sprints`)
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d.sprints)) {
          setSprints(d.sprints);
          const active = d.sprints.find(s => s.state === "active");
          if (active) setJiraSprintId(String(active.id));
        }
      })
      .catch(() => {})
      .finally(() => setLoadingSprints(false));
  }, [jiraBoardId]);

  async function loadJiraTickets() {
    if (!jiraBoardId && !jiraSprintId) { setStatus("Select a board and sprint first."); return; }
    setLoadingTickets(true);
    setTickets([]);
    setReviewResult(null);
    setTicketsSource("");
    setStatus("Loading tickets from JIRA...");
    try {
      const payload = {};
      if (jiraSprintId) payload.sprintId = Number(jiraSprintId);
      if (jiraBoardId) payload.boardId = Number(jiraBoardId);
      const data = await callJson("/api/review/sprint/jira/tickets", payload);
      const selectedSprint = sprints.find(s => String(s.id) === String(data.sprintId));
      const sprintLabel = selectedSprint ? selectedSprint.name : `Sprint ${data.sprintId || ""}`;
      setTickets(data.tickets || []);
      setTicketsSource(`JIRA — ${sprintLabel}`);
      setStatus(`Loaded ${(data.tickets || []).length} tickets from JIRA.`);
    } catch (err) {
      setStatus(`Error loading JIRA tickets: ${err.message}`);
    }
    setLoadingTickets(false);
  }

  async function loadDataFetch() {
    if (!jiraBoardId && !jiraSprintId) { setStatus("Select a board and sprint first for Data Fetch."); return; }
    setLoadingTickets(true);
    setTickets([]);
    setReviewResult(null);
    setTicketsSource("");
    setStatus("Fetching JIRA sprint tickets with simulated work product data...");
    try {
      const payload = {};
      if (jiraSprintId) payload.sprintId = Number(jiraSprintId);
      if (jiraBoardId) payload.boardId = Number(jiraBoardId);
      const data = await callJson("/api/review/sprint/jira/simulate", payload);
      const selectedSprint = sprints.find(s => String(s.id) === String(data.sprintId));
      const sprintLabel = selectedSprint ? selectedSprint.name : `Sprint ${data.sprintId || ""}`;
      setTickets(data.tickets || []);
      setTicketsSource(`${sprintLabel} (data fetch)`);
      setStatus(`Loaded ${(data.tickets || []).length} tickets from JIRA with all scenario data.`);
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
    setLoadingTickets(false);
  }

  async function fetchTranscript() {
    setFeedbackLoading(true);
    setStatus("Loading review meeting transcript...");
    try {
      const sprintId = jiraSprintId || "SPRINT-REVIEW";
      const data = await callJson("/api/review/feedback/teams/simulated", {
        sprintId,
        tickets
      });
      const record = data.record || {};
      setFeedbackSaved(prev => [...prev, {
        stakeholder: record.stakeholder || "Stakeholder",
        sentiment: record.sentiment || "neutral",
        feedback: record.feedback || "",
        source: "review meeting"
      }]);
      setStatus("Feedback extracted from review meeting transcript.");
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
    setFeedbackLoading(false);
  }

  async function fetchTeamsTranscript() {
    if (!teamsMeetingId.trim()) { setStatus("Enter a Teams Meeting ID."); return; }
    setFeedbackLoading(true);
    setStatus("Fetching transcript from Teams meeting...");
    try {
      const sprintId = jiraSprintId || "SPRINT-REVIEW";
      const data = await callJson("/api/review/feedback/teams", {
        sprintId,
        meetingId: teamsMeetingId.trim(),
        token: teamsToken.trim() || undefined
      });
      const record = data.record || {};
      setFeedbackSaved(prev => [...prev, {
        stakeholder: record.stakeholder || "Stakeholder",
        sentiment: record.sentiment || "neutral",
        feedback: record.feedback || "",
        source: record.source || "teams"
      }]);
      setStatus(`Teams transcript feedback extracted (${record.source || "graph"}).`);
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
    setFeedbackLoading(false);
  }

  async function runSprintReview() {
    if (!tickets.length) { setStatus("Load sprint tickets first."); return; }
    setReviewLoading(true);
    setReviewResult(null);
    setStatus("Running sprint review — evaluating all tickets with AI...");
    try {
      const payload = {
        tickets,
        sprintId: jiraSprintId || "SPRINT-REVIEW",
        stakeholderFeedback: feedbackSaved.map(fb => ({
          stakeholder: fb.stakeholder,
          sentiment: fb.sentiment,
          feedback: fb.feedback,
          followUpTickets: []
        }))
      };
      const data = await callJson("/api/review/sprint", payload);
      setReviewResult(data);
      setRetroResult(null);

      const well = [];
      const bad = [];
      if (Array.isArray(data.completedCorrectly)) {
        for (const t of data.completedCorrectly) well.push(`${t.ticketId} — completed correctly and accepted.`);
      }
      if (Array.isArray(data.reviewedTickets)) {
        for (const rt of data.reviewedTickets) {
          if (rt.decision === "On Track" && !well.some(w => w.startsWith(rt.ticketId))) {
            well.push(`${rt.ticketId} — on track with ${rt.confidence || "N/A"}% confidence.`);
          }
          const m = rt.metrics || {};
          if (m.codeCoveragePercent >= 80 && m.testFailureRatePercent === 0) {
            well.push(`${rt.ticketId} — strong test coverage (${m.codeCoveragePercent}%) with zero failures.`);
          }
        }
      }
      const metrics = data.metrics || {};
      if (metrics.completedCorrectPercent >= 50) {
        well.push(`${metrics.completedCorrectPercent}% sprint completion rate — met delivery target.`);
      }
      if (metrics.completedCorrectly > 0) {
        well.push(`${metrics.completedCorrectly} out of ${metrics.totalTickets} tickets delivered successfully.`);
      }
      if (Array.isArray(data.stakeholderFeedbackConsidered)) {
        for (const fb of data.stakeholderFeedbackConsidered) {
          if (String(fb.sentiment || "").toLowerCase() === "positive") well.push(`${fb.stakeholder || "Stakeholder"}: ${String(fb.feedback || "").slice(0, 150)}`);
          if (String(fb.sentiment || "").toLowerCase() === "negative") bad.push(`${fb.stakeholder || "Stakeholder"}: ${String(fb.feedback || "").slice(0, 150)}`);
        }
      }
      if (Array.isArray(data.spillover)) {
        for (const t of data.spillover) bad.push(`${t.ticketId} — not completed (${t.status}).`);
      }
      if (Array.isArray(data.incorrectImplementation)) {
        for (const t of data.incorrectImplementation) bad.push(`${t.ticketId} — failed acceptance checks (${t.decision}).`);
      }
      setRetroWentWell(well.join("\n"));
      setRetroDidntGoWell(bad.join("\n"));
      setRetroImprovements("");
      setStatus(`Sprint review complete: ${data.decision || "N/A"}`);
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
    setReviewLoading(false);
  }

  async function saveValidation(decision) {
    if (!reviewResult) return;
    try {
      await callJson("/api/validate", { reviewer: "Product Owner", decision, section: "sprint_review", insight: reviewResult });
      setStatus(`Validation saved: ${decision}`);
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
  }

  async function fetchRetroTranscript() {
    setRetroTranscriptLoading(true);
    setStatus("Loading retro meeting transcript...");
    try {
      const data = await callJson("/api/retro/feedback/transcript", { reviewResult });
      setRetroTranscript(data.transcript || "");
      setStatus("Retro meeting transcript loaded.");
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
    setRetroTranscriptLoading(false);
  }

  async function fetchRetroTeamsTranscript() {
    if (!retroMeetingId.trim()) { setStatus("Enter a Teams Meeting ID."); return; }
    setRetroTranscriptLoading(true);
    setStatus("Fetching retro transcript from Teams meeting...");
    try {
      const data = await callJson("/api/review/feedback/teams", {
        sprintId: jiraSprintId || "SPRINT-RETRO",
        meetingId: retroMeetingId.trim(),
        token: retroToken.trim() || undefined
      });
      const record = data.record || {};
      setRetroTranscript(record.feedback || "");
      setStatus("Teams retro transcript loaded.");
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
    setRetroTranscriptLoading(false);
  }

  async function generateRetroInsights() {
    setRetroLoading(true);
    setRetroResult(null);
    setStatus("Generating retrospective insights...");
    try {
      const data = await callJson("/api/retro/generate", {
        reviewResult,
        wentWell: retroWentWell.split("\n").filter(Boolean),
        didntGoWell: retroDidntGoWell.split("\n").filter(Boolean),
        improvements: retroImprovements.split("\n").filter(Boolean),
        transcript: retroTranscript
      });
      setRetroResult(data);
      setStatus("Retrospective insights generated.");
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
    setRetroLoading(false);
  }

  async function saveRetroActions() {
    if (!retroResult) return;
    setStatus("Saving retro action items...");
    try {
      await callJson("/api/retro/actions/save", {
        sprintId: jiraSprintId || "SPRINT-RETRO",
        actionItems: retroResult.actionItems || [],
        patterns: retroResult.patterns || [],
        teamHealth: retroResult.teamHealth || {}
      });
      setStatus("Retro action items saved.");
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
  }

  async function loadVelocityData() {
    if (!reviewResult) { setStatus("Run Sprint Review first — velocity is derived from review results."); return; }
    setVelocityLoading(true);
    setStatus("Loading velocity data from review results...");
    try {
      const data = await callJson("/api/velocity/data", { reviewResult });
      setVelocityData(data);
      setStatus("Velocity data loaded — current sprint derived from review results.");
    } catch (err) {
      setStatus(`Error loading velocity data: ${err.message}`);
    }
    setVelocityLoading(false);
  }

  function exportVelocityCsv() {
    window.open("/api/velocity/export", "_blank");
  }

  const renderVelocityChart = useCallback(() => {
    if (!velocityData?.history?.length || !velocityChartRef.current) return;
    if (velocityChartInstance.current) velocityChartInstance.current.destroy();
    const ctx = velocityChartRef.current.getContext("2d");
    const labels = velocityData.history.map(s => s.sprintName.replace(/\s*\(.*\)/, ""));
    velocityChartInstance.current = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Planned",
            data: velocityData.history.map(s => s.plannedPoints),
            backgroundColor: "rgba(0, 82, 204, 0.15)",
            borderColor: "#58a6ff",
            borderWidth: 2,
            borderRadius: 6,
            order: 2
          },
          {
            label: "Completed",
            data: velocityData.history.map(s => s.completedPoints),
            backgroundColor: "rgba(34, 134, 58, 0.7)",
            borderColor: "#3fb950",
            borderWidth: 2,
            borderRadius: 6,
            order: 1
          },
          {
            label: "Spillover",
            data: velocityData.history.map(s => s.spilloverPoints),
            backgroundColor: "rgba(201, 55, 44, 0.7)",
            borderColor: "#f85149",
            borderWidth: 2,
            borderRadius: 6,
            order: 3
          },
          {
            type: "line",
            label: "Velocity Trend",
            data: velocityData.history.map(s => s.velocityPoints),
            borderColor: "#6f42c1",
            backgroundColor: "rgba(111, 66, 193, 0.1)",
            borderWidth: 3,
            pointRadius: 5,
            pointBackgroundColor: "#6f42c1",
            fill: true,
            tension: 0.3,
            order: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top", labels: { usePointStyle: true, padding: 16, font: { size: 12 } } },
          tooltip: {
            backgroundColor: "rgba(201, 209, 217, 0.9)",
            titleFont: { size: 13 },
            bodyFont: { size: 12 },
            cornerRadius: 6,
            padding: 10
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: "Story Points", font: { size: 13, weight: "bold" } },
            grid: { color: "rgba(255,255,255,0.06)" }
          },
          x: {
            grid: { display: false }
          }
        }
      }
    });
  }, [velocityData]);

  const renderBurndownChart = useCallback(() => {
    if (!velocityData?.burndown?.length || !burndownChartRef.current) return;
    if (burndownChartInstance.current) burndownChartInstance.current.destroy();
    const ctx = burndownChartRef.current.getContext("2d");
    const labels = velocityData.burndown.map(b => `Day ${b.day}`);
    burndownChartInstance.current = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Ideal Burndown",
            data: velocityData.burndown.map(b => b.ideal),
            borderColor: "#58a6ff",
            borderWidth: 2,
            borderDash: [8, 4],
            pointRadius: 3,
            pointBackgroundColor: "#58a6ff",
            fill: false,
            tension: 0
          },
          {
            label: "Actual Burndown",
            data: velocityData.burndown.map(b => b.actual),
            borderColor: "#f85149",
            backgroundColor: "rgba(201, 55, 44, 0.08)",
            borderWidth: 3,
            pointRadius: 5,
            pointBackgroundColor: "#f85149",
            fill: true,
            tension: 0.2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top", labels: { usePointStyle: true, padding: 16, font: { size: 12 } } },
          tooltip: {
            backgroundColor: "rgba(201, 209, 217, 0.9)",
            cornerRadius: 6,
            padding: 10
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: "Remaining Points", font: { size: 13, weight: "bold" } },
            grid: { color: "rgba(255,255,255,0.06)" }
          },
          x: {
            title: { display: true, text: "Sprint Day", font: { size: 13, weight: "bold" } },
            grid: { display: false }
          }
        }
      }
    });
  }, [velocityData]);

  useEffect(() => {
    if (velocityData) {
      setTimeout(() => { renderVelocityChart(); renderBurndownChart(); }, 100);
    }
    return () => {
      if (velocityChartInstance.current) velocityChartInstance.current.destroy();
      if (burndownChartInstance.current) burndownChartInstance.current.destroy();
    };
  }, [velocityData, renderVelocityChart, renderBurndownChart]);

  const committed = reviewResult?.completedCorrectly || [];
  const spillover = reviewResult?.spillover || [];
  const incorrect = reviewResult?.incorrectImplementation || [];
  const reviewedMap = {};
  if (reviewResult && Array.isArray(reviewResult.reviewedTickets)) {
    for (const rt of reviewResult.reviewedTickets) {
      if (rt.ticketId) reviewedMap[rt.ticketId] = rt;
    }
  }

  return React.createElement("div", { className: "container" },
    React.createElement("div", { className: "header" },
      React.createElement("div", null,
        React.createElement("h1", null, "\u{1F50D} Sprint Review Agent"),
        React.createElement("div", { className: "subtitle" }, "Evaluate sprint delivery, validate acceptance criteria, and generate retrospective insights")
      ),
      React.createElement("div", { className: "header-actions" },
        React.createElement("span", { className: "badge badge-info" }, "Port 5050")
      )
    ),
    React.createElement("p", { className: "small" }, status),

    // ── Section 1: Load Sprint Data ──
    React.createElement("div", { className: "card" },
      React.createElement("h2", null, "1) Load Sprint Tickets"),
      React.createElement("p", { className: "small" }, "Select a JIRA board and sprint to pull tickets, or use simulated data for demo."),
      React.createElement("div", { className: "row", style: { marginBottom: "8px" } },
        React.createElement("div", { className: "field" },
          React.createElement("label", null, "JIRA Board"),
          React.createElement("select", {
            value: jiraBoardId,
            onChange: e => setJiraBoardId(e.target.value),
            disabled: loadingBoards
          },
            React.createElement("option", { value: "" }, loadingBoards ? "Loading boards..." : "— Select Board —"),
            boards.map(b => React.createElement("option", { key: b.id, value: b.id }, `${b.name} (${b.type})`))
          )
        ),
        React.createElement("div", { className: "field" },
          React.createElement("label", null, "Sprint"),
          React.createElement("select", {
            value: jiraSprintId,
            onChange: e => setJiraSprintId(e.target.value),
            disabled: !jiraBoardId || loadingSprints
          },
            React.createElement("option", { value: "" },
              !jiraBoardId ? "— Select a board first —" : loadingSprints ? "Loading sprints..." : "— Select Sprint —"
            ),
            sprints.map(s => React.createElement("option", { key: s.id, value: s.id },
              `${s.name}${s.state ? ` (${s.state})` : ""}`
            ))
          )
        )
      ),
      React.createElement("div", { className: "row", style: { marginTop: "4px" } },
        React.createElement("button", {
          onClick: loadJiraTickets,
          disabled: loadingTickets || (!jiraBoardId && !jiraSprintId),
          style: { marginRight: "8px" }
        },
          loadingTickets ? "Loading..." : "Load from JIRA"
        ),
        React.createElement("button", {
          onClick: loadDataFetch,
          disabled: loadingTickets || (!jiraBoardId && !jiraSprintId),
          style: { background: "#161b22", color: "#c9d1d9", border: "1px solid #30363d" }
        }, "Data Fetch")
      )
    ),

    // ── Section 2: Current Sprint Tickets ──
    tickets.length > 0 && React.createElement("div", { className: "card", style: { background: "rgba(210,153,34,0.08)" } },
      React.createElement("h2", null, "2) Current Sprint Tickets"),
      React.createElement("p", { className: "small" },
        `${tickets.length} tickets loaded`,
        ticketsSource ? ` from ${ticketsSource}` : "",
        `. ${tickets.filter(t => /^(done|closed|resolved)$/i.test(t.status)).length} Done, ${tickets.filter(t => !/^(done|closed|resolved)$/i.test(t.status)).length} In Progress / Open.`
      ),
      tickets.map((t, i) => React.createElement(TicketCard, { key: i, ticket: t }))
    ),

    // ── Section 3: Stakeholder Feedback ──
    tickets.length > 0 && React.createElement("div", { className: "card" },
      React.createElement("h2", null, "3) Stakeholder Feedback (Review Meeting)"),
      React.createElement("p", { className: "small" }, "Load the sprint review meeting transcript to extract stakeholder feedback."),

      React.createElement("div", { style: { display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "12px" } },
        React.createElement("div", { style: { flex: 1, padding: "12px", background: "#0d1117", borderRadius: "6px", border: "1px solid #30363d" } },
          React.createElement("p", { className: "small", style: { fontWeight: "bold", marginBottom: "6px" } }, "Review Meeting Transcript"),
          React.createElement("p", { className: "small", style: { marginBottom: "8px" } }, "Load the sprint review meeting transcript and extract stakeholder feedback from it."),
          React.createElement("button", {
            onClick: fetchTranscript,
            disabled: feedbackLoading,
            style: { width: "100%" }
          }, feedbackLoading ? "Loading..." : "Fetch Transcript")
        ),
        React.createElement("div", { style: { flex: 1, padding: "12px", background: "#0d1117", borderRadius: "6px", border: "1px solid #30363d" } },
          React.createElement("p", { className: "small", style: { fontWeight: "bold", marginBottom: "6px" } }, "Teams Meeting Transcript"),
          React.createElement("p", { className: "small", style: { marginBottom: "8px" } }, "Load the transcript from a Microsoft Teams review meeting."),
          React.createElement("div", { className: "field", style: { marginBottom: "6px" } },
            React.createElement("input", {
              value: teamsMeetingId,
              onChange: e => setTeamsMeetingId(e.target.value),
              placeholder: "Teams Meeting ID (e.g. MSo1N2Y5...)"
            })
          ),
          React.createElement("div", { className: "field", style: { marginBottom: "8px" } },
            React.createElement("input", {
              type: "password",
              value: teamsToken,
              onChange: e => setTeamsToken(e.target.value),
              placeholder: "Graph API Token (optional)"
            })
          ),
          React.createElement("button", {
            onClick: fetchTeamsTranscript,
            disabled: feedbackLoading || !teamsMeetingId.trim(),
            style: { width: "100%", background: "#161b22", color: "#c9d1d9", border: "1px solid #30363d" }
          }, feedbackLoading ? "Fetching..." : "Fetch from Meeting ID")
        )
      ),

      feedbackSaved.length > 0 && React.createElement("div", { style: { marginTop: "4px" } },
        React.createElement("p", { className: "small", style: { fontWeight: "bold" } }, `${feedbackSaved.length} feedback item(s) extracted:`),
        feedbackSaved.map((fb, i) => React.createElement("div", {
          key: i, className: "small",
          style: { padding: "6px 8px", marginTop: "4px", background: fb.sentiment === "positive" ? "rgba(63,185,80,0.08)" : fb.sentiment === "negative" ? "rgba(248,81,73,0.08)" : "#0d1117", borderRadius: "4px", borderLeft: `3px solid ${fb.sentiment === "positive" ? "#3fb950" : fb.sentiment === "negative" ? "#f85149" : "#8b949e"}` }
        },
          React.createElement("strong", null, `${fb.stakeholder} (${fb.sentiment}): `),
          fb.feedback,
          fb.source && React.createElement("span", { style: { marginLeft: "8px", fontStyle: "italic", color: "#8b949e" } }, `[${fb.source}]`)
        ))
      )
    ),

    // ── Section 4: Run Sprint Review ──
    tickets.length > 0 && React.createElement("div", { className: "card", style: { textAlign: "center", padding: "20px" } },
      React.createElement("h2", null, "4) Run Sprint Review"),
      React.createElement("p", { className: "small" }, "AI evaluates every ticket against acceptance criteria, tests, coverage, and stakeholder feedback to determine sprint outcome."),
      React.createElement("button", {
        onClick: runSprintReview,
        disabled: reviewLoading,
        style: { padding: "12px 32px", fontSize: "16px" }
      }, reviewLoading ? "Reviewing..." : "Run Sprint Review")
    ),

    // ── Section 5: Results ──
    reviewResult && React.createElement("div", null,

      // Demo Summary
      reviewResult.demoSummary && React.createElement("div", { className: "card", style: { background: "#0d1117" } },
        React.createElement("h2", null, "Demo Summary"),
        React.createElement("p", { style: { fontWeight: "bold", fontSize: "16px", color: reviewResult.decision === "Sprint Done" ? "#3fb950" : "#f85149" } },
          reviewResult.demoSummary.opening || reviewResult.decision
        ),
        Array.isArray(reviewResult.demoSummary.highlights) && React.createElement("ul", null,
          reviewResult.demoSummary.highlights.map((h, i) => React.createElement("li", { key: i, className: "small" }, h))
        )
      ),

      // Sprint Metrics — Summary Cards
      reviewResult.metrics && React.createElement("div", { className: "card" },
        React.createElement("h2", null, "Sprint Metrics"),
        React.createElement("div", { className: "row", style: { gap: "12px", marginBottom: "16px" } },
          React.createElement("div", { style: { flex: 1, textAlign: "center", padding: "12px", background: "rgba(63,185,80,0.08)", borderRadius: "8px" } },
            React.createElement("div", { style: { fontSize: "28px", fontWeight: "bold", color: "#3fb950" } }, reviewResult.metrics.completedCorrectly),
            React.createElement("div", { className: "small" }, "Committed & Closed")
          ),
          React.createElement("div", { style: { flex: 1, textAlign: "center", padding: "12px", background: "rgba(210,153,34,0.08)", borderRadius: "8px" } },
            React.createElement("div", { style: { fontSize: "28px", fontWeight: "bold", color: "#d29922" } }, reviewResult.metrics.incorrectImplementation),
            React.createElement("div", { className: "small" }, "Needs Rework")
          ),
          React.createElement("div", { style: { flex: 1, textAlign: "center", padding: "12px", background: "rgba(248,81,73,0.08)", borderRadius: "8px" } },
            React.createElement("div", { style: { fontSize: "28px", fontWeight: "bold", color: "#f85149" } }, reviewResult.metrics.spillover),
            React.createElement("div", { className: "small" }, "Not Closed (Spillover)")
          ),
          React.createElement("div", { style: { flex: 1, textAlign: "center", padding: "12px", background: "rgba(88,166,255,0.08)", borderRadius: "8px" } },
            React.createElement("div", { style: { fontSize: "28px", fontWeight: "bold", color: "#58a6ff" } }, `${reviewResult.metrics.completedCorrectPercent}%`),
            React.createElement("div", { className: "small" }, "Completion Rate")
          ),
          React.createElement("div", { style: { flex: 1, textAlign: "center", padding: "12px", background: "rgba(210,168,255,0.08)", borderRadius: "8px" } },
            React.createElement("div", { style: { fontSize: "28px", fontWeight: "bold", color: "#c9d1d9" } }, reviewResult.metrics.totalTickets),
            React.createElement("div", { className: "small" }, "Total Tickets")
          )
        ),

        // Per-ticket metrics table
        Array.isArray(reviewResult.reviewedTickets) && reviewResult.reviewedTickets.length > 0 &&
          React.createElement("div", null,
            React.createElement("h3", { style: { marginBottom: "6px" } }, "Per-Ticket Breakdown"),
            React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: "13px" } },
              React.createElement("thead", null,
                React.createElement("tr", { style: { background: "#161b22" } },
                  React.createElement("th", { style: { padding: "6px 8px", textAlign: "left", border: "1px solid #21262d" } }, "Ticket"),
                  React.createElement("th", { style: { padding: "6px 8px", textAlign: "center", border: "1px solid #21262d" } }, "Decision"),
                  React.createElement("th", { style: { padding: "6px 8px", textAlign: "center", border: "1px solid #21262d" } }, "Confidence"),
                  React.createElement("th", { style: { padding: "6px 8px", textAlign: "center", border: "1px solid #21262d" } }, "Acceptance %"),
                  React.createElement("th", { style: { padding: "6px 8px", textAlign: "center", border: "1px solid #21262d" } }, "Test Fail %"),
                  React.createElement("th", { style: { padding: "6px 8px", textAlign: "center", border: "1px solid #21262d" } }, "Coverage %"),
                  React.createElement("th", { style: { padding: "6px 8px", textAlign: "left", border: "1px solid #21262d" } }, "Summary")
                )
              ),
              React.createElement("tbody", null,
                reviewResult.reviewedTickets.map((rt, i) => {
                  const dec = rt.decision || "";
                  const decColor = dec === "On Track" ? "#3fb950" : dec === "Spillover" ? "#f85149" : dec === "Critical Failure" ? "#f85149" : dec === "High Risk" ? "#f85149" : dec === "At Risk" ? "#d29922" : "#8b949e";
                  const m = rt.metrics || {};
                  return React.createElement("tr", { key: i },
                    React.createElement("td", { style: { padding: "6px 8px", border: "1px solid #21262d", fontWeight: "bold" } }, rt.ticketId || "?"),
                    React.createElement("td", { style: { padding: "6px 8px", border: "1px solid #21262d", textAlign: "center", fontWeight: "bold", color: decColor } }, dec),
                    React.createElement("td", { style: { padding: "6px 8px", border: "1px solid #21262d", textAlign: "center" } }, rt.confidence != null ? `${rt.confidence}%` : "—"),
                    React.createElement("td", { style: { padding: "6px 8px", border: "1px solid #21262d", textAlign: "center", color: (m.acceptanceCoveragePercent || 0) === 100 ? "#3fb950" : (m.acceptanceCoveragePercent || 0) >= 66 ? "#d29922" : "#f85149" } }, m.acceptanceCoveragePercent != null ? `${m.acceptanceCoveragePercent}%` : "—"),
                    React.createElement("td", { style: { padding: "6px 8px", border: "1px solid #21262d", textAlign: "center", color: (m.testFailureRatePercent || 0) === 0 ? "#3fb950" : (m.testFailureRatePercent || 0) <= 10 ? "#d29922" : "#f85149" } }, m.testFailureRatePercent != null ? `${m.testFailureRatePercent}%` : "—"),
                    React.createElement("td", { style: { padding: "6px 8px", border: "1px solid #21262d", textAlign: "center", color: (m.codeCoveragePercent || 0) >= 70 ? "#3fb950" : (m.codeCoveragePercent || 0) >= 50 ? "#d29922" : "#f85149" } }, m.codeCoveragePercent != null ? `${m.codeCoveragePercent}%` : "—"),
                    React.createElement("td", { style: { padding: "6px 8px", border: "1px solid #21262d", fontSize: "12px" } }, rt.summary || "—")
                  );
                })
              )
            )
          )
      ),

      // Committed & Closed
      committed.length > 0 && React.createElement("div", { className: "card", style: { borderLeft: "4px solid #3fb950" } },
        React.createElement("h2", { style: { color: "#3fb950" } }, "Committed & Closed"),
        React.createElement("p", { className: "small" }, `${committed.length} ticket(s) completed correctly and accepted.`),
        committed.map((c, i) => {
          const fullTicket = tickets.find(t => (t.ticketId || t.key) === c.ticketId) || {};
          return React.createElement(TicketCard, { key: i, ticket: { ...fullTicket, ...c }, reviewResult: reviewedMap[c.ticketId] });
        })
      ),

      // Not Closed / Spillover
      spillover.length > 0 && React.createElement("div", { className: "card", style: { borderLeft: "4px solid #f85149" } },
        React.createElement("h2", { style: { color: "#f85149" } }, "Not Closed (Spillover)"),
        React.createElement("p", { className: "small" }, `${spillover.length} ticket(s) not in Done state — carry over to next sprint.`),
        spillover.map((s, i) => {
          const fullTicket = tickets.find(t => (t.ticketId || t.key) === s.ticketId) || {};
          return React.createElement("div", { key: i, className: "card", style: { marginTop: "8px", background: "rgba(248,81,73,0.08)", borderLeft: "4px solid #f85149" } },
            React.createElement("h3", { style: { margin: "0 0 4px 0" } }, `${s.ticketId} — ${fullTicket.prSummary || fullTicket.summary || ""}`),
            React.createElement("p", { className: "small" }, `Status: ${s.status}`),
            React.createElement("p", { className: "small" }, s.reason),
            s.nextSprintAction && React.createElement("p", { className: "small", style: { color: "#58a6ff" } },
              React.createElement("strong", null, "Next sprint: "), s.nextSprintAction
            )
          );
        })
      ),

      // Incorrect Implementation / Needs Rework
      incorrect.length > 0 && React.createElement("div", { className: "card", style: { borderLeft: "4px solid #d29922" } },
        React.createElement("h2", { style: { color: "#d29922" } }, "Needs Rework"),
        React.createElement("p", { className: "small" }, `${incorrect.length} ticket(s) marked Done but failed acceptance checks.`),
        incorrect.map((item, i) => {
          const fullTicket = tickets.find(t => (t.ticketId || t.key) === item.ticketId) || {};
          return React.createElement(TicketCard, { key: i, ticket: { ...fullTicket, ...item }, reviewResult: reviewedMap[item.ticketId] });
        })
      ),

      // Stakeholder Feedback Considered
      Array.isArray(reviewResult.stakeholderFeedbackConsidered) && reviewResult.stakeholderFeedbackConsidered.length > 0 &&
        React.createElement("div", { className: "card", style: { background: "rgba(210,153,34,0.08)", borderLeft: "4px solid #f0883e" } },
          React.createElement("h2", null, "Stakeholder Feedback Considered"),
          reviewResult.stakeholderFeedbackConsidered.map((fb, i) => React.createElement("div", {
            key: i, style: { padding: "8px", marginTop: "6px", background: "#161b22", borderRadius: "4px", border: "1px solid rgba(240,136,62,0.15)" }
          },
            React.createElement("p", { className: "small" },
              React.createElement("strong", null, `${fb.stakeholder || "Stakeholder"} (${fb.sentiment || "neutral"}): `),
              fb.feedback || ""
            ),
            Array.isArray(fb.followUpTickets) && fb.followUpTickets.length > 0 &&
              React.createElement("p", { className: "small" }, `Follow-up tickets: ${fb.followUpTickets.join(", ")}`)
          ))
        ),

      // Backlog Updates for Next Sprint
      Array.isArray(reviewResult.backlogUpdates) && reviewResult.backlogUpdates.length > 0 &&
        React.createElement("div", { className: "card", style: { background: "rgba(88,166,255,0.08)", borderLeft: "4px solid #56d4dd" } },
          React.createElement("h2", null, "Backlog Updates for Next Sprint"),
          React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: "13px" } },
            React.createElement("thead", null,
              React.createElement("tr", { style: { background: "rgba(88,166,255,0.08)" } },
                React.createElement("th", { style: { padding: "6px 8px", textAlign: "left", border: "1px solid #21262d" } }, "Type"),
                React.createElement("th", { style: { padding: "6px 8px", textAlign: "left", border: "1px solid #21262d" } }, "Ticket"),
                React.createElement("th", { style: { padding: "6px 8px", textAlign: "left", border: "1px solid #21262d" } }, "Action"),
                React.createElement("th", { style: { padding: "6px 8px", textAlign: "center", border: "1px solid #21262d", width: "80px" } }, "Priority")
              )
            ),
            React.createElement("tbody", null,
              reviewResult.backlogUpdates.map((u, i) => React.createElement("tr", { key: i },
                React.createElement("td", { style: { padding: "6px 8px", border: "1px solid #21262d", fontWeight: "bold", color: u.type === "rework" ? "#f85149" : u.type === "carryover" ? "#d29922" : "#56d4dd" } },
                  u.type === "rework" ? "Rework" : u.type === "carryover" ? "Carryover" : "Feedback"
                ),
                React.createElement("td", { style: { padding: "6px 8px", border: "1px solid #21262d" } }, u.ticketId || "—"),
                React.createElement("td", { style: { padding: "6px 8px", border: "1px solid #21262d" } }, u.title || u.description),
                React.createElement("td", { style: { padding: "6px 8px", border: "1px solid #21262d", textAlign: "center", fontWeight: "bold", color: u.priority === "high" ? "#f85149" : "#d29922" } }, u.priority)
              ))
            )
          )
        ),

      // AI Recommendations
      Array.isArray(reviewResult.recommendations) && reviewResult.recommendations.length > 0 &&
        React.createElement("div", { className: "card", style: { borderLeft: "4px solid #58a6ff" } },
          React.createElement("h2", null, "AI Insights & Recommendations"),
          React.createElement("p", { className: "small", style: { marginBottom: "6px" } }, reviewResult.summary),
          React.createElement("ul", null,
            reviewResult.recommendations.map((r, i) => React.createElement("li", { key: i, className: "small" }, r))
          ),
          Array.isArray(reviewResult.dataSources) && React.createElement("p", { className: "small", style: { fontStyle: "italic", color: "#8b949e", marginTop: "6px" } },
            `Data sources: ${reviewResult.dataSources.join(", ")}`
          )
        ),

      // Next Sprint Focus
      reviewResult.demoSummary && Array.isArray(reviewResult.demoSummary.nextSprintFocus) && reviewResult.demoSummary.nextSprintFocus.length > 0 &&
        React.createElement("div", { className: "card", style: { borderLeft: "4px solid #d2a8ff" } },
          React.createElement("h2", null, "Next Sprint Focus"),
          React.createElement("ul", null,
            reviewResult.demoSummary.nextSprintFocus.map((f, i) => React.createElement("li", { key: i, className: "small" }, f))
          )
        ),

      // Approve / Reject
      React.createElement("div", { className: "card", style: { textAlign: "center", padding: "16px" } },
        React.createElement("p", { className: "small", style: { marginBottom: "8px" } }, "Product Owner sign-off on this sprint review:"),
        React.createElement("button", { onClick: () => saveValidation("Approved"), style: { marginRight: "12px", padding: "10px 24px" } }, "Approve Sprint"),
        React.createElement("button", { onClick: () => saveValidation("Rejected"), style: { padding: "10px 24px", background: "#161b22", color: "#f85149", border: "1px solid #f85149" } }, "Reject Sprint")
      ),

      // ── Section 5: Sprint Retrospective ──
      React.createElement("div", { className: "card", style: { borderTop: "3px solid #d2a8ff" } },
        React.createElement("h2", null, "5) Sprint Retrospective"),
        React.createElement("p", { className: "small" }, "Reflect on the sprint. Fields are auto-populated from review results — edit as needed."),

        React.createElement("div", { className: "row", style: { gap: "12px", marginBottom: "12px" } },
          React.createElement("div", { className: "field", style: { flex: 1 } },
            React.createElement("label", { style: { fontWeight: "bold", color: "#3fb950" } }, "What Went Well"),
            React.createElement("textarea", {
              value: retroWentWell, onChange: e => setRetroWentWell(e.target.value),
              style: { minHeight: "100px", borderColor: "#3fb950" },
              placeholder: "One item per line..."
            })
          ),
          React.createElement("div", { className: "field", style: { flex: 1 } },
            React.createElement("label", { style: { fontWeight: "bold", color: "#f85149" } }, "What Didn't Go Well"),
            React.createElement("textarea", {
              value: retroDidntGoWell, onChange: e => setRetroDidntGoWell(e.target.value),
              style: { minHeight: "100px", borderColor: "#f85149" },
              placeholder: "One item per line..."
            })
          ),
          React.createElement("div", { className: "field", style: { flex: 1 } },
            React.createElement("label", { style: { fontWeight: "bold", color: "#58a6ff" } }, "What to Improve"),
            React.createElement("textarea", {
              value: retroImprovements, onChange: e => setRetroImprovements(e.target.value),
              style: { minHeight: "100px", borderColor: "#58a6ff" },
              placeholder: "One item per line..."
            })
          )
        ),

        React.createElement("div", { style: { display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "12px" } },
          React.createElement("div", { style: { flex: 1, padding: "12px", background: "#0d1117", borderRadius: "6px", border: "1px solid #30363d" } },
            React.createElement("p", { className: "small", style: { fontWeight: "bold", marginBottom: "6px" } }, "Retro Meeting Transcript"),
            React.createElement("p", { className: "small", style: { marginBottom: "8px" } }, "Load the retrospective meeting transcript to enrich insights."),
            React.createElement("button", {
              onClick: fetchRetroTranscript, disabled: retroTranscriptLoading,
              style: { width: "100%" }
            }, retroTranscriptLoading ? "Loading..." : "Fetch Transcript")
          ),
          React.createElement("div", { style: { flex: 1, padding: "12px", background: "#0d1117", borderRadius: "6px", border: "1px solid #30363d" } },
            React.createElement("p", { className: "small", style: { fontWeight: "bold", marginBottom: "6px" } }, "Teams Meeting Transcript"),
            React.createElement("p", { className: "small", style: { marginBottom: "8px" } }, "Load the transcript from a Teams retrospective meeting."),
            React.createElement("div", { className: "field", style: { marginBottom: "6px" } },
              React.createElement("input", { value: retroMeetingId, onChange: e => setRetroMeetingId(e.target.value), placeholder: "Teams Meeting ID" })
            ),
            React.createElement("div", { className: "field", style: { marginBottom: "8px" } },
              React.createElement("input", { type: "password", value: retroToken, onChange: e => setRetroToken(e.target.value), placeholder: "Graph API Token (optional)" })
            ),
            React.createElement("button", {
              onClick: fetchRetroTeamsTranscript, disabled: retroTranscriptLoading || !retroMeetingId.trim(),
              style: { width: "100%", background: "#161b22", color: "#c9d1d9", border: "1px solid #30363d" }
            }, retroTranscriptLoading ? "Fetching..." : "Fetch from Meeting ID")
          )
        ),

        retroTranscript && React.createElement("div", { className: "field", style: { marginBottom: "12px" } },
          React.createElement("label", { className: "small", style: { fontWeight: "bold" } }, "Loaded Transcript"),
          React.createElement("textarea", {
            value: retroTranscript, onChange: e => setRetroTranscript(e.target.value),
            style: { minHeight: "80px", fontFamily: "monospace", fontSize: "12px", background: "#0d1117" }
          })
        ),

        React.createElement("div", { style: { textAlign: "center" } },
          React.createElement("button", {
            onClick: generateRetroInsights, disabled: retroLoading,
            style: { padding: "12px 32px", fontSize: "16px" }
          }, retroLoading ? "Generating..." : "Generate Retro Insights")
        )
      ),

      // ── Section 6: Retro Results ──
      retroResult && React.createElement("div", null,

        retroResult.teamHealth && React.createElement("div", { className: "card", style: { borderLeft: `5px solid ${retroResult.teamHealth.morale === "High" ? "#3fb950" : retroResult.teamHealth.morale === "Low" ? "#f85149" : "#d29922"}` } },
          React.createElement("h2", null, "Team Health"),
          React.createElement("div", { className: "row", style: { gap: "16px", marginBottom: "8px" } },
            React.createElement("div", { style: { flex: 1, textAlign: "center", padding: "12px", background: "rgba(210,168,255,0.08)", borderRadius: "8px" } },
              React.createElement("div", { style: { fontSize: "20px", fontWeight: "bold", color: retroResult.teamHealth.velocityTrend === "Improving" ? "#3fb950" : retroResult.teamHealth.velocityTrend === "Declining" ? "#f85149" : "#d29922" } }, retroResult.teamHealth.velocityTrend || "N/A"),
              React.createElement("div", { className: "small" }, "Velocity Trend")
            ),
            React.createElement("div", { style: { flex: 1, textAlign: "center", padding: "12px", background: "rgba(210,168,255,0.08)", borderRadius: "8px" } },
              React.createElement("div", { style: { fontSize: "20px", fontWeight: "bold", color: retroResult.teamHealth.morale === "High" ? "#3fb950" : retroResult.teamHealth.morale === "Low" ? "#f85149" : "#d29922" } }, retroResult.teamHealth.morale || "N/A"),
              React.createElement("div", { className: "small" }, "Team Morale")
            ),
            React.createElement("div", { style: { flex: 2, textAlign: "center", padding: "12px", background: "rgba(210,168,255,0.08)", borderRadius: "8px" } },
              React.createElement("div", { style: { fontSize: "14px" } }, retroResult.teamHealth.summary || ""),
              React.createElement("div", { className: "small" }, "Summary")
            )
          )
        ),

        React.createElement("div", { className: "card" },
          React.createElement("h2", null, "Retro Insights"),
          React.createElement("div", { className: "row", style: { gap: "12px", marginBottom: "12px" } },
            React.createElement("div", { style: { flex: 1, padding: "10px", background: "rgba(63,185,80,0.08)", borderRadius: "6px", borderLeft: "4px solid #3fb950" } },
              React.createElement("p", { style: { fontWeight: "bold", color: "#3fb950", marginBottom: "4px" } }, "What Went Well"),
              Array.isArray(retroResult.wentWell) && retroResult.wentWell.map((w, i) => React.createElement("p", { key: i, className: "small", style: { margin: "2px 0" } }, `• ${w}`))
            ),
            React.createElement("div", { style: { flex: 1, padding: "10px", background: "rgba(248,81,73,0.08)", borderRadius: "6px", borderLeft: "4px solid #f85149" } },
              React.createElement("p", { style: { fontWeight: "bold", color: "#f85149", marginBottom: "4px" } }, "What Didn't Go Well"),
              Array.isArray(retroResult.didntGoWell) && retroResult.didntGoWell.map((d, i) => React.createElement("p", { key: i, className: "small", style: { margin: "2px 0" } }, `• ${d}`))
            ),
            React.createElement("div", { style: { flex: 1, padding: "10px", background: "rgba(88,166,255,0.08)", borderRadius: "6px", borderLeft: "4px solid #58a6ff" } },
              React.createElement("p", { style: { fontWeight: "bold", color: "#58a6ff", marginBottom: "4px" } }, "Improvements"),
              Array.isArray(retroResult.improvements) && retroResult.improvements.map((im, i) => React.createElement("p", { key: i, className: "small", style: { margin: "2px 0" } }, `• ${im}`))
            )
          )
        ),

        Array.isArray(retroResult.actionItems) && retroResult.actionItems.length > 0 &&
          React.createElement("div", { className: "card", style: { borderLeft: "4px solid #d2a8ff" } },
            React.createElement("h2", null, "6) Action Items"),
            React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: "13px" } },
              React.createElement("thead", null,
                React.createElement("tr", { style: { background: "rgba(210,168,255,0.08)" } },
                  React.createElement("th", { style: { padding: "6px 8px", textAlign: "left", border: "1px solid #21262d" } }, "Action"),
                  React.createElement("th", { style: { padding: "6px 8px", textAlign: "center", border: "1px solid #21262d", width: "120px" } }, "Owner"),
                  React.createElement("th", { style: { padding: "6px 8px", textAlign: "center", border: "1px solid #21262d", width: "80px" } }, "Priority"),
                  React.createElement("th", { style: { padding: "6px 8px", textAlign: "center", border: "1px solid #21262d", width: "100px" } }, "Target Sprint")
                )
              ),
              React.createElement("tbody", null,
                retroResult.actionItems.map((a, i) => React.createElement("tr", { key: i },
                  React.createElement("td", { style: { padding: "6px 8px", border: "1px solid #21262d" } }, a.description),
                  React.createElement("td", { style: { padding: "6px 8px", border: "1px solid #21262d", textAlign: "center" } }, a.owner || "Team"),
                  React.createElement("td", { style: { padding: "6px 8px", border: "1px solid #21262d", textAlign: "center", fontWeight: "bold", color: a.priority === "high" ? "#f85149" : a.priority === "low" ? "#3fb950" : "#d29922" } }, a.priority || "medium"),
                  React.createElement("td", { style: { padding: "6px 8px", border: "1px solid #21262d", textAlign: "center" } }, a.targetSprint || "Next Sprint")
                ))
              )
            )
          ),

        Array.isArray(retroResult.patterns) && retroResult.patterns.length > 0 &&
          React.createElement("div", { className: "card", style: { borderLeft: "4px solid #f0883e" } },
            React.createElement("h2", null, "Recurring Patterns"),
            React.createElement("p", { className: "small", style: { marginBottom: "4px" } }, "Themes identified from current and historical retrospective data:"),
            React.createElement("ul", null,
              retroResult.patterns.map((p, i) => React.createElement("li", { key: i, className: "small" }, p))
            )
          ),

        Array.isArray(retroResult.rationale) && retroResult.rationale.length > 0 &&
          React.createElement("div", { className: "card", style: { borderLeft: "4px solid #58a6ff" } },
            React.createElement("h2", null, "Rationale"),
            React.createElement("ul", null,
              retroResult.rationale.map((r, i) => React.createElement("li", { key: i, className: "small" }, r))
            ),
            Array.isArray(retroResult.dataSources) && React.createElement("p", { className: "small", style: { fontStyle: "italic", color: "#8b949e", marginTop: "6px" } },
              `Data sources: ${retroResult.dataSources.join(", ")}`
            )
          ),

        React.createElement("div", { className: "card", style: { textAlign: "center", padding: "16px" } },
          React.createElement("button", { onClick: saveRetroActions, style: { marginRight: "12px", padding: "10px 24px" } }, "Save Action Items"),
          React.createElement("button", { onClick: () => saveValidation("Retro Approved"), style: { padding: "10px 24px", background: "#161b22", color: "#c9d1d9", border: "1px solid #30363d" } }, "Approve Retro")
        )
      ),

      // ── Section 7: Velocity Tracking ──
      React.createElement("div", { className: "card", style: { borderTop: "3px solid #6f42c1" } },
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" } },
          React.createElement("div", null,
            React.createElement("h2", { style: { margin: 0 } }, "7) Velocity Tracking"),
            React.createElement("p", { className: "small", style: { margin: "4px 0 0 0" } }, "Sprint velocity history, burndown, and next-sprint planning projection.")
          ),
          React.createElement("div", { style: { display: "flex", gap: "8px" } },
            React.createElement("button", {
              onClick: loadVelocityData, disabled: velocityLoading || !reviewResult,
              style: { padding: "8px 20px" }
            }, velocityLoading ? "Loading..." : !reviewResult ? "Run Review First" : "Load Velocity Data"),
            velocityData && React.createElement("button", {
              onClick: exportVelocityCsv,
              style: { padding: "8px 20px", background: "#161b22", color: "#c9d1d9", border: "1px solid #30363d" }
            }, "Export CSV")
          )
        ),

        velocityData && React.createElement("div", null,

          React.createElement("div", { className: "row", style: { gap: "12px", marginBottom: "16px" } },
            React.createElement("div", { style: { flex: 1, textAlign: "center", padding: "16px", background: "linear-gradient(135deg, rgba(210,168,255,0.08) 0%, #e8e0ff 100%)", borderRadius: "10px", border: "1px solid #d4c5f9" } },
              React.createElement("div", { style: { fontSize: "28px", fontWeight: "bold", color: "#6f42c1" } }, velocityData.summary?.avgVelocity ?? "—"),
              React.createElement("div", { className: "small", style: { marginTop: "4px" } }, "Avg Velocity (All)")
            ),
            React.createElement("div", { style: { flex: 1, textAlign: "center", padding: "16px", background: "linear-gradient(135deg, rgba(63,185,80,0.08) 0%, #d4f4d4 100%)", borderRadius: "10px", border: "1px solid #a3d9a5" } },
              React.createElement("div", { style: { fontSize: "28px", fontWeight: "bold", color: "#3fb950" } }, velocityData.summary?.last3Velocity ?? "—"),
              React.createElement("div", { className: "small", style: { marginTop: "4px" } }, "Avg Velocity (Last 3)")
            ),
            React.createElement("div", { style: { flex: 1, textAlign: "center", padding: "16px", background: "linear-gradient(135deg, rgba(88,166,255,0.08) 0%, #dbeafe 100%)", borderRadius: "10px", border: "1px solid #93c5fd" } },
              React.createElement("div", { style: { fontSize: "28px", fontWeight: "bold", color: "#58a6ff" } }, `${velocityData.summary?.avgCompletion ?? "—"}%`),
              React.createElement("div", { className: "small", style: { marginTop: "4px" } }, "Avg Completion Rate")
            ),
            React.createElement("div", { style: { flex: 1, textAlign: "center", padding: "16px", background: `linear-gradient(135deg, ${velocityData.summary?.trend === "Improving" ? "rgba(63,185,80,0.08), #d4f4d4" : velocityData.summary?.trend === "Declining" ? "rgba(248,81,73,0.08), #fecaca" : "#fff9e6, #fef3cd"})`, borderRadius: "10px", border: `1px solid ${velocityData.summary?.trend === "Improving" ? "#a3d9a5" : velocityData.summary?.trend === "Declining" ? "#fca5a5" : "#fbbf24"}` } },
              React.createElement("div", { style: { fontSize: "28px", fontWeight: "bold", color: velocityData.summary?.trend === "Improving" ? "#3fb950" : velocityData.summary?.trend === "Declining" ? "#f85149" : "#d29922" } }, velocityData.summary?.trend ?? "—"),
              React.createElement("div", { className: "small", style: { marginTop: "4px" } }, "Velocity Trend")
            )
          ),

          React.createElement("div", { className: "row", style: { gap: "16px", marginBottom: "16px" } },
            React.createElement("div", { style: { flex: 1, padding: "16px", background: "#161b22", borderRadius: "10px", border: "1px solid #30363d", minHeight: "320px" } },
              React.createElement("h3", { style: { margin: "0 0 8px 0", color: "#c9d1d9" } }, "Sprint Velocity"),
              React.createElement("div", { style: { position: "relative", height: "280px" } },
                React.createElement("canvas", { ref: velocityChartRef })
              )
            ),
            React.createElement("div", { style: { flex: 1, padding: "16px", background: "#161b22", borderRadius: "10px", border: "1px solid #30363d", minHeight: "320px" } },
              React.createElement("h3", { style: { margin: "0 0 8px 0", color: "#c9d1d9" } }, "Sprint Burndown (Last Sprint)"),
              React.createElement("div", { style: { position: "relative", height: "280px" } },
                React.createElement("canvas", { ref: burndownChartRef })
              )
            )
          ),

          React.createElement("div", { className: "card", style: { background: "#0d1117", border: "1px solid #30363d" } },
            React.createElement("h3", { style: { margin: "0 0 10px 0" } }, "Sprint History"),
            React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: "13px" } },
              React.createElement("thead", null,
                React.createElement("tr", { style: { background: "rgba(210,168,255,0.08)" } },
                  React.createElement("th", { style: { padding: "8px 10px", textAlign: "left", border: "1px solid #21262d" } }, "Sprint"),
                  React.createElement("th", { style: { padding: "8px 10px", textAlign: "center", border: "1px solid #21262d" } }, "Capacity"),
                  React.createElement("th", { style: { padding: "8px 10px", textAlign: "center", border: "1px solid #21262d" } }, "Planned"),
                  React.createElement("th", { style: { padding: "8px 10px", textAlign: "center", border: "1px solid #21262d" } }, "Completed"),
                  React.createElement("th", { style: { padding: "8px 10px", textAlign: "center", border: "1px solid #21262d" } }, "Velocity"),
                  React.createElement("th", { style: { padding: "8px 10px", textAlign: "center", border: "1px solid #21262d" } }, "Spillover"),
                  React.createElement("th", { style: { padding: "8px 10px", textAlign: "center", border: "1px solid #21262d" } }, "Completion %")
                )
              ),
              React.createElement("tbody", null,
                velocityData.history.map((s, i) => {
                  const pct = s.plannedPoints ? Math.round((s.completedPoints / s.plannedPoints) * 100) : 0;
                  return React.createElement("tr", { key: i, style: { background: i % 2 === 0 ? "#161b22" : "#0d1117" } },
                    React.createElement("td", { style: { padding: "8px 10px", border: "1px solid #21262d", fontWeight: "bold" } }, s.sprintName.replace(/\s*\(.*\)/, "")),
                    React.createElement("td", { style: { padding: "8px 10px", border: "1px solid #21262d", textAlign: "center" } }, s.capacityPoints),
                    React.createElement("td", { style: { padding: "8px 10px", border: "1px solid #21262d", textAlign: "center" } }, s.plannedPoints),
                    React.createElement("td", { style: { padding: "8px 10px", border: "1px solid #21262d", textAlign: "center", fontWeight: "bold", color: "#3fb950" } }, s.completedPoints),
                    React.createElement("td", { style: { padding: "8px 10px", border: "1px solid #21262d", textAlign: "center", fontWeight: "bold", color: "#6f42c1" } }, s.velocityPoints),
                    React.createElement("td", { style: { padding: "8px 10px", border: "1px solid #21262d", textAlign: "center", color: s.spilloverPoints > 3 ? "#f85149" : "#d29922" } }, s.spilloverPoints),
                    React.createElement("td", { style: { padding: "8px 10px", border: "1px solid #21262d", textAlign: "center" } },
                      React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" } },
                        React.createElement("div", { style: { width: "60px", height: "8px", background: "#e5e7eb", borderRadius: "4px", overflow: "hidden" } },
                          React.createElement("div", { style: { width: `${pct}%`, height: "100%", background: pct >= 85 ? "#3fb950" : pct >= 70 ? "#d29922" : "#f85149", borderRadius: "4px" } })
                        ),
                        `${pct}%`
                      )
                    )
                  );
                })
              )
            )
          ),

          velocityData.currentSprint?.ticketBreakdown?.length > 0 &&
            React.createElement("div", { className: "card", style: { borderLeft: "4px solid #58a6ff", background: "#0d1117" } },
              React.createElement("h3", { style: { margin: "0 0 10px 0" } }, "Current Sprint — Ticket Breakdown"),
              React.createElement("p", { className: "small", style: { marginBottom: "8px" } },
                `Planned: ${velocityData.currentSprint.plannedPoints} SP | Completed: ${velocityData.currentSprint.completedPoints} SP | Spillover: ${velocityData.currentSprint.spilloverPoints} SP`
              ),
              React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: "13px" } },
                React.createElement("thead", null,
                  React.createElement("tr", { style: { background: "rgba(88,166,255,0.08)" } },
                    React.createElement("th", { style: { padding: "8px 10px", textAlign: "left", border: "1px solid #21262d" } }, "Ticket"),
                    React.createElement("th", { style: { padding: "8px 10px", textAlign: "center", border: "1px solid #21262d", width: "100px" } }, "Story Points"),
                    React.createElement("th", { style: { padding: "8px 10px", textAlign: "center", border: "1px solid #21262d", width: "120px" } }, "Outcome")
                  )
                ),
                React.createElement("tbody", null,
                  velocityData.currentSprint.ticketBreakdown.map((t, i) => React.createElement("tr", { key: i, style: { background: i % 2 === 0 ? "#161b22" : "#0d1117" } },
                    React.createElement("td", { style: { padding: "8px 10px", border: "1px solid #21262d", fontWeight: "bold" } }, t.ticketId),
                    React.createElement("td", { style: { padding: "8px 10px", border: "1px solid #21262d", textAlign: "center" } }, `${t.storyPoints} SP`),
                    React.createElement("td", { style: { padding: "8px 10px", border: "1px solid #21262d", textAlign: "center", fontWeight: "bold", color: t.outcome === "Completed" ? "#3fb950" : t.outcome === "Spillover" ? "#d29922" : "#f85149" } }, t.outcome)
                  ))
                )
              )
            ),

          velocityData.projection && React.createElement("div", { className: "card", style: { borderLeft: "5px solid #6f42c1", background: "linear-gradient(135deg, #faf5ff 0%, rgba(210,168,255,0.08) 100%)" } },
            React.createElement("h3", { style: { margin: "0 0 10px 0", color: "#6f42c1" } }, "Next Sprint Planning Projection"),
            React.createElement("div", { className: "row", style: { gap: "16px" } },
              React.createElement("div", { style: { flex: 1, textAlign: "center", padding: "14px", background: "#161b22", borderRadius: "8px", border: "1px solid #d4c5f9" } },
                React.createElement("div", { style: { fontSize: "24px", fontWeight: "bold", color: "#6f42c1" } }, `${velocityData.projection.recommendedRange.min} – ${velocityData.projection.recommendedRange.max}`),
                React.createElement("div", { className: "small", style: { marginTop: "4px" } }, "Recommended Plan (SP)")
              ),
              React.createElement("div", { style: { flex: 1, textAlign: "center", padding: "14px", background: "#161b22", borderRadius: "8px", border: "1px solid #d4c5f9" } },
                React.createElement("div", { style: { fontSize: "24px", fontWeight: "bold", color: "#58a6ff" } }, velocityData.projection.last3Velocity),
                React.createElement("div", { className: "small", style: { marginTop: "4px" } }, "Last 3 Sprint Avg")
              ),
              React.createElement("div", { style: { flex: 1, textAlign: "center", padding: "14px", background: "#161b22", borderRadius: "8px", border: "1px solid #d4c5f9" } },
                React.createElement("div", { style: { fontSize: "24px", fontWeight: "bold", color: velocityData.projection.confidence === "High" ? "#3fb950" : velocityData.projection.confidence === "Low" ? "#f85149" : "#d29922" } }, velocityData.projection.confidence),
                React.createElement("div", { className: "small", style: { marginTop: "4px" } }, "Projection Confidence")
              )
            ),
            React.createElement("p", { className: "small", style: { marginTop: "10px", fontStyle: "italic" } },
              `Based on ${velocityData.summary.trend.toLowerCase()} velocity trend — average ${velocityData.projection.avgVelocity} SP across all sprints, ${velocityData.projection.last3Velocity} SP in last 3 sprints.`
            )
          )
        )
      )
    )
  );
}

createRoot(document.getElementById("root")).render(React.createElement(App));
