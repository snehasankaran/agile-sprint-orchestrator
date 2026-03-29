import rateLimit from "express-rate-limit";

// ── Rate Limiting ──────────────────────────────────────────────
export const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Rate limit exceeded. Try again in 1 minute." }
});

// ── Input Sanitization ────────────────────────────────────────
function sanitizeString(str) {
  if (typeof str !== "string") return str;
  return str
    .replace(/<[^>]*>/g, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/on\w+\s*=/gi, "")
    .replace(/data\s*:\s*text\/html/gi, "")
    .trim();
}

function sanitizeValue(val) {
  if (typeof val === "string") return sanitizeString(val);
  if (Array.isArray(val)) return val.map(sanitizeValue);
  if (val && typeof val === "object") {
    const out = {};
    for (const [k, v] of Object.entries(val)) out[k] = sanitizeValue(v);
    return out;
  }
  return val;
}

export function sanitizeInput(req, _res, next) {
  if (req.body && typeof req.body === "object") {
    req.body = sanitizeValue(req.body);
  }
  next();
}

// ── RBAC ──────────────────────────────────────────────────────
const ROLE_HIERARCHY = { public: 0, supervisor: 1, admin: 2 };

export function requireRole(minRole = "supervisor") {
  const minLevel = ROLE_HIERARCHY[minRole] ?? 1;
  return (req, res, next) => {
    const role = (req.headers["x-role"] || "public").toLowerCase();
    const level = ROLE_HIERARCHY[role] ?? 0;
    if (level >= minLevel) return next();
    res.status(403).json({
      error: "Forbidden",
      required: minRole,
      current: role,
      hint: "Set x-role header to 'supervisor' or 'admin' for write operations."
    });
  };
}
