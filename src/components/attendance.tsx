"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { can } from "@/lib/access";
import { useActor } from "./shell";
import { usePagedResource, useOverview, useDebounced, actionCommand, exportCSV } from "./hooks";
import { Badge, Button, DataTable, ErrorState, PageHead, PersonCell, SearchBox, SkeletonPage, type RowData } from "./ui";
import { SmartForm } from "./forms";
import { shortDate } from "@/lib/utils";
import { Download, Plus, LogOut } from "lucide-react";

export function AttendancePage(){
  const actor=useActor(),writable=can(actor.role,"attendance"),query=useSearchParams();
  const [search,setSearch]=useState(""),[filter,setFilter]=useState("all"),[form,setForm]=useState(false),[page,setPage]=useState(1);
  const delayed=useDebounced(search);
  const {rows,total,error,isLoading,mutate}=usePagedResource<RowData>("attendance",page,{search:delayed,status:filter});
  const {data:overview}=useOverview();
  useEffect(()=>{if(query.get("new")==="1"&&writable)setForm(true)},[query,writable]);
  useEffect(()=>setPage(1),[delayed,filter]);
  const checkOut=async(r:RowData)=>{try{await actionCommand("checkout",{attendanceId:r.id},`${r.memberName} checked out`)}catch{}};
  if(error&&!rows.length)return <ErrorState message={error.message} retry={()=>void mutate()}/>;
  return <div><PageHead eyebrow="VISITS & ACCESS" title="Attendance" subtitle="Check-in sessions automatically complete after three hours; manual checkout remains available." actions={<><Button onClick={()=>exportCSV("attendance")}><Download size={15}/> Export</Button>{writable&&<Button variant="primary" onClick={()=>setForm(true)}><Plus size={15}/> Check in member</Button>}</>}/>
    <div className="small-summary"><div className="panel"><small>Inside right now</small><strong className="positive">{overview?.currentlyInside??"-"}</strong></div><div className="panel"><small>Today's check-ins</small><strong>{overview?.todayAttendance??"-"}</strong></div><div className="panel"><small>Matching visits</small><strong>{total}</strong></div></div>
    <div className="toolbar"><div className="toolbar-left"><SearchBox value={search} onChange={setSearch} placeholder="Search member or ID..."/><select className="select" style={{width:165}} value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All visits</option><option value="inside">Currently inside</option><option value="completed">Completed visits</option></select></div><div className="toolbar-right"><span className="muted font-xs">{total} records</span></div></div>
    {isLoading&&!rows.length?<SkeletonPage/>:<DataTable rows={rows} pageSize={20} serverPage={page} serverTotal={total} onServerPageChange={setPage} columns={[{key:"memberName",title:"Member",render:r=><PersonCell name={r.memberName} image={r.memberImage} subtitle={`#${r.memberNo}`}/>},{key:"checkedInAt",title:"Check-in",render:r=><div><strong>{new Date(r.checkedInAt).toLocaleTimeString("en-BD",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Dhaka"})}</strong><div className="muted font-xs">{shortDate(r.checkedInAt)}</div></div>},{key:"checkedOutAt",title:"Check-out",render:r=>r.checkedOutAt?new Date(r.checkedOutAt).toLocaleTimeString("en-BD",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Dhaka"}):<span className="muted">-</span>},{key:"source",title:"Source",render:r=><span style={{textTransform:"capitalize"}}>{r.source}</span>},{key:"status",title:"Visit",render:r=><Badge status={r.checkedOutAt?"inactive":"active"} text={r.checkedOutAt?"Completed":"Inside"}/>}]} actions={writable?(r:RowData)=>!r.checkedOutAt?<Button size="sm" onClick={()=>void checkOut(r)}><LogOut size={14}/> Check out</Button>:<span className="muted font-xs">Complete</span>:undefined} emptyTitle="No visits to display"/>}
    <SmartForm open={form} onClose={()=>setForm(false)} title="Check in a member" description="Only members whose membership has started and has not expired can check in." fields={[{name:"memberId",label:"Member",type:"member",activeOnly:true,required:true,full:true}]} initial={{memberId:""}} submitLabel="Check in" onSubmit={async data=>actionCommand("checkin",data,"Member checked in")}/>
  </div>;
}
