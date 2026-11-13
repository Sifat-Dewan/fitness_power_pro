"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X, Search, Plus, Download, LayoutGrid, List, Inbox, LoaderCircle, Check, AlertCircle, CalendarDays, MoreHorizontal, ChevronLeft, ChevronRight, ChevronDown, ArrowUpDown, SlidersHorizontal, Trash2, Pencil, Eye, ArrowUpRight, ChevronUp, CircleHelp } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cls, initials, memberStatus, membershipUrgency, daysUntil, cloudinaryThumb } from "@/lib/utils";

export type RowData = Record<string, any>;
export function Avatar({name,image,size="md",zoomable=false}:{name?:string,image?:string|null,size?:"sm"|"md"|"lg"|"xl",zoomable?:boolean}){
  const [show,setShow]=useState(false);
  useEffect(()=>{if(!show)return;const esc=(event:KeyboardEvent)=>{if(event.key==="Escape")setShow(false)};window.addEventListener("keydown",esc);return()=>window.removeEventListener("keydown",esc)},[show]);
  const circle=<span className={`avatar ${size}`}>{image?<img src={cloudinaryThumb(image,size==="sm"?80:size==="md"?96:size==="lg"?144:208)} alt={name||"Portrait"} loading="lazy" referrerPolicy="no-referrer"/>:initials(name)}</span>;
  return <>{image&&zoomable?<button type="button" className="avatar-zoom-trigger" title={`Enlarge ${name||"portrait"} photo`} aria-label={`Enlarge ${name||"portrait"} photo`} onClick={e=>{e.stopPropagation();setShow(true)}}>{circle}</button>:circle}
    {show&&image&&typeof document!=="undefined"&&createPortal(<div className="photo-lightbox" role="dialog" aria-modal="true" aria-label={`${name||"Member"} enlarged photo`} onMouseDown={e=>{if(e.target===e.currentTarget)setShow(false)}}><button className="photo-lightbox-close" aria-label="Close photo" onClick={()=>setShow(false)}><X size={22}/></button><img src={image} alt={name||"Enlarged photo"} onClick={e=>e.stopPropagation()}/><span className="photo-lightbox-caption">{name||"Member photo"} - click outside to close</span></div>,document.body)}</>;
}
export function Badge({status,text}:{status?:string|null,text?:string}) {
  const tone=["active","available","paid","present","approved"].includes(status||"")?"success":["expired","inactive","banned","maintenance","overdue","critical"].includes(status||"")?"danger":["frozen","pending","on_leave","warning"].includes(status||"")?"warning":"info";
  const label=text||({on_leave:"On leave",occupied:"Occupied"} as Record<string,string>)[status||""]||status||"Unknown";
  return <span className={`mini-badge ${tone}`}><span className={`dot ${tone==="success"?"":tone==="danger"?"red":tone==="warning"?"orange":"gray"}`}/>{label.charAt(0).toUpperCase()+label.slice(1)}</span>;
}
export function MemberBadge({member}:{member:RowData}) { const state=membershipUrgency(member);const remaining=daysUntil(member.expireDate);const starts=daysUntil(member.startDate);
  return <Badge status={state} text={state==="pending"?`Starts in ${starts}d`:state==="critical"?`${remaining}d left`:state==="warning"?`${remaining}d left`:undefined}/>;
}
export function LockerBadge({locker}:{locker:RowData}) { const remaining=daysUntil(locker.dueOn);const urgent=locker.status==="occupied"&&locker.dueOn&&remaining<=7;
  return <Badge status={urgent?(remaining<=3?"critical":"warning"):locker.status} text={urgent?(remaining<0?`Overdue ${-remaining}d`:`${remaining}d left`):undefined}/>;
}
export function Button({children,onClick,variant="secondary",size="md",type="button",disabled=false,className="",title}: {children:ReactNode,onClick?:()=>void,variant?:"primary"|"secondary"|"ghost"|"danger",size?:"sm"|"md",type?:"button"|"submit",disabled?:boolean,className?:string,title?:string}) {
  return <button type={type} title={title} onClick={onClick} disabled={disabled} className={cls("btn",variant,size==="sm"&&"sm",className)}>{children}</button>;
}
export function PageHead({eyebrow,title,subtitle,actions}:{eyebrow?:string,title:string,subtitle?:string,actions?:ReactNode}){return <div className="page-head"><div>{eyebrow&&<div className="eyebrow">{eyebrow}</div>}<h1 className="page-title">{title}</h1>{subtitle&&<p className="page-subtitle">{subtitle}</p>}</div>{actions&&<div className="page-head-actions">{actions}</div>}</div>}
export function SectionHead({title,description,right}:{title:string,description?:string,right?:ReactNode}){return <div className="section-head"><div><h2 className="section-title">{title}</h2>{description&&<p className="section-description">{description}</p>}</div>{right}</div>}
export function SearchBox({value,onChange,placeholder="Search records..."}:{value:string,onChange:(v:string)=>void,placeholder?:string}){return <div className="searchbox"><Search size={17}/><input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder}/>{value&&<button className="table-action" onClick={()=>onChange("")} aria-label="Clear search"><X size={14}/></button>}</div>}
export function ViewSwitch({value,onChange,views=["table","grid"]}:{value:string,onChange:(v:string)=>void,views?:Array<"table"|"grid">}){return <div className="view-switch" aria-label="View mode">{views.map(v=><button key={v} className={value===v?"active":""} onClick={()=>onChange(v)} title={`${v} view`} aria-pressed={value===v}>{v==="table"?<List size={17}/>:<LayoutGrid size={17}/>}</button>)}</div>}
export function Empty({title="Nothing to show",detail="Try a different search, filter or add your first record.",icon}:{title?:string,detail?:string,icon?:ReactNode}){return <div className="empty-state"><div className="empty-icon">{icon||<Inbox size={24}/>}</div><h3>{title}</h3><p>{detail}</p></div>}
export function SkeletonPage(){return <div><div className="skeleton" style={{width:270,height:35,marginBottom:18}}/><div className="kpi-grid" style={{marginBottom:22}}>{[0,1,2,3].map(n=><div className="skeleton" key={n} style={{height:142}}/>)}</div><div className="skeleton" style={{height:340}}/></div>}
export function ErrorState({message,retry}:{message:string,retry:()=>void}){return <div className="panel pad"><Empty icon={<AlertCircle size={25}/>} title="We couldn't load this section" detail={message}/><div style={{textAlign:"center",marginTop:-30,marginBottom:22}}><Button onClick={retry}>Try again</Button></div></div>}
export function Modal({open,onClose,title,description,children,footer,drawer=false}:{open:boolean,onClose:()=>void,title?:string,description?:string,children:ReactNode,footer?:ReactNode,drawer?:boolean}){
  useEffect(()=>{if(!open)return;const onKey=(e:KeyboardEvent)=>{if(e.key==="Escape")onClose()};window.addEventListener("keydown",onKey);const old=document.body.style.overflow;document.body.style.overflow="hidden";return()=>{window.removeEventListener("keydown",onKey);document.body.style.overflow=old}},[open,onClose]);
  return <AnimatePresence>{open&&<motion.div className={cls("modal-cover",drawer&&"drawer-cover")} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><motion.div className={cls("modal",drawer&&"drawer")} role="dialog" aria-modal="true" aria-label={title||"Details"} initial={{opacity:0,y:16,scale:.99}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:12,scale:.99}} transition={{duration:.19}}>{title&&<div className="modal-header"><div><h2>{title}</h2>{description&&<p>{description}</p>}</div><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18}/></button></div>}<div className="modal-body" style={!title?{padding:0}:{}}>{children}</div>{footer&&<div className="modal-footer">{footer}</div>}</motion.div></motion.div>}</AnimatePresence>;
}
export function Confirm({open,onClose,onConfirm,title="Confirm action",detail="Are you sure you want to continue?",busy=false}:{open:boolean,onClose:()=>void,onConfirm:()=>void,title?:string,detail?:string,busy?:boolean}){return <Modal open={open} onClose={onClose} title={title} description={detail} footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="danger" onClick={onConfirm} disabled={busy}>{busy?<LoaderCircle size={15} className="spin"/>:<Trash2 size={15}/>} Confirm</Button></> }><div className="notice warning">This action may affect records that your team uses. Review the details before continuing.</div></Modal>}
export type Column<T extends RowData>={key:string,title:string,render?:(item:T)=>ReactNode,sortValue?:(item:T)=>string|number|Date|null,align?:"left"|"right",width?:number};
/** Shared accessible, numbered pagination for table and card views. */
export function Pager({page,total,pageSize=20,onChange}:{page:number,total:number,pageSize?:number,onChange:(n:number)=>void}) {
  const max=Math.max(1,Math.ceil(total/pageSize));const current=Math.max(1,Math.min(page,max));
  if(max<=1)return null;
  const pages=[...new Set([1,current-2,current-1,current,current+1,current+2,max].filter(n=>n>=1&&n<=max))].sort((a,b)=>a-b);
  const items:(number|string)[]=[];for(let i=0;i<pages.length;i++){if(i&&pages[i]-pages[i-1]>1)items.push(`gap-${i}`);items.push(pages[i])}
  return <nav className="page-buttons" aria-label="Record pages"><button disabled={current===1} onClick={()=>onChange(current-1)} aria-label="Previous page"><ChevronLeft size={16}/></button>
    {items.map(item=>typeof item==="string"?<span key={item} className="pager-ellipsis">...</span>:<button key={item} aria-label={`Page ${item}`} aria-current={item===current?"page":undefined} className={item===current?"active":""} onClick={()=>onChange(item)}>{item}</button>)}
    <button disabled={current===max} onClick={()=>onChange(current+1)} aria-label="Next page"><ChevronRight size={16}/></button></nav>;
}
export function DataTable<T extends RowData>({rows,columns,onRowClick,actions,pageSize=20,emptyTitle="No records found",selectable=false,selected=[],onSelectionChange,serverPage,serverTotal,onServerPageChange}:{rows:T[],columns:Column<T>[],onRowClick?:(item:T)=>void,actions?:(item:T)=>ReactNode,pageSize?:number,emptyTitle?:string,selectable?:boolean,selected?:string[],onSelectionChange?:(ids:string[])=>void,serverPage?:number,serverTotal?:number,onServerPageChange?:(n:number)=>void}) {
  const [sortKey,setSortKey]=useState<string|null>(null),[sortAsc,setSortAsc]=useState(true),[page,setPage]=useState(1);
  const server=serverPage!==undefined&&serverTotal!==undefined&&Boolean(onServerPageChange);
  const sorted=server?rows:[...rows].sort((a,b)=>{if(!sortKey)return 0;const c=columns.find(c=>c.key===sortKey),aa=c?.sortValue?c.sortValue(a):a[sortKey],bb=c?.sortValue?c.sortValue(b):b[sortKey];const n=typeof aa==="number"&&typeof bb==="number"?aa-bb:String(aa??"").localeCompare(String(bb??""),undefined,{numeric:true});return n*(sortAsc?1:-1)});
  const maxPage=Math.max(1,Math.ceil((server?serverTotal:rows.length)/pageSize)),currentPage=server?Math.min(serverPage,maxPage):Math.min(page,maxPage);
  const view=server?sorted:sorted.slice((currentPage-1)*pageSize,currentPage*pageSize);
  const total=server?serverTotal:rows.length;
  const toggleAll=(checked:boolean)=>onSelectionChange?.(checked?[...new Set([...selected,...view.map(r=>String(r.id))])]:selected.filter(id=>!view.some(r=>String(r.id)===id)));
  return <div className="panel table-panel">{rows.length>0?<div className="table-scroll"><table className="data-table"><thead><tr>{selectable&&<th style={{width:34}}><input className="select-checkbox" type="checkbox" aria-label="Select visible rows" checked={view.length>0&&view.every(r=>selected.includes(String(r.id)))} onChange={e=>toggleAll(e.target.checked)}/></th>}{columns.map(c=><th key={c.key} style={{width:c.width,textAlign:c.align||"left"}}>{server?<span className="table-head-static">{c.title}</span>:<button className="table-head-button" onClick={()=>{if(sortKey===c.key)setSortAsc(v=>!v);else{setSortKey(c.key);setSortAsc(true)};setPage(1)}}>{c.title}{sortKey===c.key?(sortAsc?<ChevronUp size={13}/>:<ChevronDown size={13}/>):<ArrowUpDown size={12} opacity={.38}/>}</button>}</th>)}{actions&&<th style={{width:60}}>Actions</th>}</tr></thead><tbody>{view.map(row=><tr key={String(row.id)}>{selectable&&<td><input className="select-checkbox" type="checkbox" checked={selected.includes(String(row.id))} onChange={e=>onSelectionChange?.(e.target.checked?[...selected,String(row.id)]:selected.filter(x=>x!==String(row.id)))} onClick={e=>e.stopPropagation()} aria-label={`Select ${row.name||row.number||row.id}`}/></td>}{columns.map(col=><td key={col.key} style={{textAlign:col.align||"left"}} className={onRowClick?"clickable":""} onClick={()=>onRowClick?.(row)}>{col.render?col.render(row):String(row[col.key]??"-")}</td>)}{actions&&<td onClick={e=>e.stopPropagation()}>{actions(row)}</td>}</tr>)}</tbody></table></div>:<Empty title={emptyTitle}/>}
    <div className="table-footer"><span>{total?`Showing ${(currentPage-1)*pageSize+1}-${Math.min(currentPage*pageSize,total)} of ${total.toLocaleString()} records`:"No records"}</span><Pager page={currentPage} total={total} pageSize={pageSize} onChange={server?onServerPageChange!:(n)=>setPage(n)}/></div></div>;
}

