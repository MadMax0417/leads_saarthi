"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { BellRing, Check, Circle, CircleDot, LoaderCircle, Plus, X } from "lucide-react";
import type { FollowUpRecord } from "@/lib/leads";
import { addFollowUp, completeFollowUp, updateFollowUp } from "@/app/lead-actions";

type EditMode = "edit" | "reschedule" | "note";

function SaveButton({ children, className = "button button-primary button-compact" }: {
  children: React.ReactNode;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={className} type="submit" disabled={pending} aria-busy={pending}>
      {pending ? <LoaderCircle className="loading-spinner" size={14} /> : null}
      {pending ? "Saving..." : children}
    </button>
  );
}

function dateLabel(value: string) {
  const [year, month, day] = value.split("-");
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${day} ${monthNames[Number(month) - 1]} ${year}`;
}

function statusLabel(status: FollowUpRecord["displayStatus"]) {
  return {
    scheduled: "Scheduled",
    due_today: "Due Today",
    waiting_for_reply: "Waiting",
    overdue: "Overdue",
    completed: "Completed",
  }[status];
}

export default function FollowUpManager({ workItemId, followUps }: {
  workItemId: string;
  followUps: FollowUpRecord[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [editMode, setEditMode] = useState<EditMode>("edit");
  const currentFollowUp = followUps.find((followUp) => followUp.status !== "completed");
  const nextFollowUp = currentFollowUp && followUps.find((followUp) =>
    followUp.sequenceNumber > currentFollowUp.sequenceNumber && followUp.status !== "completed"
  );

  function openDetails() {
    setEditMode("edit");
    setIsOpen(true);
  }

  return (
    <>
      <button className="follow-up-cell" type="button" onClick={openDetails}>
        <BellRing size={14} aria-hidden="true" />
        {currentFollowUp
          ? `F${currentFollowUp.sequenceNumber} · ${statusLabel(currentFollowUp.displayStatus)}`
          : "No Follow-up"}
      </button>

      {isOpen && (
        <div className="follow-up-backdrop" role="presentation" onClick={(event) => {
          if (event.target === event.currentTarget) setIsOpen(false);
        }}>
          <section className="follow-up-dialog" role="dialog" aria-modal="true" aria-labelledby="follow-up-title">
            <header className="follow-up-dialog-header">
              <div>
                <div className="eyebrow">SALES FOLLOW-UP</div>
                <h2 id="follow-up-title">{currentFollowUp ? `Follow-up #${currentFollowUp.sequenceNumber}` : "Start follow-ups"}</h2>
              </div>
              <button className="icon-button" type="button" onClick={() => setIsOpen(false)} aria-label="Close follow-up details"><X size={17} /></button>
            </header>

            {followUps.length > 0 && (
              <ol className="follow-up-history" aria-label="Follow-up history">
                {followUps.map((followUp) => {
                  const isCurrent = followUp.id === currentFollowUp?.id;
                  const state = followUp.status === "completed" ? "completed" : isCurrent ? "current" : "upcoming";
                  const Indicator = state === "completed" ? Check : state === "current" ? CircleDot : Circle;
                  return (
                    <li className={`follow-up-history-item follow-up-history-${state}`} key={followUp.id}>
                      <Indicator size={15} aria-hidden="true" />
                      <span className="follow-up-history-sequence">F{followUp.sequenceNumber}</span>
                      <span>{dateLabel(followUp.dueDate)}</span>
                      <span>{followUp.channel === "whatsapp" ? "WhatsApp" : followUp.channel[0].toUpperCase() + followUp.channel.slice(1)}</span>
                      <span className="follow-up-history-status">{statusLabel(followUp.displayStatus)}</span>
                    </li>
                  );
                })}
              </ol>
            )}

            {currentFollowUp ? (
              <>
                <div className="follow-up-actions" role="group" aria-label="Follow-up actions">
                  <button type="button" className={editMode === "edit" ? "filter-button filter-active" : "filter-button"} onClick={() => setEditMode("edit")}>Edit</button>
                  <button type="button" className={editMode === "reschedule" ? "filter-button filter-active" : "filter-button"} onClick={() => setEditMode("reschedule")}>Reschedule</button>
                  <button type="button" className={editMode === "note" ? "filter-button filter-active" : "filter-button"} onClick={() => setEditMode("note")}>Add Note</button>
                </div>

                <form action={updateFollowUp} className="follow-up-form">
                  <input type="hidden" name="followUpId" value={currentFollowUp.id} />
                  {editMode === "reschedule" && <>
                    <input type="hidden" name="status" value={currentFollowUp.status} />
                    <input type="hidden" name="channel" value={currentFollowUp.channel} />
                    <input type="hidden" name="notes" value={currentFollowUp.notes || ""} />
                  </>}
                  {editMode === "note" && <>
                    <input type="hidden" name="status" value={currentFollowUp.status} />
                    <input type="hidden" name="channel" value={currentFollowUp.channel} />
                    <input type="hidden" name="dueDate" value={currentFollowUp.dueDate} />
                  </>}
                  {editMode === "edit" && <label>
                    Status
                    <select name="status" defaultValue={currentFollowUp.status}>
                      <option value="scheduled">Scheduled</option>
                      <option value="due_today">Due Today</option>
                      <option value="waiting_for_reply">Waiting for Reply</option>
                      <option value="overdue">Overdue</option>
                    </select>
                  </label>}
                  {editMode !== "note" && <label>
                    Date
                    <input name="dueDate" type="date" defaultValue={currentFollowUp.dueDate} required />
                  </label>}
                  {editMode === "edit" && <label>
                    Channel
                    <select name="channel" defaultValue={currentFollowUp.channel}>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="call">Call</option>
                      <option value="email">Email</option>
                      <option value="instagram">Instagram</option>
                      <option value="linkedin">LinkedIn</option>
                      <option value="other">Other</option>
                    </select>
                  </label>}
                  {editMode !== "note" && <label className="follow-up-notes">
                    Notes
                    <textarea name="notes" rows={3} maxLength={2000} defaultValue={currentFollowUp.notes || ""} />
                  </label>}
                  {editMode === "note" && <label className="follow-up-notes">
                    Notes
                    <textarea name="notes" rows={3} maxLength={2000} defaultValue={currentFollowUp.notes || ""} />
                  </label>}
                  <SaveButton>{editMode === "reschedule" ? "Reschedule" : editMode === "note" ? "Add Note" : "Save changes"}</SaveButton>
                </form>

                <form action={completeFollowUp} className="complete-follow-up-form">
                  <input type="hidden" name="followUpId" value={currentFollowUp.id} />
                  <label>
                    {nextFollowUp ? `Next date for F${nextFollowUp.sequenceNumber}` : "Next follow-up date"}
                    <input name="nextDueDate" type="date" defaultValue={nextFollowUp?.dueDate} required />
                  </label>
                  <SaveButton className="button button-primary"><Check size={14} /> Complete Follow-up</SaveButton>
                </form>
              </>
            ) : (
              <form action={addFollowUp} className="follow-up-form">
                <input type="hidden" name="workItemId" value={workItemId} />
                <label>
                  Date
                  <input name="dueDate" type="date" required />
                </label>
                <label>
                  Channel
                  <select name="channel" defaultValue="whatsapp">
                    <option value="whatsapp">WhatsApp</option>
                    <option value="call">Call</option>
                    <option value="email">Email</option>
                    <option value="instagram">Instagram</option>
                    <option value="linkedin">LinkedIn</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label className="follow-up-notes">
                  Notes
                  <textarea name="notes" rows={3} maxLength={2000} />
                </label>
                  <SaveButton><Plus size={14} /> Schedule F{(followUps[followUps.length - 1]?.sequenceNumber ?? 0) + 1}</SaveButton>
              </form>
            )}

            {currentFollowUp && (
              <form action={addFollowUp} className="schedule-next-form">
                <input type="hidden" name="workItemId" value={workItemId} />
                <details>
                  <summary>Schedule another follow-up</summary>
                  <div className="follow-up-form">
                    <label>
                      Date
                      <input name="dueDate" type="date" required />
                    </label>
                    <label>
                      Channel
                      <select name="channel" defaultValue="whatsapp">
                        <option value="whatsapp">WhatsApp</option>
                        <option value="call">Call</option>
                        <option value="email">Email</option>
                        <option value="instagram">Instagram</option>
                        <option value="linkedin">LinkedIn</option>
                        <option value="other">Other</option>
                      </select>
                    </label>
                    <label className="follow-up-notes">
                      Notes
                      <textarea name="notes" rows={2} maxLength={2000} />
                    </label>
                    <SaveButton><Plus size={14} /> Schedule next</SaveButton>
                  </div>
                </details>
              </form>
            )}
          </section>
        </div>
      )}
    </>
  );
}