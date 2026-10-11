"use client";

import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BriefcaseBusiness,
  Check,
  ChevronLeft,
  ChevronRight,
  Globe2,
  LoaderCircle,
  MapPin,
  PanelLeftClose,
  PanelLeftOpen,
  Phone,
  Search,
  Star,
  UsersRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { archiveLeadsInView, exportLeads, importLeads } from "@/app/lead-actions";
import {
  LEAD_DEFAULT_PAGE_SIZE,
  LEAD_PAGE_SIZES,
  type LeadFilter,
  type LeadSummary,
  type LeadView,
  type WorkspaceCounts,
} from "@/lib/leads-shared";

type DashboardFilters = {
  q: string;
  category: string;
  filter: LeadFilter;
  page: number;
  pageSize: number;
};

function buildHref(basePath: string, current: DashboardFilters, overrides: Partial<DashboardFilters> = {}) {
  const next = { ...current, ...overrides };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.category && next.category !== "all") params.set("category", next.category);
  if (next.filter && next.filter !== "all") params.set("filter", next.filter);
  if (next.page > 1) params.set("page", String(next.page));
  if (next.pageSize !== LEAD_DEFAULT_PAGE_SIZE) params.set("pageSize", String(next.pageSize));
  const queryString = params.toString();
  return queryString ? `${basePath}?${queryString}` : basePath;
}

function pageItems(current: number, pageCount: number): (number | "gap")[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);

  const items: (number | "gap")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(pageCount - 1, current + 1);
  if (start > 2) items.push("gap");
  for (let page = start; page <= end; page += 1) items.push(page);
  if (end < pageCount - 1) items.push("gap");
  items.push(pageCount);
  return items;
}

function viewTotalFor(activeView: LeadView, counts: WorkspaceCounts) {
  if (activeView === "qualified") return counts.qualified;
  if (activeView === "unqualified") return counts.unqualified;
  return counts.total;
}

