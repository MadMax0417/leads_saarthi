"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireReviewer, requireSalesperson, requireUser } from "@/lib/auth";

type BusinessInput = {
  businessName: string;
  category: string | null;
  address: string | null;
  phone: string | null;
  whatsappNumber: string | null;
  email: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  googleMapsUrl: string | null;
};

const salesStatuses = ["messaged", "called", "meeting", "won", "lost"] as const;
const followUpStatuses = ["scheduled", "due_today", "waiting_for_reply", "overdue"] as const;
const followUpChannels = ["whatsapp", "call", "email", "instagram", "linkedin", "other"] as const;

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function optionalString(record: Record<string, unknown>, key: string, maxLength = 2048) {
  const value = record[key];
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new Error(`${key} must be text.`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new Error(`${key} is too long.`);
  return normalized || null;
}

function validUrl(value: string | null, field: string) {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${field} must be a valid URL.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${field} must use HTTP or HTTPS.`);
  }
  return url.toString();
}

function normalizeBusiness(value: unknown): BusinessInput {
  const record = asRecord(value);
  if (!record) throw new Error("Business record must be an object.");

  const businessName = optionalString(record, "businessName", 300);
  if (!businessName) throw new Error("Business name is required.");

  const rating = record.rating;
  if (rating !== null && rating !== undefined &&
      (typeof rating !== "number" || !Number.isFinite(rating) || rating < 0 || rating > 5)) {
    throw new Error("Rating must be a number between 0 and 5.");
  }

  const reviewCount = record.review_count;
  if (reviewCount !== null && reviewCount !== undefined &&
      (!Number.isInteger(reviewCount) || Number(reviewCount) < 0)) {
    throw new Error("Review count must be a non-negative integer.");
  }

  return {
    businessName,
    category: optionalString(record, "category", 300),
    address: optionalString(record, "address", 1000),
    phone: optionalString(record, "phone", 100),
    whatsappNumber: optionalString(record, "whatsapp_number", 100) ??
      optionalString(record, "whatsappNumber", 100),
    email: optionalString(record, "email", 320),
    website: validUrl(optionalString(record, "website", 2048), "Website"),
    rating: typeof rating === "number" ? rating : null,
    reviewCount: typeof reviewCount === "number" ? reviewCount : null,
    googleMapsUrl: validUrl(optionalString(record, "google_maps_url", 2048), "Google Maps URL"),
  };
}

function identityText(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function dedupeKey(business: BusinessInput) {
  const mapsUrl = business.googleMapsUrl;
  const placeId = mapsUrl?.match(/[?&](?:query_place_id|place_id)=([^&]+)/i)?.[1] ??
    mapsUrl?.match(/!1s(ChIJ[^!/?&]+)/i)?.[1];
  if (placeId) return `place:${decodeURIComponent(placeId).toLowerCase()}`;

  const name = identityText(business.businessName);
  const address = business.address ? identityText(business.address) : "";
  if (address) return `name-address:${name}|${address}`;

  const phone = business.phone?.replace(/\D/g, "");
  if (phone && phone.length >= 7) return `phone:${phone}`;

  if (business.website) {
    const host = new URL(business.website).hostname.toLowerCase().replace(/^www\./, "");
    return `website:${host}|${name}`;
  }

  return `name:${name}`;
}

function rawRecord(value: unknown) {
  return asRecord(value) ?? { value };
}

export async function importLeads(payload: unknown) {
  const user = await requireUser();
  const envelope = asRecord(payload);
  const rows = Array.isArray(payload)
    ? payload
    : envelope && Array.isArray(envelope.businesses)
      ? envelope.businesses
      : null;
  if (!rows) throw new Error("Upload must contain a businesses list.");
  if (!rows.length || rows.length > 500) {
    throw new Error("Upload between 1 and 500 business records at a time.");
  }

  const schemaVersion = envelope?.schema_version;
  if (schemaVersion !== undefined && schemaVersion !== "maps-leads/v1" && schemaVersion !== "lead-upload/v1") {
    throw new Error("This lead file uses an unsupported schema version.");
  }
  const sourceSchemaVersion = envelope?.source_schema_version;
  const source = envelope?.source;
  const capturedAtValue = envelope?.captured_at;
  const capturedAt = typeof capturedAtValue === "string" && Number.isFinite(Date.parse(capturedAtValue))
    ? new Date(capturedAtValue)
    : null;
  const sourceValue = typeof source === "string" && source.trim() ? source.trim().slice(0, 64) : "google_maps";
  const sourceVersionValue = typeof sourceSchemaVersion === "string" && sourceSchemaVersion.trim()
    ? sourceSchemaVersion.trim().slice(0, 64)
    : typeof schemaVersion === "string" ? schemaVersion : "maps-leads/v1";
  const submissionId = randomUUID();
  const queries = [db.execute(sql`
    INSERT INTO lead_submissions (
      id, uploaded_by_user_id, schema_version, source_schema_version, source,
      captured_at, total_count
    ) VALUES (
      ${submissionId}::uuid, ${user.id}::uuid, 'lead-upload/v1',
      ${sourceVersionValue}, ${sourceValue}, ${capturedAt}, ${rows.length}
    )
  `)];
  let acceptedCount = 0;
  let rejectedCount = 0;

  rows.forEach((row, index) => {
    let business: BusinessInput;
    try {
      business = normalizeBusiness(row);
    } catch (error) {
      rejectedCount += 1;
      const message = error instanceof Error ? error.message : "Invalid business record.";
      queries.push(db.execute(sql`
        WITH recorded AS (
          INSERT INTO lead_submission_items (
            submission_id, row_number, outcome, raw_record, validation_error
          ) VALUES (
            ${submissionId}::uuid, ${index + 1}, 'rejected',
            ${JSON.stringify(rawRecord(row))}::jsonb, ${message}
          ) RETURNING outcome
        )
        UPDATE lead_submissions SET rejected_count = rejected_count + 1
        WHERE id = ${submissionId}::uuid
      `));
      return;
    }

    acceptedCount += 1;
    const key = dedupeKey(business);
    const raw = JSON.stringify(rawRecord(row));
    queries.push(db.execute(sql`
      WITH upserted AS (
        INSERT INTO businesses (
          dedupe_key, business_name, category, address, phone, whatsapp_number,
          email, website, rating, review_count, google_maps_url
        ) VALUES (
          ${key}, ${business.businessName}, ${business.category}, ${business.address},
          ${business.phone}, ${business.whatsappNumber}, ${business.email},
          ${business.website}, ${business.rating}, ${business.reviewCount}, ${business.googleMapsUrl}
        )
        ON CONFLICT (dedupe_key) DO UPDATE SET
          business_name = EXCLUDED.business_name,
          category = COALESCE(EXCLUDED.category, businesses.category),
          address = COALESCE(EXCLUDED.address, businesses.address),
          phone = COALESCE(EXCLUDED.phone, businesses.phone),
          whatsapp_number = COALESCE(EXCLUDED.whatsapp_number, businesses.whatsapp_number),
          email = COALESCE(EXCLUDED.email, businesses.email),
          website = COALESCE(EXCLUDED.website, businesses.website),
          rating = COALESCE(EXCLUDED.rating, businesses.rating),
          review_count = COALESCE(EXCLUDED.review_count, businesses.review_count),
          google_maps_url = COALESCE(EXCLUDED.google_maps_url, businesses.google_maps_url),
          updated_at = now()
        RETURNING id, (xmax = 0) AS inserted
      ), work_item AS (
        INSERT INTO lead_work_items (business_id, created_by_user_id)
        SELECT id, ${user.id}::uuid FROM upserted
        ON CONFLICT (business_id) DO NOTHING
        RETURNING id
      ), recorded AS (
        INSERT INTO lead_submission_items (
          submission_id, business_id, row_number, outcome, raw_record
        )
        SELECT ${submissionId}::uuid, id, ${index + 1},
          CASE WHEN inserted THEN 'inserted' ELSE 'matched' END::submission_item_outcome,
          ${raw}::jsonb
        FROM upserted
        RETURNING outcome
      )
      UPDATE lead_submissions SET
        inserted_count = inserted_count + (SELECT count(*) FROM recorded WHERE outcome = 'inserted'),
        matched_count = matched_count + (SELECT count(*) FROM recorded WHERE outcome = 'matched')
      WHERE id = ${submissionId}::uuid
    `));
  });

  await db.batch(queries as [typeof queries[number], ...typeof queries[number][]]);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/unqualified");
  revalidatePath("/dashboard/qualified");
  return { acceptedCount, rejectedCount };
}

export async function setQualificationStatus(formData: FormData) {
  await requireReviewer();
  const workItemId = String(formData.get("workItemId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(workItemId) ||
      !["qualified", "disqualified"].includes(status)) {
    throw new Error("Invalid lead update.");
  }

  await db.execute(sql`
    UPDATE lead_work_items SET qualification_status = ${status}::qualification_status,
      updated_at = now()
    WHERE id = ${workItemId}::uuid
      AND reviewed_at IS NOT NULL AND archived_at IS NULL
  `);
  revalidatePath("/dashboard/unqualified");
  revalidatePath("/dashboard/qualified");
}

export async function saveLeadNotes(formData: FormData) {
  await requireReviewer();
  const workItemId = String(formData.get("workItemId") ?? "");
  const notesValue = formData.get("notes");
  if (!/^[0-9a-f-]{36}$/i.test(workItemId) || typeof notesValue !== "string") {
    throw new Error("Invalid lead notes.");
  }

  const notes = notesValue.trim();
  if (notes.length > 10000) throw new Error("Lead notes must be 10,000 characters or fewer.");

  await db.execute(sql`
    UPDATE lead_work_items SET notes = ${notes || null}, updated_at = now()
    WHERE id = ${workItemId}::uuid AND archived_at IS NULL
  `);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/unqualified");
  revalidatePath("/dashboard/qualified");
}

export async function markLeadReviewed(workItemId: string) {
  await requireReviewer();
  if (!/^[0-9a-f-]{36}$/i.test(workItemId)) throw new Error("Invalid lead.");

  await db.execute(sql`
    UPDATE lead_work_items SET reviewed_at = now(), updated_at = now()
    WHERE id = ${workItemId}::uuid
      AND qualification_status = 'pending' AND reviewed_at IS NULL AND archived_at IS NULL
  `);
  revalidatePath("/dashboard/unqualified");
  revalidatePath("/dashboard/qualified");
}

export async function archiveLead(workItemId: string) {
  await requireReviewer();
  if (!/^[0-9a-f-]{36}$/i.test(workItemId)) throw new Error("Invalid lead.");

  await db.execute(sql`
    UPDATE lead_work_items SET archived_at = now(), updated_at = now()
    WHERE id = ${workItemId}::uuid
  `);
  revalidatePath("/dashboard/unqualified");
  revalidatePath("/dashboard/qualified");
}

export async function archiveLeadsInView(view: string) {
  await requireReviewer();
  if (!["all", "qualified", "unqualified"].includes(view)) throw new Error("Invalid lead view.");

  const statusFilter = view === "qualified"
    ? sql`AND qualification_status = 'qualified'`
    : view === "unqualified"
      ? sql`AND qualification_status <> 'qualified'`
      : sql``;
  await db.execute(sql`
    UPDATE lead_work_items SET archived_at = now(), updated_at = now()
    WHERE archived_at IS NULL ${statusFilter}
  `);
  revalidatePath("/dashboard/unqualified");
  revalidatePath("/dashboard/qualified");
}

export async function setSalesStatus(formData: FormData) {
  await requireSalesperson();
  const workItemId = String(formData.get("workItemId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(workItemId) ||
      !salesStatuses.includes(status as typeof salesStatuses[number])) {
    throw new Error("Invalid sales status.");
  }

  await db.execute(sql`
    UPDATE lead_work_items SET contact_status = ${status}::contact_status, updated_at = now()
    WHERE id = ${workItemId}::uuid AND archived_at IS NULL
  `);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/unqualified");
  revalidatePath("/dashboard/qualified");
}

export async function addFollowUp(formData: FormData) {
  await requireSalesperson();
  const workItemId = String(formData.get("workItemId") ?? "");
  const dueDate = String(formData.get("dueDate") ?? "");
  const channel = String(formData.get("channel") ?? "other");
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 2000) || null;
  if (!/^[0-9a-f-]{36}$/i.test(workItemId) || !isIsoDate(dueDate) ||
      !followUpChannels.includes(channel as typeof followUpChannels[number])) {
    throw new Error("Enter a valid date and follow-up channel.");
  }

  await db.execute(sql`
    INSERT INTO lead_follow_ups (work_item_id, sequence_number, due_date, channel, notes)
    SELECT work_item.id, COALESCE(MAX(existing.sequence_number), 0) + 1,
      ${dueDate}::date, ${channel}::follow_up_channel, ${notes}
    FROM lead_work_items AS work_item
    LEFT JOIN lead_follow_ups AS existing ON existing.work_item_id = work_item.id
    WHERE work_item.id = ${workItemId}::uuid AND work_item.archived_at IS NULL
    GROUP BY work_item.id
    ON CONFLICT (work_item_id, sequence_number) DO NOTHING
  `);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/unqualified");
  revalidatePath("/dashboard/qualified");
}

export async function updateFollowUp(formData: FormData) {
  await requireSalesperson();
  const followUpId = String(formData.get("followUpId") ?? "");
  const status = String(formData.get("status") ?? "");
  const dueDate = String(formData.get("dueDate") ?? "");
  const channel = String(formData.get("channel") ?? "");
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 2000) || null;
  if (!/^[0-9a-f-]{36}$/i.test(followUpId) ||
      !followUpStatuses.includes(status as typeof followUpStatuses[number]) ||
      !isIsoDate(dueDate) || !followUpChannels.includes(channel as typeof followUpChannels[number])) {
    throw new Error("Enter valid follow-up details.");
  }

  await db.execute(sql`
    UPDATE lead_follow_ups SET status = ${status}::follow_up_status,
      due_date = ${dueDate}::date, channel = ${channel}::follow_up_channel,
      notes = ${notes}, updated_at = now()
    WHERE id = ${followUpId}::uuid AND status <> 'completed'
  `);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/unqualified");
  revalidatePath("/dashboard/qualified");
}

export async function completeFollowUp(formData: FormData) {
  await requireSalesperson();
  const followUpId = String(formData.get("followUpId") ?? "");
  const nextDueDate = String(formData.get("nextDueDate") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(followUpId) || !isIsoDate(nextDueDate)) {
    throw new Error("Enter a valid next follow-up date.");
  }

  await db.execute(sql`
    WITH completed AS (
      UPDATE lead_follow_ups SET status = 'completed', completed_at = now(), updated_at = now()
      WHERE id = ${followUpId}::uuid AND status <> 'completed'
      RETURNING work_item_id, sequence_number
    ), upcoming AS (
      SELECT follow_up.id, follow_up.work_item_id
      FROM lead_follow_ups AS follow_up
      JOIN completed ON completed.work_item_id = follow_up.work_item_id
      WHERE follow_up.sequence_number > completed.sequence_number
        AND follow_up.status <> 'completed'
      ORDER BY follow_up.sequence_number
      LIMIT 1
    ), updated_upcoming AS (
      UPDATE lead_follow_ups AS follow_up SET
        due_date = ${nextDueDate}::date, status = 'scheduled', updated_at = now()
      FROM upcoming
      WHERE follow_up.id = upcoming.id
      RETURNING follow_up.id
    ), next_sequence AS (
      SELECT completed.work_item_id, COALESCE(MAX(existing.sequence_number), 0) + 1 AS sequence_number
      FROM completed
      LEFT JOIN lead_follow_ups AS existing ON existing.work_item_id = completed.work_item_id
      WHERE NOT EXISTS (SELECT 1 FROM upcoming)
      GROUP BY completed.work_item_id
    )
    INSERT INTO lead_follow_ups (work_item_id, sequence_number, status, due_date, channel)
    SELECT work_item_id, sequence_number, 'scheduled', ${nextDueDate}::date, 'other'
    FROM next_sequence
    ON CONFLICT (work_item_id, sequence_number) DO NOTHING
  `);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/unqualified");
  revalidatePath("/dashboard/qualified");
}