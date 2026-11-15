import { createHash, timingSafeEqual, randomUUID } from "node:crypto";
import { db } from "@/db";
import { gymDevices, deviceUsers, deviceCommands, members, auditLogs } from "@/db/schema";
import { and, eq, inArray, isNull, asc, sql, desc, count, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { ApiError } from "./permissions";
import type { Actor } from "./access";

/** Only the local gym connector may call /api/k40/agent/*.
 * This is a separate credential, never the Neon URL or an owner session. */
export function verifyK40Agent(request: Request): string {
  const expected = process.env.K40_AGENT_TOKEN;
  const deviceId = process.env.K40_DEVICE_ID || "gym-k40-01";
  if (!expected || expected.length < 32) throw new ApiError(503, "K40 connector is not configured.");
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) throw new ApiError(401, "Connector authorization required.");
  const supplied = auth.slice(7);
  const a = createHash("sha256").update(expected).digest();
  const b = createHash("sha256").update(supplied).digest();
  if (!timingSafeEqual(a, b)) throw new ApiError(401, "Invalid connector authorization.");
  return deviceId;
}

export const inventorySchema = z.object({
  deviceId: z.string().min(1).max(70),
  // Full inventory snapshot, NOT a partial batch. Prevents premature "missing" states.
  users: z.array(z.object({
    userId: z.string().trim().min(1).max(40),
    uid: z.number().int().min(0).max(65535),
    name: z.string().trim().max(180),
    privilege: z.number().int().min(0).max(255).default(0),
  })).max(3000),
});
export type K40Inventory = z.infer<typeof inventorySchema>;

const cleanName = (n:string) => n.trim().toLowerCase().replace(/\s+/g, " ");
const numericId = (id:string):number|null => /^\d{1,10}$/.test(id) && Number(id)>0 && Number(id)<2147483647 ? Number(id) : null;

/** Import all device users, merging by the *displayed* K40 User ID.
 * Existing website profiles are NEVER overwritten. Unlike UID, this user_id
 * is what the former gym system stored in members.member_no.
 * Idempotent, no biometric templates are transmitted or stored. */
