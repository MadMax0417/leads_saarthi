"use client";

import { useFormStatus } from "react-dom";

/**
 * Form wrapper for server actions that disables every field while the
 * submission is in flight, so users cannot edit or double-submit mid-flight.
 * Pair it with the shared PendingButton for the submit control.
 */
export default function PendingForm({ action, className, children }: {
  action: (formData: FormData) => void | Promise<void>;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <form className={className} action={action}>
      <PendingFieldset>{children}</PendingFieldset>
    </form>
  );
}

function PendingFieldset({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <fieldset className="pending-fieldset" disabled={pending} aria-busy={pending}>
      {children}
    </fieldset>
  );
}
