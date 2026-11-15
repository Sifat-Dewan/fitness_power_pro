"use client";
import { useEffect, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Fingerprint, ShieldCheck, Wifi, WifiOff, Users, TriangleAlert, Clock3, RefreshCw, CheckCircle2, Trash2 } from "lucide-react";
import { api, useDebounced } from "./hooks";
import { Badge, Button, Empty, PageHead, SearchBox, Pager } from "./ui";
import { shortDate } from "@/lib/utils";

export type DeviceView={
  configured:boolean;
  device: {id:string,name:string,model:string,lastSeenAt:string|null,lastInventoryAt:string|null,lastError:string|null}|null;
  online:boolean;
  page:number;total:number;users:Array<{id:string,userId:string,uid:number,name:string,memberId:string|null,memberName:string|null,
    memberNo:number|null,status:string,privilege:number,nameMismatch:boolean,lastSeenAt:string}>;
  commands:Array<{id:string,type:string,targetUserId:string,status:string,attempts:number,lastError:string|null,
    createdAt:string,completedAt:string|null}>;
  counts:{total:number,missing:number,pending:number,mismatch:number};
};

function timeLabel(date?:string|null){return date?new Date(date).toLocaleString("en-BD",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Dhaka"}):"Not yet"}
export function K40DevicesPage(){
  const [query,setQuery]=useState("");
  const [status,setStatus]=useState("all");
  const [page,setPage]=useState(1);
  const search=useDebounced(query);
  useEffect(()=>setPage(1),[search,status]);
  const params=new URLSearchParams({page:String(page),search,status});
  const {data,error,isLoading,mutate}=useSWR<DeviceView>(`/api/k40/status?${params.toString()}`,api,{refreshInterval:30000,revalidateOnFocus:true});
  const users=data?.users||[];
  return <div className="k40-page">
    <PageHead eyebrow="BIOMETRIC DEVICE INTEGRATION" title="Fingerprint Devices" subtitle="K40 user inventory, membership linking and verified hardware operations." actions={<Button onClick={()=>void mutate()}><RefreshCw size={15}/> Refresh status</Button>}/>
    <div className="k40-summary">
      <div className="panel k40-stat"><small>Connector & terminal</small><div className="k40-stat-number">{data?.online?<Wifi color="var(--green)" size={25}/>:<WifiOff color="var(--orange)" size={25}/>} {data?.online?"Online":"Offline"}</div><span className="muted font-xs">Last response: {timeLabel(data?.device?.lastSeenAt)}</span></div>
      <div className="panel k40-stat"><small>K40 user accounts</small><div className="k40-stat-number">{data?.counts.total??"—"}</div><span className="muted font-xs">From the latest device inventory</span></div>
      <div className="panel k40-stat"><small>Needs review</small><div className="k40-stat-number">{data?(data.counts.missing+data.counts.mismatch):"—"}</div><span className="muted font-xs">Missing IDs or different profile names</span></div>
      <div className="panel k40-stat"><small>Commands waiting</small><div className="k40-stat-number">{data?.counts.pending??"—"}</div><span className="muted font-xs">Deletion is verified by the physical K40</span></div>
    </div>
    {!data?.configured&&<div className="notice warning space-top"><TriangleAlert size={17}/> The connector token is not configured on the website. See <code>INTEGRATE-K40.md</code> for setup.</div>}
    {data?.device?.lastError&&<div className="notice warning space-top"><TriangleAlert size={17}/> Device reported an error: {data.device.lastError}</div>}
    <div className="panel pad space-top"><div className="k40-title"><Fingerprint size={20} color="var(--accent)"/><div><strong>How new member enrollment works</strong><p className="muted">Enroll the fingerprint on your K40 first and assign the User ID and name there. The gym connector imports the same ID automatically; then open Members to add phone, gender, plan and photo. No fingerprint template is copied to Neon.</p></div></div>
      <div className="k40-steps"><span><CheckCircle2 size={15}/> Enroll on K40</span><span><RefreshCw size={15}/> Agent synchronizes</span><span><Users size={15}/> Complete member profile</span></div>
      <p className="muted font-xs" style={{marginTop:12}}>The User ID is the member number when it is numeric. UID is the device's separate internal identifier. Fingerprint enrollment itself is not inferred from a user record.</p>
    </div>
    <div className="panel space-top" style={{overflow:"hidden"}}>
      <div className="k40-table-head"><div><h2 className="section-title">K40 user directory</h2><p className="muted font-xs">Last full inventory: {timeLabel(data?.device?.lastInventoryAt)}</p></div><div className="k40-search"><SearchBox value={query} onChange={setQuery} placeholder="Find name or K40 ID"/><select className="select" value={status} onChange={e=>setStatus(e.target.value)} aria-label="Device user status"><option value="all">All</option><option value="present">Present</option><option value="missing">Missing</option><option value="pending_delete">Pending deletion</option><option value="delete_failed">Delete failed</option><option value="reappeared">Reappeared</option><option value="deleted">Deleted</option></select></div></div>
      {error?<div className="notice warning">{error.message}</div>:isLoading?<p className="muted" style={{padding:20}}>Loading K40 directory…</p>:!users.length?<Empty title="No device users yet" detail="Run the Python connector in the gym to synchronize the terminal's user inventory."/>:
      <div className="k40-scroll"><table className="k40-table"><thead><tr><th>K40 User ID</th><th>Internal UID</th><th>Device name</th><th>Website member</th><th>Device status</th></tr></thead><tbody>{users.map(u=><tr key={u.id}><td className="strong">{u.userId}</td><td>{u.uid}</td><td>{u.name} {u.privilege!==0&&<Badge status="warning" text="Device admin"/>}{u.nameMismatch&&<span title="Device and website names differ"><TriangleAlert size={13} color="var(--orange)"/></span>}</td><td>{u.memberId?<Link href={`/members?search=${encodeURIComponent(String(u.memberNo||u.userId))}`} className="k40-link">{u.memberName||"Linked member"} #{u.memberNo}</Link>:<span className="muted">Not linked</span>}</td><td><Badge status={u.status==="present"?"active":u.status==="deleted"?"inactive":u.status==="pending_delete"?"pending":"warning"} text={u.status.replaceAll("_"," ")}/></td></tr>)}</tbody></table></div>}
      <div className="grid-pager"><Pager page={page} total={data?.total||0} onChange={setPage}/></div>
    </div>
    <div className="panel space-top" style={{overflow:"hidden"}}><div className="k40-table-head"><div><h2 className="section-title">Recent device commands</h2><p className="muted font-xs">Pending commands are not completed until the connector confirms a result.</p></div><ShieldCheck size={19} color="var(--accent)"/></div>
      {data?.commands.length?<div className="k40-scroll"><table className="k40-table"><thead><tr><th>Action</th><th>K40 ID</th><th>Queued</th><th>Status</th><th>Result</th></tr></thead><tbody>{data.commands.map(c=><tr key={c.id}><td><Trash2 size={13} style={{verticalAlign:"middle"}}/> Delete user</td><td className="strong">{c.targetUserId}</td><td>{timeLabel(c.createdAt)}</td><td><Badge status={c.status==="succeeded"?"active":c.status==="failed"?"expired":"pending"} text={c.status}/></td><td className="muted font-xs">{c.lastError|| (c.completedAt?timeLabel(c.completedAt):"Awaiting connector")}</td></tr>)}</tbody></table></div>:<div className="muted" style={{padding:20}}>No device commands yet.</div>}
    </div>
    <div className="notice space-top"><Clock3 size={16}/> If the gym computer is switched off, new enrollments will appear after it reconnects. Physical deletion commands remain pending until verified.</div>
  </div>;
}
