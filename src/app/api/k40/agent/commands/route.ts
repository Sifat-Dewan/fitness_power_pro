import { NextRequest } from "next/server";
import { failure,success } from "@/lib/http";
import { claimK40Command,verifyK40Agent } from "@/lib/k40";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(req:NextRequest){try{const id=verifyK40Agent(req);return success({command:req.headers.get("x-allow-deletion")==="true"?await claimK40Command(id):null});}catch(error){return failure(error);}}