export async function syncK40Users(deviceId: string, input: K40Inventory) {
  if (input.deviceId !== deviceId) throw new ApiError(403, "Unknown K40 device.");
  const ids = input.users.map(u => u.userId);
  const uids = input.users.map(u => u.uid);
  if (new Set(ids).size !== ids.length || new Set(uids).size !== uids.length) throw new ApiError(422, "Device inventory includes duplicate User IDs or UIDs.");
  const normalizedNumeric = ids.map(numericId).filter((n):n is number=>n!==null);
  if(new Set(normalizedNumeric).size!==normalizedNumeric.length)throw new ApiError(422,"Two K40 User IDs normalize to the same numeric member number; resolve the collision on the device first.");
  const now = new Date();
  return await db.transaction(async tx => {
    // Serial member numbers must remain unique even after explicit K40 imports.
    await tx.execute(sql`select pg_advisory_xact_lock(891552013)`);
    await tx.insert(gymDevices).values({id:deviceId,name:"Gym fingerprint terminal",model:"ZKTeco K40"})
      .onConflictDoNothing();
    const oldUsers = await tx.select().from(deviceUsers).where(eq(deviceUsers.deviceId,deviceId));
    const oldById = new Map(oldUsers.map(u=>[u.userId,u]));
    const memberIds = input.users.map(u=>numericId(u.userId)).filter((n):n is number=>n!==null);
    const existing = memberIds.length ? await tx.select({id:members.id,memberNo:members.memberNo,name:members.name,archivedAt:members.archivedAt})
      .from(members).where(inArray(members.memberNo, memberIds)) : [];
    const byNumber = new Map(existing.map(m=>[m.memberNo,m]));

    const missingNumeric = input.users.filter(u=>numericId(u.userId)!==null && !byNumber.has(numericId(u.userId)!) && !oldById.get(u.userId)?.memberId);
    const newlyCreatedNumbers = new Set<number>();
    if(missingNumeric.length) {
      const inserted = await tx.insert(members).values(missingNumeric.map(u=>({
        memberNo:numericId(u.userId)!, name:u.name||`K40 User ${u.userId}`, status:"active" as const,
        // Deliberately no plan, phone, gender, dates, or fictitious membership.
        phone:null, gender:null,
      }))).onConflictDoNothing().returning({id:members.id,memberNo:members.memberNo,name:members.name,archivedAt:members.archivedAt});
      for(const m of inserted) { byNumber.set(m.memberNo,m); newlyCreatedNumbers.add(m.memberNo); }
      // A concurrent writer might have inserted an ID. Reload unresolved values.
      const unresolved = missingNumeric.map(u=>numericId(u.userId)!).filter(n=>!byNumber.has(n));
      if(unresolved.length) for(const m of await tx.select({id:members.id,memberNo:members.memberNo,name:members.name,archivedAt:members.archivedAt}).from(members).where(inArray(members.memberNo,unresolved)))byNumber.set(m.memberNo,m);
    }
    await tx.execute(sql`select setval(pg_get_serial_sequence('members','member_no'), greatest((select coalesce(max(member_no),0) from members),1),true)`);

    let imported=0,matched=0,unlinked=0,conflicts=0;
    const items: Array<typeof deviceUsers.$inferInsert> = [];
    for(const u of input.users){
      const previous=oldById.get(u.userId);
      let memberId: string|null=previous?.memberId||null;
      if(!memberId) {
        const num=numericId(u.userId);
        const known=num===null?null:byNumber.get(num);
        if(known) {
          memberId=known.id;
          if(cleanName(known.name)!==cleanName(u.name) && u.name) conflicts++;
          if (num!==null && newlyCreatedNumbers.has(num)) imported++;
          else matched++;
        } else {
          // Non-numeric K40 IDs receive an internal member number, while
          // their exact K40 User ID remains visible in the mapping.
          const [newMember]=await tx.insert(members).values({name:u.name||`K40 User ${u.userId}`,status:"active",phone:null,gender:null})
            .returning({id:members.id});
          memberId=newMember.id;
          imported++;
        }
      } else matched++;
      if(!memberId)unlinked++;
      const knownNumeric=numericId(u.userId);
      const known=knownNumeric===null?null:byNumber.get(knownNumeric);
      const mismatch=Boolean(known && u.name && cleanName(known.name)!==cleanName(u.name));
      items.push({
        deviceId,userId:u.userId,uid:u.uid,name:u.name||`K40 User ${u.userId}`,privilege:u.privilege,
        memberId,state:previous?.state==="pending_delete"?"pending_delete":previous?.state==="deleted"?"reappeared":previous?.state==="delete_failed"?"delete_failed":"present",
        nameMismatch:mismatch,lastSeenAt:now,
      });
    }
    // Preserve an existing member mapping if a concurrent sync was completed.
    for(let i=0;i<items.length;i+=150){
      await tx.insert(deviceUsers).values(items.slice(i,i+150)).onConflictDoUpdate({
        target:[deviceUsers.deviceId,deviceUsers.userId],
        set:{uid:sql`excluded.uid`,name:sql`excluded.name`,privilege:sql`excluded.privilege`,
          lastSeenAt:now,memberId:sql`coalesce(${deviceUsers.memberId},excluded.member_id)`,
          state:sql`case when ${deviceUsers.state}='pending_delete' then 'pending_delete' when ${deviceUsers.state}='deleted' then 'reappeared' when ${deviceUsers.state}='delete_failed' then 'delete_failed' else 'present' end`,
          nameMismatch:sql`excluded.name_mismatch`},
      });
    }
    // Missing accounts are shown as missing, never automatically deleted from the website.
    if(ids.length)await tx.update(deviceUsers).set({state:"missing"})
      .where(and(eq(deviceUsers.deviceId,deviceId),sql`${deviceUsers.userId} not in (${sql.join(ids.map(id=>sql`${id}`), sql`, `)})`,eq(deviceUsers.state,"present")));
    else await tx.update(deviceUsers).set({state:"missing"}).where(and(eq(deviceUsers.deviceId,deviceId),eq(deviceUsers.state,"present")));
    await tx.update(gymDevices).set({lastSeenAt:now,lastInventoryAt:now,lastError:null}).where(eq(gymDevices.id,deviceId));
    return {received:input.users.length,imported,matched,conflicts,unlinked};
  });
}

