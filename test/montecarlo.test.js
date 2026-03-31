import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

describe("Monte Carlo simulation", () => {
  it("function exists in orchestrator.js", () => {
    const src = fs.readFileSync(path.join(ROOT, "orchestrator.js"), "utf8");
    assert.ok(src.includes("runMonteCarloSimulation"), "Must define runMonteCarloSimulation");
  });

  it("runs 10000 iterations by default", () => {
    const src = fs.readFileSync(path.join(ROOT, "orchestrator.js"), "utf8");
    assert.ok(src.includes("iterations = 10000"), "Default iterations should be 10000");
  });

  it("returns unavailable when < 2 sprints", () => {
    const src = fs.readFileSync(path.join(ROOT, "orchestrator.js"), "utf8");
    assert.ok(src.includes("Need at least 2 completed sprints"), "Must handle insufficient data");
  });

  it("computes p50/p75/p90 percentiles", () => {
    const src = fs.readFileSync(path.join(ROOT, "orchestrator.js"), "utf8");
    assert.ok(src.includes("p50"), "Must compute p50");
    assert.ok(src.includes("p75"), "Must compute p75");
    assert.ok(src.includes("p90"), "Must compute p90");
  });

  it("calculates completion probability", () => {
    const src = fs.readFileSync(path.join(ROOT, "orchestrator.js"), "utf8");
    assert.ok(src.includes("completionProbability"), "Must compute completion probability");
  });

  it("provides recommendation based on probability", () => {
    const src = fs.readFileSync(path.join(ROOT, "orchestrator.js"), "utf8");
    assert.ok(src.includes("Planned capacity looks achievable"), "Must recommend for high probability");
    assert.ok(src.includes("Moderate risk"), "Must warn for moderate probability");
    assert.ok(src.includes("High risk of overcommitment"), "Must warn for low probability");
  });

  it("includes monteCarlo in intelligence dataSources", () => {
    const src = fs.readFileSync(path.join(ROOT, "orchestrator.js"), "utf8");
    assert.ok(src.includes('"MonteCarloSimulation"'), "Must add MonteCarloSimulation to dataSources");
  });

  it("uses Gaussian random for normal distribution", () => {
    const src = fs.readFileSync(path.join(ROOT, "orchestrator.js"), "utf8");
    assert.ok(src.includes("gaussianRandom"), "Must use Gaussian random sampling");
    assert.ok(src.includes("Math.sqrt(-2.0"), "Must use Box-Muller transform");
  });
});
