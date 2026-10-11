import { appendFileSync } from "node:fs";
import http from "node:http";
import { decideResponse, type FaultMode, type FaultState } from "./fault";

const PORT = process.env.PORT ?? 4000;
const MODES: FaultMode[] = ["healthy", "down", "slow", "regional"];

let state: FaultState = { mode: "healthy" };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (req.method === "POST" && url.pathname === "/fault") {
    // /fault?mode=regional&failRegion=eu-west-1
    const mode = url.searchParams.get("mode") as FaultMode;
    const failRegion = url.searchParams.get("failRegion") ?? undefined;

    //rejecting bad requests
    if (!MODES.includes(mode) || (mode === "regional" && !failRegion)) {
      res
        .writeHead(400)
        .end(
          "use ?mode=healthy|down|slow, or ?mode=regional&failRegion=<region>\n",
        );
      return;
    }

    state = mode === "regional" ? { mode, failRegion } : { mode }; //updates the state
    appendFileSync(
      "fault-log.jsonl",
      JSON.stringify({ at: new Date().toISOString(), ...state }) + "\n", //builds one object, the timestamp + every field in 'state'
    );
    console.log("fault switched:", state);
    res.writeHead(200).end(JSON.stringify(state) + "\n");
    return;
  }

  //for requests that isn't POST /fault
  const probeRegion = req.headers["x-probe-region"] as string | undefined;
  const { status, delayMs } = decideResponse(state, probeRegion);
  if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
  res.writeHead(status).end(status === 200 ? "ok\n" : "unavailable\n");
});

server.listen(PORT, () =>
  console.log(`flaky target listening on http://localhost:${PORT}`),
);
