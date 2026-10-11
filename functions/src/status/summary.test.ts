import { test } from "node:test";
import assert from "node:assert/strict";
import type { Outcome, ProbeResult } from "../probe/probe";
import { lastCompleteMinutes } from "../evaluator/quorum";
import { buildSummary, uptimePercent, type IncidentRecord } from "./summary";

const REGIONS = ["ap-south-1", "eu-west-1", "us-east-1"];
const NOW = new Date("2026-10-06T14:00:30Z");

// one row per region for each of the last 60 finished minutes, all with the same outcome
function rows(outcome: Outcome): ProbeResult[] {
  return lastCompleteMinutes(NOW, 60).flatMap((minute) =>
    REGIONS.map((region) => ({
      target: "https://example.test",
      region,
      checkedAt: `${minute}:00.000Z`,
      outcome,
      latencyMs: 100,
    })),
  );
}

function summary(probeRows: ProbeResult[], incidents: IncidentRecord[] = []) {
  return buildSummary({
    target: "flaky-target",
    now: NOW,
    regions: REGIONS,
    rows: probeRows,
    incidents,
  });
}

test("a healthy hour is up, with 60 minutes of history", () => {
  const s = summary(rows("up"));
  assert.equal(s.status, "up");
  assert.equal(s.minutes.length, 60);
  assert.equal(s.minutes[0].minute, "2026-10-06T13:00");
  assert.ok(s.minutes.every((m) => m.verdict === "up"));
  assert.deepEqual(s.regions[0], {
    region: "ap-south-1",
    status: "up",
    latencyMs: 100,
  });
  assert.equal(s.uptime24h, 100);
});

test("an open incident makes the headline down, and says since when", () => {
  const s = summary(rows("timeout"), [
    { startedAt: "2026-10-06T13:42", openedAt: "2026-10-06T13:44:45.150Z" },
  ]);
  assert.equal(s.status, "down");
  assert.equal(s.since, "2026-10-06T13:42");
  assert.equal(s.incidents[0].durationMinutes, 18); // 13:42 until 14:00:30
});

test("failing probes without an incident do not change the headline", () => {
  assert.equal(summary(rows("timeout")).status, "up");
});

test("no probe rows at all is unknown, not up", () => {
  const s = summary([]);
  assert.equal(s.status, "unknown");
  assert.ok(s.regions.every((r) => r.status === "unknown"));
});

test("a region that stopped reporting shows as unknown", () => {
  const withoutRecentIreland = rows("up").filter(
    (row) => row.region !== "eu-west-1" || row.checkedAt < "2026-10-06T13:50",
  );
  const s = summary(withoutRecentIreland);
  assert.equal(s.regions[1].status, "unknown");
  assert.equal(s.status, "up"); // the other two still agree
});

test("uptime counts only the part of an incident inside the window", () => {
  const now = new Date("2026-10-06T14:00:00Z");
  const day = 24 * 60;
  const incident = (startedAt: string, resolvedAt?: string) => ({
    startedAt,
    openedAt: startedAt,
    resolvedAt,
  });

  assert.equal(uptimePercent([], now, day), 100);
  assert.equal(
    uptimePercent([incident("2026-10-06T10:00", "2026-10-06T11:12")], now, day),
    95,
  ); // 72 of 1440 minutes
  assert.equal(uptimePercent([incident("2026-10-06T13:24")], now, day), 97.5); // still open: 36 minutes so far
  assert.equal(
    uptimePercent([incident("2026-10-04T10:00", "2026-10-04T11:00")], now, day),
    100,
  ); // before the window
  assert.equal(
    uptimePercent([incident("2026-10-05T13:00", "2026-10-05T15:00")], now, day),
    95.83,
  ); // only the last 60 minutes count
});
