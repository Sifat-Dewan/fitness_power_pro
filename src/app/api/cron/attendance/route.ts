import { NextRequest, NextResponse } from "next/server";
import { completeTimedOutAttendance } from "@/lib/paged-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Optional cron trigger: configure CRON_SECRET in Vercel and schedule a GET with Authorization: Bearer <secret>. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 24 || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const completed = await completeTimedOutAttendance();
    return NextResponse.json({ completed, checkedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Attendance cron failed", error);
    return NextResponse.json({ error: "Unable to complete attendance records" }, { status: 500 });
  }
}
