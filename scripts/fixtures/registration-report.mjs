import {validTitle} from '../../lib/crm-model.mjs';

export const reportLocations={'72|372':[{city:'MUNICÍPIO FICTÍCIO',cityCode:'fictional-city',place:'ESCOLA DE TESTE',neighborhood:'BAIRRO FICTÍCIO'}]};
export function syntheticTitle(index){
  const base=String(30000000+index).padStart(8,'0')+'14';
  for(let i=0;i<100;i++){const value=base+String(i).padStart(2,'0');if(validTitle(value))return value;}
  throw new Error('Synthetic title unavailable');
}
const record=index=>({id:'example-'+index,name:'PESSOA FICTÍCIA '+String(index).padStart(3,'0'),title:syntheticTitle(index),zone:72,section:372,leadership:'EXEMPLO 20',coordinator:'COORDENAÇÃO DE TESTE',contact:'(91) 99999-0000',mother:'MÃE FICTÍCIA',birth:'1990-01-01',rg:'TESTE-1',version:1});
export function twentyRecords(){
  const rows=Array.from({length:20},(_,i)=>record(i));
  for(let i=12;i<18;i++)rows[i].contact='';
  rows[18].title='111111111111';rows[18].mother='';rows[19].section='';
  return rows;
}
export function largerLeadership(){
  const rows=Array.from({length:61},(_,i)=>({...record(100+i),id:'large-'+i,name:'PESSOA MAIOR '+String(i).padStart(3,'0'),leadership:'LIDERANÇA ALFA',coordinator:i<58?'COORDENAÇÃO A':'COORDENAÇÃO B',contact:''}));
  rows[0].title='111111111111';rows[1].contact='(91) 99999-0000';
  return rows;
}
