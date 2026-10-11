import { Check, ExternalLink, Globe2, Mail, MapPin, Phone, Star, X } from "lucide-react";
import PendingButton from "@/app/pending-button";
import FollowUpManager from "@/app/follow-up-manager";
import LeadContactEditor from "@/app/lead-contact-editor";
import {
  archiveLead,
  markLeadReviewed,
  saveLeadNotes,
  setQualificationStatus,
  setSalesStatus,
} from "@/app/lead-actions";
import type { LeadRow } from "@/lib/leads-shared";

function businessInitial(businessName: string) {
  return Array.from(businessName)[0]?.toUpperCase() ?? "";
}

/** Display-only: keep the last `maxWords` words, prefixing an ellipsis when clipped. */
function lastWords(value: string, maxWords: number) {
  const trimmed = value.trim();
  const words = trimmed.split(/\s+/);
  if (words.length <= maxWords) return trimmed;
  return `…${words.slice(-maxWords).join(" ")}`;
}

export default function LeadTable({ rows, canReview, canManageSales }: {
  rows: LeadRow[];
  canReview: boolean;
  canManageSales: boolean;
}) {
  return (
    <div className="table-wrap">
      <table className="leads-table">
        <thead>
          <tr>
            <th scope="col">Business</th>
            <th scope="col">Address</th>
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
          {rows.map((business) => (
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
              <td data-label="Address"><span className="address-cell" title={business.address ?? undefined}><MapPin size={14} />{business.address ? lastWords(business.address, 10) : "Not listed"}</span></td>
              <td data-label="Contact">
                <div className="contact-cell">
                  {business.phone && <a href={`tel:${business.phone}`}><Phone size={13} />{business.phone}</a>}
                  {business.email && <a href={`mailto:${business.email}`}><Mail size={13} />{business.email}</a>}
                  {business.website && <a href={business.website} target="_blank" rel="noreferrer"><Globe2 size={13} />{business.website.replace(/^https?:\/\//i, "").replace(/\/$/, "")}</a>}
                  {!business.phone && !business.email && !business.website && <span className="muted">No contact details</span>}
                </div>
                {canReview && (
                  <LeadContactEditor
                    workItemId={business.id}
                    businessName={business.businessName}
                    phone={business.phone}
                    website={business.website}
                  />
                )}
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
          ))}
        </tbody>
      </table>
    </div>
  );
}
