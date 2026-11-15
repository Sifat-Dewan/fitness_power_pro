import { NextRequest } from "next/server";
import { z } from "zod";
import { failure,success } from "@/lib/http";
import { heartbeatK40,verifyK40Agent } from "@/lib/k40";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function POST(req:NextRequest){try{const id=verifyK40Agent(req);const data=z.object({connected:z.boolean(),error:z.string().max(250).optional()}).parse(await req.json());
  await heartbeatK40(id,data.connected,data.error);return success({ok:true});
}catch(error){return failure(error);}}
