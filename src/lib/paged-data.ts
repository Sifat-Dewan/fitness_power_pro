import { db } from "@/db";
import { members, plans, payments, attendance, lockers, lockerAssignments, expenses, staff, auditLogs, user, legacyCostRecords } from "@/db/schema";
import { and, asc, desc, eq, gte, ilike, isNotNull, isNull, lt, or, sql, count, getTableColumns } from "drizzle-orm";
import { demoEnabled } from "./permissions";
import { demoList } from "./demo";
import { memberStatus, daysUntil, todayISO } from "./utils";
import type { ResourceName } from "./validators";

export type PageOptions = { page: number; pageSize: number; search: string; status: string; planId: string; category: string; method: string; zone: string; memberId: string };
export type PagedData<T = Record<string, unknown>> = { items: T[]; page: number; pageSize: number; total: number; pages: number; summary: Record<string, number> };
export function pageOptions(url: string): PageOptions {
  const p = new URL(url).searchParams;
  const n = Number(p.get("page")), size = Number(p.get("pageSize"));
  const limited = (v: string | null) => (v || "").trim().slice(0, 100);
  return { page: Number.isInteger(n) && n > 0 ? Math.min(n, 100000) : 1, pageSize: Number.isInteger(size) ? Math.max(1, Math.min(size, 20)) : 20,
    search: limited(p.get("search")), status: limited(p.get("status")), planId: limited(p.get("planId")), category: limited(p.get("category")), method: limited(p.get("method")), zone: limited(p.get("zone")), memberId: limited(p.get("memberId")) };
}
const result = <T>(items: T[], total: number, q: PageOptions, summary: Record<string, number> = {}): PagedData<T> => ({ items, total, page:q.page, pageSize:q.pageSize, pages: Math.max(1,Math.ceil(total/q.pageSize)), summary });
const num = (n: unknown) => Number(n || 0);
const match = (value: unknown, q: string) => String(value ?? "").toLowerCase().includes(q.toLowerCase());
const validUuid = (s: string) => /^[0-9a-fA-F-]{36}$/.test(s);

/** Close visits after three hours even without a manual check-out. Idempotent and safe under concurrent calls. */
export async function completeTimedOutAttendance() {
  if (demoEnabled()) {
    const cutoff = Date.now() - 3*60*60*1000;
    let completed = 0;
    for (const item of demoList("attendance")) if (!item.checkedOutAt && new Date(item.checkedInAt).getTime() <= cutoff) {
      item.checkedOutAt = new Date(new Date(item.checkedInAt).getTime() + 3*60*60*1000).toISOString();
      completed++;
    }
    return completed;
  }
  const completed = await db.update(attendance).set({ checkedOutAt: sql`${attendance.checkedInAt} + interval '3 hours'` })
    .where(and(isNull(attendance.checkedOutAt), lt(attendance.checkedInAt, new Date(Date.now() - 3*60*60*1000))))
    .returning({ id: attendance.id });
  return completed.length;
}

