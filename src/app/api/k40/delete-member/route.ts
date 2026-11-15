import { NextRequest } from "next/server";
import { z } from "zod";
import { failure,sameOrigin,success } from "@/lib/http";
import { requireActor } from "@/lib/permissions";
import { queueK40MemberDeletion } from "@/lib/k40";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function POST(req:NextRequest){try{sameOrigin(req);const actor=await requireActor("delete");
  const {memberId,confirmation}=z.object({memberId:z.string().uuid(),confirmation:z.string().max(70)}).parse(await req.json());
  return success(await queueK40MemberDeletion(memberId,confirmation,actor));
}catch(error){return failure(error);}}
