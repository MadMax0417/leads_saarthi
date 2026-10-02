"use client";

import { usePathname } from "next/navigation";

export default function DashboardLoading() {
  const showMetrics = usePathname() !== "/dashboard/unqualified";

  return (
    <div className="workspace-shell dashboard-loading" aria-busy="true" aria-label="Loading dashboard">
      <aside className="sidebar">
        <div className="skeleton-block skeleton-brand" />
        <div className="skeleton-block skeleton-nav" />
        <div className="skeleton-block skeleton-nav" />
        <div className="skeleton-block skeleton-nav" />
      </aside>
      <main className="main-panel">
        <div className="account-strip">
          <div className="skeleton-block skeleton-account" />
          <div className="skeleton-block skeleton-account-action" />
        </div>
        <div className="page-content">
          <div className="skeleton-heading">
            <div className="skeleton-block skeleton-eyebrow" />
            <div className="skeleton-block skeleton-title" />
            <div className="skeleton-block skeleton-description" />
          </div>
          {showMetrics && <div className="metric-grid" aria-hidden="true">
            {Array.from({ length: 4 }, (_, index) => <div className="skeleton-block skeleton-metric" key={index} />)}
          </div>}
          <div className="leads-section">
            <div className="skeleton-block skeleton-section-heading" />
            <div className="skeleton-block skeleton-toolbar" />
            {Array.from({ length: 5 }, (_, index) => <div className="skeleton-block skeleton-row" key={index} />)}
          </div>
        </div>
      </main>
    </div>
  );
}