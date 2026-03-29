import React, { useMemo, useState } from "https://esm.sh/react@18";
import { createRoot } from "https://esm.sh/react-dom@18/client";

const reviewStatuses = ["Pending", "Approved", "Edited & Approved", "Rejected"];
const estimationStatuses = ["Pending Approval", "Approved", "Rejected"];
const planningPokerValues = ["", "1", "2", "3", "5", "8", "13", "21"];
const priorities = ["Highest", "High", "Medium", "Low", "Lowest"];
const issueTypes = ["Story", "Bug", "Task", "Epic"];

function TicketCard({ ticket, index, onChange }) {
  const update = (field, value) => onChange(index, field, value);
  const historyRefKeys = Array.isArray(ticket.estimation?.historicalReferenceKeys)
    ? ticket.estimation.historicalReferenceKeys.filter(Boolean)
    : (Array.isArray(ticket.estimation?.similarTickets)
      ? ticket.estimation.similarTickets.map(row => row?.key).filter(Boolean)
      : []);

  return React.createElement(
    "div",
    { className: "card" },
    React.createElement("h3", null, `Ticket ${index + 1}${ticket.key ? ` - ${ticket.key}` : ""}`),
    React.createElement(
      "div",
      { className: "row" },
      React.createElement(
        "div",
        { className: "field" },
        React.createElement("label", null, "Title"),
        React.createElement("input", {
          value: ticket.title || "",
          onChange: e => update("title", e.target.value)
        })
      ),
      React.createElement(
        "div",
        { className: "field" },
        React.createElement("label", null, "Summary"),
        React.createElement("input", {
          value: ticket.summary || "",
          onChange: e => update("summary", e.target.value)
        })
      )
    ),
    React.createElement(
      "div",
      { className: "field" },
      React.createElement("label", null, "Description"),
      React.createElement("textarea", {
        value: ticket.description || "",
        onChange: e => update("description", e.target.value)
      })
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
            value: ticket.priority || "Medium",
            onChange: e => update("priority", e.target.value)
          },
          priorities.map(value => React.createElement("option", { key: value, value }, value))
        )
      ),
      React.createElement(
        "div",
        { className: "field" },
        React.createElement("label", null, "Item Type"),
        React.createElement(
          "select",
          {
            value: ticket.itemType || "Story",
            onChange: e => update("itemType", e.target.value)
          },
          issueTypes.map(value => React.createElement("option", { key: value, value }, value))
        )
      ),
      React.createElement(
        "div",
        { className: "field" },
        React.createElement("label", null, "Review Status"),
        React.createElement(
          "select",
          {
            value: ticket.review?.status || "Pending",
            onChange: e => update("review.status", e.target.value)
          },
          reviewStatuses.map(value => React.createElement("option", { key: value, value }, value))
        )
      )
    ),
    React.createElement(
      "div",
      { className: "row" },
      React.createElement(
        "div",
        { className: "field" },
        React.createElement("label", null, "Reviewer"),
        React.createElement("input", {
          value: ticket.review?.reviewer || "",
          onChange: e => update("review.reviewer", e.target.value)
        })
      ),
      React.createElement(
        "div",
        { className: "field" },
        React.createElement("label", null, "Comment"),
        React.createElement("input", {
          value: ticket.review?.comments?.[0] || "",
          onChange: e => update("review.comment", e.target.value)
        })
      )
    ),
    React.createElement(
      "div",
      { className: "card", style: { marginTop: "8px", background: "#0d1117" } },
      React.createElement("h4", null, "AI insights and estimation"),
      React.createElement(
        "div",
        { className: "row" },
        React.createElement(
          "div",
          { className: "field" },
          React.createElement("label", null, "AI priority suggestion"),
          React.createElement("input", {
            value: ticket.aiInsights?.prioritySuggestion || "",
            readOnly: true
          })
        ),
        React.createElement(
          "div",
          { className: "field" },
          React.createElement("label", null, "AI planning poker estimate"),
          React.createElement("input", {
            value: ticket.estimation?.aiSuggestedPoints ?? "",
            readOnly: true
          })
        ),
        React.createElement(
          "div",
          { className: "field" },
          React.createElement("label", null, "Estimation confidence"),
          React.createElement("input", {
            value: ticket.aiInsights?.confidenceScore != null
              ? `${ticket.aiInsights.confidenceScore}%`
              : "",
            readOnly: true
          })
        )
      ),
      React.createElement(
        "div",
        { className: "row" },
        React.createElement(
          "div",
          { className: "field" },
          React.createElement("label", null, "Approved story points"),
          React.createElement(
            "select",
            {
              value: ticket.estimation?.approvedPoints != null
                ? String(ticket.estimation.approvedPoints)
                : "",
              onChange: e => update("estimation.approvedPoints", e.target.value)
            },
            planningPokerValues.map(value =>
              React.createElement(
                "option",
                { key: value || "none", value },
                value || "Select"
              )
            )
          )
        ),
        React.createElement(
          "div",
          { className: "field" },
          React.createElement("label", null, "Estimation approval"),
          React.createElement(
            "select",
            {
              value: ticket.estimation?.status || "Pending Approval",
              onChange: e => update("estimation.status", e.target.value)
            },
            estimationStatuses.map(value => React.createElement("option", { key: value, value }, value))
          )
        ),
        React.createElement(
          "div",
          { className: "field" },
          React.createElement("label", null, "AI rationale"),
          React.createElement("input", {
            value: ticket.estimation?.rationale || "",
            readOnly: true
          })
        )
      ),
      React.createElement(
        "p",
        { className: "small" },
        `Historical references used: ${ticket.estimation?.basedOnHistoryCount || 0}${historyRefKeys.length ? ` (IDs: ${historyRefKeys.join(", ")})` : ""}`
      ),
      React.createElement(
        "p",
        { className: "small" },
        `Risks: ${ticket.aiInsights?.risks || "Generate insights to view risk summary"}`
      ),
      React.createElement(
        "p",
        { className: "small" },
        `Dependencies (history-backed): ${ticket.aiInsights?.dependencies || "Generate insights to view dependencies"}`
      ),
      React.createElement(
        "div",
        { className: "field" },
        React.createElement("label", null, "Final dependencies (editable, comma-separated)"),
        React.createElement("textarea", {
          value: Array.isArray(ticket.dependencies) ? ticket.dependencies.join(", ") : "",
          onChange: e => update("dependencies", e.target.value)
        })
      )
    )
  );
}

