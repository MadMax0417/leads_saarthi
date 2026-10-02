"use client";

import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BriefcaseBusiness,
  Check,
  ExternalLink,
  Globe2,
  LoaderCircle,
  Mail,
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
import { useFormStatus } from "react-dom";
import { useDeferredValue, useRef, useState } from "react";
import {
  archiveLeadsInView,
  archiveLead,
  importLeads,
  markLeadReviewed,
  saveLeadNotes,
  setQualificationStatus,
  setSalesStatus,
} from "@/app/lead-actions";
import type { FollowUpRecord } from "@/lib/leads";
import FollowUpManager from "@/app/follow-up-manager";

type Business = {
  id: string;
  businessName: string;
  category: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  review_count: number | null;
  email: string | null;
  google_maps_url: string | null;
  qualificationStatus: "pending" | "qualified" | "disqualified";
  notes: string | null;
  reviewedAt: Date | null;
  salesStatus: "not_contacted" | "contacted" | "follow_up" | "messaged" | "called" | "meeting" | "won" | "lost";
  followUps: FollowUpRecord[];
};

type ViewFilter = "all" | "phone" | "website";

type DashboardView = "all" | "qualified" | "unqualified";

function compareText(first: string, second: string) {
  const normalizedFirst = first.toLowerCase();
  const normalizedSecond = second.toLowerCase();
  return normalizedFirst < normalizedSecond ? -1 : normalizedFirst > normalizedSecond ? 1 : 0;
}

function businessInitial(businessName: string) {
  return Array.from(businessName)[0]?.toUpperCase() ?? "";
}

function PendingButton({ children, pendingLabel, className, ariaLabel }: {
  children: React.ReactNode;
  pendingLabel: string;
  className: string;
  ariaLabel?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button className={className} type="submit" disabled={pending} aria-busy={pending}
      aria-label={pending ? pendingLabel : ariaLabel} title={ariaLabel}>
      {pending && <LoaderCircle className="loading-spinner" size={14} aria-hidden="true" />}
      {pending ? pendingLabel : children}
    </button>
  );
}

