import {
  evaluateMinute,
  lastCompleteMinutes,
  MinuteEvaluation,
  Status,
} from "../evaluator/quorum";
import { ProbeResult } from "../probe/probe";

export const WINDOW_MINUTES = 60; //how much history the page shows
const FRESH_FOR_MS = 3 * 60000;

export interface IncidentRecord {
  startedAt: string;
  openedAt: string;
  resolvedAt?: string;
}

export interface RegionState {
  region: string;
  status: Status;
  latencyMs?: number;
}

export interface StatusSummary {
  target: string;
  generatedAt: string;
  status: Status;
  since?: string;
  regions: RegionState[];
  minutes: MinuteEvaluation[];
  incidents: (IncidentRecord & { durationMinutes: number })[];
  uptime24h: number;
}

//everything the status page shows
export function buildSummary(input: {
  target: string;
  now: Date;
  regions: string[];
  rows: ProbeResult[]; //every probe row from the last hour
  incidents: IncidentRecord[];
}): StatusSummary {
  const { target, now, regions, rows, incidents } = input;

  //one verdict per minute
  const minutes = lastCompleteMinutes(now, WINDOW_MINUTES).map((minute) =>
    evaluateMinute(
      minute,
      regions,
      rows.filter((row) => row.checkedAt.startsWith(minute)),
    ),
  );

  //what each region saw most recently
  const regionStates = regions.map((region): RegionState => {
    const newestFirst = rows
      .filter((row) => row.region === region)
      .sort((a, b) => b.checkedAt.localeCompare(a.checkedAt)); //localeCompare checks two items and returns -1, 0 or 1
    const last = newestFirst[0]; //region's most recent check
    if (
      last === undefined || //region sent nothing in the last hour
      now.getTime() - new Date(last.checkedAt).getTime() > FRESH_FOR_MS //its newest check it too old
    ) {
      return { region, status: "unknown" };
    }
    return {
      region,
      status: last.outcome === "up" ? "up" : "down",
      latencyMs: last.latencyMs,
    };
  });

  const open = incidents.find((incident) => incident.resolvedAt === undefined);
  const blind = minutes.slice(-3).every((m) => m.verdict === "unknown"); //checks three minutes, every is true only if all three of them are "unknown"
  let status: Status = "up";
  if (open) status = "down";
  else if (blind) status = "unknown";

  return {
    target,
    generatedAt: now.toISOString(),
    status,
    since: open?.startedAt,
    regions: regionStates,
    minutes,
    incidents: incidents.slice(0, 10).map((incident) => ({
      startedAt: incident.startedAt,
      openedAt: incident.openedAt,
      resolvedAt: incident.resolvedAt,
      durationMinutes: Math.floor(
        (endMs(incident, now) - toMs(incident.startedAt)) / 60_000,
      ),
    })),
    uptime24h: uptimePercent(incidents, now, 24 * 60),
  };
}

export function uptimePercent(
  incidents: IncidentRecord[],
  now: Date,
  windowMinutes: number,
): number {
  const windowStart = now.getTime() - windowMinutes * 60000;
  let downMs = 0;
  for (const incident of incidents) {
    const start = Math.max(toMs(incident.startedAt), windowStart); // ignore the part before the window
    const end = endMs(incident, now);
    if (end > start) downMs += end - start;
  }
  const percent = 100 * (1 - downMs / (windowMinutes * 60_000));
  return Math.round(percent * 100) / 100;
}

function endMs(incident: IncidentRecord, now: Date) {
  return incident.resolvedAt ? toMs(incident.resolvedAt) : now.getTime();
}

function toMs(minute: string) {
  return new Date(`${minute}:00Z`).getTime();
}
