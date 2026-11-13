"use client";
import {useState} from "react";
import useSWR from "swr";
import {api,useMoney} from "./hooks";
import {DataTable,ErrorState,PageHead,SkeletonPage,type RowData} from "./ui";
import {shortDate} from "@/lib/utils";

type LegacyRow=RowData & { id:string;amount:number;type:string;recordedAt:string;memberName:string|null;memberNo:number|null;linked:boolean; };
type LedgerResult={items:LegacyRow[];page:number;pageSize:number;total:number;pages:number;summary:{sum:number;unattributed:number}};
export function LegacyLedgerPage(){
  const [page,setPage]=useState(1),money=useMoney();
  const {data,error,isLoading,mutate}=useSWR<LedgerResult>(`/api/legacy-ledger?page=${page}`,api,{keepPreviousData:false,revalidateOnFocus:false});
  if(error)return <ErrorState message={error.message} retry={()=>void mutate()}/>;
  if(isLoading||!data)return <SkeletonPage/>;
  return <div><PageHead eyebrow="MIGRATED FINANCIAL HISTORY" title="Legacy revenue ledger" subtitle="Read-only original transactions from the previous gym system. Transactions without member references are preserved separately and never assigned to unrelated people."/>
    <div className="small-summary"><div className="panel"><small>Archived source records</small><strong>{data.total.toLocaleString()}</strong></div><div className="panel"><small>Historical amount</small><strong>{money(data.summary.sum)}</strong></div><div className="panel"><small>Records without member links</small><strong>{data.summary.unattributed}</strong></div></div>
    <div className="notice space-top" role="note">Linked legacy payments also appear in the main Payments page. The overview sums unattributed archive amounts separately to avoid double counting. Payment method was not included in the source export.</div>
    <div className="space-top"><DataTable rows={data.items} serverPage={page} serverTotal={data.total} onServerPageChange={setPage} columns={[{key:"recordedAt",title:"Date",render:r=>shortDate(r.recordedAt)},{key:"memberName",title:"Member",render:r=>r.memberName||"Unattributed historical record"},{key:"type",title:"Source category",render:r=>r.type.replaceAll("_"," ")},{key:"amount",title:"Amount",render:r=>money(r.amount)},{key:"linked",title:"Member match",render:r=>r.linked?"Linked":"Not provided"}]} emptyTitle="No historical records imported"/></div>
  </div>;
}
