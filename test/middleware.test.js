import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sanitizeInput, requireRole } from "../middleware.js";

describe("Input sanitization", () => {
  it("strips HTML tags", () => {
    const req = { body: { text: "<script>alert('xss')</script>Hello" } };
    sanitizeInput(req, null, () => {});
    assert.ok(!req.body.text.includes("<script>"), "Must strip script tags");
    assert.ok(req.body.text.includes("Hello"), "Must preserve safe text");
  });

  it("removes javascript: URIs", () => {
    const req = { body: { link: "javascript:alert(1)" } };
    sanitizeInput(req, null, () => {});
    assert.ok(!req.body.link.includes("javascript:"), "Must remove javascript: URIs");
  });

  it("removes event handlers", () => {
    const req = { body: { val: 'onerror=alert(1)' } };
    sanitizeInput(req, null, () => {});
    assert.ok(!req.body.val.match(/on\w+\s*=/i), "Must remove event handlers");
  });

  it("handles nested objects", () => {
    const req = { body: { outer: { inner: "<b>bold</b>" } } };
    sanitizeInput(req, null, () => {});
    assert.ok(!req.body.outer.inner.includes("<b>"), "Must sanitize nested values");
  });

  it("handles arrays", () => {
    const req = { body: { items: ["<script>x</script>", "safe"] } };
    sanitizeInput(req, null, () => {});
    assert.ok(!req.body.items[0].includes("<script>"), "Must sanitize array elements");
    assert.strictEqual(req.body.items[1], "safe");
  });

  it("passes through non-object bodies", () => {
    const req = { body: null };
    sanitizeInput(req, null, () => {});
    assert.strictEqual(req.body, null);
  });
});

describe("RBAC role enforcement", () => {
  it("allows admin access to supervisor endpoints", () => {
    const middleware = requireRole("supervisor");
    const req = { headers: { "x-role": "admin" } };
    let called = false;
    middleware(req, null, () => { called = true; });
    assert.ok(called, "Admin must pass supervisor check");
  });

  it("blocks public access to supervisor endpoints", () => {
    const middleware = requireRole("supervisor");
    const req = { headers: { "x-role": "public" } };
    let statusCode = 0;
    const res = {
      status(code) { statusCode = code; return this; },
      json() {}
    };
    middleware(req, res, () => { assert.fail("Should not call next"); });
    assert.strictEqual(statusCode, 403, "Public must be blocked with 403");
  });

  it("treats missing role header as public", () => {
    const middleware = requireRole("supervisor");
    const req = { headers: {} };
    let statusCode = 0;
    const res = {
      status(code) { statusCode = code; return this; },
      json() {}
    };
    middleware(req, res, () => { assert.fail("Should not call next"); });
    assert.strictEqual(statusCode, 403, "Missing role must be treated as public");
  });

  it("allows public access to public endpoints", () => {
    const middleware = requireRole("public");
    const req = { headers: { "x-role": "public" } };
    let called = false;
    middleware(req, null, () => { called = true; });
    assert.ok(called, "Public role must access public endpoints");
  });
});
