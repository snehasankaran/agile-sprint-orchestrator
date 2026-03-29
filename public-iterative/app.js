import React, { useState, useEffect } from "https://esm.sh/react@18";
import { createRoot } from "https://esm.sh/react-dom@18/client";

async function callJson(url, payload) {
  const opts = payload
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
    : {};
  const res = await fetch(url, opts);
  const raw = await res.text();
  let data;
  try { data = raw ? JSON.parse(raw) : {}; } catch { throw new Error(`Non-JSON response (HTTP ${res.status})`); }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function InsightBlock({ result, title }) {
  if (!result) return null;
  return React.createElement(
    "div",
    { className: "card", style: { marginTop: "12px", background: "#0d1117" } },
    React.createElement("h3", null, title || "AI Insights"),
    result.summary && React.createElement("p", null, React.createElement("strong", null, "Summary: "), result.summary),
    result.decision && React.createElement("p", null,
      React.createElement("strong", null, "Decision: "),
      React.createElement("span", {
        style: { color: result.decision === "On Track" ? "#3fb950" : "#f85149", fontWeight: "bold" }
      }, result.decision)
    ),
    result.confidence != null && React.createElement("p", { className: "small" }, `Confidence: ${result.confidence}%`),
    result.completionLikelihood && React.createElement("p", { className: "small" },
      React.createElement("strong", null, "Completion likelihood: "), result.completionLikelihood
    ),
    Array.isArray(result.relatedSprintTickets) && result.relatedSprintTickets.length > 0 &&
      React.createElement("p", { className: "small" },
        React.createElement("strong", null, "Related sprint tickets: "), result.relatedSprintTickets.join(", ")
      ),
    Array.isArray(result.risks) && result.risks.length > 0 && React.createElement("div", null,
      React.createElement("strong", null, "Risks:"),
      React.createElement("ul", null, result.risks.map((r, i) => React.createElement("li", { key: i, className: "small" }, r)))
    ),
    Array.isArray(result.recommendations) && result.recommendations.length > 0 && React.createElement("div", null,
      React.createElement("strong", null, "Recommendations:"),
      React.createElement("ul", null, result.recommendations.map((r, i) => React.createElement("li", { key: i, className: "small" }, r)))
    ),
    Array.isArray(result.rationale) && result.rationale.length > 0 && React.createElement("div", null,
      React.createElement("strong", null, "Rationale:"),
      React.createElement("ul", null, result.rationale.map((r, i) => React.createElement("li", { key: i, className: "small" }, r)))
    ),
    Array.isArray(result.dataSources) && React.createElement("p", { className: "small" }, `Data sources: ${result.dataSources.join(", ")}`)
  );
}

function WorkProductCard({ wp }) {
  if (!wp) return null;
  const metrics = wp.metrics || {};
  const statusColor = wp.decision === "On Track" ? "#3fb950" : wp.decision === "At Risk" ? "#d29922" : "#f85149";
  const likelihoodColor = wp.completionLikelihood === "High" ? "#3fb950" : wp.completionLikelihood === "Low" ? "#f85149" : "#d29922";
  return React.createElement(
    "div",
    { className: "card", style: { marginTop: "10px", background: "#0d1117", borderLeft: `4px solid ${statusColor}` } },
    React.createElement("h3", { style: { margin: "0 0 6px 0" } }, `${wp.ticketId || "?"} - ${wp.summary || wp.caseKey || ""}`),
    wp.decision && React.createElement("p", null,
      React.createElement("strong", null, "Status: "),
      React.createElement("span", { style: { color: statusColor, fontWeight: "bold" } }, wp.decision)
    ),
    wp.confidence != null && React.createElement("p", { className: "small" }, `Confidence: ${wp.confidence}%`),
    wp.completionLikelihood && React.createElement("p", { className: "small" },
      React.createElement("strong", null, "Completion likelihood: "),
      React.createElement("span", { style: { color: likelihoodColor, fontWeight: "bold" } }, wp.completionLikelihood)
    ),
    metrics.acceptanceCoveragePercent != null && React.createElement("p", { className: "small" },
      `Acceptance coverage: ${metrics.acceptanceCoveragePercent}% | Test failure rate: ${metrics.testFailureRatePercent}% | Code coverage: ${metrics.codeCoveragePercent}%`
    ),
    Array.isArray(wp.relatedSprintTickets) && wp.relatedSprintTickets.length > 0 &&
      React.createElement("p", { className: "small" },
        React.createElement("strong", null, "Related sprint tickets: "), wp.relatedSprintTickets.join(", ")
      ),

    wp.standupInsights && React.createElement("div", { style: { marginTop: "6px", padding: "8px", background: "rgba(88,166,255,0.08)", borderRadius: "4px", borderLeft: "3px solid #58a6ff" } },
      React.createElement("strong", null, "Standup Insights: "),
      React.createElement("span", { className: "small" }, wp.standupInsights)
    ),

    Array.isArray(wp.dependencyRisks) && wp.dependencyRisks.length > 0 &&
      React.createElement("div", { style: { marginTop: "6px" } },
        React.createElement("strong", { style: { color: "#f85149" } }, "Dependency Risks:"),
        React.createElement("ul", null, wp.dependencyRisks.map((r, i) => React.createElement("li", { key: i, className: "small" }, r)))
      ),

    Array.isArray(wp.risks) && wp.risks.length > 0 && React.createElement("div", null,
      React.createElement("strong", null, "Risks:"),
      React.createElement("ul", null, wp.risks.map((r, i) => React.createElement("li", { key: i, className: "small" }, r)))
    ),
    Array.isArray(wp.rationale) && wp.rationale.length > 0 && React.createElement("div", null,
      React.createElement("strong", null, "Rationale:"),
      React.createElement("ul", null, wp.rationale.map((r, i) => React.createElement("li", { key: i, className: "small" }, r)))
    ),
    Array.isArray(wp.recommendations) && wp.recommendations.length > 0 && React.createElement("div", null,
      React.createElement("strong", null, "Recommendations:"),
      React.createElement("ul", null, wp.recommendations.map((r, i) => React.createElement("li", { key: i, className: "small" }, r)))
    )
  );
}

function App() {
  const [transcriptSource, setTranscriptSource] = useState("simulated");
  const [transcript, setTranscript] = useState("");
  const [meetingId, setMeetingId] = useState("");
  const [graphToken, setGraphToken] = useState("");
  const [totalPoints, setTotalPoints] = useState(12);
  const [completedPerDay, setCompletedPerDay] = useState("3,2,1");
  const [standupResult, setStandupResult] = useState(null);

  const [wpResults, setWpResults] = useState([]);
  const [wpLoading, setWpLoading] = useState(false);

  const [ghOwner, setGhOwner] = useState("snehasankaran");
  const [ghRepo, setGhRepo] = useState("agile-sim-data");
  const [ghToken, setGhToken] = useState("");
  const [ghPrNumber, setGhPrNumber] = useState("");
  const [prResult, setPrResult] = useState(null);

  const [sprintHealth, setSprintHealth] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);

  const [sprintTickets, setSprintTickets] = useState([]);
  const [status, setStatus] = useState("Ready.");

  useEffect(() => {
    fetch("/api/sprint/tickets")
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.tickets)) setSprintTickets(d.tickets); })
      .catch(() => {});

    fetch("/api/sim/teams-transcripts")
      .then(r => r.json())
      .then(d => {
        if (d?.transcript?.transcript) setTranscript(d.transcript.transcript);
      })
      .catch(() => {});
  }, []);

  function parseCompletedArray() {
    return String(completedPerDay || "").split(",").map(v => Number(v.trim())).filter(v => Number.isFinite(v));
  }

  async function runStandupInsight() {
    setStandupResult(null);

    if (transcriptSource === "teams") {
      if (!meetingId.trim()) { setStatus("Error: Teams Meeting ID is required."); return; }
      setStatus("Fetching transcript from Teams Meeting and generating AI insights...");
      try {
        const burndown = { totalPoints: Number(totalPoints), completedPerDay: parseCompletedArray() };
        const data = await callJson("/api/teams/graph", {
          meetingId: meetingId.trim(),
          token: graphToken.trim() || undefined,
          burndown
        });
        setTranscript(data.transcript || "(transcript fetched from Graph)");
        setStandupResult(data);
        setStatus("AI insights generated from Teams meeting transcript.");
      } catch (err) {
        setStatus(`Error: ${err.message}`);
      }
    } else {
      setStatus("Generating AI insights from transcript...");
      try {
        const burndown = { totalPoints: Number(totalPoints), completedPerDay: parseCompletedArray() };
        const data = await callJson("/api/sim/teams-transcripts/run", {
          transcript: transcript,
          burndown
        });
        setStandupResult(data);
        setStatus("AI insights generated from transcript.");
      } catch (err) {
        setStatus(`Error: ${err.message}`);
      }
    }
  }

  async function evaluateAllWorkProducts() {
    setStatus("Fetching work products from GitHub and evaluating against acceptance criteria...");
    setWpResults([]);
    setWpLoading(true);
    try {
      const data = await callJson("/api/github/work-products/evaluate-all", {
        owner: "snehasankaran",
        repo: "agile-sim-data",
        path: "simulated_work_products.json"
      });
      setWpResults(data.results || []);
      setStatus(`Evaluated ${(data.results || []).length} work products from GitHub repo.`);
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
    setWpLoading(false);
  }

  async function evaluatePR() {
    setStatus("Fetching PR and auto-loading acceptance criteria from sprint plan...");
    setPrResult(null);
    try {
      if (!ghOwner || !ghRepo || !ghPrNumber) throw new Error("GitHub owner, repo, and PR number are required.");
      const data = await callJson("/api/github/pr/evaluate", {
        owner: ghOwner, repo: ghRepo, pullNumber: Number(ghPrNumber),
        token: ghToken || undefined
      });
      setPrResult(data);
      const matched = data.matchedTicket ? ` (matched: ${data.matchedTicket})` : " (evaluated against all sprint criteria)";
      setStatus(`PR #${ghPrNumber}${matched}: ${data?.evaluation?.status || "N/A"}`);
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
  }

  async function generateSprintHealth() {
    setStatus("Generating sprint health report with historical references...");
    setSprintHealth(null);
    setHealthLoading(true);
    try {
      const burndown = { totalPoints: Number(totalPoints), completedPerDay: parseCompletedArray() };
      const data = await callJson("/api/sprint-health", { burndown });
      setSprintHealth(data);
      setStatus(`Sprint health: ${data.overallHealth || "N/A"} (score: ${data.healthScore || "?"}%)`);
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
    setHealthLoading(false);
  }

  async function saveValidation(section, decision) {
    const insight = section === "standup" ? standupResult : section === "pr" ? prResult : section === "health" ? sprintHealth : wpResults;
    if (!insight) return;
    try {
      await callJson("/api/validate", { reviewer: "Scrum Master", decision, section, insight });
      setStatus(`Validation saved: ${decision}`);
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
  }

  return React.createElement(
    "div",
    { className: "container" },
    React.createElement("div", { className: "header" },
      React.createElement("div", null,
        React.createElement("h1", null, "\u{1F4BB} Iterative Dev + Standup Agent"),
        React.createElement("div", { className: "subtitle" }, "Track work products, evaluate PRs, run daily standups, and monitor sprint health")
      ),
      React.createElement("div", { className: "header-actions" },
        React.createElement("span", { className: "badge badge-info" }, "Port 4040")
      )
    ),
    React.createElement("p", { className: "small" }, status),

    sprintTickets.length > 0 && React.createElement(
      "div",
      { className: "card", style: { background: "rgba(210,153,34,0.08)" } },
      React.createElement("h2", null, "Current Sprint Tickets (from JIRA)"),
      React.createElement("p", { className: "small" }, `${sprintTickets.length} tickets planned for this sprint.`),
      sprintTickets.map((t, i) => React.createElement(
        "p", { key: i, className: "small", style: { margin: "2px 0" } },
        `${t.key || "(no-key)"} | ${t.priority || "Medium"} | ${t.storyPoints || 0} SP | ${t.summary || t.title}`
      ))
    ),

    // ── Section 1: Daily Standup ──
    React.createElement(
      "div",
      { className: "card" },
      React.createElement("h2", null, "1) Daily Standup"),
      React.createElement("p", { className: "small" }, "Analyse a Teams standup transcript and generate AI insights on sprint progress, risks, and recommendations."),

      React.createElement(
        "div",
        { className: "row", style: { marginBottom: "8px" } },
        React.createElement("div", { className: "field" },
          React.createElement("label", null, "Transcript source"),
          React.createElement("select", { value: transcriptSource, onChange: e => setTranscriptSource(e.target.value) },
            React.createElement("option", { value: "simulated" }, "Teams Transcript"),
            React.createElement("option", { value: "teams" }, "Teams Meeting ID")
          )
        ),
        React.createElement("div", { className: "field" },
          React.createElement("label", null, "Total sprint points"),
          React.createElement("input", { type: "number", value: totalPoints, onChange: e => setTotalPoints(Number(e.target.value) || 0) })
        ),
        React.createElement("div", { className: "field" },
          React.createElement("label", null, "Completed per day (comma-separated)"),
          React.createElement("input", { value: completedPerDay, onChange: e => setCompletedPerDay(e.target.value) })
        )
      ),

      transcriptSource === "teams" && React.createElement(
        "div",
        { className: "row", style: { marginBottom: "8px" } },
        React.createElement("div", { className: "field", style: { flex: 2 } },
          React.createElement("label", null, "Teams Meeting ID"),
          React.createElement("input", { value: meetingId, onChange: e => setMeetingId(e.target.value), placeholder: "e.g. MSo1N2Y5..." })
        ),
        React.createElement("div", { className: "field", style: { flex: 2 } },
          React.createElement("label", null, "Graph API Token"),
          React.createElement("input", { type: "password", value: graphToken, onChange: e => setGraphToken(e.target.value), placeholder: "Bearer token for Microsoft Graph" })
        )
      ),

      transcriptSource === "simulated" && React.createElement("div", { className: "field", style: { marginBottom: "8px" } },
        React.createElement("label", null, "Teams Transcript (editable)"),
        React.createElement("textarea", {
          value: transcript,
          onChange: e => setTranscript(e.target.value),
          style: { minHeight: "120px", fontFamily: "monospace", fontSize: "12px" }
        })
      ),

      React.createElement("button", { onClick: runStandupInsight }, "Generate AI Insights"),

      standupResult && React.createElement(React.Fragment, null,
        React.createElement(InsightBlock, { result: standupResult, title: "Standup AI Insights" }),
        React.createElement("div", { style: { marginTop: "8px" } },
          React.createElement("button", { onClick: () => saveValidation("standup", "Approved"), style: { marginRight: "8px" } }, "Approve"),
          React.createElement("button", { onClick: () => saveValidation("standup", "Rejected") }, "Reject")
        )
      )
    ),

    // ── Section 2: Iterative Development - GitHub Repo Work Products ──
    React.createElement(
      "div",
      { className: "card" },
      React.createElement("h2", null, "2) Iterative Development - Acceptance Criteria Check"),
      React.createElement("p", { className: "small" },
        "Fetches work products from GitHub repo (snehasankaran/agile-sim-data) and evaluates each against its JIRA ticket acceptance criteria. Shows completion likelihood, risks, and recommendations for incomplete work."
      ),

      React.createElement("button", { onClick: evaluateAllWorkProducts, disabled: wpLoading },
        wpLoading ? "Evaluating..." : "Fetch from GitHub & Evaluate"
      ),

      wpResults.length > 0 && React.createElement("div", { style: { marginTop: "8px" } },
        React.createElement("p", { className: "small", style: { fontWeight: "bold" } }, `${wpResults.length} work products evaluated:`),
        wpResults.map((wp, i) => React.createElement(WorkProductCard, { key: i, wp })),
        React.createElement("div", { style: { marginTop: "8px" } },
          React.createElement("button", { onClick: () => saveValidation("wp", "Approved"), style: { marginRight: "8px" } }, "Approve All"),
          React.createElement("button", { onClick: () => saveValidation("wp", "Rejected") }, "Reject All")
        )
      )
    ),

    // ── Section 3: Iterative Development - GitHub PR Review ──
    React.createElement(
      "div",
      { className: "card" },
      React.createElement("h2", null, "3) Iterative Development - GitHub PR Review"),
      React.createElement("p", { className: "small" }, "Enter a GitHub PR. Acceptance criteria is auto-loaded from sprint planning. Completed PRs are evaluated against criteria; in-progress PRs get insights from standup, sprint end date, and dependencies."),
      React.createElement(
        "div",
        { className: "row" },
        React.createElement("div", { className: "field" },
          React.createElement("label", null, "GitHub owner"),
          React.createElement("input", { value: ghOwner, onChange: e => setGhOwner(e.target.value), placeholder: "owner" })
        ),
        React.createElement("div", { className: "field" },
          React.createElement("label", null, "GitHub repo"),
          React.createElement("input", { value: ghRepo, onChange: e => setGhRepo(e.target.value), placeholder: "repo" })
        ),
        React.createElement("div", { className: "field" },
          React.createElement("label", null, "PR number"),
          React.createElement("input", { type: "number", value: ghPrNumber, onChange: e => setGhPrNumber(e.target.value), placeholder: "1" })
        ),
        React.createElement("div", { className: "field" },
          React.createElement("label", null, "GitHub token (optional)"),
          React.createElement("input", { type: "password", value: ghToken, onChange: e => setGhToken(e.target.value), placeholder: "ghp_..." })
        )
      ),
      React.createElement("button", { onClick: evaluatePR, style: { marginTop: "8px" } }, "Evaluate PR"),
      prResult && React.createElement(
        "div",
        { className: "card", style: { marginTop: "12px", background: prResult.isCompleted ? "rgba(63,185,80,0.08)" : "rgba(210,153,34,0.08)" } },
        React.createElement("h3", null, `PR #${prResult.pullNumber || ghPrNumber} — ${prResult.isCompleted ? "Completed PR Evaluation" : "In-Progress PR Insights"}`),
        prResult.pr && React.createElement("div", { className: "small", style: { marginBottom: "8px", padding: "6px", background: "#161b22", borderRadius: "4px" } },
          `Title: ${prResult.pr.title || "N/A"} | Branch: ${prResult.pr.branch || "?"} | State: ${prResult.pr.state || "?"} ${prResult.pr.merged ? "(merged)" : ""} | Files: ${prResult.pr.changedFiles || 0} | +${prResult.pr.additions || 0} / -${prResult.pr.deletions || 0}`
        ),
        React.createElement("div", { style: { marginBottom: "8px", padding: "8px", background: "rgba(63,185,80,0.08)", borderRadius: "4px", borderLeft: "3px solid #22863a" } },
          React.createElement("strong", null, prResult.matchedTicket
            ? `Matched Sprint Ticket: ${prResult.matchedTicket}`
            : "No specific ticket matched — evaluated against all sprint criteria"
          ),
          Array.isArray(prResult.acceptanceCriteria) && prResult.acceptanceCriteria.length > 0 &&
            React.createElement("div", { style: { marginTop: "4px" } },
              React.createElement("span", { className: "small", style: { fontStyle: "italic" } }, "Acceptance criteria (from sprint planning):"),
              React.createElement("ol", { style: { margin: "4px 0 0 16px", fontSize: "12px" } },
                prResult.acceptanceCriteria.map((c, i) => React.createElement("li", { key: i }, c))
              )
            )
        ),
        prResult.evaluation && React.createElement("div", null,
          React.createElement("p", null,
            React.createElement("strong", null, "Status: "),
            React.createElement("span", {
              style: {
                color: prResult.evaluation.status === "PASS" ? "#3fb950"
                  : prResult.evaluation.status === "FAIL" ? "#f85149"
                  : prResult.evaluation.status === "IN_PROGRESS" ? "#58a6ff"
                  : "#d29922",
                fontWeight: "bold"
              }
            }, prResult.evaluation.status || "N/A")
          ),
          prResult.evaluation.confidence != null && React.createElement("p", { className: "small" }, `Confidence: ${prResult.evaluation.confidence}%`),
          prResult.evaluation.completionLikelihood && React.createElement("p", { className: "small" },
            React.createElement("strong", null, "Completion likelihood: "),
            React.createElement("span", {
              style: { color: prResult.evaluation.completionLikelihood === "High" ? "#3fb950" : prResult.evaluation.completionLikelihood === "Low" ? "#f85149" : "#d29922", fontWeight: "bold" }
            }, prResult.evaluation.completionLikelihood)
          ),
          Array.isArray(prResult.evaluation.relatedSprintTickets) && prResult.evaluation.relatedSprintTickets.length > 0 &&
            React.createElement("p", { className: "small" },
              React.createElement("strong", null, "Related sprint tickets: "), prResult.evaluation.relatedSprintTickets.join(", ")
            ),

          Array.isArray(prResult.evaluation.criteriaBreakdown) && prResult.evaluation.criteriaBreakdown.length > 0 &&
            React.createElement("div", { style: { marginTop: "8px" } },
              React.createElement("strong", null, "Acceptance Criteria Breakdown:"),
              React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", marginTop: "4px", fontSize: "13px" } },
                React.createElement("thead", null,
                  React.createElement("tr", { style: { background: "rgba(63,185,80,0.15)" } },
                    React.createElement("th", { style: { padding: "4px 8px", textAlign: "left", border: "1px solid #21262d" } }, "Criterion"),
                    React.createElement("th", { style: { padding: "4px 8px", textAlign: "center", border: "1px solid #21262d", width: "100px" } }, "Verdict"),
                    React.createElement("th", { style: { padding: "4px 8px", textAlign: "left", border: "1px solid #21262d" } }, "Evidence")
                  )
                ),
                React.createElement("tbody", null,
                  prResult.evaluation.criteriaBreakdown.map((c, i) => React.createElement("tr", { key: i },
                    React.createElement("td", { style: { padding: "4px 8px", border: "1px solid #21262d" } }, c.criterion),
                    React.createElement("td", { style: {
                      padding: "4px 8px", border: "1px solid #21262d", textAlign: "center", fontWeight: "bold",
                      color: c.verdict === "Met" ? "#3fb950" : c.verdict === "Not Met" ? "#f85149" : "#d29922"
                    } }, c.verdict),
                    React.createElement("td", { style: { padding: "4px 8px", border: "1px solid #21262d" } }, c.evidence || "")
                  ))
                )
              )
            ),

          Array.isArray(prResult.evaluation.criteriaProgress) && prResult.evaluation.criteriaProgress.length > 0 &&
            React.createElement("div", { style: { marginTop: "8px" } },
              React.createElement("strong", null, "Criteria Progress:"),
              React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", marginTop: "4px", fontSize: "13px" } },
                React.createElement("thead", null,
                  React.createElement("tr", { style: { background: "rgba(210,153,34,0.08)" } },
                    React.createElement("th", { style: { padding: "4px 8px", textAlign: "left", border: "1px solid #21262d" } }, "Criterion"),
                    React.createElement("th", { style: { padding: "4px 8px", textAlign: "center", border: "1px solid #21262d", width: "100px" } }, "Status"),
                    React.createElement("th", { style: { padding: "4px 8px", textAlign: "left", border: "1px solid #21262d" } }, "Notes")
                  )
                ),
                React.createElement("tbody", null,
                  prResult.evaluation.criteriaProgress.map((c, i) => React.createElement("tr", { key: i },
                    React.createElement("td", { style: { padding: "4px 8px", border: "1px solid #21262d" } }, c.criterion),
                    React.createElement("td", { style: {
                      padding: "4px 8px", border: "1px solid #21262d", textAlign: "center", fontWeight: "bold",
                      color: c.status === "Done" ? "#3fb950" : c.status === "Not Started" ? "#f85149" : "#d29922"
                    } }, c.status),
                    React.createElement("td", { style: { padding: "4px 8px", border: "1px solid #21262d" } }, c.notes || "")
                  ))
                )
              )
            ),

          prResult.evaluation.standupInsights && React.createElement("div", { style: { marginTop: "8px", padding: "8px", background: "rgba(88,166,255,0.08)", borderRadius: "4px", borderLeft: "3px solid #58a6ff" } },
            React.createElement("strong", null, "Standup Insights: "),
            React.createElement("span", { className: "small" }, prResult.evaluation.standupInsights)
          ),

          Array.isArray(prResult.evaluation.dependencyRisks) && prResult.evaluation.dependencyRisks.length > 0 &&
            React.createElement("div", { style: { marginTop: "8px" } },
              React.createElement("strong", { style: { color: "#f85149" } }, "Dependency Risks:"),
              React.createElement("ul", null, prResult.evaluation.dependencyRisks.map((r, i) => React.createElement("li", { key: i, className: "small" }, r)))
            ),

          Array.isArray(prResult.evaluation.risks) && prResult.evaluation.risks.length > 0 && React.createElement("div", { style: { marginTop: "4px" } },
            React.createElement("strong", null, "Risks:"),
            React.createElement("ul", null, prResult.evaluation.risks.map((r, i) => React.createElement("li", { key: i, className: "small" }, r)))
          ),
          Array.isArray(prResult.evaluation.rationale) && prResult.evaluation.rationale.length > 0 && React.createElement("div", null,
            React.createElement("strong", null, "Rationale:"),
            React.createElement("ul", null, prResult.evaluation.rationale.map((r, i) => React.createElement("li", { key: i, className: "small" }, r)))
          ),
          Array.isArray(prResult.evaluation.recommendations) && prResult.evaluation.recommendations.length > 0 && React.createElement("div", null,
            React.createElement("strong", null, "Recommendations:"),
            React.createElement("ul", null, prResult.evaluation.recommendations.map((r, i) => React.createElement("li", { key: i, className: "small" }, r)))
          )
        ),
        React.createElement("div", { style: { marginTop: "8px" } },
          React.createElement("button", { onClick: () => saveValidation("pr", "Approved"), style: { marginRight: "8px" } }, "Approve"),
          React.createElement("button", { onClick: () => saveValidation("pr", "Rejected") }, "Reject")
        )
      )
    ),

    // ── Section 4: Sprint Health ──
    React.createElement(
      "div",
      { className: "card" },
      React.createElement("h2", null, "4) Sprint Health"),
      React.createElement("p", { className: "small" }, "High-level sprint health assessment using current sprint progress, standup context, and historical sprint references."),

      React.createElement("button", { onClick: generateSprintHealth, disabled: healthLoading },
        healthLoading ? "Generating..." : "Generate Sprint Health Report"
      ),

      sprintHealth && React.createElement("div", { style: { marginTop: "12px" } },

        React.createElement("div", {
          style: {
            padding: "12px", borderRadius: "6px", marginBottom: "12px",
            background: sprintHealth.overallHealth === "Healthy" ? "rgba(63,185,80,0.08)" : sprintHealth.overallHealth === "Critical" ? "rgba(248,81,73,0.08)" : "rgba(210,153,34,0.08)",
            borderLeft: `5px solid ${sprintHealth.overallHealth === "Healthy" ? "#3fb950" : sprintHealth.overallHealth === "Critical" ? "#f85149" : "#d29922"}`
          }
        },
          React.createElement("h3", { style: { margin: "0 0 4px 0" } },
            `Sprint Health: `,
            React.createElement("span", {
              style: { color: sprintHealth.overallHealth === "Healthy" ? "#3fb950" : sprintHealth.overallHealth === "Critical" ? "#f85149" : "#d29922" }
            }, sprintHealth.overallHealth || "N/A")
          ),
          sprintHealth.healthScore != null && React.createElement("p", { className: "small", style: { margin: "2px 0" } }, `Health Score: ${sprintHealth.healthScore}% | Confidence: ${sprintHealth.confidence || "N/A"}%`),
          React.createElement("p", { className: "small", style: { margin: "2px 0" } },
            `${sprintHealth.sprintTicketCount || 0} tickets | ${sprintHealth.totalPlannedPoints || 0} SP planned | Avg historical velocity: ${sprintHealth.avgHistoricalVelocity || "N/A"} SP | Trend: ${sprintHealth.velocityTrend || "N/A"}`
          )
        ),

        sprintHealth.summary && React.createElement("div", { style: { marginBottom: "10px" } },
          React.createElement("strong", null, "Summary"),
          React.createElement("p", { className: "small" }, sprintHealth.summary)
        ),

        sprintHealth.velocityComparison && React.createElement("div", { style: { marginBottom: "10px", padding: "8px", background: "rgba(88,166,255,0.08)", borderRadius: "4px", borderLeft: "3px solid #58a6ff" } },
          React.createElement("strong", null, "Velocity Comparison"),
          React.createElement("p", { className: "small" }, sprintHealth.velocityComparison)
        ),

        sprintHealth.burndownProjection && React.createElement("div", { style: { marginBottom: "10px", padding: "8px", background: "rgba(210,168,255,0.08)", borderRadius: "4px", borderLeft: "3px solid #d2a8ff" } },
          React.createElement("strong", null, "Burndown Projection"),
          React.createElement("p", { className: "small" }, sprintHealth.burndownProjection)
        ),

        Array.isArray(sprintHealth.historicalReferences) && sprintHealth.historicalReferences.length > 0 &&
          React.createElement("div", { style: { marginBottom: "10px" } },
            React.createElement("strong", null, "Historical Sprint References"),
            React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", marginTop: "4px", fontSize: "13px" } },
              React.createElement("thead", null,
                React.createElement("tr", { style: { background: "rgba(63,185,80,0.15)" } },
                  React.createElement("th", { style: { padding: "4px 8px", textAlign: "left", border: "1px solid #21262d" } }, "Past Sprint"),
                  React.createElement("th", { style: { padding: "4px 8px", textAlign: "left", border: "1px solid #21262d" } }, "Relevance to Current Sprint")
                )
              ),
              React.createElement("tbody", null,
                sprintHealth.historicalReferences.map((ref, i) => React.createElement("tr", { key: i },
                  React.createElement("td", { style: { padding: "4px 8px", border: "1px solid #21262d", fontWeight: "bold" } }, ref.sprintName),
                  React.createElement("td", { style: { padding: "4px 8px", border: "1px solid #21262d" } }, ref.relevance)
                ))
              )
            )
          ),

        Array.isArray(sprintHealth.ticketsAtRisk) && sprintHealth.ticketsAtRisk.length > 0 &&
          React.createElement("div", { style: { marginBottom: "10px" } },
            React.createElement("strong", { style: { color: "#f85149" } }, "Tickets at Risk"),
            React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", marginTop: "4px", fontSize: "13px" } },
              React.createElement("thead", null,
                React.createElement("tr", { style: { background: "rgba(248,81,73,0.08)" } },
                  React.createElement("th", { style: { padding: "4px 8px", textAlign: "left", border: "1px solid #21262d" } }, "Ticket"),
                  React.createElement("th", { style: { padding: "4px 8px", textAlign: "left", border: "1px solid #21262d" } }, "Risk"),
                  React.createElement("th", { style: { padding: "4px 8px", textAlign: "center", border: "1px solid #21262d", width: "80px" } }, "Likelihood")
                )
              ),
              React.createElement("tbody", null,
                sprintHealth.ticketsAtRisk.map((t, i) => React.createElement("tr", { key: i },
                  React.createElement("td", { style: { padding: "4px 8px", border: "1px solid #21262d", fontWeight: "bold" } }, t.ticketId),
                  React.createElement("td", { style: { padding: "4px 8px", border: "1px solid #21262d" } }, t.risk),
                  React.createElement("td", { style: {
                    padding: "4px 8px", border: "1px solid #21262d", textAlign: "center", fontWeight: "bold",
                    color: t.likelihood === "High" ? "#f85149" : t.likelihood === "Low" ? "#3fb950" : "#d29922"
                  } }, t.likelihood)
                ))
              )
            )
          ),

        Array.isArray(sprintHealth.risks) && sprintHealth.risks.length > 0 && React.createElement("div", { style: { marginBottom: "8px" } },
          React.createElement("strong", null, "Risks:"),
          React.createElement("ul", null, sprintHealth.risks.map((r, i) => React.createElement("li", { key: i, className: "small" }, r)))
        ),

        Array.isArray(sprintHealth.recommendations) && sprintHealth.recommendations.length > 0 && React.createElement("div", { style: { marginBottom: "8px" } },
          React.createElement("strong", null, "Recommendations:"),
          React.createElement("ul", null, sprintHealth.recommendations.map((r, i) => React.createElement("li", { key: i, className: "small" }, r)))
        ),

        Array.isArray(sprintHealth.rationale) && sprintHealth.rationale.length > 0 && React.createElement("div", { style: { marginBottom: "8px" } },
          React.createElement("strong", null, "Rationale:"),
          React.createElement("ul", null, sprintHealth.rationale.map((r, i) => React.createElement("li", { key: i, className: "small" }, r)))
        ),

        Array.isArray(sprintHealth.dataSources) && React.createElement("p", { className: "small", style: { fontStyle: "italic", color: "#8b949e" } },
          `Data sources: ${sprintHealth.dataSources.join(", ")}`
        ),

        React.createElement("div", { style: { marginTop: "8px" } },
          React.createElement("button", { onClick: () => saveValidation("health", "Approved"), style: { marginRight: "8px" } }, "Approve"),
          React.createElement("button", { onClick: () => saveValidation("health", "Rejected") }, "Reject")
        )
      )
    )
  );
}

createRoot(document.getElementById("root")).render(React.createElement(App));
