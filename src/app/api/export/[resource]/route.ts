import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { attendance, expenses, lockerAssignments, lockers, members, payments, plans, staff, deviceUsers } from "@/db/schema";
import { and, asc, count, desc, eq, getTableColumns, isNull, sql } from "drizzle-orm";
import { requireActor, ApiError, demoEnabled } from "@/lib/permissions";
import { demoList } from "@/lib/demo";
import { memberStatus } from "@/lib/utils";
import { failure } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ resource: string }> };
const BATCH = 250;
const exportColumns: Record<string, string[]> = {
  members:["memberNo","deviceUserId","deviceUid","name","phone","email","gender","planName","status","startDate","expireDate"],
  plans:["name","durationMonths","price","active","memberCount"],
  payments:["memberNo","memberName","amount","method","type","reference","paidAt"],
  attendance:["memberNo","memberName","checkedInAt","checkedOutAt","source"],
  lockers:["number","zone","size","status","memberName","dueOn"],
  expenses:["title","category","amount","vendor","incurredOn","paymentMethod"],
  staff:["name","jobTitle","phone","email","shift","salary","status"],
};
function csvSafe(v: unknown) {
  const raw = v == null ? "" : v instanceof Date ? v.toISOString() : String(v);
  const guarded = /^[\s]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${guarded.replaceAll('"','""')}"`;
}
/** Export in small DB batches: no 1,500/3,000-row truncation and no huge response buffer. */
async function batch(resource: string, offset: number): Promise<Array<Record<string, unknown>>> {
  switch(resource) {
    case "members": {
      const rows = await db.select({...getTableColumns(members),planName:plans.name,deviceUserId:deviceUsers.userId,deviceUid:deviceUsers.uid}).from(members)
        .leftJoin(plans,eq(members.planId,plans.id))
        .leftJoin(deviceUsers,and(eq(deviceUsers.memberId,members.id),eq(deviceUsers.deviceId,process.env.K40_DEVICE_ID||"gym-k40-01")))
        .where(isNull(members.archivedAt))
        .orderBy(asc(members.memberNo)).limit(BATCH).offset(offset);
      return rows.map(row=>({...row,status:memberStatus(row)}));
    }
    case "plans": return await db.select({...getTableColumns(plans),memberCount:sql<number>`count(${members.id})::int`}).from(plans)
      .leftJoin(members,and(eq(plans.id,members.planId),isNull(members.archivedAt))).groupBy(plans.id)
      .orderBy(asc(plans.durationMonths),asc(plans.id)).limit(BATCH).offset(offset);
    case "payments": return await db.select({...getTableColumns(payments),memberNo:members.memberNo,memberName:members.name}).from(payments)
      .innerJoin(members,eq(payments.memberId,members.id)).orderBy(desc(payments.paidAt),desc(payments.id)).limit(BATCH).offset(offset);
    case "attendance": return await db.select({...getTableColumns(attendance),memberNo:members.memberNo,memberName:members.name}).from(attendance)
      .innerJoin(members,eq(attendance.memberId,members.id)).orderBy(desc(attendance.checkedInAt),desc(attendance.id)).limit(BATCH).offset(offset);
    case "lockers": {
      const rows=await db.select({...getTableColumns(lockers),memberId:lockerAssignments.memberId,memberName:members.name,dueOn:sql<string|null>`coalesce(${lockerAssignments.dueOn},${members.expireDate})`})
        .from(lockers).leftJoin(lockerAssignments,and(eq(lockers.id,lockerAssignments.lockerId),isNull(lockerAssignments.releasedAt)))
        .leftJoin(members,eq(lockerAssignments.memberId,members.id)).orderBy(asc(lockers.number),asc(lockers.id)).limit(BATCH).offset(offset);
      return rows.map(row=>({...row,status:row.memberId?"occupied":row.status}));
    }
    case "expenses": return await db.select().from(expenses).orderBy(desc(expenses.incurredOn),desc(expenses.id)).limit(BATCH).offset(offset);
    case "staff": return await db.select().from(staff).orderBy(asc(staff.name),asc(staff.id)).limit(BATCH).offset(offset);
    default: return [];
  }
}
export async function GET(_req:NextRequest,{params}:Props){
  try{
    const {resource}=await params;
    if (!exportColumns[resource]) throw new ApiError(404,"Export not supported.");
    await requireActor("read");
    const fields=exportColumns[resource];
    const encoder=new TextEncoder();
    const demo=demoEnabled();
    const stream=new ReadableStream<Uint8Array>({
      async start(controller){
        try{
          controller.enqueue(encoder.encode("\ufeff"+fields.map(csvSafe).join(",")+"\r\n"));
          if(demo){
            for(const row of demoList(resource as Parameters<typeof demoList>[0]))
              controller.enqueue(encoder.encode(fields.map(field=>csvSafe((row as Record<string,unknown>)[field])).join(",")+"\r\n"));
          } else {
            for(let offset=0;;offset+=BATCH){
              const rows=await batch(resource,offset);
              if(rows.length===0)break;
              const chunk=rows.map(row=>fields.map(field=>csvSafe(row[field])).join(",")).join("\r\n")+"\r\n";
              controller.enqueue(encoder.encode(chunk));
              if(rows.length<BATCH)break;
            }
          }
          controller.close();
        }catch(error){controller.error(error)}
      }
    });
    return new NextResponse(stream,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="fitness-power-${resource}.csv"`,"Cache-Control":"private, no-store"}});
  }catch(error){return failure(error)}
}
