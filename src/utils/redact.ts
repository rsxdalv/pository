const SECRET_KEY_PATTERN = /(secret|password|token|apikey|adminkey|privatekey)/i;

/**
 * Returns a deep copy of `value` with every string under a secret-looking key
 * (adminKey, ssoSecret, *password*, *token*, ...) replaced by "***".
 * Used before logging configuration objects.
 */
export function redactSecrets<T>(value: T): T {
  return redact(value) as T;
}

function redact(value: unknown, key?: string): unknown {
  if (Array.isArray(value)) return value.map((v) => redact(v));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redact(v, k);
    }
    return out;
  }
  if (key && typeof value === "string" && value !== "" && SECRET_KEY_PATTERN.test(key)) {
    return "***";
  }
  return value;
}