export function RowMenu({options}:{options:Array<{label:string,onClick:()=>void,icon?:ReactNode,danger?:boolean}>}){
  const [open,setOpen]=useState(false),[position,setPosition]=useState({top:0,left:0});
  const trigger=useRef<HTMLButtonElement|null>(null),menu=useRef<HTMLDivElement|null>(null);
  useEffect(()=>{if(!open)return;const close=(e:MouseEvent)=>{if(!trigger.current?.contains(e.target as Node)&&!menu.current?.contains(e.target as Node))setOpen(false)};
    const hide=()=>setOpen(false);window.addEventListener("mousedown",close);window.addEventListener("resize",hide);window.addEventListener("scroll",hide,true);
    return()=>{window.removeEventListener("mousedown",close);window.removeEventListener("resize",hide);window.removeEventListener("scroll",hide,true)};
  },[open]);
  const toggle=()=>{if(!open&&trigger.current){const r=trigger.current.getBoundingClientRect(),height=options.length*37+14;
    setPosition({top:Math.max(8,Math.min(window.innerHeight-height-8,r.bottom+5)),left:Math.max(8,Math.min(window.innerWidth-205,r.right-195))});}setOpen(v=>!v)};
  return <><button ref={trigger} className="table-action" onClick={toggle} aria-label="Open row actions" aria-expanded={open}><MoreHorizontal size={18}/></button>
    {open&&typeof document!=="undefined"&&createPortal(<div ref={menu} className="row-menu" style={{position:"fixed",top:position.top,left:position.left,right:"auto",width:195,zIndex:250}} role="menu">{options.map((o,i)=><button key={i} role="menuitem" className={o.danger?"destructive":""} onClick={()=>{setOpen(false);o.onClick()}}>{o.icon}{o.label}</button>)}</div>,document.body)}</>;
}
export function PanelKpi({label,value,icon,detail,color}:{label:string,value:string|number,icon:ReactNode,detail?:ReactNode,color?:string}){return <div className="panel kpi-card"><div className="kpi-head"><span className="kpi-label">{label}</span><span className="kpi-icon" style={color?{color,background:`${color}18`}:{}}>{icon}</span></div><div className="kpi-val">{value}</div>{detail&&<div className="kpi-meta">{detail}</div>}</div>}
export function PersonCell({name,subtitle,image}:{name:string,subtitle?:string|number,image?:string|null}){return <div className="table-person"><Avatar name={name} image={image} size="sm" zoomable/><div><strong>{name}</strong>{subtitle!==undefined&&<span>{subtitle}</span>}</div></div>}
export function GridCard({children}:{children:ReactNode}){return <div className="member-card">{children}</div>}