export async function heartbeatK40(deviceId:string,connected:boolean,reason?:string){
  await db.insert(gymDevices).values({id:deviceId,name:"Gym fingerprint terminal",model:"ZKTeco K40",lastSeenAt:connected?new Date():null,lastError:connected?null:(reason||"Device unreachable").slice(0,250)})
    .onConflictDoUpdate({target:gymDevices.id,set:{lastSeenAt:connected?new Date():sql`${gymDevices.lastSeenAt}`,lastError:connected?null:(reason||"Device unreachable").slice(0,250)}});
}

/** Claim one command with an atomic SKIP LOCKED operation and a unique lease token. */
export async function claimK40Command(deviceId:string) {
  // Stale commands are retried only up to three attempts. Deletions are
  // idempotent and the agent MUST verify BOTH user_id and uid before deleting.
  await db.update(deviceCommands).set({status:"failed",lastError:"Connector did not confirm completion after three attempts."})
    .where(and(eq(deviceCommands.deviceId,deviceId),eq(deviceCommands.status,"running"),sql`${deviceCommands.leaseUntil} < now()`,sql`${deviceCommands.attempts} >= 3`));
  const token=randomUUID();
  const response=await db.execute(sql`
    update device_commands set status='running', attempts=attempts+1,
      lease_token=${token}::uuid, lease_until=now()+interval '3 minutes'
    where id=(select id from device_commands where device_id=${deviceId}
      and (status='pending' or (status='running' and lease_until < now() and attempts < 3))
      order by created_at asc for update skip locked limit 1)
    returning id,type,target_user_id as "userId",target_uid as "uid",lease_token as "leaseToken"
  `);
  const row=response.rows[0] as {id:string,type:string,userId:string,uid:number,leaseToken:string}|undefined;
  return row||null;
}

export const commandAckSchema=z.object({id:z.string().uuid(),leaseToken:z.string().uuid(),success:z.boolean(),error:z.string().max(500).optional()});
export async function acknowledgeK40(deviceId:string,input:z.infer<typeof commandAckSchema>){
  return db.transaction(async tx=>{
    const [row]=await tx.select().from(deviceCommands).where(and(eq(deviceCommands.id,input.id),eq(deviceCommands.deviceId,deviceId))).limit(1);
    if(!row||row.status!=="running"||row.leaseToken!==input.leaseToken)throw new ApiError(409,"Command lease expired or invalid.");
    const nextState=input.success?"succeeded":"failed";
    await tx.update(deviceCommands).set({status:nextState,completedAt:new Date(),leaseToken:null,leaseUntil:null,lastError:input.success?null:(input.error||"Unknown device failure")}).where(eq(deviceCommands.id,row.id));
    if(row.type==="delete_user"){
      await tx.update(deviceUsers).set({state:input.success?"deleted":"delete_failed"}).where(and(eq(deviceUsers.deviceId,deviceId),eq(deviceUsers.userId,row.targetUserId)));
    }
    return {status:nextState};
  });
}

/** The website archives a linked member and queues a K40 delete atomically.
 * The device operation is NOT marked successful until the connector verifies it.
 * Financial records and audit trails remain immutable. */
export async function queueK40MemberDeletion(memberId:string,confirmation:string,actor:Actor){
  if(actor.role!=="owner" && actor.role!=="admin")throw new ApiError(403,"Only owner/admin can delete device users.");
  return db.transaction(async tx=>{
    const [member]=await tx.select().from(members).where(and(eq(members.id,memberId),isNull(members.archivedAt))).limit(1);
    if(!member)throw new ApiError(404,"Member is not available.");
    const linked=await tx.select().from(deviceUsers).where(and(eq(deviceUsers.memberId,memberId),sql`${deviceUsers.state} in ('present','missing','delete_failed')`));
    if(linked.length!==1)throw new ApiError(409,"Expected exactly one linked device user. Resolve the mapping in Devices first.");
    const deviceUser=linked[0];
    if(deviceUser.privilege!==0)throw new ApiError(403,"Device administrator accounts cannot be removed remotely.");
    if(confirmation!==`DELETE ${deviceUser.userId}`)throw new ApiError(422,`Type DELETE ${deviceUser.userId} to confirm permanent K40 deletion.`);
    const [command]=await tx.insert(deviceCommands).values({deviceId:deviceUser.deviceId,memberId,
      type:"delete_user",targetUserId:deviceUser.userId,targetUid:deviceUser.uid,requestedBy:actor.id}).returning();
    await tx.update(deviceUsers).set({state:"pending_delete"}).where(eq(deviceUsers.id,deviceUser.id));
    await tx.update(members).set({archivedAt:new Date(),status:"inactive",updatedAt:new Date()}).where(eq(members.id,memberId));
    await tx.insert(auditLogs).values({actorId:actor.id,action:"device_delete_queued",entity:"members",entityId:memberId,
      detail:{commandId:command.id,deviceId:deviceUser.deviceId,userId:deviceUser.userId,uid:deviceUser.uid}});
    return {commandId:command.id,status:"pending",message:"Member archived in the website. Device deletion is queued and awaits the K40 connector."};
  });
}

