//take the last two minutes, select a verdict for those two minutes and open or close an incident based on that verdict
import { ProbeResult } from "../probe/probe";

export type Status = "up" | "down" | "unknown";

export interface MinuteEvaluation {
  minute: String;
  votes: Record<string, Status>;
  verdict: Status;
}

//what is the verdict for one minute
export function evaluateMinute(
  minute: string,
  regions: string[],
  rows: Pick<ProbeResult, "region" | "outcome">[],
): MinuteEvaluation {
  const votes: Record<string, Status> = {}; //region, Status
  for (const region of regions) {
    const row = rows.find((r) => r.region === region);
    if (row === undefined) votes[region] = "unknown";
    else votes[region] = row.outcome === "up" ? "up" : "down";
  }

  const needed = Math.floor(regions.length / 2) + 1; //for 3 regions, 2 are needed for a verdict
  const count = (status: Status) =>
    Object.values(votes).filter((v) => v === status).length; //Object.values(votes) drops the region names with their status

  let verdict: Status = "unknown";
  if (count("down") >= needed) verdict = "down";
  else if (count("up") >= needed) verdict = "up";

  return { votes, minute, verdict };
}

export type Action = "open" | "resolve" | "none";

//decide what should happen if we are given a verdict
export function decide(
  recent: MinuteEvaluation[],
  incidentOpen: boolean,
): Action {
  if (recent.length === 0) return "none";
  else if (!incidentOpen && recent.every((e) => e.verdict === "down"))
    //no incident is open and every recent minute was down
    return "open";
  else if (incidentOpen && recent.every((e) => e.verdict === "up"))
    //incident is open and every recent minute was up, the situation has been resolved
    return "resolve";
  return "none";
}

//which minutes are the "last two finished ones"
export function lastCompleteMinutes(now: Date, count: number): string[] {
  const minutes: string[] = [];
  for (let back = count; back >= 1; back--) {
    minutes.push(
      new Date(now.getTime() - back * 60000).toISOString().slice(0, 16), //now.getTime returns milliseconds since 1970, back -> minutes in milliseconds
    );
  }
  return minutes;
}
