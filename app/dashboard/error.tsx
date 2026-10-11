"use client";

import { RefreshCcw } from "lucide-react";

export default function DashboardError({ error, reset }: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="dashboard-error">
      <div className="dashboard-error-card">
        <span className="dashboard-error-mark" aria-hidden="true"><RefreshCcw size={18} /></span>
        <div className="eyebrow">CONNECTION PROBLEM</div>
        <h1>Couldn&apos;t load your leads</h1>
        <p>
          The database connection dropped or the database is still waking up.
          Your leads are safe — retrying usually fixes it.
        </p>
        <div className="dashboard-error-actions">
          <button className="button button-primary" type="button" onClick={() => reset()}>
            <RefreshCcw size={14} aria-hidden="true" /> Try again
          </button>
        </div>
        {error.digest && <p className="dashboard-error-digest">Reference: {error.digest}</p>}
      </div>
    </main>
  );
}
