import { AzureChatOpenAI } from "@langchain/openai";
import fs from "fs";
import path from "path";

const llm = new AzureChatOpenAI({
  azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY || "",
  azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_API_INSTANCE_NAME || "",
  azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME || "",
  azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION || "2024-04-01-preview",

  temperature: 0.2,
});

// === PROMPT TEMPLATES (MODULAR, PER-TYPE) ===
const templates = {
  Epic: [
    { role: "system", content: "You are a Jira Epic generator." },
    { role: "user", content: `Create a concise Epic from this summary:\nSummary: {summary}\nReturn:\n- Title\n- Description` },
  ],
  Story: [
    { role: "system", content: "You are a Jira story expert." },
    { role: "user", content: `Rewrite as a JIRA story with acceptance criteria.\nSummary: {summary}\nReturn:\n- Title\n- Acceptance Criteria (bullets)` },
  ],
  Bug: [
    { role: "system", content: "You are a QA agent." },
    { role: "user", content: `Rewrite as a JIRA bug ticket.\nSummary: {summary}\nReturn:\n- Title\n- Steps to Reproduce (bullets)\n- Actual vs Expected` },
  ],
  Task: [
    { role: "system", content: "You are a JIRA task generator." },
    { role: "user", content: `Rewrite as a JIRA task:\nSummary: {summary}\nReturn:\n- Title\n- Description` }
  ],
  Feedback: [
    { role: "system", content: "You are a customer feedback analyst for an automotive software team." },
    { role: "user", content: `Consider this feedback:\nSummary: {summary}\nIf actionable, rephrase as a requirement or bug. Otherwise, give a key insight.\nReturn:\n- Insight/Recommendation` }
  ],
  Spike: [
    { role: "system", content: "You are a Jira spike creator." },
    { role: "user", content: `Rewrite as a JIRA spike:\nSummary: {summary}\nReturn:\n- Title\n- Research Goals\n- Acceptance Criteria` }
  ]
};

function renderMarkdown(issues) {
  if (!issues?.length)
    return "# Refined Backlog\n\n**No issues produced.**\n";
  return (
    "# Refined Backlog\n\n" +
    issues
      .map(issue => {
        let section = `## [${issue.IssueType}] ${issue.Title}\n\n`;
        section += `**Status:** ${issue.Status}\n**Priority:** ${issue.Priority}\n**Assignee:** ${issue.Assignee}\n`;
        if (issue.Description) section += `\n**Description:**\n${issue.Description}\n`;
        if (issue["Acceptance Criteria"])
          section += `\n**Acceptance Criteria:**\n${issue["Acceptance Criteria"]}\n`;
        if (issue["Steps to Reproduce"])
          section += `\n**Steps to Reproduce:**\n${issue["Steps to Reproduce"]}\n`;
        if (issue["Actual vs Expected"])
          section += `\n**Actual vs Expected:**\n${issue["Actual vs Expected"]}\n`;
        if (issue["Insight/Recommendation"])
          section += `\n**Insight/Recommendation:**\n${issue["Insight/Recommendation"]}\n`;
        if (issue["Research Goals"])
          section += `\n**Research Goals:**\n${issue["Research Goals"]}\n`;
        section += "\n---\n";
        return section;
      })
      .join("\n")
  );
}

function extractSections(text) {
  const sections = {};
  let current = null, lines = text.split("\n");
  for (let line of lines) {
    const match = /^-?\s*(Title|Description|Acceptance Criteria|Steps to Reproduce|Actual vs Expected|Insight\/Recommendation|Research Goals)[:\-]?\s*(.*)/i.exec(line.trim());
    if (match) {
      current = match[1];
      sections[current] = match[2] || "";
    } else if (current && line.trim()) {
      sections[current] += (sections[current] ? "\n" : "") + line.trim();
    }
  }
  return sections;
}