export default function LeadsDashboard({ businesses, activeView, canReview, canManageSales }: {
  businesses: Business[];
  activeView: DashboardView;
  canReview: boolean;
  canManageSales: boolean;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");
  const [message, setMessage] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);
  const deferredSearch = useDeferredValue(search);

  const viewBusinesses = businesses.filter((business) => activeView === "all" ||
    (activeView === "qualified" ? business.qualificationStatus === "qualified" : business.qualificationStatus !== "qualified"));
  const qualifiedCount = businesses.filter((business) => business.qualificationStatus === "qualified").length;
  const unqualifiedCount = businesses.length - qualifiedCount;
  const categories = [...new Set(viewBusinesses.map((business) => business.category).filter(Boolean))]
    .sort((first, second) => compareText(first!, second!));
  const normalizedSearch = deferredSearch.trim().toLowerCase();
  const visibleBusinesses = viewBusinesses
    .filter((business) => {
      const matchesSearch = !normalizedSearch || [
        business.businessName,
        business.category,
        business.address,
        business.phone,
        business.website,
        business.email,
      ].some((value) => value?.toLowerCase().includes(normalizedSearch));
      const matchesCategory = category === "all" || business.category === category;
      const matchesView = viewFilter === "all" ||
        (viewFilter === "phone" && Boolean(business.phone)) ||
        (viewFilter === "website" && Boolean(business.website));
      return matchesSearch && matchesCategory && matchesView;
    })
    .sort((first, second) => compareText(first.businessName, second.businessName));

  const phoneCount = viewBusinesses.filter((business) => business.phone).length;
  const websiteCount = viewBusinesses.filter((business) => business.website).length;
  const ratedBusinesses = viewBusinesses.filter((business) => business.rating !== null);
  const averageRating = ratedBusinesses.length
    ? ratedBusinesses.reduce((total, business) => total + business.rating!, 0) / ratedBusinesses.length
    : null;

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

  function exportBusinesses() {
    const exportData = {
      schema_version: "maps-leads/v1",
      captured_at: new Date().toISOString(),
      source: "google_maps",
      businesses: viewBusinesses.map((business) => ({
        businessName: business.businessName,
        category: business.category,
        address: business.address,
        phone: business.phone,
        website: business.website,
        rating: business.rating,
        review_count: business.review_count,
        email: business.email,
        google_maps_url: business.google_maps_url,
      })),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "maps-leads.json";
    link.click();
    URL.revokeObjectURL(url);
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
            <Link className={activeView === "all" ? "nav-link nav-link-active" : "nav-link"} href="/dashboard"><BriefcaseBusiness size={17} /> Overview <span className="nav-count">{businesses.length}</span></Link>
            <Link className={activeView === "unqualified" ? "nav-link nav-link-active" : "nav-link"} href="/dashboard/unqualified"><UsersRound size={17} /> Unqualified <span className="nav-count">{unqualifiedCount}</span></Link>
          </>}
          <Link className={activeView === "qualified" ? "nav-link nav-link-active" : "nav-link"} href="/dashboard/qualified"><Check size={17} /> Qualified <span className="nav-count">{qualifiedCount}</span></Link>
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
            <button className="button button-secondary export-button" onClick={exportBusinesses} disabled={!businesses.length}>
              <ArrowDownToLine size={16} /> Export JSON
            </button>
          </section>

          {activeView !== "unqualified" && <section className="metric-grid" aria-label="Lead summary" id="overview-metrics">
            <article className="metric metric-total">
              <div className="metric-topline"><span>Total leads</span><span className="metric-icon metric-icon-green"><UsersRound size={17} /></span></div>
              <div className="metric-value">{businesses.length.toLocaleString("en-IN")}</div>
              <div className="metric-note">in this workspace</div>
            </article>
            <article className="metric">
              <div className="metric-topline"><span>Phone numbers</span><span className="metric-icon metric-icon-coral"><Phone size={17} /></span></div>
              <div className="metric-value">{phoneCount.toLocaleString("en-IN")}</div>
              <div className="metric-note">{businesses.length ? `${Math.round(phoneCount / businesses.length * 100)}% of leads` : "Ready when you are"}</div>
            </article>
            <article className="metric">
              <div className="metric-topline"><span>Websites</span><span className="metric-icon metric-icon-gold"><Globe2 size={17} /></span></div>
              <div className="metric-value">{websiteCount.toLocaleString("en-IN")}</div>
              <div className="metric-note">{businesses.length ? `${Math.round(websiteCount / businesses.length * 100)}% of leads` : "Ready when you are"}</div>
            </article>
            <article className="metric">
              <div className="metric-topline"><span>Average rating</span><span className="metric-icon metric-icon-blue"><Star size={17} /></span></div>
              <div className="metric-value">{averageRating === null ? "—" : averageRating.toFixed(1)}<span className="metric-suffix">{averageRating !== null && <Star size={15} fill="currentColor" />}</span></div>
              <div className="metric-note">across rated businesses</div>
            </article>
          </section>}

          <section className="leads-section" id="leads">
            <div className="section-heading">
              <div>
                <h2>Business directory</h2>
                <p>{businesses.length ? `${visibleBusinesses.length} of ${businesses.length} businesses` : "Your collected businesses will appear here"}</p>
              </div>
              {canReview && viewBusinesses.length > 0 && (
                <form action={archiveLeadsInView.bind(null, activeView)}>
                  <PendingButton className="text-button clear-button" pendingLabel="Archiving...">Archive all</PendingButton>
                </form>
              )}
            </div>

            <div className="toolbar">
              <label className="search-field">
                <Search size={17} />
                <input
                  type="search"
                  placeholder="Search businesses, contacts, locations..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  aria-label="Search leads"
                />
                {search && <button className="clear-search" onClick={() => setSearch("")} aria-label="Clear search"><X size={15} /></button>}
              </label>
              <div className="filter-group" role="group" aria-label="Filter leads">
                <button className={viewFilter === "all" ? "filter-button filter-active" : "filter-button"} onClick={() => setViewFilter("all")}>All leads</button>
                <button className={viewFilter === "phone" ? "filter-button filter-active" : "filter-button"} onClick={() => setViewFilter("phone")}>Has phone</button>
                <button className={viewFilter === "website" ? "filter-button filter-active" : "filter-button"} onClick={() => setViewFilter("website")}>Has website</button>
              </div>
              <label className="category-select-label">
                <span className="sr-only">Filter by category</span>
                <select value={category} onChange={(event) => setCategory(event.target.value)}>
                  <option value="all">All categories</option>
                  {categories.map((item) => <option key={item} value={item!}>{item}</option>)}
                </select>
              </label>
            </div>

            {message && <p className="status-message" role="status">{message}</p>}

            {businesses.length ? (
              visibleBusinesses.length ? (
                <div className="table-wrap">
                  <table className="leads-table">
                    <thead>
                      <tr>
                        <th scope="col">Business</th>
                        <th scope="col">Location</th>
                        <th scope="col">Contact</th>
                        <th scope="col">Notes</th>
                        {canManageSales && <>
                          <th scope="col">Status</th>
                          <th scope="col">Follow-up</th>
                        </>}
                        <th scope="col">Google rating</th>
                        <th scope="col">Review</th>
                        <th scope="col"><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleBusinesses.map((business) => {
                        return (
                          <tr key={business.id}>
                            <td data-label="Business">
                              <div className="business-cell">
                                <div className="business-avatar">{businessInitial(business.businessName)}</div>
                                <div className="business-details">
                                  <a className="business-name" href={business.google_maps_url || undefined} target="_blank" rel="noreferrer">{business.businessName}{business.google_maps_url && <ExternalLink size={13} />}</a>
                                  <span className="business-category">{business.category || "Uncategorized"}</span>
                                </div>
                              </div>
                            </td>
                            <td data-label="Location"><span className="location-cell"><MapPin size={14} />{business.address || "Not listed"}</span></td>
                            <td data-label="Contact">
                              <div className="contact-cell">
                                {business.phone && <a href={`tel:${business.phone}`}><Phone size={13} />{business.phone}</a>}
                                {business.email && <a href={`mailto:${business.email}`}><Mail size={13} />{business.email}</a>}
                                {business.website && <a href={business.website} target="_blank" rel="noreferrer"><Globe2 size={13} />{business.website.replace(/^https?:\/\//i, "").replace(/\/$/, "")}</a>}
                                {!business.phone && !business.email && !business.website && <span className="muted">No contact details</span>}
                              </div>
                            </td>
                            <td data-label="Notes">
                              {canReview ? (
                                <form action={saveLeadNotes} className="lead-notes-form">
                                  <input type="hidden" name="workItemId" value={business.id} />
                                  <label className="sr-only" htmlFor={`lead-notes-${business.id}`}>Notes for {business.businessName}</label>
                                  <textarea
                                    id={`lead-notes-${business.id}`}
                                    name="notes"
                                    rows={3}
                                    maxLength={10000}
                                    defaultValue={business.notes ?? ""}
                                    placeholder="Add weaknesses or other review notes. Use new lines for paragraphs or start lines with - for bullets."
                                  />
                                  <PendingButton className="button button-secondary button-compact" pendingLabel="Saving...">Save notes</PendingButton>
                                </form>
                              ) : (
                                <p className="lead-notes-readonly">{business.notes || <span className="muted">No notes yet</span>}</p>
                              )}
                            </td>
                            {canManageSales && <>
                              <td data-label="Status">
                                <form action={setSalesStatus} className="sales-status-form">
                                  <input type="hidden" name="workItemId" value={business.id} />
                                  <select name="status" aria-label={`Sales status for ${business.businessName}`} defaultValue={[
                                    "messaged", "called", "meeting", "won", "lost",
                                  ].includes(business.salesStatus) ? business.salesStatus : ""}>
                                    <option value="" disabled>Select status</option>
                                    <option value="messaged">Messaged</option>
                                    <option value="called">Called</option>
                                    <option value="meeting">Meeting</option>
                                    <option value="won">Won</option>
                                    <option value="lost">Lost</option>
                                  </select>
                                  <PendingButton className="status-save-button" pendingLabel="Saving..." ariaLabel={`Save sales status for ${business.businessName}`}>
                                    <Check size={14} />
                                  </PendingButton>
                                </form>
                              </td>
                              <td data-label="Follow-up">
                                <FollowUpManager workItemId={business.id} followUps={business.followUps} />
                              </td>
                            </>}
                            <td data-label="Google rating">
                              {business.rating !== null ? (
                                <span className="rating-cell"><Star size={14} fill="currentColor" />{business.rating.toFixed(1)}<span>{business.review_count === null ? "" : `(${business.review_count.toLocaleString("en-IN")})`}</span></span>
                              ) : <span className="muted">Not rated</span>}
                            </td>
                            <td data-label="Review">
                              <span className={`lead-status lead-status-${business.qualificationStatus}`}>
                                {business.qualificationStatus === "qualified" ? "Qualified" : business.qualificationStatus === "disqualified" ? "Disqualified" : business.reviewedAt ? "Reviewed" : "Needs review"}
                              </span>
                            </td>
                            <td className="action-cell">
                              <div className="lead-actions">
                                {canReview ? <>
                                {business.qualificationStatus === "pending" && !business.reviewedAt && (
                                  <form action={markLeadReviewed.bind(null, business.id)}>
                                    <PendingButton className="text-button" pendingLabel="Saving...">Mark reviewed</PendingButton>
                                  </form>
                                )}
                                {business.qualificationStatus === "pending" && business.reviewedAt && (
                                  <>
                                    <form action={setQualificationStatus}>
                                      <input type="hidden" name="workItemId" value={business.id} />
                                      <input type="hidden" name="status" value="qualified" />
                                      <PendingButton className="button button-primary button-compact" pendingLabel="Saving...">Qualify</PendingButton>
                                    </form>
                                    <form action={setQualificationStatus}>
                                      <input type="hidden" name="workItemId" value={business.id} />
                                      <input type="hidden" name="status" value="disqualified" />
                                      <PendingButton className="text-button" pendingLabel="Saving...">Disqualify</PendingButton>
                                    </form>
                                  </>
                                )}
                                {business.qualificationStatus === "qualified" && (
                                  <form action={setQualificationStatus}>
                                    <input type="hidden" name="workItemId" value={business.id} />
                                    <input type="hidden" name="status" value="disqualified" />
                                    <PendingButton className="text-button" pendingLabel="Saving...">Move to unqualified</PendingButton>
                                  </form>
                                )}
                                {business.qualificationStatus === "disqualified" && (
                                  <form action={setQualificationStatus}>
                                    <input type="hidden" name="workItemId" value={business.id} />
                                    <input type="hidden" name="status" value="qualified" />
                                    <PendingButton className="text-button" pendingLabel="Saving...">Qualify</PendingButton>
                                  </form>
                                )}
                                <form action={archiveLead.bind(null, business.id)}>
                                  <PendingButton className="icon-button remove-button" pendingLabel="Archiving..." ariaLabel={`Archive ${business.businessName}`}>
                                    <X size={16} />
                                  </PendingButton>
                                </form>
                                </> : <span className="muted">Review handled by Kiran</span>}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-filter-state">
                  <Search size={21} />
                  <h3>No matching businesses</h3>
                  <p>Try another search or adjust your filters.</p>
                  <button className="text-button" onClick={() => { setSearch(""); setCategory("all"); setViewFilter("all"); }}>Reset filters</button>
                </div>
              )
            ) : (
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