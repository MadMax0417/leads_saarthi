import {
  boolean,
  date,
  doublePrecision,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const contactStatusEnum = pgEnum("contact_status", [
  "not_contacted",
  "contacted",
  "follow_up",
  "messaged",
  "called",
  "meeting",
  "won",
  "lost",
]);

export const followUpStatusEnum = pgEnum("follow_up_status", [
  "scheduled",
  "due_today",
  "waiting_for_reply",
  "overdue",
  "completed",
]);

export const followUpChannelEnum = pgEnum("follow_up_channel", [
  "whatsapp",
  "call",
  "email",
  "instagram",
  "linkedin",
  "other",
]);

export const qualificationStatusEnum = pgEnum("qualification_status", [
  "pending",
  "qualified",
  "disqualified",
]);

export const fitClassificationEnum = pgEnum("fit_classification", [
  "unreviewed",
  "ideal_client",
  "competitor",
  "not_ideal",
]);

export const submissionItemOutcomeEnum = pgEnum("submission_item_outcome", [
  "inserted",
  "matched",
  "rejected",
]);

export const workspaceRoleEnum = pgEnum("workspace_role", [
  "member",
  "reviewer",
  "salesperson",
]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 32 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: workspaceRoleEnum("role").notNull().default("member"),
  isLoggedIn: boolean("is_logged_in").notNull().default(false),
  ipAddress: varchar("ip_address", { length: 64 }),
  loginTimeInIST: timestamp("login_time_in_ist", { withTimezone: true, mode: "date" }),
  sessionTokenHash: text("session_token_hash"),
  sessionExpiresAt: timestamp("session_expires_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const businesses = pgTable("businesses", {
  id: uuid("id").defaultRandom().primaryKey(),
  dedupeKey: text("dedupe_key").notNull().unique(),
  googlePlaceId: text("google_place_id"),
  businessName: text("business_name").notNull(),
  category: text("category"),
  address: text("address"),
  phone: text("phone"),
  whatsappNumber: text("whatsapp_number"),
  email: text("email"),
  website: text("website"),
  rating: doublePrecision("rating"),
  reviewCount: integer("review_count"),
  googleMapsUrl: text("google_maps_url"),
  archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const leadSubmissions = pgTable("lead_submissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  uploadedByUserId: uuid("uploaded_by_user_id").notNull().references(() => users.id),
  schemaVersion: varchar("schema_version", { length: 64 }).notNull(),
  sourceSchemaVersion: varchar("source_schema_version", { length: 64 }).notNull(),
  source: varchar("source", { length: 64 }).notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true, mode: "date" }),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  totalCount: integer("total_count").notNull().default(0),
  insertedCount: integer("inserted_count").notNull().default(0),
  matchedCount: integer("matched_count").notNull().default(0),
  rejectedCount: integer("rejected_count").notNull().default(0),
});

export const leadSubmissionItems = pgTable("lead_submission_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  submissionId: uuid("submission_id").notNull().references(() => leadSubmissions.id, { onDelete: "cascade" }),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "restrict" }),
  rowNumber: integer("row_number").notNull(),
  outcome: submissionItemOutcomeEnum("outcome").notNull(),
  rawRecord: jsonb("raw_record").$type<Record<string, unknown>>().notNull(),
  validationError: text("validation_error"),
}, (table) => [
  uniqueIndex("lead_submission_items_submission_row_unique").on(table.submissionId, table.rowNumber),
]);


export const leadWorkItems = pgTable("lead_work_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  assignedToUserId: uuid("assigned_to_user_id").references(() => users.id, { onDelete: "set null" }),
  contactStatus: contactStatusEnum("contact_status").notNull().default("not_contacted"),
  qualificationStatus: qualificationStatusEnum("qualification_status").notNull().default("pending"),
  fitClassification: fitClassificationEnum("fit_classification").notNull().default("unreviewed"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: "date" }),
  notes: text("notes"),
  assignedAt: timestamp("assigned_at", { withTimezone: true, mode: "date" }),
  archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("lead_work_items_business_unique").on(table.businessId),
]);

export const leadFollowUps = pgTable("lead_follow_ups", {
  id: uuid("id").defaultRandom().primaryKey(),
  workItemId: uuid("work_item_id").notNull().references(() => leadWorkItems.id, { onDelete: "cascade" }),
  sequenceNumber: integer("sequence_number").notNull(),
  status: followUpStatusEnum("status").notNull().default("scheduled"),
  dueDate: date("due_date", { mode: "string" }).notNull(),
  channel: followUpChannelEnum("channel").notNull().default("other"),
  notes: text("notes"),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("lead_follow_ups_work_item_sequence_unique").on(table.workItemId, table.sequenceNumber),
]);


export const websiteAssessments = pgTable("website_assessments", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
  websiteUrl: text("website_url").notNull(),
  score: numeric("score", { precision: 5, scale: 2 }),
  assessedAt: timestamp("assessed_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  assessorVersion: varchar("assessor_version", { length: 64 }),
  details: jsonb("details").$type<Record<string, unknown>>(),
});