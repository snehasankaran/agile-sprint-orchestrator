import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ── validateLLMOutput (copied from review_agent.js for isolated testing) ──
function validateLLMOutput(parsed, schema = {}) {
  const warnings = [];
  if (!parsed || typeof parsed !== "object") return { valid: false, warnings: ["LLM returned non-object output"], sanitized: null };
  if (schema.requiredFields) {
    for (const f of schema.requiredFields) {
      if (!(f in parsed)) warnings.push(`Missing required field: ${f}`);
    }
  }
  if ("confidence" in parsed) {
    const c = Number(parsed.confidence);
    if (!Number.isFinite(c) || c < 0 || c > 100) {
      warnings.push(`Confidence ${parsed.confidence} out of bounds [0-100], clamped`);
      parsed.confidence = Math.max(0, Math.min(100, c || 0));
    }
  }
  if ("decision" in parsed) {
    const allowed = ["On Track", "At Risk", "High Risk", "Critical Failure"];
    if (!allowed.includes(parsed.decision)) {
      warnings.push(`Unexpected decision value: "${parsed.decision}", defaulting to "At Risk"`);
      parsed.decision = "At Risk";
    }
  }
  const jsonStr = JSON.stringify(parsed);
  const piiPatterns = [/\b\d{3}-\d{2}-\d{4}\b/, /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}\b/i];
  for (const pat of piiPatterns) {
    if (pat.test(jsonStr)) warnings.push("Potential PII detected in LLM output");
  }
  return { valid: warnings.length === 0, warnings, sanitized: parsed };
}

// ── sanitizeString (copied from middleware.js for isolated testing) ──
function sanitizeString(str) {
  if (typeof str !== "string") return str;
  return str
    .replace(/<[^>]*>/g, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/on\w+\s*=/gi, "")
    .replace(/data\s*:\s*text\/html/gi, "")
    .trim();
}

// ── RBAC logic (copied from middleware.js) ──
const ROLE_HIERARCHY = { public: 0, supervisor: 1, admin: 2 };
function checkRole(role, minRole) {
  const minLevel = ROLE_HIERARCHY[minRole] ?? 1;
  const level = ROLE_HIERARCHY[role] ?? 0;
  return level >= minLevel;
}

// ══════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════

describe("validateLLMOutput", () => {
  it("should accept valid output", () => {
    const result = validateLLMOutput(
      { decision: "On Track", confidence: 85, summary: "All good" },
      { requiredFields: ["decision", "confidence", "summary"] }
    );
    assert.equal(result.valid, true);
    assert.equal(result.warnings.length, 0);
  });

  it("should reject null input", () => {
    const result = validateLLMOutput(null);
    assert.equal(result.valid, false);
    assert.equal(result.sanitized, null);
  });

  it("should reject non-object input", () => {
    const result = validateLLMOutput("just a string");
    assert.equal(result.valid, false);
  });

  it("should warn on missing required fields", () => {
    const result = validateLLMOutput(
      { decision: "On Track" },
      { requiredFields: ["decision", "confidence", "summary"] }
    );
    assert.equal(result.valid, false);
    assert.ok(result.warnings.some(w => w.includes("confidence")));
    assert.ok(result.warnings.some(w => w.includes("summary")));
  });

  it("should clamp confidence above 100", () => {
    const data = { confidence: 150 };
    const result = validateLLMOutput(data);
    assert.equal(result.valid, false);
    assert.equal(result.sanitized.confidence, 100);
  });

  it("should clamp negative confidence to 0", () => {
    const data = { confidence: -20 };
    const result = validateLLMOutput(data);
    assert.equal(result.sanitized.confidence, 0);
  });

  it("should accept confidence within bounds", () => {
    const data = { confidence: 75 };
    const result = validateLLMOutput(data);
    assert.equal(result.sanitized.confidence, 75);
    assert.ok(!result.warnings.some(w => w.includes("Confidence")));
  });

  it("should flag unexpected decision values", () => {
    const data = { decision: "Maybe Fine" };
    const result = validateLLMOutput(data);
    assert.equal(result.sanitized.decision, "At Risk");
    assert.ok(result.warnings.some(w => w.includes("Unexpected decision")));
  });

  it("should accept valid decision values", () => {
    for (const d of ["On Track", "At Risk", "High Risk", "Critical Failure"]) {
      const result = validateLLMOutput({ decision: d });
      assert.ok(!result.warnings.some(w => w.includes("decision")));
    }
  });

  it("should detect SSN-like PII", () => {
    const data = { notes: "SSN is 123-45-6789" };
    const result = validateLLMOutput(data);
    assert.ok(result.warnings.some(w => w.includes("PII")));
  });

  it("should detect email PII", () => {
    const data = { notes: "Contact user@example.com for details" };
    const result = validateLLMOutput(data);
    assert.ok(result.warnings.some(w => w.includes("PII")));
  });

  it("should pass clean data without PII warnings", () => {
    const data = { summary: "Sprint completed with 8 of 10 tickets done" };
    const result = validateLLMOutput(data);
    assert.ok(!result.warnings.some(w => w.includes("PII")));
  });
});

describe("sanitizeInput", () => {
  it("should strip HTML tags", () => {
    assert.equal(sanitizeString("<script>alert('xss')</script>hello"), "alert('xss')hello");
  });

  it("should remove javascript: URIs", () => {
    assert.equal(sanitizeString("javascript:alert(1)"), "alert(1)");
  });

  it("should remove event handlers", () => {
    assert.equal(sanitizeString("onload=hack()"), "hack()");
  });

  it("should remove data:text/html", () => {
    assert.equal(sanitizeString("data:text/html,<h1>hi</h1>"), ",hi");
  });

  it("should pass through clean strings", () => {
    assert.equal(sanitizeString("Normal sprint description"), "Normal sprint description");
  });

  it("should handle non-string input", () => {
    assert.equal(sanitizeString(42), 42);
    assert.equal(sanitizeString(null), null);
    assert.equal(sanitizeString(undefined), undefined);
  });
});

describe("RBAC", () => {
  it("should allow supervisor for supervisor-level actions", () => {
    assert.equal(checkRole("supervisor", "supervisor"), true);
  });

  it("should allow admin for supervisor-level actions", () => {
    assert.equal(checkRole("admin", "supervisor"), true);
  });

  it("should deny public for supervisor-level actions", () => {
    assert.equal(checkRole("public", "supervisor"), false);
  });

  it("should allow public for public-level actions", () => {
    assert.equal(checkRole("public", "public"), true);
  });

  it("should deny unknown roles", () => {
    assert.equal(checkRole("hacker", "supervisor"), false);
  });
});
