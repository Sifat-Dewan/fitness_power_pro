import { NextRequest } from "next/server";
import { failure,success } from "@/lib/http";
import { acknowledgeK40,commandAckSchema,verifyK40Agent } from "@/lib/k40";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function POST(req:NextRequest){try{const id=verifyK40Agent(req);return success(await acknowledgeK40(id,commandAckSchema.parse(await req.json())));}catch(error){return failure(error);}}
