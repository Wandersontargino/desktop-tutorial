import {ArrowDownRight,ArrowUpRight,AlertTriangle,Info} from 'lucide-react';

export function resultTone(value:number,partial=false){return value<0?'negative':partial?'pending':'positive';}

export function BalanceLine({values,x,y,partial=false}:{values:number[];x:(i:number)=>number;y:(v:number)=>number;partial?:boolean}){
 return <g fill="none" strokeWidth="3" strokeLinecap="round">{values.slice(1).map((b,i)=>{
  const a=values[i],color=(v:number)=>v<0?'#b42318':partial?'#934d09':'#067647';
  if(a*b<0){const fraction=-a/(b-a),cross=x(i)+(x(i+1)-x(i))*fraction;return <g key={i}><line x1={x(i)} y1={y(a)} x2={cross} y2={y(0)} stroke={color(a)}/><line x1={cross} y1={y(0)} x2={x(i+1)} y2={y(b)} stroke={color(b)}/></g>;}
  return <line key={i} x1={x(i)} y1={y(a)} x2={x(i+1)} y2={y(b)} stroke={color(a||b)}/>;
 })}</g>;
}

export default function ResultColors(){
 return <div className="result-colors" aria-label="Como interpretar as cores dos resultados">
  <span className="positive"><ArrowDownRight size={16}/><b>Verde</b> Economia ou sobra de energia</span>
  <span className="negative"><ArrowUpRight size={16}/><b>Vermelho</b> Aumento de custo ou déficit</span>
  <span className="pending"><AlertTriangle size={16}/><b>Âmbar</b> Estimativa ou dado a conferir</span>
  <span className="reference"><Info size={16}/><b>Azul</b> Informação de referência</span>
 </div>;
}
