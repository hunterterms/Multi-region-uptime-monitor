export type FaultMode = "healthy" | "down" | "slow" | "regional";

export interface FaultState {
  mode: FaultMode;
  failRegion?: string;
}

export const SLOW_DELAY_MS = 8000;

export function decideResponse(
  state: FaultState,
  probeRegion: string | undefined,
) {
  switch (state.mode) {
    case "down":
      return { status: 503, delayMs: 0 };
    case "slow":
      return { status: 200, delayMs: SLOW_DELAY_MS };
    case "regional":
      return probeRegion === state.failRegion
        ? { status: 200, delayMs: SLOW_DELAY_MS }
        : { status: 200, delayMs: 0 };
    default:
      return { status: 200, delayMs: 0 };
  }
}
