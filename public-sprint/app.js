import React, { useMemo, useState } from "https://esm.sh/react@18";
import { createRoot } from "https://esm.sh/react-dom@18/client";

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const raw = await response.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    const snippet = (raw || "").replace(/\s+/g, " ").slice(0, 220);
    throw new Error(
      `Server returned non-JSON response (HTTP ${response.status}). ${snippet || "Empty response."}`
    );
  }
  if (!response.ok) {
    throw new Error(data?.error || `Request failed with HTTP ${response.status}`);
  }
  return data;
}

function TicketItem({
  ticket,
  index,
  onToggle,
  onMoveUp,
  onMoveDown,
  onAssigneeChange,
  onAssignmentReviewChange
}) {
  const review = ticket.assignmentReview || { status: "Pending", reviewer: "", comment: "" };
  return React.createElement(
    "div",
    { className: "ticket" },
    React.createElement(
      "div",
      { className: "row" },
      React.createElement("input", {
        type: "checkbox",
        checked: !!ticket.selected,
        onChange: e => onToggle(index, e.target.checked),
        style: { width: "18px", marginTop: "5px" }
      }),
      React.createElement(
        "div",
        { style: { flex: 1 } },
        React.createElement("div", null, `${ticket.key || "(no-key)"} - ${ticket.summary || ticket.title}`),
        React.createElement(
          "div",
          { className: "small" },
          `${ticket.priority || "Medium"} | ${ticket.storyPoints ?? "?"} SP | ${ticket.status || "To Do"}`
        ),
        (ticket.assignee || ticket.confidence || (ticket.rationale && ticket.rationale.length)) && React.createElement(
          React.Fragment,
          null,
          React.createElement(
            "div",
            { className: "small" },
            `Assignee: ${ticket.assignee || "N/A"} | Confidence: ${ticket.confidence ?? "N/A"}`
          ),
          React.createElement(
            "div",
            { className: "row", style: { marginTop: "6px" } },
            React.createElement(
              "div",
              { className: "field" },
              React.createElement("label", null, "Assignee (editable)"),
              React.createElement("input", {
                value: ticket.assignee || "",
                onChange: e => onAssigneeChange(index, e.target.value)
              })
            ),
            React.createElement(
              "div",
              { className: "field" },
              React.createElement("label", null, "Assignment validation"),
              React.createElement(
                "select",
                {
                  value: review.status || "Pending",
                  onChange: e => onAssignmentReviewChange(index, "status", e.target.value)
                },
                ["Pending", "Approved", "Edited", "Rejected"].map(v =>
                  React.createElement("option", { key: v, value: v }, v)
                )
              )
            ),
            React.createElement(
              "div",
              { className: "field" },
              React.createElement("label", null, "Reviewer"),
              React.createElement("input", {
                value: review.reviewer || "",
                onChange: e => onAssignmentReviewChange(index, "reviewer", e.target.value)
              })
            )
          ),
          React.createElement(
            "div",
            { className: "field" },
            React.createElement("label", null, "Validation comment"),
            React.createElement("input", {
              value: review.comment || "",
              onChange: e => onAssignmentReviewChange(index, "comment", e.target.value)
            })
          ),
          Array.isArray(ticket.rationale) && ticket.rationale.length > 0 && React.createElement(
            "div",
            { className: "small" },
            `AI rationale: ${ticket.rationale.join(" | ")}`
          ),
          (!Array.isArray(ticket.rationale) || ticket.rationale.length === 0) && React.createElement(
            "div",
            { className: "small" },
            "AI rationale: Fallback assignment used (no model rationale returned)."
          )
        )
      ),
      React.createElement(
        "div",
        null,
        React.createElement("button", { onClick: () => onMoveUp(index), style: { marginRight: "6px" } }, "Up"),
        React.createElement("button", { onClick: () => onMoveDown(index) }, "Down")
      )
    )
  );
}

