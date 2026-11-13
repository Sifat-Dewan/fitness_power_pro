import { requireActor, demoEnabled } from "@/lib/permissions";
import { db } from "@/db";
import { lockers } from "@/db/schema";
import { demoList } from "@/lib/demo";
import { success, failure } from "@/lib/http";
export const runtime="nodejs";
export async function GET(){try{await requireActor("read");const zones=demoEnabled()?demoList("lockers").map(l=>String(l.zone)):(await db.selectDistinct({zone:lockers.zone}).from(lockers)).map(l=>l.zone);return success([...new Set(zones)].sort());}catch(e){return failure(e)}}