export async function getK40Dashboard(page=1,search="",state="all"){
  const deviceId=process.env.K40_DEVICE_ID||"gym-k40-01";
  const safePage=Math.max(1,Math.min(100000,Math.trunc(page)||1));
  const allowedStates=["all","present","missing","pending_delete","delete_failed","deleted","reappeared"];
  if(!allowedStates.includes(state))state="all";
  const searchTerm=`%${search.slice(0,80).replace(/[\\%_]/g,"\\$&")}%`;
  const [device]=await db.select().from(gymDevices).where(eq(gymDevices.id,deviceId)).limit(1);
  const [summary]=await db.select({
    total:sql<number>`count(*) filter (where ${deviceUsers.state} != 'deleted')::int`,
    missing:sql<number>`count(*) filter (where ${deviceUsers.state} = 'missing')::int`,
    mismatch:sql<number>`count(*) filter (where ${deviceUsers.nameMismatch})::int`,
  }).from(deviceUsers).where(eq(deviceUsers.deviceId,deviceId));
  const conditions=[eq(deviceUsers.deviceId,deviceId)];
  if(state!=="all") conditions.push(eq(deviceUsers.state,state));
  if(search.trim())conditions.push(or(ilike(deviceUsers.name,searchTerm),ilike(deviceUsers.userId,searchTerm))!);
  const where=and(...conditions);
  const [{total:filteredTotal}]=await db.select({total:count()}).from(deviceUsers).where(where);
  const users=await db.select({id:deviceUsers.id,userId:deviceUsers.userId,uid:deviceUsers.uid,name:deviceUsers.name,
    memberId:deviceUsers.memberId,memberName:members.name,memberNo:members.memberNo,
    status:deviceUsers.state,privilege:deviceUsers.privilege,nameMismatch:deviceUsers.nameMismatch,
    lastSeenAt:deviceUsers.lastSeenAt})
    .from(deviceUsers).leftJoin(members,eq(deviceUsers.memberId,members.id)).where(where)
    .orderBy(asc(deviceUsers.uid)).limit(20).offset((safePage-1)*20);
  const commands=await db.select({id:deviceCommands.id,type:deviceCommands.type,targetUserId:deviceCommands.targetUserId,
    status:deviceCommands.status,attempts:deviceCommands.attempts,lastError:deviceCommands.lastError,
    createdAt:deviceCommands.createdAt,completedAt:deviceCommands.completedAt})
    .from(deviceCommands).where(eq(deviceCommands.deviceId,deviceId)).orderBy(desc(deviceCommands.createdAt)).limit(30);
  const lastSeen=device?.lastSeenAt?.getTime()||0;
  return {configured:!!process.env.K40_AGENT_TOKEN,device:device||null,online:Date.now()-lastSeen<150000 && !device?.lastError,
    users,page:safePage,total:Number(filteredTotal||0),commands,
    counts:{total:Number(summary?.total||0),missing:Number(summary?.missing||0),
      pending:commands.filter(c=>c.status==="pending"||c.status==="running").length,mismatch:Number(summary?.mismatch||0)}};
}

export async function hasK40UserForMember(memberId:string){
  const rows=await db.select({id:deviceUsers.id}).from(deviceUsers).where(and(eq(deviceUsers.memberId,memberId),sql`${deviceUsers.state} not in ('deleted')`)).limit(1);
  return rows.length>0;
}
