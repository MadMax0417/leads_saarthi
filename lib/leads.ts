import "server-only";

import { and, asc, count, eq, ilike, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { businesses, leadFollowUps, leadWorkItems } from "@/db/schema";
import { db } from "@/lib/db";
import {
  LEAD_DEFAULT_PAGE_SIZE,
  isValidPageSize,
  type ExportLead,
  type FollowUpRecord,
  type LeadBase,
  type LeadListResult,
  type LeadQuery,
  type LeadQueryFilters,
  type LeadRow,
  type LeadSummary,
  type LeadView,
  type WorkspaceCounts,
} from "@/lib/leads-shared";

export type {
  ExportLead,
  FollowUpRecord,
  LeadBase,
  LeadFilter,
  LeadListResult,
  LeadQuery,
  LeadQueryFilters,
  LeadRow,
  LeadSummary,
  LeadView,
  WorkspaceCounts,
} from "@/lib/leads-shared";

export { LEAD_DEFAULT_PAGE_SIZE, LEAD_PAGE_SIZES } from "@/lib/leads-shared";

const leadSelection = {
  id: leadWorkItems.id,
  businessName: businesses.businessName,
  category: businesses.category,
  address: businesses.address,
  phone: businesses.phone,
  website: businesses.website,
  rating: businesses.rating,
  review_count: businesses.reviewCount,
  email: businesses.email,
  google_maps_url: businesses.googleMapsUrl,
  qualificationStatus: leadWorkItems.qualificationStatus,
  notes: leadWorkItems.notes,
  reviewedAt: leadWorkItems.reviewedAt,
  salesStatus: leadWorkItems.contactStatus,
};

function dateInIndia(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

/** Escapes LIKE wildcards so a search term is matched literally. */
function likePattern(term: string) {
  return `%${term.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
}

/**
 * Builds the shared WHERE conditions for a view plus the optional
 * search / category / contact filters. Keeping this in one place guarantees the
 * paged query, the `count(*)`, the aggregates, and the export all agree.
 */
function leadConditions(view: LeadView, filters?: LeadQueryFilters) {
  const conditions = [isNull(leadWorkItems.archivedAt)];

  if (view === "qualified") {
    conditions.push(eq(leadWorkItems.qualificationStatus, "qualified"));
  } else if (view === "unqualified") {
    conditions.push(ne(leadWorkItems.qualificationStatus, "qualified"));
  }

  const term = filters?.q?.trim();
  if (term) {
    const pattern = likePattern(term);
    const search = or(
      ilike(businesses.businessName, pattern),
      ilike(businesses.category, pattern),
      ilike(businesses.address, pattern),
      ilike(businesses.phone, pattern),
      ilike(businesses.website, pattern),
      ilike(businesses.email, pattern),
    );
    if (search) conditions.push(search);
  }

  const category = filters?.category?.trim();
  if (category && category !== "all") {
    conditions.push(eq(businesses.category, category));
  }

  if (filters?.filter === "phone") {
    conditions.push(isNotNull(businesses.phone), ne(businesses.phone, ""));
  } else if (filters?.filter === "website") {
    conditions.push(isNotNull(businesses.website), ne(businesses.website, ""));
  }

  return conditions;
}

async function attachFollowUps(rows: LeadBase[]): Promise<LeadRow[]> {
  if (!rows.length) return [];

  const followUps = await db.select({
    id: leadFollowUps.id,
    workItemId: leadFollowUps.workItemId,
    sequenceNumber: leadFollowUps.sequenceNumber,
    status: leadFollowUps.status,
    dueDate: leadFollowUps.dueDate,
    channel: leadFollowUps.channel,
    notes: leadFollowUps.notes,
    completedAt: leadFollowUps.completedAt,
  })
    .from(leadFollowUps)
    .where(inArray(leadFollowUps.workItemId, rows.map((lead) => lead.id)))
    .orderBy(asc(leadFollowUps.sequenceNumber));

  const today = dateInIndia(new Date());
  const followUpsByLead = new Map<string, FollowUpRecord[]>();
  for (const followUp of followUps) {
    const displayStatus = followUp.status === "completed" ||
        followUp.status === "waiting_for_reply" ||
        followUp.status === "overdue"
      ? followUp.status
      : followUp.dueDate < today ? "overdue" : followUp.dueDate === today ? "due_today" : "scheduled";
    const entries = followUpsByLead.get(followUp.workItemId) ?? [];
    entries.push({ ...followUp, displayStatus });
    followUpsByLead.set(followUp.workItemId, entries);
  }

  return rows.map((lead) => ({ ...lead, followUps: followUpsByLead.get(lead.id) ?? [] }));
}

/**
 * Server-side paged lead query. Only one page of rows is read from the database
 * and the matching follow-ups are scoped to those work-item ids.
 */
export async function getLeadsPage(view: LeadView, query: LeadQuery): Promise<LeadListResult> {
  const pageSize = isValidPageSize(query.pageSize) ? query.pageSize : LEAD_DEFAULT_PAGE_SIZE;
  const where = and(...leadConditions(view, query));

  const [countRow] = await db
    .select({ total: count() })
    .from(leadWorkItems)
    .innerJoin(businesses, eq(leadWorkItems.businessId, businesses.id))
    .where(where);

  const total = Number(countRow?.total ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, Math.trunc(query.page) || 1), pageCount);

  if (total === 0) {
    return { rows: [], total, page, pageSize, pageCount };
  }

  const rows = await db.select(leadSelection)
    .from(leadWorkItems)
    .innerJoin(businesses, eq(leadWorkItems.businessId, businesses.id))
    .where(where)
    .orderBy(asc(businesses.businessName))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return { rows: await attachFollowUps(rows), total, page, pageSize, pageCount };
}

/** Aggregate counts/min/max style metrics for the metric cards of a view. */
export async function getLeadSummary(view: LeadView): Promise<LeadSummary> {
  const where = and(...leadConditions(view));
  const [row] = await db.select({
    total: count(),
    phoneCount: sql<number>`count(*) filter (where ${businesses.phone} is not null and ${businesses.phone} <> '')`,
    websiteCount: sql<number>`count(*) filter (where ${businesses.website} is not null and ${businesses.website} <> '')`,
    averageRating: sql<number | null>`avg(${businesses.rating})`,
  })
    .from(leadWorkItems)
    .innerJoin(businesses, eq(leadWorkItems.businessId, businesses.id))
    .where(where);

  return {
    total: Number(row?.total ?? 0),
    phoneCount: Number(row?.phoneCount ?? 0),
    websiteCount: Number(row?.websiteCount ?? 0),
    averageRating: row?.averageRating === null || row?.averageRating === undefined ? null : Number(row.averageRating),
  };
}

/** Workspace-wide counts for the sidebar navigation, independent of the view. */
export async function getWorkspaceCounts(): Promise<WorkspaceCounts> {
  const [row] = await db.select({
    total: count(),
    qualified: sql<number>`count(*) filter (where ${leadWorkItems.qualificationStatus} = 'qualified')`,
  })
    .from(leadWorkItems)
    .innerJoin(businesses, eq(leadWorkItems.businessId, businesses.id))
    .where(isNull(leadWorkItems.archivedAt));

  const total = Number(row?.total ?? 0);
  const qualified = Number(row?.qualified ?? 0);
  return { total, qualified, unqualified: total - qualified };
}

/** Distinct, non-empty categories present in a view, sorted alphabetically. */
export async function getLeadCategories(view: LeadView): Promise<string[]> {
  const rows = await db.selectDistinct({ category: businesses.category })
    .from(leadWorkItems)
    .innerJoin(businesses, eq(leadWorkItems.businessId, businesses.id))
    .where(and(...leadConditions(view), isNotNull(businesses.category), ne(businesses.category, "")))
    .orderBy(asc(businesses.category));

  return rows
    .map((row) => row.category)
    .filter((category): category is string => Boolean(category));
}

/**
 * Every lead in a view (optionally narrowed by the active filters) for export.
 * Deliberately unpaged so the JSON export is the whole set, not the visible page.
 */
export async function getLeadsForExport(view: LeadView, filters: LeadQueryFilters = {}): Promise<ExportLead[]> {
  const where = and(...leadConditions(view, filters));
  return db.select({
    businessName: businesses.businessName,
    category: businesses.category,
    address: businesses.address,
    phone: businesses.phone,
    website: businesses.website,
    rating: businesses.rating,
    review_count: businesses.reviewCount,
    email: businesses.email,
    google_maps_url: businesses.googleMapsUrl,
  })
    .from(leadWorkItems)
    .innerJoin(businesses, eq(leadWorkItems.businessId, businesses.id))
    .where(where)
    .orderBy(asc(businesses.businessName));
}
