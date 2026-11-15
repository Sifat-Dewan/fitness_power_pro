import {
  pgTable, text, varchar, uuid, integer, boolean, date, timestamp,
  serial, index, uniqueIndex, jsonb,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

// Better Auth core + admin plugin. Names are intentionally "user", "session", etc.
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: ts("created_at").defaultNow().notNull(),
  updatedAt: ts("updated_at").defaultNow().notNull(),
  role: text("role").default("user"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: ts("ban_expires"),
  appRole: text("app_role").notNull().default("viewer"),
});
export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: ts("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: ts("created_at").defaultNow().notNull(),
  updatedAt: ts("updated_at").defaultNow().notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  impersonatedBy: text("impersonated_by"),
}, (t) => [index("session_user_idx").on(t.userId)]);
export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: ts("access_token_expires_at"),
  refreshTokenExpiresAt: ts("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: ts("created_at").defaultNow().notNull(),
  updatedAt: ts("updated_at").defaultNow().notNull(),
}, (t) => [index("account_user_idx").on(t.userId)]);
export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: ts("created_at").defaultNow(),
  updatedAt: ts("updated_at").defaultNow(),
}, (t) => [index("verification_identifier_idx").on(t.identifier)]);

export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 120 }).notNull().unique(),
  durationMonths: integer("duration_months").notNull(),
  price: integer("price").notNull(), // Whole BDT; not floating-point
  description: text("description").default("").notNull(),
  color: varchar("color", { length: 12 }).default("#4d7cff").notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: ts("created_at").defaultNow().notNull(),
});
export const members = pgTable("members", {
  id: uuid("id").primaryKey().defaultRandom(),
  memberNo: serial("member_no").unique().notNull(),
  name: varchar("name", { length: 180 }).notNull(),
  phone: varchar("phone", { length: 40 }),
  email: varchar("email", { length: 200 }),
  gender: varchar("gender", { length: 30 }).default("other"),
  dateOfBirth: date("date_of_birth", { mode: "string" }),
  address: text("address"),
  emergencyContact: varchar("emergency_contact", { length: 150 }),
  imageUrl: text("image_url"),
  notes: text("notes"),
  planId: uuid("plan_id").references(() => plans.id, { onDelete: "set null" }),
  startDate: date("start_date", { mode: "string" }),
  expireDate: date("expire_date", { mode: "string" }),
  status: varchar("status", { length: 24 }).default("active").notNull(),
  joinedAt: ts("joined_at").defaultNow().notNull(),
  archivedAt: ts("archived_at"),
  updatedAt: ts("updated_at").defaultNow().notNull(),
}, (t) => [index("members_plan_idx").on(t.planId), index("members_name_idx").on(t.name), index("members_expiry_idx").on(t.expireDate)]);
export const memberships = pgTable("memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  memberId: uuid("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
  planId: uuid("plan_id").notNull().references(() => plans.id, { onDelete: "restrict" }),
  startsOn: date("starts_on", { mode: "string" }).notNull(),
  expiresOn: date("expires_on", { mode: "string" }).notNull(),
  planPrice: integer("plan_price").notNull(),
  admissionFee: integer("admission_fee").default(0).notNull(),
  discount: integer("discount").default(0).notNull(),
  type: text("type").default("join").notNull(),
  note: text("note"),
  createdAt: ts("created_at").defaultNow().notNull(),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
}, (t) => [index("memberships_member_idx").on(t.memberId)]);
export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  memberId: uuid("member_id").notNull().references(() => members.id, { onDelete: "restrict" }),
  membershipId: uuid("membership_id").references(() => memberships.id, { onDelete: "set null" }),
  amount: integer("amount").notNull(),
  method: varchar("method", { length: 24 }).default("cash").notNull(),
  type: varchar("type", { length: 40 }).default("membership").notNull(),
  reference: varchar("reference", { length: 140 }),
  note: text("note"),
  paidAt: ts("paid_at").defaultNow().notNull(),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
}, (t) => [index("payments_member_idx").on(t.memberId), index("payments_date_idx").on(t.paidAt)]);
export const attendance = pgTable("attendance", {
  id: uuid("id").primaryKey().defaultRandom(),
  memberId: uuid("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
  checkedInAt: ts("checked_in_at").defaultNow().notNull(),
  checkedOutAt: ts("checked_out_at"),
  source: varchar("source", { length: 24 }).default("manual").notNull(),
  note: text("note"),
}, (t) => [
  index("attendance_date_idx").on(t.checkedInAt),
  index("attendance_member_idx").on(t.memberId),
  uniqueIndex("attendance_one_open_per_member").on(t.memberId).where(sql`${t.checkedOutAt} is null`),
]);
export const lockers = pgTable("lockers", {
  id: uuid("id").primaryKey().defaultRandom(),
  number: varchar("number", { length: 30 }).notNull().unique(),
  zone: varchar("zone", { length: 60 }).default("Main floor").notNull(),
  size: varchar("size", { length: 20 }).default("standard").notNull(),
  monthlyRate: integer("monthly_rate").default(0).notNull(),
  status: varchar("status", { length: 30 }).default("available").notNull(),
  notes: text("notes"),
  createdAt: ts("created_at").defaultNow().notNull(),
}, (t) => [index("locker_zone_idx").on(t.zone)]);
export const lockerAssignments = pgTable("locker_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  lockerId: uuid("locker_id").notNull().references(() => lockers.id, { onDelete: "cascade" }),
  memberId: uuid("member_id").notNull().references(() => members.id, { onDelete: "restrict" }),
  assignedAt: ts("assigned_at").defaultNow().notNull(),
  dueOn: date("due_on", { mode: "string" }),
  releasedAt: ts("released_at"),
  note: text("note"),
}, (t) => [
  index("locker_assignment_member_idx").on(t.memberId),
  uniqueIndex("locker_one_active_assignment").on(t.lockerId).where(sql`${t.releasedAt} is null`),
]);
export const expenses = pgTable("expenses", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 200 }).notNull(),
  category: varchar("category", { length: 45 }).default("other").notNull(),
  amount: integer("amount").notNull(),
  incurredOn: date("incurred_on", { mode: "string" }).notNull(),
  paymentMethod: varchar("payment_method", { length: 30 }).default("cash").notNull(),
  vendor: varchar("vendor", { length: 150 }),
  receiptUrl: text("receipt_url"),
  note: text("note"),
  createdAt: ts("created_at").defaultNow().notNull(),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
}, (t) => [index("expenses_date_idx").on(t.incurredOn)]);
export const staff = pgTable("staff", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 180 }).notNull(),
  jobTitle: varchar("job_title", { length: 90 }).notNull(),
  phone: varchar("phone", { length: 40 }),
  email: varchar("email", { length: 200 }),
  salary: integer("salary").default(0).notNull(),
  shift: varchar("shift", { length: 60 }).default("Morning").notNull(),
  joinedOn: date("joined_on", { mode: "string" }),
  status: varchar("status", { length: 24 }).default("active").notNull(),
  imageUrl: text("image_url"),
  notes: text("notes"),
  createdAt: ts("created_at").defaultNow().notNull(),
});
export const settings = pgTable("settings", {
  id: text("id").primaryKey().default("main"),
  gymName: varchar("gym_name", { length: 150 }).default("Fitness Power").notNull(),
  gymEmail: varchar("gym_email", { length: 150 }),
  gymPhone: varchar("gym_phone", { length: 40 }),
  gymAddress: text("gym_address"),
  admissionFee: integer("admission_fee").default(0).notNull(),
  currency: varchar("currency", { length: 5 }).default("BDT").notNull(),
  timezone: varchar("timezone", { length: 65 }).default("Asia/Dhaka").notNull(),
  updatedAt: ts("updated_at").defaultNow().notNull(),
});
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
  action: varchar("action", { length: 80 }).notNull(),
  entity: varchar("entity", { length: 70 }).notNull(),
  entityId: text("entity_id"),
  detail: jsonb("detail").$type<Record<string, unknown>>(),
  createdAt: ts("created_at").defaultNow().notNull(),
}, (t) => [index("audit_date_idx").on(t.createdAt)]);