export default function LeadsDashboard({
  activeView,
  canReview,
  canManageSales,
  counts,
  summary,
  categories,
  q,
  category,
  filter,
  page,
  pageSize,
  pageCount,
  total,
  children,
}: {
  activeView: LeadView;
  canReview: boolean;
  canManageSales: boolean;
  counts: WorkspaceCounts;
  summary: LeadSummary;
  categories: string[];
  q: string;
  category: string;
  filter: LeadFilter;
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const basePath = usePathname();
  const fileInput = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState(q);
  const [message, setMessage] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);
  const deferredSearch = useDeferredValue(search);
  const pushedQuery = useRef(q);
  const [isNavigating, startNavigation] = useTransition();

  const currentFilters: DashboardFilters = { q, category, filter, page, pageSize };
  const viewTotal = viewTotalFor(activeView, counts);
  const phoneShare = summary.total ? Math.round(summary.phoneCount / summary.total * 100) : 0;
  const websiteShare = summary.total ? Math.round(summary.websiteCount / summary.total * 100) : 0;
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  // Adopt an externally changed query (e.g. back/forward navigation) into the box.
  useEffect(() => {
    if (q !== pushedQuery.current) {
      pushedQuery.current = q;
      setSearch(q);
    }
  }, [q]);

  // Push the debounced search into the URL, resetting to the first page.
  useEffect(() => {
    const next = deferredSearch.trim();
    if (next === pushedQuery.current) return;
    pushedQuery.current = next;
    startNavigation(() => {
      router.replace(
        buildHref(basePath, currentFilters, { q: next, page: 1 }),
        { scroll: false },
      );
    });
    // currentFilters is rebuilt from the same primitive props each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deferredSearch, basePath, category, filter, page, pageSize, q, router, startNavigation]);

  // Send the viewport back to the top whenever the result set itself changes
  // (page, filters, page size) so the refreshed list starts in view.
  function goTo(href: string, scrollToTop = false) {
    if (scrollToTop) window.scrollTo({ top: 0 });
    startNavigation(() => router.push(href, { scroll: false }));
  }

  // Keep Link semantics for modified clicks (new tab/window) while routing
  // plain clicks through a transition so the table can show its skeleton.
  function navigateFromLink(
    event: React.MouseEvent<HTMLAnchorElement>,
    overrides: Partial<DashboardFilters>,
    scrollToTop = true,
  ) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    goTo(buildHref(basePath, currentFilters, overrides), scrollToTop);
  }

  async function importFile(file?: File) {
    if (!file) return;
    setMessage("");
    setIsImporting(true);

    try {
      const payload: unknown = JSON.parse(await file.text());
      const result = await importLeads(payload);
      setMessage(`Uploaded ${result.acceptedCount} leads to the database${result.rejectedCount ? `; ${result.rejectedCount} rejected` : ""}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not read this JSON file.");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
      setIsImporting(false);
    }
  }

  async function exportBusinesses() {
    setMessage("");
    setIsExporting(true);
    try {
      const rows = await exportLeads(activeView, { q, category, filter });
      const exportData = {
        schema_version: "maps-leads/v1",
        captured_at: new Date().toISOString(),
        source: "google_maps",
        businesses: rows,
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "maps-leads.json";
      link.click();
      URL.revokeObjectURL(url);
      setMessage(`Exported ${rows.length} ${rows.length === 1 ? "business" : "businesses"} as JSON.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not export leads.");
    } finally {
      setIsExporting(false);
    }
  }

  function resetFilters() {
    setSearch("");
    pushedQuery.current = "";
    goTo(basePath, true);
  }

  return (
    <div className={isSidebarVisible ? "workspace-shell" : "workspace-shell sidebar-collapsed"}>
      <aside className="sidebar">
        <Link className="brand" href="/dashboard" aria-label="LeadsSaarthi home">
          <span className="brand-mark"><MapPin size={19} strokeWidth={2.4} /></span>
          <span className="brand-name">Leads<span>Saarthi</span></span>
        </Link>

        <div className="workspace-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          {!canManageSales && <>
            <Link className={activeView === "all" ? "nav-link nav-link-active" : "nav-link"} href="/dashboard"><BriefcaseBusiness size={17} /> Overview <span className="nav-count">{counts.total.toLocaleString("en-IN")}</span></Link>
            <Link className={activeView === "unqualified" ? "nav-link nav-link-active" : "nav-link"} href="/dashboard/unqualified"><UsersRound size={17} /> Unqualified <span className="nav-count">{counts.unqualified.toLocaleString("en-IN")}</span></Link>
          </>}
          <Link className={activeView === "qualified" ? "nav-link nav-link-active" : "nav-link"} href="/dashboard/qualified"><Check size={17} /> Qualified <span className="nav-count">{counts.qualified.toLocaleString("en-IN")}</span></Link>
        </nav>

        <div className="sidebar-bottom">
          <div className="source-mark"><span className="source-dot" /> DATABASE WORKSPACE</div>
          <p>Your Maps leads, ready to work.</p>
        </div>
      </aside>

      <main className="main-panel" id="overview">
        <header className="topbar">
          <div className="topbar-leading">
            <button
              className="sidebar-toggle"
              type="button"
              onClick={() => setIsSidebarVisible((visible) => !visible)}
              aria-label={isSidebarVisible ? "Hide sidebar" : "Show sidebar"}
              aria-expanded={isSidebarVisible}
              title={isSidebarVisible ? "Hide sidebar" : "Show sidebar"}
            >
              {isSidebarVisible ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
            </button>
            <div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-divider">/</span><strong>Leads</strong></div>
          </div>
          <div className="topbar-actions">
            <span className="connection-state"><span /> Database connected</span>
            <button className="button button-primary button-compact" onClick={() => fileInput.current?.click()} disabled={isImporting}>
              {isImporting ? <LoaderCircle className="loading-spinner" size={16} /> : <ArrowUpFromLine size={16} />}
              {isImporting ? "Uploading..." : "Import leads"}
            </button>
          </div>
        </header>

        <div className="page-content">
          <section className="page-heading">
            <div>
              <div className="eyebrow">GOOGLE MAPS PROSPECTING</div>
              <h1>{activeView === "qualified" ? "Qualified leads" : activeView === "unqualified" ? "Unqualified leads" : "Your leads"}</h1>
              <p className="heading-description">{activeView === "qualified" ? "Leads you have approved for follow-up." : activeView === "unqualified" ? "Review new submissions and decide which leads fit." : "A clear view of the businesses you’ve collected."}</p>
            </div>
            <button className="button button-secondary export-button" onClick={exportBusinesses} disabled={total === 0 || isExporting}>
              {isExporting ? <LoaderCircle className="loading-spinner" size={16} /> : <ArrowDownToLine size={16} />}
              {isExporting ? "Exporting..." : "Export JSON"}
            </button>
          </section>

          {activeView !== "unqualified" && <section className="metric-grid" aria-label="Lead summary" id="overview-metrics">
            <article className="metric metric-total">
              <div className="metric-topline"><span>Total leads</span><span className="metric-icon metric-icon-green"><UsersRound size={17} /></span></div>
              <div className="metric-value">{summary.total.toLocaleString("en-IN")}</div>
              <div className="metric-note">in this workspace</div>
            </article>
            <article className="metric">
              <div className="metric-topline"><span>Phone numbers</span><span className="metric-icon metric-icon-coral"><Phone size={17} /></span></div>
              <div className="metric-value">{summary.phoneCount.toLocaleString("en-IN")}</div>
              <div className="metric-note">{summary.total ? `${phoneShare}% of leads` : "Ready when you are"}</div>
            </article>
            <article className="metric">
              <div className="metric-topline"><span>Websites</span><span className="metric-icon metric-icon-gold"><Globe2 size={17} /></span></div>
              <div className="metric-value">{summary.websiteCount.toLocaleString("en-IN")}</div>
              <div className="metric-note">{summary.total ? `${websiteShare}% of leads` : "Ready when you are"}</div>
            </article>
            <article className="metric">
              <div className="metric-topline"><span>Average rating</span><span className="metric-icon metric-icon-blue"><Star size={17} /></span></div>
              <div className="metric-value">{summary.averageRating === null ? "—" : summary.averageRating.toFixed(1)}<span className="metric-suffix">{summary.averageRating !== null && <Star size={15} fill="currentColor" />}</span></div>
              <div className="metric-note">across rated businesses</div>
            </article>
          </section>}

          <section className="leads-section" id="leads" aria-busy={isNavigating}>
            <div className="section-heading">
              <div>
                <h2>Business directory</h2>
                <p>{summary.total ? (total === summary.total ? `${summary.total} businesses` : `${total} of ${summary.total} businesses`) : "Your collected businesses will appear here"}</p>
              </div>
              {canReview && viewTotal > 0 && (
                <form action={archiveLeadsInView.bind(null, activeView)}>
                  <ArchiveButton count={viewTotal} />
                </form>
              )}
            </div>

            <div className="toolbar">
              <label className="search-field">
                <Search size={17} />
                <input
                  type="search"
                  placeholder="Search businesses, contacts, addresses..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  aria-label="Search leads"
                />
                {search && <button className="clear-search" onClick={() => setSearch("")} aria-label="Clear search"><X size={15} /></button>}
              </label>
              <div className="filter-group" role="group" aria-label="Filter leads">
                <Link className={filter === "all" ? "filter-button filter-active" : "filter-button"} href={buildHref(basePath, currentFilters, { filter: "all", page: 1 })} scroll={false} onClick={(event) => navigateFromLink(event, { filter: "all", page: 1 })}>All leads</Link>
                <Link className={filter === "phone" ? "filter-button filter-active" : "filter-button"} href={buildHref(basePath, currentFilters, { filter: "phone", page: 1 })} scroll={false} onClick={(event) => navigateFromLink(event, { filter: "phone", page: 1 })}>Has phone</Link>
                <Link className={filter === "website" ? "filter-button filter-active" : "filter-button"} href={buildHref(basePath, currentFilters, { filter: "website", page: 1 })} scroll={false} onClick={(event) => navigateFromLink(event, { filter: "website", page: 1 })}>Has website</Link>
              </div>
              <label className="category-select-label">
                <span className="sr-only">Filter by category</span>
                <select value={category} onChange={(event) => goTo(buildHref(basePath, currentFilters, { category: event.target.value, page: 1 }), true)}>
                  <option value="all">All categories</option>
                  {categories.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
            </div>

            {message && <p className="status-message" role="status">{message}</p>}

            {counts.total === 0 ? (
              <div className="empty-state">
                <div className="empty-illustration"><span className="empty-pin"><MapPin size={24} /></span><span className="empty-star"><Star size={15} /></span></div>
                <h3>Start with your first list</h3>
                <p>Import a JSON export from LeadsSaarthi to organize and review your collected businesses.</p>
                <button className="button button-primary" onClick={() => fileInput.current?.click()} disabled={isImporting}>
                  {isImporting ? <LoaderCircle className="loading-spinner" size={16} /> : <ArrowUpFromLine size={16} />}
                  {isImporting ? "Uploading..." : "Import JSON file"}
                </button>
                <span className="file-hint">Accepts the maps-leads/v1 export format</span>
              </div>
            ) : total === 0 ? (
              <div className="empty-filter-state">
                <Search size={21} />
                <h3>No matching businesses</h3>
                <p>Try another search or adjust your filters.</p>
                <button className="text-button" onClick={resetFilters}>Reset filters</button>
              </div>
            ) : (
              <>
                {isNavigating ? (
                  <>
                    <LeadTableSkeleton rows={Math.min(pageSize, 8)} />
                    <span className="sr-only" role="status">Loading the next view…</span>
                  </>
                ) : children}
                <nav className="pagination" aria-label="Lead pages">
                  <span className="pagination-summary">Showing {rangeStart.toLocaleString("en-IN")}–{rangeEnd.toLocaleString("en-IN")} of {total.toLocaleString("en-IN")} businesses</span>
                  <div className="pagination-controls">
                    {page > 1 ? (
                      <Link className="pagination-button" href={buildHref(basePath, currentFilters, { page: page - 1 })} scroll={false} aria-label="Previous page" onClick={(event) => navigateFromLink(event, { page: page - 1 })}><ChevronLeft size={15} /> Prev</Link>
                    ) : (
                      <span className="pagination-button pagination-button-disabled" aria-disabled="true"><ChevronLeft size={15} /> Prev</span>
                    )}
                    {pageItems(page, pageCount).map((item, index) => item === "gap" ? (
                      <span className="pagination-gap" key={`gap-${index}`}>…</span>
                    ) : item === page ? (
                      <span key={item} className="pagination-page pagination-page-active" aria-current="page">{item}</span>
                    ) : (
                      <Link
                        key={item}
                        className="pagination-page"
                        href={buildHref(basePath, currentFilters, { page: item })}
                        scroll={false}
                        onClick={(event) => navigateFromLink(event, { page: item })}
                      >{item}</Link>
                    ))}
                    {page < pageCount ? (
                      <Link className="pagination-button" href={buildHref(basePath, currentFilters, { page: page + 1 })} scroll={false} aria-label="Next page" onClick={(event) => navigateFromLink(event, { page: page + 1 })}>Next <ChevronRight size={15} /></Link>
                    ) : (
                      <span className="pagination-button pagination-button-disabled" aria-disabled="true">Next <ChevronRight size={15} /></span>
                    )}
                    <label className="pagination-size">
                      <span className="sr-only">Rows per page</span>
                      <select value={pageSize} onChange={(event) => goTo(buildHref(basePath, currentFilters, { pageSize: Number(event.target.value), page: 1 }), true)}>
                        {LEAD_PAGE_SIZES.map((size) => <option key={size} value={size}>{size} / page</option>)}
                      </select>
                    </label>
                  </div>
                </nav>
              </>
            )}
          </section>
          <footer className="page-footer"><span>LEADSSAARTHI</span><span>Built for better follow-through.</span></footer>
        </div>
      </main>

      <input
        ref={fileInput}
        className="file-input"
        type="file"
        accept="application/json,.json"
        onChange={(event) => importFile(event.target.files?.[0])}
      />
    </div>
  );
}

function ArchiveButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <button className="text-button clear-button" type="submit" disabled={pending} aria-busy={pending}>
      {pending ? "Archiving..." : `Archive all (${count.toLocaleString("en-IN")})`}
    </button>
  );
}

/** Placeholder rows shown while a page/filter navigation is in flight. */
function LeadTableSkeleton({ rows }: { rows: number }) {
  return (
    <div className="table-skeleton" aria-hidden="true">
      <div className="skeleton-block table-skeleton-head" />
      {Array.from({ length: rows }, (_, index) => (
        <div className="skeleton-block table-skeleton-row" key={index} />
      ))}
    </div>
  );
}
