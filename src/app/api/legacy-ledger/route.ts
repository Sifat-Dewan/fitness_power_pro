import { NextRequest } from "next/server";
import { db } from "@/db";
import { legacyCostRecords, members } from "@/db/schema";
import { requireActor } from "@/lib/permissions";
import { failure, success } from "@/lib/http";
import { count, desc, eq, sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Authenticated, read-only access to every original cost record. */
export async function GET(request: NextRequest) {
  try {
    await requireActor("read");
    const requested=Number(request.nextUrl.searchParams.get("page")||1);
    const page=Number.isSafeInteger(requested)?Math.max(1,Math.min(100000,requested)):1;
    const size=20;
    const [totalRow]=await db.select({total:count()}).from(legacyCostRecords);
    const [sumRow]=await db.select({sum:sql<number>`coalesce(sum(${legacyCostRecords.amount}),0)::int`,unattributed:sql<number>`count(*) filter (where ${legacyCostRecords.memberId} is null)::int`}).from(legacyCostRecords);
    const items=await db.select({id:legacyCostRecords.sourceId,memberId:legacyCostRecords.memberId,originalMemberId:legacyCostRecords.originalMemberId,memberName:members.name,memberNo:members.memberNo,amount:legacyCostRecords.amount,type:legacyCostRecords.type,recordedAt:legacyCostRecords.recordedAt,linked:legacyCostRecords.importedAsPayment})
      .from(legacyCostRecords).leftJoin(members,eq(legacyCostRecords.memberId,members.id))
      .orderBy(desc(legacyCostRecords.recordedAt),desc(legacyCostRecords.sourceId)).limit(size).offset((page-1)*size);
    return success({items,page,pageSize:size,total:Number(totalRow?.total||0),pages:Math.ceil(Number(totalRow?.total||0)/size),summary:{sum:Number(sumRow?.sum||0),unattributed:Number(sumRow?.unattributed||0)}});
  }catch(error){return failure(error)}
}