// Read-only archive of imported financial transactions from the former gym system.
// A large portion of the source file has no member reference; preserving these
// separately avoids inventing members or attaching payments to the wrong person.
export const legacyCostRecords = pgTable("legacy_cost_records", {
  sourceId: text("source_id").primaryKey(),
  originalMemberId: text("original_member_id"),
  memberId: uuid("member_id").references(() => members.id, {onDelete: "set null"}),
  amount: integer("amount").notNull(),
  type: varchar("type", {length: 40}).notNull(),
  recordedAt: ts("recorded_at").notNull(),
  importedAsPayment: boolean("imported_as_payment").notNull().default(false),
  importedAt: ts("imported_at").notNull().defaultNow(),
}, (t) => [
  index("legacy_cost_record_date_idx").on(t.recordedAt),
  index("legacy_cost_record_member_idx").on(t.memberId),
]);

export const legacyMemberSources = pgTable("legacy_member_sources", {
  sourceId: text("source_id").primaryKey(),
  memberId: uuid("member_id").notNull().references(() => members.id, {onDelete: "cascade" }),
  originalMemberNo: text("original_member_no").notNull(),
  originalData: jsonb("original_data").$type<Record<string, string>>().notNull(),
  importedAt: ts("imported_at").notNull().defaultNow(),
});

