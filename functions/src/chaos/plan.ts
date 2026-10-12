import { FaultState } from "../target/fault";

export type Kind = "regional" | "blip" | "outage" | "slow";

export interface Episode {
  id: number;
  kind: Kind;
  start: string; //the minute the controller breaks the site
  minutes: number; //how long it stays broken
  fault: FaultState;
}

export const SLOT_MINUTES = 48; //one fault per slot
export const QUIET_MINUTES = 10; //healthy time kept before and after every fault

const MIX: Kind[] = [
  "regional",
  "regional",
  "regional",
  "regional",
  "regional",
  "blip",
  "blip",
  "outage",
  "outage",
  "slow",
];

//shortest and longest length of each kind
const LENGTH: Record<Kind, [number, number]> = {
  regional: [2, 10],
  blip: [1, 1],
  outage: [3, 8],
  slow: [3, 6],
};

export function buildPlan(input: {
  start: Date;
  hours: number;
  seed: number;
  regions: string[];
}): Episode[] {
  const random = seededRandom(input.seed);
  const between = (min: number, max: number) =>
    min + Math.floor(random() * (max - min + 1));
  const regions = [...input.regions].sort();
  const slots = Math.floor((input.hours * 60) / SLOT_MINUTES); //48*60/48 = 60

  //ehich kind of fault goes in each slot
  const kinds: Kind[] = [];
  while (kinds.length < slots) kinds.push(...shuffle([...MIX], random));

  //when each one starts and for how long
  const episodes: Episode[] = [];
  let regionalSoFar = 0;
  for (let slot = 0; slot < slots; slot++) {
    const kind = kinds[slot]; //slot 2 get kinds[2] which is "outage" (completely random)
    const minutes = between(LENGTH[kind][0], LENGTH[kind][1]); //LENGTH["outage"] is [3, 8], [0] is 3 and [1] is 8
    const offset = between(
      QUIET_MINUTES, //10 mins
      SLOT_MINUTES - QUIET_MINUTES - minutes, //48 - 10 - 5 = 33, this means that starting at 33, a 5 min fault ends at 38 leaving 10 mins of quiet time (38 to 48), here we get 11 (between 10 and 33)
    ); // a random minute inside the slot
    const startMs =
      input.start.getTime() + (slot * SLOT_MINUTES + offset) * 60_000; //18:00 + (2 * 48 + 11) = 18:00 + 107 = 19:47

    let fault: FaultState = { mode: "down" }; //default is to take the whole site down
    if (kind === "slow") fault = { mode: "slow" };
    if (kind === "regional") {
      fault = {
        mode: "regional",
        failRegion: regions[regionalSoFar % regions.length], //["ap-south-1", "eu-west-1", "us-east-1"]
      }; // take turns, so each region gets the same number
      regionalSoFar += 1;
    }

    episodes.push({
      id: slot + 1, //slot 2 becomes fault #3
      kind,
      start: new Date(startMs).toISOString().slice(0, 16),
      minutes,
      fault,
    });
  }
  return episodes;
}

//what the switch should be set to at this moment
export function desiredFault(
  plan: Episode[],
  now: Date,
): { fault: FaultState; episode?: Episode } {
  const episode = plan.find((e) => {
    const start = new Date(`${e.start}:00Z`).getTime();
    return now.getTime() >= start && now.getTime() < start + e.minutes * 60_000; //true when now is after the start and before the end (start + minutes * 60000)
  });
  return episode
    ? { fault: episode.fault, episode }
    : { fault: { mode: "healthy" } };
}

export function sameFault(a: FaultState, b: FaultState): boolean {
  return a.mode === b.mode && a.failRegion === b.failRegion;
}

//number gen (mulberry32, https://github.com/cprosche/mulberry32)
export function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

//shuffles a list in place (fisher-yates)
function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
