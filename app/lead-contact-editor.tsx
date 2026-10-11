"use client";

import { useId, useState } from "react";
import { useActionState } from "react";
import { LoaderCircle, Pencil } from "lucide-react";
import { saveLeadContactDetails } from "@/app/lead-actions";
import type { LeadContactDetailsState } from "@/lib/leads-shared";

const initialState: LeadContactDetailsState = { status: "idle", message: "" };

/**
 * Reviewer-only affordance for hand-entering a lead's phone and website next to
 * the auto-parsed values. Optional: an empty field clears the stored value.
 * Manual values can be replaced by a later import (documented in the form copy).
 */
export default function LeadContactEditor({ workItemId, businessName, phone, website }: {
  workItemId: string;
  businessName: string;
  phone: string | null;
  website: string | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [state, formAction, pending] = useActionState(saveLeadContactDetails, initialState);
  const formId = useId();

  return (
    <div className="contact-editor">
      <button
        type="button"
        className="contact-edit-button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-controls={formId}
      >
        <Pencil size={12} aria-hidden="true" /> Edit contact details
      </button>

      {isOpen && (
        <form id={formId} action={formAction} className="contact-edit-form">
          <input type="hidden" name="workItemId" value={workItemId} />
          <label>
            <span>Phone</span>
            <input
              name="phone"
              type="tel"
              inputMode="tel"
              defaultValue={phone ?? ""}
              placeholder="+91 98765 43210"
              maxLength={100}
              autoComplete="off"
              aria-label={`Phone for ${businessName}`}
            />
          </label>
          <label>
            <span>Website</span>
            <input
              name="website"
              type="url"
              defaultValue={website ?? ""}
              placeholder="https://example.com"
              maxLength={2048}
              autoComplete="off"
              aria-label={`Website for ${businessName}`}
            />
          </label>
          <p className="contact-edit-note">Manual values can be replaced by a newer import. Leave a field empty to remove it.</p>
          {state.status === "error" && state.message && (
            <p className="contact-edit-error" role="alert">{state.message}</p>
          )}
          {state.status === "success" && state.message && (
            <p className="contact-edit-success" role="status">{state.message}</p>
          )}
          <div className="contact-edit-actions">
            <button className="button button-primary button-compact" type="submit" disabled={pending} aria-busy={pending}>
              {pending && <LoaderCircle className="loading-spinner" size={14} />}
              {pending ? "Saving..." : "Save"}
            </button>
            <button className="text-button" type="button" onClick={() => setIsOpen(false)}>Close</button>
          </div>
        </form>
      )}
    </div>
  );
}
