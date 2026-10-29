// Only the currently visible map area is requested; browser HTTP caching is preserved.
export const streetTileURL='https://tile.openstreetmap.org/{z}/{x}/{y}.png';
import {projectPoint} from './leadership-location.mjs';
export function neighborhoodTransform(corners){
  const top=projectPoint(corners.topLeft),right=projectPoint(corners.topRight),bottom=projectPoint(corners.bottomLeft);
  return [right[0]-top[0],right[1]-top[1],bottom[0]-top[0],bottom[1]-top[1],...top];
}
export function streetTiles(view,width=720,height=480){
  if(!view||view.some(v=>!Number.isFinite(v)))return [];
  const world=2*Math.PI,unit=Math.max(view[2]/width,view[3]/height);
  let z=Math.max(3,Math.min(18,Math.floor(Math.log2(world/(256*unit)))));
  let n,size,x1,x2,y1,y2;
  do{
    n=2**z;size=world/n;
    x1=Math.max(0,Math.floor((view[0]+Math.PI)/size));x2=Math.min(n-1,Math.floor((view[0]+view[2]+Math.PI)/size));
    y1=Math.max(0,Math.floor((view[1]+Math.PI)/size));y2=Math.min(n-1,Math.floor((view[1]+view[3]+Math.PI)/size));
    if((x2-x1+1)*(y2-y1+1)<=64||z===3)break;
    z--;
  }while(true);
  const tiles=[];
  for(let x=x1;x<=x2;x++)for(let y=y1;y<=y2;y++)tiles.push({key:`${z}/${x}/${y}`,x:x*size-Math.PI,y:y*size-Math.PI,size,url:streetTileURL.replace('{z}',z).replace('{x}',x).replace('{y}',y)});
  return tiles;
}
