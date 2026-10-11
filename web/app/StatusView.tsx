import { Status, StatusSummary } from "./types";

const CITY: Record<string, string> = {
  "ap-south-1": "Mumbai",
  "eu-west-1": "Ireland",
  "us-east-1": "North Virginia",
};
const WORD: Record<Status, string> = {
  up: "Up",
  down: "Down",
  unknown: "No data",
};

const city = (region: string) => CITY[region] ?? region;
const hhmm = (time: string) => time.slice(11, 16);

export function StatusView({
  summary,
  stale,
}: {
  summary: StatusSummary;
  stale: boolean;
}) {
  const { target, status, minutes, regions, incidents } = summary;
  const count = (s: Status) => minutes.filter((m) => m.verdict === s).length;

  return (
    <main className="page">
      <header className="headline">
        <span className={`dot ${status}`} aria-hidden="true" />
        <div>
          <h1>
            {status === "up" && `${target} is up`}
            {status === "down" && `${target} is down`}
            {status === "unknown" && `${target} is unknown`}
          </h1>
          <p>
            {status === "down" &&
              `down since ${hhmm(summary.since ?? "")} UTC.`}
            {status === "unknown" && "there haven't been enough checks."}
            {`${summary.uptime24h}% uptime.`}
          </p>
        </div>
      </header>

      {stale && (
        <p className="warning">
          Can't refresh right now. Showing data from{" "}
          {summary.generatedAt.slice(11, 19)} UTC.
        </p>
      )}

      <section>
        <h2>Right now</h2>
        <ul className="regions">
          {regions.map((r) => (
            <li key={r.region}>
              <span className="city">{city(r.region)}</span>
              <span className="state">
                <span className={`dot small ${r.status}`} aria-hidden="true" />
                {WORD[r.status]}
              </span>
              <span className="code">{r.region}</span>
              <span className="latency">
                {r.latencyMs === undefined ? "No reading" : `${r.latencyMs} ms`}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Last 60 minutes</h2>
        <div
          className="strips"
          role="img"
          aria-label={`Last 60 minutes: ${count("up")} up, ${count("down")} down, ${count("unknown")} without data.`}
        >
          <Strip
            label="Overall"
            marks={minutes.map((m) => ({
              minute: m.minute,
              status: m.verdict,
            }))}
            big
          />
          {regions.map((r) => (
            <Strip
              key={r.region}
              label={city(r.region)}
              marks={minutes.map((m) => ({
                minute: m.minute,
                status: m.votes[r.region] ?? "unknown",
              }))}
            />
          ))}
          {minutes.length > 0 && (
            <div className="strip">
              <span className="ends">
                <span>{hhmm(minutes[0].minute)}</span>
                <span>{hhmm(minutes[minutes.length - 1].minute)} UTC</span>
              </span>
            </div>
          )}
        </div>
        <ul className="legend">
          <li>
            <span className="swatch">
              <span className="mark up" />
            </span>
            Up
          </li>
          <li>
            <span className="swatch">
              <span className="mark down" />
            </span>
            Down
          </li>
          <li>
            <span className="swatch">
              <span className="mark unknown" />
            </span>
            No data
          </li>
        </ul>
      </section>

      <section>
        <h2>Incidents</h2>
        {incidents.length === 0 ? (
          <p className="quiet">No incidents recorded.</p>
        ) : (
          <table className="incidents">
            <thead>
              <tr>
                <th>Started (UTC)</th>
                <th>Ended (UTC)</th>
                <th>Length</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((i) => (
                <tr key={i.startedAt}>
                  <td>{i.startedAt.replace("T", " ")}</td>
                  <td>
                    {i.resolvedAt ? i.resolvedAt.replace("T", " ") : "Ongoing"}
                  </td>
                  <td>{i.durationMinutes} min</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <footer className="quiet">
        Checked every minute from{" "}
        {regions.map((r) => city(r.region)).join(", ")}. A minute counts as down
        when at least two regions fail, and an incident opens after two down
        minutes in a row. Updated {summary.generatedAt.slice(11, 19)} UTC.
      </footer>
    </main>
  );
}

function Strip({
  label,
  marks,
  big = false,
}: {
  label: string;
  marks: { minute: string; status: Status }[];
  big?: boolean;
}) {
  const down = marks.filter((m) => m.status === "down").length;
  return (
    <div className={big ? "strip big" : "strip"}>
      <span className="label">{label}</span>
      <span className="marks">
        {marks.map((m) => (
          <span
            key={m.minute}
            className={`mark ${m.status}`}
            title={`${hhmm(m.minute)} UTC, ${label}: ${WORD[m.status]}`}
          />
        ))}
      </span>
      <span className="count">{down > 0 ? `${down} down` : ""}</span>
    </div>
  );
}
