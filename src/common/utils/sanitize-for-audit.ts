const SENSITIVE_KEY =
  /password|secret|token|authorization|refreshtoken|accesstoken|apikey|client_secret|encryptionkey/i;

export function sanitizeForAudit(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForAudit(item));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : sanitizeForAudit(v);
    }
    return out;
  }
  return value;
}
