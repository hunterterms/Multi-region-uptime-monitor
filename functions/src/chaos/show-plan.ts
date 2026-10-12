//prints the faults which the controller will cause
import { buildPlan } from "./plan";

const [start, hours = "48", seed = "7"] = process.argv.slice(2);
if (!start) throw new Error("Give the start time");

const plan = buildPlan({
  start: new Date(start),
  hours: Number(hours),
  seed: Number(seed),
  regions: ["ap-south-1", "eu-west-1", "us-east-1"],
});

console.table(
  Object.fromEntries(
    plan.map((e) => [
      e.id,
      {
        "starts (UTC)": e.start.replace("T", " "),
        minutes: e.minutes,
        kind: e.kind,
        affects: e.fault.failRegion ?? "everyone",
      },
    ]),
  ),
);

const count = (kind: string) => plan.filter((e) => e.kind === kind).length;
console.log(
  `${plan.length} faults: ${count("regional")} regional, ${count("blip")} blips, ${count("outage")} outages, ${count("slow")} slow.`,
);
console.log(
  `Expect about ${2 * (count("outage") + count("slow"))} alert emails: a DOWN and a RECOVERED for each outage and slow period.`,
);
