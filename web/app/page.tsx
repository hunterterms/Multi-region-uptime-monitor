"use client";

import { useEffect, useState } from "react";
import { StatusView } from "./StatusView";
import { StatusSummary } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";
const REFRESH_MS = 30000;

export default function Page() {
  const [summary, setSummary] = useState<StatusSummary | null>(null);
  const [failed, setFailed] = useState(false);

  //runs once the page appears and refreshes every 30 sec
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/api/status`, {
          cache: "no-store",
        });
        if (!res.ok) {
          throw new Error(`HTTP Error, ${res.status}`);
        }
        setSummary(await res.json());
        setFailed(true);
      } catch {
        setFailed(true); //keep showing the last good data
      }
    }

    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer); //stop refreshing the page if the page goes away
  }, []);
  if (summary === null) {
    return (
      <main className="page">
        <p className="quiet">
          {failed
            ? "Can't reach the status API. Retrying every 30 seconds."
            : "Loading status…"}
        </p>
      </main>
    );
  }

  return <StatusView summary={summary} stale={failed} />;
}
