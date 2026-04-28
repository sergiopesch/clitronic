import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

type TracePayload = Record<string, unknown>;

const SENSITIVE_KEY_PATTERN = /(key|token|secret|authorization|cookie|password)/i;

function sanitizeTracePayload(payload: TracePayload): TracePayload {
  const sanitized: TracePayload = {};
  for (const [key, value] of Object.entries(payload)) {
    if (SENSITIVE_KEY_PATTERN.test(key) && typeof value !== 'boolean') {
      sanitized[key] = '[redacted]';
    } else if (typeof value === 'string' && value.length > 500) {
      sanitized[key] = `${value.slice(0, 500)}...`;
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export function writeAutoresearchTrace(event: string, payload: TracePayload = {}) {
  const traceFile = process.env.AUTORESEARCH_TRACE_FILE;
  if (!traceFile) return;

  try {
    mkdirSync(dirname(traceFile), { recursive: true });
    appendFileSync(
      traceFile,
      `${JSON.stringify({
        ts: new Date().toISOString(),
        event,
        ...sanitizeTracePayload(payload),
      })}\n`
    );
  } catch {
    // Tracing must never affect production request handling.
  }
}