// === LLM CALL FOR EACH ISSUE/REQ ===
async function callLLM(issueType, summary) {
  if (!templates[issueType]) {
    console.log(`Skipping unsupported ticket type: ${issueType}`);
    return { content: "" };
  }
  const messages = templates[issueType].map(
    msg => msg.content.includes("{summary}")
      ? { ...msg, content: msg.content.replace("{summary}", summary) }
      : msg
  );
  const resp = await llm.invoke(messages);
  return { content: resp.content };
}

// === AGENT FUNCTION: CREATE DEMO BACKLOG ===
async function createBacklog() {
  let reqs;
  try {
    reqs = JSON.parse(fs.readFileSync("requirements_and_feedback.json", "utf8"));
  } catch (e) {
    reqs = [
      { summary: "Demo: Vehicle should detect rain on windshield.", type: "Story" },
      { summary: "Demo: CAN gateway error on engine start.", type: "Bug" },
      { summary: "Demo: Enable remote firmware update.", type: "Epic" },
      { summary: "User feedback: Map fails to update when network lost.", type: "Feedback" },
    ];
  }

  const results = [];
  for (const r of reqs) {
    const issueType = r.type || "Story";
    const resp = await callLLM(issueType, r.summary);
    const parsed = extractSections(resp.content || "");
    results.push({
      IssueType: issueType,
      Title: parsed.Title || r.summary,
      Status: r.status || "To Do",
      Priority: r.priority || "Medium",
      Assignee: r.assignee || "",
      Description: parsed.Description || "",
      "Acceptance Criteria": parsed["Acceptance Criteria"],
      "Steps to Reproduce": parsed["Steps to Reproduce"],
      "Actual vs Expected": parsed["Actual vs Expected"],
      "Insight/Recommendation": parsed["Insight/Recommendation"],
      "Research Goals": parsed["Research Goals"]
    });
    console.log(`[${issueType}] Response:\n${resp.content}\n`);
  }
  return results;
}

// === AGENT FUNCTION: REFINE EXISTING BACKLOG ===
async function refineBacklog() {
  // Try JSON (preferred), fallback to demo
  let backlog;
  try {
    backlog = JSON.parse(fs.readFileSync("backlog_to_refine.json", "utf8"));
  } catch (e) {
    backlog = [
      { summary: "Vehicle climate system inconsistent across zones.", type: "Bug", assignee: "", priority: "High", status: "In Progress" },
      { summary: "Enable phone mirroring for all infotainment screens.", type: "Epic", assignee: "", priority: "Medium", status: "To Do" }
    ];
  }
  const results = [];
  for (const r of backlog) {
    const issueType = r.type || "Story";
    const resp = await callLLM(issueType, r.summary);
    const parsed = extractSections(resp.content || "");
    results.push({
      IssueType: issueType,
      Title: parsed.Title || r.summary,
      Status: r.status || "To Do",
      Priority: r.priority || "Medium",
      Assignee: r.assignee || "",
      Description: parsed.Description || "",
      "Acceptance Criteria": parsed["Acceptance Criteria"],
      "Steps to Reproduce": parsed["Steps to Reproduce"],
      "Actual vs Expected": parsed["Actual vs Expected"],
      "Insight/Recommendation": parsed["Insight/Recommendation"],
      "Research Goals": parsed["Research Goals"]
    });
    console.log(`[${issueType}] Refined:\n${resp.content}\n`);
  }
  return results;
}

// === CLI DRIVER ===
const mode = process.argv[2];
if (!["create", "refine"].includes(mode)) {
  console.log("Usage: node backlog_agent.js <create|refine>");
  process.exit(1);
}

(async () => {
  let issues = [];
  if (mode === "create") {
    issues = await createBacklog();
  } else if (mode === "refine") {
    issues = await refineBacklog();
  }
  fs.writeFileSync("refined_backlog.md", renderMarkdown(issues));
  console.log(`\nOutput file written: refined_backlog.md`);
})();