"use client";

import { LoaderCircle } from "lucide-react";
import { useFormStatus } from "react-dom";

export default function PendingButton({ children, pendingLabel, className, ariaLabel }: {
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
