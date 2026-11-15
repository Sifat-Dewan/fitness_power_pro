import { NextRequest } from "next/server";
import Papa from "papaparse";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { members, plans, auditLogs } from "@/db/schema";
import { demoEnabled, requireActor, ApiError } from "@/lib/permissions";
import { demoList, demoCreate, demoPatch } from "@/lib/demo";
import { sameOrigin, success, failure } from "@/lib/http";
export const runtime="nodejs";

type Input={member_no?:string,name:string,phone?:string,email?:string,gender?:string,plan?:string,start_date?:string,expire_date?:string,status?:string,address?:string,notes?:string};
const dateOK=(s:string)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+"T12:00:00Z");return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s;};
export async function POST(req:NextRequest){
  try {
    sameOrigin(req);const actor=await requireActor("delete"); // Bulk import is manager/admin-only.
    const form=await req.formData(),file=form.get("file"),dryRun=form.get("dryRun")==="true";
    if(!(file instanceof File))throw new ApiError(422,"Choose a .csv file.");
    if(file.size>2*1024*1024)throw new ApiError(422,"CSV must be under 2 MB (1500 records maximum).");
    if(!file.name.toLowerCase().endsWith(".csv"))throw new ApiError(422,"Only .csv files are accepted.");
    const parsed=Papa.parse<Input>(await file.text(),{header:true,skipEmptyLines:"greedy",transformHeader:s=>s.trim().toLowerCase().replaceAll(" ","_").replace(/^\ufeff/,"")});
    if(parsed.errors.length)throw new ApiError(422,`CSV error at row ${parsed.errors[0].row||1}: ${parsed.errors[0].message}`);
    if(parsed.data.length>1500)throw new ApiError(422,"Import at most 1500 rows per file.");
    if(!parsed.meta.fields || !["member_no","name"].every(field=>parsed.meta.fields?.includes(field)))throw new ApiError(422,"Required CSV columns: member_no, name. Phone, gender and membership are optional during K40 reconciliation.");
    const [planRows,memberRows] = demoEnabled() ? [demoList("plans"),demoList("members")] : await Promise.all([db.select().from(plans),db.select({memberNo:members.memberNo}).from(members)]);
    const planMap=new Map(planRows.map(p=>[String(p.name).trim().toLowerCase(),p]));
    const existingNos=new Set(memberRows.map(m=>Number(m.memberNo)));
    const fileNos=new Set<number>();
    const valid:Array<{value:any,line:number}>=[],errors:Array<string>=[];let skipped=0;
    parsed.data.forEach((row,i)=>{
      const line=i+2,name=(row.name||"").trim(),plan=(row.plan||"").trim(),start=(row.start_date||"").trim(),end=(row.expire_date||"").trim();
      const match=planMap.get(plan.toLowerCase());const num=row.member_no?.trim()?Number(row.member_no):null;
      if(num===null || !Number.isInteger(num)||num<=0||num>2147483646){errors.push(`Row ${line}: member_no is required and must be a positive numeric ID`);return;}
      if(num!==null && (existingNos.has(num)||fileNos.has(num))){skipped++;return;}
      if(!name||name.length>180){errors.push(`Row ${line}: name is required (max 180 characters)`);return;}
      if(plan&&!match){errors.push(`Row ${line}: plan "${plan}" does not match a plan in Membership Plans`);return;}
      if(plan&&(!dateOK(start)||!dateOK(end)||end<start)){errors.push(`Row ${line}: plan requires valid start_date / expire_date (YYYY-MM-DD)`);return;}
      if(!plan&&(start||end)&&(!dateOK(start)||!dateOK(end)||end<start)){errors.push(`Row ${line}: incomplete or invalid dates`);return;}
      const phone=(row.phone||"").trim();
      if(phone&&!/^01[0-9]{9}$/.test(phone)){errors.push(`Row ${line}: if present, phone must be 11 digits beginning with 01`);return;}
      if(row.gender?.trim()&&!["male","female","other"].includes(row.gender.toLowerCase())){errors.push(`Row ${line}: invalid gender (male, female or other)`);return;}
      const gender=(row.gender||"").toLowerCase();
      const status=["active","frozen","inactive"].includes(row.status||"")?row.status:"active";
      const value={memberNo:num,name,phone:phone||null,email:row.email?.slice(0,200)||null,gender:gender||null,
        planId:match?.id||null,startDate:start||null,expireDate:end||null,status,
        address:row.address?.slice(0,1000)||null,notes:row.notes?.slice(0,2000)||null};
      valid.push({value,line});if(num!==null)fileNos.add(num);
    });
    if(errors.length)return success({valid:false,total:parsed.data.length,willImport:valid.length,skipped,errors:errors.slice(0,20)});
    if(dryRun)return success({valid:true,total:parsed.data.length,willImport:valid.length,skipped,errors:[],sample:valid.slice(0,5).map(({value})=>({memberNo:value.memberNo||"auto",name:value.name,plan:planRows.find(p=>p.id===value.planId)?.name,startDate:value.startDate,expireDate:value.expireDate}))});
    if(!valid.length)return success({imported:0,skipped,total:parsed.data.length});
    if(demoEnabled()){
      for(const {value} of valid){const item=demoCreate("members",{...value,planId:value.planId});demoPatch("members",item.id,{memberNo:value.memberNo||item.memberNo,expireDate:value.expireDate,startDate:value.startDate,status:value.status});}
    }else{
      await db.transaction(async tx=>{
        // Reserve explicit and automatic member numbers above every existing/imported ID.
        // This prevents collisions in files that mix numbered and unnumbered members.
        let nextNumber=Math.max(0,...memberRows.map(m=>Number(m.memberNo)),...valid.map(v=>Number(v.value.memberNo||0)))+1;
        for(const {value} of valid)await tx.insert(members).values({...value,memberNo:value.memberNo||nextNumber++});
        await tx.execute(sql`SELECT setval(pg_get_serial_sequence('members', 'member_no'), GREATEST((SELECT COALESCE(max(member_no), 1) FROM members), 1), true)`);
        await tx.insert(auditLogs).values({actorId:actor.id,action:"imported",entity:"members",detail:{count:valid.length,skipped}});
      });
    }
    return success({imported:valid.length,skipped,total:parsed.data.length});
  }catch(e){return failure(e)}
}
