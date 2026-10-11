export type Outcome =
  | "up"
  | "http_error"
  | "timeout"
  | "dns_failure"
  | "connection_refused"
  | "other_error";

export interface ProbeResult {
  target: string;
  region: string;
  checkedAt: string;
  outcome: Outcome;
  latencyMs: number;
  statusCode?: number;
  errorCode?: string;
}

export const PROBE_TIMEOUT_MS = 5000;

export async function probe(
  target: string,
  region: string,
  timeoutMs = PROBE_TIMEOUT_MS,
): Promise<ProbeResult> {
  const checkedAt = new Date().toISOString();
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);

  try {
    const res = await fetch(target, {
      headers: { "x-probe-region": region },
      signal: AbortSignal.timeout(timeoutMs), //cancels the req after 5 secs
    });
    await res.text;
    return {
      target,
      region,
      checkedAt,
      outcome: res.ok ? "up" : "http_error",
      statusCode: res.status,
      latencyMs: elapsed(),
    };
  } catch (err) {
    return {
      target,
      region,
      checkedAt,
      latencyMs: elapsed(),
      ...classifyError(err),
    };
  }
}

function classifyError(
  err: unknown,
  // outcome: Outcome; errorCode?: string;
): Pick<ProbeResult, "outcome" | "errorCode"> {
  if (err instanceof Error && err.name == "TimeoutError") {
    return { outcome: "timeout" };
  }

  const code =
    err instanceof Error
      ? (err.cause as { code?: string } | undefined)?.code
      : undefined;

  switch (code) {
    case "ENOTFOUND": //domain doesn't exist
    case "EAI_AGAIN": //dns server didn't answer in time
      return { outcome: "dns_failure", errorCode: code };
    case "ECONNREFUSED": //nothing is listening on that port
      return { outcome: "connection_refused", errorCode: code };
    default:
      return { outcome: "other_error", errorCode: code ?? "UNKNOWN" };
  }
}
