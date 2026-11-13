"use client";
import { useEffect, useRef, useState } from "react";
import { Crop, LoaderCircle, Minus, Plus } from "lucide-react";
import { Button, Modal } from "./ui";
import { toast } from "sonner";

const BOX=270;
/** Square, 640px output generated locally. Only the cropped file is uploaded to Cloudinary. */
export function PhotoCropper({file,onCancel,onCropped}:{file:File|null;onCancel:()=>void;onCropped:(file:File)=>Promise<void>}) {
  const [src,setSrc]=useState(""),[zoom,setZoom]=useState(1),[shift,setShift]=useState({x:0,y:0}),[saving,setSaving]=useState(false);
  const [dimensions,setDimensions]=useState({width:BOX,height:BOX});
  const image=useRef<HTMLImageElement|null>(null),drag=useRef<{x:number,y:number,sx:number,sy:number}|null>(null);
  useEffect(()=>{if(!file)return;const url=URL.createObjectURL(file);setSrc(url);setZoom(1);setShift({x:0,y:0});return()=>URL.revokeObjectURL(url)},[file]);
  const base=Math.max(BOX/dimensions.width,BOX/dimensions.height);
  const width=dimensions.width*base*zoom,height=dimensions.height*base*zoom;
  const clamp=(p:{x:number,y:number},w=width,h=height)=>({x:Math.max(-(w-BOX)/2,Math.min((w-BOX)/2,p.x)),y:Math.max(-(h-BOX)/2,Math.min((h-BOX)/2,p.y))});
  const applyZoom=(v:number)=>{const z=Math.max(1,Math.min(3,v));setZoom(z);const ratio=z/zoom;setShift(p=>clamp({x:p.x*ratio,y:p.y*ratio},width*ratio,height*ratio))};
  const save=async()=>{
    if(!file||!image.current)return;
    setSaving(true);
    try{
      const el=image.current,scale=Math.max(BOX/el.naturalWidth,BOX/el.naturalHeight)*zoom;
      const sourceSize=BOX/scale;
      const sx=Math.max(0,Math.min(el.naturalWidth-sourceSize,(el.naturalWidth-sourceSize)/2-shift.x/scale));
      const sy=Math.max(0,Math.min(el.naturalHeight-sourceSize,(el.naturalHeight-sourceSize)/2-shift.y/scale));
      const canvas=document.createElement("canvas");canvas.width=640;canvas.height=640;
      const ctx=canvas.getContext("2d");if(!ctx)throw new Error("Canvas is unavailable");
      ctx.drawImage(el,sx,sy,sourceSize,sourceSize,0,0,640,640);
      const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(result=>result?resolve(result):reject(new Error("Could not crop image")),"image/jpeg",0.86));
      await onCropped(new File([blob],`${file.name.replace(/\.[^.]+$/,"")}-crop.jpg`,{type:"image/jpeg"}));onCancel();
    }catch(err){toast.error(err instanceof Error?err.message:"Could not crop image")}finally{setSaving(false)}
  };
  return <Modal open={Boolean(file)} onClose={onCancel} title="Crop profile photo" description="Drag to position the face, zoom to fit, then upload the cropped image." footer={<><Button onClick={onCancel}>Cancel</Button><Button variant="primary" onClick={()=>void save()} disabled={saving}>{saving?<LoaderCircle className="spin" size={16}/>:<Crop size={16}/>} Crop & upload</Button></>}>
    <div className="crop-frame" style={{width:BOX,height:BOX}} onPointerDown={e=>{drag.current={x:e.clientX,y:e.clientY,sx:shift.x,sy:shift.y};e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={e=>{if(!drag.current)return;const {x,y,sx,sy}=drag.current;setShift(clamp({x:sx+e.clientX-x,y:sy+e.clientY-y}))}} onPointerUp={()=>{drag.current=null}} onPointerCancel={()=>{drag.current=null}}>
      {src&&<img ref={image} src={src} alt="Portrait crop preview" draggable={false} onLoad={e=>setDimensions({width:e.currentTarget.naturalWidth,height:e.currentTarget.naturalHeight})} style={{width,height,transform:`translate(calc(-50% + ${shift.x}px),calc(-50% + ${shift.y}px))`}}/>}
      <div className="crop-guide" aria-hidden="true"/>
    </div>
    <div className="crop-controls"><button type="button" className="icon-btn" onClick={()=>applyZoom(zoom-.1)} aria-label="Zoom out"><Minus size={16}/></button><input type="range" min="1" max="3" step=".05" value={zoom} onChange={e=>applyZoom(Number(e.target.value))} aria-label="Image zoom"/><button type="button" className="icon-btn" onClick={()=>applyZoom(zoom+.1)} aria-label="Zoom in"><Plus size={16}/></button><span className="muted font-xs">{Math.round(zoom*100)}%</span></div>
  </Modal>;
}
