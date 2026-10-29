import {normalize} from './crm-model.mjs';
import {projectPoint} from './leadership-location.mjs';

const key=value=>normalize(value).replace(/[^A-Z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const offsets=[];for(let dx=-120;dx<=120;dx+=20)for(let dy=-120;dy<=120;dy+=20)offsets.push([dx,dy]);
offsets.sort((a,b)=>Math.hypot(...a)-Math.hypot(...b));
export function findMapNeighborhood(data,query){
  const term=key(query);if(!term)return null;
  const rows=data?.neighborhoods||[];
  const exact=rows.find(r=>[r.name,...(r.aliases||[])].some(name=>key(name)===term));
  if(exact)return exact;
  // Conjuntos retain their names in the registry; this only locates their parent
  // reference area. No new boundary or household coordinate is inferred.
  if(/^CIDADE NOVA (?:[1-9]\d*|[IVX]+)$/.test(term))return rows.find(r=>key(r.name)==='CIDADE NOVA')||null;
  const matches=rows.filter(r=>[r.name,...(r.aliases||[])].some(name=>key(name).startsWith(term)));
  return matches.length===1?matches[0]:null;
}
export function neighborhoodBounds(data){
  const points=Object.values(data.corners).map(projectPoint);
  return [Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];
}
function linesFor(name){
  const words=name.split(' '),lines=[''];for(const word of words){const i=lines.length-1;if(lines[i]&&(lines[i]+' '+word).length>15)lines.push(word);else lines[i]+=(lines[i]?' ':'')+word;}return lines;
}
// Lay out readable SVG labels in screen units, preserving the map's aspect ratio.
// Every visible reference anchor remains drawn; a callout can move to avoid
// another label but its leader line still points to the original source position.
export function neighborhoodLabels(data,view,width,height,selected=''){
  if(!data?.neighborhoods?.length||!view)return [];
  const unit=Math.max(view[2]/width,view[3]/height),w=view[2]/unit,h=view[3]/unit,placed=[];
  const rows=data.neighborhoods.map(r=>({...r,point:projectPoint(r.labelAt)})).filter(r=>r.point[0]>=view[0]&&r.point[0]<=view[0]+view[2]&&r.point[1]>=view[1]&&r.point[1]<=view[1]+view[3]);
  // Keep the layout stable when selection changes; highlight the chosen label
  // without reshuffling all other neighborhoods in a compact view.
  rows.sort((a,b)=>linesFor(b.name).length-linesFor(a.name).length);
  return rows.map(r=>{
    const [px,py]=r.point.map((n,i)=>(n-view[i])/unit),lines=linesFor(r.name),bw=Math.max(...lines.map(s=>s.length))*6.1+12,bh=lines.length*14+8;
    let box=null,best=Infinity,free=false;
    const consider=(left,top)=>{
      const x=Math.max(1,Math.min(w-bw-1,left)),y=Math.max(1,Math.min(h-bh-1,top));
      const overlap=placed.reduce((s,b)=>s+Math.max(0,Math.min(x+bw+3,b.x+b.w)-Math.max(x-3,b.x))*Math.max(0,Math.min(y+bh+3,b.y+b.h)-Math.max(y-3,b.y)),0),score=(overlap?1e9+overlap*100:0)+Math.hypot(x+bw/2-px,y+bh/2-py);
      if(score<best){best=score;box={x,y,w:bw,h:bh};}return overlap===0;
    };
    for(const [dx,dy] of offsets){
      if(consider(px-bw/2+dx,py-bh/2+dy)){free=true;break;}
    }
    if(!free){
      // A dense mobile view can need the remaining free space beyond a local
      // offset. Try edges of existing boxes; the callout retains its anchor.
      const xs=[1,w-bw-1,...placed.flatMap(b=>[b.x-bw-4,b.x+b.w+4])],ys=[1,h-bh-1,...placed.flatMap(b=>[b.y-bh-4,b.y+b.h+4])];
      for(const x of xs)for(const y of ys)consider(x,y);
    }
    placed.push(box);return {...r,selected:r.name===selected,lines,box,unit,px,py};
  });
}
