import { NextRequest } from "next/server";
import { failure,success } from "@/lib/http";
import { inventorySchema, syncK40Users, verifyK40Agent } from "@/lib/k40";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function POST(req:NextRequest){try{
  const deviceId=verifyK40Agent(req);
  if(Number(req.headers.get("content-length")||0)>600000) return Response.json({error:"Inventory too large"},{status:413});
  const input=inventorySchema.parse(await req.json());
  return success(await syncK40Users(deviceId,input));
}catch(error){return failure(error);}}