function App() {
  const [source, setSource] = useState("jira");
  const [filePath, setFilePath] = useState("data/refined_backlog.json");
  const [metricsFilePath, setMetricsFilePath] = useState("data/sprint_metrics_simulated.json");
  const [capacityPoints, setCapacityPoints] = useState(30);
  const [teamVelocity, setTeamVelocity] = useState(30);
  const [metrics, setMetrics] = useState(null);
  const [sprintOptions, setSprintOptions] = useState([]);
  const [boardOptions, setBoardOptions] = useState([]);
  const [createSprint, setCreateSprint] = useState({
    boardId: "",
    name: "",
    goal: "",
    startDate: "",
    endDate: ""
  });
  const [newTicket, setNewTicket] = useState({
    key: "",
    summary: "",
    priority: "Medium",
    storyPoints: 3,
    status: "To Do",
    itemType: "Task"
  });
  const [tickets, setTickets] = useState([]);
  const [sprintGoal, setSprintGoal] = useState("");
  const [sprintId, setSprintId] = useState("");
  const [status, setStatus] = useState("Ready.");
  const [busy, setBusy] = useState(false);

  const selectedTickets = useMemo(() => tickets.filter(t => t.selected), [tickets]);
  const plannedPoints = useMemo(
    () => selectedTickets.reduce((sum, t) => sum + (Number(t.storyPoints) || 3), 0),
    [selectedTickets]
  );
  const pendingAssignmentValidationCount = useMemo(
    () => selectedTickets.filter(t => (t.assignmentReview?.status || "Pending") === "Pending").length,
    [selectedTickets]
  );
  const rejectedAssignmentCount = useMemo(
    () => selectedTickets.filter(t => (t.assignmentReview?.status || "Pending") === "Rejected").length,
    [selectedTickets]
  );
  const capacityDelta = useMemo(() => Number(capacityPoints || 0) - plannedPoints, [capacityPoints, plannedPoints]);
  const overCapacity = useMemo(() => plannedPoints > Number(capacityPoints || 0), [plannedPoints, capacityPoints]);
  const overVelocity = useMemo(() => plannedPoints > Number(teamVelocity || 0), [plannedPoints, teamVelocity]);

  async function simulateMetrics() {
    setBusy(true);
    setStatus("Loading historical capacity & velocity from backlog-aligned sprint data...");
    try {
      const data = await requestJson("/api/metrics/load", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: metricsFilePath,
          userCapacityPoints: Number(capacityPoints)
        })
      });
      setMetrics(data);
      if (data?.current?.expectedVelocityPoints != null) {
        setTeamVelocity(Number(data.current.expectedVelocityPoints));
      }
      setStatus(
        `Historical metrics loaded. Last sprint ${data.summary.lastSprintCapacity}/${data.summary.lastSprintVelocity} SP, expected velocity ${data.current.expectedVelocityPoints} SP.`
      );
    } catch (err) {
      setStatus(`Error: ${err.message}`);
      setMetrics(null);
    } finally {
      setBusy(false);
    }
  }

  async function loadMetricsFromFile() {
    setBusy(true);
    setStatus("Loading capacity/velocity sheet...");
    try {
      const data = await requestJson("/api/metrics/load", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: metricsFilePath,
          userCapacityPoints: Number(capacityPoints)
        })
      });
      setMetrics(data);
      if (data?.current?.expectedVelocityPoints != null) {
        setTeamVelocity(Number(data.current.expectedVelocityPoints));
      }
      setStatus(`Loaded historical metrics from file. Last sprint ${data.summary.lastSprintCapacity}/${data.summary.lastSprintVelocity} SP.`);
    } catch (err) {
      setStatus(`Error: ${err.message}`);
      setMetrics(null);
    } finally {
      setBusy(false);
    }
  }

  async function loadBacklog() {
    setBusy(true);
    setStatus("Loading backlog...");
    try {
      const data = await requestJson("/api/backlog/load", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, filePath })
      });
      setTickets(data.tickets || []);
      setStatus(`Loaded ${data.count} tickets from ${data.source}.`);
    } catch (err) {
      setStatus(`Error: ${err.message}`);
      setTickets([]);
    } finally {
      setBusy(false);
    }
  }

  async function recommend() {
    setBusy(true);
    setStatus("Generating sprint recommendation...");
    try {
      const data = await requestJson("/api/sprint/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickets, capacityPoints: Number(capacityPoints) })
      });

      const selectedKeySet = new Set((data.selected || []).map(t => t.key));
      const merged = [
        ...(data.selected || []).map(t => ({ ...t, selected: true })),
        ...(data.deferred || []).map(t => ({ ...t, selected: false }))
      ];

      if (!merged.length) {
        const fallback = tickets.map(t => ({ ...t, selected: selectedKeySet.has(t.key) }));
        setTickets(fallback);
      } else {
        setTickets(merged);
      }
      setSprintGoal(data.sprintGoal || "");
      setStatus(`Recommended ${data.selected.length} tickets (${data.totalPoints}/${data.usedCapacityPoints} SP capacity used).`);
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function generateAiAssignments() {
    setBusy(true);
    setStatus("Generating AI assignment based on skill set, capacity, and historical data...");
    try {
      const data = await requestJson("/api/sprint/ai-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickets })
      });
      const enriched = Array.isArray(data.tickets) ? data.tickets : [];
      let cursor = 0;
      setTickets(prev => prev.map(ticket => {
        if (!ticket.selected) return ticket;
        const next = enriched[cursor];
        cursor += 1;
        return next ? { ...ticket, ...next, selected: true } : ticket;
      }));
      setStatus(`AI assignment complete for ${data.count} tickets.`);
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  function toggleTicket(index, selected) {
    setTickets(prev => prev.map((t, i) => i === index ? { ...t, selected } : t));
  }

  function moveTicket(index, direction) {
    setTickets(prev => {
      const copy = [...prev];
      const target = index + direction;
      if (target < 0 || target >= copy.length) return copy;
      const temp = copy[index];
      copy[index] = copy[target];
      copy[target] = temp;
      return copy;
    });
  }

  function updateAssignee(index, assignee) {
    setTickets(prev => prev.map((t, i) => i === index ? { ...t, assignee } : t));
  }

  function updateAssignmentReview(index, field, value) {
    setTickets(prev => prev.map((t, i) => {
      if (i !== index) return t;
      return {
        ...t,
        assignmentReview: {
          status: t.assignmentReview?.status || "Pending",
          reviewer: t.assignmentReview?.reviewer || "",
          comment: t.assignmentReview?.comment || "",
          [field]: value
        }
      };
    }));
  }

  function addAdHocTicket() {
    const summary = String(newTicket.summary || "").trim();
    if (!summary) {
      setStatus("Error: Last-minute ticket summary is required.");
      return;
    }
    const ticket = {
      key: String(newTicket.key || "").trim(),
      title: summary,
      summary,
      description: "",
      priority: newTicket.priority || "Medium",
      status: newTicket.status || "To Do",
      itemType: newTicket.itemType || "Task",
      storyPoints: Number(newTicket.storyPoints) || 3,
      selected: true
    };
    setTickets(prev => [ticket, ...prev]);
    setStatus("Added last-minute ticket to planning list.");
    setNewTicket(prev => ({ ...prev, key: "", summary: "", storyPoints: 3 }));
  }

  async function savePlan() {
    setBusy(true);
    setStatus("Saving sprint plan...");
    try {
      const data = await requestJson("/api/sprint/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          capacityPoints: Number(capacityPoints),
          sprintGoal,
          sprintBacklog: selectedTickets
        })
      });
      setStatus(`Saved plan: ${data.totalPoints}/${data.capacityPoints} SP.`);
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function pushToJiraSprint() {
    setBusy(true);
    setStatus("Pushing selected issues to JIRA sprint...");
    try {
      if (pendingAssignmentValidationCount > 0) {
        throw new Error(`Human validation pending for ${pendingAssignmentValidationCount} selected tickets.`);
      }
      if (rejectedAssignmentCount > 0) {
        throw new Error(`Cannot push while ${rejectedAssignmentCount} selected tickets are marked Rejected.`);
      }
      const sprintValue = String(sprintId || "").trim();
      if (!/^\d+$/.test(sprintValue)) {
        throw new Error(`Sprint ID must be numeric (example: 123). You entered: ${sprintValue || "(empty)"}`);
      }
      const issueKeys = selectedTickets.map(t => t.key).filter(Boolean);
      const data = await requestJson("/api/sprint/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sprintId: sprintValue, issueKeys })
      });
      setStatus(`Pushed ${data.pushed} issues to sprint ${data.sprintId}.`);
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function loadJiraSprints() {
    setBusy(true);
    setStatus("Loading Jira sprint options...");
    try {
      const data = await requestJson("/api/jira/sprints");
      const options = Array.isArray(data.sprints) ? data.sprints : [];
      setSprintOptions(options);
      if (!sprintId && options.length) {
        setSprintId(String(options[0].id));
      }
      setStatus(`Loaded ${options.length} Jira sprints (active/future).`);
    } catch (err) {
      setStatus(`Error: ${err.message}`);
      setSprintOptions([]);
    } finally {
      setBusy(false);
    }
  }

  async function loadJiraBoards() {
    setBusy(true);
    setStatus("Loading Jira boards...");
    try {
      const data = await requestJson("/api/jira/boards");
      const boards = Array.isArray(data.boards) ? data.boards : [];
      setBoardOptions(boards);
      if (!createSprint.boardId && boards.length) {
        setCreateSprint(prev => ({ ...prev, boardId: String(boards[0].id) }));
      }
      setStatus(`Loaded ${boards.length} Jira boards.`);
    } catch (err) {
      setStatus(`Error: ${err.message}`);
      setBoardOptions([]);
    } finally {
      setBusy(false);
    }
  }

  async function createJiraSprint() {
    setBusy(true);
    setStatus("Creating Jira sprint...");
    try {
      if (!createSprint.boardId) {
        throw new Error("Please load/select a Jira board first.");
      }
      if (!String(createSprint.name || "").trim()) {
        throw new Error("Sprint name is required.");
      }
      const payload = {
        boardId: Number(createSprint.boardId),
        name: createSprint.name,
        goal: createSprint.goal,
        startDate: createSprint.startDate ? new Date(createSprint.startDate).toISOString() : undefined,
        endDate: createSprint.endDate ? new Date(createSprint.endDate).toISOString() : undefined
      };
      const data = await requestJson("/api/jira/sprints/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      setStatus(`Created sprint ${data.sprint.name} (${data.sprint.id}).`);
      setSprintId(String(data.sprint.id));
      await loadJiraSprints();
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  return React.createElement(
    "div",
    { className: "container" },
    React.createElement("div", { className: "header" },
      React.createElement("div", null,
        React.createElement("h1", null, "\u{1F3AF} Sprint Planning Agent"),
        React.createElement("div", { className: "subtitle" }, "AI-powered sprint capacity planning, ticket assignment, and risk analysis")
      ),
      React.createElement("div", { className: "header-actions" },
        React.createElement("span", { className: "badge badge-info" }, "Port 3020")
      )
    ),
    React.createElement(
      "div",
      { className: "card" },
      React.createElement("h2", null, "1) Load backlog"),
      React.createElement(
        "div",
        { className: "row" },
        React.createElement(
          "div",
          { className: "field" },
          React.createElement("label", null, "Source"),
          React.createElement(
            "select",
            { value: source, onChange: e => setSource(e.target.value) },
            React.createElement("option", { value: "jira" }, "JIRA"),
            React.createElement("option", { value: "file" }, "Local JSON file")
          )
        ),
        source === "file" && React.createElement(
          "div",
          { className: "field" },
          React.createElement("label", null, "File path"),
          React.createElement("input", {
            value: filePath,
            onChange: e => setFilePath(e.target.value)
          })
        ),
        React.createElement(
          "div",
          { className: "field" },
          React.createElement("label", null, "Sprint capacity (SP)"),
          React.createElement("input", {
            type: "number",
            value: capacityPoints,
            onChange: e => setCapacityPoints(Number(e.target.value) || 0)
          })
        ),
        React.createElement(
          "div",
          { className: "field" },
          React.createElement("label", null, "Team velocity (SP)"),
          React.createElement("input", {
            type: "number",
            value: teamVelocity,
            onChange: e => setTeamVelocity(Number(e.target.value) || 0)
          })
        )
      ),
      
      React.createElement("button", { onClick: simulateMetrics, disabled: busy, style: { marginRight: "8px" } }, "Historical Capacity & Velocity"),
      React.createElement("button", { onClick: loadBacklog, disabled: busy }, "Load Backlog")
    ),
    metrics && React.createElement(
      "div",
      { className: "card" },
      React.createElement("h2", null, "Historical sprint metrics"),
      React.createElement(
        "p",
        { className: "small" },
        `Previous sprint: capacity ${metrics.summary.lastSprintCapacity} SP, velocity ${metrics.summary.lastSprintVelocity} SP | Trend: ${metrics.summary.trend}`
      ),
      React.createElement(
        "p",
        { className: "small" },
        `Historical average: capacity ${metrics.summary.avgCapacity} SP, velocity ${metrics.summary.avgVelocity} SP`
      ),
      React.createElement(
        "p",
        { className: "small" },
        `Current sprint (planned): user capacity ${metrics.current.userCapacityPoints} SP, expected velocity ${metrics.current.expectedVelocityPoints} SP, recommended range ${metrics.current.recommendedPlanRange.min}-${metrics.current.recommendedPlanRange.max} SP`
      ),
      Array.isArray(metrics.history) && metrics.history.length > 0 && React.createElement(
        "details",
        { style: { marginTop: "8px" } },
        React.createElement("summary", { className: "small", style: { cursor: "pointer" } }, "View historical sprint details (ticket references)"),
        React.createElement(
          "div",
          { style: { marginTop: "6px" } },
          metrics.history.map((sprint, idx) =>
            React.createElement(
              "p",
              { key: idx, className: "small", style: { margin: "2px 0" } },
              `${sprint.sprintName}: ${sprint.velocityPoints}/${sprint.capacityPoints} SP`
                + (Array.isArray(sprint.ticketRefs) && sprint.ticketRefs.length ? ` | Refs: ${sprint.ticketRefs.join(", ")}` : "")
                + (Array.isArray(sprint.themes) && sprint.themes.length ? ` | Themes: ${sprint.themes.join(", ")}` : "")
            )
          )
        )
      )
    ),
    React.createElement("p", null, status),
    tickets.length > 0 && React.createElement(
      React.Fragment,
      null,
      React.createElement(
        "div",
        { className: "card" },
        React.createElement("h2", null, "2) Recommend and adjust sprint backlog"),
        React.createElement("button", { onClick: recommend, disabled: busy, style: { marginRight: "8px" } }, "Recommend Sprint Backlog"),
        React.createElement("button", { onClick: generateAiAssignments, disabled: busy, style: { marginRight: "8px" } }, "AI Assign"),
        React.createElement("span", { className: "small" }, `Selected: ${selectedTickets.length} tickets | Planned: ${plannedPoints} SP | Capacity delta: ${capacityDelta} SP | Velocity reference: ${teamVelocity} SP | Pending validation: ${pendingAssignmentValidationCount}`),
        overCapacity && React.createElement(
          "p",
          { className: "small", style: { color: "#f85149", marginTop: "8px" } },
          `Warning: Planned points (${plannedPoints}) exceed sprint capacity (${capacityPoints}).`
        ),
        overVelocity && React.createElement(
          "p",
          { className: "small", style: { color: "#f85149", marginTop: "4px" } },
          `Warning: Planned points (${plannedPoints}) exceed team velocity reference (${teamVelocity}).`
        )
      ),
      React.createElement(
        "div",
        { className: "grid" },
        React.createElement(
          "div",
          { className: "card" },
          React.createElement("h3", null, "Backlog tickets"),
          React.createElement(
            "div",
            { className: "card", style: { background: "#0d1117", marginBottom: "10px" } },
            React.createElement("h4", null, "Add last-minute ticket"),
            React.createElement(
              "div",
              { className: "row" },
              React.createElement(
                "div",
                { className: "field" },
                React.createElement("label", null, "Key (optional)"),
                React.createElement("input", {
                  value: newTicket.key,
                  onChange: e => setNewTicket(prev => ({ ...prev, key: e.target.value }))
                })
              ),
              React.createElement(
                "div",
                { className: "field" },
                React.createElement("label", null, "Summary"),
                React.createElement("input", {
                  value: newTicket.summary,
                  onChange: e => setNewTicket(prev => ({ ...prev, summary: e.target.value }))
                })
              )
            ),
            React.createElement(
              "div",
              { className: "row" },
              React.createElement(
                "div",
                { className: "field" },
                React.createElement("label", null, "Priority"),
                React.createElement(
                  "select",
                  {
                    value: newTicket.priority,
                    onChange: e => setNewTicket(prev => ({ ...prev, priority: e.target.value }))
                  },
                  ["Highest", "High", "Medium", "Low", "Lowest"].map(p =>
                    React.createElement("option", { key: p, value: p }, p)
                  )
                )
              ),
              React.createElement(
                "div",
                { className: "field" },
                React.createElement("label", null, "Story points"),
                React.createElement("input", {
                  type: "number",
                  value: newTicket.storyPoints,
                  onChange: e => setNewTicket(prev => ({ ...prev, storyPoints: Number(e.target.value) || 0 }))
                })
              ),
              React.createElement(
                "div",
                { className: "field" },
                React.createElement("label", null, "Type"),
                React.createElement(
                  "select",
                  {
                    value: newTicket.itemType,
                    onChange: e => setNewTicket(prev => ({ ...prev, itemType: e.target.value }))
                  },
                  ["Story", "Task", "Bug", "Spike"].map(t =>
                    React.createElement("option", { key: t, value: t }, t)
                  )
                )
              )
            ),
            React.createElement("button", { onClick: addAdHocTicket, disabled: busy }, "Add Last-minute Ticket")
          ),
          tickets.map((ticket, index) =>
            React.createElement(TicketItem, {
              key: `${ticket.key || "ticket"}-${index}`,
              ticket,
              index,
              onToggle: toggleTicket,
              onMoveUp: idx => moveTicket(idx, -1),
              onMoveDown: idx => moveTicket(idx, 1),
              onAssigneeChange: updateAssignee,
              onAssignmentReviewChange: updateAssignmentReview
            })
          )
        ),
        React.createElement(
          "div",
          { className: "card" },
          React.createElement("h3", null, "3) Sprint goal and finalize"),
          React.createElement(
            "div",
            { className: "field" },
            React.createElement("label", null, "Sprint goal"),
            React.createElement("textarea", {
              value: sprintGoal,
              onChange: e => setSprintGoal(e.target.value)
            })
          ),
          React.createElement("button", { onClick: savePlan, disabled: busy, style: { marginRight: "8px" } }, "Save Sprint Plan"),
          React.createElement("button", { onClick: loadJiraSprints, disabled: busy, style: { marginRight: "8px" } }, "Load Jira Sprints"),
          React.createElement("button", { onClick: loadJiraBoards, disabled: busy, style: { marginRight: "8px" } }, "Load Jira Boards"),
          React.createElement(
            "div",
            { className: "card", style: { background: "#0d1117", marginTop: "12px" } },
            React.createElement("h4", null, "Create Jira sprint"),
            React.createElement(
              "div",
              { className: "row" },
              React.createElement(
                "div",
                { className: "field" },
                React.createElement("label", null, "Board"),
                React.createElement(
                  "select",
                  {
                    value: createSprint.boardId,
                    onChange: e => setCreateSprint(prev => ({ ...prev, boardId: e.target.value }))
                  },
                  React.createElement("option", { value: "" }, boardOptions.length ? "Select board" : "Load boards first"),
                  boardOptions.map(b =>
                    React.createElement("option", { key: b.id, value: String(b.id) }, `${b.name} (${b.type})`)
                  )
                )
              ),
              React.createElement(
                "div",
                { className: "field" },
                React.createElement("label", null, "Board ID (manual fallback)"),
                React.createElement("input", {
                  value: createSprint.boardId,
                  onChange: e => setCreateSprint(prev => ({ ...prev, boardId: e.target.value })),
                  placeholder: "e.g. 3"
                })
              ),
              React.createElement(
                "div",
                { className: "field" },
                React.createElement("label", null, "Sprint name"),
                React.createElement("input", {
                  value: createSprint.name,
                  onChange: e => setCreateSprint(prev => ({ ...prev, name: e.target.value })),
                  placeholder: "Sprint 12"
                })
              )
            ),
            React.createElement(
              "div",
              { className: "row" },
              React.createElement(
                "div",
                { className: "field" },
                React.createElement("label", null, "Sprint goal (optional)"),
                React.createElement("input", {
                  value: createSprint.goal,
                  onChange: e => setCreateSprint(prev => ({ ...prev, goal: e.target.value }))
                })
              ),
              React.createElement(
                "div",
                { className: "field" },
                React.createElement("label", null, "Start date"),
                React.createElement("input", {
                  type: "date",
                  value: createSprint.startDate,
                  onChange: e => setCreateSprint(prev => ({ ...prev, startDate: e.target.value }))
                })
              ),
              React.createElement(
                "div",
                { className: "field" },
                React.createElement("label", null, "End date"),
                React.createElement("input", {
                  type: "date",
                  value: createSprint.endDate,
                  onChange: e => setCreateSprint(prev => ({ ...prev, endDate: e.target.value }))
                })
              )
            ),
            React.createElement("button", { onClick: createJiraSprint, disabled: busy }, "Create Sprint")
          ),
          sprintOptions.length > 0 && React.createElement(
            "div",
            { className: "field", style: { marginTop: "12px" } },
            React.createElement("label", null, "JIRA sprint"),
            React.createElement(
              "select",
              {
                value: sprintId,
                onChange: e => setSprintId(e.target.value)
              },
              sprintOptions.map(s =>
                React.createElement(
                  "option",
                  { key: s.id, value: String(s.id) },
                  `${s.name} [${s.state}] - board ${s.boardName}`
                )
              )
            )
          ),
          React.createElement(
            "div",
            { className: "field", style: { marginTop: "12px" } },
            React.createElement("label", null, sprintOptions.length > 0
              ? "JIRA sprint ID (auto from dropdown, editable if needed)"
              : "Optional: JIRA sprint ID (numeric, e.g. 123)"),
            React.createElement("input", {
              value: sprintId,
              onChange: e => setSprintId(e.target.value),
              placeholder: "123"
            })
          ),
          React.createElement("button", { onClick: pushToJiraSprint, disabled: busy || !sprintId }, "Push Selected Tickets to JIRA Sprint")
        )
      )
    )
  );
}

createRoot(document.getElementById("root")).render(React.createElement(App));