// K40 integration: keep device identities distinct from web membership identities.
// The displayed K40 user_id is a string; the device-internal uid is a different number.
export const gymDevices = pgTable("gym_devices", {
  id: varchar("id", { length: 70 }).primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  model: varchar("model", { length: 60 }).notNull().default("ZKTeco K40"),
  lastSeenAt: ts("last_seen_at"),
  lastInventoryAt: ts("last_inventory_at"),
  lastError: text("last_error"),
  createdAt: ts("created_at").defaultNow().notNull(),
});
export const deviceUsers = pgTable("device_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  deviceId: varchar("device_id", { length: 70 }).notNull().references(() => gymDevices.id, { onDelete: "restrict" }),
  // Exactly as recorded on the device. Do NOT confuse with internal UID.
  userId: varchar("user_id", { length: 40 }).notNull(),
  uid: integer("uid").notNull(),
  name: varchar("name", { length: 180 }).notNull(),
  privilege: integer("privilege").notNull().default(0),
  memberId: uuid("member_id").references(() => members.id, { onDelete: "set null" }),
  state: varchar("state", { length: 32 }).notNull().default("present"),
  nameMismatch: boolean("name_mismatch").notNull().default(false),
  lastSeenAt: ts("last_seen_at").defaultNow().notNull(),
  createdAt: ts("created_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("device_users_device_user_id_unique").on(t.deviceId, t.userId),
  index("device_users_member_idx").on(t.memberId),
  index("device_users_state_idx").on(t.deviceId, t.state),
]);
export const deviceCommands = pgTable("device_commands", {
  id: uuid("id").primaryKey().defaultRandom(),
  deviceId: varchar("device_id", { length: 70 }).notNull().references(() => gymDevices.id, { onDelete: "restrict" }),
  memberId: uuid("member_id").references(() => members.id, { onDelete: "set null" }),
  type: varchar("type", { length: 32 }).notNull(), // delete_user only until K40 firmware is tested
  targetUserId: varchar("target_user_id", { length: 40 }).notNull(),
  targetUid: integer("target_uid").notNull(),
  status: varchar("status", { length: 24 }).notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  leaseToken: uuid("lease_token"),
  leaseUntil: ts("lease_until"),
  lastError: text("last_error"),
  requestedBy: text("requested_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: ts("created_at").defaultNow().notNull(),
  completedAt: ts("completed_at"),
}, (t) => [
  index("device_commands_queue_idx").on(t.deviceId, t.status, t.createdAt),
  index("device_commands_member_idx").on(t.memberId),
]);
