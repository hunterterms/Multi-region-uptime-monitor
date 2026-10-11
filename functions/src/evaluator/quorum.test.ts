import { test } from "node:test";
import assert from "node:assert/strict";
import type { Outcome } from "../probe/probe";
import {
  decide,
  evaluateMinute,
  lastCompleteMinutes,
  type Status,
} from "./quorum";

const REGIONS = ["ap-south-1", "eu-west-1", "us-east-1"];
const MINUTE = "2026-10-04T10:15";

// verdictFor('up', 'timeout', undefined) means: Mumbai up, Ireland timed out, Virginia sent nothing
function verdictFor(...outcomes: (Outcome | undefined)[]) {
  const rows: { region: string; outcome: Outcome }[] = [];
  outcomes.forEach((outcome, i) => {
    if (outcome) rows.push({ region: REGIONS[i], outcome });
  });
  return evaluateMinute(MINUTE, REGIONS, rows).verdict;
}

test("all regions up is up", () =>
  assert.equal(verdictFor("up", "up", "up"), "up"));
test("one failing region is outvoted", () =>
  assert.equal(verdictFor("up", "timeout", "up"), "up"));
test("two failing regions is down", () =>
  assert.equal(verdictFor("http_error", "timeout", "up"), "down"));
test("a missing report is unknown, not a failure", () =>
  assert.equal(verdictFor("up", "timeout", undefined), "unknown"));

// minutes('down', 'down') means: the last two minutes both got a "down" verdict
const minutes = (...verdicts: Status[]) =>
  verdicts.map((verdict) => ({ minute: MINUTE, votes: {}, verdict }));

test("one bad minute does not open an incident", () =>
  assert.equal(decide(minutes("up", "down"), false), "none"));
test("two bad minutes in a row open one", () =>
  assert.equal(decide(minutes("down", "down"), false), "open"));
test("an open incident is not opened twice", () =>
  assert.equal(decide(minutes("down", "down"), true), "none"));
test("two good minutes in a row resolve it", () =>
  assert.equal(decide(minutes("up", "up"), true), "resolve"));

test("lastCompleteMinutes skips the minute still in progress", () => {
  const now = new Date("2026-10-04T10:16:01Z");
  assert.deepEqual(lastCompleteMinutes(now, 2), [
    "2026-10-04T10:14",
    "2026-10-04T10:15",
  ]);
});
