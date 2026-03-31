import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

describe("Falsy-value regression (|| vs ??)", () => {
  it("review_agent uses ?? not || for testFailureRatePercent", () => {
    const src = fs.readFileSync(path.join(ROOT, "review_agent.js"), "utf8");
    const lines = src.split("\n");
    const matchingLines = lines.filter(l => l.includes("testFailureRatePercent"));
    assert.ok(matchingLines.length > 0, "Must reference testFailureRatePercent");
    for (const line of matchingLines) {
      if (line.includes("testFailureRatePercent") && (line.includes("?? 100") || line.includes("?? 0"))) {
        assert.ok(true, "Uses nullish coalescing");
      }
      if (line.includes("testFailureRatePercent") && line.includes("|| 100")) {
        assert.fail("REGRESSION: testFailureRatePercent uses || instead of ?? — 0 will be treated as 100");
      }
    }
  });

  it("review_agent uses ?? not || for acceptanceCoveragePercent", () => {
    const src = fs.readFileSync(path.join(ROOT, "review_agent.js"), "utf8");
    const lines = src.split("\n");
    const matchingLines = lines.filter(l =>
      l.includes("acceptanceCoveragePercent") && (l.includes("??") || l.includes("||"))
    );
    for (const line of matchingLines) {
      if (line.includes("acceptanceCoveragePercent") && line.includes("|| ")) {
        const beforeOr = line.split("||")[0];
        if (beforeOr.includes("acceptanceCoveragePercent")) {
          assert.fail("REGRESSION: acceptanceCoveragePercent uses || — 0 will be treated as falsy");
        }
      }
    }
    assert.ok(true, "No || regression found for acceptanceCoveragePercent");
  });

  it("nullish coalescing preserves 0 correctly", () => {
    const value = 0;
    assert.strictEqual(value ?? 100, 0, "?? must preserve 0");
    assert.strictEqual(value || 100, 100, "|| treats 0 as falsy (this is the bug)");
    assert.strictEqual(Number(value ?? 100) === 0, true, "0 ?? 100 must equal 0");
  });
});
