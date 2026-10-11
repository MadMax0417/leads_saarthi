// Shared lead types and constants.
//
// This module intentionally has no `server-only` import so that both server
// components (data layer) and client components (toolbar, table rows) can import
// the same types and page-size constants without pulling server code into the
// browser bundle.

export type LeadView = "all" | "qualified" | "unqualified";

export type LeadFilter = "all" | "phone" | "website";

export type QualificationStatus = "pending" | "qualified" | "disqualified";

export type SalesStatus =
  | "not_contacted"
  | "contacted"
  | "follow_up"
  | "messaged"
  | "called"
  | "meeting"
  | "won"
  | "lost";

export type FollowUpRecord = {
  id: string;
  sequenceNumber: number;
  status: "scheduled" | "due_today" | "waiting_for_reply" | "overdue" | "completed";
  displayStatus: "scheduled" | "due_today" | "waiting_for_reply" | "overdue" | "completed";
  dueDate: string;
  channel: "whatsapp" | "call" | "email" | "instagram" | "linkedin" | "other";
  notes: string | null;
  completedAt: Date | null;
};

export type LeadRow = {
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
  qualificationStatus: QualificationStatus;
  notes: string | null;
  reviewedAt: Date | null;
  salesStatus: SalesStatus;
  followUps: FollowUpRecord[];
};

export type LeadBase = Omit<LeadRow, "followUps">;

export type LeadSummary = {
  total: number;
  phoneCount: number;
  websiteCount: number;
  averageRating: number | null;
};

export type WorkspaceCounts = {
  total: number;
  qualified: number;
  unqualified: number;
};

export type ExportLead = {
  businessName: string;
  category: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  review_count: number | null;
  email: string | null;
  google_maps_url: string | null;
};

export type LeadQuery = {
  page: number;
  pageSize: number;
  q?: string;
  category?: string;
  filter?: LeadFilter;
};

export type LeadQueryFilters = Pick<LeadQuery, "q" | "category" | "filter">;

/** Result state returned by the per-lead manual contact-details form action. */
export type LeadContactDetailsState = {
  status: "idle" | "success" | "error";
  message: string;
};

export type LeadListResult = {
  rows: LeadRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export const LEAD_PAGE_SIZES = [25, 50, 100] as const;

export const LEAD_DEFAULT_PAGE_SIZE = 25;

export function isValidPageSize(value: number): value is (typeof LEAD_PAGE_SIZES)[number] {
  return (LEAD_PAGE_SIZES as readonly number[]).includes(value);
}
