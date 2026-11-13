/**
 * Import actual historical gym records. Read carefully before --apply.
 * Default is audit/dry-run. No fabricated people, payments, or expenses.
 * Re-runs skip existing stable IDs, keeping edits made since the first import.
 */
import { config } from "dotenv";
config({path: ".env.local", override: true});
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import Papa from "papaparse";

const folder = process.env.LEGACY_IMPORT_DIR || "private/legacy";
const apply = process.argv.includes("--apply");
const blank = (v: unknown) => String(v ?? "").trim();
function readCSV(name: string) {
  const raw = readFileSync(resolve(folder, name), "utf8");
  const parsed = Papa.parse<Record<string, string>>(raw.replace(/^\uFEFF/, ""), {header: true, skipEmptyLines: true});
  if (parsed.errors.length) throw new Error(`${name}: ${parsed.errors[0].message}`);
  return parsed.data;
}
function idFor(kind:string, sourceId:string) {
  const b = createHash("sha256").update(`fitness-power-legacy-v1:${kind}:${sourceId}`).digest("hex");
  return `${b.slice(0,8)}-${b.slice(8,12)}-5${b.slice(13,16)}-a${b.slice(17,20)}-${b.slice(20,32)}`;
}
function bdDate(value: string):string {
  const date = new Date(value);
  if(!Number.isFinite(date.getTime()))throw new Error(`Invalid historic date: ${value}`);
  // Original records use UTC timestamps for Dhaka-local calendar boundaries.
  const parts=new Intl.DateTimeFormat("en-US", {timeZone:"Asia/Dhaka",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);
  const part=(kind:string)=>parts.find(x=>x.type===kind)?.value||"";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function checkDate(value: string) {const d = new Date(value);if(!Number.isFinite(d.getTime()))throw new Error(`Invalid timestamp: ${value}`);return d;}
function money(value:string):number {const n=Number(value);if(!Number.isSafeInteger(n)||n<0)throw new Error(`Invalid amount: ${value}`);return n;}
function inChunks<T>(rows:T[], size=100){const out:T[][]=[];for(let i=0;i<rows.length;i+=size)out.push(rows.slice(i,i+size));return out;}
async function main(){
 const planRows=readCSV("MembershipPlan.csv"),memberRows=readCSV("Member.csv"),costRows=readCSV("CostRecord.csv");
 function assertUnique(rows:Record<string,string>[], title:string){const seen=new Set<string>();for(const row of rows){if(!blank(row._id)||seen.has(row._id))throw new Error(`Missing/duplicate ${title} _id`);seen.add(row._id)}}
 assertUnique(planRows,"plan");assertUnique(memberRows,"member");assertUnique(costRows,"cost");
 const plansById=new Map(planRows.map(p=>[p._id,p]));
 const membersById=new Map(memberRows.map(m=>[m._id,m]));
 const memberNos=new Set<string>();let duplicateMemberNos=0,invalidPhones=0,missingGenders=0,externalImages=0;
 for(const row of memberRows){
   if(!plansById.has(row.membershipPlanId))throw new Error(`Unknown plan reference for member source ${row._id}`);
   if(memberNos.has(row.memberId))duplicateMemberNos++;
   memberNos.add(row.memberId);
   if(!/^01\d{9}$/.test(blank(row.phone)))invalidPhones++;
   if(!blank(row.gender))missingGenders++;
   if(blank(row.image)&&!blank(row.image).startsWith("https://res.cloudinary.com/"))externalImages++;
   bdDate(row.startDate);bdDate(row.endDate);checkDate(row.createdAt);
 }
 const linkedCost = costRows.filter(c=>Boolean(c.memberId));
 const missingCost = costRows.filter(c=>!c.memberId);
 for(const cost of costRows){money(cost.cost);checkDate(cost.createdAt);if(cost.memberId && !membersById.has(cost.memberId))throw new Error(`Cost ${cost._id} references unavailable member`)}
 const totalCost=costRows.reduce((s,c)=>s+money(c.cost),0);
 const linkedTotal=linkedCost.reduce((s,c)=>s+money(c.cost),0);
 console.log(JSON.stringify({mode:apply?"APPLY":"DRY RUN",membershipPlans:planRows.length,members:memberRows.length,legacyCosts:costRows.length,linkedPayments:linkedCost.length,unattributedLegacyCosts:missingCost.length,allLegacyRevenueBDT:totalCost,linkedRevenueBDT:linkedTotal,unattributedRevenueBDT:totalCost-linkedTotal,duplicateLegacyMemberNumbers:duplicateMemberNos,missingOrInvalidMemberPhones:invalidPhones,missingGenders,nonCloudinaryMemberImages:externalImages},null,2));
 if(!apply){console.log("DRY RUN only: No database was modified. Review the counts, back up Neon, then run with --apply.");return;}
 if(process.env.DEMO_MODE==="true")throw new Error("Set DEMO_MODE=false before importing actual records.");
 if(!process.env.DATABASE_URL?.startsWith("postgresql://"))throw new Error("Valid DATABASE_URL missing.");
 // Avoid importing to an unintended database without an explicit acknowledgement.
 if(process.env.ALLOW_LEGACY_IMPORT!=="I_HAVE_BACKED_UP_NEON")throw new Error("Create a Neon branch/backup; then set ALLOW_LEGACY_IMPORT=I_HAVE_BACKED_UP_NEON in .env.local");
 const [{db},{plans,members,memberships,payments,legacyCostRecords,legacyMemberSources}] = await Promise.all([import("../src/db"),import("../src/db/schema")]);
 const {eq,sql} = await import("drizzle-orm");
 const currentPlans=await db.select({id:plans.id,name:plans.name}).from(plans);
 const existingNames=new Map(currentPlans.map(p=>[p.name.trim().toLowerCase(),p.id]));
 const planIds=new Map<string,string>();
 const planValues: Array<typeof plans.$inferInsert>=[];
 for(const p of planRows){const name=blank(p.name);if(!name)throw new Error(`Unnamed plan ${p._id}`);const duration=Number(p.durationInMonth);if(!Number.isSafeInteger(duration)||duration<1||duration>120)throw new Error(`Invalid duration for plan ${p._id}`);const known=existingNames.get(name.toLowerCase());const id=known||idFor("plan",p._id);planIds.set(p._id,id);if(!known)planValues.push({id,name,durationMonths:duration,price:money(p.price),description:"Imported from previous gym system",color:"#e63946",active:true});}
 for(const batch of inChunks(planValues)) await db.insert(plans).values(batch).onConflictDoNothing();
 const existing = await db.select({id:members.id,memberNo:members.memberNo}).from(members);
 const reserved = new Set(existing.map(m=>m.memberNo));
 const wanted = new Map<string,number>();
 const numericGroups=new Map<number,number>();
 const fallbackStart=Math.max(900000,...existing.map(r=>r.memberNo+1));
 for(let i=0;i<memberRows.length;i++){
   const r=memberRows[i],id=idFor("member",r._id),n=Number(r.memberId);
   const conflict=(existing.some(x=>x.memberNo===n && x.id!==id));
   const duplicate=(numericGroups.get(n)||0)>0;
   numericGroups.set(n,(numericGroups.get(n)||0)+1);
   const assigned=!Number.isSafeInteger(n)||n<=0||conflict||duplicate?fallbackStart+i:n;
   wanted.set(r._id,assigned);
   if(reserved.has(assigned) && !existing.some(x=>x.id===id&&x.memberNo===assigned))throw new Error(`Member number collision for ${r._id}`);
   reserved.add(assigned);
 }
 const memValues: Array<typeof members.$inferInsert>=[];
 const sourceValues: Array<typeof legacyMemberSources.$inferInsert>=[];
 const historyValues: Array<typeof memberships.$inferInsert>=[];
 for(const r of memberRows){
   const id=idFor("member",r._id),planId=planIds.get(r.membershipPlanId)!;
   const phone=blank(r.phone),gender=blank(r.gender).toLowerCase();
   const image=blank(r.image);
   const start=bdDate(r.startDate),end=bdDate(r.endDate);
   memValues.push({id,memberNo:wanted.get(r._id)!,name:blank(r.name),phone:/^01\d{9}$/.test(phone)?phone:null,address:blank(r.address)||null,gender:["male","female","other"].includes(gender)?gender:null,imageUrl:image.startsWith("https://res.cloudinary.com/")?image:null,planId,startDate:start,expireDate:end,status:"active",joinedAt:checkDate(r.createdAt),notes:(blank(r.phone)&&!/^01\d{9}$/.test(phone)?"Legacy phone requires review. ":"")+(wanted.get(r._id)!==Number(r.memberId)?`Original member number: ${r.memberId}. `:"")||null});
   sourceValues.push({sourceId:r._id,memberId:id,originalMemberNo:r.memberId,originalData:r});
   const plan=plansById.get(r.membershipPlanId)!;
   historyValues.push({id:idFor("membership",r._id),memberId:id,planId,startsOn:start,expiresOn:end,planPrice:money(plan.price),type:"legacy_import",note:"Current membership period imported from former gym database; historical periods were not supplied."});
 }
 for(const chunk of inChunks(memValues))await db.insert(members).values(chunk).onConflictDoNothing();
 for(const chunk of inChunks(sourceValues))await db.insert(legacyMemberSources).values(chunk).onConflictDoNothing();
 for(const chunk of inChunks(historyValues))await db.insert(memberships).values(chunk).onConflictDoNothing();
 const costValues: Array<typeof legacyCostRecords.$inferInsert>=costRows.map(r=>({sourceId:r._id,originalMemberId:blank(r.memberId)||null,memberId:r.memberId?idFor("member",r.memberId):null,amount:money(r.cost),type:r.type,recordedAt:checkDate(r.createdAt),importedAsPayment:Boolean(r.memberId)}));
 const paymentValues: Array<typeof payments.$inferInsert>=linkedCost.map(r=>({id:idFor("payment",r._id),memberId:idFor("member",r.memberId),amount:money(r.cost),method:"unknown",type:r.type==="RENEW_MEMBERSHIP_PLAN"?"renewal":"membership",reference:`LEGACY:${r._id}`,note:"Imported historical payment; payment method not provided by old system.",paidAt:checkDate(r.createdAt)}));
 for(const chunk of inChunks(paymentValues))await db.insert(payments).values(chunk).onConflictDoNothing();
 for(const chunk of inChunks(costValues))await db.insert(legacyCostRecords).values(chunk).onConflictDoNothing();
 await db.execute(sql`select setval(pg_get_serial_sequence('members','member_no'), (select greatest(coalesce(max(member_no),1),1) from members), true)`);
 const [{memberTotal}]=await db.select({memberTotal:sql<number>`count(*)::int`}).from(members);
 const [{archiveTotal}]=await db.select({archiveTotal:sql<number>`count(*)::int`}).from(legacyCostRecords);
 console.log(JSON.stringify({status:"IMPORT FINISHED",databaseMembers:Number(memberTotal),archivedLegacyTransactions:Number(archiveTotal),warning:"Unattributed legacy costs remain in legacy_cost_records; do not add them as member payments without source reconciliation."},null,2));
}
main().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
