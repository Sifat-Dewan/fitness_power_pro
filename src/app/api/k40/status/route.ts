import { NextRequest } from "next/server";
import { failure,success } from "@/lib/http";
import { requireActor } from "@/lib/permissions";
import { getK40Dashboard } from "@/lib/k40";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(_req:NextRequest){try{await requireActor("read");const params=_req.nextUrl.searchParams;
  return success(await getK40Dashboard(Number(params.get("page")||1),params.get("search")||"",params.get("status")||"all"));}catch(error){return failure(error);}}
