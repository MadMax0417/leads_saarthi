import "server-only";

import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import { businesses, leadFollowUps, leadWorkItems } from "@/db/schema";
import { db } from "@/lib/db";

export type LeadView = "all" | "qualified" | "unqualified";

export type FollowUpRecord = {
  id: string;
  sequenceNumber: number;
  status: "scheduled" | "due_today" | "waiting_for_reply" | "overdue" | "completed";
  displayStatus: "scheduled" | "due_today" | "waiting_for_reply" | "overdue" | "completed";
  dueDate: string;
  channel: "whatsapp" | "call" | "email" | "instagram" | "linkedin" | "other";
  notes: string | null;
  completedAt: Date | null;
}

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

export async function getLeads(view: LeadView = "all") {
  const filters = [
    isNull(leadWorkItems.archivedAt),
  ];

  if (view === "qualified") {
    filters.push(eq(leadWorkItems.qualificationStatus, "qualified"));
  } else if (view === "unqualified") {
    filters.push(ne(leadWorkItems.qualificationStatus, "qualified"));
  }

  const leads = await db.select({
    id: leadWorkItems.id,
    businessId: businesses.id,
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
    fitClassification: leadWorkItems.fitClassification,
    salesStatus: leadWorkItems.contactStatus,
    notes: leadWorkItems.notes,
    reviewedAt: leadWorkItems.reviewedAt,
    createdAt: leadWorkItems.createdAt,
  })
    .from(leadWorkItems)
    .innerJoin(businesses, eq(leadWorkItems.businessId, businesses.id))
    .where(and(...filters))
    .orderBy(asc(businesses.businessName));

  if (!leads.length) return [];

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
    .where(inArray(leadFollowUps.workItemId, leads.map((lead) => lead.id)))
    .orderBy(asc(leadFollowUps.sequenceNumber));

  const today = dateInIndia(new Date());
  const followUpsByLead = new Map<string, FollowUpRecord[]>();
  for (const followUp of followUps) {
    const displayStatus = followUp.status === "completed" || followUp.status === "waiting_for_reply" || followUp.status === "overdue"
      ? followUp.status
      : followUp.dueDate < today ? "overdue" : followUp.dueDate === today ? "due_today" : "scheduled";
    const entries = followUpsByLead.get(followUp.workItemId) ?? [];
    entries.push({ ...followUp, displayStatus });
    followUpsByLead.set(followUp.workItemId, entries);
  }

  return leads.map((lead) => ({ ...lead, followUps: followUpsByLead.get(lead.id) ?? [] }));
}