export async function listPagedResource(resource: ResourceName, q: PageOptions): Promise<PagedData<any>> {
  const offset = (q.page - 1) * q.pageSize;
  const search = `%${q.search.replace(/[\\%_]/g, "\\$&")}%`;
  const today = todayISO();
  if (demoEnabled()) {
    if (resource === "attendance") await completeTimedOutAttendance();
    const all = demoList(resource as Parameters<typeof demoList>[0]);
    const filtered = all.filter((r: any) => {
      if (q.memberId && r.memberId !== q.memberId) return false;
      if (q.planId && q.planId !== "all" && r.planId !== q.planId) return false;
      if (q.zone && q.zone !== "all" && r.zone !== q.zone) return false;
      if (q.method && q.method !== "all" && r.method !== q.method) return false;
      if (q.category && q.category !== "all" && r.category !== q.category) return false;
      const state = resource === "members" ? memberStatus(r) : resource === "attendance" ? (r.checkedOutAt ? "completed" : "inside") : r.status;
      if (q.status && q.status !== "all" && (q.status === "expiring" ? !(resource === "members" && state === "active" && daysUntil(r.expireDate) <= 7) : state !== q.status)) return false;
      if (!q.search) return true;
      return [r.name,r.memberNo,r.memberName,r.number,r.zone,r.phone,r.email,r.title,r.vendor,r.reference,r.jobTitle,r.action,r.entity].some(v=>match(v,q.search));
    });
    return result(filtered.slice(offset, offset+q.pageSize),filtered.length,q);
  }
  if (resource === "attendance") await completeTimedOutAttendance();
  if (resource === "members") {
    const conditions:any[] = [isNull(members.archivedAt)];
    if(q.search) conditions.push(or(ilike(members.name,search),ilike(members.phone,search),ilike(members.email,search),sql`${members.memberNo}::text ILIKE ${search}`));
    if(q.memberId)conditions.push(validUuid(q.memberId)?eq(members.id,q.memberId):sql`false`);
    if(q.planId && q.planId !== "all" && validUuid(q.planId)) conditions.push(eq(members.planId,q.planId));
    else if(q.planId && q.planId !== "all") conditions.push(sql`false`);
    if(q.status && q.status !== "all") {
      if(q.status === "pending") conditions.push(sql`${members.status} = 'active' AND ${members.startDate} > ${today}`);
      else if(q.status === "active") conditions.push(sql`${members.status} = 'active' AND ${members.startDate} <= ${today} AND ${members.expireDate} >= ${today}`);
      else if(q.status === "expiring") conditions.push(sql`${members.status} = 'active' AND ${members.startDate} <= ${today} AND ${members.expireDate} >= ${today} AND ${members.expireDate} <= (${today}::date + 7)`);
      else if(q.status === "expired") conditions.push(sql`${members.status} = 'active' AND (${members.expireDate} < ${today} OR ${members.expireDate} IS NULL)`);
      else conditions.push(eq(members.status, q.status));
    }
    const where = and(...conditions);
    const [t] = await db.select({ value: count() }).from(members).where(where);
    const rows = await db.select({ ...getTableColumns(members), planName:plans.name, planColor:plans.color })
      .from(members).leftJoin(plans,eq(members.planId,plans.id)).where(where).orderBy(desc(members.joinedAt),desc(members.id)).limit(q.pageSize).offset(offset);
    return result(rows.map(r=>({...r,membershipStatus:memberStatus(r),daysLeft:daysUntil(r.expireDate)})),num(t?.value),q);
  }
  if (resource === "attendance") {
    const conditions:any[]=[];
    if(q.search) conditions.push(or(ilike(members.name,search),sql`${members.memberNo}::text ILIKE ${search}`));
    if(q.status === "inside") conditions.push(isNull(attendance.checkedOutAt));
    if(q.status === "completed") conditions.push(isNotNull(attendance.checkedOutAt));
    if(q.memberId) conditions.push(validUuid(q.memberId)?eq(attendance.memberId,q.memberId):sql`false`);
    const where = and(...conditions);
    const [t] = await db.select({ value: count() }).from(attendance).innerJoin(members,eq(attendance.memberId,members.id)).where(where);
    const rows = await db.select({...getTableColumns(attendance),memberName:members.name,memberNo:members.memberNo,memberImage:members.imageUrl})
      .from(attendance).innerJoin(members,eq(attendance.memberId,members.id)).where(where).orderBy(desc(attendance.checkedInAt),desc(attendance.id)).limit(q.pageSize).offset(offset);
    return result(rows,num(t?.value),q);
  }
  if (resource === "payments") {
    const conditions:any[]=[];
    if(q.search) conditions.push(or(ilike(members.name,search),sql`${members.memberNo}::text ILIKE ${search}`,ilike(payments.reference,search),ilike(payments.type,search)));
    if(q.method && q.method !== "all") conditions.push(eq(payments.method,q.method));
    if(q.memberId) conditions.push(validUuid(q.memberId)?eq(payments.memberId,q.memberId):sql`false`);
    const where=and(...conditions);
    const [t]=await db.select({value:count()}).from(payments).innerJoin(members,eq(payments.memberId,members.id)).where(where);
    const rows=await db.select({...getTableColumns(payments),memberName:members.name,memberNo:members.memberNo})
      .from(payments).innerJoin(members,eq(payments.memberId,members.id)).where(where).orderBy(desc(payments.paidAt),desc(payments.id)).limit(q.pageSize).offset(offset);
    const [summary]=await db.select({count:count(),lifetime:sql<number>`coalesce(sum(${payments.amount}),0)::int`,month:sql<number>`coalesce(sum(${payments.amount}) filter (where (${payments.paidAt} at time zone 'Asia/Dhaka')::date >= ${today.slice(0,7)+"-01"}::date),0)::int`}).from(payments);
    const [unattributed] = await db.select({count:count(), lifetime:sql<number>`coalesce(sum(${legacyCostRecords.amount}),0)::int`,month:sql<number>`coalesce(sum(${legacyCostRecords.amount}) filter (where (${legacyCostRecords.recordedAt} at time zone 'Asia/Dhaka')::date >= ${today.slice(0,7)+"-01"}::date),0)::int`})
      .from(legacyCostRecords).where(eq(legacyCostRecords.importedAsPayment,false));
    return result(rows,num(t?.value),q,{count:num(summary?.count),lifetime:num(summary?.lifetime)+num(unattributed?.lifetime),month:num(summary?.month)+num(unattributed?.month),unattributedLegacyRecords:num(unattributed?.count),unattributedLegacyRevenue:num(unattributed?.lifetime)});
  }
  if (resource === "lockers") {
    const conditions:any[]=[];
    if(q.search) conditions.push(or(ilike(lockers.number,search),ilike(lockers.zone,search),ilike(members.name,search)));
    if(q.zone && q.zone !== "all") conditions.push(eq(lockers.zone,q.zone));
    if(q.status === "occupied") conditions.push(isNotNull(lockerAssignments.id));
    if(q.status === "available") conditions.push(and(eq(lockers.status,"available"),isNull(lockerAssignments.id)));
    if(q.status === "maintenance") conditions.push(eq(lockers.status,"maintenance"));
    const where=and(...conditions);
    const [t]=await db.select({value:count()}).from(lockers)
      .leftJoin(lockerAssignments,and(eq(lockers.id,lockerAssignments.lockerId),isNull(lockerAssignments.releasedAt)))
      .leftJoin(members,eq(lockerAssignments.memberId,members.id)).where(where);
    const rows=await db.select({...getTableColumns(lockers),memberId:lockerAssignments.memberId,memberName:members.name,assignmentId:lockerAssignments.id,
      dueOn:sql<string | null>`coalesce(${lockerAssignments.dueOn},${members.expireDate})`})
      .from(lockers).leftJoin(lockerAssignments,and(eq(lockers.id,lockerAssignments.lockerId),isNull(lockerAssignments.releasedAt)))
      .leftJoin(members,eq(lockerAssignments.memberId,members.id)).where(where).orderBy(asc(lockers.number),asc(lockers.id)).limit(q.pageSize).offset(offset);
    const [counts] = await db.select({total:count(),occupied:sql<number>`count(${lockerAssignments.id})::int`,maintenance:sql<number>`count(*) filter (where ${lockers.status} = 'maintenance')::int`}).from(lockers)
      .leftJoin(lockerAssignments,and(eq(lockers.id,lockerAssignments.lockerId),isNull(lockerAssignments.releasedAt)));
    return result(rows.map(r=>({...r,status:r.memberId?"occupied":r.status})),num(t?.value),q,{total:num(counts?.total),occupied:num(counts?.occupied),maintenance:num(counts?.maintenance)});
  }
  if (resource === "plans") {
    const where=q.search?ilike(plans.name,search):undefined;
    const [t]=await db.select({value:count()}).from(plans).where(where);
    const rows=await db.select({...getTableColumns(plans),memberCount:sql<number>`count(${members.id})::int`}).from(plans)
      .leftJoin(members,and(eq(plans.id,members.planId),isNull(members.archivedAt))).where(where)
      .groupBy(plans.id).orderBy(asc(plans.durationMonths)).limit(q.pageSize).offset(offset);
    return result(rows,num(t?.value),q);
  }
  if (resource === "expenses") {
    const conditions:any[]=[];
    if(q.search)conditions.push(or(ilike(expenses.title,search),ilike(expenses.vendor,search),ilike(expenses.category,search)));
    if(q.category && q.category !== "all")conditions.push(eq(expenses.category,q.category));
    const where=and(...conditions);
    const [t]=await db.select({value:count()}).from(expenses).where(where);
    const rows=await db.select().from(expenses).where(where).orderBy(desc(expenses.incurredOn),desc(expenses.id)).limit(q.pageSize).offset(offset);
    const [summary]=await db.select({lifetime:sql<number>`coalesce(sum(${expenses.amount}),0)::int`,month:sql<number>`coalesce(sum(${expenses.amount}) filter (where ${expenses.incurredOn} >= ${today.slice(0,7)+"-01"}),0)::int`,monthCount:sql<number>`count(*) filter (where ${expenses.incurredOn} >= ${today.slice(0,7)+"-01"})::int`}).from(expenses);
    return result(rows,num(t?.value),q,{lifetime:num(summary?.lifetime),month:num(summary?.month),monthCount:num(summary?.monthCount)});
  }
  if (resource === "staff") {
    const conditions:any[]=[];
    if(q.search)conditions.push(or(ilike(staff.name,search),ilike(staff.jobTitle,search),ilike(staff.phone,search)));
    if(q.status && q.status !== "all")conditions.push(eq(staff.status,q.status));
    const where=and(...conditions);
    const [t]=await db.select({value:count()}).from(staff).where(where);
    const rows=await db.select().from(staff).where(where).orderBy(asc(staff.name),asc(staff.id)).limit(q.pageSize).offset(offset);
    const [summary]=await db.select({total:count(),active:sql<number>`count(*) filter (where ${staff.status} = 'active')::int`,payroll:sql<number>`coalesce(sum(${staff.salary}) filter (where ${staff.status} = 'active'),0)::int`}).from(staff);
    return result(rows,num(t?.value),q,{total:num(summary?.total),active:num(summary?.active),payroll:num(summary?.payroll)});
  }
  if (resource === "audit") {
    const where=q.search?or(ilike(auditLogs.action,search),ilike(auditLogs.entity,search)):undefined;
    const [t]=await db.select({value:count()}).from(auditLogs).where(where);
    const rows=await db.select({...getTableColumns(auditLogs),actorName:user.name}).from(auditLogs).leftJoin(user,eq(auditLogs.actorId,user.id)).where(where)
      .orderBy(desc(auditLogs.createdAt),desc(auditLogs.id)).limit(q.pageSize).offset(offset);
    return result(rows,num(t?.value),q);
  }
  throw new Error("This resource does not support paginated records.");
}
