"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, ChevronDown } from "lucide-react";
import { api, useDebounced, usePagedResource } from "./hooks";
import type { RowData } from "./ui";

export function RecordPicker({kind,value,onChange,required=false,disabled=false,activeOnly=false}:{kind:"member"|"locker";value:string;onChange:(value:string)=>void;required?:boolean;disabled?:boolean,activeOnly?:boolean}){
  const [query,setQuery]=useState(""),[open,setOpen]=useState(false),[selected,setSelected]=useState("");
  const input=useRef<HTMLInputElement>(null);
  const term=useDebounced(query);
  const resource=kind==="member"?"members":"lockers";
  const {rows,isLoading}=usePagedResource<RowData>(resource,1, {search:term,...(kind==="locker"?{status:"available"}:activeOnly?{status:"active"}:{})});
  useEffect(()=>{
    if(!value){setSelected("");return;}
    if(kind==="member"){
      api<{items:RowData[]}>(`/api/resources/members?page=1&memberId=${encodeURIComponent(value)}`).then(r=>{
        const r0=r.items?.[0];if(r0)setSelected(`#${r0.memberNo} - ${r0.name}`);
      }).catch(()=>{});
    }
  },[value,kind]);
  const options=useMemo(()=>rows.filter(r=>kind==="locker"?r.status==="available":!activeOnly||r.membershipStatus==="active"),[rows,kind,activeOnly]);
  const label=(r:RowData)=>kind==="member"?`#${r.memberNo} - ${r.name}`:`Locker ${r.number} - ${r.zone}`;
  return <div className="record-picker" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setOpen(false)}}>
    <div className="record-picker-input"><Search size={15}/><input ref={input} value={open?query:selected} disabled={disabled} required={required&&!value} placeholder={`Search ${kind==="member"?"member name or ID":"available lockers"}...`} onFocus={()=>{setOpen(true);setQuery("")}} onChange={e=>{onChange("");setQuery(e.target.value);setOpen(true)}} autoComplete="off"/><ChevronDown size={14}/></div>
    {open&&<div className="record-picker-list" role="listbox">{isLoading&&<p className="muted font-xs">Loading...</p>}{!isLoading&&options.length===0&&<p className="muted font-xs">No matching {resource} found</p>}{options.map(r=><button type="button" role="option" aria-selected={value===r.id} key={r.id} onMouseDown={e=>e.preventDefault()} onClick={()=>{onChange(r.id);setSelected(label(r));setQuery("");setOpen(false)}}>{label(r)}</button>)}{rows.length>=20&&<small>Type to search more records</small>}</div>}
  </div>;
}
