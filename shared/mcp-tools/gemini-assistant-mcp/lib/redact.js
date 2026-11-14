// redact.js — best-effort removal of secrets and personal data BEFORE text leaves the machine.
// This is a safety net, not a guarantee: callers should still avoid sending patient data or
// credentials on purpose. Order matters (most specific first). Pure function, unit-tested.

const SECRET_PATTERNS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[PRIVATE_KEY]"],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[JWT]"],
  [/\bAKIA[0-9A-Z]{16}\b/g, "[AWS_KEY]"],
  [/\bAIza[0-9A-Za-z_-]{30,}\b/g, "[GOOGLE_API_KEY]"],
  [/\bglpat-[A-Za-z0-9_-]{16,}\b/g, "[GITLAB_TOKEN]"],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}\b/g, "[GITHUB_TOKEN]"],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi, "Bearer [TOKEN]"],
  // scheme://user:password@host  → keep scheme and host
  [/\b([a-z][a-z0-9+.-]*:\/\/)([^\s:@/]+):([^\s@/]+)@/gi, "$1[USER]:[PASSWORD]@"],
  // password=…, "api_key": "…", token: …  → keep the name, drop the value
  [/\b(pass(?:word|wd)?|pwd|secret|token|api[_-]?key|access[_-]?key|authorization|client[_-]?secret)(["']?\s*[:=]\s*["']?)([^\s"',;&]{4,})/gi, "$1$2[REDACTED]"],
];

const PII_PATTERNS = [
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[EMAIL]"],
  // Indian mobile numbers, optionally with +91 / 91 prefix
  [/(?<![\d.])(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?![\d.])/g, "[PHONE]"],
  // 12-digit ids written as 4-4-4 (Aadhaar-style)
  [/(?<!\d)\d{4}[\s-]\d{4}[\s-]\d{4}(?!\d)/g, "[ID12]"],
];

export function redact(text, { pii = true } = {}) {
  let out = String(text ?? "");
  let count = 0;
  const apply = ([re, rep]) => {
    out = out.replace(re, (...m) => {
      count += 1;
      return rep.replace(/\$(\d)/g, (_, i) => m[Number(i)] ?? "");
    });
  };
  SECRET_PATTERNS.forEach(apply);
  if (pii) PII_PATTERNS.forEach(apply);
  return { text: out, count };
}