function App() {
  const [operation, setOperation] = useState("1");
  const [inputMode, setInputMode] = useState("file");
  const [inputFile, setInputFile] = useState("JSON Schema for Requirement_feedback.json");
  const [rawText, setRawText] = useState("");
  const [tickets, setTickets] = useState([]);
  const [status, setStatus] = useState("Ready.");
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState(null);

  const approvedCount = useMemo(
    () => tickets.filter(t => ["Approved", "Edited & Approved"].includes(t.review?.status)).length,
    [tickets]
  );
  const estimationApprovedCount = useMemo(
    () => tickets.filter(t => t.estimation?.status === "Approved").length,
    [tickets]
  );

  async function prepareTickets() {
    setBusy(true);
    setStatus("Preparing tickets...");
    setSummary(null);
    try {
      const payload = {
        operation,
        inputMode,
        inputFile,
        rawText
      };
      const response = await fetch("/api/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Prepare failed.");
      setTickets(data.tickets || []);
      setStatus(`Loaded ${data.tickets.length} tickets.`);
    } catch (err) {
      setStatus(`Error: ${err.message}`);
      setTickets([]);
    } finally {
      setBusy(false);
    }
  }

  async function processTickets() {
    setBusy(true);
    setStatus("Processing tickets and syncing JIRA...");
    setSummary(null);
    try {
      const response = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation, tickets })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Process failed.");
      setTickets(data.results || []);
      setSummary({
        processed: data.processed,
        rejected: data.rejected
      });
      setStatus("Processing complete. Output files were generated.");
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function generateInsights() {
    setBusy(true);
    setStatus("Generating AI insights and planning poker estimates...");
    try {
      const response = await fetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickets })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Insights generation failed.");
      setTickets(data.tickets || []);
      setStatus("AI insights ready. Review and approve estimates before processing.");
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  function updateTicket(index, field, value) {
    setTickets(prev => prev.map((ticket, i) => {
      if (i !== index) return ticket;
      const next = {
        ...ticket,
        review: { ...(ticket.review || {}) },
        estimation: { ...(ticket.estimation || {}) }
      };
      if (field === "review.status") next.review.status = value;
      else if (field === "review.reviewer") next.review.reviewer = value;
      else if (field === "review.comment") next.review.comments = value ? [value] : [];
      else if (field === "estimation.status") next.estimation.status = value;
      else if (field === "estimation.approvedPoints") {
        next.estimation.approvedPoints = value === "" ? null : Number(value);
      }
      else if (field === "dependencies") {
        next.dependencies = value
          .split(",")
          .map(item => item.trim())
          .filter(Boolean);
      }
      else next[field] = value;
      return next;
    }));
  }

  return React.createElement(
    "div",
    { className: "container" },
    React.createElement("div", { className: "header" },
      React.createElement("div", null,
        React.createElement("h1", null, "\u{1F4CB} Backlog Refinement Agent"),
        React.createElement("div", { className: "subtitle" }, "Validate, estimate, and refine backlog items with AI-powered insights")
      ),
      React.createElement("div", { className: "header-actions" },
        React.createElement("span", { className: "badge badge-info" }, "Port 3000")
      )
    ),
    React.createElement(
      "div",
      { className: "card" },
      React.createElement("h2", null, "1) Prepare input"),
      React.createElement(
        "div",
        { className: "row" },
        React.createElement(
          "div",
          { className: "field" },
          React.createElement("label", null, "Operation"),
          React.createElement(
            "select",
            {
              value: operation,
              onChange: e => setOperation(e.target.value)
            },
            React.createElement("option", { value: "1" }, "Generate from requirements/feedback"),
            React.createElement("option", { value: "2" }, "Refine existing JIRA backlog")
          )
        ),
        operation === "1" && React.createElement(
          "div",
          { className: "field" },
          React.createElement("label", null, "Input mode"),
          React.createElement(
            "select",
            {
              value: inputMode,
              onChange: e => setInputMode(e.target.value)
            },
            React.createElement("option", { value: "file" }, "File"),
            React.createElement("option", { value: "paste" }, "Paste text")
          )
        )
      ),
      operation === "1" && inputMode === "file" && React.createElement(
        "div",
        { className: "field" },
        React.createElement("label", null, "Input file path"),
        React.createElement("input", {
          value: inputFile,
          onChange: e => setInputFile(e.target.value)
        })
      ),
      operation === "1" && inputMode === "paste" && React.createElement(
        "div",
        { className: "field" },
        React.createElement("label", null, "Paste requirements or feedback (use --- between items)"),
        React.createElement("textarea", {
          value: rawText,
          onChange: e => setRawText(e.target.value)
        })
      ),
      React.createElement("button", { onClick: prepareTickets, disabled: busy }, "Prepare Tickets")
    ),
    React.createElement("p", { className: "status" }, status),
    tickets.length > 0 && React.createElement(
      React.Fragment,
      null,
      React.createElement(
        "div",
        { className: "card" },
        React.createElement("h2", null, "2) Review and process"),
        React.createElement("p", { className: "small" }, `${tickets.length} tickets loaded, ${approvedCount} marked for approval.`),
        React.createElement("p", { className: "small" }, `${estimationApprovedCount} estimates approved by human.`),
        React.createElement("button", { onClick: generateInsights, disabled: busy, style: { marginRight: "8px" } }, "Generate AI Insights & Estimates"),
        React.createElement("button", { onClick: processTickets, disabled: busy }, "Process Tickets")
      ),
      tickets.map((ticket, index) =>
        React.createElement(TicketCard, {
          key: `${ticket.key || "ticket"}-${index}`,
          ticket,
          index,
          onChange: updateTicket
        })
      )
    ),
    summary && React.createElement(
      "div",
      { className: "card" },
      React.createElement("h2", null, "Run summary"),
      React.createElement("p", null, `Processed: ${summary.processed}`),
      React.createElement("p", null, `Rejected: ${summary.rejected}`)
    )
  );
}

createRoot(document.getElementById("root")).render(React.createElement(App));
