export type Status = "up" | "down" | "unknown";

export interface StatusSummary {
  target: string;
  generatedAt: string;
  status: Status;
  since?: string;
  regions: { region: string; status: Status; latencyMs?: number }[];
  minutes: { minute: string; votes: Record<string, Status>; verdict: Status }[];
  incidents: {
    startedAt: string;
    openedAt: string;
    resolvedAt?: string | undefined;
    durationMinutes: number;
  }[];
  uptime24h: number;
}
