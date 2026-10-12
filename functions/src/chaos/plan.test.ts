import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlan, desiredFault, QUIET_MINUTES } from "./plan";

const REGIONS = ["ap-south-1", "eu-west-1", "us-east-1"];
const start = new Date("2026-10-12T00:00:00Z");
const plan = buildPlan({ start, hours: 48, seed: 7, regions: REGIONS });

const startMs = (minute: string) => new Date(`${minute}:00Z`).getTime();
const endMs = (i: number) => startMs(plan[i].start) + plan[i].minutes * 60_000;
const count = (kind: string) => plan.filter((e) => e.kind === kind).length;

test("the same seed gives the same plan, whatever order the regions are in", () => {
  assert.deepEqual(
    buildPlan({ start, hours: 48, seed: 7, regions: [...REGIONS].reverse() }),
    plan,
  );
});

test("48 hours is 60 faults: 30 regional, 12 blips, 12 outages, 6 slow", () => {
  assert.equal(plan.length, 60);
  assert.deepEqual(
    [count("regional"), count("blip"), count("outage"), count("slow")],
    [30, 12, 12, 6],
  );
});

test("each region gets 10 regional faults", () => {
  for (const region of REGIONS) {
    assert.equal(plan.filter((e) => e.fault.failRegion === region).length, 10);
  }
});

test("faults never overlap, and there are 20 quiet minutes between them", () => {
  for (let i = 1; i < plan.length; i++) {
    assert.ok(
      startMs(plan[i].start) - endMs(i - 1) >= 2 * QUIET_MINUTES * 60_000,
      `fault ${i + 1} starts too soon`,
    );
  }
});

test("the first fault starts after the experiment does, and the last one ends 10 minutes before it finishes", () => {
  assert.ok(startMs(plan[0].start) >= start.getTime() + QUIET_MINUTES * 60_000);
  assert.ok(
    endMs(plan.length - 1) <=
      start.getTime() + (48 * 60 - QUIET_MINUTES) * 60_000,
  );
});

test("desiredFault is healthy before a fault, the fault during it, and healthy again after it", () => {
  const first = plan[0];
  assert.deepEqual(
    desiredFault(plan, new Date(startMs(first.start) - 1)).fault,
    { mode: "healthy" },
  );
  assert.deepEqual(
    desiredFault(plan, new Date(startMs(first.start))).fault,
    first.fault,
  );
  assert.deepEqual(
    desiredFault(plan, new Date(endMs(0) - 1)).fault,
    first.fault,
  );
  assert.deepEqual(desiredFault(plan, new Date(endMs(0))).fault, {
    mode: "healthy",
  });
});

test("an empty plan (paused) is always healthy", () => {
  assert.deepEqual(desiredFault([], new Date(startMs(plan[0].start))).fault, {
    mode: "healthy",
  });
});
